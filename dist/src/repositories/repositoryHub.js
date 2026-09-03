import { openDatabase } from '../db/database.js';

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  });
}

function idbRange(spec) {
  if (spec === undefined || spec === null) return undefined;
  if (typeof IDBKeyRange !== 'undefined' && spec instanceof IDBKeyRange) return spec;
  if (typeof spec !== 'object' || Array.isArray(spec) || !('kind' in spec)) return spec;
  if (typeof IDBKeyRange === 'undefined') return spec;
  if (spec.kind === 'only') return IDBKeyRange.only(spec.value);
  if (spec.kind === 'lower') return IDBKeyRange.lowerBound(spec.value, Boolean(spec.open));
  if (spec.kind === 'upper') return IDBKeyRange.upperBound(spec.value, Boolean(spec.open));
  if (spec.kind === 'bound') return IDBKeyRange.bound(spec.lower, spec.upper, Boolean(spec.lowerOpen), Boolean(spec.upperOpen));
  throw new Error(`Unknown IndexedDB range kind ${spec.kind}`);
}

function putValue(storeName, objectStore, value) {
  if (storeName === 'appConfigs') objectStore.put(value, 'active');
  else objectStore.put(value);
}

export class RepositoryHub {
  constructor(dbProvider = openDatabase) { this.dbProvider = dbProvider; }

  async get(store, key) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    return requestPromise(tx.objectStore(store).get(key));
  }

  async getMany(store, keys) {
    if (!keys.length) return [];
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    const values = await Promise.all(keys.map(key => requestPromise(objectStore.get(key))));
    return values.filter(value => value !== undefined);
  }

  async getAll(store) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    return requestPromise(tx.objectStore(store).getAll());
  }

  async getAllByIndex(store, indexName, range = null, count) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    return requestPromise(index.getAll(idbRange(range), count));
  }

  async getByIndexPage(store, indexName, { range = null, direction = 'next', offset = 0, limit = 50 } = {}) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const rows = [];
    let skipped = 0;
    return new Promise((resolve, reject) => {
      const request = index.openCursor(idbRange(range), direction);
      request.onerror = () => reject(request.error || new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || rows.length >= limit) { resolve(rows); return; }
        if (skipped < offset) { skipped += 1; cursor.continue(); return; }
        rows.push(cursor.value);
        cursor.continue();
      };
    });
  }

  async count(store) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readonly');
    return requestPromise(tx.objectStore(store).count());
  }

  async put(store, value) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readwrite');
    putValue(store, tx.objectStore(store), value);
    await transactionDone(tx);
  }

  async putMany(store, values, chunkSize = 250, onChunk = null) {
    const db = await this.dbProvider();
    for (let index = 0; index < values.length; index += chunkSize) {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      const chunk = values.slice(index, index + chunkSize);
      for (const value of chunk) putValue(store, objectStore, value);
      await transactionDone(tx);
      onChunk?.({ completed: Math.min(values.length, index + chunk.length), total: values.length });
    }
  }

  async delete(store, key) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await transactionDone(tx);
  }

  async clear(store) {
    const db = await this.dbProvider();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await transactionDone(tx);
  }

  async getMeta(key) {
    const record = await this.get('meta', key);
    return record?.value;
  }

  async setMeta(key, value) {
    await this.put('meta', { key, value, updatedAt: new Date().toISOString() });
  }

  async atomicPut(data, meta = {}) {
    const stores = [...new Set([...Object.keys(data), ...(Object.keys(meta).length ? ['meta'] : [])])];
    if (!stores.length) return;
    const db = await this.dbProvider();
    const tx = db.transaction(stores, 'readwrite');
    for (const [store, values] of Object.entries(data)) {
      const objectStore = tx.objectStore(store);
      for (const value of values || []) putValue(store, objectStore, value);
    }
    if (Object.keys(meta).length) {
      const objectStore = tx.objectStore('meta');
      const updatedAt = new Date().toISOString();
      for (const [key, value] of Object.entries(meta)) objectStore.put({ key, value, updatedAt });
    }
    await transactionDone(tx);
  }

  async atomicMutate({ puts = {}, deletes = {}, metaSet = {}, metaDelete = [] } = {}) {
    const stores = [...new Set([
      ...Object.keys(puts),
      ...Object.keys(deletes),
      ...(Object.keys(metaSet).length || metaDelete.length ? ['meta'] : [])
    ])];
    if (!stores.length) return;
    const db = await this.dbProvider();
    const tx = db.transaction(stores, 'readwrite');
    for (const [store, values] of Object.entries(puts)) {
      const objectStore = tx.objectStore(store);
      for (const value of values || []) putValue(store, objectStore, value);
    }
    for (const [store, keys] of Object.entries(deletes)) {
      const objectStore = tx.objectStore(store);
      for (const key of keys || []) objectStore.delete(key);
    }
    if (stores.includes('meta')) {
      const objectStore = tx.objectStore('meta');
      const updatedAt = new Date().toISOString();
      for (const [key, value] of Object.entries(metaSet)) objectStore.put({ key, value, updatedAt });
      for (const key of metaDelete || []) objectStore.delete(key);
    }
    await transactionDone(tx);
  }

  async atomicReplace(data) {
    const stores = Object.keys(data);
    if (!stores.length) return;
    const db = await this.dbProvider();
    const tx = db.transaction(stores, 'readwrite');
    for (const store of stores) {
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      for (const value of data[store] || []) putValue(store, objectStore, value);
    }
    await transactionDone(tx);
  }
}

export const repositories = new RepositoryHub();
