import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { sha256Text } from '../src/lib/crypto.js';
import { scanCorpus, evaluateReleaseGates } from '../src/corpus/corpusScanner.js';
import { planNextBatch } from '../src/corpus/corpusOrchestrator.js';
import { processCandidateBatch } from '../src/corpus/recipePipeline.js';
import { loadCatalogPart } from '../src/services/catalogDataSource.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { assertReferenceData, referenceDataDigest } from '../src/services/referenceDataService.js';
import { loadLocalCatalog, readJson } from '../scripts/corpus/io-lib.mjs';
import { validateReleaseData } from '../scripts/corpus/release-lib.mjs';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const releaseRoot = path.join(root, 'corpus/releases/0.4.0-dev');
const releaseData = path.join(releaseRoot, 'data');

async function registryFixture() {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  return registry;
}

async function phase4Fixture() {
  const [registry, policy, catalog, before, after, run, job, result] = await Promise.all([
    registryFixture(),
    readJson(path.join(root, 'corpus/policies/phase4-smoke.json')),
    loadLocalCatalog(releaseData),
    readJson(path.join(root, 'corpus/snapshots/phase4-smoke-before.json')),
    readJson(path.join(root, 'corpus/snapshots/phase4-smoke-after.json')),
    readJson(path.join(root, 'corpus/runs/phase4-smoke-run.json')),
    readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json')),
    readJson(path.join(root, 'corpus/staging/phase4-smoke-result.json'))
  ]);
  const referenceIndex = assertReferenceData(catalog.taxonomies || [], catalog.taxonomyTerms || [], registry);
  return { registry, policy, catalog, before, after, run, job, result, referenceIndex };
}


async function loadCorpusInputForTest(file) {
  const doc = await readJson(file);
  return { ...doc, manifest: { ...(doc.manifest || {}), catalogVersion: doc.catalogVersion || doc.manifest?.catalogVersion } };
}
test('Phase 4 orchestrator schemas are addressable by runtime aliases and canonical artifacts validate', async () => {
  const { registry, policy, before, after, run, job } = await phase4Fixture();
  registry.assert('recipeCorpusPolicy', policy);
  registry.assert('recipeCorpusSnapshot', before);
  registry.assert('recipeCorpusSnapshot', after);
  registry.assert('recipeCorpusOrchestrationRun', run);
  registry.assert('recipeGenerationJob', job);
});

test('corpus scanner reproduces the smoke release snapshot quality and release gates', async () => {
  const { registry, policy, catalog } = await phase4Fixture();
  const snapshot = await scanCorpus({
    policy,
    catalogVersion: catalog.manifest.catalogVersion,
    taxonomies: catalog.taxonomies,
    taxonomyTerms: catalog.taxonomyTerms,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    recipeFamilies: catalog.recipeFamilies,
    recipeVersions: catalog.recipeVersions,
    registry,
    createdAt: '2026-09-03T15:00:00Z'
  });
  assert.equal(snapshot.activeRecipeCount, 8);
  assert.deepEqual(snapshot.quality, {
    schemaErrors: 0,
    unknownIngredientReferences: 0,
    nutritionErrors: 0,
    allergenDerivationErrors: 0,
    missingRequiredLocaleFields: 0
  });
  assert.equal(snapshot.similarity.exactDuplicateCount, 0);
  assert.equal(evaluateReleaseGates(snapshot, policy).passed, true);
});

test('corpus scanner treats inputDigest drift as a nutrition/provenance quality error', async () => {
  const { registry, policy, catalog } = await phase4Fixture();
  const recipeVersions = structuredClone(catalog.recipeVersions);
  recipeVersions[0].inputDigest = '0'.repeat(64);
  const snapshot = await scanCorpus({
    policy,
    catalogVersion: catalog.manifest.catalogVersion,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    recipeFamilies: catalog.recipeFamilies,
    recipeVersions,
    registry,
    createdAt: '2026-09-03T15:01:00Z'
  });
  assert.equal(snapshot.quality.nutritionErrors, 1);
  assert.equal(evaluateReleaseGates(snapshot, policy).passed, false);
});

