import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import theme from '../examples/theme-profile.example.json' with { type: 'json' };
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader } from './helpers.mjs';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import {
  commitGeneratedPreview, createReplacementPreview, commitReplacement, updateAdherence, createRebalancePreview, commitRebalancePreview,
  loadEffectivePlanState, deriveDayStatus, undoPlanOperation, redoPlanOperation, planHistoryState, recentPlanOperations
} from '../src/services/effectivePlanService.js';

const root = process.cwd();

function revision(id, ingredientId, foodGroup, allergens = []) { return { ingredientRevisionId: id, ingredientId, taxonomy: { foodGroup, foodSubgroup: foodGroup }, allergenIds: allergens }; }
function recipe(id, archetype, energy, protein, { ingredient, revisionId, allergens = [], family = 'simple' } = {}) {
  return { recipeVersionId: `rv_${id}`, recipeId: `r_${id}`, mealArchetypes: [archetype], calculatedNutrition: { energyKcal: energy, proteinG: protein, carbsG: energy / 10, fatG: energy / 40, fiberG: 5 }, practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true }, tags: { families: [family], cuisines: ['test'], diet: [], flavor: ['savory'], practical: ['portable'] }, allergenIds: allergens, ingredientLines: [{ ingredientId: ingredient, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }], quality: { status: 'validated' }, origin: 'base', i18n: { it: { title: id }, en: { title: id } } };
}

