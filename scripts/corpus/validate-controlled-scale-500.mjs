import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertControlledScalePlan } from '../../src/corpus/controlledScale.js';
import { readJson, writeJson } from './io-lib.mjs';

const requiredFiles = [
  '.github/workflows/controlled-scale-500.yml',
  'corpus/production/v1-controlled-scale-500-plan.json',
  'schemas/controlled-scale-plan.schema.json',
  'src/corpus/controlledScale.js',
  'scripts/corpus/execute-controlled-scale-500.mjs',
  'specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md'
];
for (const file of requiredFiles) await access(file);
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [plan, contract, corpusPolicy, pipelinePolicy, workflow, spec] = await Promise.all([
  readJson('corpus/production/v1-controlled-scale-500-plan.json'),
  readJson('corpus/contracts/v1-production.json'),
  readJson('corpus/policies/v1-default.json'),
  readJson('corpus/production/v1-recipe-pipeline-policy.json'),
  readFile('.github/workflows/controlled-scale-500.yml','utf8'),
  readFile('specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md','utf8')
]);
const diagnostics = assertControlledScalePlan(plan, contract, corpusPolicy, pipelinePolicy, registry);
const checks = [
  ['plan-bridge-220-500', plan.startMinimumActiveRecipes === 220 && plan.targetActiveRecipes === 500 && diagnostics.plannedAcceptedCount === 280],
  ['plan-three-tranches', plan.tranches.length === 3 && plan.tranches.map(item => item.targetAcceptedCount).join(',') === '100,100,80'],
  ['plan-safeguards', plan.requireZeroReviewBacklog === true && plan.requireGatePassAtCompletion === true],
  ['workflow-actions-node24', workflow.includes('actions/checkout@v7') && workflow.includes('actions/setup-node@v7')],
  ['workflow-tranche-order', workflow.indexOf('--tranche=1') < workflow.indexOf('--tranche=2') && workflow.indexOf('--tranche=2') < workflow.indexOf('--tranche=3')],
  ['workflow-canonical-checkpoints', (workflow.match(/--canonical/g) || []).length === 3],
  ['workflow-final-strict-gate', /corpus:scale-gate-500[\s\S]*--strict/.test(workflow)],
  ['workflow-optional-commit', workflow.includes('commit_results') && workflow.includes('data: scale production corpus to 500 recipes')],
  ['spec-controlled-scale', /4P-D Pass A/i.test(spec) && /220\s*(?:->|→)\s*500/.test(spec)],
  ['spec-zero-backlog', /zero review backlog/i.test(spec)]
].map(([id, pass]) => ({ id, status: pass ? 'pass' : 'blocked' }));
const blockers = checks.filter(item => item.status !== 'pass').map(item => item.id);
const report = { schemaVersion:1, pass:blockers.length===0, planId:plan.planId, planVersion:plan.planVersion, plannedAcceptedCount:diagnostics.plannedAcceptedCount, trancheCount:diagnostics.trancheCount, cellCount:diagnostics.cellCount, checks, blockers, generatedAt:new Date().toISOString() };
await writeJson('corpus/reports/phase4p-d-scale-500-control-plane.json', report);
console.log(`Phase 4P-D Scale 500 control-plane: ${report.pass ? 'PASS' : 'BLOCKED'} (${checks.filter(item=>item.status==='pass').length}/${checks.length}) · plan=${plan.planId}@${plan.planVersion}`);
if (!report.pass) process.exitCode = 2;
