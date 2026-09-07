import { sha256Json } from '../lib/crypto.js';
import { primaryIngredientId } from './corpusMath.js';
import { processCandidateBatch } from './recipePipeline.js';
import { computeCorpusContentIdentity, scanCorpus } from './corpusScanner.js';

const DISPOSITIONS = ['accepted', 'rejected', 'duplicate', 'needs_reference_review', 'needs_recipe_review', 'nutrition_outlier'];
const RESOLVED_REQUEST_STATES = new Set(['reused', 'materialized', 'resolved']);
const CLOSED_PROPOSAL_STATES = new Set(['materialized', 'rejected']);

function clone(value) { return structuredClone(value); }
function unique(values) { return [...new Set(values)]; }
function increment(target, key) { target[key] = (target[key] || 0) + 1; }
function check(id, pass, detail) { return { id, status: pass ? 'pass' : 'blocked', detail }; }
function pairKeys(ids) {
  const sorted = [...new Set(ids)].sort();
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) for (let j = i + 1; j < sorted.length; j += 1) out.push(`${sorted[i]}\u0000${sorted[j]}`);
  return out;
}

export function productionRecipePipelinePolicyDiagnostics(policy, contract, corpusPolicy, curationPolicy) {
  const errors = [];
  if (!policy || !contract || !corpusPolicy || !curationPolicy) return { valid: false, errors: ['Production recipe pipeline policy and all bound policies are required'] };
  if (policy.productionContract?.contractId !== contract.contractId || policy.productionContract?.contractVersion !== contract.contractVersion) errors.push('productionContract binding mismatch');
  if (policy.corpusPolicy?.policyId !== corpusPolicy.policyId || policy.corpusPolicy?.policyVersion !== corpusPolicy.policyVersion) errors.push('corpusPolicy binding mismatch');
  if (policy.ingredientCurationPolicy?.policyId !== curationPolicy.policyId || policy.ingredientCurationPolicy?.policyVersion !== curationPolicy.policyVersion) errors.push('ingredientCurationPolicy binding mismatch');
  if (policy.pipelineVersion !== contract.pipelineVersion) errors.push(`pipelineVersion ${policy.pipelineVersion} does not match contract ${contract.pipelineVersion}`);
  const weights = policy.qualityScore?.stageWeights || {};
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  if (totalWeight !== policy.qualityScore?.maxScore) errors.push(`quality stage weights total ${totalWeight}, expected ${policy.qualityScore?.maxScore}`);
  if (policy.qualityScore?.minAcceptedScore !== policy.qualityScore?.maxScore) errors.push('V1 production acceptance must require the full objective quality score');
  const expectedDispositionState = {
    accepted: ['accepted', true], rejected: ['rejected', true], duplicate: ['rejected', true],
    needs_reference_review: ['needs_reference_review', false], needs_recipe_review: ['generated', false], nutrition_outlier: ['generated', false]
  };
  for (const disposition of DISPOSITIONS) {
    const actual = policy.dispositions?.[disposition]; const expected = expectedDispositionState[disposition];
    if (!actual || actual.intakeState !== expected[0] || actual.terminal !== expected[1]) errors.push(`invalid disposition mapping for ${disposition}`);
  }
  if (policy.scaleGate500?.targetActiveRecipes !== 500) errors.push('scale gate target must remain 500');
  if (policy.scaleGate500?.releaseReferenceRecipeCount !== contract.productionTarget?.minRecipes) errors.push('scale gate release reference count must match production minimum');
  if (!policy.execution?.requireFreshSnapshot || !policy.execution?.requireBatchResultDigest || !policy.execution?.requireZeroReviewBacklogBeforeApply) errors.push('industrialized execution safeguards must remain enabled');
  return { valid: errors.length === 0, errors };
}

