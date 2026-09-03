import { repositories } from '../repositories/repositoryHub.js';

const COUNTED_STORES = ['ingredients','ingredientRevisions','recipes','recipeVersions','catalogPacks','planInstances','calendarDays','generationRuns','operations','shoppingChecklists'];

export async function collectStorageMetrics({ repo = repositories, storage = globalThis.navigator?.storage, importDurationMs = null, integrityOk = true } = {}) {
  const recordCounts = {};
  for (const store of COUNTED_STORES) recordCounts[store] = await repo.count(store);
  let estimate = null;
  if (storage?.estimate) {
    try { estimate = await storage.estimate(); } catch { estimate = null; }
  }
  const metrics = {
    version: 1,
    capturedAt: new Date().toISOString(),
    catalogVersion: await repo.getMeta('activeCatalogVersion') || null,
    recordCounts,
    importDurationMs: importDurationMs == null ? null : Math.max(0, Math.round(importDurationMs)),
    approximateStorageUsage: estimate?.usage ?? null,
    approximateStorageQuota: estimate?.quota ?? null,
    lastSuccessfulIntegrityCheck: integrityOk ? new Date().toISOString() : (await repo.getMeta('lastSuccessfulIntegrityCheck') || null)
  };
  await repo.atomicPut({}, {
    runtimeMetrics: metrics,
    lastSuccessfulIntegrityCheck: metrics.lastSuccessfulIntegrityCheck
  });
  return metrics;
}
