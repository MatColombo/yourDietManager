import { repositories } from '../repositories/repositoryHub.js';

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function tokens(value) { return normalize(value).split(/[^a-z0-9]+/).filter(Boolean); }
function uniqueById(records, key) { const map = new Map(); for (const record of records) map.set(record[key], record); return [...map.values()]; }
function intersect(a, b) { const set = new Set(b); return a.filter(value => set.has(value)); }
function range(lower, upper) {
  if (lower != null && upper != null) return { kind: 'bound', lower, upper };
  if (lower != null) return { kind: 'lower', value: lower };
  if (upper != null) return { kind: 'upper', value: upper };
  return null;
}
function hasIndexedPositiveFilter(filters) {
  return Boolean(tokens(filters.text).length || filters.mealArchetype || filters.origin || filters.energyMin != null || filters.energyMax != null || filters.proteinMin != null || filters.fiberMin != null || filters.prepMax != null);
}
function matchesProductFood(revision, termId) {
  if (!termId) return true;
  const product = revision?.productTaxonomy;
  return Boolean(product && [product.categoryId, product.subcategoryId, product.conceptId].includes(termId));
}

export class CatalogQueryService {
  constructor({ repo = repositories } = {}) {
    this.repo = repo;
    this.lastQueryDiagnostics = null;
  }