test('orchestrator produces deterministic jobs for the same policy, snapshot, seed and goal', async () => {
  const { policy, before, catalog, referenceIndex } = await phase4Fixture();
  const args = {
    policy,
    snapshot: before,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    mode: 'build',
    goal: { targetRecipeCount: 8 },
    seed: 'phase4-determinism-test',
    targetCatalogVersion: '0.4.0-dev',
    referenceDataVersion: catalog.manifest.referenceDataVersion,
    referenceDataDigest: catalog.manifest.referenceDataDigest,
    referenceIndex,
    createdAt: '2026-09-03T15:02:00Z'
  };
  const a = await planNextBatch(args);
  const b = await planNextBatch(args);
  assert.deepEqual(a, b);
  assert.equal(a.jobs.length, 1);
  assert.ok(a.jobs[0].candidateCount >= a.jobs[0].targetAcceptedCount);
  assert.ok(a.jobs[0].candidateCount > a.jobs[0].targetAcceptedCount, 'oversampling should generate extra candidates');
});

test('focused expansion turns user focus into a constraint while retaining automatic batch planning', async () => {
  const { policy, before, catalog, referenceIndex } = await phase4Fixture();
  const planned = await planNextBatch({
    policy,
    snapshot: before,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    mode: 'focused_expansion',
    goal: { acceptedAddCount: 3, focusMode: 'restrict', focus: { cuisines: ['cuisine_mediterranean'] } },
    seed: 'phase4-focus-test',
    targetCatalogVersion: '0.4.0-dev',
    referenceDataVersion: catalog.manifest.referenceDataVersion,
    referenceDataDigest: catalog.manifest.referenceDataDigest,
    referenceIndex,
    createdAt: '2026-09-03T15:03:00Z'
  });
  assert.equal(planned.jobs.length, 1);
  assert.deepEqual(planned.jobs[0].cuisineFocus, ['cuisine_mediterranean']);
  assert.equal(planned.jobs[0].targetAcceptedCount, 3);
  assert.ok(planned.run.plannedJobs[0].reasons.some(reason => reason.includes('user focus')));
});


test('focus_only planning freezes the first portable scale batch to generator-supported dimensions', async () => {
  const { policy, before, catalog, referenceIndex } = await phase4Fixture();
  const planned = await planNextBatch({
    policy,
    snapshot: before,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    mode: 'focused_expansion',
    goal: { acceptedAddCount: 3, focusMode: 'restrict', intentStrategy: 'focus_only', focus: { mealArchetypes: ['mini_meal'], practicalityTags: ['practical_portable'] } },
    seed: 'phase4-focus-only-test',
    targetCatalogVersion: '0.4.0-dev',
    referenceDataVersion: catalog.manifest.referenceDataVersion,
    referenceDataDigest: catalog.manifest.referenceDataDigest,
    referenceIndex,
    createdAt: '2026-09-03T15:03:30Z'
  });
  assert.equal(planned.jobs.length, 1);
  const job = planned.jobs[0];
  assert.deepEqual(job.mealArchetypes, ['mini_meal']);
  assert.deepEqual(job.practicalityTargets, ['practical_portable']);
  assert.deepEqual(job.energyKcal, { min: 150, max: 499 });
  assert.equal(job.proteinG, null);
  assert.equal(job.fiberG, null);
  assert.equal(planned.run.goal.intentStrategy, 'focus_only');
  assert.ok(job.coverageTargets.every(target => target.criteria.length === 1));
  assert.ok(job.coverageTargets.every(target => ['meal_archetype', 'practicality'].includes(target.dimension)));
});

