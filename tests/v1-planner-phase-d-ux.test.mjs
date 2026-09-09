import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { CatalogQueryService } from '../src/services/catalogQuery.js';
import { loadReferenceDataIndex } from '../src/services/referenceDataService.js';
import { productFoodChoices, productFoodPathLabel } from '../src/ui/guidedControls.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();
const source = file => readFile(path.join(root, file), 'utf8');

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
  const query = new CatalogQueryService({ repo });
  const index = await loadReferenceDataIndex(repo);
  return { repo, query, index };
}

const fixturePromise = fixture();

function productMatches(revision, termId) {
  const product = revision?.productTaxonomy || {};
  return [product.categoryId, product.subcategoryId, product.conceptId].includes(termId);
}

test('Phase D3 — product-food picker collapses technical variants into conceptual taxonomy choices with coverage', async () => {
  const { query, index } = await fixturePromise;
  const ingredients = await query.listCurrentIngredients();
  const choices = productFoodChoices(index, 'it', { ingredients });
  const noodles = choices.find(item => item.id === 'product_concept_noodles');
  const dairy = choices.find(item => item.id === 'product_category_dairy');
  assert.ok(noodles, 'Noodles concept must be selectable once');
  assert.equal(noodles.data.level, 'concept');
  assert.equal(noodles.data.coverage, 11);
  assert.equal(choices.filter(item => item.id === 'product_concept_noodles').length, 1);
  assert.match(noodles.label, /Noodles/i);
  assert.ok(dairy, 'Dairy category must be selectable');
  assert.equal(dairy.data.coverage, 19);
  assert.equal(productFoodPathLabel(index, 'product_concept_noodles', 'it'), noodles.label);
});

test('Phase D4 — ingredient facets filter by product taxonomy and technical state without exposing revision noise as preference semantics', async () => {
  const { query } = await fixturePromise;
  const noodles = await query.listCurrentIngredients({ productFoodId: 'product_concept_noodles' });
  const dairy = await query.listCurrentIngredients({ productFoodId: 'product_category_dairy' });
  assert.equal(noodles.length, 11);
  assert.equal(dairy.length, 19);
  assert.ok(noodles.every(item => productMatches(item.revision, 'product_concept_noodles')));
  assert.ok(dairy.every(item => productMatches(item.revision, 'product_category_dairy')));
  const dryNoodles = await query.listCurrentIngredients({ productFoodId: 'product_concept_noodles', state: 'dry' });
  assert.ok(dryNoodles.length > 0 && dryNoodles.length < noodles.length);
  assert.ok(dryNoodles.every(item => item.revision.basis?.state === 'dry'));
});

test('Phase D4 — recipe facets combine product taxonomy, diet and practical tags and filter the actual ingredient graph', async () => {
  const { repo, query } = await fixturePromise;
  const noodles = await query.searchRecipes({ productFoodId: 'product_concept_noodles', limit: 100 });
  const dairy = await query.searchRecipes({ productFoodId: 'product_category_dairy', limit: 100 });
  const veganNoCook = await query.searchRecipes({ dietTag: 'diet_vegan', practicalTag: 'practical_no_cook', limit: 100 });
  assert.equal(noodles.total, 327);
  assert.equal(dairy.total, 637);
  assert.equal(veganNoCook.total, 196);
  assert.ok(veganNoCook.items.every(recipe => recipe.tags?.diet?.includes('diet_vegan') && recipe.tags?.practical?.includes('practical_no_cook')));
  for (const [result, termId] of [[noodles, 'product_concept_noodles'], [dairy, 'product_category_dairy']]) {
    const revisionIds = [...new Set(result.items.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)))];
    const revisions = new Map((await repo.getMany('ingredientRevisions', revisionIds)).map(item => [item.ingredientRevisionId, item]));
    assert.ok(result.items.every(recipe => recipe.ingredientLines.some(line => productMatches(revisions.get(line.ingredientRevisionId), termId))));
  }
});

test('Phase D3 — the same product-food picker is wired into preference/safety/meal rules and ingredient authoring', async () => {
  const [configuration, catalog, guided] = await Promise.all([
    source('src/ui/configurationPages.js'), source('src/ui/catalogPages.js'), source('src/ui/guidedControls.js')
  ]);
  assert.match(guided, /export function createProductFoodPicker/);
  assert.match(configuration, /kind === 'productFood'[\s\S]*createProductFoodPicker/);
  assert.match(configuration, /targetType: 'productFood'/, 'new preference rules should default to the conceptual product taxonomy');
  assert.match(catalog, /createProductFoodPicker\(state, state\.referenceDataIndex, \{ value: source\.productFoodId \|\| null, required: true, levels: \['concept'\] \}\)/, 'ingredient authoring must require concept-level product classification');
  assert.match(catalog, /catalog\.productFood/);
});

test('Phase D5 — Day → Recipe → Ingredient carries contextual return routes down to the exact meal slot', async () => {
  const [plan, catalog, app] = await Promise.all([
    source('src/ui/planPages.js'), source('src/ui/catalogPages.js'), source('src/ui/app.js')
  ]);
  assert.match(plan, /const anchorId = `meal-\$\{slot\.mealOccurrenceId\}`[\s\S]*?#\$\{encodeURIComponent\(anchorId\)\}/);
  assert.match(plan, /data-testid': 'plan-recipe-link'/);
  assert.match(plan, /new URLSearchParams\(\{ version: recipe\.recipeVersionId, return: returnRoute \}\)/);
  assert.match(catalog, /data-testid': 'context-back'/);
  assert.match(catalog, /data-testid': 'recipe-ingredient-link'/);
  assert.match(catalog, /revision: line\.ingredientRevisionId, return: selfRoute/);
  assert.match(app, /location\.hash/);
  assert.match(app, /scrollIntoView/);
  assert.match(app, /context-return-target/);
  assert.match(plan, /function applyContextReturnTarget\(\)/);
  assert.match(plan, /section\.append\(list\);\n  applyContextReturnTarget\(\);/);
});

test('Phase D3-D5 — real Chromium gate exercises taxonomy facets and contextual drill-down', async () => {
  const browser = await source('scripts/hardening/browser-regression.mjs');
  assert.match(browser, /Phase D3-D4 acceptance/);
  assert.match(browser, /product_category_dairy/);
  assert.match(browser, /product_concept_noodles/);
  assert.match(browser, /Phase D5 acceptance/);
  assert.match(browser, /recipe-ingredient-link/);
  assert.match(browser, /context-return-target/);
});
