export const PLANNER_SOFT_OBJECTIVE_POLICY = Object.freeze({
  version: 'phase-f-soft-objective-1',
  slotOption: Object.freeze({
    perRecipeNutritionTieBreakWeight: 0.15,
    preferenceWeight: 1,
    varietyWeight: 1,
    regenerationWeight: 1,
    extraComponentPenalty: 0.5
  }),
  varietyWindows: Object.freeze([
    Object.freeze({ days: 3, recipe: 24, family: 3.5, primary: 3, category: 0.9, cuisine: 0.7 }),
    Object.freeze({ days: 7, recipe: 12, family: 1.5, primary: 1.2, category: 0.35, cuisine: 0.25 }),
    Object.freeze({ days: 14, recipe: 3, family: 0.4, primary: 0.35, category: 0.1, cuisine: 0.08 })
  ]),
  qualityAcceptance: Object.freeze({
    horizonDays: 14,
    minUniqueRecipeRate: 0.6,
    maxExactRepeatPairsWithin3Days: 0
  })
});

export function slotOptionSoftContribution(score = {}) {
  const weights = PLANNER_SOFT_OBJECTIVE_POLICY.slotOption;
  const components = score.components || {};
  const nutritionTieBreak = Number(components.nutrition || 0) * weights.perRecipeNutritionTieBreakWeight;
  const preference = Number(components.preference || 0) * weights.preferenceWeight;
  const variety = Number(components.variety || 0) * weights.varietyWeight;
  const regeneration = Number(components.regeneration || 0) * weights.regenerationWeight;
  return {
    total: nutritionTieBreak + preference + variety + regeneration,
    components: { nutritionTieBreak, preference, variety, regeneration }
  };
}
