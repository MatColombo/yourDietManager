import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'catalog-source');

function loadResolvedCatalog() {
  const versions = new Map();
  for (const file of fs.readdirSync(SOURCE).filter((name) => name.endsWith('.json')).sort()) {
    const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, file), 'utf8'));
    for (const record of batch.records ?? []) {
      const key = `${record.kind}:${record.id}`;
      const previous = versions.get(key);
      if (!previous || record.revision > previous.revision) versions.set(key, record);
    }
  }
  const active = [...versions.values()].filter((record) => record.status === 'active');
  return {
    terms: new Map(active.filter((r) => r.kind === 'taxonomy_term').map((r) => [r.id, r])),
    ingredients: new Map(active.filter((r) => r.kind === 'ingredient').map((r) => [r.id, r])),
    recipes: new Map(active.filter((r) => r.kind === 'recipe').map((r) => [r.id, r])),
  };
}

function assertRefs(terms, owner, field, taxonomyType, { nonEmpty = true } = {}) {
  assert.ok(Array.isArray(owner[field]), `${owner.id}.${field} must be an array`);
  if (nonEmpty) assert.ok(owner[field].length > 0, `${owner.id}.${field} must not be empty`);
  for (const id of owner[field]) {
    const term = terms.get(id);
    assert.ok(term, `${owner.id}.${field} references missing ${id}`);
    assert.equal(term.taxonomyType, taxonomyType, `${owner.id}.${field} references ${id} with wrong taxonomy type`);
  }
}

test('complete taxonomy alignment covers every active ingredient and recipe', () => {
  const { terms, ingredients, recipes } = loadResolvedCatalog();
  assert.equal(ingredients.size, 282);
  assert.equal(recipes.size, 530);

  for (const ingredient of ingredients.values()) {
    const product = terms.get(ingredient.productId);
    assert.ok(product, `${ingredient.id} product missing`);
    assert.equal(product.taxonomyType, 'product', `${ingredient.id} product has wrong taxonomy type`);
    assert.equal(product.parentId, ingredient.categoryId, `${ingredient.id} category must equal its ProductFood parent`);

    assert.ok(Array.isArray(ingredient.culinaryRoles) && ingredient.culinaryRoles.length > 0, `${ingredient.id} requires culinaryRoles`);
    for (const roleId of ingredient.culinaryRoles) {
      assert.equal(terms.get(roleId)?.taxonomyType, 'culinary_role', `${ingredient.id} has invalid culinary role ${roleId}`);
    }
    assert.equal(terms.get(ingredient.flavorProfileId)?.taxonomyType, 'flavor_profile', `${ingredient.id} requires explicit flavorProfileId`);
  }

  for (const recipe of recipes.values()) {
    assertRefs(terms, recipe, 'cuisineIds', 'cuisine');
    assertRefs(terms, recipe, 'mealTypeIds', 'meal_type');
    assertRefs(terms, recipe, 'practicalTagIds', 'practical_tag');
    assertRefs(terms, recipe, 'dietTagIds', 'diet_tag', { nonEmpty: false });
    assertRefs(terms, recipe, 'flavorProfileIds', 'flavor_profile');
    assertRefs(terms, recipe, 'preparationTechniqueIds', 'preparation_technique');
    assert.equal(terms.get(recipe.archetypeId)?.taxonomyType, 'recipe_archetype', `${recipe.id} requires a valid archetype`);
    assert.equal(recipe.flavorProfileIds.length, 1, `${recipe.id} must have exactly one flavor profile`);
    assert.notEqual(recipe.flavorProfileIds[0], 'tax_flavor_neutral', `${recipe.id} must be explicitly sweet or savory`);
    assert.ok(Number.isInteger(recipe.eatingMinutes) && recipe.eatingMinutes > 0, `${recipe.id} requires eatingMinutes`);

    for (const line of recipe.ingredients) assert.ok(ingredients.has(line.ingredientId), `${recipe.id} references missing ${line.ingredientId}`);

    const practical = new Set(recipe.practicalTagIds);
    const techniques = new Set(recipe.preparationTechniqueIds);
    const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
    assert.equal(practical.has('tax_practical_no_cook'), recipe.cookMinutes === 0, `${recipe.id} no-cook tag disagrees with cookMinutes`);
    assert.equal(techniques.has('tax_preparation_no_cook_assembly'), recipe.cookMinutes === 0, `${recipe.id} no-cook technique disagrees with cookMinutes`);
    if (practical.has('tax_practical_quick')) assert.ok(totalMinutes <= 30, `${recipe.id} quick must be <=30 minutes`);
    if (practical.has('tax_practical_elaborate')) assert.ok(totalMinutes >= 40, `${recipe.id} elaborate must be >=40 minutes`);
    if (practical.has('tax_practical_quick_eat')) assert.ok(recipe.eatingMinutes <= 10, `${recipe.id} quick-eat must be <=10 minutes`);

    const recipeIngredients = recipe.ingredients.map((line) => ingredients.get(line.ingredientId));
    if (recipe.cookMinutes === 0) {
      for (const ingredient of recipeIngredients) {
        const rawAnimal = ['tax_category_meat_poultry', 'tax_category_fish_seafood', 'tax_category_eggs'].includes(ingredient.categoryId)
          && ingredient.state?.physical === 'raw';
        assert.equal(rawAnimal, false, `${recipe.id} cannot be no-cook with raw animal ingredient ${ingredient.id}`);
      }
    }

    const allVegan = recipeIngredients.every((i) => i.dietFlags?.vegan === true);
    const allVegetarian = recipeIngredients.every((i) => i.dietFlags?.vegetarian === true || i.dietFlags?.vegan === true);
    const categories = new Set(recipeIngredients.map((i) => i.categoryId));
    const hasFish = categories.has('tax_category_fish_seafood');
    const hasMeat = categories.has('tax_category_meat_poultry');
    assert.equal(practical.has('tax_practical_no_advance_prep'), !recipeIngredients.some((i) => i.state?.physical === 'cooked'), `${recipe.id} no-advance tag must match prior cooked-component policy`);
    assert.equal(recipe.dietTagIds.includes('tax_diet_vegan'), allVegan, `${recipe.id} vegan tag mismatch`);
    assert.equal(recipe.dietTagIds.includes('tax_diet_vegetarian'), allVegetarian, `${recipe.id} vegetarian tag mismatch`);
    assert.equal(recipe.dietTagIds.includes('tax_diet_pescatarian'), !allVegetarian && hasFish && !hasMeat, `${recipe.id} pescatarian tag mismatch`);
  }
});

