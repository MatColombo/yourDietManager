import { CATALOG_QUARANTINE } from './catalogQuarantine.js';

const quarantinedIngredients = new Set(CATALOG_QUARANTINE.ingredients.map(item => item.ingredientId));
const quarantinedRecipes = new Set(CATALOG_QUARANTINE.recipes.map(item => item.recipeVersionId));
const seafoodGroups = new Set(['food_group_fish_seafood', 'fish_seafood']);

export function isDocumentedReadySeafood(revision) {
  return Boolean(revision?.source?.reference || revision?.source?.sourceRecordId)
    && ['cooked', 'ready_to_eat'].includes(revision?.basis?.state);
}

export function recipeQuarantineReasons(recipe, revisionById = new Map()) {
  const reasons = [];
  if (quarantinedRecipes.has(recipe.recipeVersionId)) reasons.push('quarantine:raw_seafood_without_cooking');
  for (const line of recipe.ingredientLines || []) {
    const revision = revisionById.get(line.ingredientRevisionId);
    if (!revision || revision.ingredientId !== line.ingredientId) { reasons.push('quarantine:missing_ingredient_revision'); continue; }
    const seafood = seafoodGroups.has(revision.taxonomy?.foodGroup)
      || revision.productTaxonomy?.categoryId === 'product_category_fish_seafood';
    if (seafood && Number(recipe.practical?.cookMinutes || 0) === 0 && !isDocumentedReadySeafood(revision)) {
      reasons.push('quarantine:seafood_readiness_unverified');
    }
  }
  return [...new Set(reasons)];
}

// Absence of a legacy tag is never evidence of absence. Search concepts do not
// carry allergen evidence: rice pasta and semolina pasta remain independent.
export function allergenCompatibility(recipe, allergenId, revisionById = new Map()) {
  if (!recipe.ingredientLines?.length) return 'unknown';
  let unknown = false;
  for (const line of recipe.ingredientLines) {
    const revision = revisionById.get(line.ingredientRevisionId);
    if (!revision || revision.ingredientId !== line.ingredientId) { unknown = true; continue; }
    const evidence = revision.safetyEvidence;
    if (quarantinedIngredients.has(revision.ingredientId) && evidence?.assessmentStatus !== 'reviewed') { unknown = true; continue; }
    if (evidence?.containsAllergenIds?.includes(allergenId) || evidence?.mayContainAllergenIds?.includes(allergenId)) return 'incompatible';
    if (!evidence && revision.allergenIds?.includes(allergenId)) return 'incompatible';
    if (evidence?.assessmentStatus !== 'reviewed' || evidence.compositionCompleteness !== 'complete'
      || !evidence.sourceRefs?.length || !evidence.reviewedBy || !evidence.reviewedAt) unknown = true;
  }
  return unknown ? 'unknown' : 'compatible';
}

export function legacySafetyEvidence(revision) {
  return {
    assessmentStatus: 'unreviewed', containsAllergenIds: [...(revision.allergenIds || [])],
    mayContainAllergenIds: [], compositionCompleteness: 'unknown',
    sourceRefs: [...new Set([revision.source?.reference, revision.source?.sourceRecordId, `legacy:${revision.ingredientRevisionId}`].filter(Boolean))],
    reviewedBy: null, reviewedAt: null, policyVersion: CATALOG_QUARANTINE.policyVersion
  };
}
