import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { solveDayBeam } from '../src/planner/beamSolver.js';
import { syntheticSafetyEvidence } from './helpers.mjs';

function revision(id, ingredientId, categoryId) {
  return {
    ingredientRevisionId: id,
    ingredientId,
    taxonomy: { foodGroup: categoryId, foodSubgroup: categoryId },
    productTaxonomy: { categoryId, subcategoryId: `${categoryId}_general`, conceptId: `${categoryId}_${ingredientId}` },
    allergenIds: [],
    safetyEvidence: syntheticSafetyEvidence([]),
    basis: { state: 'cooked', amount: 100, unit: 'g' },
    source: { reference: 'synthetic-frequency-cap-regression' }
  };
}

function recipe(id, revisionId, ingredientId) {
  return {
    recipeId: id,
    recipeVersionId: `${id}_v1`,
    mealArchetypes: ['breakfast'],
    calculatedNutrition: { energyKcal: 300, proteinG: 15, carbsG: 30, fatG: 10, fiberG: 5 },
    practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true },
    tags: { families: [`family_${id}`], cuisines: ['cuisine_test'], diet: [], flavor: ['savory'], practical: ['portable'] },
    allergenIds: [],
    ingredientLines: [{ ingredientId, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    quality: { status: 'validated' },
    origin: 'base'
  };
}

function input() {
  const dairyRevision = revision('rev_dairy', 'ing_dairy', 'product_category_dairy');
  const plainRevision = revision('rev_plain', 'ing_plain', 'product_category_vegetables');
  const dairy = recipe('recipe_dairy', dairyRevision.ingredientRevisionId, dairyRevision.ingredientId);
  const plain = recipe('recipe_plain', plainRevision.ingredientRevisionId, plainRevision.ingredientId);
  const mealClasses = [{ schemaVersion: 1, id: 'mc-breakfast', name: 'Breakfast', abbreviation: 'BR', mealArchetype: 'breakfast', energyShare: { target: 1, min: 1, max: 1 }, rules: [] }];
  const dayClasses = [{ schemaVersion: 1, id: 'dc-day', name: 'Day', abbreviation: 'D', color: '#000000', dayArchetype: 'day', workWindows: [], capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 }, mealSlots: [{ id: 'breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 300, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }] }];
  return {
    nutritionProfile: { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 300, energyTolerancePct: 1, preset: 'custom', nutrients: { proteinG: { enabled: false, min: null, target: null, max: null, weight: 0 }, carbsG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fatG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fiberG: { enabled: false, min: null, target: null, max: null, weight: 0 } }, dayArchetypeModifiers: {} },
    allergyProfile: { schemaVersion: 1, id: 'allergy', rules: [] },
    foodPreferences: { schemaVersion: 2, id: 'prefs', plannerPolicy: { varietyMode: 'no_variety' }, legacyRules: [], rules: [{ id: 'max-dairy', enabled: true, mode: 'frequency', target: { type: 'productFood', id: 'product_category_dairy' }, scope: { mealClassIds: [] }, countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 7 }, minOccurrences: null, targetOccurrences: null, maxOccurrences: 1, priority: 'normal', effectiveFrom: '2026-09-21' }] },
    mealClasses,
    dayClasses,
    cycle: { schemaVersion: 1, id: 'cycle', name: 'Daily', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-day' }] },
    recipes: [dairy, plain],
    ingredients: [],
    ingredientRevisions: [dairyRevision, plainRevision],
    taxonomyTerms: [],
    foodGroups: [],
    horizon: { startDate: '2026-09-21', endDate: '2026-09-23' },
    seed: 'frequency-cap-headroom',
    catalogVersion: 'test',
    configSnapshotHash: 'test',
    createdAt: '2026-09-21T00:00:00.000Z',
    candidateLimit: 1,
    beamWidth: 20,
    slotOptionLimit: 4,
    planBeamWidth: 2,
    alternativesPerDay: 2
  };
}

test('saturated rolling max is applied before candidate-frontier selection', () => {
  const result = generatePlanCore(input());
  assert.equal(result.status, 'success', JSON.stringify(result.failure));
  assert.equal(result.calendarDays.length, 3);
  const selected = result.calendarDays.map(day => day.mealSlots[0].recipeComponents[0].recipeVersionId);
  assert.equal(selected[0], 'recipe_dairy_v1');
  assert.deepEqual(selected.slice(1), ['recipe_plain_v1', 'recipe_plain_v1']);
  const completeOrPending = result.diagnostics.frequencies.windows.filter(window => window.ruleId === 'max-dairy');
  assert.ok(completeOrPending.every(window => window.count <= 1));
  const admissionRejections = result.diagnostics.days.flatMap(day => day.slotDiagnostics || []).reduce((sum, slot) => sum + Number(slot.frequencyAdmissionRejectedCount || 0), 0);
  assert.ok(admissionRejections > 0);
});

test('day solver reports frequency pruning separately from energy pruning', () => {
  const recipeRow = { recipeId: 'r', recipeVersionId: 'r_v1', calculatedNutrition: { energyKcal: 300, proteinG: 10, carbsG: 30, fatG: 10, fiberG: 3 } };
  const option = { recipes: [recipeRow], nutrition: recipeRow.calculatedNutrition, score: 0, tie: 0 };
  const result = solveDayBeam([{ id: 'slot', options: [option] }], {
    dayEnergyTarget: 300,
    externalEnergy: 0,
    nutritionProfile: { energyTolerancePct: 5, nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } } },
    beamWidth: 10,
    evaluateState: () => ({ valid: false, idealPenalty: 0 })
  });
  assert.equal(result.solution, null);
  assert.equal(result.diagnostics.code, 'frequency_frontier_exhausted');
  assert.equal(result.diagnostics.frequencyPrunedStates, 1);
  assert.equal(result.diagnostics.energyPrunedStates, 0);
});
