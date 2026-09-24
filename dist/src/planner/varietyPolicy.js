export const VARIETY_MODES = Object.freeze({
  maximum: 'maximum_variety',
  perishables: 'perishable_proximity',
  none: 'none'
});

export const DEFAULT_PLANNER_POLICY = Object.freeze({ varietyMode: VARIETY_MODES.maximum });

const MODE_POLICY = Object.freeze({
  [VARIETY_MODES.maximum]: Object.freeze({
    exactRecipeGapDays: 14,
    varietyWindows: Object.freeze([
      Object.freeze({ days: 3, recipe: 120, family: 8, primary: 9, ingredient: 3.5, category: 1.2, cuisine: 0.4 }),
      Object.freeze({ days: 7, recipe: 60, family: 4, primary: 4.5, ingredient: 1.75, category: 0.5, cuisine: 0.2 }),
      Object.freeze({ days: 14, recipe: 20, family: 1.2, primary: 1.5, ingredient: 0.6, category: 0.15, cuisine: 0.05 })
    ]),
    perishableWindowDays: 0,
    perishableOverlapReward: 0
  }),
  [VARIETY_MODES.perishables]: Object.freeze({
    exactRecipeGapDays: 4,
    varietyWindows: Object.freeze([
      Object.freeze({ days: 3, recipe: 45, family: 1.5, primary: 1.5, ingredient: 0, category: 0.15, cuisine: 0 }),
      Object.freeze({ days: 7, recipe: 12, family: 0.4, primary: 0.4, ingredient: 0, category: 0.05, cuisine: 0 })
    ]),
    perishableWindowDays: 2,
    perishableOverlapReward: 2.25
  }),
  [VARIETY_MODES.none]: Object.freeze({
    exactRecipeGapDays: 0,
    varietyWindows: Object.freeze([]),
    perishableWindowDays: 0,
    perishableOverlapReward: 0
  })
});

export function plannerPolicy(profile) {
  const requested = profile?.schemaVersion === 2 ? profile.plannerPolicy?.varietyMode : null;
  const varietyMode = Object.values(VARIETY_MODES).includes(requested) ? requested : DEFAULT_PLANNER_POLICY.varietyMode;
  return { ...MODE_POLICY[varietyMode], varietyMode };
}

function dateMillis(value) { return new Date(`${value}T00:00:00Z`).getTime(); }
function withinDays(entryDate, currentDate, days) {
  if (!days || entryDate >= currentDate) return false;
  return dateMillis(entryDate) >= dateMillis(currentDate) - days * 86400000;
}

export function filterRecipeCandidatesForVariety(candidates, history, date, profile) {
  const policy = plannerPolicy(profile);
  if (!policy.exactRecipeGapDays) return { candidates, excludedCount: 0, fallbackUsed: false, policy };
  const recentRecipeIds = new Set((history || []).filter(entry => withinDays(entry.date, date, policy.exactRecipeGapDays)).map(entry => entry.recipe?.recipeId).filter(Boolean));
  const filtered = (candidates || []).filter(recipe => !recentRecipeIds.has(recipe.recipeId));
  if (!filtered.length) return { candidates, excludedCount: 0, fallbackUsed: true, policy };
  return { candidates: filtered, excludedCount: candidates.length - filtered.length, fallbackUsed: false, policy };
}
