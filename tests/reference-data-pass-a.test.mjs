import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { runMigrations } from '../src/services/migrationRunner.js';
import {
  assertReferenceData,
  assertSemanticReferences,
  referenceDataDigest,
  semanticReferenceDiagnostics
} from '../src/services/referenceDataService.js';
import {
  approveReferenceDataProposal,
  createReferenceDataProposal,
  materializeReferenceDataProposal
} from '../src/services/referenceDataProposalService.js';
import { MemoryRepository, bundledReferenceData, fileLoader } from './helpers.mjs';

const root = process.cwd();
const legacyRoot = path.join(root, 'tests/fixtures/catalog-0.1/public/data');

async function registryFixture() {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  return registry;
}
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function seedLegacyInstall(repo) {
  const [ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, configuration] = await Promise.all([
    readJson(path.join(legacyRoot, 'ingredients/ingredient-families-0001.json')),
    readJson(path.join(legacyRoot, 'ingredients/ingredient-revisions-0001.json')),
    readJson(path.join(legacyRoot, 'recipes/recipe-families-0001.json')),
    readJson(path.join(legacyRoot, 'recipes/recipe-versions-0001.json')),
    readJson(path.join(legacyRoot, 'bootstrap/default-configuration.json'))
  ]);
  await repo.putMany('ingredients', ingredientFamilies);
  await repo.putMany('ingredientRevisions', ingredientRevisions);
  await repo.putMany('recipes', recipeFamilies);
  await repo.putMany('recipeVersions', recipeVersions);
  await repo.put('appConfigs', configuration.appConfig);
  for (const store of ['nutritionProfiles','allergyIntoleranceProfiles','foodPreferences','themeProfiles','mealClasses','dayClasses','cycles']) await repo.putMany(store, configuration[store] || []);
  return { ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, configuration };
}

test('Pass A reference-data seed validates with schemas, hierarchy, aliases and deterministic digest', async () => {
  const registry = await registryFixture();
  const { taxonomies, taxonomyTerms } = await bundledReferenceData(root);
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  assert.equal(taxonomies.length, 7);
  assert.ok(taxonomyTerms.length >= 100);
  assert.equal(index.resolveLegacy('food_category', 'fish'), 'food_group_fish_seafood');
  assert.equal(index.resolveLegacy('food_category', 'Pesce e frutti di mare'), 'food_group_fish_seafood');
  assert.equal(index.isDescendantOrSelf('food_subgroup_fatty_fish', 'food_group_fish_seafood'), true);
  const digest = await referenceDataDigest(taxonomies, taxonomyTerms);
  const manifest = await readJson(path.join(root, 'public/data/catalog-manifest.json'));
  assert.equal(digest, manifest.referenceDataDigest);
  assert.equal(manifest.referenceDataVersion, '1.0.0');
});

test('Pass A semantic gate rejects typo references instead of silently accepting them', async () => {
  const { taxonomies, taxonomyTerms } = await bundledReferenceData(root);
  const index = assertReferenceData(taxonomies, taxonomyTerms);
  const revision = structuredClone((await readJson(path.join(root, 'public/data/ingredients/ingredient-revisions-0001.json')))[0]);
  revision.taxonomy.foodGroup = 'food_group_fihs_typo';
  const result = semanticReferenceDiagnostics({ index, ingredientRevisions: [revision] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('Unknown reference-data term food_group_fihs_typo')));
  assert.throws(() => assertSemanticReferences({ index, ingredientRevisions: [revision] }), /Semantic reference validation failed/);
});

