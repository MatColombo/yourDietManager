import { stableHashId } from './seededRandom.js';
import { buildRecipeFeatureIndex } from './recipeFeatures.js';
import { telemetryIncrement } from './plannerTelemetry.js';

function ids(items = [], key) {
  return items.map(item => item?.[key]).filter(Boolean).sort().join(',');
}

function candidateSignature(candidateSets = null) {
  if (!candidateSets) return 'all';
  return Object.entries(candidateSets).sort(([a], [b]) => a.localeCompare(b)).map(([archetype, rows]) =>
    `${archetype}:${ids(rows, 'recipeVersionId')}`).join('|');
}

export function plannerRuntimeContextKey(input = {}) {
  const recipes = ids(input.recipes || [], 'recipeVersionId');
  const revisions = ids(input.ingredientRevisions || [], 'ingredientRevisionId');
  const groups = (input.foodGroups || []).map(group => `${group.id}:${group.version ?? ''}:${group.status ?? ''}`).sort().join(',');
  const configuration = JSON.stringify({
    nutritionProfile: input.nutritionProfile || null, allergyProfile: input.allergyProfile || null, foodPreferences: input.foodPreferences || null,
    mealClasses: input.mealClasses || [], dayClasses: input.dayClasses || [], cycle: input.cycle || null, startCycleDay: input.startCycleDay || 1,
    extensions: input.extensions || null, generationTuningOverlay: input.generationTuningOverlay || null
  });
  return stableHashId('plannerctx', input.catalogVersion || 'catalog', input.configSnapshotHash || 'config', recipes, revisions, groups, candidateSignature(input.candidateSets), configuration);
}

export function createPlannerRuntimeCache({ maxContexts = 2 } = {}) {
  const contexts = new Map();

  function touch(key, value) {
    contexts.delete(key);
    contexts.set(key, value);
    while (contexts.size > maxContexts) contexts.delete(contexts.keys().next().value);
  }

  function contextFor(input, telemetry = null) {
    const key = plannerRuntimeContextKey(input);
    let context = contexts.get(key);
    if (context) {
      telemetryIncrement(telemetry, 'runtimeContextCacheHits');
      touch(key, context);
      return context;
    }
    telemetryIncrement(telemetry, 'runtimeContextCacheMisses');
    context = { key, recipeFeatureIndex: null, preparedSlots: new Map(), createdAt: Date.now(), uses: 0 };
    touch(key, context);
    return context;
  }

  function prepareInput(input, telemetry = null) {
    const context = contextFor(input, telemetry);
    context.uses += 1;
    let recipeFeatureIndex = context.recipeFeatureIndex;
    if (recipeFeatureIndex) telemetryIncrement(telemetry, 'recipeFeatureIndexCacheHits');
    else {
      const revisions = new Map((input.ingredientRevisions || []).map(row => [row.ingredientRevisionId, row]));
      recipeFeatureIndex = buildRecipeFeatureIndex(input.recipes || [], revisions, input.foodGroups || [], { telemetry });
      context.recipeFeatureIndex = recipeFeatureIndex;
    }
    recipeFeatureIndex?.setTelemetry?.(telemetry);
    return { ...input, plannerTelemetry: telemetry || input.plannerTelemetry, recipeFeatureIndex, plannerPreparedSlotCache: context.preparedSlots, plannerRuntimeContextKey: context.key };
  }

  function clear() { contexts.clear(); }
  function stats() {
    return { contexts: contexts.size, entries: [...contexts.values()].map(context => ({ key: context.key, preparedSlots: context.preparedSlots.size, uses: context.uses })) };
  }

  return { prepareInput, clear, stats, contextFor };
}
