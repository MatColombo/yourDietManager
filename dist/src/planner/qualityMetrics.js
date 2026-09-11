import { families, primaryIngredientId } from './recipeFeatures.js';

function daysApart(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

function overlaps(a = [], b = []) {
  const set = new Set(a);
  return b.some(value => set.has(value));
}

export function plannerQualityMetrics(calendarDays = [], recipeByVersionId = new Map()) {
  const occurrences = [];
  for (const day of calendarDays) {
    for (const slot of day.mealSlots || []) {
      if (slot.mode !== 'planned') continue;
      for (const component of slot.recipeComponents || []) {
        const recipe = recipeByVersionId.get(component.recipeVersionId);
        if (!recipe) continue;
        occurrences.push({ date: day.date, time: slot.time || '', mealOccurrenceId: slot.mealOccurrenceId, recipe });
      }
    }
  }
  occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.mealOccurrenceId.localeCompare(b.mealOccurrenceId));

  let exactRepeatPairsWithin3Days = 0;
  let exactRepeatPairsWithin7Days = 0;
  let samePrimaryPairsWithin3Days = 0;
  let sameFamilyPairsWithin3Days = 0;
  let adjacentSamePrimary = 0;
  for (let i = 0; i < occurrences.length; i += 1) {
    const current = occurrences[i];
    const currentPrimary = primaryIngredientId(current.recipe);
    if (i > 0) {
      const previousPrimary = primaryIngredientId(occurrences[i - 1].recipe);
      if (currentPrimary && previousPrimary && currentPrimary === previousPrimary) adjacentSamePrimary += 1;
    }
    for (let j = 0; j < i; j += 1) {
      const previous = occurrences[j];
      const delta = daysApart(previous.date, current.date);
      if (delta < 0 || delta > 7) continue;
      if (current.recipe.recipeId === previous.recipe.recipeId) {
        if (delta <= 3) exactRepeatPairsWithin3Days += 1;
        exactRepeatPairsWithin7Days += 1;
      }
      if (delta <= 3) {
        const previousPrimary = primaryIngredientId(previous.recipe);
        if (currentPrimary && previousPrimary && currentPrimary === previousPrimary) samePrimaryPairsWithin3Days += 1;
        if (overlaps(families(current.recipe), families(previous.recipe))) sameFamilyPairsWithin3Days += 1;
      }
    }
  }

  const uniqueRecipeCount = new Set(occurrences.map(item => item.recipe.recipeVersionId)).size;
  const recipeComponentCount = occurrences.length;
  const plannedMealCount = calendarDays.reduce((sum, day) => sum + (day.mealSlots || []).filter(slot => slot.mode === 'planned').length, 0);
  const multiRecipeMealCount = calendarDays.reduce((sum, day) => sum + (day.mealSlots || []).filter(slot => slot.mode === 'planned' && (slot.recipeComponents || []).length > 1).length, 0);
  const averageDaily = key => calendarDays.length
    ? Math.round(calendarDays.reduce((sum, day) => sum + Number(day.nutritionSummary?.knownPlanned?.[key] || 0), 0) / calendarDays.length * 10) / 10
    : 0;

  return {
    plannedMealCount,
    recipeComponentCount,
    uniqueRecipeCount,
    uniqueRecipeRate: recipeComponentCount ? Math.round(uniqueRecipeCount / recipeComponentCount * 1000) / 1000 : 0,
    exactRepeatPairsWithin3Days,
    exactRepeatPairsWithin7Days,
    samePrimaryPairsWithin3Days,
    sameFamilyPairsWithin3Days,
    adjacentSamePrimary,
    multiRecipeMealCount,
    averageDailyProteinG: averageDaily('proteinG'),
    averageDailyFiberG: averageDaily('fiberG')
  };
}
