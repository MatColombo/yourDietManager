import { repositories } from '../repositories/repositoryHub.js';
import { loadConfigurationBundle, assertConfigurationBundle, activeRecords } from './configurationService.js';
import { PlanCandidateService } from './planCandidateService.js';
import { createPlanPreview, extendPlan, continuationState } from './planGenerationService.js';
import { hardFilterRecipe } from '../planner/hardFilter.js';
import { scoreRecipe } from '../planner/softScoring.js';
import { addCivilDays, dayEnergyTarget, sumNutrition, nutritionPenalty } from '../planner/planMath.js';
import { seededTie } from '../planner/seededRandom.js';
import { commitOperation, mutationSnapshot, listRecentOperations, undoLastOperation, redoNextOperation, historyState } from './operationHistoryService.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function nowIso(value) { return value || new Date().toISOString(); }

export function civilDateInTimeZone(timeZone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function deriveDayStatus(mealSlots = []) {
  const statuses = mealSlots.map(slot => slot.adherenceStatus || 'not_recorded');
  const recorded = statuses.filter(status => status !== 'not_recorded');
  if (!recorded.length) return 'planned';
  if (recorded.length === statuses.length && recorded.every(status => status === 'followed')) return 'followed';
  if (recorded.length === statuses.length && recorded.every(status => status === 'not_followed')) return 'not_followed';
  return 'partial';
}

async function loadPlanChain(repo = repositories) {
  const activeId = await repo.getMeta('activePlanInstanceId');
  if (!activeId) return [];
  const rows = []; const seen = new Set(); let currentId = activeId;
  while (currentId && !seen.has(currentId) && rows.length < 64) {
    seen.add(currentId);
    const plan = await repo.get('planInstances', currentId);
    if (!plan) break;
    rows.push(plan); currentId = plan.previousPlanInstanceId;
  }
  return rows.reverse();
}

async function chainDays(repo, chain, startDate, endDate) {
  if (!chain.length) return [];
  const ids = new Set(chain.map(plan => plan.planInstanceId));
  const rows = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: startDate, upper: endDate });
  return rows.filter(day => ids.has(day.planInstanceId)).sort((a, b) => a.date.localeCompare(b.date));
}

async function dayForDate(repo, chain, date) {
  const rows = await chainDays(repo, chain, date, date);
  return rows[0] || null;
}

async function resolveRecipesForDays(repo, days) {
  const ids = [...new Set(days.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
  const versions = await repo.getMany('recipeVersions', ids);
  return new Map(versions.map(item => [item.recipeVersionId, item]));
}

export async function loadEffectivePlanState(today, { repo = repositories } = {}) {
  const chain = await loadPlanChain(repo);
  if (!chain.length) return { chain: [], latestPlan: null, dietDay: null, civilMeals: [], continuation: { state: 'no_plan', action: null } };
  const latestPlan = chain.at(-1);
  const dietDay = await dayForDate(repo, chain, today);
  const sourceDays = await chainDays(repo, chain, addCivilDays(today, -2), today);
  const recipeMap = await resolveRecipesForDays(repo, sourceDays);
  const civilMeals = [];
  for (const sourceDay of sourceDays) {
    for (const slot of sourceDay.mealSlots || []) {
      if (slot.civilDate !== today) continue;
      civilMeals.push({ sourceDay, slot, recipes: (slot.recipeComponents || []).map(component => recipeMap.get(component.recipeVersionId)).filter(Boolean) });
    }
  }
  civilMeals.sort((a, b) => a.slot.time.localeCompare(b.slot.time) || a.slot.mealOccurrenceId.localeCompare(b.slot.mealOccurrenceId));
  return { chain, latestPlan, dietDay, civilMeals, continuation: continuationState(latestPlan, today) };
}

export async function loadCalendarRange(startDate, endDate, { repo = repositories } = {}) {
  const chain = await loadPlanChain(repo);
  return { chain, days: await chainDays(repo, chain, startDate, endDate) };
}

function dayClassSlot(dayClass, occurrence) {
  return (dayClass?.mealSlots || []).find(slot => slot.mealClassId === occurrence.mealClassId && slot.time === occurrence.time && Number(slot.dayOffset || 0) === Number(occurrence.dayOffset || 0) && slot.mode === occurrence.mode) || null;
}

function slotEnergyTarget(slot, mealClass, target) {
  if (slot?.energyBudgetKcal != null) return Number(slot.energyBudgetKcal);
  if (slot?.energyShare != null) return target * Number(slot.energyShare);
  if (mealClass?.energyShare?.target != null) return target * Number(mealClass.energyShare.target);
  return target * 0.2;
}

async function loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry }) {
  const bundle = await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry);
  const active = activeRecords(bundle);
  const plan = await repo.get('planInstances', planInstanceId); if (!plan) throw new Error(`PlanInstance ${planInstanceId} not found`);
  const day = await repo.get('calendarDays', calendarDayId); if (!day || day.planInstanceId !== planInstanceId) throw new Error(`CalendarDay ${calendarDayId} not found in plan`);
  const occurrence = day.mealSlots.find(slot => slot.mealOccurrenceId === mealOccurrenceId); if (!occurrence) throw new Error(`Meal occurrence ${mealOccurrenceId} not found`);
  const mealClass = active.mealClasses.find(item => item.id === occurrence.mealClassId); if (!mealClass) throw new Error(`MealClass ${occurrence.mealClassId} not found`);
  const dayClass = active.dayClasses.find(item => item.id === day.dayClassId); if (!dayClass) throw new Error(`DayClass ${day.dayClassId} not found`);
  return { bundle, active, plan, day, occurrence, mealClass, dayClass };
}

