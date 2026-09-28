import { sumNutrition, nutritionPenalty, energyToleranceWindow, energyDistanceFromWindow } from './planMath.js';
import { seededTie } from './seededRandom.js';
import { families, cuisines, primaryIngredientId, ingredientIds } from './recipeFeatures.js';
import { PLANNER_SOFT_OBJECTIVE_POLICY, slotOptionSoftContribution } from './qualityPolicy.js';
import { explorationProfile, exploratoryScore, quotaCounts, recipeFeatureSignature, seededExposureOrder } from './explorationPolicy.js';
import { VARIETY_MODES } from './varietyPolicy.js';

function keyOf(recipes) { return recipes.map(r => r.recipeVersionId).sort().join('+'); }
function energyOfOption(option) { return Number(option?.nutrition?.energyKcal || 0); }
function exploratoryRank(score, seed, key, amplitude) { return exploratoryScore(score, seed, key, amplitude); }

function overlapCount(a, b) { const set = new Set(a); return b.filter(value => set.has(value)).length; }
function exactRecipeRepeatCount(existing, added) {
  let count = 0;
  for (const recipe of added) for (const prior of existing) if (recipe.recipeId === prior.recipeId) count += 1;
  return count;
}
function intraDayRepetitionPenalty(existing, added, varietyMode) {
  if (varietyMode === VARIETY_MODES.none) return 0;
  const weights = varietyMode === VARIETY_MODES.perishables
    ? { recipe: 60, family: 1, cuisine: 0.15, primary: 0.75, ingredient: 0 }
    : { recipe: 180, family: 5, cuisine: 0.5, primary: 4, ingredient: 7 };
  let penalty = 0;
  for (const recipe of added) for (const prior of existing) {
    if (recipe.recipeId === prior.recipeId) penalty += weights.recipe;
    penalty += overlapCount(families(recipe), families(prior)) * weights.family;
    penalty += overlapCount(cuisines(recipe), cuisines(prior)) * weights.cuisine;
    penalty += overlapCount(ingredientIds(recipe), ingredientIds(prior)) * weights.ingredient;
    if (primaryIngredientId(recipe) && primaryIngredientId(recipe) === primaryIngredientId(prior)) penalty += weights.primary;
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

export function selectCandidateFrontier(scoredCandidates, { targetEnergy, limit = 32, requiredMatches = [], seed = 'seed', explorationKey = 'slot' } = {}) {
  const profile = explorationProfile(seed, `candidate-frontier|${explorationKey}`);
  const key = item => item.recipe.recipeVersionId;
  const byQuality = [...scoredCandidates].sort((a, b) => a.score.total - b.score.total || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  const byTarget = [...scoredCandidates].sort((a, b) => Math.abs(Number(a.recipe.calculatedNutrition?.energyKcal || 0) - targetEnergy) - Math.abs(Number(b.recipe.calculatedNutrition?.energyKcal || 0) - targetEnergy) || a.score.total - b.score.total || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  const byRandom = seededExposureOrder(scoredCandidates, `${seed}|${explorationKey}|candidate-random`, key);
  if (scoredCandidates.length <= limit) return seededExposureOrder(scoredCandidates, `${seed}|${explorationKey}|candidate-order`, key);

  const selected = []; const seen = new Set();
  for (const match of requiredMatches) {
    pushUnique(selected, seen, byQuality.filter(item => match(item.recipe)).slice(0, 1), limit, key);
    pushUnique(selected, seen, byQuality.filter(item => !match(item.recipe)).slice(0, 1), limit, key);
  }

  const remainingLimit = Math.max(0, limit - selected.length);
  const quotas = quotaCounts(remainingLimit, profile);
  const featureGroups = new Map();
  for (const item of byRandom) {
    const signature = recipeFeatureSignature(item.recipe);
    if (!featureGroups.has(signature)) featureGroups.set(signature, []);
    featureGroups.get(signature).push(item);
  }
  const featureRepresentatives = seededExposureOrder([...featureGroups.entries()], `${seed}|${explorationKey}|feature-groups`, entry => entry[0]).map(([, items]) => items[0]);

  // Random exposure is deliberately reserved first: every hard-feasible recipe has
  // a non-zero, seed-dependent path into the bounded frontier.
  pushUnique(selected, seen, byRandom.slice(0, quotas.random), limit, key);
  pushUnique(selected, seen, featureRepresentatives.slice(0, quotas.feature), limit, key);
  pushUnique(selected, seen, byQuality.slice(0, quotas.quality), limit, key);
  pushUnique(selected, seen, byTarget.slice(0, quotas.target), limit, key);
  pushUnique(selected, seen, byRandom, limit, key);
  pushUnique(selected, seen, byQuality, limit, key);
  return selected;
}

function selectOptionFrontier(options, { targetEnergy, limit, signatureFor = null, seed = 'seed' }) {
  const profile = explorationProfile(seed, 'option-frontier');
  const key = option => keyOf(option.recipes);
  const byQuality = [...options].sort((a, b) => a.score - b.score || key(a).localeCompare(key(b)));
  const byTarget = [...options].sort((a, b) => Math.abs(energyOfOption(a) - targetEnergy) - Math.abs(energyOfOption(b) - targetEnergy) || a.score - b.score || key(a).localeCompare(key(b)));
  const byRandom = seededExposureOrder(options, `${seed}|option-random`, key);
  if (options.length <= limit) return [...options].sort((a, b) => exploratoryRank(a.score, seed, key(a), profile.scoreJitter) - exploratoryRank(b.score, seed, key(b), profile.scoreJitter) || a.score - b.score || key(a).localeCompare(key(b)));

  const selected = []; const seen = new Set();
  if (signatureFor) {
    const signatures = new Set();
    for (const option of byRandom) {
      const signature = signatureFor(option.recipes);
      if (!signatures.has(signature)) { signatures.add(signature); pushUnique(selected, seen, [option], limit, key); }
    }
  }
  const remainingLimit = Math.max(0, limit - selected.length);
  const quotas = quotaCounts(remainingLimit, profile);
  pushUnique(selected, seen, byRandom.slice(0, quotas.random), limit, key);
  pushUnique(selected, seen, energyQuantiles(byRandom, quotas.feature, energyOfOption), limit, key);
  pushUnique(selected, seen, byQuality.slice(0, quotas.quality), limit, key);
  pushUnique(selected, seen, byTarget.slice(0, quotas.target), limit, key);
  pushUnique(selected, seen, byRandom, limit, key);
  pushUnique(selected, seen, byQuality, limit, key);
  return selected.sort((a, b) => exploratoryRank(a.score, seed, key(a), profile.scoreJitter) - exploratoryRank(b.score, seed, key(b), profile.scoreJitter) || a.score - b.score || key(a).localeCompare(key(b)));
}

export function buildSlotOptions(scoredCandidates, { targetEnergy, dayEnergyTarget, nutritionProfile, maxComponents = 3, optionLimit = 40, seed = 'seed', signatureFor = null }) {
  const profile = explorationProfile(seed, 'slot-options');
  const candidates = seededExposureOrder(scoredCandidates, `${seed}|option-construction`, item => item.recipe.recipeVersionId);
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
        }, { total: 0, components: { nutritionTieBreak: 0, preference: 0, variety: 0, regeneration: 0, tuning: 0 } });
        const componentPenalty = (recipes.length - 1) * PLANNER_SOFT_OBJECTIVE_POLICY.slotOption.extraComponentPenalty;
        const score = slotNutrition + softParts.total + componentPenalty;
        const entry = { recipes, nutrition, score, scoreComponents: { slotNutrition, ...softParts.components, componentPenalty }, tie: seededTie(seed, keyOf(recipes)) };
        next.push(entry); options.push(entry);
      }
    }
    next.sort((a, b) => exploratoryRank(a.score, seed, keyOf(a.recipes), profile.scoreJitter) - exploratoryRank(b.score, seed, keyOf(b.recipes), profile.scoreJitter) || a.score - b.score || keyOf(a.recipes).localeCompare(keyOf(b.recipes)));
    // Preserve enough construction breadth for 3-component options; the final frontier applies optionLimit.
    states = next.slice(0, Math.max(optionLimit * 3, 120));
  }
  const dedup = new Map();
  for (const option of options) {
    const key = keyOf(option.recipes); const current = dedup.get(key);
    if (!current || option.score < current.score) dedup.set(key, option);
  }
  return selectOptionFrontier([...dedup.values()], { targetEnergy, limit: optionLimit, signatureFor, seed });
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