async function fixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const mealClasses = [
    { schemaVersion: 1, id: 'mc-breakfast', name: 'Breakfast', abbreviation: 'BR', mealArchetype: 'breakfast', energyShare: { target: 0.22, min: 0.15, max: 0.3 }, rules: [] },
    { schemaVersion: 1, id: 'mc-dinner', name: 'Dinner', abbreviation: 'DI', mealArchetype: 'dinner', energyShare: { target: 0.35, min: 0.2, max: 0.5 }, rules: [] },
    { schemaVersion: 1, id: 'mc-night', name: 'Night', abbreviation: 'NI', mealArchetype: 'night_meal', energyShare: { target: 0.25, min: 0.15, max: 0.35 }, rules: [] },
    { schemaVersion: 1, id: 'mc-lunch', name: 'Lunch', abbreviation: 'LU', mealArchetype: 'lunch', energyShare: { target: 0.28, min: 0.2, max: 0.4 }, rules: [] }
  ];
  const capabilities = { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 };
  const dayClasses = [
    { schemaVersion: 1, id: 'dc-day', name: 'Day', abbreviation: 'DA', color: '#446644', dayArchetype: 'day', workWindows: [], capabilities, mealSlots: [
      { id: 'breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 400, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'lunch', mealClassId: 'mc-lunch', time: '13:00', dayOffset: 0, mode: 'external', energyBudgetKcal: 500, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: 25, estimatedNutritionPolicy: 'budget_only' },
      { id: 'dinner', mealClassId: 'mc-dinner', time: '20:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] },
    { schemaVersion: 1, id: 'dc-night', name: 'Night', abbreviation: 'NT', color: '#333366', dayArchetype: 'night', workWindows: [], capabilities, mealSlots: [
      { id: 'pre', mealClassId: 'mc-dinner', time: '19:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'night', mealClassId: 'mc-night', time: '02:00', dayOffset: 1, mode: 'planned', energyBudgetKcal: 500, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] }
  ];
  const nutrition = { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 1600, energyTolerancePct: 10, preset: 'balanced', nutrients: { proteinG: { enabled: true, min: 70, target: 100, max: null, weight: 1.5 }, carbsG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fatG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fiberG: { enabled: false, min: null, target: null, max: null, weight: 0 } }, dayArchetypeModifiers: {} };
  const allergy = { schemaVersion: 1, id: 'allergy', rules: [{ id: 'fish', kind: 'allergy', targetType: 'allergen', targetId: 'fish', label: 'Fish', enabled: true, notes: '' }] };
  const prefs = { schemaVersion: 1, id: 'prefs', rules: [] };
  const cycle = { schemaVersion: 1, id: 'cycle', name: 'Cycle', length: 2, days: [{ cycleDay: 1, dayClassId: 'dc-day' }, { cycleDay: 2, dayClassId: 'dc-night' }] };
  const appConfig = { schemaVersion: 1, locale: 'it', timeZone: 'Europe/Rome', nutritionProfileId: 'nutrition', allergyIntoleranceProfileId: 'allergy', foodPreferencesId: 'prefs', themeProfileId: theme.id, mealClassIds: mealClasses.map(item => item.id), dayClassIds: dayClasses.map(item => item.id), cycleId: 'cycle', shoppingPeopleMultiplier: 1, measurementSystem: 'metric', weekStart: 'monday' };
  await repo.put('appConfigs', appConfig); await repo.putMany('nutritionProfiles', [nutrition]); await repo.putMany('allergyIntoleranceProfiles', [allergy]); await repo.putMany('foodPreferences', [prefs]); await repo.putMany('themeProfiles', [theme]); await repo.putMany('mealClasses', mealClasses); await repo.putMany('dayClasses', dayClasses); await repo.putMany('cycles', [cycle]);
  const revisions = [revision('rev_oats', 'ing_oats', 'grains'), revision('rev_chicken', 'ing_chicken', 'meat'), revision('rev_fish', 'ing_fish', 'fish_seafood', ['fish']), revision('rev_night', 'ing_night', 'grains')];
  const recipes = [recipe('oats', 'breakfast', 400, 20, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'porridge' }), recipe('oats2', 'breakfast', 390, 21, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'toast' }), recipe('chicken', 'dinner', 700, 60, { ingredient: 'ing_chicken', revisionId: 'rev_chicken', family: 'plate' }), recipe('chicken2', 'dinner', 680, 58, { ingredient: 'ing_chicken', revisionId: 'rev_chicken', family: 'bowl' }), recipe('fish', 'dinner', 700, 55, { ingredient: 'ing_fish', revisionId: 'rev_fish', allergens: ['fish'], family: 'plate' }), recipe('night', 'night_meal', 500, 30, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'bowl' }), recipe('night2', 'night_meal', 480, 28, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'plate' })];
  await repo.putMany('ingredientRevisions', revisions); for (const rec of recipes) { await repo.put('recipes', { recipeId: rec.recipeId, currentVersionId: rec.recipeVersionId, origin: 'base', status: 'active' }); await repo.put('recipeVersions', rec); }
  await repo.setMeta('activeCatalogVersion', 'test-1'); await repo.put('catalogPacks', { catalogVersion: 'test-1', packId: 'core', status: 'installed', recipeVersionIds: recipes.map(item => item.recipeVersionId) });
  return { repo, registry };
}

async function committedPlan(days = 2) {
  const { repo, registry } = await fixture();
  const preview = await createPlanPreview({ horizon: { startDate: '2026-09-07', endDate: days === 1 ? '2026-09-07' : '2026-09-08' }, seed: 'phase6-base', createdAt: '2026-09-03T14:00:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 1, extensionDays: 1 } }, { repo, registry });
  assert.equal(preview.status, 'success'); await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-03T14:00:01Z' });
  return { repo, registry, preview };
}

test('day adherence summary is derived from meal occurrence states', () => {
  assert.equal(deriveDayStatus([{ adherenceStatus: 'not_recorded' }]), 'planned');
  assert.equal(deriveDayStatus([{ adherenceStatus: 'followed' }, { adherenceStatus: 'followed' }]), 'followed');
  assert.equal(deriveDayStatus([{ adherenceStatus: 'not_followed' }, { adherenceStatus: 'not_followed' }]), 'not_followed');
  assert.equal(deriveDayStatus([{ adherenceStatus: 'followed' }, { adherenceStatus: 'not_recorded' }]), 'partial');
});

test('plan creation is one undoable and redoable atomic operation', async () => {
  const { repo, registry, preview } = await committedPlan(1); const planId = preview.planInstance.planInstanceId;
  assert.ok(await repo.get('planInstances', planId)); assert.equal((await planHistoryState(planId, { repo })).canUndo, true);
  await undoPlanOperation(planId, { repo, registry, at: '2026-09-03T14:01:00Z' });
  assert.equal(await repo.get('planInstances', planId), undefined); assert.equal(await repo.getMeta('activePlanInstanceId'), undefined); assert.equal((await planHistoryState(planId, { repo })).canRedo, true);
  await redoPlanOperation(planId, { repo, registry, at: '2026-09-03T14:02:00Z' });
  assert.ok(await repo.get('planInstances', planId)); assert.equal(await repo.getMeta('activePlanInstanceId'), planId);
});

test('adherence update persists per meal, derives day status, and undo restores previous day', async () => {
  const { repo, registry, preview } = await committedPlan(1); const day = preview.calendarDays[0]; const slot = day.mealSlots.find(item => item.mode === 'planned');
  const changed = await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'followed', createdAt: '2026-09-03T14:03:00Z' }, { repo, registry });
  assert.equal(changed.day.status, 'partial'); assert.equal(changed.day.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).adherenceStatus, 'followed');
  await undoPlanOperation(day.planInstanceId, { repo, registry, at: '2026-09-03T14:04:00Z' });
  const restored = await repo.get('calendarDays', day.calendarDayId); assert.equal(restored.status, 'planned'); assert.equal(restored.mealSlots.find(item => item.mealOccurrenceId === slot.mealOccurrenceId).adherenceStatus, 'not_recorded');
});

test('replacement preview excludes current recipe and hard-allergen candidates; commit is undoable', async () => {
  const { repo, registry, preview } = await committedPlan(1); const day = preview.calendarDays[0]; const breakfast = day.mealSlots.find(item => item.mealClassId === 'mc-breakfast');
  const current = breakfast.recipeComponents[0].recipeVersionId;
  const replacement = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: breakfast.mealOccurrenceId, seed: 'replace-test' }, { repo, registry });
  assert.ok(replacement.candidates.length); assert.ok(replacement.candidates.every(item => item.recipe.recipeVersionId !== current)); assert.ok(replacement.candidates.every(item => !item.recipe.allergenIds.includes('fish')));
  const selected = replacement.candidates[0].recipe.recipeVersionId; await commitReplacement({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: breakfast.mealOccurrenceId, recipeVersionId: selected, createdAt: '2026-09-03T14:05:00Z' }, { repo, registry });
  assert.equal((await repo.get('calendarDays', day.calendarDayId)).mealSlots.find(item => item.mealOccurrenceId === breakfast.mealOccurrenceId).recipeComponents[0].recipeVersionId, selected);
  await undoPlanOperation(day.planInstanceId, { repo, registry, at: '2026-09-03T14:06:00Z' });
  assert.equal((await repo.get('calendarDays', day.calendarDayId)).mealSlots.find(item => item.mealOccurrenceId === breakfast.mealOccurrenceId).recipeComponents[0].recipeVersionId, current);
});

