import { assetPath } from '../lib/appBase.js';
import { repositories } from '../repositories/repositoryHub.js';
import { assertReferenceData, assertSemanticReferences } from './referenceDataService.js';
import { extensionDefaults } from '../domain/productExtensions.js';
import { CLEAN_CATALOG_EPOCH } from '../catalog/cleanCatalogCompiler.js';

const CATALOG_STORES = Object.freeze([
  'taxonomies','taxonomyTerms','ingredients','ingredientRevisions','recipes','recipeVersions','catalogPacks',
  'recipeHumanReviews','foodGroups','ingredientMappings','ingredientConversions'
]);
const PLAN_STORES = Object.freeze(['planInstances','calendarDays','generationRuns','operations','shoppingChecklists']);

function assertArray(catalog, key) { if (!Array.isArray(catalog[key])) throw new Error(`Compiled catalog ${key} must be an array`); }

export function validateCompiledCatalog(catalog, registry) {
  if (!catalog || catalog.schemaVersion !== 1 || !catalog.manifest?.catalogVersion) throw new Error('Invalid compiled clean catalog envelope');
  for (const key of [...CATALOG_STORES]) assertArray(catalog, key);
  for (const item of catalog.taxonomies) registry?.assert('taxonomy', item);
  for (const item of catalog.taxonomyTerms) registry?.assert('taxonomyTerm', item);
  for (const item of catalog.ingredients) registry?.assert('ingredient', item);
  for (const item of catalog.ingredientRevisions) registry?.assert('ingredientRevision', item);
  for (const item of catalog.recipes) registry?.assert('recipe', item);
  for (const item of catalog.recipeVersions) registry?.assert('recipeVersion', item);
  for (const item of catalog.catalogPacks) registry?.assert('catalogPack', item);
  const index = assertReferenceData(catalog.taxonomies, catalog.taxonomyTerms, registry);
  assertSemanticReferences({ index, ingredientRevisions:catalog.ingredientRevisions, recipeVersions:catalog.recipeVersions, ingredientIds:catalog.ingredients.map(item=>item.ingredientId), foodGroups:catalog.foodGroups });
  const revisions = new Map(catalog.ingredientRevisions.map(item=>[item.ingredientRevisionId,item]));
  const families = new Map(catalog.ingredients.map(item=>[item.ingredientId,item]));
  for (const family of catalog.ingredients) if (!revisions.has(family.currentRevisionId)) throw new Error(`Ingredient ${family.ingredientId} points to missing revision ${family.currentRevisionId}`);
  const versions = new Map(catalog.recipeVersions.map(item=>[item.recipeVersionId,item]));
  for (const family of catalog.recipes) if (!versions.has(family.currentVersionId)) throw new Error(`Recipe ${family.recipeId} points to missing version ${family.currentVersionId}`);
  for (const version of catalog.recipeVersions) for (const line of version.ingredientLines || []) {
    if (!families.has(line.ingredientId) || !revisions.has(line.ingredientRevisionId)) throw new Error(`Recipe ${version.recipeVersionId} has missing ingredient reference ${line.ingredientId}/${line.ingredientRevisionId}`);
  }
  return catalog;
}

export async function fetchCompiledCatalog({ fetcher = fetch, registry } = {}) {
  const response = await fetcher(assetPath('/data/catalog.json'), { cache:'no-store' });
  if (!response.ok) throw new Error(`Unable to load clean catalog: HTTP ${response.status}`);
  return validateCompiledCatalog(await response.json(), registry);
}

function catalogData(catalog) {
  return Object.fromEntries(CATALOG_STORES.map(store=>[store, structuredClone(catalog[store] || [])]));
}

function catalogMeta(catalog) {
  return {
    activeCatalogVersion:catalog.manifest.catalogVersion,
    catalogManifest:structuredClone(catalog.manifest),
    referenceDataVersion:catalog.manifest.referenceDataVersion,
    referenceDataDigest:catalog.manifest.referenceDataDigest,
    dataEpoch:CLEAN_CATALOG_EPOCH,
    cleanCatalogSourceDigest:catalog.manifest.sourceDigest,
    'contentMigration:4':{ status:'complete', completedAt:new Date().toISOString(), migrated:0, unresolved:[], source:'clean-catalog' },
    'productExtensions:R8':extensionDefaults()
  };
}

export async function installCompiledCatalog({ repo = repositories, registry, fetcher = fetch, onProgress = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  onProgress?.({ phase:'download', completed:0, total:1, messageKey:'catalog.status.downloading' });
  const catalog = await fetchCompiledCatalog({ fetcher, registry });
  const [epoch, currentVersion] = await Promise.all([repo.getMeta('dataEpoch'), repo.getMeta('activeCatalogVersion')]);
  if (epoch !== CLEAN_CATALOG_EPOCH) {
    onProgress?.({ phase:'install', completed:0, total:1, messageKey:'catalog.status.installing' });
    await repo.resetAll({ data:catalogData(catalog), meta:catalogMeta(catalog) });
    onProgress?.({ phase:'complete', completed:1, total:1, messageKey:'catalog.status.complete' });
    return { installed:true, reset:true, updated:true, catalogVersion:catalog.manifest.catalogVersion, catalog };
  }
  if (currentVersion === catalog.manifest.catalogVersion) {
    onProgress?.({ phase:'complete', completed:1, total:1, messageKey:'catalog.status.complete' });
    return { installed:true, reset:false, updated:false, catalogVersion:currentVersion, catalog };
  }
  onProgress?.({ phase:'install', completed:0, total:1, messageKey:'catalog.status.installing' });
  await repo.atomicReplace({ ...catalogData(catalog), ...Object.fromEntries(PLAN_STORES.map(store=>[store,[]])) }, catalogMeta(catalog));
  await repo.setMeta('activePlanInstanceId', null);
  await repo.setMeta('lastSuccessfulGenerationRunId', null);
  await repo.setMeta('planUpdatedAt', null);
  onProgress?.({ phase:'complete', completed:1, total:1, messageKey:'catalog.status.complete' });
  return { installed:true, reset:false, updated:true, catalogVersion:catalog.manifest.catalogVersion, catalog };
}
