import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { scanCorpus } from '../src/corpus/corpusScanner.js';
import { planNextBatch } from '../src/corpus/corpusOrchestrator.js';
import { processCandidateBatch } from '../src/corpus/recipePipeline.js';
import {
  assessProductionReadiness,
  materializeApprovedReferenceDataProposal,
  planPilotIntake,
  productionContractDigest,
  proposeReferenceDataForRequest,
  resolveProductionIntake,
  validateReadyIntakeForJob,
  markProductionBatchOutcomes
} from '../src/corpus/productionCorpus.js';
import { assertReferenceData, referenceDataDigest } from '../src/services/referenceDataService.js';
import { loadCorpusInput, readJson } from '../scripts/corpus/io-lib.mjs';
import { fileLoader } from './helpers.mjs';

const root = process.cwd();
const devRoot = path.join(root, 'tests/fixtures/catalog-0.3');
async function registryFixture() {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  return registry;
}
async function productionFixture() {
  const [registry, contract, policy, corpus] = await Promise.all([
    registryFixture(),
    readJson(path.join(root, 'corpus/contracts/v1-production.json')),
    readJson(path.join(root, 'corpus/policies/v1-default.json')),
    loadCorpusInput(path.join(devRoot, 'public/data'))
  ]);
  return { registry, contract, policy, corpus };
}

test('4P-A production contract is schema-valid, policy-aligned and defines a 120-candidate pilot', async () => {
  const { registry, contract, policy, corpus } = await productionFixture();
  registry.assert('productionCorpusContract', contract);
  assert.equal(contract.policyId, policy.policyId);
  assert.equal(contract.policyVersion, policy.policyVersion);
  assert.deepEqual(contract.productionTarget, { minRecipes: 3000, targetRecipes: 4000, maxRecipes: 5000 });
  assert.equal(contract.pilot.strata.reduce((sum, item) => sum + item.count, 0), 120);
  const intake = await planPilotIntake({ contract, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest, seed: 'test-pilot', createdAt: '2026-09-04T13:30:00Z', registry });
  registry.assert('productionCorpusIntake', intake);
  assert.equal(intake.records.length, 120);
  assert.equal(new Set(intake.records.map(item => item.candidateId)).size, 120);
  assert.ok(intake.records.every(item => item.state === 'discovered' && item.referenceScanStatus === 'pending'));
});

test('4P-A readiness audit exposes the real current blocker: all four active ingredient fixtures are non-production', async () => {
  const { registry, contract, policy, corpus } = await productionFixture();
  const report = await assessProductionReadiness({ contract, policy, corpus, registry, generatedAt: '2026-09-04T13:31:00Z' });
  assert.equal(report.referenceData.valid, true);
  assert.equal(report.ingredients.activeFamilies, 4);
  assert.equal(report.ingredients.productionReadyFamilies, 0);
  assert.equal(report.ingredients.blockedFamilies, 4);
  assert.equal(report.ingredients.blockedByReason.quality_not_curated, 4);
  assert.equal(report.ingredients.blockedByReason.confidence_not_high, 4);
  assert.equal(report.readyForPilot, false);
  assert.equal(report.readyForProduction, false);
});

test('production planner excludes non-curated ingredients instead of emitting a production RecipeGenerationJob', async () => {
  const { registry, contract, policy, corpus } = await productionFixture();
  const snapshot = await scanCorpus({ policy, catalogVersion: corpus.manifest.catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, createdAt: '2026-09-04T13:32:00Z' });
  const referenceIndex = assertReferenceData(corpus.taxonomies, corpus.taxonomyTerms, registry);
  const planned = await planNextBatch({
    policy, snapshot, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions,
    mode: 'build', goal: { targetRecipeCount: 4000 }, seed: 'production-readiness-filter', targetCatalogVersion: '1.0.0',
    referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest,
    referenceIndex, productionContract: contract, createdAt: '2026-09-04T13:32:30Z'
  });
  assert.equal(planned.jobs.length, 0);
  assert.equal(planned.run.status, 'blocked');
  assert.equal(planned.run.stopReason, 'no_feasible_batch_intent');
});

