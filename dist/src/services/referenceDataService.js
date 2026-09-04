import { sha256Json } from '../lib/crypto.js';
import { MEAL_ARCHETYPES } from '../domain/configurationRules.js';

export const TAXONOMY_IDS = Object.freeze({
  foodCategory: 'food_category',
  cuisine: 'cuisine',
  recipeFamily: 'recipe_family',
  dietTag: 'diet_tag',
  practicalTag: 'practical_tag',
  flavorProfile: 'flavor_profile',
  preparationTechnique: 'preparation_technique'
});

export const RECIPE_TAG_TAXONOMY = Object.freeze({
  families: TAXONOMY_IDS.recipeFamily,
  cuisines: TAXONOMY_IDS.cuisine,
  diet: TAXONOMY_IDS.dietTag,
  flavor: TAXONOMY_IDS.flavorProfile,
  practical: TAXONOMY_IDS.practicalTag,
  preparation: TAXONOMY_IDS.preparationTechnique
});

const GENERIC_RECIPE_TAG_TAXONOMIES = Object.freeze(Object.values(RECIPE_TAG_TAXONOMY));

function normalizeLookup(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
}
function unique(values) { return [...new Set(values)]; }
function clone(value) { return structuredClone(value); }

export class ReferenceDataIndex {
  constructor(taxonomies = [], terms = []) {
    this.taxonomies = new Map(taxonomies.map(item => [item.taxonomyId, item]));
    this.terms = new Map(terms.map(item => [item.termId, item]));
    this.byTaxonomy = new Map();
    this.children = new Map();
    this.lookupByTaxonomy = new Map();
    for (const term of terms) {
      if (!this.byTaxonomy.has(term.taxonomyId)) this.byTaxonomy.set(term.taxonomyId, []);
      this.byTaxonomy.get(term.taxonomyId).push(term);
      if (term.parentTermId) {
        if (!this.children.has(term.parentTermId)) this.children.set(term.parentTermId, []);
        this.children.get(term.parentTermId).push(term.termId);
      }
      if (!this.lookupByTaxonomy.has(term.taxonomyId)) this.lookupByTaxonomy.set(term.taxonomyId, new Map());
      const lookup = this.lookupByTaxonomy.get(term.taxonomyId);
      const keys = [term.termId, term.i18n?.it?.label, term.i18n?.en?.label, ...(term.aliases?.it || []), ...(term.aliases?.en || []), ...(term.legacyKeys || [])].filter(Boolean);
      for (const key of keys) {
        const normalized = normalizeLookup(key);
        if (!normalized) continue;
        const existing = lookup.get(normalized);
        if (existing && existing !== term.termId) throw new Error(`Ambiguous reference key ${key} in taxonomy ${term.taxonomyId}`);
        lookup.set(normalized, term.termId);
      }
    }
  }

  taxonomy(id) { return this.taxonomies.get(id) || null; }
  term(id) { return this.terms.get(id) || null; }
  resolveLegacy(taxonomyId, value) {
    if (value === null || value === undefined || value === '') return null;
    const term = this.term(value);
    if (term && term.taxonomyId === taxonomyId) return term.termId;
    return this.lookupByTaxonomy.get(taxonomyId)?.get(normalizeLookup(value)) || null;
  }
  resolveLegacyAcross(taxonomyIds, value) {
    const matches = unique(taxonomyIds.map(id => this.resolveLegacy(id, value)).filter(Boolean));
    return matches.length === 1 ? matches[0] : null;
  }
  assertTerm(termId, taxonomyId, { allowDeprecated = false } = {}) {
    const term = this.term(termId);
    if (!term) throw new Error(`Unknown reference-data term ${termId}`);
    if (term.taxonomyId !== taxonomyId) throw new Error(`Reference-data term ${termId} belongs to ${term.taxonomyId}, expected ${taxonomyId}`);
    if (!allowDeprecated && term.status !== 'active') throw new Error(`Reference-data term ${termId} is deprecated`);
    return term;
  }
  isDescendantOrSelf(termId, ancestorId) {
    let current = this.term(termId);
    const seen = new Set();
    while (current) {
      if (current.termId === ancestorId) return true;
      if (!current.parentTermId || seen.has(current.termId)) return false;
      seen.add(current.termId); current = this.term(current.parentTermId);
    }
    return false;
  }
}

