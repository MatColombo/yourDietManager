import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { scanCorpus } from '../src/corpus/corpusScanner.js';
import { assessProductionReadiness, productionContractDigest } from '../src/corpus/productionCorpus.js';
import {
  applyIndustrializedBatchToIntake,
  applyProductionRecipeReviewDecisions,
  assertFreshProductionSnapshot,
  assertProductionRecipePipelinePolicy,
  buildScaleGate500Report,
  planProductionJobIntake,
  processIndustrializedProductionBatch,
  verifyIndustrializedBatchReport
} from '../src/corpus/productionRecipePipeline.js';
import { referenceDataDigest } from '../src/services/referenceDataService.js';
import { loadCorpusInput, readJson } from '../scripts/corpus/io-lib.mjs';
import { fileLoader } from './helpers.mjs';

const root = process.cwd();
async function fixture() {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const [contract, corpusPolicy, curationPolicy, pipelinePolicy, corpus, pilotIntake, proposals] = await Promise.all([
    readJson(path.join(root, 'corpus/contracts/v1-production.json')),
    readJson(path.join(root, 'corpus/policies/v1-default.json')),
    readJson(path.join(root, 'corpus/curation/v1-ingredient-curation-policy.json')),
    readJson(path.join(root, 'corpus/production/v1-recipe-pipeline-policy.json')),
    loadCorpusInput(path.join(root, 'public/data')),
    readJson(path.join(root, 'corpus/pilot/v1-pilot-intake.json')),
    readJson(path.join(root, 'corpus/pilot/v1-reference-data-proposals.json'))
  ]);
  return { registry, contract, corpusPolicy, curationPolicy, pipelinePolicy, corpus, pilotIntake, proposals };
}

