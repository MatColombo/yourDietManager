import { APP_BASE_PATH, cacheScopeKey, prefixAppPath } from '../lib/appBase.js';

const DATA_CACHE = `ydm-data-v10-${cacheScopeKey(APP_BASE_PATH)}`;

function shardMatches(shard, wantedIds) {
  if (!wantedIds || wantedIds.size === 0) return true;
  if (!Array.isArray(shard.recordIds)) return true;
  return shard.recordIds.some(id => wantedIds.has(id));
}

function shardUrls(manifest, key, ids = null) {
  const wanted = ids ? new Set(ids) : null;
  return (manifest[key]?.shards || []).filter(shard => shardMatches(shard, wanted)).map(shard => prefixAppPath(`/data/${shard.path}`));
}

export function offlineUrlsForPack(manifest, pack, recipeVersions = []) {
  const recipeVersionIds = new Set(pack.recipeVersionIds || []);
  const selectedVersions = recipeVersions.filter(version => recipeVersionIds.has(version.recipeVersionId));
  const recipeIds = new Set(selectedVersions.map(version => version.recipeId));
  const ingredientRevisionIds = new Set(selectedVersions.flatMap(version => (version.ingredientLines || []).map(line => line.ingredientRevisionId)));
  const ingredientIds = new Set(selectedVersions.flatMap(version => (version.ingredientLines || []).map(line => line.ingredientId)));
  return [...new Set([
    prefixAppPath('/data/catalog-manifest.json'),
    ...(manifest.locales || []).map(locale => prefixAppPath(`/data/locales/${locale}.json`)),
    ...shardUrls(manifest, 'taxonomies'),
    ...shardUrls(manifest, 'taxonomyTerms'),
    ...shardUrls(manifest, 'recipeVersions', recipeVersionIds),
    ...shardUrls(manifest, 'recipeFamilies', recipeIds),
    ...shardUrls(manifest, 'ingredientRevisions', ingredientRevisionIds),
    ...shardUrls(manifest, 'ingredientFamilies', ingredientIds)
  ])];
}

async function cacheUrlsDirect(urls, { cacheStorage = globalThis.caches, fetcher = globalThis.fetch } = {}) {
  if (!cacheStorage?.open || !fetcher) return { cached: false, reason: 'cache-api-unavailable', count: 0 };
  const cache = await cacheStorage.open(DATA_CACHE);
  let count = 0;
  const failed = [];
  for (const raw of urls) {
    try {
      const existing = await cache.match(raw);
      if (existing) { count += 1; continue; }
      const response = await fetcher(raw, { cache: 'no-cache' });
      if (!response.ok) { failed.push(raw); continue; }
      await cache.put(raw, response.clone());
      count += 1;
    } catch { failed.push(raw); }
  }
  return { cached: failed.length === 0, count, failed, via: 'cache-api' };
}

export async function cacheUrlsWithServiceWorker(urls, { serviceWorker = globalThis.navigator?.serviceWorker, timeoutMs = 8000, cacheStorage = globalThis.caches, fetcher = globalThis.fetch } = {}) {
  const target = serviceWorker?.controller;
  if (!target || typeof MessageChannel === 'undefined') return cacheUrlsDirect(urls, { cacheStorage, fetcher });
  const channel = new MessageChannel();
  const response = new Promise(resolve => {
    const timeout = setTimeout(() => resolve({ cached: false, reason: 'timeout', count: 0 }), timeoutMs);
    channel.port1.onmessage = event => { clearTimeout(timeout); resolve({ ...(event.data || { cached: false, reason: 'empty-response', count: 0 }), via: 'service-worker' }); };
  });
  target.postMessage({ type: 'YDM_CACHE_URLS', urls }, [channel.port2]);
  return response;
}

export async function cachePackOffline(manifest, pack, recipeVersions, options = {}) {
  const urls = offlineUrlsForPack(manifest, pack, recipeVersions);
  return cacheUrlsWithServiceWorker(urls, options);
}
