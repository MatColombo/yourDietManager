import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const SOURCE = path.join(ROOT, 'catalog-source');
const REVIEW = '012-user-reviewed-recipes-2026-09-28.json';

function resolved() {
  const versions = new Map();
  for (const file of fs.readdirSync(SOURCE).filter((name) => name.endsWith('.json')).sort()) {
    const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, file), 'utf8'));
    for (const record of batch.records ?? []) {
      const key = `${record.kind}:${record.id}`;
      const previous = versions.get(key);
      if (!previous || record.revision > previous.revision) versions.set(key, record);
    }
  }
  return versions;
}

test('review round-trip emits only explicit recipe deltas and compiles their final status', () => {
  const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, REVIEW), 'utf8'));
  assert.equal(batch.batchId, 'catalog_user_reviewed_recipes_2026_09_28_v1');
  assert.equal(batch.records.length, 466);
  assert.equal(new Set(batch.records.map((record) => record.id)).size, 466);
  assert.ok(batch.records.every((record) => record.kind === 'recipe'));
  assert.equal(batch.records.filter((record) => record.status === 'retired').length, 457);
  assert.equal(batch.records.filter((record) => record.status === 'active').length, 9);

  const versions = resolved();
  for (const record of batch.records) {
    const final = versions.get(`recipe:${record.id}`);
    assert.equal(final?.revision, record.revision, `${record.id} review revision must win`);
    assert.equal(final?.status, record.status, `${record.id} review status must win`);
  }
});

test('compiled catalog contains only active reviewed recipes and all ingredient references resolve', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
  const activeRecipeIds = new Set(catalog.recipeVersions.map((recipe) => recipe.recipeId));
  const ingredientIds = new Set(catalog.ingredients.map((ingredient) => ingredient.ingredientId));
  const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, REVIEW), 'utf8'));

  for (const record of batch.records) {
    assert.equal(activeRecipeIds.has(record.id), record.status === 'active', `${record.id} active/retired compile mismatch`);
    if (record.status === 'active') {
      for (const line of record.ingredients ?? []) assert.ok(ingredientIds.has(line.ingredientId), `${record.id} references missing ${line.ingredientId}`);
    }
  }
});


test('review unlock adds veal and gilthead seabream and applies the six previously blocked recipe edits', () => {
  const unlock = JSON.parse(fs.readFileSync(path.join(SOURCE, '013-review-unlock-veal-seabream.json'), 'utf8'));
  assert.equal(unlock.batchId, 'catalog_review_unlock_veal_seabream_2026_09_28_v1');
  assert.equal(unlock.records.filter((record) => record.kind === 'taxonomy_term').length, 2);
  assert.equal(unlock.records.filter((record) => record.kind === 'ingredient').length, 2);
  assert.equal(unlock.records.filter((record) => record.kind === 'recipe').length, 6);

  const versions = resolved();
  const veal = versions.get('ingredient:ing_veal_loin_raw');
  const seabream = versions.get('ingredient:ing_gilthead_seabream_raw');
  assert.equal(veal?.productId, 'tax_product_veal_loin');
  assert.equal(veal?.categoryId, 'tax_category_meat_poultry');
  assert.ok(veal?.culinaryRoles?.includes('tax_role_protein_meat'));
  assert.equal(seabream?.productId, 'tax_product_gilthead_seabream');
  assert.equal(seabream?.categoryId, 'tax_category_fish_seafood');
  assert.ok(seabream?.culinaryRoles?.includes('tax_role_protein_fish'));
  assert.ok(seabream?.allergens?.includes('fish'));

  const vealRecipes = [
    'recipe_beef_expansion_21',
    'recipe_beef_expansion_22',
    'recipe_beef_expansion_23',
    'recipe_beef_expansion_24',
    'recipe_beef_expansion_25',
  ];
  for (const id of vealRecipes) {
    const recipe = versions.get(`recipe:${id}`);
    assert.equal(recipe?.revision, 2, `${id} must advance to revision 2`);
    assert.equal(recipe?.ingredients?.[0]?.ingredientId, 'ing_veal_loin_raw', `${id} must use veal`);
    assert.match(recipe?.title?.it ?? '', /^Vitello /, `${id} must preserve the reviewed Italian title`);
  }

  const seabreamRecipe = versions.get('recipe:recipe_r2_quick_pesce_serra_pomodoro_olive');
  assert.equal(seabreamRecipe?.revision, 4);
  assert.equal(seabreamRecipe?.ingredients?.[0]?.ingredientId, 'ing_gilthead_seabream_raw');
  assert.equal(seabreamRecipe?.title?.it, 'Orata in padella con pomodoro e olive');

  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
  assert.equal(catalog.ingredients.length, 297);
  assert.equal(catalog.recipeVersions.length, 803);
});
