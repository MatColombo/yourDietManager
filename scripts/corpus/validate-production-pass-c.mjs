import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertProductionRecipePipelinePolicy } from '../../src/corpus/productionRecipePipeline.js';
import { readJson, writeJson } from './io-lib.mjs';

const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [pipelinePolicy, contract, corpusPolicy, curationPolicy, scaleGate] = await Promise.all([
  readJson('corpus/production/v1-recipe-pipeline-policy.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/policies/v1-default.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/reports/scale-gate-500.json')
]);
assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry); registry.assert('productionScaleGateReport', scaleGate);
const requiredFiles = [
  'scripts/corpus/create-production-job-intake.mjs', 'scripts/corpus/run-production-batch.mjs', 'scripts/corpus/review-production-batch.mjs', 'scripts/corpus/apply-production-batch.mjs', 'scripts/corpus/scale-gate-500.mjs',
  'schemas/production-recipe-pipeline-policy.schema.json', 'schemas/production-recipe-batch-report.schema.json', 'schemas/production-recipe-review-decisions.schema.json', 'schemas/production-scale-gate-report.schema.json',
  'specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md'
];
for (const file of requiredFiles) await access(file);
const [spec, protocol] = await Promise.all([readFile('specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md', 'utf8'), readFile('corpus/CANDIDATE_GENERATION_PROTOCOL.md', 'utf8')]);
const textChecks = [
  ['spec-policy', spec.includes('recipe-production-pipeline-v1@1.0.0')], ['spec-scale-500', /Scale Gate 500/i.test(spec)], ['spec-no-bypass', /4P-B/i.test(spec) && /blocked/i.test(spec)],
  ['protocol-runner', protocol.includes('corpus:production-run-batch')], ['protocol-review', protocol.includes('corpus:production-review')], ['protocol-apply', protocol.includes('corpus:production-apply')]
];
const checks = [
  { id: 'pipeline-policy', status: 'pass', detail: `${pipelinePolicy.policyId}@${pipelinePolicy.policyVersion}` },
  { id: 'scale-gate-schema', status: 'pass', detail: `${scaleGate.gateId} current=${scaleGate.status}` },
  ...textChecks.map(([id, pass]) => ({ id, status: pass ? 'pass' : 'blocked', detail: pass ? 'present' : 'missing' }))
];
const blockers = checks.filter(item => item.status === 'blocked').map(item => `${item.id}: ${item.detail}`);
const report = { schemaVersion: 1, pass: blockers.length === 0, currentScaleGateStatus: scaleGate.status, checks, blockers, generatedAt: new Date().toISOString() };
await writeJson('corpus/reports/phase4p-c-control-plane.json', report);
console.log(`Phase 4P-C control-plane validation: ${report.pass ? 'PASS' : 'BLOCKED'} (${checks.filter(item => item.status === 'pass').length}/${checks.length}) · scaleGate=${scaleGate.status}`);
if (!report.pass) process.exitCode = 2;
