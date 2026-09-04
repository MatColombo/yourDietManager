import { readFile } from 'node:fs/promises';
import path from 'node:path';

const KEY_FIELDS = {
  nutritionProfiles: 'id', allergyIntoleranceProfiles: 'id', foodPreferences: 'id', themeProfiles: 'id', mealClasses: 'id', dayClasses: 'id', cycles: 'id',
  taxonomies: 'taxonomyId', taxonomyTerms: 'termId', ingredients: 'ingredientId', ingredientRevisions: 'ingredientRevisionId', recipes: 'recipeId', recipeVersions: 'recipeVersionId',
  planInstances: 'planInstanceId', calendarDays: 'calendarDayId', generationRuns: 'generationRunId', operations: 'operationId', shoppingChecklists: 'checklistId'
};

export class MemoryRepository {
  constructor() { this.stores = new Map(); this.meta = new Map(); }
  store(name) { if (!this.stores.has(name)) this.stores.set(name, new Map()); return this.stores.get(name); }
  key(store, value) {
    if (store === 'appConfigs') return 'active';
    if (store === 'catalogPacks') return `${value.catalogVersion}::${value.packId}`;
    return value[KEY_FIELDS[store]];
  }
  async get(store, key) { return structuredClone(this.store(store).get(Array.isArray(key) ? key.join('::') : key)); }
  async getAll(store) { return structuredClone([...this.store(store).values()]); }
  async getMany(store, keys) { return structuredClone(keys.map(key => this.store(store).get(Array.isArray(key) ? key.join('::') : key)).filter(Boolean)); }
  async getAllByIndex(store, indexName, range = null, count) {
    const values = [...this.store(store).values()];
    const at = (obj, path) => path.split('.').reduce((v, key) => v?.[key], obj);
    const indexPaths = {
      origin: 'origin', status: 'status', originAndStatus: null, currentVersionId: 'currentVersionId', ingredientId: 'ingredientId', recipeId: 'recipeId', catalogVersion: 'catalogVersion', taxonomyId: 'taxonomyId', parentTermId: 'parentTermId', taxonomyAndStatus: null,
      originAndCatalogVersion: null,
      'taxonomy.foodGroup': 'taxonomy.foodGroup', allergenIds: 'allergenIds', mealArchetypes: 'mealArchetypes',
      'calculatedNutrition.energyKcal': 'calculatedNutrition.energyKcal', 'calculatedNutrition.proteinG': 'calculatedNutrition.proteinG',
      'calculatedNutrition.fiberG': 'calculatedNutrition.fiberG', 'practical.prepMinutes': 'practical.prepMinutes', searchTokens: 'searchTokens',
      planAndSequence: null, planInstanceId: 'planInstanceId', createdAt: 'createdAt'
    };
    const cmp = (left, right) => {
      if (Array.isArray(left) && Array.isArray(right)) {
        for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
          if (left[i] === right[i]) continue;
          if (left[i] === undefined) return -1;
          if (right[i] === undefined) return 1;
          return left[i] < right[i] ? -1 : 1;
        }
        return 0;
      }
      return left === right ? 0 : (left < right ? -1 : 1);
    };
    const matchScalar = value => {
      if (range == null) return true;
      if (typeof range !== 'object' || Array.isArray(range) || !('kind' in range)) return cmp(value, range) === 0;
      if (range.kind === 'only') return cmp(value, range.value) === 0;
      if (range.kind === 'lower') return range.open ? cmp(value, range.value) > 0 : cmp(value, range.value) >= 0;
      if (range.kind === 'upper') return range.open ? cmp(value, range.value) < 0 : cmp(value, range.value) <= 0;
      if (range.kind === 'bound') return (range.lowerOpen ? cmp(value, range.lower) > 0 : cmp(value, range.lower) >= 0) && (range.upperOpen ? cmp(value, range.upper) < 0 : cmp(value, range.upper) <= 0);
      return false;
    };
    let out = values.filter(record => {
      if (indexName === 'originAndStatus') return matchScalar([record.origin, record.status]);
      if (indexName === 'originAndCatalogVersion') return matchScalar([record.origin, record.catalogVersion]);
      if (indexName === 'taxonomyAndStatus') return matchScalar([record.taxonomyId, record.status]);
      if (indexName === 'planAndSequence') return matchScalar([record.planInstanceId, record.sequence]);
      const path = indexPaths[indexName] || indexName; const value = at(record, path);
      return Array.isArray(value) ? value.some(matchScalar) : matchScalar(value);
    });
    if (count != null) out = out.slice(0, count);
    return structuredClone(out);
  }

  async getByIndexPage(store, indexName, { range = null, direction = 'next', offset = 0, limit = 50 } = {}) {
    let out = await this.getAllByIndex(store, indexName, range);
    const key = record => {
      if (indexName === 'createdAt') return record.createdAt;
      if (indexName === 'planAndSequence') return `${record.planInstanceId}::${String(record.sequence).padStart(12,'0')}`;
      return String(record[indexName] ?? '');
    };
    out.sort((a,b) => key(a).localeCompare(key(b)));
    if (direction === 'prev' || direction === 'prevunique') out.reverse();
    return structuredClone(out.slice(offset, offset + limit));
  }
  async count(store) { return this.store(store).size; }
  async put(store, value) { this.store(store).set(this.key(store, value), structuredClone(value)); }
  async putMany(store, values) { for (const value of values) await this.put(store, value); }
  async clear(store) { this.store(store).clear(); }
  async delete(store, key) { this.store(store).delete(Array.isArray(key) ? key.join('::') : key); }
  async getMeta(key) { return structuredClone(this.meta.get(key)); }
  async setMeta(key, value) { this.meta.set(key, structuredClone(value)); }
  async atomicPut(data, meta = {}) {
    const storeBackup = structuredClone([...this.stores.entries()].map(([name, map]) => [name, [...map.entries()]]));
    const metaBackup = structuredClone([...this.meta.entries()]);
    try {
      for (const [store, values] of Object.entries(data)) for (const value of values || []) await this.put(store, value);
      for (const [key, value] of Object.entries(meta)) await this.setMeta(key, value);
    } catch (error) {
      this.stores = new Map(storeBackup.map(([name, entries]) => [name, new Map(entries)])); this.meta = new Map(metaBackup); throw error;
    }
  }
  async atomicMutate({ puts = {}, deletes = {}, metaSet = {}, metaDelete = [] } = {}) {
    const storeBackup = structuredClone([...this.stores.entries()].map(([name, map]) => [name, [...map.entries()]]));
    const metaBackup = structuredClone([...this.meta.entries()]);
    try {
      for (const [store, values] of Object.entries(puts)) for (const value of values || []) await this.put(store, value);
      for (const [store, keys] of Object.entries(deletes)) for (const key of keys || []) await this.delete(store, key);
      for (const [key, value] of Object.entries(metaSet)) await this.setMeta(key, value);
      for (const key of metaDelete || []) this.meta.delete(key);
    } catch (error) {
      this.stores = new Map(storeBackup.map(([name, entries]) => [name, new Map(entries)])); this.meta = new Map(metaBackup); throw error;
    }
  }
  async atomicReplace(data) {
    const backup = structuredClone([...this.stores.entries()].map(([name, map]) => [name, [...map.entries()]]));
    try {
      for (const [store, values] of Object.entries(data)) {
        this.stores.set(store, new Map());
        for (const value of values || []) await this.put(store, value);
      }
    } catch (error) {
      this.stores = new Map(backup.map(([name, entries]) => [name, new Map(entries)]));
      throw error;
    }
  }
}


