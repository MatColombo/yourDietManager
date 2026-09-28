import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCandidateFrontier } from '../src/planner/beamSolver.js';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { seededStratifiedSelection } from '../src/services/planCandidateService.js';

function frontierRecipe(index) {
  return {
    recipeId: `frontier_recipe_${index}`,
    recipeVersionId: `frontier_recipe_${index}_v1`,
    calculatedNutrition: { energyKcal: 250 + (index % 101) },
    tags: { families: [`family_${index % 17}`], cuisines: [`cuisine_${index % 11}`] },
    ingredientLines: [{ ingredientId: `ingredient_${index % 37}` }]
  };
}

test('seeded candidate frontier gives the whole hard-feasible population exposure across proposals', () => {
  const candidates = Array.from({ length: 120 }, (_, index) => ({ recipe: frontierRecipe(index), score: { total: index / 3 }, tie: 0 }));
  const seen = new Set();
  for (let index = 0; index < 80; index += 1) {
    const frontier = selectCandidateFrontier(candidates, { targetEnergy: 300, limit: 24, seed: `exposure-${index}`, explorationKey: 'breakfast' });
    for (const item of frontier) seen.add(item.recipe.recipeVersionId);
  }
  assert.equal(seen.size, candidates.length, `expected every candidate to receive frontier exposure, saw ${seen.size}/${candidates.length}`);
});

test('seeded bounded retrieval rotates recipes inside deterministic energy/frequency strata', () => {
  const buckets = new Map();
  for (let bucket = 0; bucket < 5; bucket += 1) {
    const rows = Array.from({ length: 80 }, (_, index) => ({ recipeVersionId: `bucket_${bucket}_recipe_${index}` }));
    buckets.set(`bucket_${bucket}`, rows);
  }
  const first = seededStratifiedSelection(buckets, 100, 'same-seed').map(row => row.recipeVersionId);
  const repeated = seededStratifiedSelection(buckets, 100, 'same-seed').map(row => row.recipeVersionId);
  assert.deepEqual(first, repeated);

  const seen = new Set();
  for (let index = 0; index < 40; index += 1) for (const row of seededStratifiedSelection(buckets, 100, `retrieval-${index}`)) seen.add(row.recipeVersionId);
  assert.equal(seen.size, 400, `expected all truncated recipes to become retrievable across seeds, saw ${seen.size}/400`);
});

function revision(index) {
  return {
    ingredientRevisionId: `rev_exposure_${index}`,
    ingredientId: `ing_exposure_${index}`,
    taxonomy: { foodGroup: 'food_group_grains_starches', foodSubgroup: null },
    productTaxonomy: { categoryId: 'product_category_grains_starches', subcategoryId: 'product_subcategory_grains_starches_general', conceptId: `product_concept_exposure_${index}` },
    allergenIds: [], basis: { state: 'cooked', amount: 100, unit: 'g' }, source: { reference: 'synthetic-exposure-fairness' }
  };
}

function recipe(index) {
  return {
    recipeId: `recipe_exposure_${index}`,
    recipeVersionId: `recipe_exposure_${index}_v1`,
    mealArchetypes: ['breakfast'],
    calculatedNutrition: { energyKcal: 290 + (index % 21), proteinG: 10, carbsG: 30, fatG: 10, fiberG: 3 },
    practical: { prepMinutes: 2, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true },
    tags: { families: [`family_exposure_${index % 25}`], cuisines: [`cuisine_exposure_${index % 12}`], diet: [], flavor: ['savory'], practical: ['portable'] },
    allergenIds: [],
    ingredientLines: [{ ingredientId: `ing_exposure_${index}`, ingredientRevisionId: `rev_exposure_${index}`, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    quality: { status: 'validated' }, origin: 'base'
  };
}

function planInput(seed) {
  const ingredientRevisions = Array.from({ length: 100 }, (_, index) => revision(index));
  const recipes = Array.from({ length: 100 }, (_, index) => recipe(index));
  return {
    nutritionProfile: { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 300, energyTolerancePct: 5, preset: 'custom', nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } }, dayArchetypeModifiers: {} },
    allergyProfile: { schemaVersion: 1, id: 'allergy', rules: [] },
    foodPreferences: { schemaVersion: 1, id: 'prefs', rules: [] },
    mealClasses: [{ schemaVersion: 1, id: 'mc-breakfast', name: 'Breakfast', abbreviation: 'BR', mealArchetype: 'breakfast', energyShare: { target: 1, min: 1, max: 1 }, maxComponents: 1, rules: [] }],
    dayClasses: [{ schemaVersion: 1, id: 'dc-day', name: 'Day', abbreviation: 'D', color: '#000000', dayArchetype: 'day', workWindows: [], capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 }, mealSlots: [{ id: 'breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 300, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }] }],
    cycle: { schemaVersion: 1, id: 'cycle', name: 'Daily', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-day' }] },
    recipes, ingredients: [], ingredientRevisions, taxonomyTerms: [], foodGroups: [],
    horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed, catalogVersion: 'exposure-test', configSnapshotHash: 'exposure-test', createdAt: '2026-09-23T00:00:00.000Z',
    candidateLimit: 20, beamWidth: 60, slotOptionLimit: 20
  };
}

test('final pick is not confined to the greedy elite across different proposal seeds', () => {
  const seen = new Set();
  let deepestIndex = -1;
  for (let index = 0; index < 100; index += 1) {
    const result = generatePlanCore(planInput(`proposal-${index}`));
    assert.equal(result.status, 'success', JSON.stringify(result.failure));
    const selected = result.calendarDays[0].mealSlots[0].recipeComponents[0].recipeVersionId;
    seen.add(selected);
    const match = selected.match(/recipe_exposure_(\d+)_v1/);
    deepestIndex = Math.max(deepestIndex, Number(match?.[1] ?? -1));
  }
  assert.ok(seen.size >= 25, `expected broad final-pick coverage, got ${seen.size} unique recipes`);
  assert.ok(deepestIndex >= 50, `expected recipes outside the former greedy elite to win, deepest index ${deepestIndex}`);
});
