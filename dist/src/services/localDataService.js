import { repositories } from '../repositories/repositoryHub.js';

function clearOwnedLocalStorage(storage) {
  if (!storage?.length || !storage?.key || !storage?.removeItem) return [];
  const keys=[];
  for (let index=0; index<storage.length; index+=1) {
    const key=storage.key(index);
    if (key?.startsWith('ydm:')) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys;
}

async function clearOwnedCaches(cacheStorage) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const names=await cacheStorage.keys();
  const owned=names.filter(name => /^ydm-(?:shell|data)-/i.test(name));
  await Promise.all(owned.map(name => cacheStorage.delete(name)));
  return owned;
}

export async function deleteAllLocalData({ repo=repositories, localStorage=globalThis.localStorage, cacheStorage=globalThis.caches, clearPublicCaches=false }={}) {
  await repo.resetAll();
  const localStorageKeys=clearOwnedLocalStorage(localStorage);
  const cacheNames=clearPublicCaches ? await clearOwnedCaches(cacheStorage).catch(() => []) : [];
  return { deleted:true, localStorageKeys, cacheNames, publicCachesPreserved:!clearPublicCaches };
}
