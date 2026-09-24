import { loadProductExtensions } from './productExtensionService.js';
import { assertFoodPreferencesV2, assertSafetyProfileV2 } from '../domain/revisionV2Contracts.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { executePlanGeneration } from './plannerExecution.js';
import { frequencyHistoryDays, frequencyRules } from '../domain/frequencyCounter.js';
import { currentSafetyRevisionMap } from '../domain/safetyPolicy.js';
import { currentFoodGroups } from './revisionV2Service.js';
import { previewContext, sealPreview, withValidatedPreview, validatePlannedDays } from './planPreviewGuard.js';
import { repositories } from '../repositories/repositoryHub.js';
import { loadConfigurationBundle, assertConfigurationBundle, activeRecords } from './configurationService.js';
import { PlanCandidateService, MAX_PLANNER_CANDIDATES_PER_ARCHETYPE } from './planCandidateService.js';
import { sha256Json } from '../lib/crypto.js';
import { addCivilDays, daysBetween, dateRange } from '../planner/planMath.js';
import { normalizeGenerationTuningOverlay } from '../planner/generationTuning.js';

function snapshotConfiguration(bundle, active) {
  return {
    appConfig: structuredClone(bundle.appConfig),
    nutritionProfile: structuredClone(active.nutritionProfile),
    allergyProfile: structuredClone(active.allergyProfile),
    foodPreferences: structuredClone(active.foodPreferences),
    mealClasses: structuredClone(active.mealClasses),
    dayClasses: structuredClone(active.dayClasses),
    cycle: structuredClone(active.cycle)
  };
}

async function boundedCandidates(active, catalogVersion, { repo, horizon, limit = MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, generationTuningOverlay = null } = {}) {
  const query = new PlanCandidateService({ repo });
  const archetypes = [...new Set(active.mealClasses.map(meal => meal.mealArchetype))];
  const candidateSets = {}; const versions = new Map(); const retrieval = {}; const foodGroups = await currentFoodGroups({ repo });
  for (const archetype of archetypes) {
    const eligibilityContexts = [];
    for (const dayClass of active.dayClasses) for (const slot of dayClass.mealSlots.filter(s => s.mode === 'planned')) { const mealClass = active.mealClasses.find(m => m.id === slot.mealClassId); if (mealClass?.mealArchetype === archetype) { const dates = [horizon.startDate, horizon.endDate, ...(active.allergyProfile.rules || []).map(r => r.effectiveFrom).filter(d => d && d >= horizon.startDate && d <= horizon.endDate)]; for (const date of new Set(dates)) eligibilityContexts.push({ dayClass, mealClass, allergyProfile: active.allergyProfile, generationTuningOverlay, date: addCivilDays(date, slot.dayOffset || 0) }); } }
    const items = await query.retrieve(archetype, { limit, foodPreferences: active.foodPreferences, foodGroups, eligibilityContexts });
    retrieval[archetype] = structuredClone(query.lastDiagnostics);
    candidateSets[archetype] = items;
    for (const version of items) versions.set(version.recipeVersionId, version);
  }
  return { candidateSets, recipes: [...versions.values()], catalogVersion, retrieval, foodGroups };
}

async function historicalDaysBefore(startDate, repo, planInstanceId = null, windowDays = 16, endDate = startDate) {
  const lower = addCivilDays(startDate, -windowDays);
  const planIds = new Set();
  let currentId = planInstanceId || await repo.getMeta('activePlanInstanceId') || null;
  while (currentId) {
    if (planIds.has(currentId)) break;
    planIds.add(currentId);
    const plan = await repo.get('planInstances', currentId);
    currentId = plan?.previousPlanInstanceId || null;
  }
  if (!planIds.size) return [];
  const values = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower, upper: addCivilDays(endDate, windowDays) });
  return values.filter(day => planIds.has(day.planInstanceId) && (day.date < startDate || day.date > endDate)).sort((a, b) => a.date.localeCompare(b.date));
}

async function continuationContext({ previousPlanInstanceId, active, repo }) {
  if (!previousPlanInstanceId) return { previousPlanInstanceId: null, previousGenerationRunId: null, startCycleDay: 1 };
  const previous = await repo.get('planInstances', previousPlanInstanceId);
  if (!previous) throw new Error(`Previous PlanInstance ${previousPlanInstanceId} not found`);
  const previousDays = await repo.getAllByIndex('calendarDays', 'planInstanceId', { kind: 'only', value: previousPlanInstanceId });
  previousDays.sort((a, b) => a.date.localeCompare(b.date));
  const lastCycleDay = previousDays.at(-1)?.cycleDay;
  const startCycleDay = lastCycleDay ? (lastCycleDay % active.cycle.length) + 1 : ((daysBetween(previous.startDate, previous.endDate) + 1) % active.cycle.length) + 1;
  return { previousPlanInstanceId, previousGenerationRunId: previous.generationRunId, startCycleDay };
}

