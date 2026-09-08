import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import theme from '../examples/theme-profile.example.json' with { type: 'json' };
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { addCivilDays } from '../src/planner/planMath.js';
import { hardFilterRecipe } from '../src/planner/hardFilter.js';
import { scoreRecipe } from '../src/planner/softScoring.js';
import { PlanCandidateService } from '../src/services/planCandidateService.js';
import { createPlanPreview, commitPlanPreview, extendPlan, continuationState } from '../src/services/planGenerationService.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader } from './helpers.mjs';

const root = process.cwd();

function revision(id, ingredientId, foodGroup, allergens = []) {
  return { ingredientRevisionId: id, ingredientId, taxonomy: { foodGroup, foodSubgroup: foodGroup }, allergenIds: allergens };
}

function recipe(id, archetype, energy, protein, { ingredient = 'ing_generic', revisionId = 'rev_generic', allergens = [], portable = true, prep = 5, family = 'simple', cuisine = 'test', tags = [] } = {}) {
  return {
    recipeVersionId: `rv_${id}`, recipeId: `r_${id}`, mealArchetypes: [archetype],
    calculatedNutrition: { energyKcal: energy, proteinG: protein, carbsG: Math.max(0, energy / 10), fatG: Math.max(0, energy / 40), fiberG: 5 },
    practical: { prepMinutes: prep, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable, fridgeRequired: false, mealPrepSuitable: true },
    tags: { families: [family], cuisines: [cuisine], diet: tags, flavor: ['savory'], practical: portable ? ['portable'] : [] },
    allergenIds: allergens, ingredientLines: [{ ingredientId: ingredient, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    quality: { status: 'validated' }, origin: 'base'
  };
}

function configFixture({ fishAllergy = true } = {}) {
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
      { id: 'lunch', mealClassId: 'mc-lunch', time: '13:00', dayOffset: 0, mode: 'external', energyBudgetKcal: 500, energyShare: null, guidanceKeys: ['external.guidance'], parallel: false, proteinMinG: 25, estimatedNutritionPolicy: 'budget_only' },
      { id: 'dinner', mealClassId: 'mc-dinner', time: '20:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] },
    { schemaVersion: 1, id: 'dc-night', name: 'Night', abbreviation: 'NT', color: '#333366', dayArchetype: 'night', workWindows: [{ start: '20:00', end: '08:00', endDayOffset: 1 }], capabilities, mealSlots: [
      { id: 'pre', mealClassId: 'mc-dinner', time: '19:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'night', mealClassId: 'mc-night', time: '02:00', dayOffset: 1, mode: 'planned', energyBudgetKcal: 500, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] }
  ];
  const nutritionProfile = { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 1800, energyTolerancePct: 10, preset: 'balanced', nutrients: {
    proteinG: { enabled: true, min: 70, target: 100, max: null, weight: 1.5 }, carbsG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fatG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fiberG: { enabled: false, min: null, target: null, max: null, weight: 0 }
  }, dayArchetypeModifiers: { night: { mode: 'percent', value: 5 } } };
  const allergyProfile = { schemaVersion: 1, id: 'allergy', rules: fishAllergy ? [{ id: 'fish', kind: 'allergy', targetType: 'allergen', targetId: 'fish', label: 'Fish', enabled: true, notes: '' }] : [] };
  const foodPreferences = { schemaVersion: 1, id: 'prefs', rules: [] };
  const cycle = { schemaVersion: 1, id: 'cycle', name: 'Two day cycle', length: 2, days: [{ cycleDay: 1, dayClassId: 'dc-day' }, { cycleDay: 2, dayClassId: 'dc-night' }] };
  return { nutritionProfile, allergyProfile, foodPreferences, mealClasses, dayClasses, cycle };
}

function catalogFixture() {
  const revisions = [
    revision('rev_oats', 'ing_oats', 'grains'), revision('rev_chicken', 'ing_chicken', 'meat'), revision('rev_fish', 'ing_fish', 'fish_seafood', ['fish']),
    revision('rev_veg', 'ing_veg', 'vegetables'), revision('rev_night', 'ing_night', 'grains')
  ];
  const recipes = [
    recipe('oats', 'breakfast', 400, 20, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'porridge' }),
    recipe('oats2', 'breakfast', 360, 18, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'porridge' }),
    recipe('fish', 'dinner', 700, 55, { ingredient: 'ing_fish', revisionId: 'rev_fish', allergens: ['fish'], family: 'protein_plate' }),
    recipe('chicken', 'dinner', 700, 60, { ingredient: 'ing_chicken', revisionId: 'rev_chicken', family: 'protein_plate' }),
    recipe('vegside', 'dinner', 300, 12, { ingredient: 'ing_veg', revisionId: 'rev_veg', family: 'vegetable_side' }),
    recipe('nightbowl', 'night_meal', 500, 30, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'grain_bowl' }),
    recipe('nightlight', 'night_meal', 350, 20, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'grain_bowl' })
  ];
  return { revisions, recipes };
}

function coreInput(overrides = {}) {
  const config = configFixture(); const catalog = catalogFixture();
  return { ...config, recipes: catalog.recipes, ingredientRevisions: catalog.revisions, horizon: { startDate: '2026-09-07', endDate: '2026-09-08' }, seed: 'phase5-seed', catalogVersion: 'test-1', configSnapshotHash: '1234567890abcdef', configSnapshot: { fixture: true }, createdAt: '2026-09-03T13:00:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 2, extensionDays: 1 }, ...overrides };
}

function assignments(result) {
  return result.calendarDays.map(day => day.mealSlots.map(slot => ({ id: slot.mealOccurrenceId, civilDate: slot.civilDate, mode: slot.mode, versions: slot.recipeComponents.map(c => c.recipeVersionId) })));
}

test('same seed and frozen inputs produce identical plan assignments', () => {
  const a = generatePlanCore(coreInput()); const b = generatePlanCore(coreInput());
  assert.equal(a.status, 'success'); assert.equal(b.status, 'success');
  assert.deepEqual(assignments(a), assignments(b));
  assert.equal(a.generationRun.generationRunId, b.generationRun.generationRunId);
});

test('allergy is a hard filter and never reaches scoring/selection', () => {
  const input = coreInput(); const result = generatePlanCore(input);
  assert.equal(result.status, 'success');
  const selected = result.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => slot.recipeComponents.map(c => c.recipeVersionId)));
  assert.ok(!selected.includes('rv_fish'));
  const direct = hardFilterRecipe(input.recipes.find(r => r.recipeVersionId === 'rv_fish'), { mealClass: input.mealClasses.find(m => m.id === 'mc-dinner'), dayClass: input.dayClasses[0], allergyProfile: input.allergyProfile, foodPreferences: input.foodPreferences, revisionById: new Map(input.ingredientRevisions.map(r => [r.ingredientRevisionId, r])) });
  assert.equal(direct.allowed, false); assert.ok(direct.reasons.some(reason => reason.startsWith('safety:')));
});

