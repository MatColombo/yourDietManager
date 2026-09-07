import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../src/services/configurationService.js';
import {
  createInitialPreview, commitGeneratedPreview, createReplacementPreview, commitReplacement,
  createRebalancePreview, commitRebalancePreview, updateAdherence, undoPlanOperation, redoPlanOperation,
  loadEffectivePlanState, planHistoryState
} from '../src/services/effectivePlanService.js';
import {
  calculateShoppingList, createShoppingChecklist, shoppingChecklistStaleness,
  refreshShoppingChecklist, updateShoppingChecklistItem, buildPreparationHorizon
} from '../src/services/shoppingService.js';
import { MemoryRepository, fileLoader, fileFetch } from './helpers.mjs';

const root = process.cwd();
const START = '2026-09-07';
const END = '2026-09-13';
const CONTINUATION = { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 };

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  return { repo, registry };
}

function recipeVersionIds(preview) {
  return preview.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId)));
}

async function selectedRecipes(repo, preview) {
  return repo.getMany('recipeVersions', [...new Set(recipeVersionIds(preview))]);
}

async function recipeFoodCategories(repo, recipes) {
  const revisionIds = [...new Set(recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)))];
  const revisions = await repo.getMany('ingredientRevisions', revisionIds);
  const byId = new Map(revisions.map(item => [item.ingredientRevisionId, item]));
  const byRecipe = new Map();
  for (const recipe of recipes) {
    const categories = new Set();
    for (const line of recipe.ingredientLines || []) {
      const taxonomy = byId.get(line.ingredientRevisionId)?.taxonomy;
      if (taxonomy?.foodGroup) categories.add(taxonomy.foodGroup);
      if (taxonomy?.foodSubgroup) categories.add(taxonomy.foodSubgroup);
    }
    byRecipe.set(recipe.recipeVersionId, categories);
  }
  return byRecipe;
}

async function defaultPreview(repo, registry, seed = 'v1-step2-default') {
  return createInitialPreview({
    horizon: { startDate: START, endDate: END }, seed,
    createdAt: '2026-09-07T08:00:00.000Z', continuationPolicy: CONTINUATION
  }, { repo, registry });
}

function plannedSlots(preview) {
  return preview.calendarDays.flatMap(day => day.mealSlots.filter(slot => slot.mode === 'planned').map(slot => ({ day, slot })));
}

function recipeHasAllergen(recipe, allergen) { return (recipe.allergenIds || []).includes(allergen); }

