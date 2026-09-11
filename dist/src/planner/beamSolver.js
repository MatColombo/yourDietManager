import { sumNutrition, nutritionPenalty, energyToleranceWindow, energyDistanceFromWindow } from './planMath.js';
import { seededTie } from './seededRandom.js';
import { families, cuisines, primaryIngredientId } from './recipeFeatures.js';
import { PLANNER_SOFT_OBJECTIVE_POLICY, slotOptionSoftContribution } from './qualityPolicy.js';

function keyOf(recipes) { return recipes.map(r => r.recipeVersionId).sort().join('+'); }
function energyOfOption(option) { return Number(option?.nutrition?.energyKcal || 0); }

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

function pushUnique(target, seen, values, limit, key) {
  for (const value of values) {
    if (target.length >= limit) break;
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id); target.push(value);
  }
}

function energyQuantiles(values, count, getter) {
  if (!values.length || count <= 0) return [];
  const sorted = [...values].sort((a, b) => getter(a) - getter(b));
  if (count === 1) return [sorted[Math.floor((sorted.length - 1) / 2)]];
  const out = [];
  for (let index = 0; index < count; index += 1) out.push(sorted[Math.round(index * (sorted.length - 1) / (count - 1))]);
  return out;
}

export function selectCandidateFrontier(scoredCandidates, { targetEnergy, limit = 20 } = {}) {
  if (scoredCandidates.length <= limit) return [...scoredCandidates];
  const bySoft = [...scoredCandidates].sort((a, b) => a.score.total - b.score.total || a.tie - b.tie || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  const byTarget = [...scoredCandidates].sort((a, b) => Math.abs(Number(a.recipe.calculatedNutrition?.energyKcal || 0) - targetEnergy) - Math.abs(Number(b.recipe.calculatedNutrition?.energyKcal || 0) - targetEnergy) || a.score.total - b.score.total);
  const selected = []; const seen = new Set(); const key = item => item.recipe.recipeVersionId;
  const softQuota = Math.max(1, Math.floor(limit * 0.4));
  const targetQuota = Math.max(1, Math.floor(limit * 0.2));
  const energyQuota = Math.max(2, limit - softQuota - targetQuota);
  pushUnique(selected, seen, bySoft.slice(0, softQuota), limit, key);
  pushUnique(selected, seen, byTarget.slice(0, targetQuota), limit, key);
  pushUnique(selected, seen, energyQuantiles(scoredCandidates, energyQuota, item => Number(item.recipe.calculatedNutrition?.energyKcal || 0)), limit, key);
  pushUnique(selected, seen, bySoft, limit, key);
  return selected;
}

function selectOptionFrontier(options, { targetEnergy, limit }) {
  const sorted = [...options].sort((a, b) => a.score - b.score || a.tie - b.tie || keyOf(a.recipes).localeCompare(keyOf(b.recipes)));
  if (sorted.length <= limit) return sorted;
  const selected = []; const seen = new Set(); const key = option => keyOf(option.recipes);
  const softQuota = Math.max(1, Math.floor(limit * 0.35));
  const targetQuota = Math.max(1, Math.floor(limit * 0.25));
  const energyQuota = Math.max(2, limit - softQuota - targetQuota);
  const byTarget = [...sorted].sort((a, b) => Math.abs(energyOfOption(a) - targetEnergy) - Math.abs(energyOfOption(b) - targetEnergy) || a.score - b.score);
  pushUnique(selected, seen, sorted.slice(0, softQuota), limit, key);
  pushUnique(selected, seen, byTarget.slice(0, targetQuota), limit, key);
  pushUnique(selected, seen, energyQuantiles(sorted, energyQuota, energyOfOption), limit, key);
  pushUnique(selected, seen, sorted, limit, key);
  return selected.sort((a, b) => a.score - b.score || a.tie - b.tie || keyOf(a.recipes).localeCompare(keyOf(b.recipes)));
}

export function buildSlotOptions(scoredCandidates, { targetEnergy, dayEnergyTarget, nutritionProfile, maxComponents = 3, optionLimit = 40, seed = 'seed' }) {
  const candidates = scoredCandidates;
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
        const nutrientTargetFactor = targetEnergy / Math.max(1, dayEnergyTarget);
        const slotNutrition = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: targetEnergy, energyWeight: 2.2, nutrientTargetFactor: nutrientTargetFactor });
        const softParts = recipes.reduce((aggregate, recipe) => {
          const scored = scoredCandidates.find(item => item.recipe.recipeVersionId === recipe.recipeVersionId)?.score;
          const contribution = slotOptionSoftContribution(scored);
          aggregate.total += contribution.total;
          for (const [key, value] of Object.entries(contribution.components)) aggregate.components[key] += value;
          return aggregate;
        }, { total: 0, components: { nutritionTieBreak: 0, preference: 0, variety: 0, regeneration: 0 } });
        const componentPenalty = (recipes.length - 1) * PLANNER_SOFT_OBJECTIVE_POLICY.slotOption.extraComponentPenalty;
        const score = slotNutrition + softParts.total + componentPenalty;
        const entry = { recipes, nutrition, score, scoreComponents: { slotNutrition, ...softParts.components, componentPenalty }, tie: seededTie(seed, keyOf(recipes)) };
        next.push(entry); options.push(entry);
      }
    }
    next.sort((a, b) => a.score - b.score || a.tie - b.tie || keyOf(a.recipes).localeCompare(keyOf(b.recipes)));
    // Preserve enough construction breadth for 3-component options; the final frontier applies optionLimit.
    states = next.slice(0, Math.max(optionLimit * 3, 120));
  }
  const dedup = new Map();
  for (const option of options) {
    const key = keyOf(option.recipes); const current = dedup.get(key);
    if (!current || option.score < current.score) dedup.set(key, option);
  }
  return selectOptionFrontier([...dedup.values()], { targetEnergy, limit: optionLimit });
}

