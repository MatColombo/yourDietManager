import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { compileSourceBatches } from '../src/catalog/cleanCatalogCompiler.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { fileLoader } from './helpers.mjs';

const root = path.resolve('.');
async function source(name) { return JSON.parse(await readFile(path.join(root,'catalog-source',name),'utf8')); }
async function registry() { const r = new SchemaRegistry(fileLoader(path.join(root,'schemas'))); await r.loadAll(); return r; }

function groupOf(recipe) {
  const meal = recipe.mealTypeIds[0];
  if (meal === 'tax_meal_breakfast') return 'breakfast';
  if (meal === 'tax_meal_snack') return 'snack';
  if (recipe.practicalTagIds.includes('tax_practical_elaborate')) return 'elaborate';
  if (recipe.practicalTagIds.includes('tax_practical_quick')) return 'quick';
  return 'unclassified';
}
function ingredientSet(recipe) { return new Set(recipe.ingredients.map(line => line.ingredientId)); }
function jaccard(a,b) { const inter=[...a].filter(id=>b.has(id)).length; return inter / new Set([...a,...b]).size; }

test('expanded round adds exactly 200 varied recipes with no ingredient expansion', async () => {
  const foundation = await source('000-foundation.json');
  const ingredients = await source('001-base-ingredients.json');
  const base = await source('002-base-recipes.json');
  const expansion = await source('003-expanded-recipes-200.json');
  const recipes = expansion.records.filter(row => row.kind === 'recipe' && row.status === 'active');
  const ingredientRecords = expansion.records.filter(row => row.kind === 'ingredient');
  assert.equal(recipes.length, 200);
  assert.equal(ingredientRecords.length, 0, 'expansion must reuse the clean ingredient pool');

  const counts = { breakfast:0, quick:0, elaborate:0, snack:0 };
  const archetypes = { breakfast:new Set(), quick:new Set(), elaborate:new Set(), snack:new Set() };
  for (const recipe of recipes) {
    const group = groupOf(recipe);
    assert.notEqual(group, 'unclassified', `${recipe.id} must belong to one requested group`);
    counts[group] += 1;
    archetypes[group].add(recipe.archetypeId);
    assert.equal(recipe.servings, 1);
    assert.ok(recipe.ingredients.length >= 2 && recipe.ingredients.length <= 8, `${recipe.id} should contain 2-8 ingredients`);
    if (group === 'quick') {
      assert.ok(recipe.mealTypeIds[0] === 'tax_meal_lunch' || recipe.mealTypeIds[0] === 'tax_meal_dinner');
      assert.ok(recipe.prepMinutes + recipe.cookMinutes <= 30, `${recipe.id} exceeds quick-meal time budget`);
      assert.ok(!recipe.practicalTagIds.includes('tax_practical_elaborate'));
    }
    if (group === 'elaborate') {
      assert.ok(recipe.mealTypeIds[0] === 'tax_meal_lunch' || recipe.mealTypeIds[0] === 'tax_meal_dinner');
      assert.ok(recipe.prepMinutes + recipe.cookMinutes >= 40, `${recipe.id} is not materially elaborate`);
      assert.ok(!recipe.practicalTagIds.includes('tax_practical_quick'));
    }
  }
  assert.deepEqual(counts, { breakfast:50, quick:50, elaborate:50, snack:50 });
  for (const [group,set] of Object.entries(archetypes)) assert.ok(set.size >= 12, `${group} should span at least 12 culinary archetypes; got ${set.size}`);

  const baseRecipes = base.records.filter(row => row.kind === 'recipe' && row.status === 'active');
  const allRecipes = [...baseRecipes, ...recipes];
  const titlesIt = new Map();
  const titlesEn = new Map();
  const signatures = new Map();
  for (const recipe of allRecipes) {
    for (const [map,title,locale] of [[titlesIt,recipe.title.it,'it'],[titlesEn,recipe.title.en,'en']]) {
      const key = title.trim().toLocaleLowerCase(locale === 'it' ? 'it' : 'en');
      assert.ok(!map.has(key), `duplicate ${locale} title: ${map.get(key)} / ${recipe.id}`);
      map.set(key, recipe.id);
    }
    const signature = [...ingredientSet(recipe)].sort().join('|');
    const signatureKey = `${recipe.mealTypeIds[0]}:${signature}`;
    assert.ok(!signatures.has(signatureKey), `duplicate ingredient-set in same meal: ${signatures.get(signatureKey)} / ${recipe.id}`);
    signatures.set(signatureKey, recipe.id);
  }

  for (let i=0; i<allRecipes.length; i += 1) {
    for (let j=i+1; j<allRecipes.length; j += 1) {
      const a=allRecipes[i], b=allRecipes[j];
      if (a.mealTypeIds[0] !== b.mealTypeIds[0]) continue;
      const score=jaccard(ingredientSet(a), ingredientSet(b));
      assert.ok(score < 0.8, `near-duplicate recipes (${score.toFixed(2)}): ${a.id} / ${b.id}`);
    }
  }

  const ingredientIds = new Set(ingredients.records.filter(row=>row.kind==='ingredient' && row.status==='active').map(row=>row.id));
  for (const recipe of recipes) for (const line of recipe.ingredients) assert.ok(ingredientIds.has(line.ingredientId), `${recipe.id} references non-base ingredient ${line.ingredientId}`);

  const r = await registry();
  const compiled = await compileSourceBatches([
    {filename:'000-foundation.json',batch:foundation},
    {filename:'001-base-ingredients.json',batch:ingredients},
    {filename:'002-base-recipes.json',batch:base},
    {filename:'003-expanded-recipes-200.json',batch:expansion}
  ], { registry:r });
  assert.equal(compiled.ingredients.length, 163);
  assert.equal(compiled.recipes.length, 330);
  assert.equal(compiled.recipeVersions.length, 330);

  const byId = new Map(compiled.recipeVersions.map(row=>[row.recipeId,row]));
  const energyRanges = { breakfast:[180,650], quick:[250,800], elaborate:[300,900], snack:[80,350] };
  for (const recipe of recipes) {
    const group=groupOf(recipe);
    const runtime=byId.get(recipe.id);
    assert.ok(runtime, `compiled recipe missing: ${recipe.id}`);
    const kcal=runtime.calculatedNutrition.energyKcal;
    const [min,max]=energyRanges[group];
    assert.ok(kcal >= min && kcal <= max, `${recipe.id} ${kcal} kcal outside ${group} range ${min}-${max}`);
  }
});