  async installedPackState(packId = '') {
    const version = await this.repo.getMeta('activeCatalogVersion');
    if (!version) return { version: null, ids: [], pack: null };
    const packs = await this.repo.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: version });
    const installed = packs.filter(pack => pack.status === 'installed' && (!packId || pack.packId === packId));
    const ids = [...new Set(installed.flatMap(pack => pack.recipeVersionIds))];
    return { version, ids, pack: packId ? installed[0] || null : null };
  }

  async installedRecipeVersionIds() {
    return new Set((await this.installedPackState()).ids);
  }

  async currentUserVersionIds() {
    const families = await this.repo.getAllByIndex('recipes', 'originAndStatus', { kind: 'only', value: ['user', 'active'] });
    return families.map(family => family.currentVersionId);
  }

  async browsableVersionIds(packId = '') {
    const base = await this.installedPackState(packId);
    if (packId) return [...new Set(base.ids)];
    const userFamilies = await this.repo.getAllByIndex('recipes', 'originAndStatus', { kind: 'only', value: ['user', 'active'] });
    const baseIds = new Set(base.ids);
    // When a bundled recipe is edited, its stable family ID is promoted to local
    // management. Remove historical installed base versions of that same family
    // so browse/search expose only the current local version.
    for (const family of userFamilies) {
      const history = await this.repo.getAllByIndex('recipeVersions', 'recipeId', { kind: 'only', value: family.recipeId });
      for (const version of history) if (version.origin === 'base') baseIds.delete(version.recipeVersionId);
    }
    return [...new Set([...baseIds, ...userFamilies.map(family => family.currentVersionId)])];
  }

  async seed(filters) {
    const candidates = [];
    const textTokens = tokens(filters.text);
    for (const token of textTokens) {
      const matches = await this.repo.getAllByIndex('recipeVersions', 'searchTokens', { kind: 'bound', lower: token, upper: `${token}\uffff` });
      candidates.push(matches);
    }
    if (filters.mealArchetype) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'mealArchetypes', { kind: 'only', value: filters.mealArchetype }));
    if (filters.origin) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'origin', { kind: 'only', value: filters.origin }));
    if (filters.energyMin != null || filters.energyMax != null) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'calculatedNutrition.energyKcal', range(filters.energyMin, filters.energyMax)));
    if (filters.proteinMin != null) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'calculatedNutrition.proteinG', range(filters.proteinMin, null)));
    if (filters.fiberMin != null) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'calculatedNutrition.fiberG', range(filters.fiberMin, null)));
    if (filters.prepMax != null) candidates.push(await this.repo.getAllByIndex('recipeVersions', 'practical.prepMinutes', range(null, filters.prepMax)));
    if (!candidates.length) return [];
    candidates.sort((a, b) => a.length - b.length);
    let ids = candidates[0].map(record => record.recipeVersionId);
    for (const list of candidates.slice(1)) ids = intersect(ids, list.map(record => record.recipeVersionId));
    const map = new Map(candidates.flat().map(record => [record.recipeVersionId, record]));
    return ids.map(id => map.get(id)).filter(Boolean);
  }

  async fastBrowse(clean, offset, limit) {
    const ids = await this.browsableVersionIds(clean.packId);
    const total = ids.length;
    const pageIds = ids.slice(offset, offset + limit);
    const items = await this.repo.getMany('recipeVersions', pageIds);
    const byId = new Map(items.map(item => [item.recipeVersionId, item]));
    this.lastQueryDiagnostics = { strategy: 'bounded-id-page', totalIds: total, loadedRecipeVersions: items.length, offset, limit };
    return { total, items: pageIds.map(id => byId.get(id)).filter(Boolean), offset, limit };
  }

  async fallbackBrowsableScan(clean) {
    const ids = await this.browsableVersionIds(clean.packId);
    const rows = [];
    const chunkSize = 500;
    for (let index = 0; index < ids.length; index += chunkSize) rows.push(...await this.repo.getMany('recipeVersions', ids.slice(index, index + chunkSize)));
    this.lastQueryDiagnostics = { strategy: 'bounded-id-scan', totalIds: ids.length, loadedRecipeVersions: rows.length, chunkSize };
    return rows;
  }

  async searchRecipes(filters = {}) {
    const clean = {
      text: filters.text || '', mealArchetype: filters.mealArchetype || '', origin: filters.origin || '', packId: filters.packId || '',
      energyMin: filters.energyMin == null || filters.energyMin === '' ? null : Number(filters.energyMin),
      energyMax: filters.energyMax == null || filters.energyMax === '' ? null : Number(filters.energyMax),
      proteinMin: filters.proteinMin == null || filters.proteinMin === '' ? null : Number(filters.proteinMin),
      fiberMin: filters.fiberMin == null || filters.fiberMin === '' ? null : Number(filters.fiberMin),
      prepMax: filters.prepMax == null || filters.prepMax === '' ? null : Number(filters.prepMax),
      productFoodId: filters.productFoodId || '', dietTag: filters.dietTag || '', practicalTag: filters.practicalTag || '',
      excludeAllergens: new Set(filters.excludeAllergens || [])
    };
    const offset = Math.max(0, Number(filters.offset || 0));
    const limit = Math.min(100, Math.max(1, Number(filters.limit || 50)));
    const onlyPackOrNoFilters = !hasIndexedPositiveFilter(clean) && clean.excludeAllergens.size === 0 && !clean.productFoodId && !clean.dietTag && !clean.practicalTag;
    if (onlyPackOrNoFilters) return this.fastBrowse(clean, offset, limit);

    const installed = await this.installedRecipeVersionIds();
    const packIds = clean.packId ? new Set((await this.installedPackState(clean.packId)).ids) : null;
    let seeded = hasIndexedPositiveFilter(clean) ? await this.seed(clean) : await this.fallbackBrowsableScan(clean);
    if (hasIndexedPositiveFilter(clean)) this.lastQueryDiagnostics = { strategy: 'indexed-intersection', loadedRecipeVersions: seeded.length };
    let versions = uniqueById(seeded, 'recipeVersionId');
    const families = new Map((await this.repo.getMany('recipes', [...new Set(versions.map(version => version.recipeId))])).map(record => [record.recipeId, record]));
    let ingredientRevisionById = null;
    if (clean.productFoodId) {
      const revisionIds = [...new Set(versions.flatMap(version => version.ingredientLines.map(line => line.ingredientRevisionId)))];
      const ingredientRevisions = await this.repo.getMany('ingredientRevisions', revisionIds);
      ingredientRevisionById = new Map(ingredientRevisions.map(revision => [revision.ingredientRevisionId, revision]));
    }
    versions = versions.filter(version => {
      const family = families.get(version.recipeId);
      if (!family || family.status !== 'active' || family.currentVersionId !== version.recipeVersionId) return false;
      if (version.origin === 'base' && !installed.has(version.recipeVersionId)) return false;
      if (packIds && !packIds.has(version.recipeVersionId)) return false;
      if (clean.excludeAllergens.size && version.allergenIds.some(id => clean.excludeAllergens.has(id))) return false;
      if (clean.mealArchetype && !version.mealArchetypes.includes(clean.mealArchetype)) return false;
      if (clean.origin && version.origin !== clean.origin) return false;
      const n = version.calculatedNutrition;
      if (clean.energyMin != null && n.energyKcal < clean.energyMin) return false;
      if (clean.energyMax != null && n.energyKcal > clean.energyMax) return false;
      if (clean.proteinMin != null && n.proteinG < clean.proteinMin) return false;
      if (clean.fiberMin != null && n.fiberG < clean.fiberMin) return false;
      if (clean.prepMax != null && version.practical.prepMinutes > clean.prepMax) return false;
      if (clean.dietTag && !(version.tags?.diet || []).includes(clean.dietTag)) return false;
      if (clean.practicalTag && !(version.tags?.practical || []).includes(clean.practicalTag)) return false;
      if (clean.productFoodId && !version.ingredientLines.some(line => matchesProductFood(ingredientRevisionById?.get(line.ingredientRevisionId), clean.productFoodId))) return false;
      return true;
    });
    versions.sort((a, b) => (a.i18n.it?.title || '').localeCompare(b.i18n.it?.title || ''));
    return { total: versions.length, items: versions.slice(offset, offset + limit), offset, limit };
  }

  async resolveRecipe(recipeId, recipeVersionId = null) {
    const family = await this.repo.get('recipes', recipeId); if (!family) return null;
    const versionId = recipeVersionId || family.currentVersionId; const version = await this.repo.get('recipeVersions', versionId); if (!version || version.recipeId !== recipeId) return null;
    const revisions = await this.repo.getMany('ingredientRevisions', version.ingredientLines.map(line => line.ingredientRevisionId));
    const byId = new Map(revisions.map(record => [record.ingredientRevisionId, record]));
    const installed = family.origin === 'user' ? true : (await this.installedRecipeVersionIds()).has(version.recipeVersionId);
    return { family, version, installed, ingredientLines: version.ingredientLines.map(line => ({ ...line, ingredientRevision: byId.get(line.ingredientRevisionId) || null })) };
  }


  async recipeHistory(recipeId) {
    const rows = await this.repo.getAllByIndex('recipeVersions', 'recipeId', { kind: 'only', value: recipeId });
    return rows.sort((a, b) => b.versionNumber - a.versionNumber || b.createdAt.localeCompare(a.createdAt));
  }

  async resolveIngredient(ingredientId, ingredientRevisionId = null) {
    const family = await this.repo.get('ingredients', ingredientId); if (!family) return null;
    const revisionId = ingredientRevisionId || family.currentRevisionId;
    const revision = await this.repo.get('ingredientRevisions', revisionId); if (!revision || revision.ingredientId !== ingredientId) return null;
    return { family, revision };
  }

  async ingredientHistory(ingredientId) {
    const rows = await this.repo.getAllByIndex('ingredientRevisions', 'ingredientId', { kind: 'only', value: ingredientId });
    return rows.sort((a, b) => b.revisionNumber - a.revisionNumber || b.createdAt.localeCompare(a.createdAt));
  }

  async listCurrentIngredients({ text = '', origin = '', foodGroup = '', productFoodId = '', state = '' } = {}) {
    let families = origin ? await this.repo.getAllByIndex('ingredients', 'origin', { kind: 'only', value: origin }) : await this.repo.getAll('ingredients');
    families = families.filter(record => record.status === 'active');
    const revisions = new Map((await this.repo.getMany('ingredientRevisions', families.map(record => record.currentRevisionId))).map(record => [record.ingredientRevisionId, record]));
    const terms = tokens(text);
    return families.map(family => ({ family, revision: revisions.get(family.currentRevisionId) })).filter(item => {
      if (!item.revision) return false;
      if (foodGroup && item.revision.taxonomy.foodGroup !== foodGroup) return false;
      if (productFoodId && !matchesProductFood(item.revision, productFoodId)) return false;
      if (state && item.revision.basis?.state !== state) return false;
      if (!terms.length) return true;
      const product = item.revision.productTaxonomy || {};
      const haystack = normalize(`${Object.values(item.revision.i18n).flatMap(value => [value.name, ...(value.aliases || [])]).join(' ')} ${product.categoryId || ''} ${product.subcategoryId || ''} ${product.conceptId || ''}`);
      return terms.every(term => haystack.includes(term));
    }).sort((a, b) => (a.revision.i18n.it?.name || '').localeCompare(b.revision.i18n.it?.name || ''));
  }

  async productFoodFacetsForRecipes(recipeVersions = []) {
    const revisionIds = [...new Set((recipeVersions || []).flatMap(version => (version.ingredientLines || []).map(line => line.ingredientRevisionId)))];
    const revisions = await this.repo.getMany('ingredientRevisions', revisionIds);
    const byId = new Map(revisions.map(revision => [revision.ingredientRevisionId, revision]));
    const result = new Map();
    for (const recipe of recipeVersions || []) {
      const categoryIds = new Set(); const subcategoryIds = new Set(); const conceptIds = new Set();
      for (const line of recipe.ingredientLines || []) {
        const product = byId.get(line.ingredientRevisionId)?.productTaxonomy;
        if (!product) continue;
        if (product.categoryId) categoryIds.add(product.categoryId);
        if (product.subcategoryId) subcategoryIds.add(product.subcategoryId);
        if (product.conceptId) conceptIds.add(product.conceptId);
      }
      result.set(recipe.recipeVersionId, { categoryIds: [...categoryIds], subcategoryIds: [...subcategoryIds], conceptIds: [...conceptIds] });
    }
    return result;
  }
}