test('smoke pipeline rejects an exact duplicate and a candidate outside the planned nutrition range before reaching target', async () => {
  const { result } = await phase4Fixture();
  assert.equal(result.candidateCount, 7);
  assert.equal(result.acceptedCount, 5);
  assert.equal(result.targetMet, true);
  assert.equal(result.diversityPassed, true);
  assert.equal(result.rejected.filter(row => row.code === 'exact_duplicate').length, 1);
  assert.equal(result.rejected.filter(row => row.code === 'nutrition_outside_job').length, 1);
});

test('published Phase 4 smoke release can be imported by the Phase 3 runtime catalog engine', async () => {
  const registry = await registryFixture();
  const repo = new MemoryRepository();
  const importer = new CatalogImporter({ repo, registry, fetcher: fileFetch(releaseRoot), storage: null });
  const outcome = await importer.bootstrap();
  assert.equal(outcome, '0.4.0-dev');
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.4.0-dev');
  assert.equal(await repo.count('recipes'), 8);
  assert.equal(await repo.count('recipeVersions'), 8);
  assert.equal((await repo.get('catalogPacks', ['0.4.0-dev', 'core'])).status, 'installed');
});

test('catalog loader accepts immutable records introduced by an older catalog but rejects records from a future catalog', async () => {
  const { registry, catalog } = await phase4Fixture();
  const base = structuredClone(catalog.ingredientRevisions[0]);
  const manifest = structuredClone(catalog.manifest);
  manifest.catalogVersion = '0.4.0';
  const load = async record => {
    const text = `${JSON.stringify([record], null, 2)}\n`;
    manifest.ingredientRevisions = { count: 1, shards: [{ path: 'ingredients/test.json', count: 1, sha256: await sha256Text(text), recordIds: [record.ingredientRevisionId] }] };
    const fetcher = async () => new Response(text, { status: 200 });
    return loadCatalogPart(manifest, 'ingredientRevisions', { fetcher, registry });
  };
  const older = { ...base, catalogVersion: '0.3.0' };
  assert.equal((await load(older)).length, 1);
  const future = { ...base, catalogVersion: '0.5.0' };
  await assert.rejects(() => load(future), /future catalog version/);
});

