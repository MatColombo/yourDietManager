import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { saveUserIngredient, saveUserRecipe } from '../src/services/personalCatalogService.js';
import { loadReferenceDataIndex } from '../src/services/referenceDataService.js';
import { saveUserTaxonomyTerm } from '../src/services/referenceDataEditorService.js';
import { taxonomyChoices, unitsForIngredientRevision, mealArchetypeDefault } from '../src/ui/guidedControls.js';
import { MEAL_ARCHETYPES } from '../src/domain/catalogEnums.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null }).bootstrap();
  return { repo, registry };
}

test('Pass B guided taxonomy choices expose canonical IDs and preserve food hierarchy', async () => {
  const { repo } = await fixture();
  const index = await loadReferenceDataIndex(repo);
  const roots = taxonomyChoices(index, 'food_category', 'it', { rootsOnly: true });
  assert.ok(roots.some(choice => choice.id === 'food_group_fish_seafood'));
  assert.ok(roots.every(choice => choice.id.startsWith('food_group_')));
  const fishChildren = taxonomyChoices(index, 'food_category', 'it', { parentTermId: 'food_group_fish_seafood' });
  assert.ok(fishChildren.some(choice => choice.id === 'food_subgroup_fatty_fish'));
  assert.ok(fishChildren.every(choice => index.term(choice.id).parentTermId === 'food_group_fish_seafood'));
});

test('Pass B uses the same MealArchetype default/min-one semantics for ingredient and recipe editors', () => {
  assert.deepEqual(mealArchetypeDefault([]), [...MEAL_ARCHETYPES]);
  assert.deepEqual(mealArchetypeDefault(null), [...MEAL_ARCHETYPES]);
  assert.deepEqual(mealArchetypeDefault(['lunch']), ['lunch']);
});

test('Pass B recipe-line unit choices are restricted to the selected ingredient basis and explicit conversions', () => {
  const revision = { basis: { unit: 'g' }, conversions: [{ unit: 'piece', gramsPerUnit: 80 }, { unit: 'tbsp', gramsPerUnit: 12 }] };
  assert.deepEqual(unitsForIngredientRevision(revision).map(item => item.id), ['g', 'piece', 'tbsp']);
  assert.deepEqual(unitsForIngredientRevision(null), []);
});

test('Pass B reference-data configurator creates canonical user terms and blocks label/alias collisions', async () => {
  const { repo, registry } = await fixture();
  const term = await saveUserTaxonomyTerm({
    taxonomyId: 'cuisine', labelIt: 'Cucina test alpina', labelEn: 'Alpine test cuisine',
    aliasesIt: ['alpina test'], aliasesEn: ['test alpine'], descriptionIt: '', descriptionEn: ''
  }, { repo, registry, now: '2026-09-04T12:00:00Z' });
  assert.equal(term.termId, 'cuisine_alpine_test_cuisine');
  assert.equal(term.origin, 'user');
  assert.equal((await repo.get('taxonomyTerms', term.termId)).termId, term.termId);
  await assert.rejects(() => saveUserTaxonomyTerm({
    taxonomyId: 'cuisine', labelIt: 'Mediterranea', labelEn: 'Another Mediterranean', aliasesIt: [], aliasesEn: []
  }, { repo, registry }), /already resolves/);
  await assert.rejects(() => saveUserTaxonomyTerm({
    termId: 'cuisine_mediterranean', taxonomyId: 'cuisine', labelIt: 'X', labelEn: 'X', aliasesIt: [], aliasesEn: []
  }, { repo, registry }), /read-only/);
});

test('Pass B authoring boundary rejects legacy semantic strings and blank authoritative nutrition', async () => {
  const { repo, registry } = await fixture();
  const valid = {
    nameIt: 'Tofu guidato', nameEn: 'Guided tofu', basisUnit: 'g', state: 'ready_to_eat',
    energyKcal: 120, proteinG: 13, carbsG: 3, fatG: 6, fiberG: 1,
    foodGroup: 'food_group_legumes', foodSubgroup: 'food_subgroup_soy_products', flavorProfile: 'flavor_savory',
    mealArchetypes: ['lunch'], allergenIds: ['soy']
  };
  await assert.rejects(() => saveUserIngredient({ ...valid, foodGroup: 'legumes' }, { repo, registry }), /Unknown reference-data term legumes/);
  await assert.rejects(() => saveUserIngredient({ ...valid, energyKcal: '' }, { repo, registry }), /Energy is required/);
  const ingredient = await saveUserIngredient(valid, { repo, registry });

  const recipe = {
    titleIt: 'Tofu guidato', titleEn: 'Guided tofu', instructionsIt: ['Servi.'], instructionsEn: ['Serve.'],
    mealArchetypes: ['lunch'], ingredientLines: [{ ingredientId: ingredient.family.ingredientId, ingredientRevisionId: ingredient.revision.ingredientRevisionId, amount: 150, unit: 'g', optional: false }],
    prepMinutes: 3, cookMinutes: 0, families: ['recipe_family_grain_bowl'], cuisines: ['cuisine_international'], diet: ['diet_vegetarian'], flavor: ['flavor_savory'], practicalTags: ['practical_quick'], preparationTags: ['prep_raw']
  };
  await assert.rejects(() => saveUserRecipe({ ...recipe, families: 'recipe_family_grain_bowl' }, { repo, registry }), /must be selected from canonical reference data/);
  await assert.rejects(() => saveUserRecipe({ ...recipe, families: ['grain_bowl'] }, { repo, registry }), /Unknown reference-data term grain_bowl/);
  const saved = await saveUserRecipe(recipe, { repo, registry });
  assert.deepEqual(saved.version.tags.families, ['recipe_family_grain_bowl']);
  assert.deepEqual(saved.version.tags.cuisines, ['cuisine_international']);
});

test('Pass B UI source removes semantic CSV/free-text controls from operational forms and precaches guided modules', async () => {
  const [catalog, configuration, planPages, localesIt, localesEn, sw] = await Promise.all([
    readFile(path.join(root, 'src/ui/catalogPages.js'), 'utf8'),
    readFile(path.join(root, 'src/ui/configurationPages.js'), 'utf8'),
    readFile(path.join(root, 'src/ui/planPages.js'), 'utf8'),
    readFile(path.join(root, 'public/data/locales/it.json'), 'utf8'),
    readFile(path.join(root, 'public/data/locales/en.json'), 'utf8'),
    readFile(path.join(root, 'public/service-worker.js'), 'utf8')
  ]);
  assert.match(catalog, /createMultiSelectChips/);
  assert.match(catalog, /createHierarchicalFoodCategorySelector/);
  assert.match(catalog, /createMealArchetypePicker/);
  assert.match(catalog, /unitsForIngredientRevision/);
  assert.match(configuration, /semanticTargetControl/);
  assert.match(configuration, /genericRecipeTagChoices/);
  assert.doesNotMatch(catalog, /g P|g C|g F|\['P'|\['C'|\['F'/);
  assert.doesNotMatch(planPages, /g P|g C|g F|metric\('P'|metric\('C'|metric\('F'/);
  assert.match(localesIt, /"nutrient\.protein": "Proteine"/);
  assert.match(localesEn, /"nutrient\.protein": "Protein"/);
  assert.doesNotMatch(localesIt, /\(CSV\)/i);
  assert.doesNotMatch(localesEn, /\(CSV\)/i);
  assert.match(sw, /src\/ui\/guidedControls\.js/);
  assert.match(sw, /src\/ui\/referenceDataPages\.js/);
  assert.match(sw, /src\/services\/referenceDataEditorService\.js/);
});
