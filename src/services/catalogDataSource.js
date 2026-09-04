import { APP_VERSION } from '../db/constants.js';
import { sha256Text } from '../lib/crypto.js';
import { compareSemver } from '../lib/semver.js';
import { assetPath } from '../lib/appBase.js';
import { assertReferenceData, assertSemanticReferences } from './referenceDataService.js';

const catalogUrl = path => assetPath(`/data/${String(path).replace(/^\/+/, '')}`);
const PART_SCHEMAS = {
  taxonomies: 'taxonomy', taxonomyTerms: 'taxonomyTerm', ingredientFamilies: 'ingredient', ingredientRevisions: 'ingredientRevision', recipeFamilies: 'recipe', recipeVersions: 'recipeVersion'
};

export function assertCatalogCompatibility(manifest) {
  const min = manifest.appCompatibility.minVersion;
  const max = manifest.appCompatibility.maxVersion;
  if (compareSemver(APP_VERSION, min) < 0) throw new Error(`Catalog requires app >= ${min}`);
  if (max && compareSemver(APP_VERSION, max) > 0) throw new Error(`Catalog supports app <= ${max}`);
  const ids = new Set();
  let required = 0;
  for (const pack of manifest.packs) {
    if (ids.has(pack.packId)) throw new Error(`Duplicate catalog pack ${pack.packId}`);
    ids.add(pack.packId); if (pack.required) required += 1;
  }
  if (!required) throw new Error('Catalog manifest must define at least one required pack');
}

export async function fetchCatalogManifest({ fetcher = fetch, registry, cache = 'no-cache' } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const response = await fetcher(catalogUrl('catalog-manifest.json'), { cache });
  if (!response.ok) throw new Error(`Unable to fetch catalog manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  registry.assert('catalogManifest', manifest); assertCatalogCompatibility(manifest); return manifest;
}

function shardNeeded(shard, wantedIds) {
  if (!wantedIds) return true;
  if (!Array.isArray(shard.recordIds)) return true;
  return shard.recordIds.some(id => wantedIds.has(id));
}

async function readShard(fetcher, shard, idKey) {
  const response = await fetcher(catalogUrl(shard.path));
  if (!response.ok) throw new Error(`Unable to fetch catalog shard ${shard.path}: HTTP ${response.status}`);
  const text = await response.text();
  const hash = await sha256Text(text);
  if (hash !== shard.sha256) throw new Error(`Checksum mismatch for ${shard.path}`);
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length !== shard.count) throw new Error(`Shard count mismatch for ${shard.path}`);
  if (Array.isArray(shard.recordIds)) {
    const found = new Set(data.map(record => record[idKey]));
    if (shard.recordIds.length !== data.length || shard.recordIds.some(id => !found.has(id))) throw new Error(`recordIds mismatch for ${shard.path}`);
  }
  return data;
}

function idKeyForPart(key) {
  if (key === 'taxonomies') return 'taxonomyId';
  if (key === 'taxonomyTerms') return 'termId';
  return key === 'recipeVersions' ? 'recipeVersionId' : key === 'recipeFamilies' ? 'recipeId' : key === 'ingredientRevisions' ? 'ingredientRevisionId' : 'ingredientId';
}

export async function loadCatalogPart(manifest, key, { fetcher = fetch, registry, wantedIds = null, onShard } = {}) {
  const part = manifest[key]; const schema = PART_SCHEMAS[key]; const idKey = idKeyForPart(key);
  if (!part || !schema) throw new Error(`Unknown catalog part ${key}`);
  const wanted = wantedIds ? new Set(wantedIds) : null;
  const records = [];
  const shards = part.shards.filter(shard => shardNeeded(shard, wanted));
  for (let index = 0; index < shards.length; index += 1) {
    const shard = shards[index]; onShard?.({ key, index, total: shards.length, shard });
    const values = await readShard(fetcher, shard, idKey);
    for (const record of values) {
      registry.assert(schema, record);
      if ((key === 'ingredientRevisions' || key === 'recipeVersions') && record.origin === 'base' && record.catalogVersion && compareSemver(record.catalogVersion, manifest.catalogVersion) > 0) throw new Error(`Catalog record comes from a future catalog version: ${record[idKeyForPart(key)] || shard.path}`);
    }
    records.push(...values);
  }
  if (!wanted) {
    if (records.length !== part.count) throw new Error(`Manifest total mismatch for ${key}`);
    return records;
  }
  const filtered = records.filter(record => wanted.has(record[idKey]));
  const found = new Set(filtered.map(record => record[idKey]));
  const missing = [...wanted].filter(id => !found.has(id));
  if (missing.length) throw new Error(`Catalog part ${key} is missing requested records: ${missing.slice(0, 5).join(', ')}`);
  return filtered;
}

export function validateCatalogReferences({ taxonomies = [], taxonomyTerms = [], ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, packs = [] }, registry = null) {
  let referenceIndex = null;
  if (taxonomies.length || taxonomyTerms.length) referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const revisions = new Set(ingredientRevisions.map(record => record.ingredientRevisionId));
  const ingredients = new Set(ingredientFamilies.map(record => record.ingredientId));
  const recipeVersionIds = new Set(recipeVersions.map(record => record.recipeVersionId));
  const recipeIds = new Set(recipeFamilies.map(record => record.recipeId));
  for (const ingredient of ingredientFamilies) if (!revisions.has(ingredient.currentRevisionId)) throw new Error(`Missing current ingredient revision ${ingredient.currentRevisionId}`);
  for (const recipe of recipeFamilies) {
    if (!recipeVersionIds.has(recipe.currentVersionId)) throw new Error(`Missing current recipe version ${recipe.currentVersionId}`);
    if (!recipeIds.has(recipe.recipeId)) throw new Error(`Missing recipe family ${recipe.recipeId}`);
  }
  for (const version of recipeVersions) {
    if (!recipeIds.has(version.recipeId)) throw new Error(`Missing recipe family ${version.recipeId}`);
    for (const line of version.ingredientLines || []) {
      if (!ingredients.has(line.ingredientId)) throw new Error(`Missing ingredient ${line.ingredientId}`);
      if (!revisions.has(line.ingredientRevisionId)) throw new Error(`Missing ingredient revision ${line.ingredientRevisionId}`);
    }
  }
  for (const pack of packs) for (const id of pack.recipeVersionIds) if (!recipeVersionIds.has(id)) throw new Error(`Pack ${pack.packId} references missing recipe version ${id}`);
  if (referenceIndex) assertSemanticReferences({ index: referenceIndex, ingredientRevisions, recipeVersions, ingredientIds: [...ingredients] });
}

export async function loadCatalogSelection(manifest, recipeVersionIds, options = {}) {
  const recipeVersions = await loadCatalogPart(manifest, 'recipeVersions', { ...options, wantedIds: recipeVersionIds });
  const recipeIds = [...new Set(recipeVersions.map(record => record.recipeId))];
  const referencePromise = manifest.taxonomies && manifest.taxonomyTerms
    ? Promise.all([loadCatalogPart(manifest, 'taxonomies', options), loadCatalogPart(manifest, 'taxonomyTerms', options)])
    : Promise.resolve([[], []]);
  const [[taxonomies, taxonomyTerms], ingredientFamilies, ingredientRevisions, recipeFamilies] = await Promise.all([
    referencePromise,
    loadCatalogPart(manifest, 'ingredientFamilies', options),
    loadCatalogPart(manifest, 'ingredientRevisions', options),
    loadCatalogPart(manifest, 'recipeFamilies', { ...options, wantedIds: recipeIds })
  ]);
  return { taxonomies, taxonomyTerms, ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions };
}
