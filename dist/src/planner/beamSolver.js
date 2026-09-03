import { sumNutrition, nutritionPenalty } from './planMath.js';
import { seededTie } from './seededRandom.js';
import { families, cuisines, primaryIngredientId } from './recipeFeatures.js';

function keyOf(recipes) { return recipes.map(r => r.recipeVersionId).sort().join('+'); }

function overlapCount(a, b) { const set = new Set(a); return b.filter(value => set.has(value)).length; }
function intraDayRepetitionPenalty(existing, added) {
  let penalty = 0;
  for (const recipe of added) for (const prior of existing) {
    if (recipe.recipeId === prior.recipeId) penalty += 10;
    penalty += overlapCount(families(recipe), families(prior)) * 2;
    penalty += overlapCount(cuisines(recipe), cuisines(prior)) * 0.5;
    if (primaryIngredientId(recipe) && primaryIngredientId(recipe) === primaryIngredientId(prior)) penalty += 1.5;
  }
  return penalty;
}

export function buildSlotOptions(scoredCandidates, { targetEnergy, dayEnergyTarget, nutritionProfile, maxComponents = 3, optionLimit = 40, seed = 'seed' }) {
  const candidates = scoredCandidates.slice(0, 14);
  let states = [{ recipes: [], score: 0 }];
  const options = [];
  for (let depth = 1; depth <= maxComponents; depth += 1) {
    const next = [];
    for (const state of states) {
      const lastIndex = state.recipes.length ? candidates.findIndex(item => item.recipe.recipeVersionId === state.recipes.at(-1).recipeVersionId) : -1;
      for (let index = lastIndex + 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (state.recipes.some(recipe => recipe.recipeVersionId === candidate.recipe.recipeVersionId)) continue;
        const recipes = [...state.recipes, candidate.recipe];
        const nutrition = sumNutrition(recipes);
        const scale = targetEnergy / Math.max(1, dayEnergyTarget);
        const slotNutrition = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: targetEnergy, energyWeight: 2.2, nutrientScale: scale });
        const individual = recipes.reduce((total, recipe) => total + (scoredCandidates.find(item => item.recipe.recipeVersionId === recipe.recipeVersionId)?.score.total || 0) * 0.15, 0);
        const score = slotNutrition + individual + (recipes.length - 1) * 0.5;
        const entry = { recipes, nutrition, score, tie: seededTie(seed, keyOf(recipes)) };
        next.push(entry); options.push(entry);
      }
    }
    next.sort((a, b) => a.score - b.score || a.tie - b.tie || keyOf(a.recipes).localeCompare(keyOf(b.recipes)));
    states = next.slice(0, optionLimit);
  }
  const dedup = new Map();
  for (const option of options) {
    const key = keyOf(option.recipes); const current = dedup.get(key);
    if (!current || option.score < current.score) dedup.set(key, option);
  }
  return [...dedup.values()].sort((a, b) => a.score - b.score || a.tie - b.tie || keyOf(a.recipes).localeCompare(keyOf(b.recipes))).slice(0, optionLimit);
}

export function solveDayBeam(slotPlans, { dayEnergyTarget, plannedEnergyTarget, nutritionProfile, beamWidth = 100, seed = 'seed' }) {
  let beam = [{ slots: [], recipes: [], partialScore: 0, tie: 0 }];
  for (const slot of slotPlans) {
    const expanded = [];
    for (const state of beam) for (const option of slot.options) {
      const slots = [...state.slots, { slot, option }];
      const recipes = [...state.recipes, ...option.recipes];
      const partialScore = state.partialScore + option.score + intraDayRepetitionPenalty(state.recipes, option.recipes);
      const key = slots.map(item => `${item.slot.id}:${item.option.recipes.map(r => r.recipeVersionId).join('+')}`).join('|');
      expanded.push({ slots, recipes, partialScore, tie: seededTie(seed, key) });
    }
    expanded.sort((a, b) => a.partialScore - b.partialScore || a.tie - b.tie);
    beam = expanded.slice(0, beamWidth);
    if (!beam.length) return null;
  }
  const scale = plannedEnergyTarget / Math.max(1, dayEnergyTarget);
  const finalists = beam.map(state => {
    const nutrition = sumNutrition(state.recipes);
    const daily = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: plannedEnergyTarget, energyWeight: 4, nutrientScale: scale });
    return { ...state, nutrition, dailyScore: daily, score: state.partialScore + daily };
  });
  finalists.sort((a, b) => a.score - b.score || a.tie - b.tie);
  return finalists[0] || null;
}
