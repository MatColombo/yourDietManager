import { sha256Json } from '../lib/crypto.js';
import { ingredientSearchFields } from '../domain/ingredientPresentation.js';
import { ingredientProjection } from './ingredientConceptQuery.js';
import { loadPlanPolicyContext, validatePlanPolicy, currentPlanSafetyOverlay } from './planPolicyValidation.js';
import { frequencyHistoryDays } from '../domain/frequencyCounter.js';
import { previewContext, sealPreview, withValidatedPreview, replacementPreviewById, validatePlannedDays, validatedPreviewSnapshot, replaceSealedPreview } from './planPreviewGuard.js';
import { repositories } from '../repositories/repositoryHub.js';
import { loadConfigurationBundle, assertConfigurationBundle, activeRecords } from './configurationService.js';
import { PlanCandidateService, MAX_PLANNER_CANDIDATES_PER_ARCHETYPE } from './planCandidateService.js';
import { createPlanPreview, extendPlan, continuationState } from './planGenerationService.js';
import { hardFilterRecipe } from '../planner/hardFilter.js';
import { scoreRecipe } from '../planner/softScoring.js';
import { addCivilDays, dayEnergyTarget, sumNutrition, nutritionPenalty, energyConstraintStatus } from '../planner/planMath.js';
import { seededTie } from '../planner/seededRandom.js';
import { commitOperation, mutationSnapshot, listRecentOperations, undoLastOperation, redoNextOperation, historyState } from './operationHistoryService.js';
import { mealNutritionAffinity } from './nutritionalAffinityService.js';

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
  while (currentId && !seen.has(currentId)) {
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
  const overlays = await currentPlanSafetyOverlay(sourceDays, repo);
  const civilMeals = [];
  for (const sourceDay of sourceDays) {
    for (const slot of sourceDay.mealSlots || []) {
      if (slot.civilDate !== today) continue;
      civilMeals.push({ sourceDay, slot, safetyOverlay: overlays.get(slot.mealOccurrenceId), recipes: (slot.recipeComponents || []).map(component => recipeMap.get(component.recipeVersionId)).filter(Boolean) });
    }
  }
  civilMeals.sort((a, b) => a.slot.time.localeCompare(b.slot.time) || a.slot.mealOccurrenceId.localeCompare(b.slot.mealOccurrenceId));
  return { chain, latestPlan, dietDay, civilMeals, continuation: continuationState(latestPlan, today) };
}

export async function loadCalendarRange(startDate, endDate, { repo = repositories } = {}) {
  const chain = await loadPlanChain(repo);
  const days = await chainDays(repo, chain, startDate, endDate);
  return { chain, days, safetyOverlays: await currentPlanSafetyOverlay(days, repo) };
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

function dayEnergyConstraint(day, plannedEnergyKcal, nutritionProfile) {
  const target = Number(day.nutritionSummary?.target?.energyKcal || nutritionProfile.dailyEnergyKcal);
  const tolerance = Number(day.nutritionSummary?.target?.energyTolerancePct ?? nutritionProfile.energyTolerancePct ?? 0);
  const external = Number(day.nutritionSummary?.externalBudget?.energyKcal || 0);
  return energyConstraintStatus(plannedEnergyKcal, target, tolerance, external);
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
  const active = activeRecords(await loadConfigurationBundle(repo));
  const days = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: addCivilDays(date, -frequencyHistoryDays(active.foodPreferences)), upper: date });
  const filtered = days.filter(day => ids.has(day.planInstanceId));
  const recipes = await resolveRecipesForDays(repo, filtered); const history = [];
  for (const day of filtered) for (const slot of day.mealSlots || []) for (const component of slot.recipeComponents || []) {
    const recipe = recipes.get(component.recipeVersionId); if (recipe) history.push({ date: slot.civilDate || day.date, recipe });
  }
  return history;
}

export function replacementComponents(current, additions, componentIndex = null) {
  if (componentIndex !== null && (!Number.isInteger(componentIndex) || componentIndex < 0 || componentIndex >= current.length)) throw new Error('Invalid component selection');
  const incoming = additions.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 }));
  if (componentIndex === null) return incoming;
  if (incoming.length !== 1) throw new Error('A component replacement must contain one recipe');
  return current.map((component, index) => index === componentIndex ? incoming[0] : clone(component));
}