test('known semantic category corrections stay canonical', () => {
  const { terms, ingredients } = loadResolvedCatalog();
  assert.equal(terms.get('tax_product_frog_legs')?.parentId, 'tax_category_meat_poultry');
  assert.equal(terms.get('tax_product_peanut_butter')?.parentId, 'tax_category_nuts_seeds');
  for (const id of ['tax_product_tomato_paste', 'tax_product_tomato_puree', 'tax_product_tomato_sauce']) {
    assert.equal(terms.get(id)?.parentId, 'tax_category_condiments');
  }
  assert.ok(ingredients.get('ing_frog_legs_raw')?.culinaryRoles.includes('tax_role_protein_meat'));
  assert.ok(ingredients.get('ing_peanut_butter_reduced_sodium')?.culinaryRoles.includes('tax_role_nut_seed_spread'));
});

test('compiled ingredient revisions preserve authored culinary-role taxonomy', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'catalog.json'), 'utf8'));
  assert.equal(catalog.ingredientRevisions.length, 282);
  for (const revision of catalog.ingredientRevisions) {
    assert.ok(Array.isArray(revision.taxonomy?.culinaryRoles) && revision.taxonomy.culinaryRoles.length > 0, `${revision.ingredientRevisionId} lost culinaryRoles during compilation`);
    for (const roleId of revision.taxonomy.culinaryRoles) {
      const role = catalog.taxonomyTerms.find((term) => term.termId === roleId);
      assert.equal(role?.taxonomyId, 'culinary_role', `${revision.ingredientRevisionId} has invalid runtime culinary role ${roleId}`);
    }
  }
});