export function assertProductionRecipePipelinePolicy(policy, contract, corpusPolicy, curationPolicy, registry = null) {
  registry?.assert('productionRecipePipelinePolicy', policy);
  const diagnostics = productionRecipePipelinePolicyDiagnostics(policy, contract, corpusPolicy, curationPolicy);
  if (!diagnostics.valid) throw new Error(`Production recipe pipeline policy validation failed: ${diagnostics.errors.join('; ')}`);
  return policy;
}

function failedStageFor(code, disposition) {
  if (disposition === 'needs_reference_review') return 'semantic_references';
  if (disposition === 'needs_recipe_review') return code === 'missing_required_locale_fields' ? 'structure_localization' : 'culinary_review';
  if (disposition === 'nutrition_outlier') return ['ingredient_amount_implausible', 'portion_size_implausible'].includes(code) ? 'ingredient_normalization' : 'nutrition';
  if (disposition === 'duplicate') return 'duplicate_diversity';
  const map = {
    missing_candidate_id: 'intake',
    meal_archetype_outside_job: 'structure_localization', no_ingredients: 'structure_localization', duplicate_ingredient_line: 'structure_localization',
    ingredient_not_allowed: 'ingredient_normalization', unknown_ingredient: 'ingredient_normalization',
    nutrition_outside_job: 'nutrition', prep_time_outside_job: 'culinary_review', missing_required_tag: 'semantic_references', forbidden_tag: 'semantic_references',
    recipe_family_outside_job: 'semantic_references', cuisine_outside_job: 'semantic_references', practicality_target_missed: 'culinary_review', coverage_target_missed: 'semantic_references',
    diversity_primary_frequency: 'duplicate_diversity', diversity_pair_frequency: 'duplicate_diversity', target_already_reached: 'schema_provenance', pipeline_exception: 'schema_provenance'
  };
  return map[code] || 'schema_provenance';
}

function scoreBeforeStage(policy, failedStage) {
  if (!failedStage) return policy.qualityScore.maxScore;
  let score = 0;
  for (const stage of policy.stageOrder) {
    if (stage === failedStage) break;
    score += Number(policy.qualityScore.stageWeights[stage] || 0);
  }
  return Math.max(0, Math.min(policy.qualityScore.maxScore, score));
}

function referenceException(detail, policy) {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '');
  return (policy.classification.referenceErrorPatterns || []).some(pattern => text.includes(pattern));
}

function dispositionForRejection(rejection, candidate, policy) {
  const code = rejection?.code || 'rejected';
  if ((policy.classification.duplicateCodes || []).includes(code)) return 'duplicate';
  if ((policy.classification.nutritionOutlierCodes || []).includes(code)) return 'nutrition_outlier';
  if ((policy.classification.recipeReviewCodes || []).includes(code)) {
    if (code === 'culinary_review_not_approved' && candidate?.culinaryReview?.status === 'rejected') return 'rejected';
    return 'needs_recipe_review';
  }
  if (code === 'pipeline_exception' && referenceException(rejection?.detail, policy)) return 'needs_reference_review';
  return 'rejected';
}

function assessFilteredDiversity(versions, job, corpusPolicy) {
  const exempt = new Set(corpusPolicy.diversity?.exemptIngredientIds || []);
  const distinctIngredients = new Set(); const distinctPrimary = new Set(); const primaryCounts = new Map(); const pairCounts = new Map();
  for (const version of versions) {
    const ids = (version.ingredientLines || []).map(line => line.ingredientId);
    for (const id of ids) distinctIngredients.add(id);
    const primary = primaryIngredientId(version, exempt);
    if (primary) { distinctPrimary.add(primary); increment(primaryCounts, primary); }
    for (const pair of pairKeys(ids)) increment(pairCounts, pair);
  }
  const failures = [];
  const requiredPrimary = versions.length ? Math.min(job.diversityTargets.minDistinctPrimaryIngredients, versions.length) : 0;
  const requiredIngredients = versions.length ? Math.min(job.diversityTargets.minDistinctIngredientIds, new Set(job.allowedIngredientIds).size) : 0;
  if (distinctPrimary.size < requiredPrimary) failures.push({ code: 'min_distinct_primary_not_met', actual: distinctPrimary.size, required: requiredPrimary });
  if (distinctIngredients.size < requiredIngredients) failures.push({ code: 'min_distinct_ingredients_not_met', actual: distinctIngredients.size, required: requiredIngredients });
  const primaryOver = [...primaryCounts.entries()].find(([, count]) => count > job.diversityTargets.maxPrimaryIngredientFrequency);
  if (primaryOver) failures.push({ code: 'max_primary_frequency_exceeded', ingredientId: primaryOver[0], actual: primaryOver[1], maximum: job.diversityTargets.maxPrimaryIngredientFrequency });
  const pairOver = [...pairCounts.entries()].find(([, count]) => count > job.diversityTargets.maxIngredientPairFrequency);
  if (pairOver) failures.push({ code: 'max_pair_frequency_exceeded', pair: pairOver[0].replace('\u0000', '+'), actual: pairOver[1], maximum: job.diversityTargets.maxIngredientPairFrequency });
  return { passed: failures.length === 0, failures };
}