function componentNutrition(components, recipesByVersion) {
  const rows = [];
  for (const component of components || []) {
    const recipe = recipesByVersion.get(component.recipeVersionId);
    if (!recipe) continue;
    const servings = Number(component.servings ?? 1);
    rows.push(Object.fromEntries(Object.entries(recipe.calculatedNutrition || {}).map(([key, value]) => [key, Number(value || 0) * servings])));
  }
  return sumNutrition(rows);
}

function recipeTextMatches(recipe, revisionById, query) {
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const ingredientNames = (recipe.ingredientLines || []).flatMap(line => {
    const revision = revisionById.get(line.ingredientRevisionId);
    return [revision?.i18n?.it?.name, revision?.i18n?.en?.name, ...(revision?.i18n?.it?.aliases || []), ...(revision?.i18n?.en?.aliases || [])];
  });
  const haystack = normalize([recipe.i18n?.it?.title, recipe.i18n?.en?.title, ...ingredientNames].filter(Boolean).join(' '));
  return words.every(word => haystack.includes(word));
}

export async function createReplacementPreview({ planInstanceId, calendarDayId, mealOccurrenceId, seed = 'replace', limit = 8, offset = 0, query = '', conceptId = null, maxMinutes = null, componentIndex }, { repo = repositories, registry } = {}) {
  const contextHash = await previewContext(repo);
  const context = await loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry });
  if (context.occurrence.mode !== 'planned') throw new Error('External meal occurrences cannot be replaced with catalog recipes');
  if (componentIndex === undefined) componentIndex = context.occurrence.recipeComponents.length === 1 ? 0 : null;
  if (componentIndex !== null && (!Number.isInteger(componentIndex) || componentIndex < 0 || componentIndex >= context.occurrence.recipeComponents.length)) throw new Error('Invalid component selection');
  const current = context.occurrence.recipeComponents || [];
  const targetEnergy = slotEnergyTarget(dayClassSlot(context.dayClass, context.occurrence), context.mealClass, dayEnergyTarget(context.active.nutritionProfile, context.day.dayArchetype));
  const candidateService = new PlanCandidateService({ repo });
  const candidates = await candidateService.retrieve(context.mealClass.mealArchetype, { limit: MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, eligibilityContexts: [{ mealClass: context.mealClass, dayClass: context.dayClass, allergyProfile: context.active.allergyProfile, date: context.occurrence.civilDate }] });
  const byId = new Map(candidates.map(recipe => [recipe.recipeVersionId, recipe]));
  const policyContext = await loadPlanPolicyContext(repo, { days: [context.day], extraRecipes: candidates, planInstanceId });
  const projection = await ingredientProjection(repo);
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = recipe => {
    const revisions = (recipe.ingredientLines || []).map(line => policyContext.revisionById.get(line.ingredientRevisionId)).filter(Boolean);
    if (conceptId && !revisions.some(revision => revision.productTaxonomy?.conceptId === conceptId)) return false;
    const fields = [recipe.i18n?.it?.title, recipe.i18n?.en?.title, recipe.text?.it?.title, ...revisions.flatMap(revision => ingredientSearchFields(revision, projection.index))];
    return words.every(word => normalize(fields.join(' ')).includes(word));
  };
  const sets = candidates.filter(recipe => !current.some(c => c.recipeVersionId === recipe.recipeVersionId)).map(recipe => [recipe]);
  // Only explicit reviewed compositions may add several recipes. A bounded search is never a proof of impossibility.
  const compositions = await repo.getMeta('approvedMealCompositions') || [];
  if (componentIndex === null) for (const entry of compositions) {
    if (entry.status !== 'approved' || !entry.reviewedBy || !entry.reviewedAt || entry.mealArchetype !== context.mealClass.mealArchetype) continue;
    const ids = entry.recipeVersionIds || [];
    if (ids.length < 2 || ids.length > Number(context.mealClass.maxComponents || 3) || new Set(ids).size !== ids.length || !ids.every(id => byId.has(id))) continue;
    const recipes = ids.map(id => byId.get(id));
    if (entry.recipeContentDigest !== await sha256Json(recipes)) continue;
    sets.push(recipes);
  }
  const ranked = [], rejectionCounts = { ...candidateService.lastDiagnostics.hardRejectionCounts }; let rejectedByEnergy = 0;
  const beforeEnergy = Number(context.day.nutritionSummary?.knownPlanned?.energyKcal || 0);
  const currentMealNutrition = componentNutrition(current, policyContext.recipesByVersion);
  for (const recipes of sets) {
    if (!recipes.some(matches)) continue;
    if (maxMinutes !== null && recipes.reduce((sum, recipe) => sum + Number(recipe.practical?.prepMinutes || 0) + Number(recipe.practical?.cookMinutes || 0), 0) > Number(maxMinutes)) continue;
    const projected = clone(context.day);
    const components = replacementComponents(current, recipes, componentIndex);
    projected.mealSlots.find(slot => slot.mealOccurrenceId === mealOccurrenceId).recipeComponents = components;
    const policy = validatePlanPolicy([projected], policyContext, { replacePlanInstanceId: planInstanceId });
    if (!policy.valid) { for (const violation of policy.violations) { rejectionCounts[violation.code] = (rejectionCounts[violation.code] || 0) + 1; if (violation.code.includes('energy')) rejectedByEnergy++; } continue; }
    const nutrition = await recomputeDayNutrition(projected, context.active.nutritionProfile, repo);
    const energyConstraint = dayEnergyConstraint(projected, nutrition.knownPlanned.energyKcal, context.active.nutritionProfile);
    if (!energyConstraint.withinTolerance) { rejectedByEnergy++; continue; }
    const candidateMealNutrition = componentNutrition(components, policyContext.recipesByVersion);
    const affinity = mealNutritionAffinity(currentMealNutrition, candidateMealNutrition);
    ranked.push({ choiceId: recipes.map(recipe => recipe.recipeVersionId).join('+'), recipe: recipes[0], recipes, components, energyConstraint, energyDelta: nutrition.knownPlanned.energyKcal - beforeEnergy, mealNutrition: candidateMealNutrition, nutritionDelta: affinity.delta, affinityScore: affinity.score, affinityDistance: affinity.distance, score: { total: policy.frequencies.idealPenalty, frequencies: policy.frequencies }, tie: seededTie(seed, recipes.map(r => r.recipeVersionId).join('+')) });
  }
  ranked.sort((a, b) => a.affinityDistance - b.affinityDistance || a.score.total - b.score.total || Math.abs(a.energyDelta) - Math.abs(b.energyDelta) || a.tie - b.tie);
  const pageSize = Math.max(1, Math.min(8, Math.floor(Number(limit) || 8))); const pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const currentRecipeTitles = current.map(component => policyContext.recipesByVersion.get(component.recipeVersionId)?.i18n || {});
  return sealPreview({ mealLabel: context.mealClass.name, currentMealNutrition, retrieval: candidateService.lastDiagnostics, currentRecipeTitles: currentRecipeTitles.map(locales => Object.fromEntries(Object.entries(locales).map(([locale, text]) => [locale, text.title]))), status: 'success', planInstanceId, calendarDayId, mealOccurrenceId, targetEnergy, componentIndex,
    filters: { query, conceptId, maxMinutes }, offset: pageOffset, limit: pageSize, total: ranked.length, hasMore: pageOffset + pageSize < ranked.length,
    searchStatus: ranked.length ? 'success' : 'search_exhausted', rejectionCounts, currentComponents: clone(current),
    hardConstraints: { dailyEnergyTolerance: true, rejectedByEnergy }, candidates: ranked.slice(pageOffset, pageOffset + pageSize).map(({ tie, ...entry }) => clone(entry))
  }, contextHash, repo, 'replacement');
}

