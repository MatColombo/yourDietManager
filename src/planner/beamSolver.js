import { addNutrition, sumNutrition, nutritionPenalty, energyToleranceWindow, energyDistanceFromWindow } from './planMath.js';
import { seededTie } from './seededRandom.js';
import { families, cuisines, primaryIngredientId, ingredientIds } from './recipeFeatures.js';
import { PLANNER_SOFT_OBJECTIVE_POLICY, slotOptionSoftContribution } from './qualityPolicy.js';
import { explorationProfile, exploratoryScore, quotaCounts, recipeFeatureSignature, seededExposureOrder } from './explorationPolicy.js';
import { VARIETY_MODES } from './varietyPolicy.js';
import { telemetryIncrement } from './plannerTelemetry.js';

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

function candidateSoftContribution(item) {
  return slotOptionSoftContribution(item?.score);
}

function addSoftParts(left, right) {
  const components = {};
  for (const key of ['nutritionTieBreak', 'preference', 'variety', 'regeneration', 'tuning']) components[key] = Number(left?.components?.[key] || 0) + Number(right?.components?.[key] || 0);
  return { total: Number(left?.total || 0) + Number(right?.total || 0), components };
}

function emptyNutrition() { return { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }; }

function optionFromRecords(records, { targetEnergy, dayEnergyTarget, nutritionProfile, seed }) {
  let nutrition = emptyNutrition();
  let softParts = { total: 0, components: { nutritionTieBreak: 0, preference: 0, variety: 0, regeneration: 0, tuning: 0 } };
  for (const record of records) {
    nutrition = addNutrition(nutrition, record.recipe.calculatedNutrition || {});
    softParts = addSoftParts(softParts, record.softContribution);
  }
  const recipes = records.map(record => record.recipe);
  const nutrientTargetFactor = targetEnergy / Math.max(1, dayEnergyTarget);
  const slotNutrition = nutritionPenalty(nutrition, nutritionProfile, { energyTarget: targetEnergy, energyWeight: 2.2, nutrientTargetFactor });
  const componentPenalty = (recipes.length - 1) * PLANNER_SOFT_OBJECTIVE_POLICY.slotOption.extraComponentPenalty;
  const score = slotNutrition + softParts.total + componentPenalty;
  return { recipes, nutrition, score, scoreComponents: { slotNutrition, ...softParts.components, componentPenalty }, tie: seededTie(seed, keyOf(recipes)) };
}

