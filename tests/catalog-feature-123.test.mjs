import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIngredientNutritionBreakdown, calculateMealEnergyKcal, calculateRecipeNutrition } from '../src/domain/nutritionCore.js';
import { CatalogQueryService, recipeMatchesTaxonomyFilters } from '../src/services/catalogQuery.js';
import { MemoryRepository } from './helpers.mjs';

function revision(id, ingredientId, nutrition) {
  return { ingredientRevisionId: id, ingredientId, basis: { amount: 100, unit: 'g' }, nutrition };
}

function line(ingredientId, ingredientRevisionId, normalizedAmount) {
  return { ingredientId, ingredientRevisionId, amount: normalizedAmount, unit: 'g', normalizedAmount, normalizedUnit: 'g' };
}

test('Feature 1 — ingredient nutrition breakdown exposes absolute contribution and share of recipe totals', () => {
  const revisions = new Map([
    ['ir_a', revision('ir_a', 'ing_a', { energyKcal: 100, proteinG: 10, carbsG: 20, fatG: 2, fiberG: 4 })],
    ['ir_b', revision('ir_b', 'ing_b', { energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0 })]
  ]);
  const lines = [line('ing_a', 'ir_a', 100), line('ing_b', 'ir_b', 10)];
  const total = calculateRecipeNutrition(lines, revisions);
  const rows = calculateIngredientNutritionBreakdown(lines, revisions, total);
  assert.deepEqual(total, { energyKcal: 190, proteinG: 10, carbsG: 20, fatG: 12, fiberG: 4 });
  assert.equal(rows[0].nutrition.energyKcal, 100);
  assert.equal(rows[1].nutrition.energyKcal, 90);
  assert.equal(rows[0].sharePercent.energyKcal, 52.6);
  assert.equal(rows[1].sharePercent.energyKcal, 47.4);
  assert.equal(rows[0].sharePercent.proteinG, 100);
  assert.equal(rows[1].sharePercent.proteinG, 0);
});

test('Feature 3 — meal preview energy sums recipe components using servings', () => {
  const nutrition = {
    rv_a: { energyKcal: 300 },
    rv_b: { energyKcal: 200 }
  };
  assert.equal(calculateMealEnergyKcal([{ recipeVersionId: 'rv_a', servings: 1 }, { recipeVersionId: 'rv_b', servings: 0.5 }], nutrition), 400);
  assert.equal(calculateMealEnergyKcal([{ recipeVersionId: 'missing', servings: 1 }], nutrition), null);
});

test('Feature 2 — recipe taxonomy filters cover family, cuisine, diet, flavor, practical and preparation', () => {
  const recipe = { tags: { families: ['family_bowl'], cuisines: ['cuisine_italian'], diet: ['diet_vegetarian'], flavor: ['flavor_savory'], practical: ['practical_quick'], preparation: ['prep_no_cook'] } };
  assert.equal(recipeMatchesTaxonomyFilters(recipe, { familyTag: 'family_bowl', cuisineTag: 'cuisine_italian', dietTag: 'diet_vegetarian', flavorTag: 'flavor_savory', practicalTag: 'practical_quick', preparationTag: 'prep_no_cook' }), true);
  assert.equal(recipeMatchesTaxonomyFilters(recipe, { flavorTag: 'flavor_sweet' }), false);
});

test('Feature 2 — CatalogQueryService applies taxonomy categories to browsable recipes', async () => {
  const repo = new MemoryRepository();
  await repo.setMeta('activeCatalogVersion', 'catalog-test');
  const versions = [
    {
      recipeVersionId: 'rv_it', recipeId: 'r_it', origin: 'base', catalogVersion: 'catalog-test', mealArchetypes: ['lunch'], allergenIds: [], ingredientLines: [],
      calculatedNutrition: { energyKcal: 500, proteinG: 20, carbsG: 60, fatG: 18, fiberG: 8 }, practical: { prepMinutes: 10 },
      tags: { families: ['family_bowl'], cuisines: ['cuisine_italian'], diet: [], flavor: ['flavor_savory'], practical: ['practical_quick'], preparation: ['prep_no_cook'] }, i18n: { it: { title: 'Bowl italiana' } }
    },
    {
      recipeVersionId: 'rv_other', recipeId: 'r_other', origin: 'base', catalogVersion: 'catalog-test', mealArchetypes: ['lunch'], allergenIds: [], ingredientLines: [],
      calculatedNutrition: { energyKcal: 510, proteinG: 21, carbsG: 62, fatG: 17, fiberG: 7 }, practical: { prepMinutes: 12 },
      tags: { families: ['family_soup'], cuisines: ['cuisine_greek'], diet: [], flavor: ['flavor_savory'], practical: [], preparation: ['prep_simmer'] }, i18n: { it: { title: 'Zuppa greca' } }
    }
  ];
  await repo.putMany('recipes', [
    { recipeId: 'r_it', origin: 'base', status: 'active', currentVersionId: 'rv_it' },
    { recipeId: 'r_other', origin: 'base', status: 'active', currentVersionId: 'rv_other' }
  ]);
  await repo.putMany('recipeVersions', versions);
  await repo.put('catalogPacks', { catalogVersion: 'catalog-test', packId: 'core', status: 'installed', recipeVersionIds: versions.map(item => item.recipeVersionId) });
  const service = new CatalogQueryService({ repo });
  const result = await service.searchRecipes({ cuisineTag: 'cuisine_italian', familyTag: 'family_bowl' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].recipeVersionId, 'rv_it');
  const none = await service.searchRecipes({ preparationTag: 'prep_bake' });
  assert.equal(none.total, 0);
});