export async function createGenerationReplacementPreview({ generationPreview, mealOccurrenceId, seed = 'preview-replace', limit = 8, offset = 0, query = '' }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const sourceState = await validatedPreviewSnapshot(generationPreview, { repo, kind: 'generation' });
  const source = sourceState.preview;
  const sourceDay = source.calendarDays.find(day => (day.mealSlots || []).some(slot => slot.mealOccurrenceId === mealOccurrenceId));
  const sourceSlot = sourceDay?.mealSlots.find(slot => slot.mealOccurrenceId === mealOccurrenceId);
  if (!sourceDay || !sourceSlot || sourceSlot.mode !== 'planned') throw new Error('Planned meal occurrence not found in generation preview');
  const bundle = await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry); const active = activeRecords(bundle);
  const generationTuningOverlay = source.generationTuningOverlay || source.generationRun?.configSnapshot?.generationTuningOverlay || null;
  const dayClass = active.dayClasses.find(item => item.id === sourceDay.dayClassId); const mealClass = active.mealClasses.find(item => item.id === sourceSlot.mealClassId);
  if (!dayClass || !mealClass) throw new Error('Meal configuration not found');
  const candidateService = new PlanCandidateService({ repo });
  const candidates = await candidateService.retrieve(mealClass.mealArchetype, { limit: MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, foodPreferences: active.foodPreferences, eligibilityContexts: [{ mealClass, dayClass, allergyProfile: active.allergyProfile, generationTuningOverlay, date: sourceSlot.civilDate }] });
  const sourceDerived = source.derivedRecipeVersions || [];
  const policyContext = await loadPlanPolicyContext(repo, { days: source.calendarDays, extraRecipes: [...sourceDerived, ...candidates], planInstanceId: source.planInstance?.previousPlanInstanceId || null, generationTuningOverlay });
  const current = sourceSlot.recipeComponents || []; const currentIds = new Set(current.map(component => component.recipeVersionId));
  const currentMealNutrition = componentNutrition(current, policyContext.recipesByVersion);
  const ranked = []; const rejectionCounts = { ...candidateService.lastDiagnostics.hardRejectionCounts };
  for (const recipe of candidates) {
    if (currentIds.has(recipe.recipeVersionId) || !recipeTextMatches(recipe, policyContext.revisionById, query)) continue;
    const components = [{ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 }];
    const days = clone(source.calendarDays); const day = days.find(item => item.calendarDayId === sourceDay.calendarDayId); const slot = day.mealSlots.find(item => item.mealOccurrenceId === mealOccurrenceId); slot.recipeComponents = components;
    const policy = validatePlanPolicy(days, policyContext);
    if (!policy.valid) { for (const violation of policy.violations) rejectionCounts[violation.code] = (rejectionCounts[violation.code] || 0) + 1; continue; }
    day.nutritionSummary = await recomputeDayNutrition(day, active.nutritionProfile, repo, [...sourceDerived, recipe]);
    const candidateMealNutrition = componentNutrition(components, policyContext.recipesByVersion); const affinity = mealNutritionAffinity(currentMealNutrition, candidateMealNutrition);
    ranked.push({ choiceId: recipe.recipeVersionId, recipe, components, mealNutrition: candidateMealNutrition, nutritionDelta: affinity.delta, affinityScore: affinity.score, affinityDistance: affinity.distance, score: { total: policy.frequencies.idealPenalty, frequencies: policy.frequencies }, tie: seededTie(seed, recipe.recipeVersionId) });
  }
  ranked.sort((a, b) => a.affinityDistance - b.affinityDistance || a.score.total - b.score.total || a.tie - b.tie);
  const pageSize = Math.max(1, Math.min(8, Math.floor(Number(limit) || 8))); const pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  return sealPreview({ status: 'success', sourceGenerationPreviewId: generationPreview.previewId, mealOccurrenceId, calendarDayId: sourceDay.calendarDayId, mealLabel: mealClass.name, currentMealNutrition, query, offset: pageOffset, limit: pageSize, total: ranked.length, hasMore: pageOffset + pageSize < ranked.length, rejectionCounts, retrieval: candidateService.lastDiagnostics, candidates: ranked.slice(pageOffset, pageOffset + pageSize).map(({ tie, ...item }) => clone(item)) }, sourceState.contextHash, repo, 'generation_replacement');
}

