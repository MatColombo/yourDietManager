import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'catalog-source');
const BATCH_NAME = '009-balanced-recipes-500.json';
const MEALS = ['tax_meal_breakfast', 'tax_meal_lunch', 'tax_meal_dinner', 'tax_meal_snack', 'tax_meal_mini_meal'];

function sourceFilesThrough008() {
  return fs.readdirSync(SOURCE).filter((name) => name.endsWith('.json') && name < BATCH_NAME).sort();
}

function resolvedRecords(files) {
  const versions = new Map();
  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, file), 'utf8'));
    for (const record of batch.records ?? []) {
      const key = `${record.kind}:${record.id}`;
      const previous = versions.get(key);
      if (!previous || record.revision > previous.revision) versions.set(key, record);
    }
  }
  return [...versions.values()].filter((record) => record.status === 'active');
}

function baselineUsage() {
  const records = resolvedRecords(sourceFilesThrough008());
  const ingredients = records.filter((record) => record.kind === 'ingredient');
  const recipes = records.filter((record) => record.kind === 'recipe');
  const usage = new Map(ingredients.map((ingredient) => [ingredient.id, 0]));
  for (const recipe of recipes) {
    for (const line of recipe.ingredients ?? []) usage.set(line.ingredientId, (usage.get(line.ingredientId) ?? 0) + 1);
  }
  return usage;
}

test('balanced 500 expansion is exactly distributed across all meal types', () => {
  const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, BATCH_NAME), 'utf8'));
  const recipes = (batch.records ?? []).filter((record) => record.kind === 'recipe' && record.status === 'active');
  assert.equal(batch.batchId, 'catalog_balanced_recipes_500_v1');
  assert.equal(recipes.length, 500);
  assert.equal(new Set(recipes.map((recipe) => recipe.id)).size, 500);

  for (const mealId of MEALS) {
    assert.equal(recipes.filter((recipe) => recipe.mealTypeIds?.includes(mealId)).length, 100, `${mealId} must have exactly 100 new recipes`);
  }
  for (const recipe of recipes) {
    assert.equal(recipe.mealTypeIds.length, 1, `${recipe.id} must target exactly one meal type`);
    assert.ok(MEALS.includes(recipe.mealTypeIds[0]), `${recipe.id} has an unexpected meal type`);
    assert.ok(recipe.ingredients.length >= 3 && recipe.ingredients.length <= 5, `${recipe.id} ingredient count must stay practical`);
    assert.equal(recipe.flavorProfileIds.length, 1, `${recipe.id} must have exactly one flavor profile`);
    assert.ok(recipe.practicalTagIds.length > 0, `${recipe.id} requires practical tags`);
    assert.ok(recipe.preparationTechniqueIds.length > 0, `${recipe.id} requires a preparation technique`);
    assert.ok(Number.isInteger(recipe.eatingMinutes) && recipe.eatingMinutes > 0, `${recipe.id} requires eatingMinutes`);
    assert.ok(recipe.title.it.length <= 70 && recipe.title.en.length <= 70, `${recipe.id} title exceeds runtime schema length`);
  }
});

test('balanced 500 expansion deliberately covers ingredients that were previously underused', () => {
  const usage = baselineUsage();
  const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, BATCH_NAME), 'utf8'));
  const recipes = (batch.records ?? []).filter((record) => record.kind === 'recipe' && record.status === 'active');
  const used = new Set(recipes.flatMap((recipe) => recipe.ingredients.map((line) => line.ingredientId)));
  const underused = [...usage.entries()].filter(([, count]) => count <= 2).map(([id]) => id);

  assert.equal(underused.length, 115, 'baseline underused set changed; review the balancing policy intentionally');
  assert.deepEqual(underused.filter((id) => !used.has(id)), [], 'every ingredient used <=2 times in the baseline must be represented');
  assert.ok(used.size >= 220, `expected broad ingredient coverage, got ${used.size}`);
});

test('compiled catalog contains the complete expanded recipe corpus and new recipes have nutrition', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
  assert.equal(catalog.recipes.length, 1260);
  assert.equal(catalog.recipeVersions.length, 1260);
  const generated = catalog.recipeVersions.filter((recipe) => recipe.recipeVersionId.startsWith('recipe_balanced500_'));
  assert.equal(generated.length, 500);
  for (const recipe of generated) {
    assert.ok(Number(recipe.calculatedNutrition?.energyKcal) > 0, `${recipe.recipeVersionId} requires compiled energy`);
    assert.ok(Number(recipe.calculatedNutrition?.proteinG) >= 0, `${recipe.recipeVersionId} requires compiled protein`);
  }
});

test('dry cereal states and no-cook readiness stay semantically safe in the expanded catalog', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
  const revisionByIngredientId = new Map(catalog.ingredientRevisions.map((revision) => [revision.ingredientId, revision]));
  for (const id of ['ing_rye_grain_dry','ing_einkorn_grain_dry','ing_khorasan_grain_dry','ing_wild_rice_dry','ing_black_rice_dry','ing_red_rice_dry']) {
    assert.equal(revisionByIngredientId.get(id)?.basis?.state, 'dry', `${id} must be represented as dry`);
  }
  const roleByRevision = new Map(catalog.ingredientRevisions.map((revision) => [revision.ingredientRevisionId, new Set(revision.taxonomy?.culinaryRoles || [])]));
  const stateByRevision = new Map(catalog.ingredientRevisions.map((revision) => [revision.ingredientRevisionId, revision.basis?.state]));
  for (const recipe of catalog.recipeVersions.filter((recipe) => recipe.recipeVersionId.startsWith('recipe_balanced500_') && recipe.tags?.practical?.includes('practical_no_cook'))) {
    for (const line of recipe.ingredientLines) {
      const roles = roleByRevision.get(line.ingredientRevisionId) || new Set();
      const cookingStaple = roles.has('culinary_role_main_grain') || roles.has('culinary_role_main_legume') || roles.has('culinary_role_flour');
      assert.equal(cookingStaple && stateByRevision.get(line.ingredientRevisionId) === 'dry', false, `${recipe.recipeVersionId} cannot use a dry cooking staple without cooking`);
    }
  }
});
