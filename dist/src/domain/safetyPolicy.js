import { allergenCompatibility } from './safetyCompatibility.js';
import { recipeMatchesTarget } from '../planner/recipeFeatures.js';

export function activeSafetyRules(profile, date = null) {
  const values = profile?.schemaVersion === 2 ? [...profile.rules, ...(profile.legacyRules || [])] : profile?.rules || [];
  return values.filter(rule => rule.enabled && (!date || !rule.effectiveFrom || rule.effectiveFrom <= date));
}
export function safetyTarget(rule) { return rule.target || { type: rule.targetType, id: rule.targetId }; }
function evidenceComplete(revision) {
  const e = revision?.safetyEvidence;
  return e?.assessmentStatus === 'reviewed' && e.compositionCompleteness === 'complete' && e.sourceRefs?.length && e.reviewedBy && e.reviewedAt;
}
export function assessRecipeSafety(recipe, { allergyProfile, revisionById = new Map(), foodGroups = [], date = null } = {}) {
  const results = [];
  for (const rule of activeSafetyRules(allergyProfile, date)) {
    const target = safetyTarget(rule); let status = 'compatible'; let reason = 'composition_compatible';
    if (target.type === 'allergen') {
      status = allergenCompatibility(recipe, target.id, revisionById);
      if (status === 'incompatible') reason = (recipe.ingredientLines || []).some(line => revisionById.get(line.ingredientRevisionId)?.safetyEvidence?.mayContainAllergenIds?.includes(target.id)) ? 'known_traces' : 'known_composition';
      if (status === 'unknown') reason = 'composition_unverified';
    } else {
      const missingGroup = target.type === 'foodGroup' && !foodGroups.some(group => group.id === target.id && group.status === 'active');
      if (missingGroup) { status = 'unknown'; reason = 'group_unresolved'; }
      else if (recipeMatchesTarget(recipe, target.type, target.id, revisionById, foodGroups)) { status = 'incompatible'; reason = 'excluded_ingredient'; }
      else if (!recipe.ingredientLines?.length || recipe.ingredientLines.some(line => {
        if (line.included === false) return false;
        const revision = revisionById.get(line.ingredientRevisionId);
        return !revision || revision.ingredientId !== line.ingredientId || !revision.productTaxonomy || (allergyProfile.schemaVersion === 2 && !evidenceComplete(revision));
      })) { status = 'unknown'; reason = 'composition_unverified'; }
    }
    results.push({ ruleId: rule.id, kind: rule.kind, target, status, reason });
  }
  return { status: results.some(row => row.status === 'incompatible') ? 'incompatible' : results.some(row => row.status === 'unknown') ? 'unknown' : 'compatible',
    rules: results, guarantee: 'available_composition_evidence_only', checkProductLabel: results.length > 0 };
}

// Current evidence is an overlay. Nutritional computations keep the frozen map.
export function currentSafetyRevisionMap(frozenRevisions, ingredients, revisions) {
  const byId = new Map(revisions.map(row => [row.ingredientRevisionId, row]));
  const current = new Map(ingredients.map(family => [family.ingredientId, byId.get(family.currentRevisionId)]));
  return new Map(frozenRevisions.map(revision => [revision.ingredientRevisionId, current.get(revision.ingredientId) || revision]));
}