export async function applyGenerationReplacementPreview({ generationPreview, replacementPreview, choiceId }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (replacementPreview.sourceGenerationPreviewId !== generationPreview.previewId) throw new Error('Replacement preview does not belong to this plan preview');
  return withValidatedPreview(replacementPreview, { repo, kind: 'generation_replacement', choice: choiceId }, async () => {
    const sourceState = await validatedPreviewSnapshot(generationPreview, { repo, kind: 'generation' }); const source = sourceState.preview;
    const selected = replacementPreview.candidates.find(item => item.choiceId === choiceId); if (!selected) throw new Error('Replacement candidate not found');
    const next = clone(source); const day = next.calendarDays.find(item => item.calendarDayId === replacementPreview.calendarDayId); const slot = day?.mealSlots.find(item => item.mealOccurrenceId === replacementPreview.mealOccurrenceId);
    if (!day || !slot) throw new Error('Plan preview changed after replacement search'); slot.recipeComponents = clone(selected.components);
    const bundle = await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry); const active = activeRecords(bundle);
    const sourceDerived = source.derivedRecipeVersions || [];
    day.nutritionSummary = await recomputeDayNutrition(day, active.nutritionProfile, repo, [...sourceDerived, selected.recipe]);
    const context = await loadPlanPolicyContext(repo, { days: next.calendarDays, extraRecipes: [...sourceDerived, selected.recipe], planInstanceId: next.planInstance?.previousPlanInstanceId || null, generationTuningOverlay: next.generationTuningOverlay || next.generationRun?.configSnapshot?.generationTuningOverlay || null }); const policy = validatePlanPolicy(next.calendarDays, context);
    if (!policy.valid) { const error = new Error(`Replacement no longer satisfies plan constraints: ${[...new Set(policy.violations.map(item => item.code))].join(', ')}`); error.code = 'plan_constraint_violation'; error.violations = policy.violations; throw error; }
    const edit = { type: 'nutrition_affinity_replace', mealOccurrenceId: replacementPreview.mealOccurrenceId, recipeVersionId: selected.recipe.recipeVersionId, affinityScore: selected.affinityScore, nutritionDelta: clone(selected.nutritionDelta) };
    next.diagnostics = { ...(next.diagnostics || {}), postGenerationEdits: [...(next.diagnostics?.postGenerationEdits || []), edit] };
    next.generationRun = { ...next.generationRun, diagnostics: { ...(next.generationRun?.diagnostics || {}), postGenerationEdits: [...(next.generationRun?.diagnostics?.postGenerationEdits || []), edit] } };
    registry.assert('calendarDay', day); registry.assert('generationRun', next.generationRun);
    return replaceSealedPreview(generationPreview, next, { repo, kind: 'generation' });
  });
}

