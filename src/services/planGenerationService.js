import { repositories } from '../repositories/repositoryHub.js';
import { loadConfigurationBundle, assertConfigurationBundle, activeRecords } from './configurationService.js';
import { PlanCandidateService } from './planCandidateService.js';
import { generatePlanCore } from '../planner/planGenerator.js';
import { sha256Json } from '../lib/crypto.js';
import { addCivilDays, daysBetween } from '../planner/planMath.js';

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

async function boundedCandidates(active, catalogVersion, { repo, limit = 250 } = {}) {
  const query = new PlanCandidateService({ repo });
  const archetypes = [...new Set(active.mealClasses.map(meal => meal.mealArchetype))];
  const hardAllergens = (active.allergyProfile?.rules || []).filter(rule => rule.enabled && rule.targetType === 'allergen').map(rule => rule.targetId);
  const candidateSets = {}; const versions = new Map();
  for (const archetype of archetypes) {
    const items = await query.retrieve(archetype, { limit, excludeAllergens: hardAllergens });
    candidateSets[archetype] = items;
    for (const version of items) versions.set(version.recipeVersionId, version);
  }
  return { candidateSets, recipes: [...versions.values()], catalogVersion };
}

async function historicalDaysBefore(startDate, repo, planInstanceId = null, windowDays = 14) {
  const lower = addCivilDays(startDate, -windowDays);
  const planIds = new Set();
  let currentId = planInstanceId || await repo.getMeta('activePlanInstanceId') || null;
  for (let depth = 0; currentId && depth < 32; depth += 1) {
    if (planIds.has(currentId)) break;
    planIds.add(currentId);
    const plan = await repo.get('planInstances', currentId);
    currentId = plan?.previousPlanInstanceId || null;
  }
  if (!planIds.size) return [];
  const values = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower, upper: addCivilDays(startDate, -1) });
  return values.filter(day => planIds.has(day.planInstanceId)).sort((a, b) => a.date.localeCompare(b.date));
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
  const bundle = await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry);
  const active = activeRecords(bundle);
  const catalogVersion = await repo.getMeta('activeCatalogVersion');
  if (!catalogVersion) throw new Error('No active catalog version');
  const configSnapshot = snapshotConfiguration(bundle, active);
  const configSnapshotHash = await sha256Json(configSnapshot);
  const candidates = await boundedCandidates(active, catalogVersion, { repo, limit: options.candidateRetrievalLimit || 250 });
  const continuation = await continuationContext({ previousPlanInstanceId: options.previousPlanInstanceId || null, active, repo });
  if (options.startCycleDayOverride != null) continuation.startCycleDay = Number(options.startCycleDayOverride);
  if (options.previousGenerationRunIdOverride !== undefined) continuation.previousGenerationRunId = options.previousGenerationRunIdOverride;
  const historyPlanInstanceId = options.historyPlanInstanceId !== undefined ? options.historyPlanInstanceId : continuation.previousPlanInstanceId;
  const previousCalendarDays = await historicalDaysBefore(options.horizon.startDate, repo, historyPlanInstanceId, 14);
  const historicalVersionIds = [...new Set(previousCalendarDays.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
  const historicalRecipes = await repo.getMany('recipeVersions', historicalVersionIds);
  const recipeMap = new Map([...candidates.recipes, ...historicalRecipes].map(recipe => [recipe.recipeVersionId, recipe]));
  const contextRecipes = [...recipeMap.values()];
  const revisions = await repo.getMany('ingredientRevisions', [...new Set(contextRecipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))]);
  const createdAt = options.createdAt || new Date().toISOString();
  const result = generatePlanCore({
    nutritionProfile: active.nutritionProfile, allergyProfile: active.allergyProfile, foodPreferences: active.foodPreferences,
    mealClasses: active.mealClasses, dayClasses: active.dayClasses, cycle: active.cycle,
    recipes: contextRecipes, candidateSets: candidates.candidateSets, ingredientRevisions: revisions,
    horizon: options.horizon, seed: options.seed, catalogVersion, configSnapshotHash, configSnapshot, createdAt,
    reason: options.reason || (options.previousPlanInstanceId ? 'horizon_extension' : 'initial'),
    previousGenerationRunId: continuation.previousGenerationRunId, previousPlanInstanceId: continuation.previousPlanInstanceId,
    previousCalendarDays, continuationPolicy: options.continuationPolicy || { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 },
    startCycleDay: continuation.startCycleDay, candidateLimit: options.candidateLimit || 20, beamWidth: options.beamWidth || 100, slotOptionLimit: options.slotOptionLimit || 40
  });
  if (result.status === 'success') {
    registry.assert('generationRun', result.generationRun); registry.assert('planInstance', result.planInstance);
    for (const day of result.calendarDays) registry.assert('calendarDay', day);
  }
  return result;
}

export async function commitPlanPreview(preview, { repo = repositories } = {}) {
  if (preview?.status !== 'success') throw new Error('Only a successful plan preview can be committed');
  await repo.atomicPut({ generationRuns: [preview.generationRun], planInstances: [preview.planInstance], calendarDays: preview.calendarDays }, {
    activePlanInstanceId: preview.planInstance.planInstanceId,
    lastSuccessfulGenerationRunId: preview.generationRun.generationRunId,
    planUpdatedAt: preview.planInstance.updatedAt
  });
  return preview.planInstance;
}

export async function extendPlan(previousPlanInstanceId, { seed, createdAt } = {}, deps = {}) {
  const repo = deps.repo || repositories; const registry = deps.registry;
  const previous = await repo.get('planInstances', previousPlanInstanceId);
  if (!previous) throw new Error(`PlanInstance ${previousPlanInstanceId} not found`);
  const days = previous.continuationPolicy.extensionDays;
  const startDate = addCivilDays(previous.endDate, 1); const endDate = addCivilDays(startDate, days - 1);
  return createPlanPreview({ horizon: { startDate, endDate }, seed, createdAt, reason: 'horizon_extension', previousPlanInstanceId, continuationPolicy: previous.continuationPolicy }, { repo, registry });
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