async function assertNoAllergenInStoredPlan(repo, allergen) {
  const days = await repo.getAll('calendarDays');
  const ids = [...new Set(days.flatMap(day => day.mealSlots.flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
  const recipes = await repo.getMany('recipeVersions', ids);
  assert.equal(recipes.filter(recipe => recipeHasAllergen(recipe, allergen)).length, 0);
}

test('Step2 A — default 7-day plan is deterministic, complete, within energy tolerance and reloadable', async () => {
  const { repo, registry } = await fixture();
  const first = await defaultPreview(repo, registry, 'v1-step2-a');
  const second = await defaultPreview(repo, registry, 'v1-step2-a');
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  assert.deepEqual(recipeVersionIds(first), recipeVersionIds(second));
  assert.equal(first.calendarDays.length, 7);
  assert.equal(first.calendarDays.reduce((sum, day) => sum + day.mealSlots.length, 0), 28);
  assert.ok(new Set(recipeVersionIds(first)).size >= 14, 'seven-day plan should contain meaningful recipe variety');
  for (const day of first.calendarDays) {
    const known = day.nutritionSummary.knownPlanned.energyKcal;
    const target = day.nutritionSummary.target.plannedEnergyKcal;
    assert.ok(Math.abs(known - target) / target <= 0.10, `${day.date} energy outside configured tolerance`);
  }
  const recipes = await selectedRecipes(repo, first);
  assert.equal(recipes.length, new Set(recipeVersionIds(first)).size);
  const revisionIds = [...new Set(recipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))];
  assert.equal((await repo.getMany('ingredientRevisions', revisionIds)).length, revisionIds.length);
  await commitGeneratedPreview(first, { repo, registry, createdAt: '2026-09-07T08:00:01.000Z' });
  const reloaded = await loadEffectivePlanState(START, { repo });
  assert.equal(reloaded.latestPlan.planInstanceId, first.planInstance.planInstanceId);
  assert.equal(reloaded.dietDay.calendarDayId, first.calendarDays[0].calendarDayId);
  assert.equal(reloaded.civilMeals.length, 4);
});

test('Step2 B — vegetarian auto-exclusions hold during generation and replacement', async () => {
  const { repo, registry } = await fixture();
  const bundle = await loadConfigurationBundle(repo);
  const preferences = bundle.foodPreferences.find(item => item.id === bundle.appConfig.foodPreferencesId);
  const excluded = ['food_group_meat', 'food_group_poultry', 'food_group_fish_seafood'];
  preferences.rules = excluded.map((targetId, index) => ({ id: `vegetarian-${index + 1}`, targetType: 'foodCategory', targetId, level: 'rarely', autoExclude: true }));
  await saveConfigurationBundle(bundle, { repo, registry });

  const preview = await defaultPreview(repo, registry, 'v1-step2-b');
  assert.equal(preview.status, 'success');
  const recipes = await selectedRecipes(repo, preview);
  const categories = await recipeFoodCategories(repo, recipes);
  for (const recipe of recipes) {
    assert.ok(recipe.tags?.diet?.includes('diet_vegetarian'), `${recipe.recipeVersionId} missing vegetarian semantic tag`);
    for (const target of excluded) assert.equal(categories.get(recipe.recipeVersionId).has(target), false, `${recipe.recipeVersionId} violates ${target}`);
  }

  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:10:01.000Z' });
  const { day, slot } = plannedSlots(preview)[0];
  const replacement = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: 'v1-step2-b-replace', limit: 8 }, { repo, registry });
  assert.ok(replacement.candidates.length > 0);
  const replacementCategories = await recipeFoodCategories(repo, replacement.candidates.map(item => item.recipe));
  for (const item of replacement.candidates) for (const target of excluded) assert.equal(replacementCategories.get(item.recipe.recipeVersionId).has(target), false);
});

test('Step2 C — hard milk allergy survives generation, replacement and rebalance', async () => {
  const { repo, registry } = await fixture();
  const bundle = await loadConfigurationBundle(repo);
  const allergy = bundle.allergyIntoleranceProfiles.find(item => item.id === bundle.appConfig.allergyIntoleranceProfileId);
  allergy.rules = [{ id: 'hard-milk', kind: 'allergy', targetType: 'allergen', targetId: 'milk', label: 'Milk', enabled: true, notes: '' }];
  await saveConfigurationBundle(bundle, { repo, registry });

  const preview = await defaultPreview(repo, registry, 'v1-step2-c');
  assert.equal(preview.status, 'success');
  assert.equal((await selectedRecipes(repo, preview)).filter(recipe => recipeHasAllergen(recipe, 'milk')).length, 0);
  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:20:01.000Z' });

  const { day, slot } = plannedSlots(preview)[0];
  const replacement = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: 'v1-step2-c-replace', limit: 8 }, { repo, registry });
  assert.ok(replacement.candidates.length > 0);
  assert.equal(replacement.candidates.filter(item => recipeHasAllergen(item.recipe, 'milk')).length, 0);
  await commitReplacement({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, recipeVersionId: replacement.candidates[0].recipe.recipeVersionId, createdAt: '2026-09-07T08:21:00.000Z' }, { repo, registry });

  const rebalance = await createRebalancePreview({ planInstanceId: day.planInstanceId, startDate: START, endDate: '2026-09-08', seed: 'v1-step2-c-rebalance', createdAt: '2026-09-07T08:22:00.000Z' }, { repo, registry });
  assert.equal(rebalance.status, 'success');
  assert.equal((await selectedRecipes(repo, rebalance)).filter(recipe => recipeHasAllergen(recipe, 'milk')).length, 0);
  await commitRebalancePreview(rebalance, { repo, registry, createdAt: '2026-09-07T08:23:00.000Z' });
  await assertNoAllergenInStoredPlan(repo, 'milk');
});