export async function recomputeDayNutrition(day, nutritionProfile, repo, extraRecipes = []) {
  const componentIds = (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId));
  const ids = [...new Set(componentIds)]; const extraById = new Map((extraRecipes || []).map(recipe => [recipe.recipeVersionId, recipe]));
  const stored = await repo.getMany('recipeVersions', ids.filter(id => !extraById.has(id))); const byId = new Map([...stored, ...extraById.values()].map(recipe => [recipe.recipeVersionId, recipe]));
  const known = sumNutrition(componentIds.map(id => byId.get(id)).filter(Boolean));
  const dailyTarget = Number(day.nutritionSummary?.target?.energyKcal || nutritionProfile.dailyEnergyKcal);
  const plannedTarget = Number(day.nutritionSummary?.target?.plannedEnergyKcal || dailyTarget);
  const nutrientTargetFactor = plannedTarget / Math.max(1, dailyTarget);
  const score = nutritionPenalty(known, nutritionProfile, { energyTarget: plannedTarget, energyWeight: 3, nutrientTargetFactor });
  return { ...clone(day.nutritionSummary), knownPlanned: known, score: Math.round(score * 1000) / 1000 };
}

async function metaBefore(repo, keys) {
  const metaSet = {}; const metaDelete = [];
  for (const key of keys) { const value = await repo.getMeta(key); if (value === undefined) metaDelete.push(key); else metaSet[key] = value; }
  return { metaSet, metaDelete };
}

export async function commitReplacement(options, { repo = repositories, registry } = {}) {
  if (!options.previewId) throw new Error('Selected replacement is not an admissible candidate: preview required');
  const preview = replacementPreviewById(repo, options.previewId);
  if (['planInstanceId', 'calendarDayId', 'mealOccurrenceId'].some(key => options[key] !== preview[key])) throw new Error('Replacement target differs from preview');
  return withValidatedPreview(preview, { repo, kind: 'replacement', choice: options.choiceId || options.recipeVersionId }, recheck => commitReplacementCurrent({ ...options, selected: preview.candidates.find(item => (item.choiceId || item.recipe.recipeVersionId) === (options.choiceId || options.recipeVersionId)) }, { repo, registry, recheck }));
}