export async function bundledReferenceData(root, registry = null) {
  const taxonomies = JSON.parse(await readFile(path.join(root, 'public/data/reference-data/taxonomies-0001.json'), 'utf8'));
  const taxonomyTerms = JSON.parse(await readFile(path.join(root, 'public/data/reference-data/taxonomy-terms-0001.json'), 'utf8'));
  return { taxonomies, taxonomyTerms };
}

export async function seedReferenceData(repo, root) {
  const { taxonomies, taxonomyTerms } = await bundledReferenceData(root);
  await repo.putMany('taxonomies', taxonomies);
  await repo.putMany('taxonomyTerms', taxonomyTerms);
  return { taxonomies, taxonomyTerms };
}
export function fileLoader(dir) {
  return async file => JSON.parse(await readFile(path.join(dir, file), 'utf8'));
}

export function fileFetch(root) {
  return async input => {
    const raw = typeof input === 'string' ? input : input.url;
    const pathname = new URL(raw, 'http://local.test').pathname.replace(/^\/+/, '');
    const candidates = [path.join(root, pathname), path.join(root, 'public', pathname)];
    for (const file of candidates) {
      try { return new Response(await readFile(file), { status: 200 }); } catch {}
    }
    return new Response('Not found', { status: 404 });
  };
}