async function processFixture({ mutateCandidate = null, existingRecipeVersions = [] } = {}) {
  const base = await fixture();
  const corpus = await readJson(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'));
  const referenceDigest = await referenceDataDigest(corpus.taxonomies, corpus.taxonomyTerms);
  const snapshot = await scanCorpus({ policy: base.corpusPolicy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: [], recipeVersions: [], registry: base.registry, snapshotId: 'snapshot-4pc-test', createdAt: '2026-09-04T15:00:00Z' });
  const job = structuredClone(await readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json')));
  job.jobId = 'production-4pc-test'; job.pipelineVersion = base.contract.pipelineVersion; job.targetAcceptedCount = 1; job.candidateCount = 1;
  job.targetCatalogVersion = '1.0.0'; job.referenceDataVersion = corpus.manifest.referenceDataVersion; job.referenceDataDigest = referenceDigest;
  job.productionContract = { contractId: base.contract.contractId, contractVersion: base.contract.contractVersion, contractDigest: await productionContractDigest(base.contract) };
  job.energyKcal = { min: 0, max: 1000 }; job.proteinG = null; job.fiberG = null; job.maxTotalMinutes = null;
  job.recipeFamilies = []; job.cuisineFocus = []; job.practicalityTargets = []; job.requiredTags = []; job.forbiddenTags = [];
  job.diversityTargets = { minDistinctPrimaryIngredients: 1, minDistinctIngredientIds: 1, maxPrimaryIngredientFrequency: 1, maxIngredientPairFrequency: 2 };
  job.coverageTargets = [{ targetId: 'test-dinner', key: 'dinner', dimension: 'meal_archetype', criteria: [{ dimension: 'meal_archetype', key: 'dinner' }], desiredAcceptedGain: 1 }];
  job.orchestration = { runId: 'orun-4pc-test', inputSnapshotId: snapshot.snapshotId, policyId: base.corpusPolicy.policyId, policyVersion: base.corpusPolicy.policyVersion, plannedPriority: 1, targetIds: ['test-dinner'], reasons: ['test scale batch'] };
  base.registry.assert('recipeGenerationJob', job);
  const intake = await planProductionJobIntake({ job, contract: base.contract, createdAt: '2026-09-04T15:01:00Z', registry: base.registry });
  intake.records[0].referenceScanStatus = 'complete'; intake.records[0].state = 'ready_for_generation'; intake.updatedAt = '2026-09-04T15:01:30Z';
  base.registry.assert('productionCorpusIntake', intake);
  const candidate = structuredClone((await readJson(path.join(root, 'corpus/staging/phase4-smoke-candidates.json')))[0]);
  candidate.candidateId = intake.records[0].candidateId; if (mutateCandidate) mutateCandidate(candidate, job);
  const processed = await processIndustrializedProductionBatch({
    job, candidates: [candidate], corpusPolicy: base.corpusPolicy, pipelinePolicy: base.pipelinePolicy,
    ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, existingRecipeVersions,
    taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry: base.registry,
    productionContext: { contractId: base.contract.contractId, contractVersion: base.contract.contractVersion, intakeId: intake.intakeId }, generatedAt: '2026-09-04T15:02:00Z'
  });
  return { ...base, corpus, snapshot, job, intake, candidate, ...processed };
}

test('4P-C production recipe pipeline policy is schema-valid and bound to 4P-A/4P-B policies', async () => {
  const { registry, contract, corpusPolicy, curationPolicy, pipelinePolicy } = await fixture();
  assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry);
  assert.equal(pipelinePolicy.scaleGate500.targetActiveRecipes, 500);
  assert.equal(Object.values(pipelinePolicy.qualityScore.stageWeights).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(pipelinePolicy.dispositions.needs_recipe_review.terminal, false);
  assert.equal(pipelinePolicy.execution.requireFreshSnapshot, true);
});

test('4P-C scale job intake is deterministic and never starts candidates as ready', async () => {
  const { registry, contract, corpusPolicy } = await fixture();
  const corpus = await readJson(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'));
  const digest = await referenceDataDigest(corpus.taxonomies, corpus.taxonomyTerms);
  const job = structuredClone(await readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json')));
  job.pipelineVersion = contract.pipelineVersion; job.referenceDataVersion = corpus.manifest.referenceDataVersion; job.referenceDataDigest = digest; job.candidateCount = 3; job.targetAcceptedCount = 2;
  job.productionContract = { contractId: contract.contractId, contractVersion: contract.contractVersion, contractDigest: await productionContractDigest(contract) };
  job.orchestration.policyId = corpusPolicy.policyId; job.orchestration.policyVersion = corpusPolicy.policyVersion;
  const a = await planProductionJobIntake({ job, contract, createdAt: '2026-09-04T15:03:00Z', registry });
  const b = await planProductionJobIntake({ job, contract, createdAt: '2026-09-04T15:03:00Z', registry });
  assert.equal(a.intakeId, b.intakeId); assert.deepEqual(a.records.map(row => row.candidateId), b.records.map(row => row.candidateId));
  assert.ok(a.records.every(row => row.state === 'discovered' && row.referenceScanStatus === 'pending'));
});

test('industrialized production batch accepts only a full-score clean candidate and freezes report digest', async () => {
  const { registry, pipelinePolicy, result, report } = await processFixture();
  assert.equal(report.dispositionCounts.accepted, 1); assert.equal(report.candidates[0].qualityScore, 100);
  assert.equal(report.batchGate.status, 'pass'); assert.equal(result.acceptedCount, 1); assert.equal(result.versions.length, 1);
  await verifyIndustrializedBatchReport({ result, report, pipelinePolicy, registry });
  const tampered = structuredClone(result); tampered.versions[0].contentHash = 'tampered-content-hash';
  await assert.rejects(() => verifyIndustrializedBatchReport({ result: tampered, report, pipelinePolicy, registry }), /digest mismatch/);
});

test('non-approved culinary candidate becomes needs_recipe_review and can be explicitly requeued', async () => {
  const processed = await processFixture({ mutateCandidate: candidate => { candidate.culinaryReview.status = 'pending'; candidate.culinaryReview.notes = 'Awaiting editorial review'; } });
  assert.equal(processed.report.candidates[0].disposition, 'needs_recipe_review'); assert.equal(processed.report.batchGate.status, 'review_required');
  const updated = applyIndustrializedBatchToIntake({ intake: processed.intake, job: processed.job, report: processed.report, processedAt: '2026-09-04T15:04:00Z', registry: processed.registry });
  assert.equal(updated.records[0].state, 'generated'); assert.equal(updated.records[0].outcome, null);
  const decisions = { schemaVersion: 1, batchReportId: processed.report.reportId, batchResultDigest: processed.report.resultDigest, reviewer: 'editor-4pc', reviewedAt: '2026-09-04T15:05:00Z', decisions: [{ candidateId: processed.candidate.candidateId, action: 'retry', notes: 'Culinary review completed; regenerate corrected candidate.' }] };
  const requeued = applyProductionRecipeReviewDecisions({ intake: updated, report: processed.report, decisions, pipelinePolicy: processed.pipelinePolicy, registry: processed.registry });
  assert.equal(requeued.records[0].state, 'ready_for_generation'); assert.equal(requeued.records[0].jobId, null);
});

test('numeric plausibility failures are quarantined as nutrition_outlier rather than silently rejected', async () => {
  const processed = await processFixture({ mutateCandidate: (_candidate, job) => { job.energyKcal = { min: 1, max: 2 }; } });
  assert.equal(processed.report.candidates[0].disposition, 'nutrition_outlier');
  assert.equal(processed.report.candidates[0].failedStage, 'nutrition'); assert.equal(processed.report.batchGate.status, 'review_required');
});

test('semantic taxonomy exceptions are routed to needs_reference_review', async () => {
  const processed = await processFixture({ mutateCandidate: candidate => { candidate.tags.cuisines = ['cuisine_not_in_registry']; } });
  assert.equal(processed.report.candidates[0].disposition, 'needs_reference_review');
  assert.equal(processed.report.candidates[0].failedStage, 'semantic_references');
  const updated = applyIndustrializedBatchToIntake({ intake: processed.intake, job: processed.job, report: processed.report, registry: processed.registry });
  assert.equal(updated.records[0].state, 'needs_reference_review');
});

test('exact duplicates are classified explicitly as duplicate and are terminal rejected in intake', async () => {
  const first = await processFixture(); const existing = first.result.versions;
  const second = await processFixture({ existingRecipeVersions: existing });
  assert.equal(second.report.candidates[0].disposition, 'duplicate'); assert.equal(second.report.candidates[0].terminal, true);
  const updated = applyIndustrializedBatchToIntake({ intake: second.intake, job: second.job, report: second.report, registry: second.registry });
  assert.equal(updated.records[0].state, 'rejected'); assert.equal(updated.records[0].outcome.code, 'exact_duplicate');
});

test('fresh snapshot guard detects corpus mutation after job planning', async () => {
  const processed = await processFixture();
  const corpusForSnapshot = { ...processed.corpus, recipeFamilies: [], recipeVersions: [] };
  await assert.doesNotReject(() => assertFreshProductionSnapshot({ job: processed.job, snapshot: processed.snapshot, corpus: corpusForSnapshot, corpusPolicy: processed.corpusPolicy, registry: processed.registry }));
  const mutated = structuredClone(corpusForSnapshot); mutated.recipeFamilies = processed.corpus.recipeFamilies.slice(0, 1); mutated.recipeVersions = processed.corpus.recipeVersions.slice(0, 1);
  await assert.rejects(() => assertFreshProductionSnapshot({ job: processed.job, snapshot: processed.snapshot, corpus: mutated, corpusPolicy: processed.corpusPolicy, registry: processed.registry }), /Stale production snapshot/);
});

test('current scale-500 gate is hard-blocked by unfinished 4P-B data/pilot, not by missing 3000 production recipes', async () => {
  const { registry, contract, corpusPolicy, pipelinePolicy, corpus, pilotIntake, proposals } = await fixture();
  const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry, generatedAt: '2026-09-04T15:06:00Z' });
  const snapshot = await scanCorpus({ policy: corpusPolicy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, createdAt: '2026-09-04T15:06:00Z' });
  const report = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness: readiness, intake: pilotIntake, proposals, snapshot, registry, evaluatedAt: '2026-09-04T15:06:30Z' });
  assert.equal(report.status, 'blocked'); assert.equal(report.pilot.terminal, 0); assert.equal(report.activeRecipeCount, 3);
  assert.ok(report.blockers.some(item => item.startsWith('pilot-production-readiness')));
  assert.ok(!report.blockers.some(item => item.includes('3000')));
});