async function historyForDate(planInstanceId, date, { repo }) {
  const chain = await loadPlanChain(repo); const ids = new Set(chain.map(plan => plan.planInstanceId));
  if (!ids.has(planInstanceId)) ids.add(planInstanceId);
  const days = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: addCivilDays(date, -14), upper: addCivilDays(date, -1) });
  const filtered = days.filter(day => ids.has(day.planInstanceId));
  const recipes = await resolveRecipesForDays(repo, filtered); const history = [];
  for (const day of filtered) for (const slot of day.mealSlots || []) for (const component of slot.recipeComponents || []) {
    const recipe = recipes.get(component.recipeVersionId); if (recipe) history.push({ date: slot.civilDate || day.date, recipe });
  }
  return history;
}

export async function createReplacementPreview({ planInstanceId, calendarDayId, mealOccurrenceId, seed = 'replace', limit = 8 }, { repo = repositories, registry } = {}) {
  const context = await loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry });
  if (context.occurrence.mode !== 'planned') throw new Error('External meal occurrences cannot be replaced with catalog recipes');
  const sourceSlot = dayClassSlot(context.dayClass, context.occurrence);
  const target = dayEnergyTarget(context.active.nutritionProfile, context.day.dayArchetype);
  const targetEnergy = slotEnergyTarget(sourceSlot, context.mealClass, target);
  const hardAllergens = (context.active.allergyProfile?.rules || []).filter(rule => rule.enabled && rule.targetType === 'allergen').map(rule => rule.targetId);
  const service = new PlanCandidateService({ repo });
  const candidates = await service.retrieve(context.mealClass.mealArchetype, { limit: 250, excludeAllergens: hardAllergens });
  const history = await historyForDate(planInstanceId, context.day.date, { repo });
  const allRecipes = [...candidates, ...history.map(item => item.recipe)];
  const revisionIds = [...new Set(allRecipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)))];
  const revisions = await repo.getMany('ingredientRevisions', revisionIds); const revisionById = new Map(revisions.map(item => [item.ingredientRevisionId, item]));
  const current = new Set((context.occurrence.recipeComponents || []).map(component => component.recipeVersionId));
  const ranked = [];
  for (const recipe of candidates) {
    if (current.has(recipe.recipeVersionId)) continue;
    const scoreContext = { mealClass: context.mealClass, dayClass: context.dayClass, allergyProfile: context.active.allergyProfile, foodPreferences: context.active.foodPreferences, revisionById, history, date: context.day.date, nutritionProfile: context.active.nutritionProfile, slotEnergyTarget: targetEnergy, dayEnergyTarget: target };
    const hard = hardFilterRecipe(recipe, scoreContext); if (!hard.allowed) continue;
    const score = scoreRecipe(recipe, scoreContext);
    ranked.push({ recipe, score, tie: seededTie(seed, `${context.day.date}|${mealOccurrenceId}|${recipe.recipeVersionId}`) });
  }
  ranked.sort((a, b) => a.score.total - b.score.total || a.tie - b.tie || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
  return { status: 'success', planInstanceId, calendarDayId, mealOccurrenceId, targetEnergy, candidates: ranked.slice(0, Math.max(1, Math.min(20, Number(limit) || 8))).map(({ recipe, score }) => ({ recipe: clone(recipe), score: clone(score) })) };
}

