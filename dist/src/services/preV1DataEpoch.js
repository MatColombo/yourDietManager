import { APP_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../db/constants.js';
import { repositories } from '../repositories/repositoryHub.js';
import { assertReferenceData, referenceDataDigest } from './referenceDataService.js';

async function clearPreV1Caches(cacheStorage) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const names = await cacheStorage.keys();
  const owned = names.filter(name => /^ydm-(?:shell|data)-/i.test(name) && !/^ydm-shell-v37-/i.test(name) && !/^ydm-data-v17-/i.test(name));
  await Promise.all(owned.map(name => cacheStorage.delete(name)));
  return owned;
}

function clearBootstrapLocalStorage(storage) {
  if (!storage?.length || !storage?.key || !storage?.removeItem) return;
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith('ydm:')) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export async function ensurePreV1DataEpoch({
  repo = repositories,
  registry = null,
  referenceDataLoader,
  cacheStorage = globalThis.caches,
  localStorage = globalThis.localStorage,
  now = new Date().toISOString()
} = {}) {
  const currentEpoch = await repo.getMeta('preV1DataEpoch');
  if (currentEpoch === PRE_V1_DATA_EPOCH) return { reset: false, epoch: PRE_V1_DATA_EPOCH };
  if (typeof referenceDataLoader !== 'function') throw new Error('Pre-V1 reset requires bundled reference data');

  const previousCatalogVersion = await repo.getMeta('activeCatalogVersion');
  const bundled = await referenceDataLoader();
  const taxonomies = bundled?.taxonomies || [];
  const taxonomyTerms = bundled?.taxonomyTerms || [];
  assertReferenceData(taxonomies, taxonomyTerms, registry);
  const digest = await referenceDataDigest(taxonomies, taxonomyTerms);

  await repo.resetAll({
    data: { taxonomies, taxonomyTerms },
    meta: {
      preV1DataEpoch: PRE_V1_DATA_EPOCH,
      preV1Reset: {
        previousEpoch: currentEpoch || null,
        previousCatalogVersion: previousCatalogVersion || null,
        resetAt: now,
        appVersion: APP_VERSION,
        policy: 'destructive-pre-v1'
      },
      dbVersion: DB_VERSION,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      referenceDataVersion: bundled.referenceDataVersion || '1.0.0',
      referenceDataDigest: digest
    }
  });

  clearBootstrapLocalStorage(localStorage);
  const clearedCaches = await clearPreV1Caches(cacheStorage).catch(() => []);
  return { reset: true, epoch: PRE_V1_DATA_EPOCH, previousEpoch: currentEpoch || null, previousCatalogVersion: previousCatalogVersion || null, clearedCaches };
}