test('scale-500 gate becomes pass only after pilot completion, corpus quality and pro-rata hard coverage all pass', async () => {
  const { registry, contract, corpusPolicy, pipelinePolicy, corpus, pilotIntake } = await fixture();
  const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry, generatedAt: '2026-09-04T15:07:00Z' });
  const ready = structuredClone(readiness); ready.readyForPilot = true; ready.pilotBlockers = []; ready.ingredients.productionReadyFamilies = 400; ready.ingredients.blockedFamilies = 0; ready.ingredients.blockedByReason = {};
  const intake = structuredClone(pilotIntake); for (const row of intake.records) { row.state = 'accepted'; row.referenceScanStatus = 'complete'; row.referenceRequests = []; }
  const snapshot = await scanCorpus({ policy: corpusPolicy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, createdAt: '2026-09-04T15:07:00Z' });
  snapshot.activeRecipeCount = 500; snapshot.recipeCount = 500; snapshot.quality = { schemaErrors: 0, unknownIngredientReferences: 0, nutritionErrors: 0, allergenDerivationErrors: 0, missingRequiredLocaleFields: 0 }; snapshot.similarity.exactDuplicateCount = 0; snapshot.similarity.nearDuplicateCount = 0;
  const gate = pipelinePolicy.scaleGate500;
  const byTarget = new Map(corpusPolicy.coverageTargets.map(target => [target.targetId, target]));
  for (const cell of snapshot.coverageCells) { const target = byTarget.get(cell.targetId); if (target?.hardForRelease && Number.isFinite(target.minCount)) cell.currentCount = Math.ceil(target.minCount * gate.targetActiveRecipes / gate.releaseReferenceRecipeCount); }
  const report = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness: ready, intake, proposals: [], snapshot, registry, evaluatedAt: '2026-09-04T15:07:30Z' });
  assert.equal(report.pilot.complete, true); assert.equal(report.status, 'pass'); assert.deepEqual(report.blockers, []);
});

