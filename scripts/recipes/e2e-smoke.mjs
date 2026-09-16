import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { CatalogUpdater } from '../../src/services/catalogUpdater.js';
import { MemoryRepository, fileFetch, fileLoader } from '../../tests/helpers.mjs';

const root = process.cwd();
const dataRoot = path.join(root, 'public/data');
const manifest = JSON.parse(await readFile(path.join(dataRoot, 'catalog-manifest.json'), 'utf8'));
const proposalDir = path.join(root, 'data-proposals', 'recipes');
const proposalFiles = (await readdir(proposalDir).catch(() => [])).filter(name => name.endsWith('.json') && !name.endsWith('.example.json')).sort();
const authored = [];
for (const name of proposalFiles) authored.push(JSON.parse(await readFile(path.join(proposalDir, name), 'utf8')));
assert.equal(manifest.publication?.channel, 'development', 'E2E catalog must be a development publication');
assert.ok(manifest.catalogVersion !== '1.2.0-planner-phase-d', 'E2E catalog version did not advance');
for (const part of ['taxonomies','taxonomyTerms','ingredientFamilies','ingredientRevisions','recipeFamilies','recipeVersions']) {
  assert.ok((manifest[part]?.shards || []).length, `Missing ${part} shards`);
  assert.ok(manifest[part].shards.every(shard => shard.path.startsWith(`catalogs/${manifest.catalogVersion}/`)), `${part} shards are not cache-safe/versioned`);
}

const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
const firstIngredientRevision = JSON.parse(await readFile(path.join(dataRoot, manifest.ingredientRevisions.shards[0].path), 'utf8'))[0];
const firstRecipeVersion = JSON.parse(await readFile(path.join(dataRoot, manifest.recipeVersions.shards[0].path), 'utf8'))[0];
const firstRecipeFamily = JSON.parse(await readFile(path.join(dataRoot, manifest.recipeFamilies.shards[0].path), 'utf8'))[0];
const repo = new MemoryRepository();
await repo.setMeta('activeCatalogVersion', '1.2.0-planner-phase-d');
await repo.put('ingredientRevisions', { ...firstIngredientRevision, contentHash: 'legacy-base-hash', catalogVersion: '1.2.0-planner-phase-d' });
await repo.put('recipeVersions', { ...firstRecipeVersion, contentHash: 'legacy-base-hash', catalogVersion: '1.2.0-planner-phase-d' });
await repo.put('recipes', { ...firstRecipeFamily, origin: 'user', currentVersionId: 'user_override_version', updatedAt: '2026-09-16T00:00:00.000Z' });

const updater = new CatalogUpdater({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null });
const result = await updater.update();
assert.equal(result.updated, true);
assert.equal(await repo.getMeta('activeCatalogVersion'), manifest.catalogVersion);
assert.equal((await repo.get('ingredientRevisions', firstIngredientRevision.ingredientRevisionId)).contentHash, firstIngredientRevision.contentHash, 'development base ingredient was not rebased');
assert.equal((await repo.get('recipeVersions', firstRecipeVersion.recipeVersionId)).contentHash, firstRecipeVersion.contentHash, 'development base recipe was not rebased');
assert.equal((await repo.get('recipes', firstRecipeFamily.recipeId)).origin, 'user', 'local recipe-family override was overwritten');

const installedRecipeVersions = await repo.getAll('recipeVersions');
const installedIngredientRevisions = await repo.getAll('ingredientRevisions');
const installedTaxonomyTerms = new Set((await repo.getAll('taxonomyTerms')).map(term => term.termId));
for (const proposal of authored) {
  for (const item of proposal.recipes || []) {
    assert.ok(installedRecipeVersions.some(version => version.generation?.candidateId === item.proposalRecipeId), `authored recipe not installed: ${item.proposalRecipeId}`);
  }
  for (const item of proposal.ingredients || []) {
    const sourceRecordId = item.source?.sourceRecordId;
    const reference = item.source?.reference;
    assert.ok(installedIngredientRevisions.some(revision => (sourceRecordId && revision.source?.sourceRecordId === sourceRecordId) || (reference && revision.source?.reference === reference)), `authored ingredient not installed: ${item.proposalIngredientId}`);
  }
  for (const term of proposal.taxonomyTerms || []) assert.ok(installedTaxonomyTerms.has(term.termId), `authored taxonomy term not installed: ${term.termId}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  catalogVersion: manifest.catalogVersion,
  recipeCount: manifest.recipeVersions.count,
  ingredientCount: manifest.ingredientRevisions.count,
  cacheSafeShards: true,
  developmentBaseRebase: true,
  localOverridePreserved: true,
  authoredProposalCount: authored.length
}, null, 2));
