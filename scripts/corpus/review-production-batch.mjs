import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { applyProductionRecipeReviewDecisions, assertProductionRecipePipelinePolicy } from '../../src/corpus/productionRecipePipeline.js';
import { readJson, writeJson } from './io-lib.mjs';

const intakeFile = process.argv[2]; const reportFile = process.argv[3]; const decisionsFile = process.argv[4]; const output = process.argv[5] || intakeFile;
if (!intakeFile || !reportFile || !decisionsFile) {
  console.error('Usage: node scripts/corpus/review-production-batch.mjs <intake.json> <batch-report.json> <review-decisions.json> [updated-intake.json]'); process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [intake, report, decisions, pipelinePolicy, contract, corpusPolicy, curationPolicy] = await Promise.all([
  readJson(intakeFile), readJson(reportFile), readJson(decisionsFile), readJson('corpus/production/v1-recipe-pipeline-policy.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/policies/v1-default.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json')
]);
assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry);
const updated = applyProductionRecipeReviewDecisions({ intake, report, decisions, pipelinePolicy, registry });
await writeJson(output, updated);
console.log(JSON.stringify({ intakeId: updated.intakeId, reviewed: decisions.decisions.length, output }, null, 2));