export async function planProductionJobIntake({ job, contract, createdAt = null, registry = null }) {
  registry?.assert('recipeGenerationJob', job);
  registry?.assert('productionCorpusContract', contract);
  if (!job.productionContract || job.productionContract.contractId !== contract.contractId || job.productionContract.contractVersion !== contract.contractVersion) throw new Error('Production scale job contract binding mismatch');
  if (job.pipelineVersion !== contract.pipelineVersion) throw new Error(`Production scale job must use pipelineVersion ${contract.pipelineVersion}`);
  if (!job.referenceDataVersion || !job.referenceDataDigest) throw new Error('Production scale job must freeze reference data');
  const timestamp = createdAt || new Date().toISOString();
  const identity = await sha256Json({ jobId: job.jobId, seed: job.seed, referenceDataVersion: job.referenceDataVersion, referenceDataDigest: job.referenceDataDigest, candidateCount: job.candidateCount });
  const focus = unique([...(job.coverageTargets || []).map(target => target.key), ...(job.requiredTags || []), ...(job.recipeFamilies || []), ...(job.cuisineFocus || [])]).filter(Boolean);
  const rationale = (job.orchestration?.reasons || []).join('; ') || 'Industrialized production scale job';
  const records = [];
  for (let index = 0; index < job.candidateCount; index += 1) {
    const candidateHash = await sha256Json({ intake: identity, index, jobId: job.jobId });
    records.push({
      candidateId: `scale-${identity.slice(0, 10)}-${String(index + 1).padStart(3, '0')}-${candidateHash.slice(0, 6)}`,
      stratumId: job.jobId,
      state: 'discovered',
      referenceScanStatus: 'pending',
      concept: { mealArchetypes: [...job.mealArchetypes], focus: focus.length ? focus : ['production_scale'], rationale },
      referenceRequests: [], jobId: null, generatedAt: null, outcome: null,
      audit: [{ at: timestamp, action: 'scale_slot_created', detail: `Created from RecipeGenerationJob ${job.jobId}` }]
    });
  }
  const intake = {
    schemaVersion: 1, intakeId: `scale-intake-${identity.slice(0, 20)}`, contractId: contract.contractId, contractVersion: contract.contractVersion,
    seed: job.seed, referenceDataVersion: job.referenceDataVersion, referenceDataDigest: job.referenceDataDigest, targetCandidateCount: records.length, records, createdAt: timestamp, updatedAt: timestamp
  };
  registry?.assert('productionCorpusIntake', intake);
  return intake;
}

export async function industrializedBatchDigest({ reportCandidates, acceptedVersions, jobId, policyId, policyVersion, inputSnapshotId }) {
  return sha256Json({
    jobId, policyId, policyVersion, inputSnapshotId,
    candidates: reportCandidates.map(item => ({ candidateId: item.candidateId, disposition: item.disposition, code: item.code, qualityScore: item.qualityScore, recipeVersionId: item.recipeVersionId })),
    acceptedVersions: acceptedVersions.map(version => ({ recipeVersionId: version.recipeVersionId, contentHash: version.contentHash })).sort((a, b) => a.recipeVersionId.localeCompare(b.recipeVersionId))
  });
}

