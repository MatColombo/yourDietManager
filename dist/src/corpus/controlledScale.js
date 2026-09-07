function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0); }
function unique(values) { return [...new Set(values)]; }

export function controlledScalePlanDiagnostics(plan, contract, corpusPolicy, pipelinePolicy) {
  const errors = [];
  if (!plan || !contract || !corpusPolicy || !pipelinePolicy) return { valid: false, errors: ['Controlled scale plan and bound policies are required'] };
  if (plan.contractId !== contract.contractId || plan.contractVersion !== contract.contractVersion) errors.push('production contract binding mismatch');
  if (plan.corpusPolicyId !== corpusPolicy.policyId || plan.corpusPolicyVersion !== corpusPolicy.policyVersion) errors.push('corpus policy binding mismatch');
  if (plan.pipelinePolicyId !== pipelinePolicy.policyId || plan.pipelinePolicyVersion !== pipelinePolicy.policyVersion) errors.push('pipeline policy binding mismatch');
  if (plan.targetActiveRecipes !== pipelinePolicy.scaleGate500?.targetActiveRecipes) errors.push(`targetActiveRecipes ${plan.targetActiveRecipes} does not match Scale Gate 500 target ${pipelinePolicy.scaleGate500?.targetActiveRecipes}`);
  if (!plan.requireZeroReviewBacklog || !plan.requireGatePassAtCompletion) errors.push('controlled scale safeguards must stay enabled');
  const trancheIds = new Set(); const cellIds = new Set();
  let totalAccepted = 0;
  for (const tranche of plan.tranches || []) {
    if (trancheIds.has(tranche.trancheId)) errors.push(`duplicate trancheId ${tranche.trancheId}`); trancheIds.add(tranche.trancheId);
    const cellTotal = sum((tranche.cells || []).map(cell => cell.acceptedCount));
    if (cellTotal !== tranche.targetAcceptedCount) errors.push(`${tranche.trancheId} cell accepted total ${cellTotal} does not equal tranche target ${tranche.targetAcceptedCount}`);
    for (const cell of tranche.cells || []) {
      if (cellIds.has(cell.cellId)) errors.push(`duplicate cellId ${cell.cellId}`); cellIds.add(cell.cellId);
      const band = (corpusPolicy.energyBands || []).find(item => item.bandId === cell.energyBandId);
      if (!band) errors.push(`${cell.cellId} uses unknown energy band ${cell.energyBandId}`);
      const hardCell = (corpusPolicy.coverageTargets || []).find(target => (target.criteria || []).length === 2 && target.criteria.some(c => c.dimension === 'meal_archetype' && c.key === cell.mealArchetype) && target.criteria.some(c => c.dimension === 'energy_band' && c.key === cell.energyBandId));
      if (!hardCell && !['mini_meal'].includes(cell.mealArchetype)) errors.push(`${cell.cellId} does not map to a governed meal×energy coverage cell`);
    }
    totalAccepted += tranche.targetAcceptedCount;
  }
  if (plan.startMinimumActiveRecipes + totalAccepted !== plan.targetActiveRecipes) errors.push(`planned accepted total ${totalAccepted} does not bridge ${plan.startMinimumActiveRecipes} -> ${plan.targetActiveRecipes}`);
  return { valid: errors.length === 0, errors, plannedAcceptedCount: totalAccepted, trancheCount: (plan.tranches || []).length, cellCount: (plan.tranches || []).reduce((total, tranche) => total + (tranche.cells || []).length, 0) };
}

export function assertControlledScalePlan(plan, contract, corpusPolicy, pipelinePolicy, registry = null) {
  registry?.assert('controlledScalePlan', plan);
  const diagnostics = controlledScalePlanDiagnostics(plan, contract, corpusPolicy, pipelinePolicy);
  if (!diagnostics.valid) throw new Error(`Controlled scale plan validation failed: ${diagnostics.errors.join('; ')}`);
  return diagnostics;
}