async function configureOfficeCarryover(repo, registry) {
  const bundle = await loadConfigurationBundle(repo);
  const mini = { schemaVersion: 1, id: 'mc-mini', name: 'Mini', abbreviation: 'MI', mealArchetype: 'mini_meal', energyShare: { target: 0.1, min: 0.05, max: 0.2 }, rules: [] };
  const strictCapabilities = { fridge: 'unknown', reheating: 'unknown', cooking: false, complexSnack: false, portabilityRequired: true, maxPrepMinutes: 10 };
  const office = {
    schemaVersion: 1, id: 'dc-office', name: 'Office', abbreviation: 'OF', color: '#335577', dayArchetype: 'day',
    workWindows: [{ start: '09:00', end: '18:00', endDayOffset: 0 }], capabilities: strictCapabilities,
    mealSlots: [
      { id: 'office-breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.2, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'office-lunch', mealClassId: 'mc-lunch', time: '13:00', dayOffset: 0, mode: 'external', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null, estimatedNutritionPolicy: 'budget_only' },
      { id: 'office-dinner', mealClassId: 'mc-dinner', time: '20:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.35, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'office-carry', mealClassId: 'mc-mini', time: '01:00', dayOffset: 1, mode: 'planned', energyBudgetKcal: null, energyShare: 0.1, guidanceKeys: [], parallel: false, proteinMinG: null }
    ]
  };
  const home = {
    schemaVersion: 1, id: 'dc-home', name: 'Home', abbreviation: 'HO', color: '#557733', dayArchetype: 'day', workWindows: [],
    capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 45 },
    mealSlots: [
      { id: 'home-breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.2, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'home-lunch', mealClassId: 'mc-lunch', time: '13:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.35, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'home-snack', mealClassId: 'mc-snack', time: '17:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.1, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'home-dinner', mealClassId: 'mc-dinner', time: '20:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.35, guidanceKeys: [], parallel: false, proteinMinG: null }
    ]
  };
  bundle.mealClasses = [...bundle.mealClasses.filter(item => item.id !== mini.id), mini];
  bundle.dayClasses = [office, home];
  bundle.cycles = [{ schemaVersion: 1, id: 'cycle-office-home', name: 'Office/Home', length: 2, days: [{ cycleDay: 1, dayClassId: office.id }, { cycleDay: 2, dayClassId: home.id }] }];
  bundle.appConfig.mealClassIds = ['mc-breakfast', 'mc-lunch', 'mc-dinner', 'mc-snack', 'mc-mini'];
  bundle.appConfig.dayClassIds = [office.id, home.id];
  bundle.appConfig.cycleId = 'cycle-office-home';
  return saveConfigurationBundle(bundle, { repo, registry });
}

test('Step2 D — configurable external meal, capability filtering and carry-over civil date work together', async () => {
  const { repo, registry } = await fixture();
  await configureOfficeCarryover(repo, registry);
  const preview = await createInitialPreview({
    horizon: { startDate: START, endDate: '2026-09-08' }, seed: 'v1-step2-d', createdAt: '2026-09-07T08:30:00.000Z',
    continuationPolicy: { mode: 'fixed', triggerDaysBeforeEnd: 1, extensionDays: 2 }
  }, { repo, registry });
  assert.equal(preview.status, 'success', JSON.stringify(preview.failure));
  const officeDay = preview.calendarDays[0];
  const external = officeDay.mealSlots.find(slot => slot.mode === 'external');
  assert.ok(external);
  assert.equal(external.recipeComponents.length, 0);
  assert.equal(external.externalEstimate.policy, 'budget_only');
  const carry = officeDay.mealSlots.find(slot => slot.dayOffset === 1);
  assert.ok(carry);
  assert.equal(carry.civilDate, '2026-09-08');
  assert.equal(carry.time, '01:00');

  const officeRecipeIds = officeDay.mealSlots.filter(slot => slot.mode === 'planned').flatMap(slot => slot.recipeComponents.map(component => component.recipeVersionId));
  const officeRecipes = await repo.getMany('recipeVersions', officeRecipeIds);
  for (const recipe of officeRecipes) {
    assert.equal(recipe.practical.portable, true);
    assert.ok(recipe.practical.prepMinutes <= 10);
  }

  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:30:01.000Z' });
  const nextCivilDay = await loadEffectivePlanState('2026-09-08', { repo });
  assert.ok(nextCivilDay.civilMeals.some(item => item.sourceDay.date === START && item.slot.mealOccurrenceId === carry.mealOccurrenceId));
  const shopping = await calculateShoppingList({ startCivilDate: START, endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo });
  const expectedPlanned = preview.calendarDays.flatMap(day => day.mealSlots).filter(slot => slot.mode === 'planned' && slot.civilDate >= START && slot.civilDate <= '2026-09-08').length;
  assert.equal(shopping.occurrenceCount, expectedPlanned);
  assert.ok(shopping.items.every(item => !item.sourceMealOccurrenceIds.includes(external.mealOccurrenceId)));
});

test('Step2 E — replacement, adherence, rebalance, undo/redo and reload preserve an effective plan', async () => {
  const { repo, registry } = await fixture();
  const preview = await defaultPreview(repo, registry, 'v1-step2-e');
  assert.equal(preview.status, 'success');
  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:40:01.000Z' });
  const planId = preview.planInstance.planInstanceId;
  const day = preview.calendarDays[0];
  const slot = day.mealSlots.find(item => item.mode === 'planned');
  const originalRecipeId = slot.recipeComponents[0].recipeVersionId;

  const replacement = await createReplacementPreview({ planInstanceId: planId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: 'v1-step2-e-replace', limit: 8 }, { repo, registry });
  assert.ok(replacement.candidates.length > 0);
  const replacementId = replacement.candidates[0].recipe.recipeVersionId;
  assert.notEqual(replacementId, originalRecipeId);
  await commitReplacement({ planInstanceId: planId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, recipeVersionId: replacementId, createdAt: '2026-09-07T08:41:00.000Z' }, { repo, registry });
  let stored = await repo.get('calendarDays', day.calendarDayId);
  assert.equal(stored.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).recipeComponents[0].recipeVersionId, replacementId);

  await undoPlanOperation(planId, { repo, registry, at: '2026-09-07T08:42:00.000Z' });
  stored = await repo.get('calendarDays', day.calendarDayId);
  assert.equal(stored.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).recipeComponents[0].recipeVersionId, originalRecipeId);
  assert.equal(await repo.getMeta('planUpdatedAt'), '2026-09-07T08:42:00.000Z');
  await redoPlanOperation(planId, { repo, registry, at: '2026-09-07T08:43:00.000Z' });
  stored = await repo.get('calendarDays', day.calendarDayId);
  assert.equal(stored.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).recipeComponents[0].recipeVersionId, replacementId);
  assert.equal(await repo.getMeta('planUpdatedAt'), '2026-09-07T08:43:00.000Z');

  const adherence = await updateAdherence({ planInstanceId: planId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'followed', notes: 'step2', createdAt: '2026-09-07T08:44:00.000Z' }, { repo, registry });
  assert.equal(adherence.day.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).adherenceStatus, 'followed');
  const secondDay = preview.calendarDays[1];
  const rebalance = await createRebalancePreview({ planInstanceId: planId, startDate: secondDay.date, endDate: secondDay.date, seed: 'v1-step2-e-rebalance', createdAt: '2026-09-07T08:45:00.000Z' }, { repo, registry });
  assert.equal(rebalance.status, 'success');
  await commitRebalancePreview(rebalance, { repo, registry, createdAt: '2026-09-07T08:46:00.000Z' });

  const reloaded = await loadEffectivePlanState(START, { repo });
  assert.equal(reloaded.latestPlan.planInstanceId, planId);
  const reloadedSlot = reloaded.dietDay.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId);
  assert.equal(reloadedSlot.recipeComponents[0].recipeVersionId, replacementId);
  assert.equal(reloadedSlot.adherenceStatus, 'followed');
  const history = await planHistoryState(planId, { repo });
  assert.equal(history.canUndo, true);
});