export async function createPlanPreview(options, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const contextHash = await previewContext(repo);
  const bundle = options.configurationOverride ? structuredClone(options.configurationOverride) : await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry);
  const active = activeRecords(bundle);
  const validationContext = { registry, index: await loadReferenceDataIndex(repo), ingredients: await repo.getAll('ingredients'), foodGroups: await currentFoodGroups({ repo }), mealClasses: active.mealClasses };
  if (active.foodPreferences.schemaVersion === 2) assertFoodPreferencesV2(active.foodPreferences, validationContext);
  if (active.allergyProfile.schemaVersion === 2) assertSafetyProfileV2(active.allergyProfile, validationContext);
  const catalogVersion = await repo.getMeta('activeCatalogVersion');
  if (!catalogVersion) throw new Error('No active catalog version');
  const ingredientFamiliesForTuning = await repo.getAll('ingredients');
  const recipeFamiliesForTuning = await repo.getAll('recipes');
  const taxonomyTerms = await repo.getAll('taxonomyTerms');
  const generationTuningOverlay = options.generationTuningOverlay ? normalizeGenerationTuningOverlay(options.generationTuningOverlay, {
    horizon: options.horizon,
    mealClassIds: active.mealClasses.map(item => item.id),
    ingredientIds: ingredientFamiliesForTuning.filter(item => item.status === 'active').map(item => item.ingredientId),
    recipeIds: recipeFamiliesForTuning.filter(item => item.status === 'active').map(item => item.recipeId),
    taxonomyTermIds: taxonomyTerms.map(item => item.termId)
  }) : null;
  const configSnapshot = snapshotConfiguration(bundle, active);
  const extensions = await loadProductExtensions(repo);
  configSnapshot.productExtensions = extensions;
  configSnapshot.fixedSlots = options.fixedSlots || [];
  configSnapshot.foodGroups = await currentFoodGroups({ repo });
  if (generationTuningOverlay?.rules?.length) configSnapshot.generationTuningOverlay = generationTuningOverlay;
  const configSnapshotHash = await sha256Json(configSnapshot);
  const candidates = await boundedCandidates(active, catalogVersion, { repo, horizon: options.horizon, limit: options.candidateRetrievalLimit || MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, generationTuningOverlay });
  const continuation = await continuationContext({ previousPlanInstanceId: options.previousPlanInstanceId || null, active, repo });
  if (options.startCycleDayOverride != null) continuation.startCycleDay = Number(options.startCycleDayOverride);
  if (options.previousGenerationRunIdOverride !== undefined) continuation.previousGenerationRunId = options.previousGenerationRunIdOverride;
  const historyPlanInstanceId = options.historyPlanInstanceId !== undefined ? options.historyPlanInstanceId : continuation.previousPlanInstanceId;
  const previousCalendarDays = options.ignorePlanHistory === true ? [] : await historicalDaysBefore(options.horizon.startDate, repo, historyPlanInstanceId, frequencyHistoryDays(active.foodPreferences), options.horizon.endDate);
  const fixedVersionIds = (options.fixedSlots||[]).flatMap(entry=>entry.slot.recipeComponents.map(c=>c.recipeVersionId));
  const historicalVersionIds = [...new Set([...fixedVersionIds, ...previousCalendarDays.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId)))])];
  const historicalRecipes = await repo.getMany('recipeVersions', historicalVersionIds);
  const recipeMap = new Map([...candidates.recipes, ...historicalRecipes].map(recipe => [recipe.recipeVersionId, recipe]));
  const contextRecipes = [...recipeMap.values()];
  const revisions = await repo.getMany('ingredientRevisions', [...new Set(contextRecipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))]);
  const ingredients = await repo.getAll('ingredients');
  const currentRevisions = await repo.getMany('ingredientRevisions', ingredients.map(item => item.currentRevisionId));
  const safetyRevisionById = currentSafetyRevisionMap(revisions, ingredients, [...revisions, ...currentRevisions]);
  const createdAt = options.createdAt || new Date().toISOString();
  const result = await executePlanGeneration({
    nutritionProfile: active.nutritionProfile, allergyProfile: active.allergyProfile, foodPreferences: active.foodPreferences,
    mealClasses: active.mealClasses, dayClasses: active.dayClasses, cycle: active.cycle,
    recipes: contextRecipes, candidateSets: candidates.candidateSets, ingredientRevisions: revisions, ingredients, safetyRevisionById,
    foodGroups: candidates.foodGroups, taxonomyTerms, generationTuningOverlay, retrievalTruncated: Object.values(candidates.retrieval).some(row => row.truncated),
    searchBudget: options.searchBudget, extensions, fixedSlots: options.fixedSlots || [],
    horizon: options.horizon, seed: options.seed, catalogVersion, configSnapshotHash, configSnapshot, createdAt,
    reason: options.reason || (options.previousPlanInstanceId ? 'horizon_extension' : 'initial'),
    previousGenerationRunId: continuation.previousGenerationRunId, previousPlanInstanceId: continuation.previousPlanInstanceId,
    previousCalendarDays, continuationPolicy: options.continuationPolicy || { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 },
    startCycleDay: continuation.startCycleDay, candidateLimit: options.candidateLimit || 20, beamWidth: options.beamWidth || 100, slotOptionLimit: options.slotOptionLimit || 40,
    regenerationPolicy: options.regenerationPolicy || null
  }, { signal: options.signal, onProgress: options.onProgress });
  result.diagnostics.candidateRetrieval = { details: candidates.retrieval, limitPerArchetype: options.candidateRetrievalLimit || MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, counts: Object.fromEntries(Object.entries(candidates.candidateSets).map(([key, values]) => [key, values.length])), totalUniqueRecipes: candidates.recipes.length };
  result.diagnostics.retrievalHardRejectionCounts = Object.values(candidates.retrieval).reduce((all, row) => { for (const [key, count] of Object.entries(row.hardRejectionCounts || {})) all[key] = (all[key] || 0) + count; return all; }, {});
  if (result.failure && !Object.keys(result.failure.rejections || {}).length) result.failure.rejections = result.diagnostics.retrievalHardRejectionCounts;
  result.diagnostics.horizonRecommendation = Math.max(daysBetween(options.horizon.startDate, options.horizon.endDate) + 1, ...frequencyRules(active.foodPreferences).filter(rule => rule.minOccurrences > 0).map(rule => rule.window.days));
  if (options.validationContext) result.diagnostics.validationContext = structuredClone(options.validationContext);
  if (result.status === 'success') {
    if (generationTuningOverlay?.rules?.length) {
      result.generationTuningOverlay = structuredClone(generationTuningOverlay);
      result.diagnostics.generationTuning = { policyVersion: generationTuningOverlay.policyVersion, ruleCount: generationTuningOverlay.rules.length, hardExclusionCount: generationTuningOverlay.rules.filter(rule => rule.mode === 'exclude').length };
    }
    result.generationRun.diagnostics = result.diagnostics;
    registry.assert('generationRun', result.generationRun); registry.assert('planInstance', result.planInstance);
    for (const day of result.calendarDays) registry.assert('calendarDay', day);
  }
  return options.configurationOverride || options.validationContext ? result : sealPreview(result, contextHash, repo, 'generation');
}

