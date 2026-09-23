import { canonicalJson, sha256Json } from '../lib/crypto.js';
import { CALCULATION_ALGORITHM_VERSION, calculateRecipeNutrition, deriveAllergens } from '../domain/nutritionCore.js';

export const CLEAN_CATALOG_SCHEMA_VERSION = 1;
export const CLEAN_CATALOG_EPOCH = 'clean-catalog-epoch-1';
export const CLEAN_CATALOG_PIPELINE = 'clean-catalog-compiler-v1';
export const CLEAN_CATALOG_TIMESTAMP = '2026-09-17T00:00:00Z';

const ID_RE = /^[a-z][a-z0-9_]*$/;
const KINDS = new Set(['taxonomy_term', 'ingredient', 'recipe']);
const TAXONOMY_TYPES = new Set([
  'ingredient_category', 'product', 'culinary_role', 'recipe_archetype', 'cuisine', 'meal_type',
  'diet_tag', 'practical_tag', 'flavor_profile', 'preparation_technique'
]);
const MEAL_ARCHETYPES = new Set(['breakfast','lunch','dinner','snack','mini_meal','brunch','pre_shift','during_shift','post_shift','night_meal']);
const ALLERGEN_IDS = new Set(['gluten_cereals','crustaceans','eggs','fish','peanuts','soy','milk','tree_nuts','celery','mustard','sesame','sulphites','lupin','molluscs']);
const BASIS_STATES = new Set(['raw','cooked','dry','drained','prepared','ready_to_eat','as_sold','unknown']);
const REQUIRED_NUTRIENTS = ['energyKcal','proteinG','carbohydrateG','fatG','fiberG'];

