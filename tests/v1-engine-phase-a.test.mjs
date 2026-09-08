import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { selectCandidateFrontier } from '../src/planner/beamSolver.js';
import { energyConstraintStatus, energyToleranceWindow } from '../src/planner/planMath.js';
import { hardFilterRecipe, SIMPLE_SNACK_MAX_PREP_MINUTES } from '../src/planner/hardFilter.js';
import { scoreRecipe } from '../src/planner/softScoring.js';
import { PLANNER_CONSTRAINTS } from '../src/planner/constraintPolicy.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../src/services/configurationService.js';
import { createInitialPreview, commitGeneratedPreview, createReplacementPreview } from '../src/services/effectivePlanService.js';
import { MemoryRepository, fileLoader, fileFetch } from './helpers.mjs';

const root = process.cwd();

function recipe(id, archetype, energy, { cook = 0, prep = 5, ingredient = `ing_${id}`, revisionId = `rev_${id}`, allergens = [] } = {}) {
  return {
    recipeVersionId: `rv_${id}`, recipeId: `r_${id}`, mealArchetypes: [archetype],
    calculatedNutrition: { energyKcal: energy, proteinG: energy / 20, carbsG: energy / 12, fatG: energy / 40, fiberG: 4 },
    practical: { prepMinutes: prep, cookMinutes: cook, reheatingRequired: false, coldSuitable: cook === 0, portable: true, fridgeRequired: false, mealPrepSuitable: true },
    tags: { families: [`family_${id}`], cuisines: ['test'], diet: [], flavor: ['savory'], practical: ['portable'] },
    allergenIds: allergens,
    ingredientLines: [{ ingredientId: ingredient, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    quality: { status: 'validated' }, origin: 'base'
  };
}

function revision(id) { return { ingredientRevisionId: `rev_${id}`, ingredientId: `ing_${id}`, taxonomy: { foodGroup: 'food_group_test', foodSubgroup: 'food_subgroup_test' }, allergenIds: [] }; }

function energyFixture(target, tolerancePct = 5, energies = [0.25, 0.25, 0.25, 0.25].map(share => target * share)) {
  const archetypes = ['breakfast', 'lunch', 'snack', 'dinner'];
  const mealClasses = archetypes.map((archetype, index) => ({ schemaVersion: 1, id: `mc-${archetype}`, name: archetype, abbreviation: `M${index}`, mealArchetype: archetype, energyShare: { target: 0.25, min: 0.1, max: 0.5 }, rules: [] }));
  const dayClass = {
    schemaVersion: 1, id: 'dc-test', name: 'Test', abbreviation: 'TE', color: '#445566', dayArchetype: 'day', workWindows: [],
    capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 },
    mealSlots: archetypes.map((archetype, index) => ({ id: `slot-${archetype}`, mealClassId: `mc-${archetype}`, time: `${String(8 + index * 4).padStart(2, '0')}:00`, dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: 0.25, guidanceKeys: [], parallel: false, proteinMinG: null }))
  };
  const recipes = archetypes.map((archetype, index) => recipe(`${archetype}-${energies[index]}`, archetype, energies[index]));
  const revisions = recipes.map(item => revision(item.recipeId.slice(2)));
  return {
    nutritionProfile: { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: target, energyTolerancePct: tolerancePct, preset: 'custom', nutrients: {
      proteinG: { enabled: true, min: target / 30, target: target / 22, max: null, weight: 1 },
      carbsG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fatG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fiberG: { enabled: false, min: null, target: null, max: null, weight: 0 }
    }, dayArchetypeModifiers: {} },
    allergyProfile: { schemaVersion: 1, id: 'allergy', rules: [] }, foodPreferences: { schemaVersion: 1, id: 'prefs', rules: [] },
    mealClasses, dayClasses: [dayClass], cycle: { schemaVersion: 1, id: 'cycle', name: 'Cycle', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-test' }] },
    recipes, ingredientRevisions: revisions, horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: `phase-a-${target}`, catalogVersion: 'test', configSnapshotHash: '1234567890abcdef', configSnapshot: {}, createdAt: '2026-09-07T08:00:00.000Z'
  };
}

test('Phase A — daily calorie tolerance is a hard window, not a score preference', () => {
  assert.deepEqual(energyToleranceWindow(1800, 5, 600), { targetKcal: 1800, tolerancePct: 5, externalEnergyKcal: 600, dailyMinKcal: 1710, dailyMaxKcal: 1890, plannedTargetKcal: 1200, plannedMinKcal: 1110, plannedMaxKcal: 1290 });
  assert.equal(energyConstraintStatus(1109, 1800, 5, 600).withinTolerance, false);
  assert.equal(energyConstraintStatus(1110, 1800, 5, 600).withinTolerance, true);
  assert.equal(energyConstraintStatus(1290, 1800, 5, 600).withinTolerance, true);
  assert.equal(energyConstraintStatus(1291, 1800, 5, 600).withinTolerance, false);
});

test('Phase A — feasible 800 kcal plan succeeds with fixed servings only', () => {
  const result = generatePlanCore(energyFixture(800, 5, [200, 200, 200, 200]));
  assert.equal(result.status, 'success', JSON.stringify(result.failure));
  const day = result.calendarDays[0];
  assert.equal(day.nutritionSummary.knownPlanned.energyKcal, 800);
  assert.equal(result.generationRun.diagnostics.days[0].energyConstraint.withinTolerance, true);
  for (const slot of day.mealSlots) for (const component of slot.recipeComponents) assert.equal(component.servings, 1);
});

test('Phase A — feasible 2600 kcal plan succeeds without recipe scaling', () => {
  const result = generatePlanCore(energyFixture(2600, 5, [650, 650, 650, 650]));
  assert.equal(result.status, 'success', JSON.stringify(result.failure));
  assert.equal(result.calendarDays[0].nutritionSummary.knownPlanned.energyKcal, 2600);
  assert.ok(result.generationRun.diagnostics.constraintPolicy.hard.some(item => item.id === 'fixed_serving'));
});

test('Phase A — impossible calorie window returns NO_FEASIBLE_PLAN diagnostics rather than out-of-range plan', () => {
  const result = generatePlanCore(energyFixture(800, 2, [300, 300, 300, 300]));
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'no_feasible_plan');
  assert.equal(result.failure.constraintId, 'daily_energy_tolerance');
  assert.equal(result.failure.hardConstraint, true);
  assert.equal(result.failure.energy.dailyMinKcal, 784);
  assert.equal(result.failure.energy.dailyMaxKcal, 816);
  assert.ok(result.failure.nearestDistanceKcal > 0);
  assert.equal(result.failure.search.proof, 'bounded_search');
});


test('Phase A — soft ranking cannot erase the energy frontier before hard-feasibility search', () => {
  const scored = Array.from({ length: 30 }, (_, index) => ({
    recipe: recipe(`frontier-${index}`, 'dinner', 100 + index * 100),
    score: { total: index === 0 ? 0 : index === 29 ? 999 : index },
    tie: index / 100
  }));
  const frontier = selectCandidateFrontier(scored, { targetEnergy: 1500, limit: 10 });
  const energies = frontier.map(item => item.recipe.calculatedNutrition.energyKcal);
  assert.ok(energies.includes(100), 'lowest-energy hard-valid candidate should be preserved');
  assert.ok(energies.includes(3000), 'highest-energy hard-valid candidate should be preserved even with poor soft score');
  assert.ok(frontier.some(item => Math.abs(item.recipe.calculatedNutrition.energyKcal - 1500) <= 100), 'target-adjacent candidate should be preserved');
});

test('Phase A — numeric MealClass forbid rejects matching values and allows non-matching values', () => {
  const mealClass = { id: 'mc', mealArchetype: 'dinner', rules: [{ ruleType: 'practical', target: 'prepMinutes', operator: 'gte', value: 20, strength: 'forbid' }] };
  const context = { mealClass, dayClass: { capabilities: { cooking: true, complexSnack: true } }, allergyProfile: { rules: [] }, foodPreferences: { rules: [] }, revisionById: new Map() };
  assert.equal(hardFilterRecipe(recipe('slow', 'dinner', 500, { prep: 25 }), context).allowed, false);
  assert.equal(hardFilterRecipe(recipe('fast', 'dinner', 500, { prep: 10 }), context).allowed, true);
});

test('Phase A — cooking and simple-snack capabilities are enforced as hard filters', () => {
  const dinnerContext = { mealClass: { id: 'd', mealArchetype: 'dinner', rules: [] }, dayClass: { capabilities: { cooking: false, complexSnack: true } }, allergyProfile: { rules: [] }, foodPreferences: { rules: [] }, revisionById: new Map() };
  const cooked = hardFilterRecipe(recipe('cooked', 'dinner', 500, { cook: 15 }), dinnerContext);
  assert.equal(cooked.allowed, false); assert.ok(cooked.reasons.includes('capability:cooking'));
  const snackContext = { ...dinnerContext, mealClass: { id: 's', mealArchetype: 'snack', rules: [] }, dayClass: { capabilities: { cooking: true, complexSnack: false } } };
  assert.equal(SIMPLE_SNACK_MAX_PREP_MINUTES, 10);
  assert.equal(hardFilterRecipe(recipe('simple-snack', 'snack', 150, { prep: 10, cook: 0 }), snackContext).allowed, true);
  assert.equal(hardFilterRecipe(recipe('complex-snack', 'snack', 150, { prep: 11, cook: 0 }), snackContext).allowed, false);
});

test('Phase A — soft avoid changes ranking but does not exclude candidate', () => {
  const fish = recipe('fish-soft', 'dinner', 500, { ingredient: 'fish', revisionId: 'fish' });
  fish.tags.cuisines = ['cuisine_x'];
  const mealClass = { id: 'mc', mealArchetype: 'dinner', rules: [{ ruleType: 'cuisine', target: 'cuisine_x', strength: 'avoid' }] };
  const context = { mealClass, dayClass: { capabilities: { cooking: true, complexSnack: true } }, allergyProfile: { rules: [] }, foodPreferences: { rules: [] }, revisionById: new Map(), history: [], date: '2026-09-07', nutritionProfile: energyFixture(2000).nutritionProfile, slotEnergyTarget: 500, dayEnergyTarget: 2000 };
  assert.equal(hardFilterRecipe(fish, context).allowed, true);
  assert.ok(scoreRecipe(fish, context).components.preference > 0);
});

test('Phase A — constraint policy exposes hard and soft semantics explicitly', () => {
  const hard = new Set(PLANNER_CONSTRAINTS.filter(item => item.strength === 'hard').map(item => item.id));
  const soft = new Set(PLANNER_CONSTRAINTS.filter(item => item.strength === 'soft').map(item => item.id));
  for (const id of ['daily_energy_tolerance', 'allergy_intolerance', 'food_auto_exclude', 'meal_rule_forbid', 'day_capabilities', 'fixed_serving']) assert.ok(hard.has(id), id);
  for (const id of ['nutrient_targets', 'meal_rule_preferences', 'food_preferences', 'frequency_limits', 'variety', 'slot_energy_share']) assert.ok(soft.has(id), id);
});

async function realFixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  return { repo, registry };
}