test('external slots have no recipes, servings stay at 1, and carry-over civil date is preserved', () => {
  const result = generatePlanCore(coreInput()); assert.equal(result.status, 'success');
  const day1External = result.calendarDays[0].mealSlots.find(slot => slot.mode === 'external');
  assert.deepEqual(day1External.recipeComponents, []); assert.equal(day1External.externalEstimate.policy, 'budget_only');
  for (const day of result.calendarDays) for (const slot of day.mealSlots) for (const component of slot.recipeComponents) assert.equal(component.servings, 1);
  const carry = result.calendarDays[1].mealSlots.find(slot => slot.dayOffset === 1);
  assert.equal(carry.civilDate, addCivilDays(result.calendarDays[1].date, 1));
  assert.equal(result.calendarDays[0].nutritionSummary.externalBudget.energyKcal, 500);
});

test('soft MealClass avoid rule penalizes but does not hard-exclude a matching recipe', () => {
  const input = coreInput({ allergyProfile: { schemaVersion: 1, id: 'allergy', rules: [] } });
  const dinner = structuredClone(input.mealClasses.find(m => m.id === 'mc-dinner'));
  dinner.rules = [{ ruleType: 'foodCategory', target: 'fish_seafood', strength: 'avoid' }];
  const revisionById = new Map(input.ingredientRevisions.map(r => [r.ingredientRevisionId, r]));
  const fish = structuredClone(input.recipes.find(r => r.recipeVersionId === 'rv_fish')); const chicken = input.recipes.find(r => r.recipeVersionId === 'rv_chicken');
  fish.calculatedNutrition = structuredClone(chicken.calculatedNutrition);
  const context = { mealClass: dinner, dayClass: input.dayClasses[0], allergyProfile: input.allergyProfile, foodPreferences: input.foodPreferences, revisionById, history: [], date: '2026-09-07', nutritionProfile: input.nutritionProfile, slotEnergyTarget: 700, dayEnergyTarget: 1800 };
  assert.equal(hardFilterRecipe(fish, context).allowed, true);
  assert.ok(scoreRecipe(fish, context).total > scoreRecipe(chicken, context).total);
});