test('taxonomy intake reuses a canonical term instead of creating a duplicate proposal', async () => {
  const { registry, corpus } = await productionFixture();
  const outcome = await proposeReferenceDataForRequest({
    request: {
      requestId: 'req-cuisine-med', kind: 'taxonomy_term', taxonomyId: 'cuisine', labels: { it: 'Mediterranea', en: 'Mediterranean' },
      proposedTermId: 'cuisine_mediterranean', parentTermId: null, rationale: 'Pilot cuisine classification', status: 'unresolved', proposalId: null, resolvedId: null, notes: null
    },
    taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, createdAt: '2026-09-04T13:33:00Z'
  });
  assert.equal(outcome.action, 'reuse');
  assert.equal(outcome.termId, 'cuisine_mediterranean');
  assert.equal(outcome.proposal, null);
});

test('new extensible taxonomy concepts are proposed, reviewed and materialized before recipe use', async () => {
  const { registry, corpus } = await productionFixture();
  const request = {
    requestId: 'req-cuisine-peruvian', kind: 'taxonomy_term', taxonomyId: 'cuisine', labels: { it: 'Peruviana', en: 'Peruvian' },
    proposedTermId: 'cuisine_peruvian', parentTermId: null, rationale: 'Pilot requires a Peruvian cuisine classification', status: 'unresolved', proposalId: null, resolvedId: null, notes: null
  };
  const proposed = await proposeReferenceDataForRequest({ request, taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, createdAt: '2026-09-04T13:34:00Z' });
  assert.equal(proposed.action, 'proposed');
  assert.equal(proposed.proposal.status, 'proposed');
  const approved = { ...proposed.proposal, status: 'approved', reviewNotes: 'Editorially approved for test.', reviewedAt: '2026-09-04T13:35:00Z' };
  registry.assert('referenceDataProposal', approved);
  const materialized = await materializeApprovedReferenceDataProposal({ proposal: approved, taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, materializedAt: '2026-09-04T13:36:00Z' });
  assert.equal(materialized.term.termId, 'cuisine_peruvian');
  assert.equal(materialized.proposal.status, 'materialized');
  assert.equal(materialized.proposal.materializedTermId, 'cuisine_peruvian');
  assertReferenceData(corpus.taxonomies, [...corpus.taxonomyTerms, materialized.term], registry);
});

test('pilot intake distinguishes taxonomy resolution from ingredient production readiness', async () => {
  const { registry, contract, corpus } = await productionFixture();
  const intake = await planPilotIntake({ contract, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest, seed: 'intake-resolution', createdAt: '2026-09-04T13:37:00Z', registry });
  intake.records = [intake.records[0]]; intake.targetCandidateCount = 1;
  const record = intake.records[0]; record.referenceScanStatus = 'complete';
  record.referenceRequests = [
    { requestId: 'r1', kind: 'taxonomy_term', taxonomyId: 'cuisine', labels: { it: 'Mediterranea', en: 'Mediterranean' }, proposedTermId: 'cuisine_mediterranean', parentTermId: null, rationale: 'Cuisine needed by pilot concept', status: 'unresolved', proposalId: null, resolvedId: null, notes: null },
    { requestId: 'r2', kind: 'ingredient', taxonomyId: null, labels: { it: 'Salmone', en: 'Salmon' }, proposedTermId: null, parentTermId: null, rationale: 'Ingredient needed by pilot concept', status: 'unresolved', proposalId: null, resolvedId: null, notes: null }
  ];
  const resolved = await resolveProductionIntake({ intake, contract, taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, registry, resolvedAt: '2026-09-04T13:38:00Z' });
  assert.equal(resolved.intake.records[0].referenceRequests[0].status, 'reused');
  assert.equal(resolved.intake.records[0].referenceRequests[0].resolvedId, 'cuisine_mediterranean');
  assert.equal(resolved.intake.records[0].state, 'needs_ingredient_review');
  assert.match(resolved.intake.records[0].referenceRequests[1].notes, /ingredient_not_production_ready/);
});