async function commitReplacementCurrent({ planInstanceId, calendarDayId, mealOccurrenceId, recipeVersionId, selected, createdAt = null }, { repo, registry, recheck }) {
  const context = await loadEditContext(planInstanceId, calendarDayId, mealOccurrenceId, { repo, registry });
  if (context.occurrence.mode !== 'planned') throw new Error('External meal occurrences cannot be replaced with catalog recipes');
  if (!selected?.components?.length) throw new Error('Selected replacement is not an admissible candidate');
  const timestamp = nowIso(createdAt); const nextDay = clone(context.day); const nextPlan = clone(context.plan);
  const slot = nextDay.mealSlots.find(item => item.mealOccurrenceId === mealOccurrenceId);
  const previousComponents = clone(slot.recipeComponents);
  slot.recipeComponents = clone(selected.components); slot.adherenceStatus = 'not_recorded';
  // Written notes remain attached to this occurrence; unsaved UI drafts are separate.
  nextDay.status = deriveDayStatus(nextDay.mealSlots); nextDay.updatedAt = timestamp; nextDay.nutritionSummary = await recomputeDayNutrition(nextDay, context.active.nutritionProfile, repo);
  const replacementEnergyConstraint = dayEnergyConstraint(nextDay, nextDay.nutritionSummary.knownPlanned.energyKcal, context.active.nutritionProfile);
  if (!replacementEnergyConstraint.withinTolerance) throw new Error(`Selected replacement violates daily energy tolerance (${replacementEnergyConstraint.budgetedTotalKcal} kcal; allowed ${replacementEnergyConstraint.dailyMinKcal}-${replacementEnergyConstraint.dailyMaxKcal})`);
  await validatePlannedDays([nextDay], repo, { replacePlanInstanceId: planInstanceId });
  nextPlan.updatedAt = timestamp;
  registry.assert('calendarDay', nextDay); registry.assert('planInstance', nextPlan);
  const beforeMeta = await metaBefore(repo, ['planUpdatedAt']);
  const before = mutationSnapshot({ puts: { calendarDays: [context.day], planInstances: [context.plan] }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { calendarDays: [nextDay], planInstances: [nextPlan] }, metaSet: { planUpdatedAt: timestamp } });
  const operation = await commitOperation({ planInstanceId, kind: 'replace_meal', before, after, createdAt: timestamp, metadata: { calendarDayId, mealOccurrenceId, date: context.day.date, beforeRecipeVersionIds: previousComponents.map(item => item.recipeVersionId), afterRecipeVersionIds: slot.recipeComponents.map(item => item.recipeVersionId) } }, { repo, registry, beforeCommit: recheck });
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
  return withValidatedPreview(preview, { repo, kind: 'generation' }, async recheck => {
    await validatePlannedDays(preview.calendarDays, repo, { extraRecipes: preview.derivedRecipeVersions || [], replacePlanInstanceId: preview.planInstance?.previousPlanInstanceId || null, generationTuningOverlay: preview.generationTuningOverlay || preview.generationRun?.configSnapshot?.generationTuningOverlay || null });
    return commitGeneratedCurrent(preview, { repo, registry, createdAt, kind, recheck });
  });
}

async function commitGeneratedCurrent(preview, { repo, registry, createdAt, kind, recheck }) {
  if (preview?.status !== 'success') throw new Error('Only a successful preview can be committed');
  const timestamp = nowIso(createdAt || preview.planInstance.updatedAt); const planId = preview.planInstance.planInstanceId;
  const beforeMeta = await metaBefore(repo, ['activePlanInstanceId', 'lastSuccessfulGenerationRunId', 'planUpdatedAt']);
  const derivedRecipeVersions = preview.derivedRecipeVersions || [];
  for (const version of derivedRecipeVersions) registry.assert('recipeVersion', version);
  const before = mutationSnapshot({ deletes: { generationRuns: [preview.generationRun.generationRunId], planInstances: [planId], calendarDays: preview.calendarDays.map(day => day.calendarDayId), recipeVersions: derivedRecipeVersions.map(version => version.recipeVersionId) }, ...beforeMeta });
  const after = mutationSnapshot({ puts: { generationRuns: [preview.generationRun], planInstances: [preview.planInstance], calendarDays: preview.calendarDays, recipeVersions: derivedRecipeVersions }, metaSet: { activePlanInstanceId: planId, lastSuccessfulGenerationRunId: preview.generationRun.generationRunId, planUpdatedAt: preview.planInstance.updatedAt } });
  const operationKind = kind || (preview.generationRun.reason === 'horizon_extension' ? 'horizon_extension' : 'plan_create');
  const operation = await commitOperation({ planInstanceId: planId, kind: operationKind, before, after, createdAt: timestamp, metadata: { startDate: preview.planInstance.startDate, endDate: preview.planInstance.endDate, seed: preview.generationRun.seed, dayCount: preview.calendarDays.length } }, { repo, registry, beforeCommit: recheck });
  return { planInstance: preview.planInstance, operation };
}


function plannedRecipeIdsByOccurrence(days) {
  const result = {};
  for (const day of days || []) for (const slot of day.mealSlots || []) {
    if (slot.mode !== 'planned') continue;
    result[slot.mealOccurrenceId] = (slot.recipeComponents || []).map(component => component.recipeVersionId).sort();
  }
  return result;
}