export async function processIndustrializedProductionBatch({ job, candidates, corpusPolicy, pipelinePolicy, ingredientFamilies, ingredientRevisions, existingRecipeVersions = [], taxonomies = [], taxonomyTerms = [], registry = null, productionContext, generatedAt = null }) {
  const base = await processCandidateBatch({
    job, candidates, policy: corpusPolicy, ingredientFamilies, ingredientRevisions, existingRecipeVersions, taxonomies, taxonomyTerms, registry, productionContext, generatedAt
  });
  const acceptedByCandidate = new Map(base.versions.map(version => [version.generation?.candidateId, version]));
  const familyByRecipe = new Map(base.families.map(family => [family.recipeId, family]));
  const rejectedByCandidate = new Map((base.rejected || []).filter(item => item.candidateId).map(item => [item.candidateId, item]));
  const warningsByCandidate = new Map();
  for (const warning of base.warnings || []) {
    if (!warningsByCandidate.has(warning.candidateId)) warningsByCandidate.set(warning.candidateId, []);
    warningsByCandidate.get(warning.candidateId).push(clone(warning));
  }

  const decisions = [];
  for (const candidate of candidates) {
    const version = acceptedByCandidate.get(candidate.candidateId) || null;
    const warnings = warningsByCandidate.get(candidate.candidateId) || [];
    if (version) {
      const blockingWarning = warnings.find(warning => (pipelinePolicy.classification.blockingWarningCodes || []).includes(warning.code));
      const disposition = blockingWarning ? 'nutrition_outlier' : 'accepted';
      const failedStage = blockingWarning ? 'nutrition' : null;
      decisions.push({
        candidateId: candidate.candidateId,
        disposition,
        terminal: pipelinePolicy.dispositions[disposition].terminal,
        intakeState: pipelinePolicy.dispositions[disposition].intakeState,
        code: blockingWarning?.code || null,
        detail: blockingWarning || null,
        failedStage,
        qualityScore: scoreBeforeStage(pipelinePolicy, failedStage),
        recipeVersionId: disposition === 'accepted' ? version.recipeVersionId : null,
        warnings
      });
      continue;
    }
    const rejection = rejectedByCandidate.get(candidate.candidateId) || { code: 'pipeline_missing_outcome', detail: null };
    const disposition = dispositionForRejection(rejection, candidate, pipelinePolicy);
    const failedStage = failedStageFor(rejection.code, disposition);
    decisions.push({
      candidateId: candidate.candidateId,
      disposition,
      terminal: pipelinePolicy.dispositions[disposition].terminal,
      intakeState: pipelinePolicy.dispositions[disposition].intakeState,
      code: rejection.code,
      detail: rejection.detail ?? null,
      failedStage,
      qualityScore: scoreBeforeStage(pipelinePolicy, failedStage),
      recipeVersionId: null,
      warnings
    });
  }

  const cleanCandidateIds = new Set(decisions.filter(item => item.disposition === 'accepted' && item.qualityScore >= pipelinePolicy.qualityScore.minAcceptedScore).map(item => item.candidateId));
  const versions = base.versions.filter(version => cleanCandidateIds.has(version.generation?.candidateId));
  const recipeIds = new Set(versions.map(version => version.recipeId));
  const families = [...familyByRecipe.values()].filter(family => recipeIds.has(family.recipeId));
  const diversity = assessFilteredDiversity(versions, job, corpusPolicy);
  const dispositionCounts = Object.fromEntries(DISPOSITIONS.map(key => [key, decisions.filter(item => item.disposition === key).length]));
  const reviewBacklogCount = decisions.filter(item => !item.terminal).length;
  const terminalCount = decisions.length - reviewBacklogCount;
  const targetMet = versions.length >= job.targetAcceptedCount;
  const blockers = [];
  if (reviewBacklogCount) blockers.push(`review-backlog=${reviewBacklogCount}`);
  if (!targetMet) blockers.push(`accepted=${versions.length}, target=${job.targetAcceptedCount}`);
  for (const failure of diversity.failures) blockers.push(`diversity:${failure.code}`);
  const batchStatus = reviewBacklogCount ? 'review_required' : (blockers.length ? 'blocked' : 'pass');
  const timestamp = generatedAt || new Date().toISOString();
  const resultDigest = await industrializedBatchDigest({ reportCandidates: decisions, acceptedVersions: versions, jobId: job.jobId, policyId: pipelinePolicy.policyId, policyVersion: pipelinePolicy.policyVersion, inputSnapshotId: job.orchestration?.inputSnapshotId || 'no-snapshot' });
  const report = {
    schemaVersion: 1,
    reportId: `prbr-${resultDigest.slice(0, 20)}`,
    policyId: pipelinePolicy.policyId,
    policyVersion: pipelinePolicy.policyVersion,
    contractId: productionContext.contractId,
    contractVersion: productionContext.contractVersion,
    jobId: job.jobId,
    intakeId: productionContext.intakeId,
    inputSnapshotId: job.orchestration?.inputSnapshotId || 'no-snapshot',
    referenceDataVersion: job.referenceDataVersion,
    referenceDataDigest: job.referenceDataDigest,
    candidateCount: candidates.length,
    acceptedCount: versions.length,
    terminalCount,
    reviewBacklogCount,
    dispositionCounts,
    candidates: decisions,
    batchGate: { status: batchStatus, targetMet, diversityPassed: diversity.passed, reviewBacklogCount, blockers: unique(blockers) },
    resultDigest,
    processedAt: timestamp
  };
  registry?.assert('productionRecipeBatchReport', report);
  const nonAccepted = decisions.filter(item => item.disposition !== 'accepted').map(item => ({ candidateId: item.candidateId, code: item.code || item.disposition, detail: item.detail, disposition: item.disposition }));
  const result = {
    ...base,
    acceptedCount: versions.length,
    rejectedCount: nonAccepted.length,
    targetMet,
    diversityPassed: diversity.passed,
    families,
    versions,
    rejected: nonAccepted,
    diversityFailures: diversity.failures,
    productionReportId: report.reportId,
    productionResultDigest: resultDigest,
    productionDispositionCounts: dispositionCounts
  };
  return { result, report };
}