async function recomputeDayNutrition(day, nutritionProfile, repo) {
  const componentIds = (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId));
  const ids = [...new Set(componentIds)]; const versions = await repo.getMany('recipeVersions', ids); const byId = new Map(versions.map(recipe => [recipe.recipeVersionId, recipe]));
  const known = sumNutrition(componentIds.map(id => byId.get(id)).filter(Boolean));
  const dailyTarget = Number(day.nutritionSummary?.target?.energyKcal || nutritionProfile.dailyEnergyKcal);
  const plannedTarget = Number(day.nutritionSummary?.target?.plannedEnergyKcal || dailyTarget);
  const scale = plannedTarget / Math.max(1, dailyTarget);
  const score = nutritionPenalty(known, nutritionProfile, { energyTarget: plannedTarget, energyWeight: 3, nutrientScale: scale });
  return { ...clone(day.nutritionSummary), knownPlanned: known, score: Math.round(score * 1000) / 1000 };
}

async function metaBefore(repo, keys) {
  const metaSet = {}; const metaDelete = [];
  for (const key of keys) { const value = await repo.getMeta(key); if (value === undefined) metaDelete.push(key); else metaSet[key] = value; }
  return { metaSet, metaDelete };
}

export async function commitReplacement({ planInstanceId, calendarDayId, mealOccurrenceId, recipeVersionId, createdAt = null }, { repo = repositories, registry } = {}) {
  const context = await loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry });
  if (context.occurrence.mode !== 'planned') throw new Error('External meal occurrences cannot be replaced with catalog recipes');
  if ((context.occurrence.recipeComponents || []).some(component => component.recipeVersionId === recipeVersionId)) throw new Error('Selected replacement is already assigned to the meal occurrence');
  const recipe = await repo.get('recipeVersions', recipeVersionId);
  if (!recipe) throw new Error('Selected replacement is not an admissible candidate');
  const sourceSlot = dayClassSlot(context.dayClass, context.occurrence);
  const target = dayEnergyTarget(context.active.nutritionProfile, context.day.dayArchetype);
  const targetEnergy = slotEnergyTarget(sourceSlot, context.mealClass, target);
  const history = await historyForDate(planInstanceId, context.day.date, { repo });
  const revisionIds = [...new Set([recipe, ...history.map(item => item.recipe)].flatMap(item => (item.ingredientLines || []).map(line => line.ingredientRevisionId)))];
  const revisions = await repo.getMany('ingredientRevisions', revisionIds);
  const revisionById = new Map(revisions.map(item => [item.ingredientRevisionId, item]));
  const scoreContext = { mealClass: context.mealClass, dayClass: context.dayClass, allergyProfile: context.active.allergyProfile, foodPreferences: context.active.foodPreferences, revisionById, history, date: context.day.date, nutritionProfile: context.active.nutritionProfile, slotEnergyTarget: targetEnergy, dayEnergyTarget: target };
  if (!hardFilterRecipe(recipe, scoreContext).allowed) throw new Error('Selected replacement is not an admissible candidate');
  const selected = { recipe };
  const timestamp = nowIso(createdAt); const nextDay = clone(context.day); const nextPlan = clone(context.plan);
  const slot = nextDay.mealSlots.find(item => item.mealOccurrenceId === mealOccurrenceId);
  const previousComponents = clone(slot.recipeComponents);
  slot.recipeComponents = [{ recipeId: selected.recipe.recipeId, recipeVersionId: selected.recipe.recipeVersionId, servings: 1 }]; slot.adherenceStatus = 'not_recorded'; slot.adherenceNotes = null;
  nextDay.status = deriveDayStatus(nextDay.mealSlots); nextDay.updatedAt = timestamp; nextDay.nutritionSummary = await recomputeDayNutrition(nextDay, context.active.nutritionProfile, repo);
  nextPlan.updatedAt = timestamp;
  registry.assert('calendarDay', nextDay); registry.assert('planInstance', nextPlan);
  const beforeMeta = await metaBefore(repo, ['planUpdatedAt']);
  const before = mutationSnapshot({ puts: { calendarDays: [context.day], planInstances: [context.plan] }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { calendarDays: [nextDay], planInstances: [nextPlan] }, metaSet: { planUpdatedAt: timestamp } });
  const operation = await commitOperation({ planInstanceId, kind: 'replace_meal', before, after, createdAt: timestamp, metadata: { calendarDayId, mealOccurrenceId, date: context.day.date, beforeRecipeVersionIds: previousComponents.map(item => item.recipeVersionId), afterRecipeVersionIds: [recipeVersionId] } }, { repo, registry });
  return { day: nextDay, operation };
}

