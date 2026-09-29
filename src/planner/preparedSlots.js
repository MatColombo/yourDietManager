import { filterCandidates } from './hardFilter.js';
import { scoreRecipeStatic } from './softScoring.js';
import { telemetryAddTime, telemetryIncrement } from './plannerTelemetry.js';

export function preparedSlotKey(date, slotId) { return `${date}|${slotId}`; }

export function slotEnergyTarget(slot, mealClass, dayEnergyTarget) {
  if (slot.energyBudgetKcal != null) return Number(slot.energyBudgetKcal);
  if (slot.energyShare != null) return dayEnergyTarget * Number(slot.energyShare);
  if (mealClass.energyShare?.target != null) return dayEnergyTarget * Number(mealClass.energyShare.target);
  return dayEnergyTarget * 0.2;
}

export function prepareStaticSlot({ date, slot, mealClass, dayClass, dayEnergyTarget, sourceCandidates, contextBase, telemetry = null }) {
  const targetEnergy = slotEnergyTarget(slot, mealClass, dayEnergyTarget);
  const context = { ...contextBase, mealClass, dayClass, date, slotEnergyTarget: targetEnergy, dayEnergyTarget };
  const filterStarted = performance.now();
  const filtered = filterCandidates(sourceCandidates, context);
  telemetryAddTime(telemetry, 'candidateFilterMs', performance.now() - filterStarted);
  telemetryIncrement(telemetry, 'preparedSlots');
  telemetryIncrement(telemetry, 'preparedCandidates', filtered.accepted.length);

  const staticScores = new Map();
  const scoringStarted = performance.now();
  for (const recipe of filtered.accepted) staticScores.set(recipe.recipeVersionId, scoreRecipeStatic(recipe, context));
  telemetryAddTime(telemetry, 'staticScoringMs', performance.now() - scoringStarted);

  return {
    date,
    slotId: slot.id,
    targetEnergy,
    sourceCandidates,
    acceptedCandidates: filtered.accepted,
    rejectionCounts: filtered.rejectionCounts,
    staticScores
  };
}
