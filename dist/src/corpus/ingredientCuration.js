import { assertReferenceData, TAXONOMY_IDS } from '../services/referenceDataService.js';

const REVIEW_CHECKS = ['italianLabel', 'taxonomy', 'state', 'allergens', 'culinarySuitability', 'duplicate', 'nutrition', 'source'];
const RESOLVED_REQUEST_STATES = new Set(['reused', 'materialized', 'resolved']);
const CLOSED_PROPOSAL_STATES = new Set(['materialized', 'rejected']);

function unique(values) { return [...new Set(values)]; }
function increment(target, key) { target[key] = (target[key] || 0) + 1; }
function check(id, pass, detail, falseStatus = 'blocked') { return { id, status: pass ? 'pass' : falseStatus, detail }; }

export function ingredientCurationPolicyDiagnostics(policy, contract) {
  const errors = [];
  if (!policy || !contract) return { valid: false, errors: ['Ingredient curation policy and production contract are required'] };
  if (policy.productionContract?.contractId !== contract.contractId) errors.push(`policy contractId ${policy.productionContract?.contractId} does not match ${contract.contractId}`);
  if (policy.productionContract?.contractVersion !== contract.contractVersion) errors.push(`policy contractVersion ${policy.productionContract?.contractVersion} does not match ${contract.contractVersion}`);
  const primary = (policy.sourcePriority || []).filter(source => source.role === 'primary');
  if (primary.length !== 1) errors.push(`ingredient curation policy must define exactly one primary source, found ${primary.length}`);
  if (policy.sourceRules?.automaticFuzzyMerge !== false) errors.push('automaticFuzzyMerge must remain false');
  if (policy.pilotExecution?.waveSize !== contract.pilot?.waveSize) errors.push(`pilot waveSize ${policy.pilotExecution?.waveSize} does not match contract ${contract.pilot?.waveSize}`);
  return { valid: errors.length === 0, errors };
}

export function assertIngredientCurationPolicy(policy, contract, registry = null) {
  registry?.assert('ingredientCurationPolicy', policy);
  const diagnostics = ingredientCurationPolicyDiagnostics(policy, contract);
  if (!diagnostics.valid) throw new Error(`Ingredient curation policy validation failed: ${diagnostics.errors.join('; ')}`);
  return policy;
}

export function ingredientSourcePlan(policy, contract) {
  const primary = (policy.sourcePriority || []).find(source => source.role === 'primary');
  const primaryPublishedCount = Number(primary?.officialPublishedCount || 0);
  const contractMinimum = Number(contract.ingredientReadiness?.minActiveIngredients || 0);
  const minimumSupplementalFromPublishedCount = Math.max(0, contractMinimum - primaryPublishedCount);
  return {
    primaryPublishedCount,
    contractMinimum,
    minimumSupplementalFromPublishedCount,
    note: minimumSupplementalFromPublishedCount > 0
      ? `The primary published inventory alone cannot satisfy the ${contractMinimum}-ingredient gate; at least ${minimumSupplementalFromPublishedCount} supplemental approved concepts are required before nutrient-completeness and duplicate filtering.`
      : 'The primary published inventory is large enough in principle, but eligibility/review filtering can still require supplemental records.'
  };
}

function boundedNutritionIssues(nutrition, bounds) {
  const issues = [];
  for (const [field, rule] of Object.entries(bounds || {})) {
    const value = nutrition?.[field];
    if (value == null && field === 'sodiumMg') continue;
    if (!Number.isFinite(value)) { issues.push(`invalid_nutrition_${field}`); continue; }
    if (value < rule.min || value > rule.max) issues.push(`nutrition_out_of_bounds_${field}`);
  }
  return issues;
}

export function ingredientCurationRecordIssues(record, { policy, referenceIndex = null } = {}) {
  const issues = [];
  const approved = record.review?.decision === 'approved' || record.review?.approved === true;
  if ((record.review?.decision === 'approved') !== (record.review?.approved === true)) issues.push('approval_flag_mismatch');
  if (!approved) return issues;

  const requirements = policy.reviewRequirements || {};
  if (requirements.requireItalianLabel && !record.suggested?.nameIt?.trim()) issues.push('missing_italian_label');
  if (!requirements.allowUnknownState && record.suggested?.state === 'unknown') issues.push('state_unknown');
  for (const key of REVIEW_CHECKS) if (record.review?.checks?.[key] !== true) issues.push(`review_check_${key}_incomplete`);
  if (!record.review?.reviewer?.trim()) issues.push('missing_reviewer');
  if (!record.review?.reviewedAt) issues.push('missing_reviewed_at');
  if (record.review?.duplicateOfIngredientId) issues.push('approved_record_marked_duplicate');
  if (!record.sourceRecordId) issues.push('missing_source_record_id');
  issues.push(...boundedNutritionIssues(record.nutrition, policy.nutritionBoundsPer100g));

  if (referenceIndex) {
    try { referenceIndex.assertTerm(record.suggested?.foodGroup, TAXONOMY_IDS.foodCategory); } catch { issues.push('invalid_food_group'); }
    if (record.suggested?.foodSubgroup) {
      try {
        const subgroup = referenceIndex.assertTerm(record.suggested.foodSubgroup, TAXONOMY_IDS.foodCategory);
        if (subgroup.parentTermId !== record.suggested.foodGroup) issues.push('invalid_food_subgroup_parent');
      } catch { issues.push('invalid_food_subgroup'); }
    }
    try { referenceIndex.assertTerm(record.suggested?.flavorProfile, TAXONOMY_IDS.flavorProfile); } catch { issues.push('invalid_flavor_profile'); }
  }
  return unique(issues);
}

