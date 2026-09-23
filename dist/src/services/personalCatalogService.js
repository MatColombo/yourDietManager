import { recipeTextV2, assertRecipeTitle, recipeTitleFromIngredients } from '../domain/recipePresentation.js';
import { legacySafetyEvidence } from '../domain/safetyCompatibility.js';
import { assertIngredientRevisionV2 } from '../domain/revisionV2Contracts.js';
import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json } from '../lib/crypto.js';
import { calculateRecipeNutrition, CALCULATION_ALGORITHM_VERSION, deriveAllergens, normalizeIngredientAmount } from '../domain/nutritionCore.js';
import { loadReferenceDataIndex, TAXONOMY_IDS, RECIPE_TAG_TAXONOMY, assertSemanticReferences } from './referenceDataService.js';

function slug(value, fallback) {
  const base = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
  return base || fallback;
}
function suffix() { return globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 10) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function splitTokens(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function cleanList(value) {
  if (Array.isArray(value)) return unique(value.map(item => String(item).trim()).filter(Boolean));
  return unique(String(value || '').split(',').map(item => item.trim()).filter(Boolean));
}
function semanticIdList(value, label) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be selected from canonical reference data`);
  return unique(value.map(item => String(item).trim()).filter(Boolean));
}
function requiredNumber(value, label) {
  if (value === '' || value === null || value === undefined) throw new Error(`${label} is required`);
  const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`); return n;
}
function optionalNumber(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`); return n;
}
function canonicalTerm(index, taxonomyId, value, label) {
  if (!value) throw new Error(`${label} is required`);
  return index.assertTerm(value, taxonomyId).termId;
}
function nowIso() { return new Date().toISOString(); }

/**
 * Save an ingredient regardless of its original catalog origin.
 * Historical IngredientRevision records remain immutable. Editing a bundled/base
 * ingredient creates a new user-owned revision and promotes the family to local
 * management so future catalog updates cannot overwrite the user's current pointer.
 */
export async function saveIngredient(input, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const referenceIndex = await loadReferenceDataIndex(repo);
  const existing = input.ingredientId ? await repo.get('ingredients', input.ingredientId) : null;
  const previous = existing ? await repo.get('ingredientRevisions', existing.currentRevisionId) : null;
  const ingredientId = existing?.ingredientId || `uing_${slug(input.nameIt || input.nameEn, 'ingredient')}_${suffix()}`;
  const revisionNumber = (previous?.revisionNumber || 0) + 1;
  const ingredientRevisionId = `${ingredientId}_r${revisionNumber}_${suffix().slice(0, 5)}`;
  const createdAt = nowIso();
  const revisionBase = {
    schemaVersion: 2, ingredientRevisionId, ingredientId, revisionNumber, origin: 'user', catalogVersion: null,
    i18n: {
      it: { name: String(input.nameIt || input.nameEn || '').trim(), aliases: cleanList(input.aliasesIt) },
      en: { name: String(input.nameEn || input.nameIt || '').trim(), aliases: cleanList(input.aliasesEn) }
    },
    basis: { amount: 100, unit: input.basisUnit === 'ml' ? 'ml' : 'g', state: input.state || 'unknown' },
    nutrition: {
      energyKcal: requiredNumber(input.energyKcal, 'Energy'), proteinG: requiredNumber(input.proteinG, 'Protein'), carbsG: requiredNumber(input.carbsG, 'Carbohydrates'), fatG: requiredNumber(input.fatG, 'Fat'), fiberG: requiredNumber(input.fiberG, 'Fiber')
    },
    taxonomy: {
      foodGroup: canonicalTerm(referenceIndex, TAXONOMY_IDS.foodCategory, input.foodGroup, 'Food group'),
      foodSubgroup: !input.foodSubgroup ? null : canonicalTerm(referenceIndex, TAXONOMY_IDS.foodCategory, input.foodSubgroup, 'Food subgroup'),
      flavorProfile: canonicalTerm(referenceIndex, TAXONOMY_IDS.flavorProfile, input.flavorProfile, 'Flavor profile'),
      culinaryRoles: unique((input.culinaryRoles || previous?.taxonomy?.culinaryRoles || []).map(value => canonicalTerm(referenceIndex, TAXONOMY_IDS.culinaryRole, value, 'Culinary role'))),
      mealArchetypes: unique(input.mealArchetypes || [])
    },
    allergenIds: unique(input.allergenIds || []),
    conversions: Array.isArray(input.conversions) ? input.conversions : (previous?.conversions ? structuredClone(previous.conversions) : []),
    source: {
      type: 'manual',
      label: existing ? 'User edit' : 'User authored',
      reference: previous?.ingredientRevisionId ? `local:${previous.ingredientRevisionId}` : null,
      sourceRecordId: previous?.ingredientRevisionId || null,
      checkedAt: createdAt,
      licenseNote: null
    },
    quality: { status: 'validated', confidence: 'medium', notes: null }, contentHash: '', createdAt
  };
  if (!revisionBase.taxonomy.mealArchetypes.length) throw new Error('At least one meal archetype is required');
  if (revisionBase.taxonomy.foodSubgroup) {
    const subgroup = referenceIndex.assertTerm(revisionBase.taxonomy.foodSubgroup, TAXONOMY_IDS.foodCategory);
    if (subgroup.parentTermId !== revisionBase.taxonomy.foodGroup) throw new Error('Food subgroup does not belong to the selected food group');
  }
  const productFoodTaxonomy = referenceIndex.taxonomy(TAXONOMY_IDS.productFood);
  const requestedProductFood = input.productFoodId || previous?.productTaxonomy?.conceptId || (productFoodTaxonomy ? 'product_concept_other' : null);
  if (requestedProductFood) {
    const concept = referenceIndex.assertTerm(requestedProductFood, TAXONOMY_IDS.productFood);
    const productSubcategory = concept.parentTermId ? referenceIndex.assertTerm(concept.parentTermId, TAXONOMY_IDS.productFood) : null;
    const productCategory = productSubcategory?.parentTermId ? referenceIndex.assertTerm(productSubcategory.parentTermId, TAXONOMY_IDS.productFood) : null;
    if (!productCategory || !productSubcategory || productCategory.parentTermId !== null || productSubcategory.parentTermId !== productCategory.termId) throw new Error('Product food selection must be an IngredientConcept');
    revisionBase.productTaxonomy = { categoryId: productCategory.termId, subcategoryId: productSubcategory.termId, conceptId: concept.termId };
  }
  const defaultLabel = { it: input.variantLabelIt || input.state || 'Stato da verificare', en: input.variantLabelEn || input.variantLabelIt || input.state || 'State to check' };
  revisionBase.display = { it: { variantLabel: defaultLabel.it }, en: { variantLabel: defaultLabel.en } };
  revisionBase.safetyEvidence = legacySafetyEvidence(revisionBase);
  revisionBase.contentHash = await sha256Json({ ...revisionBase, contentHash: '' });
  assertIngredientRevisionV2(revisionBase, { registry, index: referenceIndex });
  const family = {
    schemaVersion: 1, ingredientId, origin: 'user', currentRevisionId: ingredientRevisionId, status: 'active',
    createdAt: existing?.createdAt || createdAt, updatedAt: createdAt
  };
  registry.assert('ingredientRevision', revisionBase); registry.assert('ingredient', family);
  await repo.atomicPut({ ingredientRevisions: [revisionBase], ingredients: [family] });
  return { family, revision: revisionBase, promotedFromBase: existing?.origin === 'base' };
}

export async function archiveUserIngredient(ingredientId, { repo = repositories } = {}) {
  const family = await repo.get('ingredients', ingredientId);
  if (!family || family.origin !== 'user') throw new Error('Archive requires a locally managed ingredient');
  const next = { ...family, status: 'archived', updatedAt: nowIso() }; await repo.put('ingredients', next); return next;
}

async function prepareRecipeLines(inputLines, repo) {
  if (!Array.isArray(inputLines) || !inputLines.length) throw new Error('A recipe needs at least one ingredient');
  const revisionIds = inputLines.map(line => line.ingredientRevisionId);
  const revisions = await repo.getMany('ingredientRevisions', revisionIds); const byId = new Map(revisions.map(record => [record.ingredientRevisionId, record]));
  const conversions = await repo.getAll('ingredientConversions');
  const lines = inputLines.map(line => {
    const revision = byId.get(line.ingredientRevisionId); if (!revision) throw new Error(`Ingredient revision ${line.ingredientRevisionId} does not exist`);
    if (revision.ingredientId !== line.ingredientId) throw new Error(`Ingredient/revision mismatch for ${line.ingredientId}`);
    const normalized = normalizeIngredientAmount(revision, line.amount, line.unit, { conversions, conversionId: line.conversionId || null, version: line.conversionVersion ?? null });
    return { ingredientId: line.ingredientId, ingredientRevisionId: line.ingredientRevisionId, amount: Number(line.amount), unit: line.unit, ...normalized, optional: Boolean(line.optional), notesKey: null };
  });
  return { lines, byId };
}

/**
 * Save a recipe regardless of its original catalog origin. Historical
 * RecipeVersion records remain immutable. Editing a bundled/base recipe creates
 * a new user-owned version and promotes the family to local management.
 */
export async function saveRecipe(input, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (input.schemaVersion !== undefined && ![1, 2].includes(input.schemaVersion)) throw new Error('Unsupported recipe schema version');
  const referenceIndex = await loadReferenceDataIndex(repo);
  const existing = input.recipeId ? await repo.get('recipes', input.recipeId) : null;
  const previous = existing ? await repo.get('recipeVersions', existing.currentVersionId) : null;
  const recipeId = existing?.recipeId || `urec_${slug(input.titleIt || input.titleEn, 'recipe')}_${suffix()}`;
  const versionNumber = (previous?.versionNumber || 0) + 1; const createdAt = nowIso();
  const recipeVersionId = `${recipeId}_v${versionNumber}_${suffix().slice(0, 5)}`;
  const { lines, byId } = await prepareRecipeLines(input.ingredientLines, repo);
  const calculatedNutrition = calculateRecipeNutrition(lines, byId); const allergenIds = deriveAllergens(lines, byId);
  const ingredientNames = [...byId.values()].flatMap(revision => Object.values(revision.i18n).flatMap(text => [text.name, ...(text.aliases || [])]));
  const tagInput = {
    families: semanticIdList(input.families, 'Recipe families'), cuisines: semanticIdList(input.cuisines, 'Cuisines'), diet: semanticIdList(input.diet, 'Diet tags'), flavor: semanticIdList(input.flavor, 'Flavor profiles'), practical: semanticIdList(input.practicalTags, 'Practical tags'), preparation: semanticIdList(input.preparationTags, 'Preparation techniques')
  };
  const tags = {};
  for (const [key, values] of Object.entries(tagInput)) {
    if (!values.length) continue;
    const taxonomyId = RECIPE_TAG_TAXONOMY[key];
    tags[key] = values.map(value => referenceIndex.assertTerm(value, taxonomyId).termId);
  }
  const searchTokens = unique([
    ...splitTokens(input.titleIt), ...splitTokens(input.titleEn), ...ingredientNames.flatMap(splitTokens),
    ...Object.values(tags).flatMap(values => values.flatMap(splitTokens))
  ]).sort();
  const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
  const version = {
    schemaVersion: 2, recipeVersionId, recipeId, versionNumber, supersedesVersionId: previous?.recipeVersionId || null, origin: 'user', catalogVersion: null,
    i18n: recipeTextV2({ it: { title: String(input.titleIt || input.titleEn || '').trim(), description: String(input.descriptionIt || '').trim() }, en: { title: String(input.titleEn || input.titleIt || '').trim(), description: String(input.descriptionEn || input.descriptionIt || '').trim() } }),
    servingCount: 1, mealArchetypes: unique(input.mealArchetypes || []), ingredientLines: lines, calculatedNutrition,
    practical: {
      prepMinutes: requiredNumber(input.prepMinutes, 'Prep minutes'), cookMinutes: requiredNumber(input.cookMinutes, 'Cook minutes'), eatingMinutes: optionalNumber(input.eatingMinutes, 'Eating minutes'), reheatingRequired: Boolean(input.reheatingRequired),
      coldSuitable: Boolean(input.coldSuitable), portable: Boolean(input.portable), fridgeRequired: Boolean(input.fridgeRequired),
      freezerSuitable: Boolean(input.freezerSuitable), mealPrepSuitable: Boolean(input.mealPrepSuitable),
      finalWeightG: input.finalWeightG ? Number(input.finalWeightG) : null, finalVolumeMl: input.finalVolumeMl ? Number(input.finalVolumeMl) : null,
      yieldNotes: String(input.yieldNotes || '').trim() || null
    },
    practicalEvidence: { status: 'user_declared', sourceRef: `local:${recipeVersionId}` },
    tags, allergenIds, searchTokens, calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '',
    generation: { jobId: null, pipelineVersion: existing ? 'user-edit-1' : 'user-authoring-1', sourceLocale: null, generatedAt: createdAt },
    quality: { status: 'validated', reviewNotes: null }, createdAt
  };
  if (!version.mealArchetypes.length) throw new Error('At least one meal archetype is required');
  assertSemanticReferences({ index: referenceIndex, ingredientRevisions: [...byId.values()], recipeVersions: [version], ingredientIds: lines.map(line => line.ingredientId) });
  version.contentHash = await sha256Json({ ...version, contentHash: '' });
  const family = { schemaVersion: 1, recipeId, origin: 'user', currentVersionId: recipeVersionId, status: 'active', createdAt: existing?.createdAt || createdAt, updatedAt: createdAt };
  registry.assert('recipeVersion', version); registry.assert('recipe', family);
  await repo.atomicPut({ recipeVersions: [version], recipes: [family] });
  return { family, version, promotedFromBase: existing?.origin === 'base' };
}

export async function archiveUserRecipe(recipeId, { repo = repositories } = {}) {
  const family = await repo.get('recipes', recipeId); if (!family || family.origin !== 'user') throw new Error('Archive requires a locally managed recipe');
  const next = { ...family, status: 'archived', updatedAt: nowIso() }; await repo.put('recipes', next); return next;
}

function draftFromVersion(version, { duplicate = false, proposedTitles = null } = {}) {
  const titleIt = proposedTitles?.it || version.i18n.it.title; const titleEn = proposedTitles?.en || version.i18n.en.title;
  return {
    titleIt: duplicate ? `${titleIt.slice(0, 62)} - copia` : titleIt,
    titleEn: duplicate ? `${titleEn.slice(0, 63)} - copy` : titleEn,
    descriptionIt: version.i18n.it.description || '', descriptionEn: version.i18n.en.description || '',
    schemaVersion: 2, originalNutrition: structuredClone(version.calculatedNutrition), mealArchetypes: [...version.mealArchetypes],
    ingredientLines: version.ingredientLines.map(line => ({ ingredientId: line.ingredientId, ingredientRevisionId: line.ingredientRevisionId, amount: line.amount, unit: line.unit, optional: line.optional })),
    prepMinutes: version.practical.prepMinutes, cookMinutes: version.practical.cookMinutes, eatingMinutes: version.practical.eatingMinutes ?? null, reheatingRequired: version.practical.reheatingRequired,
    coldSuitable: version.practical.coldSuitable, portable: version.practical.portable, fridgeRequired: version.practical.fridgeRequired,
    freezerSuitable: Boolean(version.practical.freezerSuitable), mealPrepSuitable: version.practical.mealPrepSuitable,
    finalWeightG: version.practical.finalWeightG, finalVolumeMl: version.practical.finalVolumeMl, yieldNotes: version.practical.yieldNotes || '',
    families: [...(version.tags.families || [])], cuisines: [...(version.tags.cuisines || [])], diet: [...(version.tags.diet || [])], flavor: [...(version.tags.flavor || [])], practicalTags: [...(version.tags.practical || [])], preparationTags: [...(version.tags.preparation || [])]
  };
}

export async function recipeToDraft(recipeId, { repo = repositories, duplicate = false, recipeVersionId = null } = {}) {
  const family = await repo.get('recipes', recipeId); if (!family) throw new Error('Recipe not found');
  const version = await repo.get('recipeVersions', recipeVersionId || family.currentVersionId); if (!version || version.recipeId !== recipeId) throw new Error('Recipe version not found');
  let proposedTitles = null;
  try { assertRecipeTitle(version.i18n.it.title); assertRecipeTitle(version.i18n.en.title); }
  catch {
    const index = await loadReferenceDataIndex(repo); const revisions = await repo.getMany('ingredientRevisions', version.ingredientLines.map(line => line.ingredientRevisionId));
    proposedTitles = { it: recipeTitleFromIngredients(revisions, index, 'it'), en: recipeTitleFromIngredients(revisions, index, 'en') };
  }
  return draftFromVersion(version, { duplicate, proposedTitles });
}

// Backward-compatible aliases used by older scripts/tests. New UI uses the neutral names.
export const saveUserIngredient = saveIngredient;
export const saveUserRecipe = saveRecipe;
export async function duplicateRecipeToDraft(recipeId, options = {}) { return recipeToDraft(recipeId, { ...options, duplicate: true }); }