export async function updateAdherence({ planInstanceId, calendarDayId, mealOccurrenceId, status, notes = null, userEstimatedEnergyKcal = null, userEstimatedProteinG = null, createdAt = null }, { repo = repositories, registry } = {}) {
  if (!['not_recorded', 'followed', 'partial', 'not_followed'].includes(status)) throw new Error(`Unsupported adherence status ${status}`);
  const context = await loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry }); const timestamp = nowIso(createdAt);
  const nextDay = clone(context.day); const nextPlan = clone(context.plan); const slot = nextDay.mealSlots.find(item => item.mealOccurrenceId === mealOccurrenceId);
  slot.adherenceStatus = status; slot.adherenceNotes = notes == null || String(notes).trim() === '' ? null : String(notes).trim();
  if (slot.mode === 'external' && slot.externalEstimate?.policy === 'user_estimate') {
    slot.externalEstimate.userEstimatedEnergyKcal = userEstimatedEnergyKcal == null || userEstimatedEnergyKcal === '' ? null : Math.max(0, Number(userEstimatedEnergyKcal));
    slot.externalEstimate.userEstimatedProteinG = userEstimatedProteinG == null || userEstimatedProteinG === '' ? null : Math.max(0, Number(userEstimatedProteinG));
  } else if (userEstimatedEnergyKcal != null || userEstimatedProteinG != null) throw new Error('User estimate is allowed only for external slots with user_estimate policy');
  nextDay.status = deriveDayStatus(nextDay.mealSlots); nextDay.updatedAt = timestamp; nextPlan.updatedAt = timestamp;
  registry.assert('calendarDay', nextDay); registry.assert('planInstance', nextPlan);
  const beforeMeta = await metaBefore(repo, ['planUpdatedAt']);
  const before = mutationSnapshot({ puts: { calendarDays: [context.day], planInstances: [context.plan] }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { calendarDays: [nextDay], planInstances: [nextPlan] }, metaSet: { planUpdatedAt: timestamp } });
  const operation = await commitOperation({ planInstanceId, kind: 'adherence_update', before, after, createdAt: timestamp, metadata: { calendarDayId, mealOccurrenceId, date: context.day.date, status } }, { repo, registry });
  return { day: nextDay, operation };
}

export async function commitGeneratedPreview(preview, { repo = repositories, registry, createdAt = null, kind = null } = {}) {
  if (preview?.status !== 'success') throw new Error('Only a successful preview can be committed');
  const timestamp = nowIso(createdAt || preview.planInstance.updatedAt); const planId = preview.planInstance.planInstanceId;
  const beforeMeta = await metaBefore(repo, ['activePlanInstanceId', 'lastSuccessfulGenerationRunId', 'planUpdatedAt']);
  const before = mutationSnapshot({ deletes: { generationRuns: [preview.generationRun.generationRunId], planInstances: [planId], calendarDays: preview.calendarDays.map(day => day.calendarDayId) }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { generationRuns: [preview.generationRun], planInstances: [preview.planInstance], calendarDays: preview.calendarDays }, metaSet: { activePlanInstanceId: planId, lastSuccessfulGenerationRunId: preview.generationRun.generationRunId, planUpdatedAt: preview.planInstance.updatedAt } });
  const operationKind = kind || (preview.generationRun.reason === 'horizon_extension' ? 'horizon_extension' : 'plan_create');
  const operation = await commitOperation({ planInstanceId: planId, kind: operationKind, before, after, createdAt: timestamp, metadata: { startDate: preview.planInstance.startDate, endDate: preview.planInstance.endDate, seed: preview.generationRun.seed, dayCount: preview.calendarDays.length } }, { repo, registry });
  return { planInstance: preview.planInstance, operation };
}