test('Phase A — replacement preview only exposes candidates that preserve the daily hard energy window', async () => {
  const { repo, registry } = await realFixture();
  const preview = await createInitialPreview({ horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: 'phase-a-replacement', createdAt: '2026-09-07T08:00:00.000Z' }, { repo, registry });
  assert.equal(preview.status, 'success', JSON.stringify(preview.failure));
  await commitGeneratedPreview(preview, { repo, registry, createdAt: '2026-09-07T08:00:01.000Z' });
  const day = preview.calendarDays[0];
  let checked = 0;
  for (const slot of day.mealSlots.filter(item => item.mode === 'planned')) {
    const replacement = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: `phase-a-${slot.mealOccurrenceId}`, limit: 20 }, { repo, registry });
    for (const candidate of replacement.candidates) { assert.equal(candidate.energyConstraint.withinTolerance, true); checked += 1; }
  }
  assert.ok(checked > 0, 'real corpus should expose at least one hard-safe replacement candidate for the default day');
});


test('Phase A — planned slots cannot expose external-only protein guidance as a fake constraint', async () => {
  const { repo, registry } = await realFixture();
  const bundle = await loadConfigurationBundle(repo);
  const planned = bundle.dayClasses.flatMap(day => day.mealSlots).find(slot => slot.mode === 'planned');
  assert.ok(planned);
  planned.proteinMinG = 25;
  await assert.rejects(() => saveConfigurationBundle(bundle, { repo, registry }), /Configuration validation failed|proteinMinG/);
});

test('Phase A — unknown external energy cannot be reported as a hard-valid calorie day', async () => {
  const { repo, registry } = await realFixture();
  const bundle = await loadConfigurationBundle(repo);
  const day = bundle.dayClasses.find(item => item.id === bundle.cycles.find(cycle => cycle.id === bundle.appConfig.cycleId)?.days?.[0]?.dayClassId) || bundle.dayClasses[0];
  const slot = day.mealSlots[0];
  slot.mode = 'external';
  slot.estimatedNutritionPolicy = 'unknown';
  slot.energyBudgetKcal = null;
  slot.energyShare = null;
  slot.proteinMinG = null;
  await saveConfigurationBundle(bundle, { repo, registry });
  const result = await createInitialPreview({ horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: 'phase-a-external-unknown' }, { repo, registry });
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'external_energy_unknown');
  assert.equal(result.failure.constraintId, 'daily_energy_tolerance');
});