export function solveDayBeam(slotPlans, { dayEnergyTarget, externalEnergy = 0, nutritionProfile, beamWidth = 100, seed = 'seed', evaluateState = null, onProgress = null, varietyMode = VARIETY_MODES.maximum }) {
  const exploration = explorationProfile(seed, 'day-beam');
  const window = energyToleranceWindow(dayEnergyTarget, nutritionProfile.energyTolerancePct, externalEnergy);
  const bounds = remainingEnergyBounds(slotPlans);
  let beam = [{ slots: [], recipes: [], partialScore: 0, tie: 0, energyKcal: 0, exactRecipeRepeats: 0 }];
  let hardPrunedStates = 0;
  let energyPrunedStates = 0;
  let frequencyPrunedStates = 0;
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
      if (reachableMax < window.plannedMinKcal - 1e-9 || reachableMin > window.plannedMaxKcal + 1e-9) { hardPrunedStates += 1; energyPrunedStates += 1; continue; }
      const frequency = evaluateState?.(slots, slotIndex + 1);
      if (frequency && !frequency.valid) { hardPrunedStates += 1; frequencyPrunedStates += 1; continue; }
      const frequencyPenalty = frequency?.idealPenalty || 0;
      const exactRecipeRepeats = state.exactRecipeRepeats + exactRecipeRepeatCount(state.recipes, option.recipes);
      const partialScore = state.partialScore + option.score + intraDayRepetitionPenalty(state.recipes, option.recipes, varietyMode);
      const key = slots.map(item => `${item.slot.id}:${item.option.recipes.map(r => r.recipeVersionId).join('+')}`).join('|');
      const optimisticTargetDistance = intervalDistance(window.plannedTargetKcal, reachableMin, reachableMax);
      expanded.push({ slots, recipes, partialScore, frequencyPenalty, tie: seededTie(seed, key), energyKcal, optimisticTargetDistance, exactRecipeRepeats });
    }
    expanded.sort((a, b) => a.optimisticTargetDistance - b.optimisticTargetDistance || ((varietyMode === VARIETY_MODES.none ? 0 : a.exactRecipeRepeats) - (varietyMode === VARIETY_MODES.none ? 0 : b.exactRecipeRepeats)) || exploratoryRank(a.partialScore + (a.frequencyPenalty || 0), seed, a.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) - exploratoryRank(b.partialScore + (b.frequencyPenalty || 0), seed, b.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) || a.partialScore - b.partialScore);
    beam = expanded.slice(0, beamWidth);
    onProgress?.({ completed: slotIndex + 1, total: slotPlans.length });
    if (!beam.length) {
      const nearest = nearestBoundedEnergy(bounds[0], window);
      const code = frequencyPrunedStates > 0
        ? (energyPrunedStates > 0 ? 'frequency_and_energy_frontier_exhausted' : 'frequency_frontier_exhausted')
        : 'energy_window_unreachable_in_bounded_search';
      return { solution: null, diagnostics: { code, proof: 'bounded_search', window, evaluatedFinalists: 0, feasibleFinalists: 0, nearestPlannedEnergyKcal: nearest.energyKcal, nearestDistanceKcal: nearest.distanceKcal, hardPrunedStates, energyPrunedStates, frequencyPrunedStates, beamWidth } };
    }
  }

  const nutrientTargetFactor = window.plannedTargetKcal / Math.max(1, dayEnergyTarget);
  const finalists = beam.map(state => {
    const nutrition = sumNutrition(state.recipes);
    const daily = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: window.plannedTargetKcal, energyWeight: 4, nutrientTargetFactor: nutrientTargetFactor });
    const distance = energyDistanceFromWindow(nutrition.energyKcal, window);
    return { ...state, nutrition, dailyScore: daily, score: state.partialScore + daily + (state.frequencyPenalty || 0), energyDistanceKcal: distance };
  });
  finalists.sort((a, b) => a.energyDistanceKcal - b.energyDistanceKcal || ((varietyMode === VARIETY_MODES.none ? 0 : a.exactRecipeRepeats) - (varietyMode === VARIETY_MODES.none ? 0 : b.exactRecipeRepeats)) || exploratoryRank(a.score, seed, a.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) - exploratoryRank(b.score, seed, b.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) || a.score - b.score);
  const feasible = finalists.filter(item => item.energyDistanceKcal === 0);
  feasible.sort((a, b) => ((varietyMode === VARIETY_MODES.none ? 0 : a.exactRecipeRepeats) - (varietyMode === VARIETY_MODES.none ? 0 : b.exactRecipeRepeats)) || exploratoryRank(a.score, seed, a.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) - exploratoryRank(b.score, seed, b.slots.map(item => `${item.slot.id}:${keyOf(item.option.recipes)}`).join('|'), exploration.scoreJitter) || a.score - b.score);
  let orderedFeasible = feasible;
  if (feasible.length && exploration.pickMode === 'uniform_feasible') {
    const minimumRepeats = varietyMode === VARIETY_MODES.none ? 0 : Math.min(...feasible.map(item => item.exactRecipeRepeats));
    const minimumRepeatSet = feasible.filter(item => varietyMode === VARIETY_MODES.none || item.exactRecipeRepeats === minimumRepeats);
    const randomized = seededExposureOrder(minimumRepeatSet, `${seed}|final-feasible`, item => item.slots.map(slot => `${slot.slot.id}:${keyOf(slot.option.recipes)}`).join('|'));
    const selectedIds = new Set(randomized);
    orderedFeasible = [...randomized, ...feasible.filter(item => !selectedIds.has(item))];
  }
  const nearest = finalists[0] || null;
  return {
    solution: orderedFeasible[0] || null, solutions: orderedFeasible,
    diagnostics: {
      code: feasible.length ? 'feasible' : 'energy_window_unreachable_in_bounded_search',
      proof: feasible.length ? 'feasible_solution' : 'bounded_search',
      window,
      evaluatedFinalists: finalists.length,
      feasibleFinalists: feasible.length,
      nearestPlannedEnergyKcal: nearest?.nutrition?.energyKcal ?? null,
      nearestDistanceKcal: nearest?.energyDistanceKcal ?? null,
      hardPrunedStates,
      energyPrunedStates,
      frequencyPrunedStates,
      beamWidth,
      exploration: { mode: exploration.mode, pickMode: exploration.pickMode, scoreJitter: exploration.scoreJitter }
    }
  };
}