export async function createRebalancePreview({ planInstanceId, startDate, endDate, seed = 'rebalance', createdAt = null }, { repo = repositories, registry } = {}) {
  const plan = await repo.get('planInstances', planInstanceId); if (!plan) throw new Error(`PlanInstance ${planInstanceId} not found`);
  if (startDate < plan.startDate || endDate > plan.endDate || endDate < startDate) throw new Error('Rebalance range must be inside the selected PlanInstance');
  const sourceDays = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: startDate, upper: endDate });
  const selected = sourceDays.filter(day => day.planInstanceId === planInstanceId).sort((a, b) => a.date.localeCompare(b.date));
  if (!selected.length || selected[0].date !== startDate || selected.at(-1).date !== endDate) throw new Error('Rebalance range contains missing calendar days');
  const generated = await createPlanPreview({ horizon: { startDate, endDate }, seed, createdAt: createdAt || new Date().toISOString(), reason: 'rebalance', startCycleDayOverride: selected[0].cycleDay, historyPlanInstanceId: planInstanceId, previousGenerationRunIdOverride: plan.generationRunId, continuationPolicy: plan.continuationPolicy }, { repo, registry });
  if (generated.status === 'success') {
    generated.generationRun.diagnostics = { ...generated.generationRun.diagnostics, targetPlanInstanceId: planInstanceId, rebalanceRange: { startDate, endDate } };
    registry.assert('generationRun', generated.generationRun);
  }
  return { ...generated, sourcePlanInstanceId: planInstanceId, sourceDays: selected };
}

export async function commitRebalancePreview(preview, { selectedDates = null, repo = repositories, registry, createdAt = null } = {}) {
  if (preview?.status !== 'success' || !preview.sourcePlanInstanceId) throw new Error('Only a successful rebalance preview can be committed');
  const plan = await repo.get('planInstances', preview.sourcePlanInstanceId); if (!plan) throw new Error('Source plan no longer exists');
  const requested = new Set(selectedDates?.length ? selectedDates : preview.calendarDays.map(day => day.date));
  const generatedByDate = new Map(preview.calendarDays.map(day => [day.date, day]));
  for (const date of requested) if (!generatedByDate.has(date)) throw new Error(`Selected rebalance date ${date} is outside the preview`);
  const oldDays = (preview.sourceDays || []).filter(day => requested.has(day.date));
  if (!oldDays.length) throw new Error('Select at least one day to rebalance');
  const timestamp = nowIso(createdAt); const nextDays = oldDays.map(oldDay => {
    const generated = generatedByDate.get(oldDay.date); if (!generated) throw new Error(`Missing generated day ${oldDay.date}`);
    const next = clone(generated); next.calendarDayId = oldDay.calendarDayId; next.planInstanceId = plan.planInstanceId; next.createdAt = oldDay.createdAt; next.updatedAt = timestamp; return next;
  });
  for (const day of nextDays) registry.assert('calendarDay', day);
  const nextPlan = clone(plan); nextPlan.updatedAt = timestamp; registry.assert('planInstance', nextPlan);
  const run = clone(preview.generationRun); run.diagnostics = { ...run.diagnostics, committedDates: [...requested].sort(), targetPlanInstanceId: plan.planInstanceId }; registry.assert('generationRun', run);
  const beforeMeta = await metaBefore(repo, ['lastSuccessfulGenerationRunId', 'planUpdatedAt']);
  const before = mutationSnapshot({ puts: { calendarDays: oldDays, planInstances: [plan] }, deletes: { generationRuns: [run.generationRunId] }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { calendarDays: nextDays, planInstances: [nextPlan], generationRuns: [run] }, metaSet: { lastSuccessfulGenerationRunId: run.generationRunId, planUpdatedAt: timestamp } });
  const operation = await commitOperation({ planInstanceId: plan.planInstanceId, kind: 'rebalance', before, after, createdAt: timestamp, metadata: { startDate: preview.generationRun.horizon.startDate, endDate: preview.generationRun.horizon.endDate, selectedDates: [...requested].sort(), seed: run.seed, generationRunId: run.generationRunId } }, { repo, registry });
  return { calendarDays: nextDays, generationRun: run, operation };
}

export async function createInitialPreview(options, deps = {}) { return createPlanPreview(options, deps); }
export async function createExtensionPreview(planInstanceId, options = {}, deps = {}) { return extendPlan(planInstanceId, options, deps); }
export async function recentPlanOperations(deps = {}) { return listRecentOperations(deps); }
export async function undoPlanOperation(planInstanceId, deps = {}) { return undoLastOperation(planInstanceId, deps); }
export async function redoPlanOperation(planInstanceId, deps = {}) { return redoNextOperation(planInstanceId, deps); }
export async function planHistoryState(planInstanceId, deps = {}) { return historyState(planInstanceId, deps); }