export function assessIngredientCurationBatch({ batch = null, policy, contract, taxonomies = [], taxonomyTerms = [], registry = null, existingProductionReadyCount = 0, generatedAt = null }) {
  assertIngredientCurationPolicy(policy, contract, registry);
  const sourcePlan = ingredientSourcePlan(policy, contract);
  const checks = [];
  const issueCounts = {};
  const counts = { pending: 0, approved: 0, rejected: 0, materializable: 0, blockedApproved: 0 };
  let referenceIndex = null;
  try {
    referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry);
    checks.push(check('reference-data-valid', true, `taxonomies=${taxonomies.length}, terms=${taxonomyTerms.length}`));
  } catch (error) {
    checks.push(check('reference-data-valid', false, error.message));
  }
  checks.push(check('primary-source-capacity', sourcePlan.minimumSupplementalFromPublishedCount === 0, sourcePlan.note, 'warning'));

  let batchSummary = { present: false, batchId: null, sourceId: null, inputFoodCount: 0, eligibleFoodCount: 0 };
  if (batch) {
    registry?.assert('ingredientCurationBatch', batch);
    batchSummary = { present: true, batchId: batch.batchId, sourceId: batch.source?.sourceId || null, inputFoodCount: batch.inputFoodCount, eligibleFoodCount: batch.completeRequiredNutrientCount };
    if ((batch.structurallyInvalidFoodCount || 0) > 0) checks.push(check('source-structural-invalid-records', false, `skipped=${batch.structurallyInvalidFoodCount}; examples=${JSON.stringify(batch.structurallyInvalidFoodExamples || [])}`, 'warning'));
    const sourcePolicy = (policy.sourcePriority || []).find(source => source.sourceId === batch.source?.sourceId);
    checks.push(check('source-approved', Boolean(sourcePolicy), sourcePolicy ? `${batch.source.sourceId} is allowed by ${policy.policyId}` : `Unknown source ${batch.source?.sourceId}`));
    checks.push(check('source-digest-present', Boolean(batch.source?.inputDigest), batch.source?.inputDigest ? `digest=${batch.source.inputDigest}` : 'input digest missing'));

    const seenSource = new Set();
    const seenIngredient = new Set();
    for (const record of batch.records || []) {
      if (seenSource.has(record.sourceRecordId)) increment(issueCounts, 'duplicate_source_record_id');
      seenSource.add(record.sourceRecordId);
      if (seenIngredient.has(record.suggested?.ingredientId)) increment(issueCounts, 'duplicate_suggested_ingredient_id');
      seenIngredient.add(record.suggested?.ingredientId);
      if (record.review?.decision === 'approved') counts.approved += 1;
      else if (record.review?.decision === 'rejected') counts.rejected += 1;
      else counts.pending += 1;
      const issues = ingredientCurationRecordIssues(record, { policy, referenceIndex });
      for (const issue of issues) increment(issueCounts, issue);
      if (record.review?.decision === 'approved') {
        if (issues.length === 0) counts.materializable += 1;
        else counts.blockedApproved += 1;
      }
    }
    for (const key of ['duplicate_source_record_id', 'duplicate_suggested_ingredient_id']) {
      if (issueCounts[key]) counts.blockedApproved += issueCounts[key];
    }
    checks.push(check('approved-records-valid', counts.blockedApproved === 0, `materializable=${counts.materializable}, blockedApproved=${counts.blockedApproved}`));
  } else {
    checks.push(check('curation-batch-present', false, 'No trusted source curation batch is vendored; acquire/import the official source before editorial approval.'));
  }

  const projectedReadyCount = existingProductionReadyCount + counts.materializable;
  const readyToMaterialize = Boolean(batch && counts.materializable > 0 && counts.blockedApproved === 0);
  const readyForPilotFoundation = projectedReadyCount >= contract.ingredientReadiness.minActiveIngredients && counts.blockedApproved === 0;
  checks.push(check('ingredient-foundation-count', readyForPilotFoundation, `projectedReady=${projectedReadyCount}, required>=${contract.ingredientReadiness.minActiveIngredients}`));
  const blockers = checks.filter(item => item.status === 'blocked').map(item => `${item.id}: ${item.detail}`);
  const report = {
    schemaVersion: 1,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    generatedAt: generatedAt || new Date().toISOString(),
    sourcePlan,
    batch: batchSummary,
    counts,
    issueCounts,
    checks,
    readyToMaterialize,
    readyForPilotFoundation,
    blockers
  };
  registry?.assert('ingredientCurationReport', report);
  return report;
}

