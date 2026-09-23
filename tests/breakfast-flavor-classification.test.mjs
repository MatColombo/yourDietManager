import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { compileSourceBatches } from '../src/catalog/cleanCatalogCompiler.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { mealRuleSatisfied } from '../src/planner/recipeFeatures.js';
import { fileLoader } from './helpers.mjs';

const root = path.resolve('.');
async function registry() { const r = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await r.loadAll(); return r; }

async function compiledCatalog() {
  const filenames = (await readdir(path.join(root, 'catalog-source'))).filter(name => name.endsWith('.json')).sort();
  const batches = await Promise.all(filenames.map(async filename => ({ filename, batch: JSON.parse(await readFile(path.join(root, 'catalog-source', filename), 'utf8')) })));
  return compileSourceBatches(batches, { registry: await registry() });
}

test('every active breakfast recipe has an explicit sweet or savory profile', async () => {
  const catalog = await compiledCatalog();
  const breakfasts = catalog.recipeVersions.filter(recipe => recipe.mealArchetypes.includes('breakfast'));
  assert.equal(breakfasts.length, 224);
  const counts = { flavor_sweet: 0, flavor_savory: 0 };
  for (const recipe of breakfasts) {
    assert.equal(recipe.tags.flavor.length, 1, `${recipe.recipeId} should have one explicit breakfast flavor`);
    assert.ok(recipe.tags.flavor[0] in counts, `${recipe.recipeId} has unsupported breakfast flavor ${recipe.tags.flavor[0]}`);
    counts[recipe.tags.flavor[0]] += 1;
  }
  assert.deepEqual(counts, { flavor_sweet: 156, flavor_savory: 68 });
});

test('quick snack preset has a useful pool and excludes the chicken-heart skewer', async () => {
  const catalog = await compiledCatalog();
  const snacks = catalog.recipeVersions.filter(recipe => recipe.mealArchetypes.includes('snack'));
  const rules = [
    { ruleType: 'tag', target: 'practical_quick', strength: 'require' },
    { ruleType: 'tag', target: 'practical_no_cook', strength: 'require' },
    { ruleType: 'practical', target: 'prepMinutes', operator: 'lte', value: 6, strength: 'require' },
    { ruleType: 'practical', target: 'cookMinutes', operator: 'eq', value: 0, strength: 'require' },
    { ruleType: 'nutrition', target: 'energyKcal', operator: 'lte', value: 350, strength: 'require' }
  ];
  const eligible = snacks.filter(recipe => rules.every(rule => mealRuleSatisfied(recipe, rule, new Map())));
  assert.ok(eligible.length >= 40, `quick snack preset leaves too few recipes: ${eligible.length}`);
  const skewer = snacks.find(recipe => recipe.recipeId === 'recipe_r2_snack_spiedino_cuori_pollo_pomodoro');
  assert.ok(skewer, 'expected chicken-heart skewer fixture');
  assert.equal(skewer.practical.cookMinutes, 3);
  assert.equal(rules.every(rule => mealRuleSatisfied(skewer, rule, new Map())), false);
  assert.ok(!eligible.some(recipe => recipe.recipeId === skewer.recipeId));
});