test('Step2 F — shopping is derived from frozen effective plan, scales, persists checklist state and stays stale after undo/redo', async () => {
  const { repo, registry } = await fixture();
  const preview = await defaultPreview(repo, registry, 'v1-step2-f');
  assert.equal(preview.status, 'success');
  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:50:01.000Z' });

  const one = await calculateShoppingList({ startCivilDate: START, endCivilDate: END, peopleMultiplier: 1 }, { repo });
  const oneHalf = await calculateShoppingList({ startCivilDate: START, endCivilDate: END, peopleMultiplier: 1.5 }, { repo });
  assert.equal(one.occurrenceCount, 28);
  assert.ok(one.items.length > 0);
  const scaled = new Map(oneHalf.items.map(item => [item.itemId, item.quantity]));
  for (const item of one.items) assert.ok(Math.abs(scaled.get(item.itemId) - item.quantity * 1.5) < 0.001, `${item.itemId} did not scale linearly`);

  const recipeIds = [...new Set(recipeVersionIds(preview))];
  const recipes = await repo.getMany('recipeVersions', recipeIds);
  const revisionIds = [...new Set(recipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))];
  const revisions = await repo.getMany('ingredientRevisions', revisionIds);
  const revisionById = new Map(revisions.map(item => [item.ingredientRevisionId, item]));
  for (const item of one.items) {
    assert.match(item.itemId, /^derived:/);
    const expectedSuffix = `:${item.unit}:${revisionById.get(item._ingredientRevisionIds[0])?.basis?.state || 'unknown'}`;
    assert.ok(item.itemId.endsWith(expectedSuffix), `shopping key must keep normalized unit and ingredient state: ${item.itemId}`);
  }

  let checklist = await createShoppingChecklist({ startCivilDate: START, endCivilDate: END, peopleMultiplier: 1 }, { repo, registry, checklistId: 'v1-step2-checklist', createdAt: '2026-09-07T08:51:00.000Z' });
  const marked = checklist.items[0];
  checklist = await updateShoppingChecklistItem(checklist.checklistId, marked.itemId, { checked: true, notes: 'already have' }, { repo, registry, updatedAt: '2026-09-07T08:52:00.000Z' });
  const { day, slot } = plannedSlots(preview)[0];
  const replacement = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: 'v1-step2-f-replace', limit: 8 }, { repo, registry });
  assert.ok(replacement.candidates.length > 0);
  await commitReplacement({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, recipeVersionId: replacement.candidates[0].recipe.recipeVersionId, createdAt: '2026-09-07T08:53:00.000Z' }, { repo, registry });
  assert.equal((await shoppingChecklistStaleness(checklist, { repo })).stale, true);

  checklist = await refreshShoppingChecklist(checklist.checklistId, { repo, registry, updatedAt: '2026-09-07T08:54:00.000Z' });
  assert.equal((await shoppingChecklistStaleness(checklist, { repo })).stale, false);
  const retained = checklist.items.find(item => item.itemId === marked.itemId);
  if (retained) { assert.equal(retained.checked, true); assert.equal(retained.notes, 'already have'); }

  await undoPlanOperation(day.planInstanceId, { repo, registry, at: '2026-09-07T08:55:00.000Z' });
  assert.equal((await shoppingChecklistStaleness(await repo.get('shoppingChecklists', checklist.checklistId), { repo })).stale, true);
  checklist = await refreshShoppingChecklist(checklist.checklistId, { repo, registry, updatedAt: '2026-09-07T08:55:30.000Z' });
  assert.equal((await shoppingChecklistStaleness(checklist, { repo })).stale, false);
  await redoPlanOperation(day.planInstanceId, { repo, registry, at: '2026-09-07T08:56:00.000Z' });
  assert.equal((await shoppingChecklistStaleness(await repo.get('shoppingChecklists', checklist.checklistId), { repo })).stale, true);

  const prep = await buildPreparationHorizon({ startCivilDate: START, endCivilDate: END, locale: 'it' }, { repo });
  assert.equal(prep.entries.length, one.occurrenceCount);
  assert.ok(prep.entries.every(entry => recipeIds.includes(entry.recipeVersionId) || entry.recipeVersionId === replacement.candidates[0].recipe.recipeVersionId));
});
