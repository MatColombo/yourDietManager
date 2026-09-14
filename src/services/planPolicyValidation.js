import { assertPreservedSlots, validateBatchLinks } from '../domain/productExtensions.js';
import { activeRecords, loadConfigurationBundle } from './configurationService.js';
import { currentFoodGroups } from './revisionV2Service.js';
import { evaluateFrequencies, frequencyHistoryDays, planOccurrences } from '../domain/frequencyCounter.js';
import { currentSafetyRevisionMap, assessRecipeSafety } from '../domain/safetyPolicy.js';
import { hardFilterRecipe } from '../planner/hardFilter.js';
import { calculateRecipeNutrition } from '../domain/nutritionCore.js';
import { addCivilDays, dayEnergyTarget, energyConstraintStatus, sumNutrition } from '../planner/planMath.js';

export async function activePlanChainIds(repo, extraId = null) {
  const ids = new Set();
  for (const root of [await repo.getMeta('activePlanInstanceId'), extraId]) {
    let id = root;
    while (id && !ids.has(id)) { ids.add(id); const plan = await repo.get('planInstances', id); id = plan?.previousPlanInstanceId; }
  }
  return ids;
}
export async function loadPlanPolicyContext(repo, { days = [], extraRecipes = [], planInstanceId = null } = {}) {
  const configuration = await loadConfigurationBundle(repo); const active = activeRecords(configuration);
  const chain = await activePlanChainIds(repo, planInstanceId);
  const dates = days.flatMap(day => [day.date, ...(day.mealSlots || []).map(slot => slot.civilDate || addCivilDays(day.date, slot.dayOffset || 0))]).sort();
  const radius = frequencyHistoryDays(active.foodPreferences);
  const existing = dates.length ? await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: addCivilDays(dates[0], -radius), upper: addCivilDays(dates.at(-1), radius) }) : await repo.getAll('calendarDays');
  const calendarDays = existing.filter(day => chain.has(day.planInstanceId));
  const productionBatches=await repo.getAll('productionBatches');
  const batchCalendarDays=await repo.getMany('calendarDays',[...new Set(productionBatches.flatMap(b=>b.assignments.map(a=>a.calendarDayId)))]);
  const versionIds = [...new Set([...calendarDays, ...days].flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
  const recipes = [...await repo.getMany('recipeVersions', [...new Set([...versionIds,...productionBatches.map(b=>b.recipeVersionId)])]), ...extraRecipes];
  const revisions = await repo.getMany('ingredientRevisions', [...new Set(recipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))]);
  const ingredients = await repo.getAll('ingredients'); const currentRevisions = await repo.getMany('ingredientRevisions', ingredients.map(family => family.currentRevisionId));
  return { configuration, active, calendarDays, productionBatches, batchCalendarDays, recipesByVersion: new Map(recipes.map(recipe => [recipe.recipeVersionId, recipe])),
    revisionById: new Map(revisions.map(revision => [revision.ingredientRevisionId, revision])),
    safetyRevisionById: currentSafetyRevisionMap(revisions, ingredients, [...revisions, ...currentRevisions]), foodGroups: await currentFoodGroups({ repo }),
    unresolved: new Set(((await repo.getMeta('contentMigration:4'))?.unresolved || []).map(row => row.ingredientId)) };
}
export function projectedPlanDays(days, context, { replacePlanInstanceId = null, includeFuture = true } = {}) {
  const changed = new Set(days.map(day => day.date)); const last = [...changed].sort().at(-1);
  return [...context.calendarDays.filter(day => (!changed.has(day.date) || (replacePlanInstanceId && day.planInstanceId !== replacePlanInstanceId)) && (includeFuture || day.date <= last)), ...days];
}
export function validatePlanPolicy(days, context, options = {}) {
  const violations = [];
  try { assertPreservedSlots(context.calendarDays,days); } catch(error) { violations.push({code:error.code}); }
  const { active, recipesByVersion, revisionById, safetyRevisionById, foodGroups } = context;
  for (const day of days) {
    const dayClass = active.dayClasses.find(item => item.id === day.dayClassId);
    if (!dayClass) { violations.push({ code: 'missing_day_class', date: day.date }); continue; }
    const calculated = [];
    for (const slot of day.mealSlots || []) {
      if (slot.civilDate !== addCivilDays(day.date, Number(slot.dayOffset || 0))) violations.push({ code: 'civil_date_mismatch', mealOccurrenceId: slot.mealOccurrenceId });
      const mealClass = active.mealClasses.find(item => item.id === slot.mealClassId);
      if (!mealClass) { violations.push({ code: 'missing_meal_class', mealOccurrenceId: slot.mealOccurrenceId }); continue; }
      if ((slot.recipeComponents?.length || 0) > (mealClass.maxComponents ?? 3)) violations.push({ code: 'too_many_components', mealOccurrenceId: slot.mealOccurrenceId });
      if (slot.mode === 'planned' && !slot.recipeComponents?.length) violations.push({ code: 'empty_planned_meal', mealOccurrenceId: slot.mealOccurrenceId });
      if (slot.mode === 'external' && slot.recipeComponents?.length) violations.push({ code: 'external_has_components', mealOccurrenceId: slot.mealOccurrenceId });
      for (const component of slot.recipeComponents || []) {
        const recipe = recipesByVersion.get(component.recipeVersionId);
        if (!recipe || recipe.recipeId !== component.recipeId || component.servings !== 1) { violations.push({ code: 'invalid_component_reference', mealOccurrenceId: slot.mealOccurrenceId }); continue; }
        if (recipe.ingredientLines.some(line => context.unresolved.has(line.ingredientId))) violations.push({ code: 'ingredient_mapping_unresolved', mealOccurrenceId: slot.mealOccurrenceId });
        const check = hardFilterRecipe(recipe, { mealClass, dayClass, allergyProfile: active.allergyProfile, foodPreferences: active.foodPreferences, revisionById, safetyRevisionById, foodGroups, date: slot.civilDate });
        for (const code of check.reasons) violations.push({ code, mealOccurrenceId: slot.mealOccurrenceId, date: slot.civilDate });
        try { calculated.push(calculateRecipeNutrition(recipe.ingredientLines, revisionById)); }
        catch (error) { violations.push({ code: 'invalid_nutrition_reference', detail: error.message, mealOccurrenceId: slot.mealOccurrenceId }); }
      }
    }
    const target = dayEnergyTarget(active.nutritionProfile, dayClass.dayArchetype);
    let external = 0;
    for (const slot of day.mealSlots.filter(slot => slot.mode === 'external')) {
      const original = dayClass.mealSlots.find(candidate => candidate.mealClassId === slot.mealClassId && candidate.time === slot.time && candidate.dayOffset === slot.dayOffset && candidate.mode === 'external');
      const budget = original?.energyBudgetKcal ?? (original?.energyShare != null ? target * original.energyShare : null);
      if (budget === null || original?.estimatedNutritionPolicy === 'unknown') violations.push({ code: 'external_energy_unknown', mealOccurrenceId: slot.mealOccurrenceId });
      external += budget || 0;
    }
    const energy = energyConstraintStatus(sumNutrition(calculated).energyKcal, target, active.nutritionProfile.energyTolerancePct, external);
    if (!energy.withinTolerance) violations.push({ code: 'daily_energy_tolerance', date: day.date, energy });
  }
  const projected = projectedPlanDays(days, context, options);
  const batchSources=[...new Map([...context.calendarDays,...(context.batchCalendarDays||[])].map(d=>[d.calendarDayId,d])).values()];
  const batchDays = [...batchSources.filter(d=>!days.some(n=>n.date===d.date&&n.planInstanceId===d.planInstanceId)),...days];
  const batches = [...(context.productionBatches||[]).filter(b=>!options.additionalBatches?.some(n=>n.batchId===b.batchId)),...(options.additionalBatches||[])];
  for(const batch of batches.filter(b=>batchDays.some(d=>d.planInstanceId===b.planInstanceId)))try{validateBatchLinks(batch,batchDays,recipesByVersion);}catch(error){violations.push({code:'batch_allocation',detail:error.message});}
  for(const day of days)for(const slot of day.mealSlots)for(const [componentIndex,c] of slot.recipeComponents.entries())if(c.productionBatchId&&!batches.some(b=>b.batchId===c.productionBatchId&&b.assignments.some(a=>a.calendarDayId===day.calendarDayId&&a.mealOccurrenceId===slot.mealOccurrenceId&&a.componentIndex===componentIndex)))violations.push({code:'batch_reference_missing'});
  const changedCivilDates = [...new Set([...planOccurrences(days).map(slot => slot.civilDate), ...days.map(day => day.date),
    ...context.calendarDays.filter(day => days.some(next => next.date === day.date)).flatMap(day => day.mealSlots.map(slot => slot.civilDate || day.date))])];
  const frequencies = evaluateFrequencies({ profile: active.foodPreferences, calendarDays: projected, recipesByVersion, revisionById, foodGroups, changedCivilDates });
  for (const window of frequencies.violations) violations.push({ code: 'frequency_window', ruleId: window.ruleId, interval: window.interval, window });
  return { valid: !violations.length, violations, frequencies };
}
export async function assertPlanPolicy(days, repo, options = {}) {
  const context = await loadPlanPolicyContext(repo, { days, planInstanceId: options.replacePlanInstanceId || null });
  const result = validatePlanPolicy(days, context, options);
  if (!result.valid) {
    const error = new Error(`Piano non ammissibile / Plan constraints not met: ${[...new Set(result.violations.map(row => row.ruleId ? `${row.code} (${row.ruleId})` : row.code))].join(', ')}`);
    error.code = 'plan_constraint_violation'; error.violations = result.violations; throw error;
  }
  return result;
}
export async function currentPlanSafetyOverlay(days, repo) {
  const context = await loadPlanPolicyContext(repo, { days }); const overlays = new Map();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: context.configuration.appConfig.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const day of days) for (const slot of day.mealSlots || []) {
    if (slot.mode === 'external') { overlays.set(slot.mealOccurrenceId, { status: 'unknown_external', rules: [], checkProductLabel: false }); continue; }
    const results = [];
    for (const component of slot.recipeComponents || []) {
      const recipe = context.recipesByVersion.get(component.recipeVersionId);
      results.push(recipe ? assessRecipeSafety(recipe, { allergyProfile: context.active.allergyProfile, revisionById: context.safetyRevisionById, foodGroups: context.foodGroups, date: slot.civilDate > today ? slot.civilDate : today }) : { status: 'unknown', rules: [{ reason: 'missing_recipe_reference' }] });
    }
    overlays.set(slot.mealOccurrenceId, { status: results.some(result => result.status === 'incompatible') ? 'incompatible' : results.some(result => result.status === 'unknown') ? 'unknown' : 'compatible',
      rules: results.flatMap(result => result.rules), checkProductLabel: results.some(result => result.checkProductLabel) });
  }
  return overlays;
}
