import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { DB_VERSION, CONTENT_SCHEMA_VERSION, STORE_DEFINITIONS } from '../src/db/constants.js';
import { applyStructuralUpgrade } from '../src/db/database.js';
import { runMigrations } from '../src/services/migrationRunner.js';
import { CatalogQueryService } from '../src/services/catalogQuery.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { CatalogUpdater } from '../src/services/catalogUpdater.js';
import { offlineUrlsForPack } from '../src/services/offlineCatalog.js';
import { collectStorageMetrics } from '../src/services/storageMetrics.js';
import { commitOperation, listRecentOperations } from '../src/services/operationHistoryService.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileFetch, fileLoader, bundledReferenceData } from './helpers.mjs';

const root = process.cwd();
const devRoot = path.join(root, 'tests/fixtures/catalog-0.3');

function fakeStructuralDb() {
  const stores = new Map();
  for (const [name] of Object.entries(STORE_DEFINITIONS)) {
    const indexes = new Set();
    stores.set(name, {
      indexNames: { contains: value => indexes.has(value) },
      createIndex: (indexName, keyPath, options) => { indexes.add(indexName); return { indexName, keyPath, options }; },
      indexes
    });
  }
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore: name => { const store = stores.get(name); if (!store) throw new Error(`Unexpected new store ${name}`); return store; }
  };
  const transaction = { objectStore: name => stores.get(name) };
  return { db, transaction, stores };
}

test('Pass A structural schema is DB v5 and applies the new compound catalog indexes without deleting stores', () => {
  assert.equal(DB_VERSION, 5);
  assert.equal(CONTENT_SCHEMA_VERSION, 3);
  const { db, transaction, stores } = fakeStructuralDb();
  applyStructuralUpgrade(db, transaction);
  assert.ok(stores.get('recipeVersions').indexes.has('originAndCatalogVersion'));
  assert.ok(stores.get('ingredientRevisions').indexes.has('originAndCatalogVersion'));
  assert.equal(stores.size, 22);
  assert.ok(stores.get('taxonomyTerms').indexes.has('taxonomyAndStatus'));
});

test('content migration resumes after interruption and is idempotent', async () => {
  const repo = new MemoryRepository();
  await repo.put('appConfigs', { schemaVersion: 1, locale: 'it' });
  const referenceDataLoader = () => bundledReferenceData(root);
  await assert.rejects(() => runMigrations(repo, { referenceDataLoader, onStep(step) { if (step === 'migration2:appConfig') throw new Error('simulated interruption'); } }), /simulated interruption/);
  assert.equal((await repo.get('appConfigs', 'active')).shoppingPeopleMultiplier, 1);
  assert.equal((await repo.getMeta('contentMigration:2')).status, 'running');
  await runMigrations(repo, { referenceDataLoader });
  await runMigrations(repo, { referenceDataLoader });
  assert.equal(await repo.getMeta('contentSchemaVersion'), 3);
  assert.equal((await repo.getMeta('contentMigration:2')).status, 'complete');
  assert.equal((await repo.getMeta('contentMigration:3')).status, 'complete');
  assert.ok((await repo.getMeta('contentMigration:2')).attempts >= 2);
});

test('10k unfiltered catalog browsing reads only the requested page of RecipeVersion records', async () => {
  class InstrumentedRepo extends MemoryRepository {
    constructor() { super(); this.recipeGetManyMax = 0; this.recipeGetAllCalls = 0; }
    async getAll(store) { if (store === 'recipeVersions') this.recipeGetAllCalls += 1; return super.getAll(store); }
    async getMany(store, keys) { if (store === 'recipeVersions') this.recipeGetManyMax = Math.max(this.recipeGetManyMax, keys.length); return super.getMany(store, keys); }
  }
  const repo = new InstrumentedRepo();
  const ids = [];
  for (let i = 0; i < 10000; i += 1) {
    const suffix = String(i).padStart(5, '0');
    const recipeId = `r_${suffix}`; const versionId = `rv_${suffix}`; ids.push(versionId);
    await repo.put('recipes', { recipeId, origin: 'base', currentVersionId: versionId, status: 'active' });
    await repo.put('recipeVersions', { recipeVersionId: versionId, recipeId, origin: 'base', i18n: { it: { title: `Ricetta ${suffix}` } }, mealArchetypes: ['lunch'], calculatedNutrition: { energyKcal: 500, proteinG: 25, fiberG: 8 }, practical: { prepMinutes: 15 }, allergenIds: [], searchTokens: ['ricetta'] });
  }
  await repo.setMeta('activeCatalogVersion', '1.0.0');
  await repo.put('catalogPacks', { catalogVersion: '1.0.0', packId: 'core', status: 'installed', recipeVersionIds: ids });
  const query = new CatalogQueryService({ repo });
  const result = await query.searchRecipes({ offset: 4950, limit: 50 });
  assert.equal(result.total, 10000);
  assert.equal(result.items.length, 50);
  assert.equal(repo.recipeGetAllCalls, 0);
  assert.ok(repo.recipeGetManyMax <= 50);
  assert.equal(query.lastQueryDiagnostics.strategy, 'bounded-id-page');
});