export async function commitPlanPreview(preview, deps = {}) {
  const { commitGeneratedPreview } = await import('./effectivePlanService.js');
  return (await commitGeneratedPreview(preview, deps)).planInstance;
}

export async function extendPlan(previousPlanInstanceId, { seed, createdAt, signal, onProgress, searchBudget } = {}, deps = {}) {
  const repo = deps.repo || repositories; const registry = deps.registry;
  const previous = await repo.get('planInstances', previousPlanInstanceId);
  if (!previous) throw new Error(`PlanInstance ${previousPlanInstanceId} not found`);
  const days = previous.continuationPolicy.extensionDays;
  const startDate = addCivilDays(previous.endDate, 1); const endDate = addCivilDays(startDate, days - 1);
  return createPlanPreview({ horizon: { startDate, endDate }, seed, createdAt, signal, onProgress, searchBudget, reason: 'horizon_extension', previousPlanInstanceId, continuationPolicy: previous.continuationPolicy }, { repo, registry });
}

export function continuationState(planInstance, today) {
  if (!planInstance) return { state: 'no_plan', action: null };
  if (today > planInstance.endDate) return { state: 'ended', action: planInstance.continuationPolicy.mode === 'fixed' ? null : 'extend' };
  const daysLeft = daysBetween(today, planInstance.endDate);
  if (planInstance.continuationPolicy.mode !== 'fixed' && daysLeft <= planInstance.continuationPolicy.triggerDaysBeforeEnd) {
    return { state: 'extension_window', action: planInstance.continuationPolicy.mode === 'auto_extend' ? 'auto_extend' : 'prompt_extend', daysLeft };
  }
  return { state: 'active', action: null, daysLeft };
}