export async function verifyIndustrializedBatchReport({ result, report, pipelinePolicy, registry = null }) {
  registry?.assert('productionRecipeBatchReport', report);
  if (report.policyId !== pipelinePolicy.policyId || report.policyVersion !== pipelinePolicy.policyVersion) throw new Error('Production batch report policy binding mismatch');
  if (result.productionReportId !== report.reportId || result.productionResultDigest !== report.resultDigest) throw new Error('Production result/report identity mismatch');
  const expected = await industrializedBatchDigest({ reportCandidates: report.candidates, acceptedVersions: result.versions || [], jobId: report.jobId, policyId: report.policyId, policyVersion: report.policyVersion, inputSnapshotId: report.inputSnapshotId });
  if (expected !== report.resultDigest) throw new Error(`Production batch result digest mismatch: expected ${expected}, report ${report.resultDigest}`);
  if (pipelinePolicy.execution.requireZeroReviewBacklogBeforeApply && report.reviewBacklogCount !== 0) throw new Error(`Production batch has review backlog ${report.reviewBacklogCount}`);
  if (report.batchGate.status !== 'pass' || !result.targetMet || !result.diversityPassed) throw new Error(`Production batch cannot be applied while gate=${report.batchGate.status}, targetMet=${result.targetMet}, diversityPassed=${result.diversityPassed}`);
  return true;
}