function summarizeRegeneration(sourceDays, generatedDays, { mode, strictAttempt = null } = {}) {
  const before = plannedRecipeIdsByOccurrence(sourceDays);
  const after = plannedRecipeIdsByOccurrence(generatedDays);
  const details = [];
  let changedSlots = 0;
  let unchangedSlots = 0;
  for (const [mealOccurrenceId, previousRecipeVersionIds] of Object.entries(before)) {
    const nextRecipeVersionIds = after[mealOccurrenceId] || [];
    const changed = previousRecipeVersionIds.join('|') !== nextRecipeVersionIds.join('|');
    if (changed) changedSlots += 1;
    else unchangedSlots += 1;
    details.push({
      mealOccurrenceId,
      changed,
      previousRecipeVersionIds,
      nextRecipeVersionIds,
      reason: changed ? 'alternative_selected' : mode === 'recalculate'
        ? 'recalculate_mode_same_result_allowed'
        : strictAttempt && !['success', 'cancelled'].includes(strictAttempt.status)
          ? 'retained_after_strict_alternative_failed_in_bounded_search'
          : 'retained_by_bounded_search'
    });
  }
  return {
    mode,
    totalPlannedSlots: details.length,
    changedSlots,
    unchangedSlots,
    status: unchangedSlots === 0 ? 'all_changed' : changedSlots === 0 ? 'unchanged' : 'partial',
    boundedSearch: true,
    strictAttemptStatus: strictAttempt?.status || (mode === 'alternative' ? 'success' : 'not_applicable'),
    strictFailure: strictAttempt && !['success', 'cancelled'].includes(strictAttempt.status) ? {
      code: strictAttempt.failure?.code || 'no_feasible_plan',
      reason: strictAttempt.failure?.reason || strictAttempt.failure?.detail || 'strict_alternative_not_found_in_bounded_search'
    } : null,
    details
  };
}

export async function createRebalancePreview({ planInstanceId, startDate, endDate, seed = 'rebalance', createdAt = null, mode = 'alternative', signal = null, onProgress = null, searchBudget = null }, { repo = repositories, registry } = {}) {
  const contextHash = await previewContext(repo);
  if (!['alternative', 'recalculate'].includes(mode)) throw new Error(`Unknown rebalance mode ${mode}`);
  const plan = await repo.get('planInstances', planInstanceId); if (!plan) throw new Error(`PlanInstance ${planInstanceId} not found`);
  if (startDate < plan.startDate || endDate > plan.endDate || endDate < startDate) throw new Error('Rebalance range must be inside the selected PlanInstance');
  const sourceDays = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: startDate, upper: endDate });
  const selected = sourceDays.filter(day => day.planInstanceId === planInstanceId).sort((a, b) => a.date.localeCompare(b.date));
  if (!selected.length || selected[0].date !== startDate || selected.at(-1).date !== endDate) throw new Error('Rebalance range contains missing calendar days');

  const fixedSlots = selected.flatMap(day=>day.mealSlots.filter(slot=>slot.locked||slot.recipeComponents.some(c=>c.productionBatchId)).map(slot=>({date:day.date,slot})));
  const currentRecipeVersionIdsByOccurrence = plannedRecipeIdsByOccurrence(selected);
  for(const entry of fixedSlots)delete currentRecipeVersionIdsByOccurrence[entry.slot.mealOccurrenceId];
  const baseOptions = {
    horizon: { startDate, endDate }, fixedSlots, seed, signal, onProgress, searchBudget, createdAt: createdAt || new Date().toISOString(), reason: 'rebalance',
    startCycleDayOverride: selected[0].cycleDay, historyPlanInstanceId: planInstanceId,
    previousGenerationRunIdOverride: plan.generationRunId, continuationPolicy: plan.continuationPolicy
  };

  let strictAttempt = null;
  let generated;
  if (mode === 'alternative') {
    strictAttempt = await createPlanPreview({
      ...baseOptions,
      regenerationPolicy: { mode: 'exclude_current', currentRecipeVersionIdsByOccurrence }
    }, { repo, registry });
    generated = ['success', 'cancelled'].includes(strictAttempt.status) ? strictAttempt : await createPlanPreview({
      ...baseOptions,
      regenerationPolicy: { mode: 'prefer_alternative', currentRecipePenalty: 100, currentRecipeVersionIdsByOccurrence }
    }, { repo, registry });
  } else {
    generated = await createPlanPreview(baseOptions, { repo, registry });
  }

  if (generated.status === 'success') {
    generated.calendarDays = generated.calendarDays.map(day=>{const old=selected.find(d=>d.date===day.date);return {...day,calendarDayId:old.calendarDayId,planInstanceId:old.planInstanceId,createdAt:old.createdAt};});
    const regenerationSummary = summarizeRegeneration(selected, generated.calendarDays, { mode, strictAttempt });
    generated.regenerationSummary = regenerationSummary;
    generated.generationRun.diagnostics = {
      ...generated.generationRun.diagnostics,
      targetPlanInstanceId: planInstanceId,
      rebalanceRange: { startDate, endDate },
      regeneration: regenerationSummary
    };
    registry.assert('generationRun', generated.generationRun);
  } else if (mode === 'alternative' && strictAttempt && !['success', 'cancelled'].includes(strictAttempt.status)) {
    generated.diagnostics = {
      ...generated.diagnostics,
      regeneration: {
        mode,
        boundedSearch: true,
        strictAttemptStatus: 'failed',
        strictFailure: {
          code: strictAttempt.failure?.code || 'no_feasible_plan',
          reason: strictAttempt.failure?.reason || strictAttempt.failure?.detail || 'strict_alternative_not_found_in_bounded_search'
        },
        fallbackStatus: generated.status
      }
    };
  }
  const { previewId, ...unsealed } = generated;
  return sealPreview({ ...unsealed, rebalanceMode: mode, sourcePlanInstanceId: planInstanceId, sourceDays: selected }, contextHash, repo, 'rebalance');
}