test('rebalance creates a dedicated GenerationRun, commits selected dates, and rolls back atomically', async () => {
  const { repo, registry, preview } = await committedPlan(2); const planId = preview.planInstance.planInstanceId; const before = await repo.get('calendarDays', preview.calendarDays[0].calendarDayId);
  const rebalance = await createRebalancePreview({ planInstanceId: planId, startDate: '2026-09-07', endDate: '2026-09-08', seed: 'rebalance-test', createdAt: '2026-09-03T14:07:00Z' }, { repo, registry });
  assert.equal(rebalance.status, 'success'); assert.equal(rebalance.generationRun.reason, 'rebalance'); assert.equal(rebalance.generationRun.diagnostics.targetPlanInstanceId, planId);
  const committed = await commitRebalancePreview(rebalance, { selectedDates: ['2026-09-07'], repo, registry, createdAt: '2026-09-03T14:08:00Z' });
  assert.deepEqual(committed.generationRun.diagnostics.committedDates, ['2026-09-07']); assert.ok(await repo.get('generationRuns', committed.generationRun.generationRunId));
  await undoPlanOperation(planId, { repo, registry, at: '2026-09-03T14:09:00Z' });
  assert.equal(await repo.get('generationRuns', committed.generationRun.generationRunId), undefined); assert.deepEqual(await repo.get('calendarDays', before.calendarDayId), before);
});

test('new edit after undo invalidates the redo branch without deleting audit history', async () => {
  const { repo, registry, preview } = await committedPlan(1); const day = preview.calendarDays[0]; const slot = day.mealSlots.find(item => item.mode === 'planned');
  await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'followed', createdAt: '2026-09-03T14:10:00Z' }, { repo, registry });
  await undoPlanOperation(day.planInstanceId, { repo, registry, at: '2026-09-03T14:11:00Z' });
  await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'not_followed', createdAt: '2026-09-03T14:12:00Z' }, { repo, registry });
  const state = await planHistoryState(day.planInstanceId, { repo }); assert.equal(state.canRedo, false);
  const ops = await recentPlanOperations({ repo }); assert.ok(ops.some(item => item.metadata?.invalidatedAt));
});

test('today view uses civil consumption date and includes carry-over meals from prior diet date', async () => {
  const { repo } = await committedPlan(2); const view = await loadEffectivePlanState('2026-09-09', { repo });
  assert.equal(view.dietDay, null); assert.ok(view.civilMeals.some(item => item.sourceDay.date === '2026-09-08' && item.slot.dayOffset === 1));
});

test('external adherence can persist a retrospective user estimate only when policy allows it', async () => {
  const { repo, registry, preview } = await committedPlan(1); const day = await repo.get('calendarDays', preview.calendarDays[0].calendarDayId); const external = day.mealSlots.find(item => item.mode === 'external');
  external.externalEstimate.policy = 'user_estimate'; external.externalEstimate.userEstimatedEnergyKcal = null; external.externalEstimate.userEstimatedProteinG = null; await repo.put('calendarDays', day);
  const changed = await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: external.mealOccurrenceId, status: 'partial', userEstimatedEnergyKcal: 620, userEstimatedProteinG: 31, createdAt: '2026-09-03T14:13:00Z' }, { repo, registry });
  const slot = changed.day.mealSlots.find(item => item.mealOccurrenceId === external.mealOccurrenceId); assert.equal(slot.externalEstimate.userEstimatedEnergyKcal, 620); assert.equal(slot.externalEstimate.userEstimatedProteinG, 31); assert.equal(slot.adherenceStatus, 'partial');
});