export function applyIndustrializedBatchToIntake({ intake, job, report, processedAt = null, registry = null }) {
  registry?.assert('productionCorpusIntake', intake);
  registry?.assert('productionRecipeBatchReport', report);
  if (report.intakeId !== intake.intakeId || report.jobId !== job.jobId) throw new Error('Production batch report intake/job mismatch');
  const output = clone(intake); const byDecision = new Map(report.candidates.map(item => [item.candidateId, item]));
  const timestamp = processedAt || report.processedAt || new Date().toISOString();
  for (const record of output.records) {
    const decision = byDecision.get(record.candidateId); if (!decision) continue;
    record.generatedAt = timestamp;
    record.audit.push({ at: timestamp, action: 'production_candidate_attempt', detail: `${report.reportId}: ${decision.disposition}${decision.code ? ` (${decision.code})` : ''}` });
    if (decision.disposition === 'accepted') {
      record.state = 'accepted'; record.jobId = job.jobId;
      record.outcome = { status: 'accepted', code: null, recipeVersionId: decision.recipeVersionId, processedAt: timestamp };
    } else if (decision.disposition === 'rejected' || decision.disposition === 'duplicate') {
      record.state = 'rejected'; record.jobId = job.jobId;
      record.outcome = { status: 'rejected', code: decision.code || decision.disposition, recipeVersionId: null, processedAt: timestamp };
    } else if (decision.disposition === 'needs_reference_review') {
      record.state = 'needs_reference_review'; record.jobId = null; record.outcome = null;
    } else {
      record.state = 'generated'; record.jobId = null; record.outcome = null;
    }
  }
  output.updatedAt = timestamp;
  registry?.assert('productionCorpusIntake', output);
  return output;
}

export function applyProductionRecipeReviewDecisions({ intake, report, decisions, pipelinePolicy, registry = null }) {
  registry?.assert('productionCorpusIntake', intake);
  registry?.assert('productionRecipeBatchReport', report);
  registry?.assert('productionRecipeReviewDecisions', decisions);
  if (decisions.batchReportId !== report.reportId || decisions.batchResultDigest !== report.resultDigest) throw new Error('Review decisions do not match production batch report');
  const output = clone(intake); const recordById = new Map(output.records.map(record => [record.candidateId, record]));
  const reportById = new Map(report.candidates.map(item => [item.candidateId, item]));
  const seen = new Set();
  for (const decision of decisions.decisions) {
    if (seen.has(decision.candidateId)) throw new Error(`Duplicate review decision for ${decision.candidateId}`); seen.add(decision.candidateId);
    const reportRow = reportById.get(decision.candidateId); const record = recordById.get(decision.candidateId);
    if (!reportRow || !record) throw new Error(`Review candidate ${decision.candidateId} is missing from report or intake`);
    if (!['needs_recipe_review', 'nutrition_outlier'].includes(reportRow.disposition)) throw new Error(`Candidate ${decision.candidateId} disposition ${reportRow.disposition} is not handled by recipe review decisions`);
    if (record.state !== 'generated') throw new Error(`Candidate ${decision.candidateId} intake state ${record.state} is not generated`);
    const attempts = record.audit.filter(item => item.action === 'production_candidate_attempt').length;
    if (decision.action === 'retry') {
      if (attempts >= pipelinePolicy.execution.maxAttemptsPerCandidate) throw new Error(`Candidate ${decision.candidateId} reached max attempts ${pipelinePolicy.execution.maxAttemptsPerCandidate}`);
      record.state = 'ready_for_generation'; record.jobId = null; record.generatedAt = null; record.outcome = null;
      record.audit.push({ at: decisions.reviewedAt, action: 'production_recipe_review_retry', detail: `${decisions.reviewer}: ${decision.notes}` });
    } else {
      record.state = 'rejected'; record.jobId = null;
      record.outcome = { status: 'rejected', code: `editorial_reject_after_${reportRow.disposition}`, recipeVersionId: null, processedAt: decisions.reviewedAt };
      record.audit.push({ at: decisions.reviewedAt, action: 'production_recipe_review_reject', detail: `${decisions.reviewer}: ${decision.notes}` });
    }
  }
  output.updatedAt = decisions.reviewedAt;
  registry?.assert('productionCorpusIntake', output);
  return output;
}

