import { access, readFile } from 'node:fs/promises';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness } from '../../src/corpus/productionCorpus.js';

const requiredFiles = [
  '.github/workflows/production-corpus.yml',
  'specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md',
  'src/corpus/fdcAutoCuration.js',
  'src/corpus/deterministicRecipeGenerator.js',
  'scripts/corpus/auto-curate-fdc.mjs',
  'scripts/corpus/combine-materialized-ingredients.mjs',
  'scripts/corpus/generate-legacy-retirement-map.mjs',
  'scripts/corpus/retire-development-recipe-fixtures.mjs',
  'scripts/corpus/execute-production-pilot.mjs',
  'scripts/corpus/execute-first-scale-batch.mjs'
];
for (const file of requiredFiles) await access(file);
const [workflow, spec, pkg, corpus, contract, policy] = await Promise.all([
  readFile('.github/workflows/production-corpus.yml','utf8'),
  readFile('specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md','utf8'),
  readJson('package.json'), loadCorpusInput('public/data'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/policies/v1-default.json')
]);
const registry = new SchemaRegistry(async file => readJson(`schemas/${file}`)); await registry.loadAll();
const readiness = await assessProductionReadiness({ contract, policy, corpus, registry });
const checks = [
  ['workflow-actions-node24', workflow.includes('actions/checkout@v7') && workflow.includes('actions/setup-node@v7')],
  ['workflow-foundation', workflow.includes('usda-foundation-2026-04')],
  ['workflow-sr-legacy', workflow.includes('usda-sr-legacy-2018-04')],
  ['workflow-auto-curation', workflow.includes('corpus:auto-curate-fdc')],
  ['workflow-explicit-retirement', workflow.includes('corpus:generate-fixture-retirement') && workflow.includes('corpus:retire-recipe-fixtures')],
  ['workflow-pilot', workflow.includes('corpus:pilot-execute')],
  ['workflow-scale-gate', workflow.includes('corpus:scale-gate-500')],
  ['workflow-first-scale', workflow.includes('corpus:first-scale-batch')],
  ['workflow-no-source-commit', workflow.includes('corpus/production/evidence') && !/git add[^\n]*corpus\/sources\/cache/.test(workflow)],
  ['spec-no-threshold-relaxation', /does not lower any ingredient, pilot, quality, or scale threshold/i.test(spec)],
  ['spec-deterministic-review-bounds', spec.includes('ydm-deterministic-fdc-curator-v1') && /fuzzy semantic merge remains forbidden/i.test(spec)],
  ['script-auto-curation', Boolean(pkg.scripts?.['corpus:auto-curate-fdc'])],
  ['script-pilot-execute', Boolean(pkg.scripts?.['corpus:pilot-execute'])],
  ['script-first-scale-batch', Boolean(pkg.scripts?.['corpus:first-scale-batch'])]
].map(([id, pass]) => ({ id, status: pass ? 'pass' : 'blocked' }));
const blockers = checks.filter(item => item.status !== 'pass').map(item => item.id);
const sourceCachePresent = await access('corpus/sources/cache/usda-foundation-2026-04/acquisition-manifest.json').then(()=>true).catch(()=>false);
const report = {
  schemaVersion: 1,
  controlPlanePass: blockers.length === 0,
  currentLocalExecutionStatus: readiness.readyForPilot ? 'pilot_ready' : 'blocked_waiting_for_production_data',
  currentReadyForPilot: readiness.readyForPilot,
  currentProductionReadyIngredientCount: readiness.ingredients?.productionReadyFamilies ?? null,
  officialSourceCachePresent: sourceCachePresent,
  checks,
  blockers,
  generatedAt: new Date().toISOString()
};
await writeJson('corpus/reports/production-execution-control-plane.json', report);
console.log(`Production corpus execution control-plane: ${report.controlPlanePass ? 'PASS' : 'BLOCKED'} (${checks.filter(c=>c.status==='pass').length}/${checks.length}) · local=${report.currentLocalExecutionStatus}`);
if (!report.controlPlanePass) process.exitCode = 2;
