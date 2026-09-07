import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { sha256Json } from '../src/lib/crypto.js';
import { planNextBatch } from '../src/corpus/corpusOrchestrator.js';
import { RecipeHumanReviewService, REVIEW_DIMENSIONS, REVIEW_POLICY_VERSION, reviewSummary } from '../src/services/recipeHumanReviewService.js';
import { assertReferenceData } from '../src/services/referenceDataService.js';
import { loadLocalCatalog, readJson } from '../scripts/corpus/io-lib.mjs';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { recipeToDraft, saveRecipe } from '../src/services/personalCatalogService.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();
async function registryFixture() { const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll(); return registry; }
function manifestFixture() {
  return {
    schemaVersion: 1,
    catalogVersion: '1.0.0-production-review-500',
    publication: {
      channel: 'production_review', publicationId: 'production-review-500-test', sourceCorpusDigest: 'c'.repeat(64), sourceSnapshotId: 'snapshot-test',
      requiredHumanReview: true, reviewRecipeCount: 2, reviewPolicyVersion: REVIEW_POLICY_VERSION, releaseEligible: false
    },
    packs: [{ packId: 'core', required: true, recipeVersionIds: ['rv_1','rv_2'] }]
  };
}
function passDimensions() { return Object.fromEntries(REVIEW_DIMENSIONS.map(key => [key, 'pass'])); }
async function reviewFixture() {
  const repo = new MemoryRepository(); const registry = await registryFixture();
  await repo.putMany('recipeVersions', [
    { recipeId:'r_1', recipeVersionId:'rv_1', contentHash:'a'.repeat(64) },
    { recipeId:'r_2', recipeVersionId:'rv_2', contentHash:'b'.repeat(64) }
  ]);
  return { repo, registry, manifest:manifestFixture(), service:new RecipeHumanReviewService({repo,registry}) };
}

test('production review schemas are loaded and the publication contract is review-only', async () => {
  const registry = await registryFixture(); const manifest = manifestFixture();
  registry.assert('catalogPublication', manifest.publication);
  const review = {
    schemaVersion:1, reviewId:'production-review-500-test::rv_1', catalogVersion:manifest.catalogVersion, publicationId:manifest.publication.publicationId,
    recipeId:'r_1', recipeVersionId:'rv_1', recipeContentHash:'a'.repeat(64), reviewer:'reviewer', decision:'approved', dimensions:passDimensions(), notes:'', reviewedAt:'2026-09-07T08:00:00Z'
  };
  registry.assert('recipeHumanReview', review);
  assert.equal(manifest.publication.requiredHumanReview, true);
  assert.equal(manifest.publication.releaseEligible, false);
});

test('human review requires all six explicit dimensions and consistent decisions', async () => {
  const { service, manifest } = await reviewFixture(); const dimensions = passDimensions();
  dimensions.quantityPlausibility = 'fail';
  await assert.rejects(() => service.save(manifest, {recipeId:'r_1',recipeVersionId:'rv_1',contentHash:'a'.repeat(64)}, { decision:'approved', dimensions, reviewer:'Alice' }), /approved_requires_all_dimensions_pass/);
  await assert.rejects(() => service.save(manifest, {recipeId:'r_1',recipeVersionId:'rv_1',contentHash:'a'.repeat(64)}, { decision:'needs_changes', dimensions, notes:'', reviewer:'Alice' }), /non_approved_requires_notes/);
  const saved = await service.save(manifest, {recipeId:'r_1',recipeVersionId:'rv_1',contentHash:'a'.repeat(64)}, { decision:'needs_changes', dimensions, notes:'Portion too large.', reviewer:'Alice', reviewedAt:'2026-09-07T08:01:00Z' });
  assert.equal(saved.decision, 'needs_changes');
  const summary = await service.summary(manifest);
  assert.deepEqual(summary, { expected:2, reviewed:1, approved:0, needsChanges:1, rejected:0, unreviewed:1, complete:false, pass:false });
  assert.deepEqual(await service.nextUnreviewed(manifest), { recipeId:'r_2', recipeVersionId:'rv_2' });
});

