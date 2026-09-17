import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { compileSourceBatches } from '../src/catalog/cleanCatalogCompiler.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { fileLoader } from './helpers.mjs';

const root = path.resolve('.');
async function source(name) { return JSON.parse(await readFile(path.join(root, 'catalog-source', name), 'utf8')); }
async function registry() { const r = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await r.loadAll(); return r; }
function setOf(recipe) { return new Set(recipe.ingredients.map(line => line.ingredientId)); }
function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  let intersection = 0;
  for (const id of a) if (b.has(id)) intersection += 1;
  return intersection / union.size;
}
function groupOf(recipe) {
  const m = recipe.id.match(/^recipe_r2_(breakfast|quick|elaborate|snack)_/);
  return m?.[1] || null;
}

test('Italian expansion round 2 adds sourced ingredients and exactly 200 structurally varied recipes', async () => {
  const names = [
    '000-foundation.json',
    '001-base-ingredients.json',
    '002-base-recipes.json',
    '003-expanded-recipes-200.json',
    '004-italian-ingredients-expansion.json',
    '005-italian-recipes-expansion-200.json'
  ];
  const batches = Object.fromEntries(await Promise.all(names.map(async name => [name, await source(name)])));
  const ingredientBatch = batches['004-italian-ingredients-expansion.json'];
  const recipeBatch = batches['005-italian-recipes-expansion-200.json'];
  const newIngredients = ingredientBatch.records.filter(row => row.kind === 'ingredient' && row.status === 'active');
  const newRecipes = recipeBatch.records.filter(row => row.kind === 'recipe' && row.status === 'active');

  assert.ok(newIngredients.length >= 100, `expected at least 100 new ingredients; got ${newIngredients.length}`);
  assert.equal(newIngredients.length, 119);
  assert.equal(newRecipes.length, 200);

  const counts = { breakfast: 0, quick: 0, elaborate: 0, snack: 0 };
  const archetypes = { breakfast: new Set(), quick: new Set(), elaborate: new Set(), snack: new Set() };
  for (const recipe of newRecipes) {
    const group = groupOf(recipe);
    assert.ok(group, `${recipe.id} must use the round-2 group prefix`);
    counts[group] += 1;
    archetypes[group].add(recipe.archetypeId);
    assert.equal(recipe.servings, 1);
    assert.ok(recipe.ingredients.length >= 2 && recipe.ingredients.length <= 8, `${recipe.id} should have 2-8 ingredients`);
    if (group === 'quick') {
      assert.ok(recipe.practicalTagIds.includes('tax_practical_quick'));
      assert.ok(recipe.prepMinutes + recipe.cookMinutes <= 30, `${recipe.id} exceeds quick-meal time budget`);
    }
    if (group === 'elaborate') {
      assert.ok(recipe.practicalTagIds.includes('tax_practical_elaborate'));
      assert.ok(recipe.prepMinutes + recipe.cookMinutes >= 40, `${recipe.id} is not materially elaborate`);
    }
  }
  assert.deepEqual(counts, { breakfast: 50, quick: 50, elaborate: 50, snack: 50 });
  assert.ok(archetypes.breakfast.size >= 18);
  assert.ok(archetypes.quick.size >= 15);
  assert.ok(archetypes.elaborate.size >= 15);
  assert.ok(archetypes.snack.size >= 14);

  // Every ingredient introduced by this batch must be genuinely useful: each one is used by at least one new recipe.
  const newIngredientIds = new Set(newIngredients.map(row => row.id));
  const usedNewIngredientIds = new Set(
    newRecipes.flatMap(recipe => recipe.ingredients.map(line => line.ingredientId)).filter(id => newIngredientIds.has(id))
  );
  assert.equal(usedNewIngredientIds.size, newIngredientIds.size, `unused new ingredients: ${[...newIngredientIds].filter(id => !usedNewIngredientIds.has(id)).join(', ')}`);

  // Source and semantic safety checks for the ingredient expansion.
  for (const ingredient of newIngredients) {
    assert.equal(ingredient.source.provider, 'USDA_FDC');
    assert.match(String(ingredient.source.sourceId || ''), /^\d+$/);
    assert.ok(ingredient.source.description?.trim(), `${ingredient.id} missing source description`);
    for (const key of ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG']) {
      assert.ok(Number.isFinite(ingredient.nutritionPer100g[key]) && ingredient.nutritionPer100g[key] >= 0, `${ingredient.id}.${key} invalid`);
    }
    if (ingredient.allergens.includes('eggs') || ingredient.allergens.includes('milk')) assert.equal(ingredient.dietFlags.vegan, false, `${ingredient.id} cannot be vegan with egg/milk allergen`);
    if (['tax_category_meat_poultry', 'tax_category_fish_seafood'].includes(ingredient.categoryId)) {
      assert.equal(ingredient.dietFlags.vegetarian, false, `${ingredient.id} cannot be vegetarian`);
      assert.equal(ingredient.dietFlags.vegan, false, `${ingredient.id} cannot be vegan`);
    }
  }
  assert.ok(!newIngredientIds.has('ing_lupins_raw'), 'raw mature lupins must not be introduced into the recipe-ready catalog');

  // Compare every new recipe with the full pre-existing 330-recipe corpus.
  const priorRecipes = [
    ...batches['002-base-recipes.json'].records,
    ...batches['003-expanded-recipes-200.json'].records
  ].filter(row => row.kind === 'recipe' && row.status === 'active');
  const allRecipes = [...priorRecipes, ...newRecipes];
  const titlesIt = new Map();
  const titlesEn = new Map();
  const signatures = new Map();
  for (const recipe of allRecipes) {
    for (const [map, title, locale] of [[titlesIt, recipe.title.it, 'it'], [titlesEn, recipe.title.en, 'en']]) {
      const key = title.trim().toLocaleLowerCase(locale);
      assert.ok(!map.has(key), `duplicate ${locale} title: ${map.get(key)} / ${recipe.id}`);
      map.set(key, recipe.id);
    }
    const signature = [...setOf(recipe)].sort().join('|');
    for (const mealTypeId of recipe.mealTypeIds) {
      const key = `${mealTypeId}:${signature}`;
      assert.ok(!signatures.has(key), `duplicate ingredient set for ${mealTypeId}: ${signatures.get(key)} / ${recipe.id}`);
      signatures.set(key, recipe.id);
    }
  }

  for (let i = 0; i < allRecipes.length; i += 1) {
    for (let j = i + 1; j < allRecipes.length; j += 1) {
      const a = allRecipes[i], b = allRecipes[j];
      if (!a.mealTypeIds.some(meal => b.mealTypeIds.includes(meal))) continue;
      const score = jaccard(setOf(a), setOf(b));
      assert.ok(score < 0.8, `near-duplicate recipes (${score.toFixed(2)}): ${a.id} / ${b.id}`);
    }
  }

  const r = await registry();
  const compiled = await compileSourceBatches(names.map(filename => ({ filename, batch: batches[filename] })), { registry: r });
  assert.equal(compiled.ingredients.length, 282);
  assert.equal(compiled.recipes.length, 530);
  assert.equal(compiled.recipeVersions.length, 530);

  const runtimeById = new Map(compiled.recipeVersions.map(row => [row.recipeId, row]));
  const energyRanges = {
    breakfast: [180, 650],
    quick: [250, 800],
    elaborate: [300, 900],
    snack: [80, 400]
  };
  for (const recipe of newRecipes) {
    const runtime = runtimeById.get(recipe.id);
    assert.ok(runtime, `missing compiled recipe ${recipe.id}`);
    const kcal = runtime.calculatedNutrition.energyKcal;
    const [min, max] = energyRanges[groupOf(recipe)];
    assert.ok(kcal >= min && kcal <= max, `${recipe.id}: ${kcal} kcal outside ${min}-${max}`);
  }
});
