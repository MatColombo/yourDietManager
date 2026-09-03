import { repositories } from '../repositories/repositoryHub.js';
import { fetchCatalogManifest, loadCatalogSelection, validateCatalogReferences } from './catalogDataSource.js';
import { cachePackOffline } from './offlineCatalog.js';
import { collectStorageMetrics } from './storageMetrics.js';

function packRecord(pack, catalogVersion, status, now, previous = null) {
  return {
    schemaVersion: 1, ...pack, catalogVersion, status,
    installedAt: status === 'installed' ? (previous?.installedAt || now) : null,
    lastErrorCode: null,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

export class CatalogImporter {
  constructor({ repo = repositories, registry, fetcher = fetch, storage = globalThis.navigator?.storage, serviceWorker = globalThis.navigator?.serviceWorker } = {}) {
    this.repo = repo; this.registry = registry; this.fetcher = fetcher; this.storage = storage; this.serviceWorker = serviceWorker;
  }

  emit(listener, phase, completed, total, messageKey, error) { listener?.({ phase, completed, total, messageKey, error }); }

  async loadAndValidate(listener) {
    if (!this.registry) throw new Error('Schema registry is required');
    this.emit(listener, 'checking', 0, 1, 'catalog.status.checking');
    const manifest = await fetchCatalogManifest({ fetcher: this.fetcher, registry: this.registry });
    const requiredPacks = manifest.packs.filter(pack => pack.required);
    const wantedIds = [...new Set(requiredPacks.flatMap(pack => pack.recipeVersionIds))];
    if (this.storage?.estimate) {
      const estimate = await this.storage.estimate();
      const needed = requiredPacks.reduce((sum, pack) => sum + pack.estimatedBytes, 0);
      if (estimate.quota && estimate.usage != null && estimate.quota - estimate.usage < needed * 1.15) throw new Error('Insufficient browser storage for required catalog packs');
    }
    let completed = 0;
    const onShard = () => { completed += 1; this.emit(listener, 'validating', completed, Math.max(1, completed), 'catalog.status.validating'); };
    const selected = await loadCatalogSelection(manifest, wantedIds, { fetcher: this.fetcher, registry: this.registry, onShard });
    validateCatalogReferences({ ...selected, packs: requiredPacks });
    return { manifest, requiredPacks, ...selected };
  }

  async bootstrap(listener) {
    const started = Date.now();
    try {
      const active = await this.repo.getMeta('activeCatalogVersion');
      if (active) { this.emit(listener, 'complete', 1, 1, 'catalog.status.ready'); return active; }
      const catalog = await this.loadAndValidate(listener);
      const total = catalog.ingredientFamilies.length + catalog.ingredientRevisions.length + catalog.recipeFamilies.length + catalog.recipeVersions.length + catalog.manifest.packs.length;
      let done = 0;
      const stage = async (store, values) => {
        await this.repo.putMany(store, values, 250, progress => {
          this.emit(listener, 'importing', done + progress.completed, total, 'catalog.status.importing');
        });
        done += values.length;
      };
      await stage('ingredientRevisions', catalog.ingredientRevisions);
      await stage('recipeVersions', catalog.recipeVersions);
      const now = new Date().toISOString();
      const packs = catalog.manifest.packs.map(pack => packRecord(pack, catalog.manifest.catalogVersion, pack.required ? 'installed' : 'available', now));
      for (const pack of packs) this.registry.assert('catalogPack', pack);
      await this.repo.atomicPut({ ingredients: catalog.ingredientFamilies, recipes: catalog.recipeFamilies, catalogPacks: packs }, {
        catalogManifest: catalog.manifest,
        [`catalogManifest:${catalog.manifest.catalogVersion}`]: catalog.manifest,
        activeCatalogVersion: catalog.manifest.catalogVersion,
        catalogImportedAt: now
      });
      for (const pack of catalog.requiredPacks) {
        const offline = await cachePackOffline(catalog.manifest, pack, catalog.recipeVersions, { serviceWorker: this.serviceWorker });
        await this.repo.setMeta(`offlinePack:${catalog.manifest.catalogVersion}:${pack.packId}`, { ...offline, cachedAt: new Date().toISOString() });
      }
      if (this.storage?.persist) this.storage.persist().catch(() => false);
      await collectStorageMetrics({ repo: this.repo, storage: this.storage, importDurationMs: Date.now() - started }).catch(() => null);
      this.emit(listener, 'complete', total, total, 'catalog.status.ready'); return catalog.manifest.catalogVersion;
    } catch (error) {
      this.emit(listener, 'error', 0, 1, 'catalog.status.error', error instanceof Error ? error.message : String(error)); throw error;
    }
  }
}