test('scale-500 gate cannot become ready while the current corpus snapshot has quality errors', async () => {
  const { registry, contract, corpusPolicy, pipelinePolicy, corpus, pilotIntake } = await fixture();
  const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry, generatedAt: '2026-09-04T15:08:00Z' });
  const ready = structuredClone(readiness); ready.readyForPilot = true; ready.pilotBlockers = []; ready.ingredients.productionReadyFamilies = 400; ready.ingredients.blockedFamilies = 0; ready.ingredients.blockedByReason = {};
  const intake = structuredClone(pilotIntake); for (const row of intake.records) { row.state = 'accepted'; row.referenceScanStatus = 'complete'; row.referenceRequests = []; }
  const snapshot = await scanCorpus({ policy: corpusPolicy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, createdAt: '2026-09-04T15:08:00Z' });
  snapshot.activeRecipeCount = 499; snapshot.recipeCount = 499; snapshot.quality.schemaErrors = 1; snapshot.similarity.exactDuplicateCount = 0; snapshot.similarity.nearDuplicateCount = 0;
  const report = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness: ready, intake, proposals: [], snapshot, registry, evaluatedAt: '2026-09-04T15:08:30Z' });
  assert.equal(report.status, 'blocked');
  assert.ok(report.blockers.some(item => item.startsWith('snapshot-schema-errors')));
});