test('10k operation history uses persisted head/redo pointers for new commits and bounded recent reads', async () => {
  class InstrumentedRepo extends MemoryRepository {
    constructor() { super(); this.operationsGetAllCalls = 0; this.pageCalls = 0; }
    async getAll(store) { if (store === 'operations') this.operationsGetAllCalls += 1; return super.getAll(store); }
    async getByIndexPage(...args) { this.pageCalls += 1; return super.getByIndexPage(...args); }
  }
  const repo = new InstrumentedRepo(); const plan = 'plan_scale';
  const operations = [];
  for (let i = 1; i <= 10000; i += 1) operations.push({ schemaVersion: 1, operationId: `op_${i}`, planInstanceId: plan, sequence: i, kind: 'stress', createdAt: `2026-01-${String(1 + (i % 28)).padStart(2,'0')}T00:${String(i % 60).padStart(2,'0')}:00Z`, undoneAt: null, before: {}, after: {}, metadata: { previousActiveOperationId: i === 1 ? null : `op_${i-1}` } });
  await repo.putMany('operations', operations);
  await repo.setMeta(`operationHistory:${plan}`, { version: 1, maxSequence: 10000, headOperationId: 'op_10000', redoStack: [] });
  const recent = await listRecentOperations({ repo, limit: 25 });
  assert.equal(recent.length, 25);
  assert.equal(repo.pageCalls, 1);
  const created = await commitOperation({ planInstanceId: plan, kind: 'stress-next', before: {}, after: {} }, { repo });
  assert.equal(created.sequence, 10001);
  assert.equal(created.metadata.previousActiveOperationId, 'op_10000');
  assert.equal(repo.operationsGetAllCalls, 0);
});

test('offline pack planner selects only the shard families needed by the installed recipe versions', async () => {
  const manifest = JSON.parse(await readFile(path.join(devRoot, 'public/data/catalog-manifest.json'), 'utf8'));
  const recipeVersions = JSON.parse(await readFile(path.join(devRoot, 'public/data/recipes/recipe-versions-0001.json'), 'utf8'));
  const pack = manifest.packs.find(item => item.packId === 'quick');
  const urls = offlineUrlsForPack(manifest, pack, recipeVersions);
  assert.ok(urls.includes('/data/catalog-manifest.json'));
  assert.ok(urls.includes('/data/locales/it.json'));
  assert.ok(urls.some(url => url.includes('recipe-versions')));
  assert.ok(urls.some(url => url.includes('ingredient-revisions')));
  assert.equal(new Set(urls).size, urls.length);
});

test('catalog update can roll back to the previous active family pointers while retaining immutable staged records', async () => {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const oldRoot = path.join(root, 'tests/fixtures/catalog-0.1');
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(oldRoot), storage: null, serviceWorker: null }).bootstrap();
  const oldPointer = (await repo.get('recipes', 'rec_salmon_rice')).currentVersionId;
  const updater = new CatalogUpdater({ repo, registry, fetcher: fileFetch(devRoot), storage: null, serviceWorker: null });
  await updater.update();
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.notEqual((await repo.get('recipes', 'rec_salmon_rice')).currentVersionId, oldPointer);
  assert.ok(await repo.get('recipeVersions', 'recver_salmon_rice_v2'));
  const rolled = await updater.rollback();
  assert.equal(rolled.catalogVersion, '0.1.0-dev');
  assert.equal((await repo.get('recipes', 'rec_salmon_rice')).currentVersionId, oldPointer);
  assert.ok(await repo.get('recipeVersions', 'recver_salmon_rice_v2'));
});

test('failed catalog update records recoverable state without switching the active version', async () => {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(path.join(root, 'tests/fixtures/catalog-0.1')), storage: null, serviceWorker: null }).bootstrap();
  const normal = fileFetch(devRoot);
  const broken = async input => {
    const pathname = new URL(typeof input === 'string' ? input : input.url, 'http://local.test').pathname;
    if (pathname === '/data/catalog-manifest.json') {
      const response = await normal(input); const manifest = await response.json(); manifest.recipeVersions.shards[0].sha256 = '0'.repeat(64);
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    return normal(input);
  };
  const updater = new CatalogUpdater({ repo, registry, fetcher: broken, storage: null, serviceWorker: null });
  await assert.rejects(() => updater.update(), /Checksum mismatch/);
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.1.0-dev');
  assert.equal((await repo.getMeta('catalogUpdateState')).status, 'failed');
  const recovery = await updater.recoverIncompleteUpdate();
  assert.equal(recovery.recovered, true);
  assert.equal((await repo.getMeta('catalogUpdateState')).status, 'recovered');
});

test('runtime storage metrics persist record counts and quota estimates in meta', async () => {
  const repo = new MemoryRepository(); await repo.put('recipes', { recipeId: 'r1' }); await repo.put('recipeVersions', { recipeVersionId: 'rv1' }); await repo.setMeta('activeCatalogVersion', 'x');
  const metrics = await collectStorageMetrics({ repo, storage: { estimate: async () => ({ usage: 1234, quota: 9999 }) }, importDurationMs: 12 });
  assert.equal(metrics.recordCounts.recipes, 1);
  assert.equal(metrics.approximateStorageUsage, 1234);
  assert.equal((await repo.getMeta('runtimeMetrics')).catalogVersion, 'x');
});

test('Phase 8 accessibility and offline source gates are present', async () => {
  const [app, css, sw] = await Promise.all([
    readFile(path.join(root, 'src/ui/app.js'), 'utf8'),
    readFile(path.join(root, 'src/styles.css'), 'utf8'),
    readFile(path.join(root, 'public/service-worker.js'), 'utf8')
  ]);
  assert.match(app, /skip-link/);
  assert.match(app, /aria-current/);
  assert.match(app, /main-content/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(sw, /YDM_CACHE_URLS/);
});