export async function assertFreshProductionSnapshot({ job, snapshot, corpus, corpusPolicy, registry = null }) {
  registry?.assert('recipeCorpusSnapshot', snapshot);
  if (!job.orchestration?.inputSnapshotId) throw new Error('Industrialized production job requires orchestration.inputSnapshotId');
  if (job.orchestration.inputSnapshotId !== snapshot.snapshotId) throw new Error(`Stale production job snapshot: job=${job.orchestration.inputSnapshotId}, supplied=${snapshot.snapshotId}`);
  if (snapshot.policyId !== corpusPolicy.policyId || snapshot.policyVersion !== corpusPolicy.policyVersion) throw new Error('Snapshot policy does not match active corpus policy');
  if (job.orchestration.policyId !== corpusPolicy.policyId || job.orchestration.policyVersion !== corpusPolicy.policyVersion) throw new Error('RecipeGenerationJob orchestration policy does not match active corpus policy');
  const current = await computeCorpusContentIdentity({ catalogVersion: corpus.manifest.catalogVersion, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, ingredientRevisions: corpus.ingredientRevisions });
  if (current.contentDigest !== snapshot.contentDigest || current.activeRecipeCount !== snapshot.activeRecipeCount) throw new Error(`Stale production snapshot ${snapshot.snapshotId}: catalog content changed since planning`);
  return true;
}

function pilotMetrics(intake, proposals = []) {
  const terminalStates = new Set(['accepted', 'rejected']);
  const accepted = intake.records.filter(record => record.state === 'accepted').length;
  const rejected = intake.records.filter(record => record.state === 'rejected').length;
  let unresolvedReferenceRequests = 0;
  for (const record of intake.records) for (const request of record.referenceRequests || []) if (!RESOLVED_REQUEST_STATES.has(request.status) && request.status !== 'rejected') unresolvedReferenceRequests += 1;
  const proposalIds = new Set(intake.records.flatMap(record => (record.referenceRequests || []).map(request => request.proposalId).filter(Boolean)));
  const unhandledReferenceDataProposals = proposals.filter(proposal => proposalIds.has(proposal.proposalId) && !CLOSED_PROPOSAL_STATES.has(proposal.status)).length;
  const terminal = intake.records.filter(record => terminalStates.has(record.state)).length;
  return { target: intake.targetCandidateCount, terminal, accepted, rejected, unresolvedReferenceRequests, unhandledReferenceDataProposals, complete: terminal === intake.targetCandidateCount && unresolvedReferenceRequests === 0 && unhandledReferenceDataProposals === 0 };
}

