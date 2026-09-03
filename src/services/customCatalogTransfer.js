import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json } from '../lib/crypto.js';

const FORMAT = 'yourDietManager-custom-catalog';
const FORMAT_VERSION = 1;
function userOnly(records) { return records.filter(record => record.origin === 'user'); }

export async function createCustomCatalogExport({ repo = repositories } = {}) {
  const document = {
    format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString(),
    payload: {
      ingredients: userOnly(await repo.getAll('ingredients')),
      ingredientRevisions: userOnly(await repo.getAll('ingredientRevisions')),
      recipes: userOnly(await repo.getAll('recipes')),
      recipeVersions: userOnly(await repo.getAll('recipeVersions'))
    }, sha256: null
  };
  document.sha256 = await sha256Json({ ...document, sha256: null }); return document;
}

export async function validateCustomCatalogExport(document, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (!document || document.format !== FORMAT || document.formatVersion !== FORMAT_VERSION) throw new Error('Unsupported personal catalog document');
  const expected = await sha256Json({ ...document, sha256: null }); if (document.sha256 !== expected) throw new Error('Personal catalog checksum mismatch');
  const payload = document.payload || {};
  for (const record of payload.ingredients || []) { registry.assert('ingredient', record); if (record.origin !== 'user') throw new Error('Personal catalog contains a base ingredient'); }
  for (const record of payload.ingredientRevisions || []) { registry.assert('ingredientRevision', record); if (record.origin !== 'user') throw new Error('Personal catalog contains a base ingredient revision'); }
  for (const record of payload.recipes || []) { registry.assert('recipe', record); if (record.origin !== 'user') throw new Error('Personal catalog contains a base recipe'); }
  for (const record of payload.recipeVersions || []) { registry.assert('recipeVersion', record); if (record.origin !== 'user') throw new Error('Personal catalog contains a base recipe version'); }
  const importedRevisionIds = new Set((payload.ingredientRevisions || []).map(record => record.ingredientRevisionId));
  const availableRevisionIds = new Set([...(await repo.getAll('ingredientRevisions')).map(record => record.ingredientRevisionId), ...importedRevisionIds]);
  for (const family of payload.ingredients || []) if (!availableRevisionIds.has(family.currentRevisionId)) throw new Error(`Missing imported ingredient revision ${family.currentRevisionId}`);
  const importedVersionIds = new Set((payload.recipeVersions || []).map(record => record.recipeVersionId));
  for (const family of payload.recipes || []) if (!importedVersionIds.has(family.currentVersionId) && !(await repo.get('recipeVersions', family.currentVersionId))) throw new Error(`Missing imported recipe version ${family.currentVersionId}`);
  for (const version of payload.recipeVersions || []) for (const line of version.ingredientLines) if (!availableRevisionIds.has(line.ingredientRevisionId)) throw new Error(`Recipe references unavailable ingredient revision ${line.ingredientRevisionId}`);
  return document;
}

export async function importCustomCatalogExport(document, { repo = repositories, registry } = {}) {
  const valid = await validateCustomCatalogExport(document, { repo, registry }); const payload = valid.payload;
  const collisionChecks = [
    ['ingredients', payload.ingredients || [], 'ingredientId'], ['ingredientRevisions', payload.ingredientRevisions || [], 'ingredientRevisionId'],
    ['recipes', payload.recipes || [], 'recipeId'], ['recipeVersions', payload.recipeVersions || [], 'recipeVersionId']
  ];
  for (const [store, records, key] of collisionChecks) {
    const existing = await repo.getMany(store, records.map(record => record[key]));
    const incoming = new Map(records.map(record => [record[key], record]));
    for (const record of existing) {
      if (record.origin !== 'user') throw new Error(`Personal catalog ID collides with base record ${record[key]}`);
      const next = incoming.get(record[key]);
      if ((store === 'ingredientRevisions' || store === 'recipeVersions') && record.contentHash !== next.contentHash) throw new Error(`Immutable personal record collision ${record[key]}`);
    }
  }
  await repo.atomicPut({ ingredients: payload.ingredients || [], ingredientRevisions: payload.ingredientRevisions || [], recipes: payload.recipes || [], recipeVersions: payload.recipeVersions || [] });
  await repo.setMeta('customCatalogImportedAt', new Date().toISOString()); return valid;
}
