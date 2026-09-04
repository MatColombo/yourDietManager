import { CALCULATION_ALGORITHM_VERSION, calculateRecipeNutrition, deriveAllergens, normalizeIngredientAmount } from '../domain/nutritionCore.js';
import { sha256Json, sha256Text } from '../lib/crypto.js';
import { bandIdFor, exactRecipeSignature, jaccard, primaryIngredientId, recipeIngredientSet, textTokens, tokenSimilarity, unique } from './corpusMath.js';
import { assertReferenceData, assertSemanticReferences } from '../services/referenceDataService.js';

function totalMinutes(practical = {}) { return Number(practical.prepMinutes || 0) + Number(practical.cookMinutes || 0); }
function flattenTags(tags = {}) { return new Set(Object.values(tags).flatMap(value => Array.isArray(value) ? value : [])); }
function boolean(value) { return Boolean(value); }
function normalizeTags(tags = {}) {
  const out = {};
  for (const key of ['families','cuisines','diet','flavor','practical','preparation']) { const values = unique(tags[key] || []).sort(); if (values.length) out[key] = values; }
  return out;
}
function normalizePractical(value = {}) {
  return {
    prepMinutes: Math.max(0, Math.round(Number(value.prepMinutes || 0))), cookMinutes: Math.max(0, Math.round(Number(value.cookMinutes || 0))),
    reheatingRequired: boolean(value.reheatingRequired), coldSuitable: boolean(value.coldSuitable), portable: boolean(value.portable), fridgeRequired: boolean(value.fridgeRequired),
    freezerSuitable: boolean(value.freezerSuitable), mealPrepSuitable: boolean(value.mealPrepSuitable), finalWeightG: value.finalWeightG == null ? null : Number(value.finalWeightG), finalVolumeMl: value.finalVolumeMl == null ? null : Number(value.finalVolumeMl), yieldNotes: value.yieldNotes == null || value.yieldNotes === '' ? null : String(value.yieldNotes)
  };
}
function requiredLocalesPresent(candidate, locales) { return locales.every(locale => candidate.i18n?.[locale]?.title?.trim() && Array.isArray(candidate.i18n?.[locale]?.instructions) && candidate.i18n[locale].instructions.length && candidate.i18n[locale].instructions.every(item => String(item).trim())); }
function practicalMatches(target, practical, tags) {
  if (target === 'practical_quick') return totalMinutes(practical) <= 20;
  if (target === 'practical_portable') return practical.portable;
  if (target === 'practical_cold_suitable') return practical.coldSuitable;
  if (target === 'practical_reheatable') return practical.reheatingRequired;
  if (target === 'practical_meal_prep') return practical.mealPrepSuitable;
  return tags.has(target);
}
function rangeIncludes(value, range) { return range == null || (Number(value) >= Number(range.min) && Number(value) <= Number(range.max)); }
function recipeTitle(recipe, locale) { return recipe.i18n?.[locale]?.title || ''; }
function nearDuplicate(a, b, policy, locales) {
  const ingredient = jaccard(recipeIngredientSet(a), recipeIngredientSet(b)); let title = 0;
  for (const locale of locales) title = Math.max(title, tokenSimilarity(recipeTitle(a, locale), recipeTitle(b, locale)));
  return ingredient >= policy.similarity.highJaccardThreshold || title >= policy.similarity.titleSimilarityThreshold;
}
function pairKeys(ids) { const sorted = [...new Set(ids)].sort(); const keys=[]; for(let i=0;i<sorted.length;i+=1) for(let j=i+1;j<sorted.length;j+=1) keys.push(`${sorted[i]}\u0000${sorted[j]}`); return keys; }
function cleanI18n(i18n, locales) {
  const out = {};
  for (const locale of locales) { const value = i18n[locale]; out[locale] = { title: String(value.title).trim(), description: String(value.description || '').trim(), instructions: value.instructions.map(item => String(item).trim()).filter(Boolean) }; }
  return out;
}
function deriveDietTags(revisions, explicit = []) {
  const tags = new Set(explicit); const groups = new Set(revisions.map(revision => revision.taxonomy?.foodGroup));
  const hasAnimal = [...groups].some(group => ['food_group_meat','food_group_poultry','food_group_fish_seafood'].includes(group));
  if (!hasAnimal) tags.add('diet_vegetarian');
  return [...tags].sort();
}
function searchTokensFor(recipe, revisions) {
  const values = [
    ...Object.values(recipe.i18n).flatMap(text => [text.title, text.description, ...(text.instructions || [])]),
    ...revisions.flatMap(revision => Object.values(revision.i18n || {}).flatMap(text => [text.name, ...(text.aliases || [])])),
    ...Object.values(recipe.tags || {}).flat()
  ];
  return unique(values.flatMap(textTokens)).sort();
}
function reject(candidate, code, detail = null) { return { candidateId: candidate.candidateId || null, code, detail }; }
function coverageCriterionMatches(criterion, { meals, nutrition, practical, tags, usedRevisions, policy, flatTags }) {
  if (criterion.dimension === 'meal_archetype') return meals.includes(criterion.key);
  if (criterion.dimension === 'energy_band') return bandIdFor(nutrition.energyKcal, policy.energyBands) === criterion.key;
  if (criterion.dimension === 'protein_band') return bandIdFor(nutrition.proteinG, policy.proteinBands) === criterion.key;
  if (criterion.dimension === 'fiber_band') return bandIdFor(nutrition.fiberG, policy.fiberBands) === criterion.key;
  if (criterion.dimension === 'practicality') return practicalMatches(criterion.key, practical, flatTags);
  if (criterion.dimension === 'diet') return (tags.diet || []).includes(criterion.key);
  if (criterion.dimension === 'recipe_family') return (tags.families || []).includes(criterion.key);
  if (criterion.dimension === 'cuisine') return (tags.cuisines || []).includes(criterion.key);
  if (criterion.dimension === 'ingredient_category') return usedRevisions.some(revision => revision.taxonomy?.foodGroup === criterion.key);
  return false;
}
function missedCoverageTarget(job, context) {
  for (const target of job.coverageTargets || []) {
    if (!target.criteria?.length) continue;
    if (!target.criteria.every(criterion => coverageCriterionMatches(criterion, context))) return target.targetId;
  }
  return null;
}

