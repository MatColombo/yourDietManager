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

test('base ingredient seed is specific, complete, and within target size', async () => {
  const foundation = await source('000-foundation.json');
  const seed = await source('001-base-ingredients.json');
  const ingredients = seed.records.filter(row => row.kind === 'ingredient' && row.status === 'active');
  const products = seed.records.filter(row => row.kind === 'taxonomy_term' && row.taxonomyType === 'product' && row.status === 'active');

  assert.ok(ingredients.length >= 140 && ingredients.length <= 180, `expected 140-180 base ingredients, got ${ingredients.length}`);
  assert.ok(products.length >= 120, `expected a specific product taxonomy, got ${products.length} product concepts`);

  const forbidden = /\b(other|generic|generale|altro|altra|altri|altre)\b/i;
  for (const term of products) {
    assert.doesNotMatch(term.labels.it, forbidden, `${term.id} has a generic Italian product label`);
    assert.doesNotMatch(term.labels.en, forbidden, `${term.id} has a generic English product label`);
  }
  for (const item of ingredients) {
    assert.doesNotMatch(item.display.it, forbidden, `${item.id} has a generic Italian display label`);
    assert.doesNotMatch(item.display.en, forbidden, `${item.id} has a generic English display label`);
    assert.equal(item.source.provider, 'USDA_FDC');
    assert.ok(item.source.sourceId);
    assert.ok(item.source.description);
  }

  const requiredCategories = [
    'tax_category_grains_starches','tax_category_legumes','tax_category_vegetables','tax_category_fruit',
    'tax_category_fish_seafood','tax_category_meat_poultry','tax_category_eggs','tax_category_dairy',
    'tax_category_nuts_seeds','tax_category_oils_fats','tax_category_herbs_spices','tax_category_condiments'
  ];
  const counts = new Map();
  for (const item of ingredients) counts.set(item.categoryId,(counts.get(item.categoryId)||0)+1);
  for (const category of requiredCategories) assert.ok((counts.get(category)||0) > 0, `${category} has no ingredient`);

  const identityKeys = new Set();
  for (const item of ingredients) {
    const key = `${item.productId}|${item.state.physical}|${item.state.preservation}|${Boolean(item.state.drained)}`;
    assert.ok(!identityKeys.has(key), `duplicate product/state identity ${key}`);
    identityKeys.add(key);
  }

  const ids = new Set(ingredients.map(item => item.id));
  for (const id of ['ing_pasta_dry','ing_risotto_rice_dry']) assert.ok(ids.has(id), `missing expected core ingredient ${id}`);
  for (const id of [
    'ing_farro_pearled_dry','ing_chickpeas_canned_drained','ing_lentils_cooked','ing_zucchini_raw','ing_eggplant_raw',
    'ing_red_bell_pepper_raw','ing_tomato_sauce_canned','ing_garlic_raw','ing_basil_fresh','ing_olive_oil',
    'ing_cod_atlantic_raw','ing_sardines_canned_oil_drained','ing_egg_whole_raw','ing_plain_whole_yogurt','ing_ricotta_whole_milk'
  ]) assert.ok(ids.has(id), `missing expected Mediterranean core ingredient ${id}`);

  const blackEyed = seed.records.find(row => row.id === 'tax_product_black_eyed_peas');
  const greenPeas = seed.records.find(row => row.id === 'tax_product_green_peas');
  const splitPeas = seed.records.find(row => row.id === 'tax_product_split_peas');
  assert.ok(blackEyed && greenPeas && splitPeas);
  assert.notEqual(blackEyed.id, greenPeas.id);
  assert.notEqual(blackEyed.id, splitPeas.id);
  assert.equal(seed.records.find(row => row.id === 'tax_product_orange_bell_pepper')?.parentId, 'tax_category_vegetables');

  const r = await registry();
  const compiled = await compileSourceBatches([
    {filename:'000-foundation.json',batch:foundation},
    {filename:'001-base-ingredients.json',batch:seed}
  ],{registry:r});
  assert.equal(compiled.ingredients.length, ingredients.length);
  assert.equal(compiled.ingredientRevisions.length, ingredients.length);
  assert.equal(compiled.recipes.length,0);
});
