import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { MemoryRepository, fileLoader, seedReferenceData } from './helpers.mjs';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { migrateIngredientModel } from '../src/services/ingredientModelMigration.js';
import { sha256Json } from '../src/lib/crypto.js';

async function loadShards(dir, prefix) {
  const rows = [];
  for (const name of (await readdir(dir)).filter(name => name.startsWith(prefix) && name.endsWith('.json')).sort()) {
    rows.push(...JSON.parse(await readFile(`${dir}/${name}`, 'utf8')));
  }
  return rows;
}

async function baseDeps(channel = 'development') {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader('schemas'));
  await registry.loadAll();
  await seedReferenceData(repo, process.cwd());
  await repo.setMeta('catalogManifest', { catalogVersion: '1.2.0-planner-phase-d', publication: { channel } });
  return { repo, registry };
}

async function ingredientFixture(ingredientRevisionId = 'ing_fdc_1104647_r1', channel = 'development') {
  const deps = await baseDeps(channel);
  const revisions = await loadShards('public/data/ingredients', 'ingredient-revisions-');
  const families = await loadShards('public/data/ingredients', 'ingredient-families-');
  const source = structuredClone(revisions.find(item => item.ingredientRevisionId === ingredientRevisionId));
  assert.ok(source, `${ingredientRevisionId} fixture missing`);
  const family = structuredClone(families.find(item => item.ingredientId === source.ingredientId));
  assert.ok(family, `${source.ingredientId} family missing`);
  await deps.repo.put('ingredientRevisions', source);
  await deps.repo.put('ingredients', family);
  return { ...deps, source, family };
}

async function rebaseIngredientSource(deps, { changeConcept = true } = {}) {
  const rebased = structuredClone(deps.source);
  rebased.catalogVersion = '1.3.0-dev.t4e';
  if (changeConcept) rebased.productTaxonomy = { ...rebased.productTaxonomy, conceptId: 'product_concept_onion' };
  rebased.contentHash = '';
  rebased.contentHash = await sha256Json({ ...rebased, contentHash: '' });
  await deps.repo.put('ingredientRevisions', rebased);
  const family = await deps.repo.get('ingredients', rebased.ingredientId);
  await deps.repo.put('ingredients', { ...family, currentRevisionId: rebased.ingredientRevisionId });
  await deps.repo.setMeta('catalogManifest', { catalogVersion: '1.3.0-dev.t4e', publication: { channel: 'development' } });
  return rebased;
}

test('development base rebase regenerates deterministic V2 ingredient artifact and identity mapping', async () => {
  const deps = await ingredientFixture();
  await migrateIngredientModel(deps);
  const derivedId = `${deps.source.ingredientRevisionId}_v2_r1`;
  const first = await deps.repo.get('ingredientRevisions', derivedId);
  assert.ok(first);
  assert.equal(first.productTaxonomy.conceptId, 'product_concept_garlic');

  await rebaseIngredientSource(deps);
  await migrateIngredientModel(deps);

  const revised = await deps.repo.get('ingredientRevisions', derivedId);
  const family = await deps.repo.get('ingredients', deps.source.ingredientId);
  const mapping = await deps.repo.get('ingredientMappings', [`identity:${deps.source.ingredientRevisionId}`, 1]);
  assert.equal(revised.productTaxonomy.conceptId, 'product_concept_onion');
  assert.notEqual(revised.contentHash, first.contentHash);
  assert.equal(family.currentRevisionId, derivedId);
  assert.equal(mapping.productTaxonomy.conceptId, 'product_concept_onion');
});

test('development base rebase also regenerates derived food-presentation revisions', async () => {
  const deps = await baseDeps('development');
  const revisions = await loadShards('public/data/ingredients', 'ingredient-revisions-');
  const families = await loadShards('public/data/ingredients', 'ingredient-families-');
  deps.source = structuredClone(revisions.find(item => item.ingredientId === 'ing_fdc_2685568'));
  assert.ok(deps.source, 'zucchini correction fixture missing');
  deps.family = structuredClone(families.find(item => item.ingredientId === deps.source.ingredientId));
  await deps.repo.put('ingredientRevisions', deps.source); await deps.repo.put('ingredients', deps.family);

  await migrateIngredientModel(deps);
  const firstFamily = await deps.repo.get('ingredients', deps.source.ingredientId);
  const first = await deps.repo.get('ingredientRevisions', firstFamily.currentRevisionId);
  assert.match(first.ingredientRevisionId, /_r2_identity$/);

  await rebaseIngredientSource(deps, { changeConcept: false });
  await migrateIngredientModel(deps);
  const secondFamily = await deps.repo.get('ingredients', deps.source.ingredientId);
  const second = await deps.repo.get('ingredientRevisions', secondFamily.currentRevisionId);
  assert.equal(secondFamily.currentRevisionId, firstFamily.currentRevisionId);
  assert.notEqual(second.contentHash, first.contentHash);
});

test('development base rebase regenerates deterministic recipe-presentation version', async () => {
  const deps = await baseDeps('development');
  const ingredientRevisions = await loadShards('public/data/ingredients', 'ingredient-revisions-');
  const ingredientFamilies = await loadShards('public/data/ingredients', 'ingredient-families-');
  const recipeVersions = await loadShards('public/data/recipes', 'recipe-versions-');
  const recipeFamilies = await loadShards('public/data/recipes', 'recipe-families-');
  const sourceRecipe = structuredClone(recipeVersions[0]);
  const family = structuredClone(recipeFamilies.find(item => item.recipeId === sourceRecipe.recipeId));
  const revisionById = new Map(ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  const familyById = new Map(ingredientFamilies.map(item => [item.ingredientId, item]));
  for (const line of sourceRecipe.ingredientLines) {
    await deps.repo.put('ingredientRevisions', revisionById.get(line.ingredientRevisionId));
    await deps.repo.put('ingredients', familyById.get(line.ingredientId));
  }
  await deps.repo.put('recipeVersions', sourceRecipe); await deps.repo.put('recipes', family);

  await migrateIngredientModel(deps);
  const firstFamily = await deps.repo.get('recipes', sourceRecipe.recipeId);
  const first = await deps.repo.get('recipeVersions', firstFamily.currentVersionId);
  assert.match(first.recipeVersionId, /_v2_r2$/);

  const rebased = { ...structuredClone(sourceRecipe), catalogVersion: '1.3.0-dev.t4e', contentHash: '' };
  rebased.contentHash = await sha256Json({ ...rebased, contentHash: '' });
  await deps.repo.put('recipeVersions', rebased);
  await deps.repo.put('recipes', { ...firstFamily, currentVersionId: rebased.recipeVersionId });
  await deps.repo.setMeta('catalogManifest', { catalogVersion: '1.3.0-dev.t4e', publication: { channel: 'development' } });

  await migrateIngredientModel(deps);
  const secondFamily = await deps.repo.get('recipes', sourceRecipe.recipeId);
  const second = await deps.repo.get('recipeVersions', secondFamily.currentVersionId);
  assert.equal(secondFamily.currentVersionId, firstFamily.currentVersionId);
  assert.notEqual(second.contentHash, first.contentHash);
});

test('non-development catalog still rejects a changed deterministic V2 ingredient artifact', async () => {
  const deps = await ingredientFixture('ing_fdc_1104647_r1', 'production');
  await migrateIngredientModel(deps);
  await rebaseIngredientSource(deps);
  await deps.repo.setMeta('catalogManifest', { catalogVersion: '1.3.0', publication: { channel: 'production' } });
  await assert.rejects(migrateIngredientModel(deps), /Immutable migration collision/);
});