export function buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness, intake, proposals = [], snapshot, registry = null, evaluatedAt = null }) {
  registry?.assert('productionRecipePipelinePolicy', pipelinePolicy);
  registry?.assert('productionCorpusContract', contract);
  registry?.assert('recipeCorpusPolicy', corpusPolicy);
  registry?.assert('productionCorpusReadinessReport', productionReadiness);
  registry?.assert('productionCorpusIntake', intake);
  registry?.assert('recipeCorpusSnapshot', snapshot);
  const pilot = pilotMetrics(intake, proposals);
  const gate = pipelinePolicy.scaleGate500;
  const checks = [
    check('pilot-production-readiness', productionReadiness.readyForPilot === true, `readyForPilot=${productionReadiness.readyForPilot}`),
    check('pilot-terminal-count', !gate.requirePilotComplete || pilot.terminal === pilot.target, `terminal=${pilot.terminal}, target=${pilot.target}`),
    check('pilot-unresolved-references', !gate.requireZeroUnresolvedReferenceRequests || pilot.unresolvedReferenceRequests === 0, `unresolved=${pilot.unresolvedReferenceRequests}`),
    check('pilot-reference-data-proposals', !gate.requireZeroUnhandledReferenceDataProposals || pilot.unhandledReferenceDataProposals === 0, `unhandled=${pilot.unhandledReferenceDataProposals}`),
    check('snapshot-schema-errors', !gate.requireZeroSchemaErrors || snapshot.quality.schemaErrors === 0, `schemaErrors=${snapshot.quality.schemaErrors}`),
    check('snapshot-unknown-ingredients', !gate.requireZeroUnknownIngredientReferences || snapshot.quality.unknownIngredientReferences === 0, `unknownIngredientReferences=${snapshot.quality.unknownIngredientReferences}`),
    check('snapshot-nutrition-errors', !gate.requireZeroNutritionErrors || snapshot.quality.nutritionErrors === 0, `nutritionErrors=${snapshot.quality.nutritionErrors}`),
    check('snapshot-allergen-errors', !gate.requireZeroAllergenDerivationErrors || snapshot.quality.allergenDerivationErrors === 0, `allergenDerivationErrors=${snapshot.quality.allergenDerivationErrors}`),
    check('snapshot-locale-errors', !gate.requireZeroMissingRequiredLocaleFields || snapshot.quality.missingRequiredLocaleFields === 0, `missingRequiredLocaleFields=${snapshot.quality.missingRequiredLocaleFields}`),
    check('snapshot-exact-duplicates', !gate.requireZeroExactDuplicates || snapshot.similarity.exactDuplicateCount === 0, `exactDuplicateCount=${snapshot.similarity.exactDuplicateCount}`),
    check('snapshot-near-duplicates', snapshot.similarity.nearDuplicateCount <= gate.maxNearDuplicateCount, `nearDuplicateCount=${snapshot.similarity.nearDuplicateCount}, max=${gate.maxNearDuplicateCount}`)
  ];
  const coverageById = new Map((snapshot.coverageCells || []).map(cell => [cell.targetId, cell]));
  const coverageChecks = (corpusPolicy.coverageTargets || []).filter(target => target.hardForRelease && Number.isFinite(target.minCount)).map(target => {
    const requiredAtGate = Math.ceil(Number(target.minCount) * gate.targetActiveRecipes / gate.releaseReferenceRecipeCount);
    const actual = coverageById.get(target.targetId)?.currentCount || 0;
    return { targetId: target.targetId, releaseMinimum: target.minCount, requiredAtGate, actual, status: actual >= requiredAtGate ? 'pass' : 'blocked' };
  });
  const prerequisitesPass = checks.slice(0, 4).every(item => item.status === 'pass');
  const corpusQualityPass = checks.slice(4).every(item => item.status === 'pass');
  const countReached = snapshot.activeRecipeCount >= gate.targetActiveRecipes;
  const coveragePass = coverageChecks.every(item => item.status === 'pass');
  const blockers = [
    ...checks.filter(item => item.status === 'blocked').map(item => `${item.id}: ${item.detail}`),
    ...coverageChecks.filter(item => item.status === 'blocked').map(item => `coverage:${item.targetId}: actual=${item.actual}, required>=${item.requiredAtGate}`)
  ];
  if (!countReached) blockers.push(`active-recipe-count: active=${snapshot.activeRecipeCount}, required>=${gate.targetActiveRecipes}`);
  let status = 'blocked';
  if (prerequisitesPass && corpusQualityPass && !countReached) status = 'ready';
  if (prerequisitesPass && countReached && corpusQualityPass && coveragePass) status = 'pass';
  const report = {
    schemaVersion: 1, gateId: gate.gateId, policyId: pipelinePolicy.policyId, policyVersion: pipelinePolicy.policyVersion,
    contractId: contract.contractId, contractVersion: contract.contractVersion, snapshotId: snapshot.snapshotId,
    activeRecipeCount: snapshot.activeRecipeCount, targetActiveRecipes: gate.targetActiveRecipes, pilot, checks, coverageChecks,
    status, blockers: unique(blockers), evaluatedAt: evaluatedAt || new Date().toISOString()
  };
  registry?.assert('productionScaleGateReport', report);
  return report;
}