test('Pass A migration maps legacy strings to canonical IDs without mutating historical ingredient/recipe records', async () => {
  const registry = await registryFixture();
  const repo = new MemoryRepository();
  const legacy = await seedLegacyInstall(repo);
  const oldIngredient = structuredClone(legacy.ingredientRevisions[0]);
  const oldRecipe = structuredClone(legacy.recipeVersions[0]);
  await runMigrations(repo, { registry, referenceDataLoader: () => bundledReferenceData(root) });

  assert.deepEqual(await repo.get('ingredientRevisions', oldIngredient.ingredientRevisionId), oldIngredient);
  assert.deepEqual(await repo.get('recipeVersions', oldRecipe.recipeVersionId), oldRecipe);
  const currentIngredientFamily = await repo.get('ingredients', oldIngredient.ingredientId);
  const currentIngredient = await repo.get('ingredientRevisions', currentIngredientFamily.currentRevisionId);
  assert.notEqual(currentIngredient.ingredientRevisionId, oldIngredient.ingredientRevisionId);
  assert.equal(currentIngredient.taxonomy.foodGroup, 'food_group_fish_seafood');
  assert.equal(currentIngredient.taxonomy.foodSubgroup, 'food_subgroup_fatty_fish');
  assert.equal(currentIngredient.taxonomy.flavorProfile, 'flavor_savory');

  const currentRecipeFamily = await repo.get('recipes', oldRecipe.recipeId);
  const currentRecipe = await repo.get('recipeVersions', currentRecipeFamily.currentVersionId);
  assert.notEqual(currentRecipe.recipeVersionId, oldRecipe.recipeVersionId);
  assert.deepEqual(currentRecipe.tags.families, ['recipe_family_grain_bowl']);
  assert.deepEqual(currentRecipe.tags.cuisines, ['cuisine_mediterranean']);
  assert.deepEqual(currentRecipe.tags.diet, ['diet_high_protein']);
  assert.equal(currentRecipe.ingredientLines.find(line => line.ingredientId === oldIngredient.ingredientId).ingredientRevisionId, currentIngredient.ingredientRevisionId);

  const prefs = (await repo.getAll('foodPreferences'))[0];
  assert.equal(prefs.rules.find(rule => rule.id === 'pref-eggs').targetId, 'food_group_eggs');
  const dinner = await repo.get('mealClasses', 'mc-dinner');
  assert.equal(dinner.rules[0].target, 'food_group_fish_seafood');
  assert.equal(dinner.rules[1].target, 'flavor_spicy');

  const marker = await repo.getMeta('contentMigration:3');
  assert.equal(marker.status, 'complete');
  assert.equal(marker.unresolved.length, 0);
  assert.ok(marker.mappingSummary.resolved_alias > 0);
  assert.equal(await repo.getMeta('contentSchemaVersion'), 3);
});

test('Pass A migration blocks unresolved legacy semantic text and leaves immutable pointer changes unapplied', async () => {
  const registry = await registryFixture();
  const repo = new MemoryRepository();
  const legacy = await seedLegacyInstall(repo);
  const broken = structuredClone(legacy.ingredientRevisions[0]);
  broken.taxonomy.foodGroup = 'fihs_typo';
  await repo.put('ingredientRevisions', broken);
  const originalPointer = (await repo.get('ingredients', broken.ingredientId)).currentRevisionId;
  await assert.rejects(() => runMigrations(repo, { registry, referenceDataLoader: () => bundledReferenceData(root) }), /unresolved semantic value/);
  assert.equal((await repo.get('ingredients', broken.ingredientId)).currentRevisionId, originalPointer);
  const marker = await repo.getMeta('contentMigration:3');
  assert.equal(marker.status, 'blocked');
  assert.equal(marker.reason, 'unresolved_legacy_values');
  assert.ok(marker.unresolved.some(item => item.value === 'fihs_typo'));
  assert.notEqual(await repo.getMeta('contentSchemaVersion'), 3);
});

test('ingredient and recipe schemas use the same MealArchetype rule: at least one is required', async () => {
  const registry = await registryFixture();
  const ingredient = structuredClone((await readJson(path.join(root, 'public/data/ingredients/ingredient-revisions-0001.json')))[0]);
  ingredient.taxonomy.mealArchetypes = [];
  assert.equal(registry.validate('ingredientRevision', ingredient).valid, false);
  const recipe = structuredClone((await readJson(path.join(root, 'public/data/recipes/recipe-versions-0001.json')))[0]);
  recipe.mealArchetypes = [];
  assert.equal(registry.validate('recipeVersion', recipe).valid, false);
});

