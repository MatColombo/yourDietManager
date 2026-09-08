import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { createBackup, importBackup, validateBackup } from '../src/services/backupEngine.js';
import { deleteAllLocalData } from '../src/services/localDataService.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();

class LocalStorageMock {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

class CacheStorageMock {
  constructor(names = []) { this.names = new Set(names); this.deleted = []; }
  async keys() { return [...this.names]; }
  async delete(name) { this.deleted.push(name); return this.names.delete(name); }
}

async function releaseRepo() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  const fetcher = fileFetch(root);
  await new CatalogImporter({ repo, registry, fetcher, storage: null }).bootstrap();
  const configuration = await ensureBootstrapConfiguration({ repo, registry, fetcher });
  return { repo, registry, fetcher, configuration };
}

test('Step3 A - V1 catalog backup validates and round-trips user configuration without replacing base catalog', async () => {
  const { repo, registry, configuration } = await releaseRepo();
  assert.equal(await repo.getMeta('activeCatalogVersion'), '1.1.0-planner-phase-b');
  assert.equal(await repo.count('recipes'), 1800);

  const backup = await createBackup({ repo, registry });
  await validateBackup(backup, { repo, registry });
  assert.equal(backup.catalog.catalogVersion, '1.1.0-planner-phase-b');
  assert.equal(backup.appVersion, '1.0.0-rc.29');

  const original = await repo.get('themeProfiles', configuration.themeProfileId);
  const changed = structuredClone(original);
  changed.density = original.density === 'compact' ? 'comfortable' : 'compact';
  await repo.put('themeProfiles', changed);
  assert.notEqual((await repo.get('themeProfiles', configuration.themeProfileId)).density, original.density);

  const result = await importBackup(backup, { repo, registry });
  assert.ok(result.preImportBackup?.sha256);
  assert.equal((await repo.get('themeProfiles', configuration.themeProfileId)).density, original.density);
  assert.equal(await repo.count('recipes'), 1800);
  assert.equal((await repo.getAll('recipes')).every(item => item.origin === 'base'), true);
});

test('Step3 B - delete local data clears private state but preserves public PWA caches by default', async () => {
  const { repo } = await releaseRepo();
  await repo.setMeta('test-private-meta', 'remove-me');
  const storage = new LocalStorageMock({ 'ydm:route': '/shopping', 'ydm:private': 'x', 'unrelated:key': 'keep' });
  const caches = new CacheStorageMock(['ydm-shell-v32-root', 'ydm-data-v16-root', 'third-party-cache']);

  const result = await deleteAllLocalData({ repo, localStorage: storage, cacheStorage: caches });
  assert.deepEqual(result.localStorageKeys.sort(), ['ydm:private', 'ydm:route']);
  assert.equal(result.publicCachesPreserved, true);
  assert.deepEqual(result.cacheNames, []);
  assert.equal(storage.getItem('ydm:private'), null);
  assert.equal(storage.getItem('unrelated:key'), 'keep');
  assert.deepEqual(await caches.keys(), ['ydm-shell-v32-root', 'ydm-data-v16-root', 'third-party-cache']);
  assert.equal(await repo.getMeta('activeCatalogVersion'), undefined);
  assert.equal(await repo.count('recipes'), 0);
  assert.equal(await repo.count('planInstances'), 0);
});

test('Step3 C - destructive delete can clear owned public caches when explicitly requested', async () => {
  const repo = new MemoryRepository();
  await repo.setMeta('activeCatalogVersion', '1.1.0-planner-phase-b');
  const storage = new LocalStorageMock({ 'ydm:private': 'x' });
  const caches = new CacheStorageMock(['ydm-shell-v32-root', 'ydm-data-v16-root', 'third-party-cache']);

  const result = await deleteAllLocalData({ repo, localStorage: storage, cacheStorage: caches, clearPublicCaches: true });
  assert.equal(result.publicCachesPreserved, false);
  assert.deepEqual(result.cacheNames.sort(), ['ydm-data-v16-root', 'ydm-shell-v32-root']);
  assert.deepEqual(await caches.keys(), ['third-party-cache']);
});

test('Step3 D - stable release gate is intentionally blocked only by RC version/manual acceptance before final user test', () => {
  const run = spawnSync(process.execPath, ['scripts/hardening/release-gate.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.match(run.stdout, /stable-app-version/);
  assert.match(run.stdout, /manual-acceptance/);
  assert.doesNotMatch(run.stdout, /3000|recipe-corpus-minimum/);
  assert.match(run.stdout, /BLOCKED/);
  assert.match(run.stdout, /stable-app-version|manual-acceptance|catalog-version/);
});
