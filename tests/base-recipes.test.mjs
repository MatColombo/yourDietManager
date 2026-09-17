import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { compileSourceBatches } from '../src/catalog/cleanCatalogCompiler.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { fileLoader } from './helpers.mjs';

const root = path.resolve('.');
async function registry() { const r = new SchemaRegistry(fileLoader(path.join(root,'schemas'))); await r.loadAll(); return r; }
async function source(name) { return JSON.parse(await readFile(path.join(root,'catalog-source',name),'utf8')); }

const EXPECTED_MEALS = {
  tax_meal_breakfast: 24,
  tax_meal_lunch: 34,
  tax_meal_dinner: 34,
  tax_meal_snack: 24,
  tax_meal_mini_meal: 14
};

const ENERGY_RANGES = {
  breakfast: [200, 650],
  lunch: [300, 750],
  dinner: [250, 800],
  snack: [100, 350],
  mini_meal: [200, 600]
};

test('base recipe seed is varied, balanced, and compiles against the clean ingredient pool', async () => {
  const foundation = await source('000-foundation.json');
  const ingredients = await source('001-base-ingredients.json');
  const seed = await source('002-base-recipes.json');
  const recipes = seed.records.filter(row => row.kind === 'recipe' && row.status === 'active');

  assert.equal(recipes.length, 130);
  const mealCounts = new Map();
  const titlesIt = new Set();
  const titlesEn = new Set();
  const ingredientSets = new Set();
  const forbiddenTitle = /(?:come vendut|as sold|\([^)]*(?:raw|cooked|dry|frozen|canned)[^)]*\))/i;

  for (const recipe of recipes) {
    assert.equal(recipe.servings, 1, `${recipe.id} must be one serving`);
    assert.ok(recipe.ingredients.length >= 2 && recipe.ingredients.length <= 8, `${recipe.id} should have 2-8 ingredients`);
    assert.equal(recipe.mealTypeIds.length, 1, `${recipe.id} must have one primary meal type in the seed`);
    const meal = recipe.mealTypeIds[0];
    mealCounts.set(meal, (mealCounts.get(meal) || 0) + 1);
    assert.ok(!titlesIt.has(recipe.title.it), `duplicate Italian title: ${recipe.title.it}`);
    assert.ok(!titlesEn.has(recipe.title.en), `duplicate English title: ${recipe.title.en}`);
    titlesIt.add(recipe.title.it); titlesEn.add(recipe.title.en);
    assert.doesNotMatch(recipe.title.it, forbiddenTitle, `${recipe.id} has a source-like Italian title`);
    assert.doesNotMatch(recipe.title.en, forbiddenTitle, `${recipe.id} has a source-like English title`);
    const signature = [...new Set(recipe.ingredients.map(line => line.ingredientId))].sort().join('|');
    assert.ok(!ingredientSets.has(signature), `duplicate ingredient-set: ${recipe.id}`);
    ingredientSets.add(signature);
  }
  assert.deepEqual(Object.fromEntries([...mealCounts].sort()), Object.fromEntries(Object.entries(EXPECTED_MEALS).sort()));

  const signatures = recipes.map(recipe => ({
    id: recipe.id,
    meal: recipe.mealTypeIds[0],
    ingredients: new Set(recipe.ingredients.map(line => line.ingredientId))
  }));
  for (let i = 0; i < signatures.length; i += 1) {
    for (let j = i + 1; j < signatures.length; j += 1) {
      if (signatures[i].meal !== signatures[j].meal) continue;
      const a = signatures[i].ingredients;
      const b = signatures[j].ingredients;
      const intersection = [...a].filter(id => b.has(id)).length;
      const union = new Set([...a, ...b]).size;
      assert.ok(intersection / union < 0.8, `near-duplicate recipes in ${signatures[i].meal}: ${signatures[i].id} / ${signatures[j].id}`);
    }
  }

  const r = await registry();
  const compiled = await compileSourceBatches([
    {filename:'000-foundation.json', batch:foundation},
    {filename:'001-base-ingredients.json', batch:ingredients},
    {filename:'002-base-recipes.json', batch:seed}
  ], { registry:r });

  assert.equal(compiled.ingredients.length, 163);
  assert.equal(compiled.recipes.length, 130);
  assert.equal(compiled.recipeVersions.length, 130);

  const byMeal = new Map();
  for (const recipe of compiled.recipeVersions) {
    assert.ok(recipe.calculatedNutrition.energyKcal > 0, `${recipe.recipeId} must have derived energy`);
    assert.ok(recipe.calculatedNutrition.proteinG >= 0);
    assert.ok(recipe.calculatedNutrition.carbsG >= 0);
    assert.ok(recipe.calculatedNutrition.fatG >= 0);
    assert.ok(recipe.calculatedNutrition.fiberG >= 0);
    for (const meal of recipe.mealArchetypes) (byMeal.get(meal) || byMeal.set(meal, []).get(meal)).push(recipe.calculatedNutrition.energyKcal);
  }
  for (const [meal, [min, max]] of Object.entries(ENERGY_RANGES)) {
    const values = byMeal.get(meal) || [];
    assert.ok(values.length > 0, `missing ${meal} recipes`);
    for (const kcal of values) assert.ok(kcal >= min && kcal <= max, `${meal} recipe energy ${kcal} kcal outside ${min}-${max}`);
  }

  const families = new Set(compiled.recipeVersions.flatMap(recipe => recipe.tags.families));
  for (const family of ['recipe_family_pasta_dish','recipe_family_risotto','recipe_family_grain_salad','recipe_family_legume_soup','recipe_family_frittata','recipe_family_fish_plate','recipe_family_chicken_plate','recipe_family_yogurt_bowl','recipe_family_porridge','recipe_family_mediterranean_salad']) {
    assert.ok(families.has(family), `missing important recipe family ${family}`);
  }

  const vegan = compiled.recipeVersions.filter(recipe => recipe.tags.diet.includes('diet_vegan')).length;
  const vegetarian = compiled.recipeVersions.filter(recipe => recipe.tags.diet.includes('diet_vegetarian')).length;
  const pescatarian = compiled.recipeVersions.filter(recipe => recipe.tags.diet.includes('diet_pescatarian')).length;
  assert.ok(vegan >= 35, `expected strong vegan coverage, got ${vegan}`);
  assert.ok(vegetarian >= 70, `expected strong vegetarian coverage, got ${vegetarian}`);
  assert.ok(pescatarian >= 15, `expected fish coverage, got ${pescatarian}`);
});