export function hardCoverageAtGate({ snapshot, corpusPolicy, targetActiveRecipes, releaseReferenceRecipeCount }) {
  const byId = new Map((snapshot.coverageCells || []).map(cell => [cell.targetId, cell]));
  return (corpusPolicy.coverageTargets || [])
    .filter(target => target.hardForRelease && Number.isFinite(target.minCount))
    .map(target => {
      const requiredAtGate = Math.ceil(Number(target.minCount) * Number(targetActiveRecipes) / Number(releaseReferenceRecipeCount));
      const actual = byId.get(target.targetId)?.currentCount || 0;
      return { targetId: target.targetId, requiredAtGate, actual, deficit: Math.max(0, requiredAtGate - actual), status: actual >= requiredAtGate ? 'pass' : 'blocked' };
    });
}

export function controlledScaleCheckpoint({ plan, tranche, beforeSnapshot, afterSnapshot, gate, batchSummaries, corpusPolicy, pipelinePolicy, generatedAt = null }) {
  const accepted = sum(batchSummaries.map(item => item.accepted));
  const reviewBacklog = sum(batchSummaries.map(item => item.reviewBacklog));
  const rejected = sum(batchSummaries.map(item => item.rejected));
  const expectedAfter = beforeSnapshot.activeRecipeCount + tranche.targetAcceptedCount;
  const hardCoverage = hardCoverageAtGate({ snapshot: afterSnapshot, corpusPolicy, targetActiveRecipes: plan.targetActiveRecipes, releaseReferenceRecipeCount: pipelinePolicy.scaleGate500.releaseReferenceRecipeCount });
  const blockers = [];
  if (accepted !== tranche.targetAcceptedCount) blockers.push(`accepted=${accepted}, target=${tranche.targetAcceptedCount}`);
  if (reviewBacklog !== 0) blockers.push(`review-backlog=${reviewBacklog}`);
  if (afterSnapshot.activeRecipeCount !== expectedAfter) blockers.push(`active-recipes=${afterSnapshot.activeRecipeCount}, expected=${expectedAfter}`);
  if (afterSnapshot.quality.schemaErrors !== 0) blockers.push(`schema-errors=${afterSnapshot.quality.schemaErrors}`);
  if (afterSnapshot.quality.unknownIngredientReferences !== 0) blockers.push(`unknown-ingredient-references=${afterSnapshot.quality.unknownIngredientReferences}`);
  if (afterSnapshot.quality.nutritionErrors !== 0) blockers.push(`nutrition-errors=${afterSnapshot.quality.nutritionErrors}`);
  if (afterSnapshot.quality.allergenDerivationErrors !== 0) blockers.push(`allergen-errors=${afterSnapshot.quality.allergenDerivationErrors}`);
  if (afterSnapshot.quality.missingRequiredLocaleFields !== 0) blockers.push(`locale-errors=${afterSnapshot.quality.missingRequiredLocaleFields}`);
  if (afterSnapshot.similarity.exactDuplicateCount !== 0) blockers.push(`exact-duplicates=${afterSnapshot.similarity.exactDuplicateCount}`);
  if (afterSnapshot.similarity.nearDuplicateCount !== 0) blockers.push(`near-duplicates=${afterSnapshot.similarity.nearDuplicateCount}`);
  return {
    schemaVersion: 1,
    planId: plan.planId,
    planVersion: plan.planVersion,
    trancheId: tranche.trancheId,
    generatedAt: generatedAt || new Date().toISOString(),
    beforeActiveRecipes: beforeSnapshot.activeRecipeCount,
    afterActiveRecipes: afterSnapshot.activeRecipeCount,
    targetAcceptedCount: tranche.targetAcceptedCount,
    accepted,
    rejected,
    reviewBacklog,
    gateStatus: gate.status,
    quality: afterSnapshot.quality,
    similarity: afterSnapshot.similarity,
    hardCoverageRemaining: hardCoverage.filter(item => item.status === 'blocked'),
    batchSummaries,
    status: blockers.length ? 'blocked' : 'pass',
    blockers: unique(blockers)
  };
}
