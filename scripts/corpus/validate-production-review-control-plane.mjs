import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { readJson, writeJson } from './io-lib.mjs';

const requiredFiles = [
  '.github/workflows/production-review-500.yml',
  'specs/PRODUCTION_CATALOG_REVIEW_SPEC.md',
  'schemas/catalog-publication.schema.json',
  'schemas/production-review-publication.schema.json',
  'schemas/recipe-human-review.schema.json',
  'schemas/recipe-human-review-bundle.schema.json',
  'public/schemas/catalog-publication.schema.json',
  'public/schemas/production-review-publication.schema.json',
  'public/schemas/recipe-human-review.schema.json',
  'public/schemas/recipe-human-review-bundle.schema.json',
  'src/services/recipeHumanReviewService.js',
  'scripts/corpus/publish-production-review-500.mjs',
  'scripts/corpus/validate-production-review-publication.mjs',
  'scripts/corpus/validate-human-review-500.mjs'
];
for (const file of requiredFiles) await access(file);

const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();

const [workflow, spec, service, ui, app, db, backup, orchestrator, publisher, humanValidator, sw] = await Promise.all([
  readFile('.github/workflows/production-review-500.yml', 'utf8'),
  readFile('specs/PRODUCTION_CATALOG_REVIEW_SPEC.md', 'utf8'),
  readFile('src/services/recipeHumanReviewService.js', 'utf8'),
  readFile('src/ui/catalogPages.js', 'utf8'),
  readFile('src/ui/app.js', 'utf8'),
  readFile('src/db/constants.js', 'utf8'),
  readFile('src/services/backupEngine.js', 'utf8'),
  readFile('src/corpus/corpusOrchestrator.js', 'utf8'),
  readFile('scripts/corpus/publish-production-review-500.mjs', 'utf8'),
  readFile('scripts/corpus/validate-human-review-500.mjs', 'utf8'),
  readFile('public/service-worker.js', 'utf8')
]);

const mirrors = ['catalog-publication.schema.json','production-review-publication.schema.json','recipe-human-review.schema.json','recipe-human-review-bundle.schema.json'];
let mirrorsPass = true;
for (const file of mirrors) {
  const [rootSchema, publicSchema] = await Promise.all([readFile(path.join('schemas', file), 'utf8'), readFile(path.join('public/schemas', file), 'utf8')]);
  if (rootSchema !== publicSchema) mirrorsPass = false;
}

const dimensions = ['culinaryCoherence','ingredientCombination','quantityPlausibility','instructionQuality','titleDescriptionQuality','differentiation'];
const checks = [
  ['workflow-dispatch-and-optional-commit', workflow.includes('workflow_dispatch') && workflow.includes('commit_results')],
  ['workflow-publishes-canonical-review', /corpus:publish-review-500[\s\S]*--canonical/.test(workflow)],
  ['workflow-validates-publication-strict', /corpus:validate-review-publication[\s\S]*--strict/.test(workflow)],
  ['workflow-tests-published-application', workflow.indexOf('corpus:publish-review-500') < workflow.indexOf('npm run check')],
  ['publisher-review-only-not-release', publisher.includes("channel:'production_review'") && publisher.includes('requiredHumanReview:true') && publisher.includes('releaseEligible:false')],
  ['review-six-explicit-dimensions', dimensions.every(value => service.includes(`'${value}'`))],
  ['review-decision-contract', service.includes('approved_requires_all_dimensions_pass') && service.includes('non_approved_requires_notes')],
  ['review-frozen-version-routing', ui.includes('expectedReviewRecipeVersionIds') && ui.includes('?version=${encodeURIComponent(next.recipeVersionId)}')],
  ['review-dashboard-route', app.includes("path === '/recipes/review'")],
  ['review-store-db-v5', /DB_VERSION\s*=\s*5/.test(db) && db.includes('recipeHumanReviews') && db.includes('publicationAndDecision')],
  ['review-in-backup', backup.includes('recipeHumanReviews')],
  ['review-bundle-strict-gate', humanValidator.includes('human-review-incomplete') && humanValidator.includes('human-review-not-all-approved') && humanValidator.includes('source-corpus-digest-drift')],
  ['schema-public-mirrors', mirrorsPass],
  ['offline-review-assets', /ydm-shell-v24/.test(sw) && /ydm-data-v12/.test(sw) && sw.includes('recipeHumanReviewService.js')],
  ['5000-not-hard-stop', !orchestrator.includes('snapshot.activeRecipeCount >= policy.targetCorpus.max')],
  ['spec-5000-advisory', /advisory planning references, not hard ceilings/i.test(spec)],
  ['spec-scale-blocked-during-review', /Further corpus scaling must not resume while the Human Review Gate is blocked/i.test(spec)]
].map(([id, pass]) => ({ id, status: pass ? 'pass' : 'blocked' }));

const blockers = checks.filter(item => item.status !== 'pass').map(item => item.id);
const report = { schemaVersion:1, phase:'production-catalog-review-500', pass:blockers.length===0, checks, blockers, generatedAt:new Date().toISOString() };
await writeJson('corpus/reports/production-review-500-control-plane.json', report);
console.log(`Production Review 500 control-plane: ${report.pass ? 'PASS' : 'BLOCKED'} (${checks.filter(item => item.status==='pass').length}/${checks.length})`);
if (!report.pass) process.exitCode = 2;