test('an unresolved intake record cannot enter the production recipe processor', async () => {
  const { registry, contract, corpus } = await productionFixture();
  const intake = await planPilotIntake({ contract, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest, seed: 'blocked-processing', createdAt: '2026-09-04T13:39:00Z', registry });
  intake.records = [intake.records[0]]; intake.targetCandidateCount = 1;
  intake.records[0].referenceScanStatus = 'complete'; intake.records[0].state = 'needs_reference_review';
  intake.records[0].referenceRequests = [{ requestId: 'r1', kind: 'taxonomy_term', taxonomyId: 'cuisine', labels: { it: 'Peruviana', en: 'Peruvian' }, proposedTermId: 'cuisine_peruvian', parentTermId: null, rationale: 'Missing taxonomy', status: 'proposed', proposalId: 'rdp-test', resolvedId: null, notes: null }];
  const job = await readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json'));
  job.pipelineVersion = contract.pipelineVersion;
  job.referenceDataVersion = intake.referenceDataVersion; job.referenceDataDigest = intake.referenceDataDigest;
  job.productionContract = { contractId: contract.contractId, contractVersion: contract.contractVersion, contractDigest: await productionContractDigest(contract) };
  const candidate = (await readJson(path.join(root, 'corpus/staging/phase4-smoke-candidates.json')))[0];
  candidate.candidateId = intake.records[0].candidateId;
  await assert.rejects(async () => validateReadyIntakeForJob({ intake, contract, job, candidates: [candidate], registry }), /state is needs_reference_review/);
});

test('ready production intake stamps accepted RecipeVersion with candidate, intake and contract provenance', async () => {
  const { registry, contract } = await productionFixture();
  const corpus = await readJson(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'));
  const referenceDigest = await referenceDataDigest(corpus.taxonomies, corpus.taxonomyTerms);
  const intake = await planPilotIntake({ contract, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: referenceDigest, seed: 'accepted-processing', createdAt: '2026-09-04T13:40:00Z', registry });
  intake.records = [intake.records[0]]; intake.targetCandidateCount = 1;
  intake.records[0].referenceScanStatus = 'complete'; intake.records[0].state = 'ready_for_generation';
  const candidate = (await readJson(path.join(root, 'corpus/staging/phase4-smoke-candidates.json')))[0];
  candidate.candidateId = intake.records[0].candidateId;
  const policy = await readJson(path.join(root, 'corpus/policies/phase4-smoke.json'));
  const job = await readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json'));
  job.jobId = 'production-intake-test'; job.pipelineVersion = contract.pipelineVersion; job.targetAcceptedCount = 1; job.candidateCount = 1;
  job.referenceDataVersion = intake.referenceDataVersion; job.referenceDataDigest = intake.referenceDataDigest;
  job.productionContract = { contractId: contract.contractId, contractVersion: contract.contractVersion, contractDigest: await productionContractDigest(contract) };
  job.energyKcal = { min: 0, max: 1000 }; job.proteinG = null; job.fiberG = null; job.recipeFamilies = []; job.cuisineFocus = []; job.practicalityTargets = []; job.requiredTags = []; job.coverageTargets = [{ targetId: 'test-meal', key: 'dinner', dimension: 'meal_archetype', criteria: [{ dimension: 'meal_archetype', key: 'dinner' }], desiredAcceptedGain: 1 }];
  job.diversityTargets = { minDistinctPrimaryIngredients: 1, minDistinctIngredientIds: 1, maxPrimaryIngredientFrequency: 1, maxIngredientPairFrequency: 2 };
  validateReadyIntakeForJob({ intake, contract, job, candidates: [candidate], registry });
  const result = await processCandidateBatch({ job, candidates: [candidate], policy, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, existingRecipeVersions: [], taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, productionContext: { contractId: contract.contractId, contractVersion: contract.contractVersion, intakeId: intake.intakeId }, generatedAt: '2026-09-04T13:41:00Z' });
  assert.equal(result.acceptedCount, 1);
  const generation = result.versions[0].generation;
  assert.equal(generation.candidateId, candidate.candidateId);
  assert.equal(generation.intakeId, intake.intakeId);
  assert.equal(generation.productionContractId, contract.contractId);
  assert.equal(generation.productionContractVersion, contract.contractVersion);
  const updated = markProductionBatchOutcomes({ intake, job, result, processedAt: '2026-09-04T13:42:00Z', registry });
  assert.equal(updated.records[0].state, 'accepted');
  assert.equal(updated.records[0].outcome.recipeVersionId, result.versions[0].recipeVersionId);
});