function extensionRecords(records, afterIndex, residualEnergy, { limit, seed, baseRecipes = [], signatureFor = null }) {
  const available = records.filter(record => record.index > afterIndex);
  if (available.length <= limit) return available;
  const byEnergy = [...available].sort((a, b) => Math.abs(a.energy - residualEnergy) - Math.abs(b.energy - residualEnergy) || a.item.score.total - b.item.score.total || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  const byQuality = [...available].sort((a, b) => a.item.score.total - b.item.score.total || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  const byRandom = seededExposureOrder(available, seed, record => record.recipe.recipeVersionId);
  const selected = []; const seen = new Set();
  const push = record => { if (!record || selected.length >= limit || seen.has(record.index)) return; seen.add(record.index); selected.push(record); };
  if (signatureFor) {
    const signatures = new Set();
    for (const record of byRandom) {
      const signature = signatureFor([...baseRecipes, record.recipe]);
      if (signatures.has(signature)) continue;
      signatures.add(signature); push(record);
      if (selected.length >= limit) return selected;
    }
  }
  const energyQuota = Math.max(2, Math.ceil(limit * 0.55));
  const qualityQuota = Math.max(1, Math.ceil(limit * 0.2));
  for (const record of byEnergy.slice(0, energyQuota)) push(record);
  for (const record of byQuality.slice(0, qualityQuota)) push(record);
  for (const record of byRandom) push(record);
  return selected;
}

export function buildSlotOptions(scoredCandidates, { targetEnergy, dayEnergyTarget, nutritionProfile, maxComponents = 3, optionLimit = 40, seed = 'seed', signatureFor = null, telemetry = null }) {
  const ordered = seededExposureOrder(scoredCandidates, `${seed}|option-construction`, item => item.recipe.recipeVersionId);
  const records = ordered.map((item, index) => ({
    index, item, recipe: item.recipe, energy: Number(item.recipe.calculatedNutrition?.energyKcal || 0), softContribution: candidateSoftContribution(item)
  }));
  const options = [];
  const pairStates = [];
  const addOption = (recordSet, counter = null) => {
    telemetryIncrement(telemetry, 'slotOptionCombinationAttempts');
    const entry = optionFromRecords(recordSet, { targetEnergy, dayEnergyTarget, nutritionProfile, seed });
    options.push(entry);
    if (counter) telemetryIncrement(telemetry, counter);
    return entry;
  };

  for (const record of records) addOption([record]);

  if (maxComponents >= 2 && records.length >= 2) {
    const partnerLimit = Math.min(records.length, Math.max(10, Math.ceil(optionLimit * 0.6)));
    const pairSeen = new Set();
    for (const first of records) {
      const partners = extensionRecords(records, first.index, targetEnergy - first.energy, {
        limit: partnerLimit, seed: `${seed}|pair|${first.recipe.recipeVersionId}`, baseRecipes: [first.recipe], signatureFor
      });
      for (const second of partners) {
        const pairKey = `${first.index}:${second.index}`;
        if (pairSeen.has(pairKey)) continue;
        pairSeen.add(pairKey);
        const entry = addOption([first, second], 'slotPairOptionsGenerated');
        pairStates.push({ records: [first, second], entry });
      }
    }
  }

  if (maxComponents >= 3 && pairStates.length && records.length >= 3) {
    const stateByKey = new Map(pairStates.map(state => [keyOf(state.entry.recipes), state]));
    const tripleSeedLimit = Math.min(pairStates.length, Math.max(optionLimit * 2, 36));
    const tripleSeeds = selectOptionFrontier(pairStates.map(state => state.entry), { targetEnergy, limit: tripleSeedLimit, signatureFor, seed: `${seed}|triple-frontier` })
      .map(entry => stateByKey.get(keyOf(entry.recipes))).filter(Boolean);
    const thirdLimit = Math.min(records.length, Math.max(7, Math.ceil(optionLimit * 0.45)));
    const tripleSeen = new Set();
    for (const pair of tripleSeeds) {
      const lastIndex = pair.records.at(-1).index;
      const pairEnergy = energyOfOption(pair.entry);
      const thirds = extensionRecords(records, lastIndex, targetEnergy - pairEnergy, {
        limit: thirdLimit, seed: `${seed}|triple|${keyOf(pair.entry.recipes)}`, baseRecipes: pair.entry.recipes, signatureFor
      });
      for (const third of thirds) {
        const tripleKey = `${pair.records[0].index}:${pair.records[1].index}:${third.index}`;
        if (tripleSeen.has(tripleKey)) continue;
        tripleSeen.add(tripleKey);
        addOption([...pair.records, third], 'slotTripleOptionsGenerated');
      }
    }
  }

  const dedup = new Map();
  for (const option of options) {
    const key = keyOf(option.recipes); const current = dedup.get(key);
    if (!current || option.score < current.score) dedup.set(key, option);
  }
  telemetryIncrement(telemetry, 'slotOptionsGenerated', options.length);
  const retained = selectOptionFrontier([...dedup.values()], { targetEnergy, limit: optionLimit, signatureFor, seed });
  telemetryIncrement(telemetry, 'slotOptionsRetained', retained.length);
  return retained;
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

export function solveDayBeam(slotPlans, { dayEnergyTarget, externalEnergy = 0, nutritionProfile, beamWidth = 100, seed = 'seed', evaluateState = null, onProgress = null, varietyMode = VARIETY_MODES.maximum, telemetry = null }) {
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
      telemetryIncrement(telemetry, 'dayStatesExpanded');
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
