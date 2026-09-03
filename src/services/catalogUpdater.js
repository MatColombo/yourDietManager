import { repositories } from '../repositories/repositoryHub.js';
import { compareSemver } from '../lib/semver.js';
import { fetchCatalogManifest, loadCatalogPart, loadCatalogSelection, validateCatalogReferences } from './catalogDataSource.js';
import { cachePackOffline } from './offlineCatalog.js';
import { collectStorageMetrics } from './storageMetrics.js';

function packRecord(pack, catalogVersion, status, now, previous = null, error = null) {
  return {
    schemaVersion: 1, ...pack, catalogVersion, status,
    installedAt: status === 'installed' ? (previous?.installedAt || now) : null,
    lastErrorCode: error,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

async function stageImmutable(repo, store, records, idKey, onProgress = null) {
  if (!records.length) return;
  const existing = new Map((await repo.getMany(store, records.map(record => record[idKey]))).map(record => [record[idKey], record]));
  const toWrite = [];
  for (const record of records) {
    const old = existing.get(record[idKey]);
    if (!old) { toWrite.push(record); continue; }
    if (old.origin === 'user') throw new Error(`Catalog ID collides with user record ${record[idKey]}`);
    if (old.contentHash && record.contentHash && old.contentHash !== record.contentHash) throw new Error(`Immutable catalog record changed in place: ${record[idKey]}`);
  }
  await repo.putMany(store, toWrite, 250, onProgress);
}

function rollbackSnapshot(previousVersion, ingredientFamilies, recipeFamilies, packs) {
  if (!previousVersion) return null;
  return {
    version: 1,
    previousVersion,
    capturedAt: new Date().toISOString(),
    ingredients: ingredientFamilies.filter(record => record.origin === 'base'),
    recipes: recipeFamilies.filter(record => record.origin === 'base'),
    packs: packs.filter(record => record.catalogVersion === previousVersion)
  };
}

export class CatalogUpdater {
  constructor({ repo = repositories, registry, fetcher = fetch, storage = globalThis.navigator?.storage, serviceWorker = globalThis.navigator?.serviceWorker } = {}) {
    this.repo = repo; this.registry = registry; this.fetcher = fetcher; this.storage = storage; this.serviceWorker = serviceWorker;
  }

  async check() {
    const activeVersion = await this.repo.getMeta('activeCatalogVersion');
    const manifest = await fetchCatalogManifest({ fetcher: this.fetcher, registry: this.registry, cache: 'no-cache' });
    return { activeVersion, manifest, updateAvailable: !activeVersion || compareSemver(manifest.catalogVersion, activeVersion) > 0 };
  }

  async targetPackIds(manifest) {
    const activeVersion = await this.repo.getMeta('activeCatalogVersion');
    const oldPacks = activeVersion ? await this.repo.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: activeVersion }) : [];
    const installedOld = new Set(oldPacks.filter(pack => pack.status === 'installed').map(pack => pack.packId));
    return new Set(manifest.packs.filter(pack => pack.required || installedOld.has(pack.packId)).map(pack => pack.packId));
  }

  async recoverIncompleteUpdate() {
    const state = await this.repo.getMeta('catalogUpdateState');
    if (!state || !['staging','failed'].includes(state.status)) return { recovered: false };
    const activeVersion = await this.repo.getMeta('activeCatalogVersion');
    const recovered = { ...state, status: 'recovered', recoveredAt: new Date().toISOString(), activeVersion };
    await this.repo.setMeta('catalogUpdateState', recovered);
    return { recovered: true, activeVersion, targetVersion: state.targetVersion };
  }

  async update(listener) {
    if (!this.registry) throw new Error('Schema registry is required');
    const started = Date.now();
    const checked = await this.check();
    if (!checked.updateAvailable) return { updated: false, catalogVersion: checked.activeVersion };
    const manifest = checked.manifest;
    const previousVersion = checked.activeVersion;
    await this.repo.setMeta('catalogUpdateState', { status: 'staging', previousVersion, targetVersion: manifest.catalogVersion, startedAt: new Date().toISOString() });
    try {
      const targetPackIds = await this.targetPackIds(manifest);
      const selectedPacks = manifest.packs.filter(pack => targetPackIds.has(pack.packId));
      const wantedIds = [...new Set(selectedPacks.flatMap(pack => pack.recipeVersionIds))];
      const requiredBytes = selectedPacks.reduce((sum, pack) => sum + pack.estimatedBytes, 0);
      if (this.storage?.estimate) {
        const estimate = await this.storage.estimate();
        if (estimate.quota && estimate.usage != null && estimate.quota - estimate.usage < requiredBytes * 1.15) throw new Error('Insufficient browser storage for catalog update');
      }
      listener?.({ phase: 'validating', completed: 0, total: 1, messageKey: 'catalog.status.validating' });
      const selected = await loadCatalogSelection(manifest, wantedIds, { fetcher: this.fetcher, registry: this.registry });
      validateCatalogReferences({ ...selected, packs: selectedPacks });
      const totalStage = selected.recipeVersions.length + selected.ingredientRevisions.length;
      let staged = 0;
      listener?.({ phase: 'importing', completed: staged, total: Math.max(1, totalStage), messageKey: 'catalog.status.importing' });
      await stageImmutable(this.repo, 'ingredientRevisions', selected.ingredientRevisions, 'ingredientRevisionId', progress => {
        staged = progress.completed;
        listener?.({ phase: 'importing', completed: staged, total: Math.max(1, totalStage), messageKey: 'catalog.status.importing' });
      });
      const ingredientStageTotal = selected.ingredientRevisions.length;
      await stageImmutable(this.repo, 'recipeVersions', selected.recipeVersions, 'recipeVersionId', progress => {
        staged = ingredientStageTotal + progress.completed;
        listener?.({ phase: 'importing', completed: staged, total: Math.max(1, totalStage), messageKey: 'catalog.status.importing' });
      });

      const now = new Date().toISOString();
      const previousIngredientFamilies = await this.repo.getAll('ingredients');
      const previousRecipeFamilies = await this.repo.getAll('recipes');
      const previousPacks = previousVersion ? await this.repo.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: previousVersion }) : [];
      const snapshot = rollbackSnapshot(previousVersion, previousIngredientFamilies, previousRecipeFamilies, previousPacks);
      const baseIngredients = previousIngredientFamilies.filter(record => record.origin === 'base');
      const newIngredientIds = new Set(selected.ingredientFamilies.map(record => record.ingredientId));
      const retiredIngredients = baseIngredients.filter(record => !newIngredientIds.has(record.ingredientId)).map(record => ({ ...record, status: 'retired', updatedAt: now }));
      const baseRecipes = previousRecipeFamilies.filter(record => record.origin === 'base');
      const newRecipeIds = new Set(selected.recipeFamilies.map(record => record.recipeId));
      const retiredRecipes = baseRecipes.filter(record => !newRecipeIds.has(record.recipeId)).map(record => ({ ...record, status: 'retired', updatedAt: now }));
      const packs = manifest.packs.map(pack => packRecord(pack, manifest.catalogVersion, targetPackIds.has(pack.packId) ? 'installed' : 'available', now));
      for (const pack of packs) this.registry.assert('catalogPack', pack);
      await this.repo.atomicPut({
        ingredients: [...retiredIngredients, ...selected.ingredientFamilies],
        recipes: [...retiredRecipes, ...selected.recipeFamilies],
        catalogPacks: packs
      }, {
        catalogManifest: manifest,
        [`catalogManifest:${manifest.catalogVersion}`]: manifest,
        activeCatalogVersion: manifest.catalogVersion,
        catalogImportedAt: now,
        catalogRollbackSnapshot: snapshot,
        catalogUpdateState: { status: 'complete', previousVersion, targetVersion: manifest.catalogVersion, completedAt: now }
      });

      for (const pack of selectedPacks) {
        const result = await cachePackOffline(manifest, pack, selected.recipeVersions, { serviceWorker: this.serviceWorker });
        await this.repo.setMeta(`offlinePack:${manifest.catalogVersion}:${pack.packId}`, { ...result, cachedAt: new Date().toISOString() });
      }
      await collectStorageMetrics({ repo: this.repo, storage: this.storage, importDurationMs: Date.now() - started }).catch(() => null);
      listener?.({ phase: 'complete', completed: 1, total: 1, messageKey: 'catalog.status.ready' });
      return { updated: true, catalogVersion: manifest.catalogVersion };
    } catch (error) {
      await this.repo.setMeta('catalogUpdateState', { status: 'failed', previousVersion, targetVersion: manifest.catalogVersion, failedAt: new Date().toISOString(), error: error.message || String(error) });
      throw error;
    }
  }

  async rollback() {
    const snapshot = await this.repo.getMeta('catalogRollbackSnapshot');
    if (!snapshot?.previousVersion) throw new Error('No catalog rollback snapshot is available');
    const activeVersion = await this.repo.getMeta('activeCatalogVersion');
    const state = await this.repo.getMeta('catalogUpdateState');
    if (state?.targetVersion && activeVersion !== state.targetVersion) throw new Error('Rollback snapshot does not match the active catalog');
    const manifest = await this.repo.getMeta(`catalogManifest:${snapshot.previousVersion}`);
    if (!manifest) throw new Error(`Previous catalog manifest ${snapshot.previousVersion} is unavailable`);
    const now = new Date().toISOString();
    const oldIngredientIds = new Set(snapshot.ingredients.map(item => item.ingredientId));
    const oldRecipeIds = new Set(snapshot.recipes.map(item => item.recipeId));
    const currentIngredients = (await this.repo.getAll('ingredients')).filter(item => item.origin === 'base');
    const currentRecipes = (await this.repo.getAll('recipes')).filter(item => item.origin === 'base');
    const retiredNewIngredients = currentIngredients.filter(item => !oldIngredientIds.has(item.ingredientId)).map(item => ({ ...item, status: 'retired', updatedAt: now }));
    const retiredNewRecipes = currentRecipes.filter(item => !oldRecipeIds.has(item.recipeId)).map(item => ({ ...item, status: 'retired', updatedAt: now }));
    await this.repo.atomicPut({
      ingredients: [...retiredNewIngredients, ...snapshot.ingredients],
      recipes: [...retiredNewRecipes, ...snapshot.recipes],
      catalogPacks: snapshot.packs || []
    }, {
      catalogManifest: manifest,
      activeCatalogVersion: snapshot.previousVersion,
      catalogImportedAt: now,
      catalogUpdateState: { status: 'rolled_back', previousVersion: activeVersion, targetVersion: snapshot.previousVersion, completedAt: now },
      catalogRollbackSnapshot: null
    });
    await collectStorageMetrics({ repo: this.repo, storage: this.storage }).catch(() => null);
    return { rolledBack: true, catalogVersion: snapshot.previousVersion };
  }

  async installPack(packId, listener) {
    const catalogVersion = await this.repo.getMeta('activeCatalogVersion');
    const manifest = await this.repo.getMeta('catalogManifest');
    if (!catalogVersion || !manifest || manifest.catalogVersion !== catalogVersion) throw new Error('Active catalog manifest is unavailable');
    const definition = manifest.packs.find(pack => pack.packId === packId);
    if (!definition) throw new Error(`Unknown catalog pack ${packId}`);
    const key = [catalogVersion, packId]; const previous = await this.repo.get('catalogPacks', key);
    if (previous?.status === 'installed') return previous;
    if (this.storage?.estimate) {
      const estimate = await this.storage.estimate();
      if (estimate.quota && estimate.usage != null && estimate.quota - estimate.usage < definition.estimatedBytes * 1.15) throw new Error('Insufficient browser storage for catalog pack');
    }
    const now = new Date().toISOString();
    await this.repo.put('catalogPacks', packRecord(definition, catalogVersion, 'installing', now, previous));
    try {
      listener?.({ phase: 'validating', completed: 0, total: 1, messageKey: 'catalog.status.validating' });
      const recipeVersions = await loadCatalogPart(manifest, 'recipeVersions', { fetcher: this.fetcher, registry: this.registry, wantedIds: definition.recipeVersionIds });
      const recipeIds = [...new Set(recipeVersions.map(record => record.recipeId))];
      const recipeFamilies = await loadCatalogPart(manifest, 'recipeFamilies', { fetcher: this.fetcher, registry: this.registry, wantedIds: recipeIds });
      const ingredients = await this.repo.getAll('ingredients'); const revisions = await this.repo.getAll('ingredientRevisions');
      validateCatalogReferences({ ingredientFamilies: ingredients.filter(record => record.origin === 'base'), ingredientRevisions: revisions.filter(record => record.origin === 'base'), recipeFamilies, recipeVersions, packs: [definition] });
      await stageImmutable(this.repo, 'recipeVersions', recipeVersions, 'recipeVersionId', progress => listener?.({ phase: 'importing', completed: progress.completed, total: progress.total, messageKey: 'catalog.status.importing' }));
      const installed = packRecord(definition, catalogVersion, 'installed', new Date().toISOString(), previous);
      this.registry.assert('catalogPack', installed);
      await this.repo.atomicPut({ recipes: recipeFamilies, catalogPacks: [installed] });
      const offline = await cachePackOffline(manifest, definition, recipeVersions, { serviceWorker: this.serviceWorker });
      await this.repo.setMeta(`offlinePack:${catalogVersion}:${packId}`, { ...offline, cachedAt: new Date().toISOString() });
      await collectStorageMetrics({ repo: this.repo, storage: this.storage }).catch(() => null);
      listener?.({ phase: 'complete', completed: 1, total: 1, messageKey: 'catalog.status.ready' }); return installed;
    } catch (error) {
      const failed = packRecord(definition, catalogVersion, 'failed', new Date().toISOString(), previous, 'PACK_INSTALL_FAILED');
      await this.repo.put('catalogPacks', failed); throw error;
    }
  }

  async uninstallPack(packId) {
    const catalogVersion = await this.repo.getMeta('activeCatalogVersion'); const manifest = await this.repo.getMeta('catalogManifest');
    const definition = manifest?.packs.find(pack => pack.packId === packId);
    if (!definition) throw new Error(`Unknown catalog pack ${packId}`);
    if (definition.required) throw new Error('Required catalog packs cannot be uninstalled');
    const previous = await this.repo.get('catalogPacks', [catalogVersion, packId]);
    const available = packRecord(definition, catalogVersion, 'available', new Date().toISOString(), previous);
    await this.repo.put('catalogPacks', available); return available;
  }
}
