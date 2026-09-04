import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness, assertProductionContract, validateReadyIntakeForJob } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy } from '../../src/corpus/ingredientCuration.js';
import { applyIndustrializedBatchToIntake, assertFreshProductionSnapshot, assertProductionRecipePipelinePolicy, buildScaleGate500Report, processIndustrializedProductionBatch } from '../../src/corpus/productionRecipePipeline.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const snapshotFile = process.argv[3];
const jobFile = process.argv[4];
const intakeFile = process.argv[5];
const candidatesFile = process.argv[6];
const resultFile = process.argv[7];
const reportFile = process.argv[8];
const updatedIntakeFile = process.argv[9] || intakeFile;
if (!corpusInput || !snapshotFile || !jobFile || !intakeFile || !candidatesFile || !resultFile || !reportFile) {
  console.error('Usage: node scripts/corpus/run-production-batch.mjs <catalog-data-dir|bundle.json> <snapshot.json> <job.json> <job-intake.json> <candidates.json> <result.json> <batch-report.json> [updated-intake.json]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, snapshot, job, intake, candidates, corpusPolicy, contract, curationPolicy, pipelinePolicy, pilotIntake, proposals] = await Promise.all([
  loadCorpusInput(corpusInput), readJson(snapshotFile), readJson(jobFile), readJson(intakeFile), readJson(candidatesFile),
  readJson('corpus/policies/v1-default.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/production/v1-recipe-pipeline-policy.json'),
  readJson('corpus/pilot/v1-pilot-intake.json'), readJson('corpus/pilot/v1-reference-data-proposals.json')
]);
registry.assert('recipeCorpusPolicy', corpusPolicy); registry.assert('recipeGenerationJob', job); registry.assert('productionCorpusIntake', intake);
assertProductionContract(contract, corpusPolicy, registry); assertIngredientCurationPolicy(curationPolicy, contract, registry); assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry);
const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry });
const scaleGate = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness: readiness, intake: pilotIntake, proposals, snapshot, registry });
if (scaleGate.status === 'blocked') throw new Error(`4P-C scale-up is blocked until 4P-B closes: ${scaleGate.blockers.slice(0, 10).join('; ')}`);
await assertFreshProductionSnapshot({ job, snapshot, corpus, corpusPolicy, registry });
validateReadyIntakeForJob({ intake, contract, job, candidates, registry });
const { result, report } = await processIndustrializedProductionBatch({
  job, candidates, corpusPolicy, pipelinePolicy, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions,
  existingRecipeVersions: currentRecipeVersions(corpus), taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], registry,
  productionContext: { contractId: contract.contractId, contractVersion: contract.contractVersion, intakeId: intake.intakeId }
});
const updatedIntake = applyIndustrializedBatchToIntake({ intake, job, report, registry });
await Promise.all([writeJson(resultFile, result), writeJson(reportFile, report), writeJson(updatedIntakeFile, updatedIntake)]);
console.log(JSON.stringify({ jobId: job.jobId, reportId: report.reportId, gate: report.batchGate.status, accepted: report.acceptedCount, reviewBacklog: report.reviewBacklogCount, dispositions: report.dispositionCounts, resultFile, reportFile, updatedIntakeFile }, null, 2));
if (report.batchGate.status !== 'pass') process.exitCode = 3;