export async function commitRebalancePreview(preview, { selectedDates = null, repo = repositories, registry, createdAt = null } = {}) {
  return withValidatedPreview(preview, { repo, kind: 'rebalance' }, async recheck => {
    if (selectedDates && !selectedDates.length) throw new Error('Select at least one day to rebalance');
    await validatePlannedDays(preview.calendarDays.filter(day => !selectedDates || selectedDates.includes(day.date)), repo, { replacePlanInstanceId: preview.sourcePlanInstanceId });
    return commitRebalanceCurrent(preview, { selectedDates, repo, registry, createdAt, recheck });
  });
}

async function commitRebalanceCurrent(preview, { selectedDates, repo, registry, createdAt, recheck }) {
  if (preview?.status !== 'success' || !preview.sourcePlanInstanceId) throw new Error('Only a successful rebalance preview can be committed');
  const plan = await repo.get('planInstances', preview.sourcePlanInstanceId); if (!plan) throw new Error('Source plan no longer exists');
  const requested = new Set(selectedDates?.length ? selectedDates : preview.calendarDays.map(day => day.date));
  const generatedByDate = new Map(preview.calendarDays.map(day => [day.date, day]));
  for (const date of requested) if (!generatedByDate.has(date)) throw new Error(`Selected rebalance date ${date} is outside the preview`);
  const authoritativeDays = await repo.getMany('calendarDays', (preview.sourceDays || []).map(day => day.calendarDayId));
  const oldDays = authoritativeDays.filter(day => day.planInstanceId === plan.planInstanceId && requested.has(day.date));
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
  const operation = await commitOperation({ planInstanceId: plan.planInstanceId, kind: 'rebalance', before, after, createdAt: timestamp, metadata: { startDate: preview.generationRun.horizon.startDate, endDate: preview.generationRun.horizon.endDate, selectedDates: [...requested].sort(), seed: run.seed, generationRunId: run.generationRunId, rebalanceMode: preview.rebalanceMode || 'alternative', regenerationSummary: preview.regenerationSummary || null } }, { repo, registry, beforeCommit: recheck });
  return { calendarDays: nextDays, generationRun: run, operation };
}

export async function createInitialPreview(options, deps = {}) { return createPlanPreview(options, deps); }
export async function createExtensionPreview(planInstanceId, options = {}, deps = {}) { return extendPlan(planInstanceId, options, deps); }
export async function recentPlanOperations(deps = {}) { return listRecentOperations(deps); }
export async function undoPlanOperation(planInstanceId, deps = {}) { return undoLastOperation(planInstanceId, deps); }
export async function redoPlanOperation(planInstanceId, deps = {}) { return redoNextOperation(planInstanceId, deps); }
export async function planHistoryState(planInstanceId, deps = {}) { return historyState(planInstanceId, deps); }
