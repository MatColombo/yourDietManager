import { DB_NAME, DB_VERSION, STORE_DEFINITIONS } from './constants.js';

let databasePromise = null;

function ensureIndexes(store, indexes) {
  for (const index of indexes) {
    if (store.indexNames.contains(index.name)) continue;
    store.createIndex(index.name, index.keyPath, index.options || {});
  }
}

export function applyStructuralUpgrade(db, transaction, definitions = STORE_DEFINITIONS) {
  for (const [name, definition] of Object.entries(definitions)) {
    let store;
    if (!db.objectStoreNames.contains(name)) {
      store = definition.keyPath === undefined
        ? db.createObjectStore(name)
        : db.createObjectStore(name, { keyPath: definition.keyPath });
    } else {
      store = transaction.objectStore(name);
    }
    ensureIndexes(store, definition.indexes);
  }
}

export function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.reject(new Error('IndexedDB is not available in this environment'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Unable to open IndexedDB'));
    request.onblocked = () => console.warn('IndexedDB upgrade blocked by another tab');
    request.onupgradeneeded = () => applyStructuralUpgrade(request.result, request.transaction);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
  });
  return databasePromise;
}

export async function closeDatabase() {
  if (!databasePromise) return;
  const db = await databasePromise;
  db.close();
  databasePromise = null;
}