test('human review export/import is checksum-bound to the frozen publication and rejects duplicate or stale decisions', async () => {
  const source = await reviewFixture();
  await source.service.save(source.manifest, {recipeId:'r_1',recipeVersionId:'rv_1',contentHash:'a'.repeat(64)}, { decision:'approved', dimensions:passDimensions(), reviewer:'Alice', reviewedAt:'2026-09-07T08:02:00Z' });
  const failed = passDimensions(); failed.differentiation = 'fail';
  await source.service.save(source.manifest, {recipeId:'r_2',recipeVersionId:'rv_2',contentHash:'b'.repeat(64)}, { decision:'rejected', dimensions:failed, notes:'Cosmetic duplicate.', reviewer:'Alice', reviewedAt:'2026-09-07T08:03:00Z' });
  const bundle = await source.service.exportBundle(source.manifest, '2026-09-07T08:04:00Z');
  assert.equal(bundle.summary.reviewed, 2); assert.equal(bundle.summary.pass, false);

  const target = await reviewFixture();
  assert.deepEqual(await target.service.importBundle(bundle, target.manifest), bundle.summary);

  const tampered = structuredClone(bundle); tampered.decisions[0].notes = 'tampered';
  await assert.rejects(() => target.service.importBundle(tampered, target.manifest), /checksum mismatch/);

  const duplicate = structuredClone(bundle); duplicate.decisions.push({ ...duplicate.decisions[0], reviewId:'duplicate-review', notes:'duplicate' }); duplicate.sha256 = await sha256Json({ ...duplicate, sha256:null });
  await assert.rejects(() => target.service.importBundle(duplicate, target.manifest), /duplicate recipe decisions/);

  const stale = await reviewFixture(); await stale.repo.put('recipeVersions', { recipeId:'r_1', recipeVersionId:'rv_1', contentHash:'d'.repeat(64) });
  await assert.rejects(() => stale.service.importBundle(bundle, stale.manifest), /Stale or unknown human review rv_1/);
});

test('review summary counts one current decision per frozen RecipeVersion', () => {
  const decisions = [
    {recipeVersionId:'rv_1',decision:'needs_changes'},
    {recipeVersionId:'rv_1',decision:'approved'},
    {recipeVersionId:'rv_2',decision:'approved'}
  ];
  assert.deepEqual(reviewSummary(['rv_1','rv_2'], decisions), { expected:2, reviewed:2, approved:2, needsChanges:0, rejected:0, unreviewed:0, complete:true, pass:true });
});

test('legacy 5000 policy field is advisory: build planning can continue above 5000', async () => {
  const registry = await registryFixture();
  const [policy, catalog, before] = await Promise.all([
    readJson(path.join(root,'corpus/policies/v1-default.json')),
    loadLocalCatalog(path.join(root,'corpus/releases/0.4.0-dev/data')),
    readJson(path.join(root,'corpus/snapshots/phase4-smoke-before.json'))
  ]);
  const referenceIndex = assertReferenceData(catalog.taxonomies, catalog.taxonomyTerms, registry);
  const snapshot = structuredClone(before);
  snapshot.policyId = policy.policyId; snapshot.policyVersion = policy.policyVersion; snapshot.recipeCount = 5001; snapshot.activeRecipeCount = 5001;
  snapshot.coverageCells = policy.coverageTargets.map(target => ({ targetId:target.targetId, dimension:target.dimension, key:target.key, criteria:target.criteria || null, currentCount:0, minCount:target.minCount || 0, desiredCount:target.desiredCount, deficit:target.desiredCount, normalizedDeficit:1, hardForRelease:Boolean(target.hardForRelease) }));
  snapshot.undercoveredTargetIds = policy.coverageTargets.map(target => target.targetId);
  const planned = await planNextBatch({
    policy, snapshot, ingredientFamilies:catalog.ingredientFamilies, ingredientRevisions:catalog.ingredientRevisions, mode:'build',
    goal:{ targetRecipeCount:6000, focus:{ mealArchetypes:['lunch'] } }, seed:'beyond-5000', targetCatalogVersion:'2.0.0',
    referenceDataVersion:catalog.manifest.referenceDataVersion, referenceDataDigest:catalog.manifest.referenceDataDigest, referenceIndex, createdAt:'2026-09-07T08:05:00Z'
  });
  assert.equal(policy.targetCorpus.max, 5000, 'legacy provenance field changed unexpectedly');
  assert.equal(planned.run.status, 'planned');
  assert.equal(planned.jobs.length, 1);
  assert.equal(planned.jobs[0].targetAcceptedCount, 100);
});

