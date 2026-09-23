import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { syntheticSafetyEvidence } from './helpers.mjs';

function revision(index) {
  return {
    ingredientRevisionId: `rev_seed_${index}`,
    ingredientId: `ing_seed_${index}`,
    taxonomy: { foodGroup: 'food_group_grains_starches', foodSubgroup: null },
    productTaxonomy: { categoryId: 'product_category_grains_starches', subcategoryId: 'product_subcategory_grains_starches_general', conceptId: `product_concept_seed_${index}` },
    allergenIds: [], safetyEvidence: syntheticSafetyEvidence([]), basis: { state: 'cooked', amount: 100, unit: 'g' }, source: { reference: 'synthetic-seed-diversity' }
  };
}

function recipe(index, energyKcal) {
  return {
    recipeId: `recipe_seed_${index}`,
    recipeVersionId: `recipe_seed_${index}_v1`,
    mealArchetypes: ['breakfast'],
    calculatedNutrition: { energyKcal, proteinG: 10, carbsG: 30, fatG: 10, fiberG: 3 },
    practical: { prepMinutes: 2, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true },
    tags: { families: [`family_seed_${index}`], cuisines: ['cuisine_test'], diet: [], flavor: ['savory'], practical: ['portable'] },
    allergenIds: [],
    ingredientLines: [{ ingredientId: `ing_seed_${index}`, ingredientRevisionId: `rev_seed_${index}`, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    quality: { status: 'validated' }, origin: 'base'
  };
}

function input(seed) {
  const revisions = [0, 1, 2, 3].map(revision);
  const recipes = [300, 300.1, 300.2, 300.3].map((energy, index) => recipe(index, energy));
  return {
    nutritionProfile: { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 300, energyTolerancePct: 5, preset: 'custom', nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } }, dayArchetypeModifiers: {} },
    allergyProfile: { schemaVersion: 1, id: 'allergy', rules: [] },
    foodPreferences: { schemaVersion: 1, id: 'prefs', rules: [] },
    mealClasses: [{ schemaVersion: 1, id: 'mc-breakfast', name: 'Breakfast', abbreviation: 'BR', mealArchetype: 'breakfast', energyShare: { target: 1, min: 1, max: 1 }, maxComponents: 1, rules: [] }],
    dayClasses: [{ schemaVersion: 1, id: 'dc-day', name: 'Day', abbreviation: 'D', color: '#000000', dayArchetype: 'day', workWindows: [], capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 }, mealSlots: [{ id: 'breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 300, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }] }],
    cycle: { schemaVersion: 1, id: 'cycle', name: 'Daily', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-day' }] },
    recipes, ingredients: [], ingredientRevisions: revisions, taxonomyTerms: [], foodGroups: [],
    horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed, catalogVersion: 'seed-test', configSnapshotHash: 'seed-test', createdAt: '2026-09-23T00:00:00.000Z',
    candidateLimit: 4, beamWidth: 20, slotOptionLimit: 4
  };
}

function selected(result) { return result.calendarDays[0].mealSlots[0].recipeComponents[0].recipeVersionId; }

test('same seed stays deterministic while a different seed can select a near-equivalent proposal', () => {
  const first = generatePlanCore(input('a'));
  const repeated = generatePlanCore(input('a'));
  const alternate = generatePlanCore(input('b'));
  assert.equal(first.status, 'success');
  assert.equal(repeated.status, 'success');
  assert.equal(alternate.status, 'success');
  assert.equal(selected(first), selected(repeated));
  assert.notEqual(selected(first), selected(alternate));
});

function frequencyInput(seed) {
  const value = input(seed);
  value.foodPreferences = {
    schemaVersion: 2,
    id: 'prefs-frequency-seed',
    plannerPolicy: { varietyMode: 'no_variety' },
    legacyRules: [],
    rules: [{
      id: 'nonbinding-frequency-seed', enabled: true, mode: 'frequency',
      target: { type: 'productFood', id: 'product_category_grains_starches' },
      scope: { mealClassIds: [] }, countUnit: 'meal', countBasis: 'planned',
      window: { kind: 'rolling', days: 7 }, minOccurrences: null, targetOccurrences: null, maxOccurrences: 7,
      priority: 'normal', effectiveFrom: '2026-09-23'
    }]
  };
  value.planBeamWidth = 6;
  value.alternativesPerDay = 4;
  return value;
}

test('seed diversification is preserved through the multi-day frequency planner', () => {
  const first = generatePlanCore(frequencyInput('frequency-a'));
  const repeated = generatePlanCore(frequencyInput('frequency-a'));
  const alternate = generatePlanCore(frequencyInput('frequency-b'));
  assert.equal(first.status, 'success', JSON.stringify(first.failure));
  assert.equal(repeated.status, 'success', JSON.stringify(repeated.failure));
  assert.equal(alternate.status, 'success', JSON.stringify(alternate.failure));
  assert.equal(selected(first), selected(repeated));
  assert.notEqual(selected(first), selected(alternate));
  assert.equal(first.generationRun.solverVersion, 'window-beam-r3-2');
});