function fail(message) { throw new Error(`Clean catalog: ${message}`); }
function assert(condition, message) { if (!condition) fail(message); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function text(value) { return String(value ?? '').trim(); }
function asciiId(value, path) { const id = text(value); assert(ID_RE.test(id), `${path} must be lowercase ASCII snake_case`); return id; }
function slug(id, prefixes = []) {
  let value = id;
  for (const prefix of prefixes) if (value.startsWith(prefix)) { value = value.slice(prefix.length); break; }
  return value.replace(/^(tax_|ing_|recipe_)/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}
function asDateTime(date) {
  const raw = text(date);
  if (!raw) return CLEAN_CATALOG_TIMESTAMP;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00Z`;
  assert(!Number.isNaN(Date.parse(raw)), `invalid date ${raw}`);
  return new Date(raw).toISOString();
}
function searchTokens(...values) {
  return unique(values.flat(Infinity).filter(Boolean).flatMap(value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))).sort();
}
function round(value, digits = 3) { const p = 10 ** digits; return Math.round(Number(value) * p) / p; }

export function validateSourceBatch(batch, filename = '<batch>') {
  assert(batch && typeof batch === 'object' && !Array.isArray(batch), `${filename}: batch must be an object`);
  assert(batch.schemaVersion === 1, `${filename}: schemaVersion must be 1`);
  asciiId(batch.batchId, `${filename}.batchId`);
  assert(Array.isArray(batch.records), `${filename}: records must be an array`);
  for (const [index, record] of batch.records.entries()) {
    const path = `${filename}.records[${index}]`;
    assert(record && typeof record === 'object' && !Array.isArray(record), `${path} must be an object`);
    assert(KINDS.has(record.kind), `${path}.kind is invalid`);
    asciiId(record.id, `${path}.id`);
    assert(Number.isInteger(record.revision) && record.revision >= 1, `${path}.revision must be an integer >= 1`);
    assert(['active','retired'].includes(record.status), `${path}.status must be active or retired`);
    if (record.kind === 'taxonomy_term' && record.status === 'active') {
      assert(TAXONOMY_TYPES.has(record.taxonomyType), `${path}.taxonomyType is invalid`);
      assert(record.labels && text(record.labels.it) && text(record.labels.en), `${path}.labels.it/en are required`);
      if (record.parentId != null) asciiId(record.parentId, `${path}.parentId`);
    }
    if (record.kind === 'ingredient' && record.status === 'active') validateIngredientSource(record, path);
    if (record.kind === 'recipe' && record.status === 'active') validateRecipeSource(record, path);
  }
  return batch;
}

function validateIngredientSource(record, path) {
  asciiId(record.productId, `${path}.productId`);
  asciiId(record.categoryId, `${path}.categoryId`);
  assert(record.state && typeof record.state === 'object', `${path}.state is required`);
  const state = text(record.state.physical || (record.state.drained ? 'drained' : ''));
  assert(BASIS_STATES.has(state), `${path}.state.physical must be one of ${[...BASIS_STATES].join(', ')}`);
  assert(record.display && text(record.display.it) && text(record.display.en), `${path}.display.it/en are required`);
  assert(record.nutritionPer100g && typeof record.nutritionPer100g === 'object', `${path}.nutritionPer100g is required`);
  for (const key of REQUIRED_NUTRIENTS) {
    const value = record.nutritionPer100g[key];
    assert(Number.isFinite(value) && value >= 0, `${path}.nutritionPer100g.${key} must be a non-negative number`);
  }
  assert(Array.isArray(record.allergens), `${path}.allergens must be an array`);
  for (const allergen of record.allergens) assert(ALLERGEN_IDS.has(allergen), `${path}.allergens contains unsupported ${allergen}`);
  assert(record.source && text(record.source.provider) && text(record.source.sourceId) && text(record.source.description), `${path}.source provider/sourceId/description are required`);
  assert(record.source.retrievedOrVerifiedDate, `${path}.source.retrievedOrVerifiedDate is required`);
  asDateTime(record.source.retrievedOrVerifiedDate);
  if (record.culinaryRoles != null) for (const id of record.culinaryRoles) asciiId(id, `${path}.culinaryRoles[]`);
  if (record.flavorProfileId != null) asciiId(record.flavorProfileId, `${path}.flavorProfileId`);
  const flags = record.dietFlags || {};
  if ('vegetarian' in flags) assert(typeof flags.vegetarian === 'boolean', `${path}.dietFlags.vegetarian must be boolean`);
  if ('vegan' in flags) assert(typeof flags.vegan === 'boolean', `${path}.dietFlags.vegan must be boolean`);
}

function validateRecipeSource(record, path) {
  assert(record.title && text(record.title.it).length >= 5 && text(record.title.en).length >= 5, `${path}.title.it/en must contain at least 5 characters`);
  assert(record.description && typeof record.description === 'object', `${path}.description is required`);
  assert(record.servings === 1, `${path}.servings must be 1`);
  assert(Array.isArray(record.ingredients) && record.ingredients.length >= 1, `${path}.ingredients must contain at least one line`);
  for (const [index, line] of record.ingredients.entries()) {
    asciiId(line.ingredientId, `${path}.ingredients[${index}].ingredientId`);
    assert(Number.isFinite(line.grams) && line.grams > 0 && line.grams <= 1500, `${path}.ingredients[${index}].grams must be > 0 and <= 1500`);
  }
  assert(Array.isArray(record.mealTypeIds) && record.mealTypeIds.length, `${path}.mealTypeIds must not be empty`);
  for (const id of record.mealTypeIds) asciiId(id, `${path}.mealTypeIds[]`);
  asciiId(record.archetypeId, `${path}.archetypeId`);
  for (const key of ['cuisineIds','practicalTagIds','dietTagIds','flavorProfileIds','preparationTechniqueIds']) if (record[key] != null) for (const id of record[key]) asciiId(id, `${path}.${key}[]`);
  assert(Number.isInteger(record.prepMinutes) && record.prepMinutes >= 0, `${path}.prepMinutes must be an integer >= 0`);
  assert(Number.isInteger(record.cookMinutes) && record.cookMinutes >= 0, `${path}.cookMinutes must be an integer >= 0`);
  if (record.eatingMinutes != null) assert(Number.isInteger(record.eatingMinutes) && record.eatingMinutes >= 0, `${path}.eatingMinutes must be an integer >= 0`);
  if (record.steps != null) {
    assert(Array.isArray(record.steps.it) && record.steps.it.length && Array.isArray(record.steps.en) && record.steps.en.length, `${path}.steps.it/en must be non-empty arrays`);
  }
}

export function resolveSourceRecords(batches) {
  const byKey = new Map();
  for (const { batch, filename = '<batch>' } of batches) {
    validateSourceBatch(batch, filename);
    for (const record of batch.records) {
      const key = `${record.kind}:${record.id}`;
      if (!byKey.has(key)) byKey.set(key, new Map());
      const versions = byKey.get(key);
      const existing = versions.get(record.revision);
      if (existing && canonicalJson(existing) !== canonicalJson(record)) fail(`${key} revision ${record.revision} has conflicting definitions`);
      versions.set(record.revision, structuredClone(record));
    }
  }
  const resolved = [];
  for (const [key, versions] of byKey) {
    const revision = Math.max(...versions.keys());
    resolved.push(versions.get(revision));
  }
  resolved.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return resolved;
}

function runtimeTaxonomy(taxonomyId, labelIt, labelEn, { hierarchical = false, consumers = ['search'] } = {}) {
  return {
    schemaVersion: 1, taxonomyId, origin: 'base', hierarchical, extensibleBy: ['user','editorial_pipeline'], allowedConsumers: consumers,
    status: 'active', i18n: { it: { label: labelIt }, en: { label: labelEn } }, createdAt: CLEAN_CATALOG_TIMESTAMP, updatedAt: CLEAN_CATALOG_TIMESTAMP
  };
}

function runtimeTerm({ termId, taxonomyId, labelIt, labelEn, parentTermId = null, aliasesIt = [], aliasesEn = [], sourceLabel = 'Clean catalog source' }) {
  return {
    schemaVersion: 1, termId, taxonomyId, origin: 'base', parentTermId,
    i18n: { it: { label: labelIt }, en: { label: labelEn } }, aliases: { it: unique(aliasesIt), en: unique(aliasesEn) }, legacyKeys: [], status: 'active', supersedesTermId: null,
    provenance: { sourceType: 'curated', sourceLabel, reference: null, rationale: 'Authored in catalog-source and compiled deterministically.' },
    searchTokens: searchTokens(termId, labelIt, labelEn, aliasesIt, aliasesEn), createdAt: CLEAN_CATALOG_TIMESTAMP, updatedAt: CLEAN_CATALOG_TIMESTAMP
  };
}

function sourceAliases(term, locale) { return Array.isArray(term.aliases?.[locale]) ? term.aliases[locale] : []; }
function taxonomyRuntimeId(term) {
  const s = slug(term.id, ['tax_category_','tax_product_','tax_role_','tax_archetype_','tax_cuisine_','tax_meal_','tax_diet_','tax_practical_','tax_flavor_','tax_preparation_']);
  const map = {
    recipe_archetype: `recipe_family_${s}`, cuisine: `cuisine_${s}`, diet_tag: `diet_${s}`, practical_tag: `practical_${s}`,
    flavor_profile: `flavor_${s}`, preparation_technique: `preparation_${s}`, culinary_role: term.id, meal_type: term.id
  };
  return map[term.taxonomyType] || term.id;
}

function mealArchetypeForTerm(term) {
  const candidate = slug(term.id, ['tax_meal_']);
  assert(MEAL_ARCHETYPES.has(candidate), `meal type ${term.id} must map to a supported meal archetype`);
  return candidate;
}

function stateLabel(state, locale) {
  const it = { raw:'Crudo', cooked:'Cotto', dry:'Secco', drained:'Sgocciolato', prepared:'Preparato', ready_to_eat:'Pronto al consumo', as_sold:'Come venduto', unknown:'Stato da verificare' };
  const en = { raw:'Raw', cooked:'Cooked', dry:'Dry', drained:'Drained', prepared:'Prepared', ready_to_eat:'Ready to eat', as_sold:'As sold', unknown:'State to verify' };
  return (locale === 'it' ? it : en)[state] || state;
}

function normalizeProviderType(provider) {
  const value = text(provider).toLowerCase();
  if (value.includes('manual')) return 'manual';
  if (value.includes('crea') || value.includes('usda') || value.includes('fdc')) return 'imported';
  return 'curated';
}

function sourceTermMap(records) { return new Map(records.filter(r => r.kind === 'taxonomy_term' && r.status === 'active').map(r => [r.id, r])); }
function recordMap(records, kind) { return new Map(records.filter(r => r.kind === kind && r.status === 'active').map(r => [r.id, r])); }

export async function compileCleanCatalog(resolvedRecords, { registry = null } = {}) {
  const sourceDigest = await sha256Json(resolvedRecords);
  const catalogVersion = `clean-${sourceDigest.slice(0, 12)}`;
  const active = resolvedRecords.filter(record => record.status === 'active');
  const terms = sourceTermMap(active);
  const ingredientsSource = recordMap(active, 'ingredient');
  const recipesSource = recordMap(active, 'recipe');

  const taxonomyRecords = [...terms.values()];
  for (const term of taxonomyRecords) {
    if (term.parentId) {
      const parent = terms.get(term.parentId);
      assert(parent, `taxonomy term ${term.id} references missing parent ${term.parentId}`);
      if (term.taxonomyType === 'product') assert(parent.taxonomyType === 'ingredient_category', `product ${term.id} parent must be an ingredient_category`);
    }
  }

  const taxonomies = [
    runtimeTaxonomy('product_food','Prodotti alimentari','Food products',{ hierarchical:true, consumers:['ingredient','meal_class','food_preferences','allergy_profile','corpus_policy','search'] }),
    runtimeTaxonomy('food_category','Categorie alimentari','Food categories',{ hierarchical:true, consumers:['ingredient','meal_class','food_preferences','allergy_profile','corpus_policy','search'] }),
    runtimeTaxonomy('cuisine','Cucine','Cuisines',{ consumers:['recipe','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('recipe_family','Famiglie ricetta','Recipe families',{ consumers:['recipe','meal_class','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('diet_tag','Diete','Diet tags',{ consumers:['recipe','meal_class','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('practical_tag','Tag pratici','Practical tags',{ consumers:['recipe','meal_class','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('flavor_profile','Profili di gusto','Flavor profiles',{ consumers:['ingredient','recipe','meal_class','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('preparation_technique','Tecniche di preparazione','Preparation techniques',{ consumers:['recipe','meal_class','food_preferences','corpus_policy','search'] }),
    runtimeTaxonomy('culinary_role','Ruoli culinari','Culinary roles',{ consumers:['ingredient','corpus_pipeline','search'] }),
    runtimeTaxonomy('meal_type','Tipi di pasto','Meal types',{ consumers:['recipe','search'] })
  ];

  const hasSourceFlavorNeutral = taxonomyRecords.some(term => term.taxonomyType === 'flavor_profile' && taxonomyRuntimeId(term) === 'flavor_neutral');
  const hasSourcePreparationGeneral = taxonomyRecords.some(term => term.taxonomyType === 'preparation_technique' && taxonomyRuntimeId(term) === 'preparation_general');
  const taxonomyTerms = [
    ...(!hasSourceFlavorNeutral ? [runtimeTerm({ termId:'flavor_neutral', taxonomyId:'flavor_profile', labelIt:'Neutro', labelEn:'Neutral' })] : []),
    ...(!hasSourcePreparationGeneral ? [runtimeTerm({ termId:'preparation_general', taxonomyId:'preparation_technique', labelIt:'Preparazione generale', labelEn:'General preparation' })] : [])
  ];
  const sourceToRuntime = new Map();
  const categoryRuntime = new Map();
  const productRuntime = new Map();

  for (const term of taxonomyRecords.filter(t => t.taxonomyType === 'ingredient_category')) {
    const s = slug(term.id, ['tax_category_']);
    const foodGroup = `food_group_${s}`;
    const category = `product_category_${s}`;
    const subcategory = `product_subcategory_${s}_general`;
    taxonomyTerms.push(runtimeTerm({ termId:foodGroup, taxonomyId:'food_category', labelIt:term.labels.it, labelEn:term.labels.en, aliasesIt:sourceAliases(term,'it'), aliasesEn:sourceAliases(term,'en') }));
    taxonomyTerms.push(runtimeTerm({ termId:category, taxonomyId:'product_food', labelIt:term.labels.it, labelEn:term.labels.en, aliasesIt:sourceAliases(term,'it'), aliasesEn:sourceAliases(term,'en') }));
    taxonomyTerms.push(runtimeTerm({ termId:subcategory, taxonomyId:'product_food', parentTermId:category, labelIt:`${term.labels.it} · generale`, labelEn:`${term.labels.en} · general` }));
    categoryRuntime.set(term.id, { foodGroup, category, subcategory });
    sourceToRuntime.set(term.id, foodGroup);
  }

  for (const term of taxonomyRecords.filter(t => t.taxonomyType === 'product')) {
    const parent = categoryRuntime.get(term.parentId);
    assert(parent, `product ${term.id} requires an active ingredient_category parent`);
    const concept = `product_concept_${slug(term.id, ['tax_product_'])}`;
    taxonomyTerms.push(runtimeTerm({ termId:concept, taxonomyId:'product_food', parentTermId:parent.subcategory, labelIt:term.labels.it, labelEn:term.labels.en, aliasesIt:sourceAliases(term,'it'), aliasesEn:sourceAliases(term,'en') }));
    productRuntime.set(term.id, { ...parent, concept });
    sourceToRuntime.set(term.id, concept);
  }

  const simpleTypeToTaxonomy = {
    recipe_archetype:'recipe_family', cuisine:'cuisine', diet_tag:'diet_tag', practical_tag:'practical_tag', flavor_profile:'flavor_profile', preparation_technique:'preparation_technique', culinary_role:'culinary_role', meal_type:'meal_type'
  };
  for (const term of taxonomyRecords.filter(t => simpleTypeToTaxonomy[t.taxonomyType])) {
    const termId = taxonomyRuntimeId(term);
    taxonomyTerms.push(runtimeTerm({ termId, taxonomyId:simpleTypeToTaxonomy[term.taxonomyType], labelIt:term.labels.it, labelEn:term.labels.en, aliasesIt:sourceAliases(term,'it'), aliasesEn:sourceAliases(term,'en') }));
    sourceToRuntime.set(term.id, termId);
  }

  const ingredientFamilies = [];
  const ingredientRevisions = [];
  const ingredientRevisionByLogicalId = new Map();
  const ingredientSourceById = new Map();

  for (const source of [...ingredientsSource.values()].sort((a,b)=>a.id.localeCompare(b.id))) {
    const product = terms.get(source.productId);
    const category = terms.get(source.categoryId);
    assert(product?.taxonomyType === 'product', `ingredient ${source.id} productId ${source.productId} must reference an active product term`);
    assert(category?.taxonomyType === 'ingredient_category', `ingredient ${source.id} categoryId ${source.categoryId} must reference an active ingredient_category term`);
    assert(product.parentId === category.id, `ingredient ${source.id} product ${source.productId} must belong to category ${source.categoryId}`);
    const productIds = productRuntime.get(source.productId);
    assert(productIds, `ingredient ${source.id} product taxonomy could not be compiled`);
    for (const roleId of source.culinaryRoles || []) assert(terms.get(roleId)?.taxonomyType === 'culinary_role', `ingredient ${source.id} culinary role ${roleId} is missing or invalid`);
    if (source.flavorProfileId) assert(terms.get(source.flavorProfileId)?.taxonomyType === 'flavor_profile', `ingredient ${source.id} flavorProfileId is invalid`);

    const state = source.state.drained ? 'drained' : source.state.physical;
    const revisionId = `${source.id}_r${source.revision}`;
    const checkedAt = asDateTime(source.source.retrievedOrVerifiedDate);
    const allergens = [...source.allergens].sort();
    const revision = {
      schemaVersion:2, ingredientRevisionId:revisionId, ingredientId:source.id, revisionNumber:source.revision, origin:'base', catalogVersion,
      i18n:{ it:{ name:source.display.it, aliases:[] }, en:{ name:source.display.en, aliases:[] } },
      basis:{ amount:100, unit:'g', state },
      nutrition:{ energyKcal:round(source.nutritionPer100g.energyKcal,3), proteinG:round(source.nutritionPer100g.proteinG,3), carbsG:round(source.nutritionPer100g.carbohydrateG,3), fatG:round(source.nutritionPer100g.fatG,3), fiberG:round(source.nutritionPer100g.fiberG,3),
        ...(source.nutritionPer100g.sugarsG != null ? { sugarsG:round(source.nutritionPer100g.sugarsG,3) } : {}), ...(source.nutritionPer100g.saturatedFatG != null ? { saturatedFatG:round(source.nutritionPer100g.saturatedFatG,3) } : {}),
        ...(source.nutritionPer100g.saltG != null ? { saltG:round(source.nutritionPer100g.saltG,3) } : {}), ...(source.nutritionPer100g.sodiumMg != null ? { sodiumMg:round(source.nutritionPer100g.sodiumMg,3) } : {}) },
      taxonomy:{ foodGroup:productIds.foodGroup, foodSubgroup:null, flavorProfile:source.flavorProfileId ? sourceToRuntime.get(source.flavorProfileId) : 'flavor_neutral', culinaryRoles:(source.culinaryRoles || []).map(id => sourceToRuntime.get(id)), mealArchetypes:[...MEAL_ARCHETYPES].sort() },
      allergenIds:allergens, conversions:[],
      source:{ type:normalizeProviderType(source.source.provider), label:source.source.description, reference:`${source.source.provider}:${source.source.sourceId}`, sourceRecordId:source.source.sourceId, checkedAt, licenseNote:null, energyBasis:'unknown', energyNutrientId:null, energySourceUnit:'unknown', energyOriginalValue:source.nutritionPer100g.energyKcal, energyConversion:'none' },
      quality:{ status:'curated', confidence:'high', notes:source.notes?.it || null }, contentHash:'', createdAt:CLEAN_CATALOG_TIMESTAMP,
      productTaxonomy:{ categoryId:productIds.category, subcategoryId:productIds.subcategory, conceptId:productIds.concept },
      display:{ it:{ variantLabel:stateLabel(state,'it') }, en:{ variantLabel:stateLabel(state,'en') } },
      safetyEvidence:{ assessmentStatus:'reviewed', containsAllergenIds:allergens, mayContainAllergenIds:[], compositionCompleteness:'complete', sourceRefs:[`${source.source.provider}:${source.source.sourceId}`], reviewedBy:'catalog-source-authoring', reviewedAt:checkedAt, policyVersion:'clean-catalog-v1' }
    };
    revision.contentHash = await sha256Json({ ...revision, contentHash:'' });
    const family = { schemaVersion:1, ingredientId:source.id, origin:'base', currentRevisionId:revisionId, status:'active', createdAt:CLEAN_CATALOG_TIMESTAMP, updatedAt:CLEAN_CATALOG_TIMESTAMP };
    registry?.assert('ingredient', family); registry?.assert('ingredientRevision', revision);
    ingredientFamilies.push(family); ingredientRevisions.push(revision); ingredientRevisionByLogicalId.set(source.id, revision); ingredientSourceById.set(source.id, source);
  }

  const recipeFamilies = [];
  const recipeVersions = [];
  for (const source of [...recipesSource.values()].sort((a,b)=>a.id.localeCompare(b.id))) {
    const archetype = terms.get(source.archetypeId);
    assert(archetype?.taxonomyType === 'recipe_archetype', `recipe ${source.id} archetypeId ${source.archetypeId} is missing or invalid`);
    const meals = unique(source.mealTypeIds.map(id => {
      const term = terms.get(id); assert(term?.taxonomyType === 'meal_type', `recipe ${source.id} meal type ${id} is missing or invalid`); return mealArchetypeForTerm(term);
    }));
    const lines = source.ingredients.map(line => {
      const revision = ingredientRevisionByLogicalId.get(line.ingredientId);
      assert(revision, `recipe ${source.id} references missing active ingredient ${line.ingredientId}`);
      return { ingredientId:line.ingredientId, ingredientRevisionId:revision.ingredientRevisionId, amount:round(line.grams,3), unit:'g', normalizedAmount:round(line.grams,3), normalizedUnit:'g', optional:Boolean(line.optional), notesKey:null };
    });
    const byRevision = new Map(lines.map(line => [line.ingredientRevisionId, ingredientRevisionByLogicalId.get(line.ingredientId)]));
    const calculatedNutrition = calculateRecipeNutrition(lines, byRevision);
    const allergenIds = deriveAllergens(lines, byRevision);

    const cuisineTags = (source.cuisineIds || []).map(id => { const term=terms.get(id); assert(term?.taxonomyType === 'cuisine', `recipe ${source.id} cuisine ${id} is missing or invalid`); return sourceToRuntime.get(id); });
    const practicalTags = (source.practicalTagIds || []).map(id => { const term=terms.get(id); assert(term?.taxonomyType === 'practical_tag', `recipe ${source.id} practical tag ${id} is missing or invalid`); return sourceToRuntime.get(id); });
    const flavorTags = (source.flavorProfileIds || []).map(id => { const term=terms.get(id); assert(term?.taxonomyType === 'flavor_profile', `recipe ${source.id} flavor profile ${id} is missing or invalid`); return sourceToRuntime.get(id); });
    const preparationTags = (source.preparationTechniqueIds || []).map(id => { const term=terms.get(id); assert(term?.taxonomyType === 'preparation_technique', `recipe ${source.id} preparation technique ${id} is missing or invalid`); return sourceToRuntime.get(id); });
    const authoredDietTags = source.dietTagIds || [];
    for (const id of authoredDietTags) assert(terms.get(id)?.taxonomyType === 'diet_tag', `recipe ${source.id} diet tag ${id} is missing or invalid`);
    const ingredientsForDiet = source.ingredients.map(line => ingredientSourceById.get(line.ingredientId));
    const allVegan = ingredientsForDiet.every(item => item?.dietFlags?.vegan === true);
    const allVegetarian = ingredientsForDiet.every(item => item?.dietFlags?.vegetarian === true || item?.dietFlags?.vegan === true);
    for (const id of authoredDietTags) {
      const s = slug(id, ['tax_diet_']);
      if (s === 'vegan') assert(allVegan, `recipe ${source.id} is tagged vegan but contains a non-vegan ingredient`);
      if (s === 'vegetarian') assert(allVegetarian, `recipe ${source.id} is tagged vegetarian but contains a non-vegetarian ingredient`);
    }
    const dietTags = unique([
      ...authoredDietTags.map(id => sourceToRuntime.get(id)),
      ...(allVegan && [...terms.values()].some(t => t.taxonomyType === 'diet_tag' && slug(t.id,['tax_diet_']) === 'vegan') ? ['diet_vegan'] : []),
      ...(allVegetarian && [...terms.values()].some(t => t.taxonomyType === 'diet_tag' && slug(t.id,['tax_diet_']) === 'vegetarian') ? ['diet_vegetarian'] : [])
    ]);

    const totalWeight = round(lines.reduce((sum,line)=>sum+line.normalizedAmount,0),2);
    const practicalSet = new Set((source.practicalTagIds || []).map(id=>slug(id,['tax_practical_'])));
    const inputDigest = await sha256Json({ calculationAlgorithmVersion:CALCULATION_ALGORITHM_VERSION, ingredientLines:lines.map(line=>({ ingredientRevisionId:line.ingredientRevisionId, normalizedAmount:line.normalizedAmount, normalizedUnit:line.normalizedUnit })) });
    const recipeVersionId = `${source.id}_v${source.revision}`;
    const titleValues = [source.title.it, source.title.en, source.description.it, source.description.en, ...source.ingredients.map(line=>ingredientRevisionByLogicalId.get(line.ingredientId)?.i18n?.it?.name)];
    const version = {
      schemaVersion:2, recipeVersionId, recipeId:source.id, versionNumber:source.revision, supersedesVersionId:null, origin:'base', catalogVersion,
      i18n:{ it:{ title:source.title.it, description:source.description.it || '' }, en:{ title:source.title.en, description:source.description.en || '' } }, servingCount:1, mealArchetypes:meals,
      ingredientLines:lines, calculatedNutrition,
      practical:{ prepMinutes:source.prepMinutes, cookMinutes:source.cookMinutes, eatingMinutes:source.eatingMinutes ?? null, reheatingRequired:practicalSet.has('reheat'), coldSuitable:practicalSet.has('cold') || practicalSet.has('no_cook'), portable:practicalSet.has('portable'), fridgeRequired:practicalSet.has('fridge_required'), mealPrepSuitable:practicalSet.has('meal_prep'), finalWeightG:totalWeight, finalVolumeMl:null, yieldNotes:null },
      practicalEvidence:{ status:'user_declared', sourceRef:`catalog-source:${source.id}` },
      tags:{ families:[sourceToRuntime.get(source.archetypeId)], cuisines:unique(cuisineTags), diet:unique(dietTags), flavor:unique(flavorTags.length ? flavorTags : ['flavor_neutral']), practical:unique(practicalTags), preparation:unique(preparationTags.length ? preparationTags : ['preparation_general']) },
      allergenIds, searchTokens:searchTokens(titleValues), calculationAlgorithmVersion:CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash:'',
      generation:{ jobId:null, pipelineVersion:CLEAN_CATALOG_PIPELINE, sourceLocale:'it', generatedAt:CLEAN_CATALOG_TIMESTAMP, candidateId:null, intakeId:null, productionContractId:null, productionContractVersion:null },
      quality:{ status:'curated', reviewNotes:'Authored in catalog-source.' }, createdAt:CLEAN_CATALOG_TIMESTAMP
    };
    version.contentHash = await sha256Json({ ...version, contentHash:'' });
    const family = { schemaVersion:1, recipeId:source.id, origin:'base', currentVersionId:recipeVersionId, status:'active', createdAt:CLEAN_CATALOG_TIMESTAMP, updatedAt:CLEAN_CATALOG_TIMESTAMP };
    registry?.assert('recipe', family); registry?.assert('recipeVersion', version);
    recipeFamilies.push(family); recipeVersions.push(version);
  }

  for (const taxonomy of taxonomies) registry?.assert('taxonomy', taxonomy);
  for (const term of taxonomyTerms) registry?.assert('taxonomyTerm', term);

  const pack = { schemaVersion:1, packId:'core', catalogVersion, labelKey:'catalog.pack.core.label', descriptionKey:'catalog.pack.core.description', required:true, estimatedBytes:0, recipeVersionIds:recipeVersions.map(r=>r.recipeVersionId), status:'installed', installedAt:CLEAN_CATALOG_TIMESTAMP, lastErrorCode:null, createdAt:CLEAN_CATALOG_TIMESTAMP, updatedAt:CLEAN_CATALOG_TIMESTAMP };
  registry?.assert('catalogPack', pack);
  const referenceDataDigest = await sha256Json({ taxonomies, taxonomyTerms });
  const manifest = {
    schemaVersion:1, catalogVersion, sourceDigest, dataEpoch:CLEAN_CATALOG_EPOCH, pipelineVersion:CLEAN_CATALOG_PIPELINE, calculationAlgorithmVersion:CALCULATION_ALGORITHM_VERSION,
    referenceDataVersion:`clean-ref-${referenceDataDigest.slice(0,12)}`, referenceDataDigest,
    counts:{ taxonomies:taxonomies.length, taxonomyTerms:taxonomyTerms.length, ingredients:ingredientFamilies.length, ingredientRevisions:ingredientRevisions.length, recipes:recipeFamilies.length, recipeVersions:recipeVersions.length }
  };
  return { schemaVersion:CLEAN_CATALOG_SCHEMA_VERSION, manifest, taxonomies, taxonomyTerms, ingredients:ingredientFamilies, ingredientRevisions, recipes:recipeFamilies, recipeVersions, catalogPacks:[pack], recipeHumanReviews:[], foodGroups:[], ingredientMappings:[], ingredientConversions:[] };
}

export async function compileSourceBatches(batches, options = {}) {
  const resolvedRecords = resolveSourceRecords(batches);
  return compileCleanCatalog(resolvedRecords, options);
}