function remainingEnergyBounds(slotPlans) {
  const bounds = Array(slotPlans.length + 1).fill(null).map(() => ({ min: 0, max: 0 }));
  for (let index = slotPlans.length - 1; index >= 0; index -= 1) {
    const energies = slotPlans[index].options.map(energyOfOption);
    bounds[index] = {
      min: bounds[index + 1].min + Math.min(...energies),
      max: bounds[index + 1].max + Math.max(...energies)
    };
  }
  return bounds;
}

function intervalDistance(value, min, max) {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function nearestBoundedEnergy(bounds, window) {
  if (bounds.min > window.plannedMaxKcal) return { energyKcal: bounds.min, distanceKcal: Math.round((bounds.min - window.plannedMaxKcal) * 10) / 10 };
  if (bounds.max < window.plannedMinKcal) return { energyKcal: bounds.max, distanceKcal: Math.round((window.plannedMinKcal - bounds.max) * 10) / 10 };
  return { energyKcal: null, distanceKcal: null };
}

export function solveDayBeam(slotPlans, { dayEnergyTarget, externalEnergy = 0, nutritionProfile, beamWidth = 100, seed = 'seed' }) {
  const window = energyToleranceWindow(dayEnergyTarget, nutritionProfile.energyTolerancePct, externalEnergy);
  const bounds = remainingEnergyBounds(slotPlans);
  let beam = [{ slots: [], recipes: [], partialScore: 0, tie: 0, energyKcal: 0 }];
  let hardPrunedStates = 0;
  for (let slotIndex = 0; slotIndex < slotPlans.length; slotIndex += 1) {
    const slot = slotPlans[slotIndex];
    const remaining = bounds[slotIndex + 1];
    const expanded = [];
    for (const state of beam) for (const option of slot.options) {
      const slots = [...state.slots, { slot, option }];
      const recipes = [...state.recipes, ...option.recipes];
      const energyKcal = state.energyKcal + energyOfOption(option);
      const reachableMin = energyKcal + remaining.min;
      const reachableMax = energyKcal + remaining.max;
      if (reachableMax < window.plannedMinKcal - 1e-9 || reachableMin > window.plannedMaxKcal + 1e-9) { hardPrunedStates += 1; continue; }
      const partialScore = state.partialScore + option.score + intraDayRepetitionPenalty(state.recipes, option.recipes);
      const key = slots.map(item => `${item.slot.id}:${item.option.recipes.map(r => r.recipeVersionId).join('+')}`).join('|');
      const optimisticTargetDistance = intervalDistance(window.plannedTargetKcal, reachableMin, reachableMax);
      expanded.push({ slots, recipes, partialScore, tie: seededTie(seed, key), energyKcal, optimisticTargetDistance });
    }
    expanded.sort((a, b) => a.optimisticTargetDistance - b.optimisticTargetDistance || a.partialScore - b.partialScore || a.tie - b.tie);
    beam = expanded.slice(0, beamWidth);
    if (!beam.length) {
      const nearest = nearestBoundedEnergy(bounds[0], window);
      return { solution: null, diagnostics: { code: 'energy_window_unreachable_in_bounded_search', proof: 'bounded_search', window, evaluatedFinalists: 0, feasibleFinalists: 0, nearestPlannedEnergyKcal: nearest.energyKcal, nearestDistanceKcal: nearest.distanceKcal, hardPrunedStates, beamWidth } };
    }
  }

  const nutrientTargetFactor = window.plannedTargetKcal / Math.max(1, dayEnergyTarget);
  const finalists = beam.map(state => {
    const nutrition = sumNutrition(state.recipes);
    const daily = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: window.plannedTargetKcal, energyWeight: 4, nutrientTargetFactor: nutrientTargetFactor });
    const distance = energyDistanceFromWindow(nutrition.energyKcal, window);
    return { ...state, nutrition, dailyScore: daily, score: state.partialScore + daily, energyDistanceKcal: distance };
  });
  finalists.sort((a, b) => a.energyDistanceKcal - b.energyDistanceKcal || a.score - b.score || a.tie - b.tie);
  const feasible = finalists.filter(item => item.energyDistanceKcal === 0);
  feasible.sort((a, b) => a.score - b.score || a.tie - b.tie);
  const nearest = finalists[0] || null;
  return {
    solution: feasible[0] || null,
    diagnostics: {
      code: feasible.length ? 'feasible' : 'energy_window_unreachable_in_bounded_search',
      proof: feasible.length ? 'feasible_solution' : 'bounded_search',
      window,
      evaluatedFinalists: finalists.length,
      feasibleFinalists: feasible.length,
      nearestPlannedEnergyKcal: nearest?.nutrition?.energyKcal ?? null,
      nearestDistanceKcal: nearest?.energyDistanceKcal ?? null,
      hardPrunedStates,
      beamWidth
    }
  };
}