test('planner returns classified failure instead of violating hard constraints', () => {
  const input = coreInput({ recipes: catalogFixture().recipes.filter(r => r.mealArchetypes[0] !== 'breakfast') });
  const result = generatePlanCore(input); assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'no_candidates_after_hard_constraints');
  assert.equal(result.failure.slotId, 'breakfast');
});

test('startCycleDay supports rolling-horizon continuation without reset', () => {
  const result = generatePlanCore(coreInput({ horizon: { startDate: '2026-09-09', endDate: '2026-09-09' }, startCycleDay: 2 }));
  assert.equal(result.status, 'success'); assert.equal(result.calendarDays[0].cycleDay, 2); assert.equal(result.calendarDays[0].dayClassId, 'dc-night');
});

async function serviceFixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const config = configFixture(); const catalog = catalogFixture();
  const bundle = {
    appConfig: { schemaVersion: 1, locale: 'it', timeZone: 'Europe/Rome', nutritionProfileId: 'nutrition', allergyIntoleranceProfileId: 'allergy', foodPreferencesId: 'prefs', themeProfileId: theme.id, mealClassIds: config.mealClasses.map(m => m.id), dayClassIds: config.dayClasses.map(d => d.id), cycleId: 'cycle', shoppingPeopleMultiplier: 1, measurementSystem: 'metric', weekStart: 'monday' },
    nutritionProfiles: [config.nutritionProfile], allergyIntoleranceProfiles: [config.allergyProfile], foodPreferences: [config.foodPreferences], themeProfiles: [theme], mealClasses: config.mealClasses, dayClasses: config.dayClasses, cycles: [config.cycle]
  };
  await repo.put('appConfigs', bundle.appConfig); for (const [store, records] of Object.entries({ nutritionProfiles: bundle.nutritionProfiles, allergyIntoleranceProfiles: bundle.allergyIntoleranceProfiles, foodPreferences: bundle.foodPreferences, themeProfiles: bundle.themeProfiles, mealClasses: bundle.mealClasses, dayClasses: bundle.dayClasses, cycles: bundle.cycles })) await repo.putMany(store, records);
  for (const rev of catalog.revisions) await repo.put('ingredientRevisions', rev);
  for (const rec of catalog.recipes) {
    await repo.put('recipes', { recipeId: rec.recipeId, currentVersionId: rec.recipeVersionId, origin: 'base', status: 'active' }); await repo.put('recipeVersions', rec);
  }
  await repo.setMeta('activeCatalogVersion', 'test-1');
  await repo.put('catalogPacks', { catalogVersion: 'test-1', packId: 'core', status: 'installed', recipeVersionIds: catalog.recipes.map(r => r.recipeVersionId) });
  return { repo, registry, config, catalog };
}

test('candidate retrieval remains bounded with a 10k-recipe archetype', async () => {
  const { repo } = await serviceFixture();
  for (let i = 0; i < 10000; i += 1) {
    const rec = recipe(`bulk${i}`, 'breakfast', 300 + (i % 100), 15, { ingredient: 'ing_oats', revisionId: 'rev_oats' });
    await repo.put('recipes', { recipeId: rec.recipeId, currentVersionId: rec.recipeVersionId, origin: 'user', status: 'active' }); await repo.put('recipeVersions', { ...rec, origin: 'user' });
  }
  const service = new PlanCandidateService({ repo }); const items = await service.retrieve('breakfast', { limit: 999 });
  assert.equal(items.length, 500);
});

