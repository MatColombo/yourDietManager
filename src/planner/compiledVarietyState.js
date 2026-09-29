import { legacyPreferenceRules } from '../domain/frequencyCounter.js';
import { addCivilDays } from './planMath.js';
import { cuisines, families, foodCategories, ingredientIds, primaryIngredientId, recipeMatchesTarget } from './recipeFeatures.js';
import { plannerPolicy, VARIETY_MODES } from './varietyPolicy.js';
import { telemetryAddTime, telemetryIncrement } from './plannerTelemetry.js';

const PERISHABLE_CATEGORIES = new Set([
  'product_category_vegetables', 'product_category_fruit', 'product_category_fish_seafood',
  'product_category_meat_poultry', 'product_category_eggs', 'product_category_dairy'
]);

function fallbackPerishableIngredientIds(recipe, revisionById) {
  const ids = new Set();
  for (const line of recipe?.ingredientLines || []) {
    if (line.included === false) continue;
    const revision = revisionById.get(line.ingredientRevisionId);
    const state = revision?.basis?.state;
    if (!PERISHABLE_CATEGORIES.has(revision?.productTaxonomy?.categoryId)) continue;
    if (['dry', 'drained'].includes(state)) continue;
    if (line.ingredientId) ids.add(line.ingredientId);
  }
  return ids;
}

function featureRecord(recipe, revisionById, recipeFeatureIndex, index = 0) {
  const indexed = recipeFeatureIndex?.get?.(recipe) || recipeFeatureIndex?.byVersionId?.get(recipe?.recipeVersionId) || null;
  return {
    index,
    recipe,
    recipeId: recipe?.recipeId || null,
    recipeVersionId: recipe?.recipeVersionId || null,
    families: indexed?.families || new Set(families(recipe)),
    cuisines: indexed?.cuisines || new Set(cuisines(recipe)),
    ingredients: indexed?.ingredientIds || new Set(ingredientIds(recipe)),
    categories: indexed?.foodCategories || foodCategories(recipe, revisionById),
    primary: indexed?.primaryIngredientId ?? primaryIngredientId(recipe),
    perishables: indexed?.perishableIngredientIds || fallbackPerishableIngredientIds(recipe, revisionById)
  };
}


function recentDates(currentDate, days) {
  const out = [];
  for (let offset = Number(days || 0); offset >= 1; offset -= 1) out.push(addCivilDays(currentDate, -offset));
  return out;
}

function addMask(map, key, bit) {
  if (!key) return;
  map.set(key, (map.get(key) || 0n) | bit);
}

function popcount(mask) {
  let value = mask; let count = 0;
  while (value) { value &= value - 1n; count += 1; }
  return count;
}

function overlapCount(bitMap, values) {
  if (!values?.size) return 0;
  let mask = 0n;
  for (const value of values) mask |= bitMap.get(value) || 0n;
  return popcount(mask);
}

function buildSnapshot(state, date, days, telemetry) {
  const snapshot = {
    entries: [], recipeCounts: new Map(), recipeIds: new Set(), familyBits: new Map(), ingredientBits: new Map(), categoryBits: new Map(), cuisineBits: new Map(),
    primaryCounts: new Map(), perishableIds: new Set()
  };
  for (const civilDate of recentDates(date, days)) {
    for (const entry of state.entriesByDate.get(civilDate) || []) {
      snapshot.entries.push(entry);
      const bit = 1n << BigInt(entry.index);
      if (entry.recipeId) {
        snapshot.recipeIds.add(entry.recipeId);
        snapshot.recipeCounts.set(entry.recipeId, Number(snapshot.recipeCounts.get(entry.recipeId) || 0) + 1);
      }
      for (const value of entry.families) addMask(snapshot.familyBits, value, bit);
      for (const value of entry.ingredients) addMask(snapshot.ingredientBits, value, bit);
      for (const value of entry.categories) addMask(snapshot.categoryBits, value, bit);
      for (const value of entry.cuisines) addMask(snapshot.cuisineBits, value, bit);
      if (entry.primary) snapshot.primaryCounts.set(entry.primary, Number(snapshot.primaryCounts.get(entry.primary) || 0) + 1);
      for (const value of entry.perishables) snapshot.perishableIds.add(value);
    }
  }
  telemetryIncrement(telemetry, 'varietyEntriesScanned', snapshot.entries.length);
  return snapshot;
}