test('production release gate refuses development ingredient fixtures when curated high-confidence provenance is required', async () => {
  const { registry, policy, catalog } = await phase4Fixture();
  const validation = await validateReleaseData({
    policy,
    catalogVersion: catalog.manifest.catalogVersion,
    taxonomies: catalog.taxonomies,
    taxonomyTerms: catalog.taxonomyTerms,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    recipeFamilies: catalog.recipeFamilies,
    recipeVersions: catalog.recipeVersions,
    registry,
    requireCuratedIngredients: true
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.filter(issue => issue.code === 'ingredient_not_curated_high_confidence').length, 4);
});

test('default V1 corpus policy remains a 3,000–5,000 production target and validates', async () => {
  const registry = await registryFixture();
  const policy = JSON.parse(await readFile(path.join(root, 'corpus/policies/v1-default.json'), 'utf8'));
  registry.assert('recipeCorpusPolicy', policy);
  assert.equal(policy.targetCorpus.min, 3000);
  assert.equal(policy.targetCorpus.target, 4000);
  assert.equal(policy.targetCorpus.max, 5000);
});

test('compound coverage criteria count intersections rather than independent marginal distributions', async () => {
  const { registry, policy: smokePolicy, catalog } = await phase4Fixture();
  const policy = structuredClone(smokePolicy);
  policy.policyId = 'compound-cell-test';
  policy.coverageTargets = [{
    targetId: 'lunch-energy-cell',
    dimension: 'energy_band',
    key: 'lunch|kcal-400-599',
    criteria: [
      { dimension: 'meal_archetype', key: 'lunch' },
      { dimension: 'energy_band', key: 'kcal-400-599' }
    ],
    desiredCount: 1,
    weight: 1,
    hardForRelease: false
  }];
  registry.assert('recipeCorpusPolicy', policy);
  const snapshot = await scanCorpus({
    policy,
    catalogVersion: catalog.manifest.catalogVersion,
    ingredientFamilies: catalog.ingredientFamilies,
    ingredientRevisions: catalog.ingredientRevisions,
    recipeFamilies: catalog.recipeFamilies,
    recipeVersions: catalog.recipeVersions,
    registry,
    createdAt: '2026-09-03T15:11:00Z'
  });
  const currentIds = new Set(catalog.recipeFamilies.filter(f => f.status === 'active').map(f => f.currentVersionId));
  const expected = catalog.recipeVersions.filter(version => currentIds.has(version.recipeVersionId) && version.mealArchetypes.includes('lunch') && version.calculatedNutrition.energyKcal >= 400 && version.calculatedNutrition.energyKcal <= 599).length;
  assert.equal(snapshot.coverageCells[0].currentCount, expected);
});


test('production planner keeps compound target criteria mutually compatible and caps simultaneous targets', async () => {
  const registry = await registryFixture();
  const policy = await readJson(path.join(root, 'corpus/policies/v1-default.json'));
  const corpus = await loadCorpusInputForTest(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'));
  const snapshot = await scanCorpus({ policy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, createdAt: '2026-09-03T15:20:00Z' });
  const referenceIndex = assertReferenceData(corpus.taxonomies || [], corpus.taxonomyTerms || [], registry);
  const planned = await planNextBatch({ policy, snapshot, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, mode: 'build', goal: { targetRecipeCount: 4000 }, seed: 'production-compatibility-test', targetCatalogVersion: '1.0.0', referenceDataVersion: corpus.manifest.referenceDataVersion || '1.0.0', referenceDataDigest: corpus.manifest.referenceDataDigest || await referenceDataDigest(corpus.taxonomies || [], corpus.taxonomyTerms || []), referenceIndex, createdAt: '2026-09-03T15:21:00Z' });
  assert.equal(planned.jobs.length, 1);
  const job = planned.jobs[0];
  assert.ok(job.coverageTargets.length <= policy.batchPlanning.maxCoverageTargetsPerJob);
  const band = (bands, range) => bands.find(item => item.min === range?.min && item.max === range?.max)?.bandId || null;
  for (const target of job.coverageTargets) for (const criterion of target.criteria || []) {
    if (criterion.dimension === 'meal_archetype') assert.ok(job.mealArchetypes.includes(criterion.key));
    if (criterion.dimension === 'energy_band') assert.equal(band(policy.energyBands, job.energyKcal), criterion.key);
    if (criterion.dimension === 'protein_band') assert.equal(band(policy.proteinBands, job.proteinG), criterion.key);
    if (criterion.dimension === 'fiber_band') assert.equal(band(policy.fiberBands, job.fiberG), criterion.key);
    if (criterion.dimension === 'practicality') assert.ok(job.practicalityTargets.includes(criterion.key));
    if (criterion.dimension === 'diet') assert.ok(job.requiredTags.includes(criterion.key));
    if (criterion.dimension === 'recipe_family') assert.ok(job.recipeFamilies.includes(criterion.key));
    if (criterion.dimension === 'cuisine') assert.ok(job.cuisineFocus.includes(criterion.key));
  }
});

test('recipe pipeline enforces ingredient-category coverage criteria carried by the job', async () => {
  const { registry, policy, job } = await phase4Fixture();
  const corpus = await loadCorpusInputForTest(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'));
  const candidates = await readJson(path.join(root, 'corpus/staging/phase4-smoke-candidates.json'));
  const categoryJob = structuredClone(job);
  categoryJob.jobId = 'ingredient-category-gate-test'; categoryJob.targetAcceptedCount = 1; categoryJob.candidateCount = 1; categoryJob.energyKcal = { min: 0, max: 1000 }; categoryJob.proteinG = null; categoryJob.fiberG = null; categoryJob.recipeFamilies = []; categoryJob.cuisineFocus = []; categoryJob.practicalityTargets = []; categoryJob.requiredTags = [];
  categoryJob.diversityTargets = { minDistinctPrimaryIngredients: 1, minDistinctIngredientIds: 1, maxPrimaryIngredientFrequency: 1, maxIngredientPairFrequency: 2 };
  categoryJob.coverageTargets = [{ targetId: 'must-use-fish', key: 'food_group_fish_seafood', dimension: 'ingredient_category', criteria: [{ dimension: 'ingredient_category', key: 'food_group_fish_seafood' }], desiredAcceptedGain: 1 }];
  registry.assert('recipeGenerationJob', categoryJob);
  const nonFish = candidates.find(candidate => candidate.candidateId === 'p4-c');
  const result = await processCandidateBatch({ job: categoryJob, candidates: [nonFish], policy, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, existingRecipeVersions: [], taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], registry, generatedAt: '2026-09-03T15:22:00Z' });
  assert.equal(result.acceptedCount, 0);
  assert.equal(result.rejected[0].code, 'coverage_target_missed');
  assert.equal(result.rejected[0].detail, 'must-use-fish');
});


test('USDA Foundation intake stays review-only until explicit approval, then materializes schema-valid curated ingredients', async () => {
  const registry = await registryFixture();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ydm-usda-'));
  const sourceFile = path.join(temp, 'foundation.json');
  const reviewFile = path.join(temp, 'review.json');
  const outDir = path.join(temp, 'materialized');
  const food = {
    fdcId: 123456,
    description: 'Zucchini, raw',
    foodCategory: { description: 'Vegetables and Vegetable Products' },
    foodNutrients: [
      { nutrient: { id: 1008, name: 'Energy' }, amount: 17 },
      { nutrient: { id: 1003, name: 'Protein' }, amount: 1.21 },
      { nutrient: { id: 1005, name: 'Carbohydrate, by difference' }, amount: 3.11 },
      { nutrient: { id: 1004, name: 'Total lipid (fat)' }, amount: 0.32 },
      { nutrient: { id: 1079, name: 'Fiber, total dietary' }, amount: 1.0 },
      { nutrient: { id: 1093, name: 'Sodium, Na' }, amount: 8 }
    ]
  };
  await writeFile(sourceFile, `${JSON.stringify({ FoundationFoods: [food] }, null, 2)}\n`);
  await execFileAsync(process.execPath, ['scripts/corpus/import-usda-foundation.mjs', sourceFile, reviewFile], { cwd: root });
  const review = await readJson(reviewFile);
  assert.equal(review.records.length, 1);
  assert.equal(review.records[0].review.approved, false);
  assert.equal(review.records[0].review.decision, 'pending');
  assert.equal(review.records[0].suggested.nameIt, '');
  review.records[0].review.approved = true;
  review.records[0].review.decision = 'approved';
  review.records[0].review.notes = 'Reviewed for test fixture.';
  review.records[0].review.reviewer = 'test-editor';
  review.records[0].review.reviewedAt = '2026-09-04T14:05:00Z';
  for (const key of Object.keys(review.records[0].review.checks)) review.records[0].review.checks[key] = true;
  review.records[0].suggested.nameIt = 'Zucchina cruda';
  review.records[0].suggested.state = 'raw';
  await writeFile(reviewFile, `${JSON.stringify(review, null, 2)}\n`);
  await execFileAsync(process.execPath, ['scripts/corpus/materialize-usda-reviewed.mjs', reviewFile, outDir, '1.0.0'], { cwd: root });
  const families = await readJson(path.join(outDir, 'ingredient-families.json'));
  const revisions = await readJson(path.join(outDir, 'ingredient-revisions.json'));
  assert.equal(families.length, 1);
  assert.equal(revisions.length, 1);
  registry.assert('ingredient', families[0]);
  registry.assert('ingredientRevision', revisions[0]);
  assert.equal(revisions[0].quality.status, 'curated');
  assert.equal(revisions[0].quality.confidence, 'high');
  assert.equal(revisions[0].source.sourceRecordId, '123456');
  assert.equal(revisions[0].catalogVersion, '1.0.0');
});
