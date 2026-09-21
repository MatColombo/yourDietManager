import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
const pepperIds=['ing_green_bell_pepper_raw','ing_orange_bell_pepper_raw','ing_red_bell_pepper_raw','ing_yellow_bell_pepper_raw','ing_banana_pepper_raw'];

test('all culinary pepper variants share one canonical ProductFood concept',()=>{
  const rows=pepperIds.map(id=>catalog.ingredientRevisions.find(item=>item.ingredientId===id));
  assert.ok(rows.every(Boolean));
  assert.deepEqual([...new Set(rows.map(row=>row.productTaxonomy.conceptId))],['product_concept_pepper']);
  const term=catalog.taxonomyTerms.find(item=>item.termId==='product_concept_pepper');
  assert.equal(term.i18n.it.label,'Peperone');
});

test('compiled UI text no longer claims banana pepper is a friggitello',()=>{
  const visible=JSON.stringify({
    ingredients:catalog.ingredientRevisions.map(row=>row.i18n),
    recipes:catalog.recipeVersions.map(row=>row.i18n),
    terms:catalog.taxonomyTerms.map(row=>row.i18n)
  }).toLowerCase();
  assert.equal(visible.includes('friggitello tipo banana'),false);
  assert.equal(visible.includes('peperone tipo friggitello'),false);
});
