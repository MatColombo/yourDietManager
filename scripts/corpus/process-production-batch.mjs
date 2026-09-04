import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { processCandidateBatch } from '../../src/corpus/recipePipeline.js';
import { assertProductionContract, markProductionBatchOutcomes, validateReadyIntakeForJob } from '../../src/corpus/productionCorpus.js';
import { assertReferenceData, referenceDataDigest } from '../../src/services/referenceDataService.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const policyFile = process.argv[3] || 'corpus/policies/v1-default.json';
const contractFile = process.argv[4] || 'corpus/contracts/v1-production.json';
const jobFile = process.argv[5];
const intakeFile = process.argv[6];
const candidateFile = process.argv[7];
const resultFile = process.argv[8];
const outputIntakeFile = process.argv[9] || intakeFile;
if (!corpusInput || !jobFile || !intakeFile || !candidateFile || !resultFile) {
  console.error('Usage: node scripts/corpus/process-production-batch.mjs <catalog-data-dir|bundle.json> <policy.json> <contract.json> <job.json> <intake.json> <candidates.json> <result.json> [updated-intake.json]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, policy, contract, job, intake, candidates] = await Promise.all([
  loadCorpusInput(corpusInput), readJson(policyFile), readJson(contractFile), readJson(jobFile), readJson(intakeFile), readJson(candidateFile)
]);
registry.assert('recipeCorpusPolicy', policy);
registry.assert('recipeGenerationJob', job);
assertProductionContract(contract, policy, registry);
const referenceIndex = assertReferenceData(corpus.taxonomies || [], corpus.taxonomyTerms || [], registry);
const actualDigest = await referenceDataDigest(corpus.taxonomies || [], corpus.taxonomyTerms || []);
if (actualDigest !== job.referenceDataDigest || actualDigest !== intake.referenceDataDigest) throw new Error('Production batch referenceDataDigest does not match the supplied catalog snapshot');
if (corpus.manifest?.referenceDataVersion !== job.referenceDataVersion || corpus.manifest?.referenceDataVersion !== intake.referenceDataVersion) throw new Error('Production batch referenceDataVersion does not match the supplied catalog snapshot');
validateReadyIntakeForJob({ intake, contract, job, candidates, registry });
for (const candidate of candidates) {
  const record = intake.records.find(item => item.candidateId === candidate.candidateId);
  if (record) record.jobId = job.jobId;
}
const result = await processCandidateBatch({
  job,
  candidates,
  policy,
  ingredientFamilies: corpus.ingredientFamilies,
  ingredientRevisions: corpus.ingredientRevisions,
  existingRecipeVersions: currentRecipeVersions(corpus),
  taxonomies: corpus.taxonomies || [],
  taxonomyTerms: corpus.taxonomyTerms || [],
  registry,
  productionContext: { contractId: contract.contractId, contractVersion: contract.contractVersion, intakeId: intake.intakeId, referenceIndex }
});
const updatedIntake = markProductionBatchOutcomes({ intake, job, result, registry });
result.productionIntake = {
  intakeId: intake.intakeId,
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  acceptedCandidateIds: updatedIntake.records.filter(item => item.jobId === job.jobId && item.state === 'accepted').map(item => item.candidateId),
  rejectedCandidateIds: updatedIntake.records.filter(item => item.jobId === job.jobId && item.state === 'rejected').map(item => item.candidateId)
};
await writeJson(resultFile, result);
await writeJson(outputIntakeFile, updatedIntake);
console.log(JSON.stringify({ jobId: job.jobId, acceptedCount: result.acceptedCount, rejectedCount: result.rejectedCount, intakeId: intake.intakeId, resultFile, outputIntakeFile }, null, 2));