export function pilotWaveCandidateIds(intake, waveNumber, waveSize) {
  const start = (waveNumber - 1) * waveSize;
  return (intake.records || []).slice(start, start + waveSize).map(record => record.candidateId);
}

export function buildPilotWaveReport({ intake, waveNumber, waveSize, proposals = [], productionReadiness = null, curationPolicy, registry = null, generatedAt = null }) {
  registry?.assert('productionCorpusIntake', intake);
  const candidateIds = pilotWaveCandidateIds(intake, waveNumber, waveSize);
  if (!candidateIds.length) throw new Error(`Pilot wave ${waveNumber} is outside intake range`);
  const idSet = new Set(candidateIds);
  const records = intake.records.filter(record => idSet.has(record.candidateId));
  const metrics = { records: records.length, pendingScan: 0, needsReferenceReview: 0, needsIngredientReview: 0, readyForGeneration: 0, generated: 0, accepted: 0, rejected: 0, unresolvedRequests: 0, unhandledTaxonomyProposals: 0 };
  for (const record of records) {
    if (record.referenceScanStatus === 'pending') metrics.pendingScan += 1;
    if (record.state === 'needs_reference_review') metrics.needsReferenceReview += 1;
    if (record.state === 'needs_ingredient_review') metrics.needsIngredientReview += 1;
    if (record.state === 'ready_for_generation') metrics.readyForGeneration += 1;
    if (record.state === 'generated') metrics.generated += 1;
    if (record.state === 'accepted') metrics.accepted += 1;
    if (record.state === 'rejected') metrics.rejected += 1;
    for (const request of record.referenceRequests || []) if (!RESOLVED_REQUEST_STATES.has(request.status) && request.status !== 'rejected') metrics.unresolvedRequests += 1;
  }
  const proposalIds = new Set(records.flatMap(record => (record.referenceRequests || []).map(request => request.proposalId).filter(Boolean)));
  metrics.unhandledTaxonomyProposals = proposals.filter(proposal => proposalIds.has(proposal.proposalId) && !CLOSED_PROPOSAL_STATES.has(proposal.status)).length;

  const blockers = [];
  if (curationPolicy.pilotExecution.requireReadinessBeforeWave1 && productionReadiness && !productionReadiness.readyForPilot) {
    const pilotBlockers = productionReadiness.pilotBlockers || (productionReadiness.checks || [])
      .filter(item => item.status === 'blocked' && ['contract-policy-sync', 'reference-data-valid', 'reference-data-digest', 'ingredient-production-quality', 'ingredient-production-count'].includes(item.id))
      .map(item => `${item.id}: ${item.detail}`);
    blockers.push(...pilotBlockers.map(item => `production-readiness: ${item}`));
  }
  if (waveNumber > 1 && curationPolicy.pilotExecution.requirePreviousWaveGateBeforeNext) {
    const previousIds = new Set(pilotWaveCandidateIds(intake, waveNumber - 1, waveSize));
    const previous = intake.records.filter(record => previousIds.has(record.candidateId));
    const previousClosed = previous.length === waveSize && previous.every(record => record.state === 'accepted' || record.state === 'rejected');
    if (!previousClosed) blockers.push(`previous-wave-${waveNumber - 1}-not-closed`);
  }

  const terminal = metrics.accepted + metrics.rejected;
  let state = 'in_progress';
  let gate = 'review_required';
  if (blockers.length) { state = 'blocked'; gate = 'blocked'; }
  else if (terminal === records.length) {
    state = 'closed';
    if (metrics.unresolvedRequests <= curationPolicy.pilotExecution.maxUnresolvedReferencesAtWaveClose && metrics.unhandledTaxonomyProposals <= curationPolicy.pilotExecution.maxUnhandledTaxonomyProposalsAtWaveClose) gate = 'pass';
  } else if (metrics.pendingScan === records.length) state = 'ready';

  if (state === 'closed' && gate !== 'pass') {
    if (metrics.unresolvedRequests > curationPolicy.pilotExecution.maxUnresolvedReferencesAtWaveClose) blockers.push(`unresolved-requests=${metrics.unresolvedRequests}`);
    if (metrics.unhandledTaxonomyProposals > curationPolicy.pilotExecution.maxUnhandledTaxonomyProposalsAtWaveClose) blockers.push(`unhandled-taxonomy-proposals=${metrics.unhandledTaxonomyProposals}`);
  }
  const report = { schemaVersion: 1, waveId: `${intake.intakeId}-wave-${String(waveNumber).padStart(2, '0')}`, waveNumber, intakeId: intake.intakeId, generatedAt: generatedAt || new Date().toISOString(), state, candidateIds, metrics, gate, blockers: unique(blockers) };
  registry?.assert('pilotWaveReport', report);
  return report;
}