export function referenceDataDiagnostics(taxonomies, terms, registry = null) {
  const errors = [];
  const push = message => errors.push(message);
  const taxonomyIds = new Set();
  const termIds = new Set();
  for (const taxonomy of taxonomies || []) {
    try { registry?.assert('taxonomy', taxonomy); } catch (error) { push(error.message); }
    if (taxonomyIds.has(taxonomy.taxonomyId)) push(`Duplicate taxonomyId ${taxonomy.taxonomyId}`);
    taxonomyIds.add(taxonomy.taxonomyId);
  }
  for (const term of terms || []) {
    try { registry?.assert('taxonomyTerm', term); } catch (error) { push(error.message); }
    if (termIds.has(term.termId)) push(`Duplicate termId ${term.termId}`);
    termIds.add(term.termId);
    if (!taxonomyIds.has(term.taxonomyId)) push(`Term ${term.termId} references missing taxonomy ${term.taxonomyId}`);
  }
  const byId = new Map((terms || []).map(term => [term.termId, term]));
  for (const term of terms || []) {
    if (term.parentTermId) {
      const parent = byId.get(term.parentTermId);
      if (!parent) push(`Term ${term.termId} references missing parent ${term.parentTermId}`);
      else if (parent.taxonomyId !== term.taxonomyId) push(`Term ${term.termId} parent belongs to another taxonomy`);
      const taxonomy = (taxonomies || []).find(item => item.taxonomyId === term.taxonomyId);
      if (taxonomy && !taxonomy.hierarchical) push(`Non-hierarchical taxonomy ${term.taxonomyId} cannot contain parented terms`);
    }
    if (term.supersedesTermId) {
      const old = byId.get(term.supersedesTermId);
      if (!old) push(`Term ${term.termId} supersedes missing term ${term.supersedesTermId}`);
      else if (old.taxonomyId !== term.taxonomyId) push(`Term ${term.termId} supersedes a term from another taxonomy`);
    }
  }
  for (const term of terms || []) {
    const seen = new Set([term.termId]); let current = term;
    while (current?.parentTermId) {
      if (seen.has(current.parentTermId)) { push(`Taxonomy cycle detected at ${term.termId}`); break; }
      seen.add(current.parentTermId); current = byId.get(current.parentTermId);
      if (!current) break;
    }
  }
  for (const taxonomy of taxonomies || []) {
    const lookup = new Map();
    for (const term of (terms || []).filter(item => item.taxonomyId === taxonomy.taxonomyId && item.status === 'active')) {
      const values = [term.i18n?.it?.label, term.i18n?.en?.label, ...(term.aliases?.it || []), ...(term.aliases?.en || []), ...(term.legacyKeys || [])].filter(Boolean);
      for (const value of values) {
        const key = normalizeLookup(value); const existing = lookup.get(key);
        if (existing && existing !== term.termId) push(`Ambiguous normalized label/alias ${value} in taxonomy ${taxonomy.taxonomyId}: ${existing}, ${term.termId}`);
        else lookup.set(key, term.termId);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertReferenceData(taxonomies, terms, registry = null) {
  const result = referenceDataDiagnostics(taxonomies, terms, registry);
  if (!result.valid) throw new Error(`Reference-data validation failed: ${result.errors.slice(0, 12).join('; ')}`);
  return new ReferenceDataIndex(taxonomies, terms);
}

export async function loadReferenceDataIndex(repo) {
  return assertReferenceData(await repo.getAll('taxonomies'), await repo.getAll('taxonomyTerms'));
}

export async function referenceDataDigest(taxonomies, terms) {
  const canonical = {
    taxonomies: [...taxonomies].sort((a, b) => a.taxonomyId.localeCompare(b.taxonomyId)),
    terms: [...terms].sort((a, b) => a.termId.localeCompare(b.termId))
  };
  return sha256Json(canonical);
}

function assertTagSet(index, values, taxonomyId, path, errors) {
  for (const id of values || []) {
    try { index.assertTerm(id, taxonomyId); } catch (error) { errors.push(`${path}: ${error.message}`); }
  }
}

export function semanticReferenceDiagnostics({ index, ingredientRevisions = [], recipeVersions = [], configuration = null, ingredientIds = [] }) {
  const errors = [];
  const ingredientSet = new Set(ingredientIds);
  for (const revision of ingredientRevisions) {
    const base = `ingredientRevision:${revision.ingredientRevisionId}`;
    try { index.assertTerm(revision.taxonomy?.foodGroup, TAXONOMY_IDS.foodCategory); } catch (error) { errors.push(`${base}.taxonomy.foodGroup: ${error.message}`); }
    if (revision.taxonomy?.foodSubgroup) {
      try {
        const subgroup = index.assertTerm(revision.taxonomy.foodSubgroup, TAXONOMY_IDS.foodCategory);
        if (subgroup.parentTermId !== revision.taxonomy.foodGroup) errors.push(`${base}.taxonomy.foodSubgroup: parent must equal foodGroup`);
      } catch (error) { errors.push(`${base}.taxonomy.foodSubgroup: ${error.message}`); }
    }
    try { index.assertTerm(revision.taxonomy?.flavorProfile, TAXONOMY_IDS.flavorProfile); } catch (error) { errors.push(`${base}.taxonomy.flavorProfile: ${error.message}`); }
    if (!revision.taxonomy?.mealArchetypes?.length) errors.push(`${base}.taxonomy.mealArchetypes: at least one MealArchetype is required`);
  }
  for (const recipe of recipeVersions) {
    const base = `recipeVersion:${recipe.recipeVersionId}`;
    if (!recipe.mealArchetypes?.length) errors.push(`${base}.mealArchetypes: at least one MealArchetype is required`);
    for (const [key, taxonomyId] of Object.entries(RECIPE_TAG_TAXONOMY)) assertTagSet(index, recipe.tags?.[key], taxonomyId, `${base}.tags.${key}`, errors);
  }
  if (configuration) {
    for (const prefs of configuration.foodPreferences || []) for (const rule of prefs.rules || []) {
      const path = `foodPreferences:${prefs.id}.rule:${rule.id}`;
      try {
        if (rule.targetType === 'foodCategory') index.assertTerm(rule.targetId, TAXONOMY_IDS.foodCategory);
        else if (rule.targetType === 'cuisine') index.assertTerm(rule.targetId, TAXONOMY_IDS.cuisine);
        else if (rule.targetType === 'recipeTag') {
          if (!index.resolveLegacyAcross(GENERIC_RECIPE_TAG_TAXONOMIES, rule.targetId) && !GENERIC_RECIPE_TAG_TAXONOMIES.some(id => { try { index.assertTerm(rule.targetId, id); return true; } catch { return false; } })) throw new Error(`Unknown recipe tag ${rule.targetId}`);
        } else if (rule.targetType === 'ingredient' && ingredientSet.size && !ingredientSet.has(rule.targetId)) throw new Error(`Unknown ingredient ${rule.targetId}`);
      } catch (error) { errors.push(`${path}: ${error.message}`); }
    }
    for (const profile of configuration.allergyIntoleranceProfiles || []) for (const rule of profile.rules || []) {
      const path = `allergyIntoleranceProfile:${profile.id}.rule:${rule.id}`;
      try {
        if (rule.targetType === 'foodCategory') index.assertTerm(rule.targetId, TAXONOMY_IDS.foodCategory);
        else if (rule.targetType === 'ingredient' && ingredientSet.size && !ingredientSet.has(rule.targetId)) throw new Error(`Unknown ingredient ${rule.targetId}`);
      } catch (error) { errors.push(`${path}: ${error.message}`); }
    }
    for (const meal of configuration.mealClasses || []) for (const [i, rule] of (meal.rules || []).entries()) {
      const path = `mealClass:${meal.id}.rules[${i}]`;
      try {
        if (rule.ruleType === 'foodCategory') index.assertTerm(rule.target, TAXONOMY_IDS.foodCategory);
        else if (rule.ruleType === 'flavor') index.assertTerm(rule.target, TAXONOMY_IDS.flavorProfile);
        else if (rule.ruleType === 'tag') {
          const matches = GENERIC_RECIPE_TAG_TAXONOMIES.filter(id => { try { index.assertTerm(rule.target, id); return true; } catch { return false; } });
          if (matches.length !== 1) throw new Error(`Recipe tag ${rule.target} must resolve to exactly one taxonomy`);
        } else if (rule.ruleType === 'ingredient' && ingredientSet.size && !ingredientSet.has(rule.target)) throw new Error(`Unknown ingredient ${rule.target}`);
      } catch (error) { errors.push(`${path}: ${error.message}`); }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertSemanticReferences(args) {
  const result = semanticReferenceDiagnostics(args);
  if (!result.valid) throw new Error(`Semantic reference validation failed: ${result.errors.slice(0, 12).join('; ')}`);
  return result;
}

function migrationStatus(index, taxonomyId, value, resolved) {
  if (!resolved) return 'unresolved';
  if (String(value) === resolved) return 'resolved_exact';
  const term = index.term(resolved);
  const legacy = new Set([...(term?.legacyKeys || []), ...(term?.aliases?.it || []), ...(term?.aliases?.en || []), term?.i18n?.it?.label, term?.i18n?.en?.label].filter(Boolean).map(normalizeLookup));
  return legacy.has(normalizeLookup(value)) ? 'resolved_alias' : 'resolved_manual';
}
function recordMapping(mappings, path, value, resolved, taxonomyId, status = null) {
  mappings.push({ path, sourceValue: value, resolvedTermId: resolved || null, taxonomyId, status: status || (resolved ? 'resolved_manual' : 'unresolved') });
}
function migrateValue(index, taxonomyId, value, path, unresolved, mappings) {
  if (value === null || value === undefined || value === '') return null;
  const resolved = index.resolveLegacy(taxonomyId, value);
  const status = migrationStatus(index, taxonomyId, value, resolved);
  recordMapping(mappings, path, value, resolved, taxonomyId, status);
  if (!resolved) { unresolved.push({ path, value, taxonomyId }); return value; }
  return resolved;
}
function migrateGenericTag(index, value, path, unresolved, mappings) {
  const matches = GENERIC_RECIPE_TAG_TAXONOMIES.map(taxonomyId => ({ taxonomyId, termId: index.resolveLegacy(taxonomyId, value) })).filter(item => item.termId);
  if (matches.length !== 1) {
    unresolved.push({ path, value, taxonomyIds: GENERIC_RECIPE_TAG_TAXONOMIES });
    recordMapping(mappings, path, value, null, null, 'unresolved');
    return value;
  }
  const { taxonomyId, termId } = matches[0];
  recordMapping(mappings, path, value, termId, taxonomyId, migrationStatus(index, taxonomyId, value, termId));
  return termId;
}

export function migrateLegacySemanticRecords({ index, ingredientRevisions = [], recipeVersions = [], configuration = null, ingredientIds = [] }) {
  const unresolved = [];
  const mappings = [];
  const ingredientSet = new Set(ingredientIds || []);
  const migratedIngredients = ingredientRevisions.map(original => {
    const record = clone(original); const tax = record.taxonomy || {};
    const base = `ingredientRevision:${record.ingredientRevisionId}.taxonomy`;
    const legacyGroup = tax.foodGroup;
    let group = migrateValue(index, TAXONOMY_IDS.foodCategory, legacyGroup, `${base}.foodGroup`, unresolved, mappings);
    if (normalizeLookup(legacyGroup) === 'grains' && normalizeLookup(tax.foodSubgroup) === 'rice') group = 'food_group_pasta_rice_cereals';
    if (normalizeLookup(legacyGroup) === 'grains' && normalizeLookup(tax.foodSubgroup) === 'rice') { const row = mappings.findLast?.(item => item.path === `${base}.foodGroup`) || [...mappings].reverse().find(item => item.path === `${base}.foodGroup`); if (row) { row.resolvedTermId = group; row.status = 'resolved_manual'; row.note = 'contextual grains+rice mapping approved for V1 migration'; } }
    let subgroup = tax.foodSubgroup;
    if (normalizeLookup(subgroup) === 'other' || !subgroup) subgroup = null;
    else subgroup = migrateValue(index, TAXONOMY_IDS.foodCategory, subgroup, `${base}.foodSubgroup`, unresolved, mappings);
    const flavor = migrateValue(index, TAXONOMY_IDS.flavorProfile, tax.flavorProfile, `${base}.flavorProfile`, unresolved, mappings);
    const meals = Array.isArray(tax.mealArchetypes) && tax.mealArchetypes.length ? unique(tax.mealArchetypes) : [...MEAL_ARCHETYPES];
    record.taxonomy = { ...tax, foodGroup: group, foodSubgroup: subgroup, flavorProfile: flavor, mealArchetypes: meals };
    return record;
  });
  const migratedRecipes = recipeVersions.map(original => {
    const record = clone(original); record.tags = record.tags || {};
    for (const [key, taxonomyId] of Object.entries(RECIPE_TAG_TAXONOMY)) {
      if (!Array.isArray(record.tags[key])) continue;
      record.tags[key] = unique(record.tags[key].map((value, i) => migrateValue(index, taxonomyId, value, `recipeVersion:${record.recipeVersionId}.tags.${key}[${i}]`, unresolved, mappings)));
    }
    return record;
  });
  const migratedConfiguration = configuration ? clone(configuration) : null;
  if (migratedConfiguration) {
    for (const prefs of migratedConfiguration.foodPreferences || []) for (const rule of prefs.rules || []) {
      const path = `foodPreferences:${prefs.id}.rule:${rule.id}.targetId`;
      if (rule.targetType === 'foodCategory') rule.targetId = migrateValue(index, TAXONOMY_IDS.foodCategory, rule.targetId, path, unresolved, mappings);
      else if (rule.targetType === 'cuisine') rule.targetId = migrateValue(index, TAXONOMY_IDS.cuisine, rule.targetId, path, unresolved, mappings);
      else if (rule.targetType === 'recipeTag') rule.targetId = migrateGenericTag(index, rule.targetId, path, unresolved, mappings);
      else if (rule.targetType === 'ingredient' && !ingredientSet.has(rule.targetId)) {
        // Pre-hardening preference editors allowed human-readable ingredient text.
        // If that text is not a canonical Ingredient ID but resolves exactly to a
        // curated food category, preserve the soft-preference intent by explicitly
        // retyping the rule during migration. This is migration-only: runtime writes
        // still require a canonical target for the selected targetType.
        const resolvedCategory = index.resolveLegacy(TAXONOMY_IDS.foodCategory, rule.targetId);
        if (resolvedCategory && rule.autoExclude !== true) {
          const sourceValue = rule.targetId;
          rule.targetType = 'foodCategory';
          rule.targetId = resolvedCategory;
          recordMapping(mappings, path, sourceValue, resolvedCategory, TAXONOMY_IDS.foodCategory, 'resolved_retyped_legacy');
        } else {
          unresolved.push({ path, value: rule.targetId, targetType: rule.targetType, reason: resolvedCategory ? 'unsafe_auto_exclude_retype' : 'unknown_ingredient' });
          recordMapping(mappings, path, rule.targetId, null, null, 'unresolved');
        }
      }
    }
    for (const profile of migratedConfiguration.allergyIntoleranceProfiles || []) for (const rule of profile.rules || []) if (rule.targetType === 'foodCategory') rule.targetId = migrateValue(index, TAXONOMY_IDS.foodCategory, rule.targetId, `allergy:${profile.id}.rule:${rule.id}.targetId`, unresolved, mappings);
    for (const meal of migratedConfiguration.mealClasses || []) for (const [i, rule] of (meal.rules || []).entries()) {
      const path = `mealClass:${meal.id}.rules[${i}].target`;
      if (rule.ruleType === 'foodCategory') rule.target = migrateValue(index, TAXONOMY_IDS.foodCategory, rule.target, path, unresolved, mappings);
      else if (rule.ruleType === 'flavor') rule.target = migrateValue(index, TAXONOMY_IDS.flavorProfile, rule.target, path, unresolved, mappings);
      else if (rule.ruleType === 'tag') rule.target = migrateGenericTag(index, rule.target, path, unresolved, mappings);
    }
  }
  return { ingredientRevisions: migratedIngredients, recipeVersions: migratedRecipes, configuration: migratedConfiguration, mappings, unresolved };
}

export async function fetchBundledReferenceData({ fetcher = fetch, registry } = {}) {
  const { assetPath } = await import('../lib/appBase.js');
  const read = async path => {
    const response = await fetcher(assetPath(path), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Unable to load reference data ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const [taxonomies, taxonomyTerms] = await Promise.all([
    read('/data/reference-data/taxonomies-0001.json'),
    read('/data/reference-data/taxonomy-terms-0001.json')
  ]);
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  return { taxonomies, taxonomyTerms, index, digest: await referenceDataDigest(taxonomies, taxonomyTerms), version: '1.0.0' };
}
