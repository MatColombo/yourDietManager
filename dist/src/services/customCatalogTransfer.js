import { recipeTextV2, recipeTitleFromIngredients } from '../domain/recipePresentation.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json } from '../lib/crypto.js';

const FORMAT = 'yourDietManager-custom-catalog';
const FORMAT_VERSION = 2;
function userOnly(records) { return records.filter(record => record.origin === 'user'); }

export async function createCustomCatalogExport({ repo = repositories } = {}) {
  const families = userOnly(await repo.getAll('recipes'));
  const revisions = await repo.getAll('ingredientRevisions'); const byId = new Map(revisions.map(r => [r.ingredientRevisionId, r]));
  const index = await loadReferenceDataIndex(repo); const versions = [];
  for (const family of families) {
    const source = await repo.get('recipeVersions', family.currentVersionId);
    if (!source) throw new Error('Missing current personal recipe');
    if (source.schemaVersion === 2) { versions.push(source); continue; }
    const version = structuredClone(source); const used = version.ingredientLines.map(line => byId.get(line.ingredientRevisionId));
    if (used.some(r => !r)) throw new Error('Missing frozen ingredient');
    version.schemaVersion = 2; version.recipeVersionId += '_export_r2'; version.versionNumber++; version.supersedesVersionId = source.recipeVersionId;
    version.i18n = recipeTextV2({}, { titleIt: recipeTitleFromIngredients(used, index, 'it'), titleEn: recipeTitleFromIngredients(used, index, 'en') });
    version.practical = { ...version.practical, finalWeightG: null, finalVolumeMl: null, yieldNotes: null };
    version.practicalEvidence = { status: 'unverified', sourceRef: `legacy:${source.recipeVersionId}` };
    version.searchTokens = Object.values(version.i18n).flatMap(t => t.title.toLowerCase().split(/\s+/));
    version.contentHash = ''; version.contentHash = await sha256Json(version); versions.push(version); family.currentVersionId = version.recipeVersionId;
  }
  const ingredients = userOnly(await repo.getAll('ingredients'));
  const wanted = new Set([...ingredients.map(i => i.currentRevisionId), ...versions.flatMap(v => v.ingredientLines.map(l => l.ingredientRevisionId))]);
  const document = {
    format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString(),
    payload: { ingredients, ingredientRevisions: userOnly(revisions).filter(r => wanted.has(r.ingredientRevisionId)), recipes: families, recipeVersions: versions }, sha256: null
  };
  document.sha256 = await sha256Json({ ...document, sha256: null }); return document;
}

export async function validateCustomCatalogExport(document, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (!document || document.format !== FORMAT || ![1, FORMAT_VERSION].includes(document.formatVersion)) throw new Error('Unsupported personal catalog document');
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
      const next = incoming.get(record[key]);
      const familyStore = store === 'ingredients' || store === 'recipes';
      if (record.origin !== 'user' && !familyStore) throw new Error(`Personal catalog immutable ID collides with base record ${record[key]}`);
      // A locally managed family may intentionally replace the base family pointer
      // with the same stable family ID. Immutable revisions/versions still never
      // overwrite base records.
      if ((store === 'ingredientRevisions' || store === 'recipeVersions') && record.contentHash !== next.contentHash) throw new Error(`Immutable personal record collision ${record[key]}`);
    }
  }
  await repo.atomicPut({ ingredients: payload.ingredients || [], ingredientRevisions: payload.ingredientRevisions || [], recipes: payload.recipes || [], recipeVersions: payload.recipeVersions || [] });
  await repo.setMeta('customCatalogImportedAt', new Date().toISOString()); return valid;
}