test('production review workflow publishes before testing and never marks the review catalog release-eligible', async () => {
  const [workflow, publisher, spec] = await Promise.all([
    readFile(path.join(root,'.github/workflows/production-review-500.yml'),'utf8'),
    readFile(path.join(root,'scripts/corpus/publish-production-review-500.mjs'),'utf8'),
    readFile(path.join(root,'specs/PRODUCTION_CATALOG_REVIEW_SPEC.md'),'utf8')
  ]);
  assert.ok(workflow.indexOf('corpus:publish-review-500') < workflow.indexOf('npm run check'));
  assert.match(workflow, /corpus:validate-review-publication[\s\S]*--strict/);
  assert.match(publisher, /releaseEligible:false/);
  assert.match(spec, /Further corpus scaling must not resume while the Human Review Gate is blocked/);
});


test('Phase 4 smoke builder is isolated from the mutable published review catalog', async () => {
  const smoke = await readFile(path.join(root,'scripts/corpus/build-phase4-smoke.mjs'),'utf8');
  assert.match(smoke, /tests\/fixtures\/catalog-0\.3\/public\/data/);
  assert.doesNotMatch(smoke, /loadLocalCatalog\(path\.join\(root,'public\/data'\)\)/);
});


test('published 500-recipe review catalog bootstraps all required recipes with the browser public schema surface', async () => {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'public', 'schemas')));
  await registry.loadAll();
  const repo = new MemoryRepository();
  const importer = new CatalogImporter({ repo, registry, fetcher:fileFetch(root), storage:null, serviceWorker:null });
  const manifest = await readJson(path.join(root,'public/data/catalog-manifest.json'));
  if (manifest.publication?.channel !== 'production_review') return;
  const version = await importer.bootstrap();
  assert.equal(version, manifest.catalogVersion);
  assert.equal(await repo.getMeta('activeCatalogVersion'), manifest.catalogVersion);
  assert.equal(await repo.count('recipes'), 500);
  assert.equal(await repo.count('recipeVersions'), 500);
  assert.equal((await repo.getMeta('catalogManifest')).publication.releaseEligible, false);
});

test('browser regression gives production-scale catalog bootstrap a bounded 60-second window and fails fast on catalog errors', async () => {
  const source = await readFile(path.join(root,'scripts/hardening/browser-regression.mjs'),'utf8');
  assert.match(source, /waitExpression\(cdp, recipeBootstrapExpression, 60000\)/);
  assert.match(source, /catalog-panel \.error-text/);
  assert.match(source, /Catalog bootstrap failed:/);
});


test('browser regression respects frozen production-review UX while preserving the route-independent recipe editor', async () => {
  const source = await readFile(path.join(root,'scripts/hardening/browser-regression.mjs'),'utf8');
  assert.match(source, /human-review-panel/);
  assert.match(source, /Production review detail controls regression/);
  assert.match(source, /if \(recipeControls\.reviewPanel\)/);
  assert.match(source, /recipeState\.path}\/edit/);
  assert.match(source, /Recipe detail missing Edit action/);
});


test('published review recipes remain editable through version promotion without mutating the frozen reviewed version', async () => {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'public', 'schemas')));
  await registry.loadAll();
  const repo = new MemoryRepository();
  const importer = new CatalogImporter({ repo, registry, fetcher:fileFetch(root), storage:null, serviceWorker:null });
  const manifest = await readJson(path.join(root,'public/data/catalog-manifest.json'));
  if (manifest.publication?.channel !== 'production_review') return;
  await importer.bootstrap();
  const [family] = await repo.getAll('recipes');
  const frozenId = family.currentVersionId;
  const frozenBefore = structuredClone(await repo.get('recipeVersions', frozenId));
  const draft = await recipeToDraft(family.recipeId, { repo });
  draft.titleIt = `${draft.titleIt} revisione locale`;
  const saved = await saveRecipe({ recipeId:family.recipeId, ...draft }, { repo, registry });
  assert.equal(saved.promotedFromBase, true);
  assert.equal(saved.family.origin, 'user');
  assert.notEqual(saved.version.recipeVersionId, frozenId);
  assert.deepEqual(await repo.get('recipeVersions', frozenId), frozenBefore);
});