export async function processCandidateBatch({ job, candidates, policy, ingredientFamilies, ingredientRevisions, existingRecipeVersions = [], taxonomies = [], taxonomyTerms = [], registry = null, productionContext = null, generatedAt = null }) {
  if (!Array.isArray(candidates)) throw new Error('Candidates must be an array');
  if (productionContext) {
    if (!job.productionContract) throw new Error('Production candidate processing requires RecipeGenerationJob.productionContract');
    if (job.productionContract.contractId !== productionContext.contractId || job.productionContract.contractVersion !== productionContext.contractVersion) throw new Error('Production candidate context does not match RecipeGenerationJob contract');
    if (!productionContext.intakeId) throw new Error('Production candidate processing requires intakeId');
  }
  if (candidates.length > job.candidateCount) throw new Error(`Received ${candidates.length} candidates but job allows ${job.candidateCount}`);
  const referenceIndex = taxonomies.length || taxonomyTerms.length ? assertReferenceData(taxonomies, taxonomyTerms, registry) : null;
  if ((job.referenceDataVersion || job.referenceDataDigest) && !referenceIndex) throw new Error('RecipeGenerationJob freezes reference data but no taxonomy snapshot was supplied');
  const familyById = new Map(ingredientFamilies.map(record => [record.ingredientId, record])); const revisionById = new Map(ingredientRevisions.map(record => [record.ingredientRevisionId, record]));
  const currentRevisionByIngredient = new Map(); for (const family of ingredientFamilies) { const revision = revisionById.get(family.currentRevisionId); if (revision) currentRevisionByIngredient.set(family.ingredientId, revision); }
  const allowed = new Set(job.allowedIngredientIds); const acceptedFamilies = [], acceptedVersions = [], rejected = [], warnings = [];
  const signatures = new Set(existingRecipeVersions.map(exactRecipeSignature)); const comparison = [...existingRecipeVersions];
  const primaryCounts = new Map(), pairCounts = new Map(), distinctIngredientIds = new Set(), distinctPrimary = new Set(); const timestamp = generatedAt || new Date().toISOString();

  for (const candidate of candidates) {
    if (acceptedVersions.length >= job.targetAcceptedCount) { rejected.push(reject(candidate, 'target_already_reached')); continue; }
    try {
      if (!candidate?.candidateId) { rejected.push(reject(candidate, 'missing_candidate_id')); continue; }
      if (candidate.culinaryReview?.status !== 'approved') { rejected.push(reject(candidate, 'culinary_review_not_approved')); continue; }
      if (!requiredLocalesPresent(candidate, job.requiredLocales)) { rejected.push(reject(candidate, 'missing_required_locale_fields')); continue; }
      const candidateMeals = unique(candidate.mealArchetypes || []); if (!candidateMeals.some(meal => job.mealArchetypes.includes(meal))) { rejected.push(reject(candidate, 'meal_archetype_outside_job')); continue; }
      if (!Array.isArray(candidate.ingredientLines) || !candidate.ingredientLines.length) { rejected.push(reject(candidate, 'no_ingredients')); continue; }
      const duplicateIngredient = new Set(candidate.ingredientLines.map(line => line.ingredientId)).size !== candidate.ingredientLines.length; if (duplicateIngredient) { rejected.push(reject(candidate, 'duplicate_ingredient_line')); continue; }
      const lines = []; const usedRevisions = [];
      let bad = null;
      for (const line of candidate.ingredientLines) {
        if (!allowed.has(line.ingredientId)) { bad = reject(candidate, 'ingredient_not_allowed', line.ingredientId); break; }
        const family = familyById.get(line.ingredientId); const revision = currentRevisionByIngredient.get(line.ingredientId);
        if (!family || family.status !== 'active' || !revision) { bad = reject(candidate, 'unknown_ingredient', line.ingredientId); break; }
        const normalized = normalizeIngredientAmount(revision, line.amount, line.unit);
        if (normalized.normalizedAmount > 1500) { bad = reject(candidate, 'ingredient_amount_implausible', line.ingredientId); break; }
        lines.push({ ingredientId: line.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, amount: Number(line.amount), unit: line.unit, ...normalized, optional: Boolean(line.optional), notesKey: line.notesKey || null }); usedRevisions.push(revision);
      }
      if (bad) { rejected.push(bad); continue; }
      const normalizedTotal = lines.reduce((sum,line) => sum + Number(line.normalizedAmount || 0), 0); if (normalizedTotal < 40 || normalizedTotal > 2500) { rejected.push(reject(candidate, 'portion_size_implausible', normalizedTotal)); continue; }
      const nutrition = calculateRecipeNutrition(lines, new Map(usedRevisions.map(record => [record.ingredientRevisionId, record])));
      if (!rangeIncludes(nutrition.energyKcal, job.energyKcal) || !rangeIncludes(nutrition.proteinG, job.proteinG) || !rangeIncludes(nutrition.fiberG, job.fiberG)) { rejected.push(reject(candidate, 'nutrition_outside_job', nutrition)); continue; }
      const practical = normalizePractical(candidate.practical); if (job.maxTotalMinutes != null && totalMinutes(practical) > job.maxTotalMinutes) { rejected.push(reject(candidate, 'prep_time_outside_job')); continue; }
      let tags = normalizeTags(candidate.tags); tags.diet = deriveDietTags(usedRevisions, tags.diet || []);
      const flatTags = flattenTags(tags); if ((job.requiredTags || []).some(tag => !flatTags.has(tag))) { rejected.push(reject(candidate, 'missing_required_tag')); continue; }
      if ((job.forbiddenTags || []).some(tag => flatTags.has(tag))) { rejected.push(reject(candidate, 'forbidden_tag')); continue; }
      if ((job.recipeFamilies || []).length && !(tags.families || []).some(value => job.recipeFamilies.includes(value))) { rejected.push(reject(candidate, 'recipe_family_outside_job')); continue; }
      if ((job.cuisineFocus || []).length && !(tags.cuisines || []).some(value => job.cuisineFocus.includes(value))) { rejected.push(reject(candidate, 'cuisine_outside_job')); continue; }
      if ((job.practicalityTargets || []).some(target => !practicalMatches(target, practical, flatTags))) { rejected.push(reject(candidate, 'practicality_target_missed')); continue; }
      const missedTargetId = missedCoverageTarget(job, { meals: candidateMeals, nutrition, practical, tags, usedRevisions, policy, flatTags });
      if (missedTargetId) { rejected.push(reject(candidate, 'coverage_target_missed', missedTargetId)); continue; }
      const allergenIds = deriveAllergens(lines, new Map(usedRevisions.map(record => [record.ingredientRevisionId, record])));
      const provisional = { ingredientLines: lines, mealArchetypes: candidateMeals, tags };
      const signature = exactRecipeSignature(provisional); if (signatures.has(signature)) { rejected.push(reject(candidate, 'exact_duplicate')); continue; }
      const primary = primaryIngredientId(provisional, new Set(policy.diversity.exemptIngredientIds || []));
      if (primary && (primaryCounts.get(primary) || 0) + 1 > job.diversityTargets.maxPrimaryIngredientFrequency) { rejected.push(reject(candidate, 'diversity_primary_frequency', primary)); continue; }
      const pairs = pairKeys(lines.map(line => line.ingredientId)); const repeatedPair = pairs.find(key => (pairCounts.get(key) || 0) + 1 > job.diversityTargets.maxIngredientPairFrequency); if (repeatedPair) { rejected.push(reject(candidate, 'diversity_pair_frequency', repeatedPair.replace('\u0000','+'))); continue; }
      const identityDigest = await sha256Text(`${job.seed}\n${candidate.candidateId}\n${signature}`); const recipeId = `rec_${identityDigest.slice(0,20)}`; const recipeVersionId = `recver_${identityDigest.slice(0,24)}_v1`;
      const i18n = cleanI18n(candidate.i18n, job.requiredLocales);
      const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
      const version = {
        schemaVersion: 1, recipeVersionId, recipeId, versionNumber: 1, supersedesVersionId: null, origin: 'base', catalogVersion: job.targetCatalogVersion, i18n, servingCount: 1, mealArchetypes: candidateMeals, ingredientLines: lines, calculatedNutrition: nutrition, practical, tags, allergenIds,
        searchTokens: [], calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '', generation: { jobId: job.jobId, candidateId: candidate.candidateId, pipelineVersion: job.pipelineVersion, sourceLocale: job.sourceLocale, generatedAt: timestamp, ...(productionContext ? { intakeId: productionContext.intakeId, productionContractId: productionContext.contractId, productionContractVersion: productionContext.contractVersion } : {}) }, quality: { status: 'validated', reviewNotes: candidate.culinaryReview?.notes || null }, createdAt: timestamp
      };
      if (referenceIndex) assertSemanticReferences({ index: referenceIndex, ingredientRevisions: usedRevisions, recipeVersions: [version], ingredientIds: ingredientFamilies.map(item => item.ingredientId) });
      version.searchTokens = searchTokensFor(version, usedRevisions);
      if (comparison.some(existing => nearDuplicate(version, existing, policy, job.requiredLocales))) { rejected.push(reject(candidate, 'near_duplicate')); continue; }
      version.contentHash = await sha256Json({ ...version, contentHash: '' });
      const family = { schemaVersion: 1, recipeId, origin: 'base', currentVersionId: recipeVersionId, status: 'active', createdAt: timestamp, updatedAt: timestamp };
      if (registry) { registry.assert('recipeVersion', version); registry.assert('recipe', family); }
      const macroEnergy = nutrition.proteinG*4 + nutrition.carbsG*4 + nutrition.fatG*9;
      const energyBases = unique(usedRevisions.map(revision => revision.source?.energyBasis || 'unknown'));
      const generalComparable = energyBases.every(basis => basis === 'atwater_general' || basis === 'unknown');
      if (generalComparable && nutrition.energyKcal > 0 && Math.abs(macroEnergy - nutrition.energyKcal) / nutrition.energyKcal > 0.2) warnings.push({ candidateId: candidate.candidateId, code: 'macro_energy_mismatch', calculatedFromMacros: Math.round(macroEnergy), energyKcal: nutrition.energyKcal, energyBases });
      acceptedFamilies.push(family); acceptedVersions.push(version); comparison.push(version); signatures.add(signature);
      for (const line of lines) distinctIngredientIds.add(line.ingredientId); if (primary) { distinctPrimary.add(primary); primaryCounts.set(primary,(primaryCounts.get(primary)||0)+1); } for(const key of pairs) pairCounts.set(key,(pairCounts.get(key)||0)+1);
    } catch (error) { rejected.push(reject(candidate, 'pipeline_exception', error instanceof Error ? error.message : String(error))); }
  }
  const diversityFailures = [];
  if (acceptedVersions.length && distinctPrimary.size < Math.min(job.diversityTargets.minDistinctPrimaryIngredients, acceptedVersions.length)) diversityFailures.push({ code:'min_distinct_primary_not_met', actual:distinctPrimary.size, required:Math.min(job.diversityTargets.minDistinctPrimaryIngredients, acceptedVersions.length) });
  if (acceptedVersions.length && distinctIngredientIds.size < Math.min(job.diversityTargets.minDistinctIngredientIds, new Set(job.allowedIngredientIds).size)) diversityFailures.push({ code:'min_distinct_ingredients_not_met', actual:distinctIngredientIds.size, required:Math.min(job.diversityTargets.minDistinctIngredientIds,new Set(job.allowedIngredientIds).size) });
  return {
    jobId: job.jobId, candidateCount: candidates.length, acceptedCount: acceptedVersions.length, rejectedCount: rejected.length, targetAcceptedCount: job.targetAcceptedCount,
    acceptanceRate: candidates.length ? acceptedVersions.length / candidates.length : 0, targetMet: acceptedVersions.length >= job.targetAcceptedCount, diversityPassed: diversityFailures.length === 0,
    families: acceptedFamilies, versions: acceptedVersions, rejected, warnings, diversityFailures
  };
}