test('pipeline reference-data proposal requires an extensible taxonomy, resolves collisions, and materializes before use', async () => {
  const registry = await registryFixture();
  const { taxonomies, taxonomyTerms } = await bundledReferenceData(root);
  const proposal = await createReferenceDataProposal({
    taxonomyId: 'recipe_family',
    proposedTermId: 'recipe_family_breakfast_taco',
    parentTermId: null,
    i18n: { it: { label: 'Taco da colazione' }, en: { label: 'Breakfast taco' } },
    aliases: { it: [], en: ['breakfast tacos'] },
    rationale: 'Distinct family required by a focused corpus expansion.',
    provenance: { sourceType: 'pipeline', sourceLabel: 'Pass A test orchestrator', reference: null, rationale: 'Distinct family required by a focused corpus expansion.' }
  }, { taxonomies, taxonomyTerms, registry });
  assert.equal(proposal.status, 'proposed');
  const approved = approveReferenceDataProposal(proposal, { reviewNotes: 'No collision; hierarchy and labels reviewed.', registry });
  const { term, proposal: materialized } = materializeReferenceDataProposal(approved, { taxonomies, taxonomyTerms, registry, createdAt: '2026-09-04T10:30:00Z' });
  assert.equal(term.termId, 'recipe_family_breakfast_taco');
  assert.equal(term.provenance.sourceType, 'pipeline');
  assert.equal(materialized.status, 'materialized');
  assert.equal(materialized.materializedTermId, term.termId);

  const collision = await createReferenceDataProposal({
    taxonomyId: 'cuisine', proposedTermId: 'cuisine_med', parentTermId: null,
    i18n: { it: { label: 'Mediterranea' }, en: { label: 'Mediterranean' } }, aliases: { it: [], en: [] },
    rationale: 'Collision test.',
    provenance: { sourceType: 'pipeline', sourceLabel: 'Pass A test orchestrator', reference: null, rationale: 'Collision test.' }
  }, { taxonomies, taxonomyTerms, registry });
  assert.equal(collision.status, 'needs_review');
  assert.ok(collision.collisionCandidateTermIds.includes('cuisine_mediterranean'));
  assert.throws(() => approveReferenceDataProposal(collision, { registry }), /unresolved collision/);

  await assert.rejects(() => createReferenceDataProposal({
    taxonomyId: 'meal_archetype', proposedTermId: 'meal_brunch', i18n: { it: { label: 'Brunch' }, en: { label: 'Brunch' } }, aliases: { it: [], en: [] }, rationale: 'Closed registry test.',
    provenance: { sourceType: 'pipeline', sourceLabel: 'Pass A test orchestrator', reference: null, rationale: 'Closed registry test.' }
  }, { taxonomies, taxonomyTerms, registry }), /Unknown taxonomy meal_archetype/);
});

test('RecipeGenerationJob freezes reference-data version and digest', async () => {
  const registry = await registryFixture();
  const job = await readJson(path.join(root, 'corpus/jobs/phase4-smoke-job.json'));
  registry.assert('recipeGenerationJob', job);
  assert.equal(job.referenceDataVersion, '1.0.0');
  assert.match(job.referenceDataDigest, /^[a-f0-9]{64}$/);
});

test('Pass A corpus policies use canonical taxonomy term IDs for every semantic coverage criterion', async () => {
  const { taxonomies, taxonomyTerms } = await bundledReferenceData(root);
  const index = assertReferenceData(taxonomies, taxonomyTerms);
  const taxonomyByDimension = {
    practicality: 'practical_tag',
    diet: 'diet_tag',
    recipe_family: 'recipe_family',
    cuisine: 'cuisine',
    ingredient_category: 'food_category'
  };
  for (const filename of ['v1-default.json', 'phase4-smoke.json']) {
    const policy = await readJson(path.join(root, 'corpus/policies', filename));
    for (const target of policy.coverageTargets || []) {
      const criteria = target.criteria?.length ? target.criteria : [{ dimension: target.dimension, key: target.key }];
      for (const criterion of criteria) {
        const taxonomyId = taxonomyByDimension[criterion.dimension];
        if (taxonomyId) assert.doesNotThrow(() => index.assertTerm(criterion.key, taxonomyId), `${filename}:${target.targetId}:${criterion.dimension}:${criterion.key}`);
      }
    }
  }
});