function buildInitialState(previousCalendarDays, recipesByVersion, revisionById, recipeFeatureIndex, telemetry) {
  const entriesByDate = new Map(); let nextEntryIndex = 0;
  for (const day of previousCalendarDays || []) {
    for (const slot of day.mealSlots || []) {
      const date = slot.civilDate || day.date;
      for (const component of slot.recipeComponents || []) {
        const recipe = recipesByVersion.get(component.recipeVersionId);
        if (!recipe) continue;
        const current = entriesByDate.get(date) || [];
        current.push(featureRecord(recipe, revisionById, recipeFeatureIndex, nextEntryIndex)); nextEntryIndex += 1;
        entriesByDate.set(date, current);
      }
    }
  }
  telemetryIncrement(telemetry, 'varietyInitialEntries', nextEntryIndex);
  return { entriesByDate, nextEntryIndex };
}

export function compileVarietySearch({ foodPreferences, previousCalendarDays = [], recipesByVersion = new Map(), revisionById = new Map(), foodGroups = [], recipeFeatureIndex = null, telemetry = null } = {}) {
  const started = performance.now();
  const policy = plannerPolicy(foodPreferences);
  const legacyFrequency = legacyPreferenceRules(foodPreferences).filter(rule => rule.frequency);
  const initialState = buildInitialState(previousCalendarDays, recipesByVersion, revisionById, recipeFeatureIndex, telemetry);
  const scoreCache = new WeakMap();
  const snapshotCache = new WeakMap();

  function snapshot(state, date, days) {
    let byState = snapshotCache.get(state);
    if (!byState) { byState = new Map(); snapshotCache.set(state, byState); }
    const key = `${date}|${days}`;
    if (!byState.has(key)) byState.set(key, buildSnapshot(state, date, days, telemetry));
    else telemetryIncrement(telemetry, 'varietySnapshotCacheHits');
    return byState.get(key);
  }

  function score(state, recipe, date) {
    const scoreStarted = performance.now();
    telemetryIncrement(telemetry, 'varietyEvaluations');
    let byState = scoreCache.get(state);
    if (!byState) { byState = new Map(); scoreCache.set(state, byState); }
    const cacheKey = `${date}|${recipe?.recipeVersionId || recipe?.recipeId || ''}`;
    if (byState.has(cacheKey)) {
      telemetryIncrement(telemetry, 'varietyScoreCacheHits');
      return byState.get(cacheKey);
    }

    let total = 0;
    const reasons = [];
    const candidate = featureRecord(recipe, revisionById, recipeFeatureIndex);
    for (const window of policy.varietyWindows) {
      const recent = snapshot(state, date, window.days);
      const recipeCount = Number(recent.recipeCounts.get(candidate.recipeId) || 0);
      const familyCount = overlapCount(recent.familyBits, candidate.families);
      const primaryCount = candidate.primary ? Number(recent.primaryCounts.get(candidate.primary) || 0) : 0;
      const ingredientCount = overlapCount(recent.ingredientBits, candidate.ingredients);
      const categoryCount = overlapCount(recent.categoryBits, candidate.categories);
      const cuisineCount = overlapCount(recent.cuisineBits, candidate.cuisines);
      total += recipeCount * window.recipe + familyCount * window.family + primaryCount * window.primary
        + ingredientCount * Number(window.ingredient || 0) + categoryCount * window.category + cuisineCount * window.cuisine;
    }

    if (policy.varietyMode === VARIETY_MODES.perishables && candidate.perishables.size) {
      const seen = new Set();
      const recent = snapshot(state, date, policy.perishableWindowDays);
      for (const id of recent.perishableIds) if (candidate.perishables.has(id)) seen.add(id);
      if (seen.size) {
        const reward = Math.min(6, seen.size * policy.perishableOverlapReward);
        total -= reward;
        reasons.push(`perishable-proximity:-${Math.round(reward * 100) / 100}`);
      }
    }

    for (const rule of legacyFrequency) {
      if (!recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) continue;
      const entries = snapshot(state, date, rule.frequency.windowDays).entries;
      const occurrences = entries.reduce((count, entry) => count + (recipeMatchesTarget(entry.recipe, rule.targetType, rule.targetId, revisionById) ? 1 : 0), 0);
      const next = occurrences + 1;
      if (next > rule.frequency.maxOccurrences) {
        const penalty = (next - rule.frequency.maxOccurrences) * 8;
        total += penalty;
        reasons.push(`frequency:${rule.targetId}:${next}/${rule.frequency.maxOccurrences}`);
      }
    }
    if (total !== 0) reasons.push(`variety:${Math.round(total * 100) / 100}`);
    const result = { score: total, reasons };
    byState.set(cacheKey, result);
    telemetryAddTime(telemetry, 'varietyMs', performance.now() - scoreStarted);
    return result;
  }

  function filterCandidates(state, candidates, date) {
    if (!policy.exactRecipeGapDays) return { candidates, excludedCount: 0, fallbackUsed: false, policy };
    telemetryIncrement(telemetry, 'varietyCandidateFilters');
    const recentRecipeIds = snapshot(state, date, policy.exactRecipeGapDays).recipeIds;
    const filtered = (candidates || []).filter(recipe => !recentRecipeIds.has(recipe.recipeId));
    if (!filtered.length) return { candidates, excludedCount: 0, fallbackUsed: true, policy };
    return { candidates: filtered, excludedCount: candidates.length - filtered.length, fallbackUsed: false, policy };
  }

  const stateLookbackDays = Math.max(1,
    ...policy.varietyWindows.map(window => Number(window.days || 0)),
    Number(policy.exactRecipeGapDays || 0), Number(policy.perishableWindowDays || 0),
    ...legacyFrequency.map(rule => Number(rule.frequency?.windowDays || 0)));

  function stateKey(state, { fromDate = null } = {}) {
    const minimumDate = fromDate ? addCivilDays(fromDate, -stateLookbackDays) : null;
    return [...state.entriesByDate.entries()]
      .filter(([date, entries]) => entries?.length && (!minimumDate || date >= minimumDate))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => `${date}:${entries.map(entry => entry.recipeVersionId || entry.recipeId || '').sort().join(',')}`)
      .join('|');
  }

  function extendState(state, slots = []) {
    const entriesByDate = new Map(state.entriesByDate);
    const touched = new Set(); let nextEntryIndex = Number(state.nextEntryIndex || 0);
    for (const slot of slots || []) {
      if (slot.mode !== 'planned') continue;
      const date = slot.civilDate;
      if (!date) continue;
      if (!touched.has(date)) {
        entriesByDate.set(date, [...(entriesByDate.get(date) || [])]);
        touched.add(date);
      }
      const entries = entriesByDate.get(date);
      for (const component of slot.recipeComponents || []) {
        const recipe = recipesByVersion.get(component.recipeVersionId);
        if (recipe) { entries.push(featureRecord(recipe, revisionById, recipeFeatureIndex, nextEntryIndex)); nextEntryIndex += 1; }
      }
    }
    telemetryIncrement(telemetry, 'varietyStateExtensions');
    return { entriesByDate, nextEntryIndex };
  }

  telemetryAddTime(telemetry, 'varietyCompileMs', performance.now() - started);
  return { policy, initialState, score, filterCandidates, extendState, stateKey, stateLookbackDays };
}
