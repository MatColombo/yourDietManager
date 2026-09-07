import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { PRE_V1_DATA_EPOCH } from '../src/db/constants.js';
import { ensurePreV1DataEpoch } from '../src/services/preV1DataEpoch.js';
import { loadLocalCatalog } from '../scripts/corpus/io-lib.mjs';
import { MemoryRepository, bundledReferenceData, fileLoader } from './helpers.mjs';

const root = process.cwd();

class FakeStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

class FakeCaches {
  constructor(names = []) { this.names = new Set(names); this.deleted = []; }
  async keys() { return [...this.names]; }
  async delete(name) { this.deleted.push(name); return this.names.delete(name); }
}

async function registryFixture() {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  return registry;
}

test('pre-V1 epoch reset destroys RC data, reseeds canonical reference data and clears owned browser state', async () => {
  const repo = new MemoryRepository();
  const registry = await registryFixture();
  await repo.setMeta('preV1DataEpoch', 'legacy-rc-epoch');
  await repo.setMeta('activeCatalogVersion', '0.3.0-dev');
  await repo.put('ingredientRevisions', { ingredientRevisionId:'ingrev_salmon_raw_v2', ingredientId:'ing_salmon', origin:'base', contentHash:'legacy' });
  await repo.put('recipes', { recipeId:'legacy_recipe', origin:'user', status:'active', currentVersionId:'legacy_version' });
  await repo.put('appConfigs', { id:'legacy-config' });
  const storage = new FakeStorage({ 'ydm:legacy':'1', unrelated:'keep' });
  const caches = new FakeCaches(['ydm-shell-v26-root','ydm-data-v12-root','another-app-cache']);

  const result = await ensurePreV1DataEpoch({
    repo, registry,
    referenceDataLoader: async () => ({ ...(await bundledReferenceData(root)), referenceDataVersion:'1.0.0' }),
    cacheStorage:caches, localStorage:storage,
    now:'2026-09-07T12:00:00.000Z'
  });

  assert.equal(result.reset, true);
  assert.equal(await repo.getMeta('preV1DataEpoch'), PRE_V1_DATA_EPOCH);
  assert.equal(await repo.getMeta('activeCatalogVersion'), undefined);
  assert.equal(await repo.get('ingredientRevisions', 'ingrev_salmon_raw_v2'), undefined);
  assert.equal(await repo.count('recipes'), 0);
  assert.equal(await repo.get('appConfigs', 'active'), undefined);
  assert.ok((await repo.count('taxonomies')) > 0);
  assert.ok((await repo.count('taxonomyTerms')) > 0);
  assert.equal(storage.getItem('ydm:legacy'), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
  assert.deepEqual(caches.deleted.sort(), ['ydm-data-v12-root','ydm-shell-v26-root']);
  assert.deepEqual(await repo.getMeta('preV1Reset'), {
    previousEpoch:'legacy-rc-epoch', previousCatalogVersion:'0.3.0-dev', resetAt:'2026-09-07T12:00:00.000Z', appVersion:'1.0.0-rc.27', policy:'destructive-pre-v1'
  });
});

test('current pre-V1 epoch is idempotent and does not erase current candidate data', async () => {
  const repo = new MemoryRepository();
  await repo.setMeta('preV1DataEpoch', PRE_V1_DATA_EPOCH);
  await repo.put('recipes', { recipeId:'current_recipe', origin:'user', status:'active', currentVersionId:'current_version' });
  const result = await ensurePreV1DataEpoch({ repo, referenceDataLoader: async () => { throw new Error('must not load'); }, cacheStorage:null, localStorage:null });
  assert.equal(result.reset, false);
  assert.ok(await repo.get('recipes', 'current_recipe'));
});

test('V1 candidate publication is closed: 600 ingredients, 600 reachable revisions, 500 recipes and core contains all 500', async () => {
  const catalog = await loadLocalCatalog(path.join(root, 'public/data'));
  const activeIngredients = catalog.ingredientFamilies.filter(item => item.status === 'active');
  const activeRecipes = catalog.recipeFamilies.filter(item => item.status === 'active');
  const reachable = new Set(activeIngredients.map(item => item.currentRevisionId));
  for (const version of catalog.recipeVersions) for (const line of version.ingredientLines || []) reachable.add(line.ingredientRevisionId);
  const revisionIds = new Set(catalog.ingredientRevisions.map(item => item.ingredientRevisionId));
  const core = catalog.manifest.packs.find(pack => pack.packId === 'core');

  assert.equal(catalog.manifest.catalogVersion, '1.0.0');
  assert.equal(catalog.manifest.publication.channel, 'production_release');
  assert.equal(catalog.manifest.publication.requiredHumanReview, false);
  assert.equal(catalog.manifest.publication.releaseEligible, true);
  assert.equal(activeIngredients.length, 600);
  assert.equal(catalog.ingredientRevisions.length, 600);
  assert.equal(activeRecipes.length, 500);
  assert.equal(catalog.recipeVersions.length, 500);
  assert.equal(reachable.size, revisionIds.size);
  assert.ok([...reachable].every(id => revisionIds.has(id)));
  assert.equal(core.required, true);
  assert.equal(core.recipeVersionIds.length, 500);
  for (const id of ['ingrev_salmon_raw_v2','ingrev_rice_cooked_v2','ingrev_zucchini_raw_v2','ingrev_olive_oil_v2']) assert.equal(revisionIds.has(id), false);
});