test('preview validates schemas, commit is atomic, and extension continues the cycle', async () => {
  const { repo, registry } = await serviceFixture();
  const preview = await createPlanPreview({ horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: 'service-seed', createdAt: '2026-09-03T13:30:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 1, extensionDays: 1 } }, { repo, registry });
  assert.equal(preview.status, 'success'); registry.assert('generationRun', preview.generationRun); registry.assert('planInstance', preview.planInstance); registry.assert('calendarDay', preview.calendarDays[0]);
  await commitPlanPreview(preview, { repo });
  assert.equal(await repo.getMeta('activePlanInstanceId'), preview.planInstance.planInstanceId);
  assert.ok(await repo.get('generationRuns', preview.generationRun.generationRunId));
  const extension = await extendPlan(preview.planInstance.planInstanceId, { seed: 'extension-seed', createdAt: '2026-09-03T13:31:00Z' }, { repo, registry });
  assert.equal(extension.status, 'success'); assert.equal(extension.calendarDays[0].cycleDay, 2); assert.equal(extension.planInstance.previousPlanInstanceId, preview.planInstance.planInstanceId); assert.equal(extension.generationRun.reason, 'horizon_extension');
});

test('continuation state exposes prompt/auto/fixed temporal guardrails', () => {
  const base = { endDate: '2026-09-10', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 2, extensionDays: 7 } };
  assert.equal(continuationState(base, '2026-09-09').action, 'prompt_extend');
  assert.equal(continuationState({ ...base, continuationPolicy: { ...base.continuationPolicy, mode: 'auto_extend' } }, '2026-09-09').action, 'auto_extend');
  assert.equal(continuationState({ ...base, continuationPolicy: { ...base.continuationPolicy, mode: 'fixed' } }, '2026-09-11').action, null);
});


test('365-day horizon materializes the cycle independently of month boundaries', () => {
  const result = generatePlanCore(coreInput({ horizon: { startDate: '2026-01-01', endDate: '2026-12-31' }, candidateLimit: 8, beamWidth: 30, slotOptionLimit: 12 }));
  assert.equal(result.status, 'success'); assert.equal(result.calendarDays.length, 365);
  for (let i = 0; i < result.calendarDays.length; i += 1) assert.equal(result.calendarDays[i].cycleDay, (i % 2) + 1);
});

test('horizon extension resolves historical RecipeVersion after family currentVersion changes', async () => {
  const { repo, registry } = await serviceFixture();
  const initial = await createPlanPreview({ horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: 'history-initial', createdAt: '2026-09-03T13:40:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 1, extensionDays: 1 } }, { repo, registry });
  assert.equal(initial.status, 'success'); await commitPlanPreview(initial, { repo });
  const old = await repo.get('recipeVersions', 'rv_chicken');
  const next = structuredClone(old); next.recipeVersionId = 'rv_chicken_v2'; next.calculatedNutrition.energyKcal = 705;
  await repo.put('recipeVersions', next); await repo.put('recipes', { recipeId: old.recipeId, currentVersionId: next.recipeVersionId, origin: 'base', status: 'active' });
  const pack = await repo.get('catalogPacks', ['test-1','core']); pack.recipeVersionIds = [...pack.recipeVersionIds.filter(id => id !== old.recipeVersionId), next.recipeVersionId]; await repo.put('catalogPacks', pack);
  const extension = await extendPlan(initial.planInstance.planInstanceId, { seed: 'history-extension', createdAt: '2026-09-03T13:41:00Z' }, { repo, registry });
  assert.equal(extension.status, 'success');
  const chickenDiagnostic = extension.generationRun.diagnostics.days[0].selectedMeals.find(item => item.recipeId === old.recipeId);
  assert.ok(chickenDiagnostic, 'current chicken version should remain a competitive dinner candidate');
  assert.ok(chickenDiagnostic.scoreComponents.variety > 0, 'historical old version must contribute repetition penalty by stable recipe family id');
  assert.ok(await repo.get('recipeVersions', 'rv_chicken'), 'historical immutable version remains resolvable');
});
