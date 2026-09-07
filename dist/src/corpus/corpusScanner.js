import { calculateRecipeNutrition, deriveAllergens } from '../domain/nutritionCore.js';
import { sha256Json } from '../lib/crypto.js';
import { bandIdFor, countEntries, coverageDeficit, exactRecipeSignature, increment, jaccard, primaryIngredientId, recipeIngredientSet, round, targetIsUndercovered, textTokens, tokenSimilarity, unique } from './corpusMath.js';

const PRACTICAL_KEYS = ['practical_portable', 'practical_quick', 'practical_cold_suitable', 'practical_reheatable', 'practical_meal_prep'];
function approxEqual(a, b, epsilon = 0.11) { return Math.abs(Number(a) - Number(b)) <= epsilon; }
function pairKey(a, b) { return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; }
function targetCount(target, distributions, compoundCounts = null) {
  if (target.criteria?.length) return compoundCounts?.get(target.targetId) || 0;
  const map = {
    meal_archetype: distributions.mealArchetypes,
    energy_band: distributions.energyBands,
    protein_band: distributions.proteinBands,
    fiber_band: distributions.fiberBands,
    practicality: distributions.practicality,
    diet: distributions.diet,
    recipe_family: distributions.recipeFamilies,
    cuisine: distributions.cuisines,
    ingredient_category: distributions.ingredientCategories
  }[target.dimension];
  return map?.get(target.key) || 0;
}
function recipePracticality(recipe) {
  const values = new Set(recipe.tags?.practical || []);
  const total = Number(recipe.practical?.prepMinutes || 0) + Number(recipe.practical?.cookMinutes || 0);
  if (total <= 20) values.add('practical_quick');
  if (recipe.practical?.portable) values.add('practical_portable');
  if (recipe.practical?.coldSuitable) values.add('practical_cold_suitable'); else if (recipe.practical?.reheatingRequired) values.add('practical_reheatable');
  if (recipe.practical?.mealPrepSuitable) values.add('practical_meal_prep');
  return [...values].filter(value => PRACTICAL_KEYS.includes(value) || value);
}
function missingLocaleFields(recipe, locales) {
  let count = 0;
  for (const locale of locales) {
    const value = recipe.i18n?.[locale];
    if (!value?.title?.trim()) count += 1;
    if (!Array.isArray(value?.instructions) || !value.instructions.length || value.instructions.some(item => !String(item).trim())) count += 1;
  }
  return count;
}
function schemaErrorCount(records, registry, type) {
  if (!registry) return 0;
  let errors = 0; for (const record of records) { try { registry.assert(type, record); } catch { errors += 1; } }
  return errors;
}

export function evaluateReleaseGates(snapshot, policy) {
  const gates = policy.releaseGates;
  const failed = [];
  const checks = [
    ['schemaErrors', snapshot.quality.schemaErrors, gates.maxSchemaErrors],
    ['unknownIngredientReferences', snapshot.quality.unknownIngredientReferences, gates.maxUnknownIngredientReferences],
    ['nutritionErrors', snapshot.quality.nutritionErrors, gates.maxNutritionErrors],
    ['allergenDerivationErrors', snapshot.quality.allergenDerivationErrors, gates.maxAllergenDerivationErrors],
    ['exactDuplicateCount', snapshot.similarity.exactDuplicateCount, gates.maxExactDuplicates],
    ['missingRequiredLocaleFields', snapshot.quality.missingRequiredLocaleFields, gates.maxMissingRequiredLocaleFields]
  ];
  for (const [key, actual, max] of checks) if (actual > max) failed.push({ key, actual, max });
  const cellById = new Map(snapshot.coverageCells.map(cell => [cell.targetId, cell]));
  for (const target of policy.coverageTargets.filter(target => target.hardForRelease)) {
    const cell = cellById.get(target.targetId); const count = cell?.currentCount || 0; const share = cell?.currentShare || 0;
    if (target.minCount != null && count < target.minCount) failed.push({ key: `coverage:${target.targetId}:minCount`, actual: count, min: target.minCount });
    if (target.minShare != null && share < target.minShare) failed.push({ key: `coverage:${target.targetId}:minShare`, actual: share, min: target.minShare });
  }
  if (snapshot.similarity.nearDuplicateShare > policy.similarity.nearDuplicateMaxShare) failed.push({ key: 'nearDuplicateShare', actual: snapshot.similarity.nearDuplicateShare, max: policy.similarity.nearDuplicateMaxShare });
  const primaryDistinct = snapshot.ingredientUsage.filter(item => item.primaryCount > 0).length;
  if (primaryDistinct < policy.diversity.minimumDistinctPrimaryIngredients) failed.push({ key: 'distinctPrimaryIngredients', actual: primaryDistinct, min: policy.diversity.minimumDistinctPrimaryIngredients });
  return { passed: failed.length === 0, failed };
}

export async function computeCorpusContentIdentity({ catalogVersion, recipeFamilies = [], recipeVersions = [], ingredientRevisions = [] }) {
  const versionById = new Map(recipeVersions.map(record => [record.recipeVersionId, record]));
  const active = recipeFamilies.filter(family => family.status === 'active').map(family => versionById.get(family.currentVersionId)).filter(Boolean);
  const digest = await sha256Json({ catalogVersion, active: active.map(recipe => [recipe.recipeVersionId, recipe.contentHash]).sort(), ingredients: ingredientRevisions.map(revision => [revision.ingredientRevisionId, revision.contentHash]).sort() });
  return { activeRecipeCount: active.length, contentDigest: `sha256:${digest}` };
}

export async function scanCorpus({ policy, catalogVersion, recipeFamilies = [], recipeVersions = [], ingredientFamilies = [], ingredientRevisions = [], requiredLocales = ['it', 'en'], registry = null, snapshotId = null, createdAt = null }) {
  const revisionById = new Map(ingredientRevisions.map(record => [record.ingredientRevisionId, record]));
  const ingredientFamilyById = new Map(ingredientFamilies.map(record => [record.ingredientId, record]));
  const versionById = new Map(recipeVersions.map(record => [record.recipeVersionId, record]));
  const activeVersions = [];
  for (const family of recipeFamilies) {
    if (family.status !== 'active') continue;
    const version = versionById.get(family.currentVersionId); if (version) activeVersions.push(version);
  }

  const meal = new Map(), energy = new Map(), protein = new Map(), fiber = new Map(), practicality = new Map(), diet = new Map(), families = new Map(), cuisines = new Map(), categories = new Map();
  const ingredientUse = new Map(), primaryUse = new Map(), pairUse = new Map();
  const recipeFacets = [];
  const exempt = new Set(policy.diversity.exemptIngredientIds || []);
  let unknownIngredientReferences = 0, nutritionErrors = 0, allergenDerivationErrors = 0, missingRequiredLocaleFields = 0;

  for (const recipe of activeVersions) {
    const mealValues = unique(recipe.mealArchetypes || []);
    const energyBandId = bandIdFor(recipe.calculatedNutrition?.energyKcal, policy.energyBands);
    const proteinBandId = bandIdFor(recipe.calculatedNutrition?.proteinG, policy.proteinBands);
    const fiberBandId = bandIdFor(recipe.calculatedNutrition?.fiberG, policy.fiberBands);
    const practicalValues = recipePracticality(recipe);
    const dietValues = unique(recipe.tags?.diet || []);
    const familyValues = unique(recipe.tags?.families || []);
    const cuisineValues = unique(recipe.tags?.cuisines || []);
    for (const key of mealValues) increment(meal, key);
    increment(energy, energyBandId);
    increment(protein, proteinBandId);
    increment(fiber, fiberBandId);
    for (const key of practicalValues) increment(practicality, key);
    for (const key of dietValues) increment(diet, key);
    for (const key of familyValues) increment(families, key);
    for (const key of cuisineValues) increment(cuisines, key);

    const ingredients = unique((recipe.ingredientLines || []).map(line => line.ingredientId));
    const categorySet = new Set();
    for (const ingredientId of ingredients) {
      increment(ingredientUse, ingredientId);
      const family = ingredientFamilyById.get(ingredientId); const revision = family ? revisionById.get(family.currentRevisionId) : null;
      if (revision?.taxonomy?.foodGroup) categorySet.add(revision.taxonomy.foodGroup);
    }
    for (const category of categorySet) increment(categories, category);
    recipeFacets.push({
      meal_archetype: new Set(mealValues), energy_band: new Set([energyBandId]), protein_band: new Set([proteinBandId]), fiber_band: new Set([fiberBandId]),
      practicality: new Set(practicalValues), diet: new Set(dietValues), recipe_family: new Set(familyValues), cuisine: new Set(cuisineValues), ingredient_category: new Set(categorySet)
    });
    const primary = primaryIngredientId(recipe, exempt); if (primary) increment(primaryUse, primary);
    const sorted = [...ingredients].sort();
    for (let i = 0; i < sorted.length; i += 1) for (let j = i + 1; j < sorted.length; j += 1) increment(pairUse, pairKey(sorted[i], sorted[j]));

    const byId = new Map();
    for (const line of recipe.ingredientLines || []) {
      const revision = revisionById.get(line.ingredientRevisionId);
      if (!revision || revision.ingredientId !== line.ingredientId) unknownIngredientReferences += 1; else byId.set(line.ingredientRevisionId, revision);
    }
    if (byId.size === (recipe.ingredientLines || []).length) {
      try {
        const recalculated = calculateRecipeNutrition(recipe.ingredientLines, byId);
        if (Object.keys(recalculated).some(key => !approxEqual(recalculated[key], recipe.calculatedNutrition?.[key]))) nutritionErrors += 1;
        const expectedInputDigest = await sha256Json({ calculationAlgorithmVersion: recipe.calculationAlgorithmVersion, ingredientLines: (recipe.ingredientLines || []).map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
        if (expectedInputDigest !== recipe.inputDigest) nutritionErrors += 1;
        const allergens = deriveAllergens(recipe.ingredientLines, byId);
        if (JSON.stringify(allergens) !== JSON.stringify([...(recipe.allergenIds || [])].sort())) allergenDerivationErrors += 1;
      } catch { nutritionErrors += 1; }
    }
    missingRequiredLocaleFields += missingLocaleFields(recipe, requiredLocales);
  }

  const exact = new Map(); for (const recipe of activeVersions) increment(exact, exactRecipeSignature(recipe));
  let exactDuplicateCount = 0; for (const count of exact.values()) if (count > 1) exactDuplicateCount += count - 1;

  // Similarity candidates are generated only for recipes sharing at least one ingredient or title token.
  const candidatePairs = new Set(), ingredientToRecipes = new Map(), titleTokenToRecipes = new Map();
  for (let index = 0; index < activeVersions.length; index += 1) {
    const recipe = activeVersions[index];
    for (const id of recipeIngredientSet(recipe)) { if (!ingredientToRecipes.has(id)) ingredientToRecipes.set(id, []); ingredientToRecipes.get(id).push(index); }
    const titles = requiredLocales.map(locale => recipe.i18n?.[locale]?.title || '').join(' ');
    for (const token of unique(textTokens(titles))) { if (!titleTokenToRecipes.has(token)) titleTokenToRecipes.set(token, []); titleTokenToRecipes.get(token).push(index); }
  }
  for (const groups of [ingredientToRecipes, titleTokenToRecipes]) for (const list of groups.values()) for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) candidatePairs.add(`${list[i]}:${list[j]}`);
  let nearDuplicateCount = 0;
  for (const pair of candidatePairs) {
    const [ai, bi] = pair.split(':').map(Number); const a = activeVersions[ai], b = activeVersions[bi];
    if (exactRecipeSignature(a) === exactRecipeSignature(b)) continue;
    const ingredientSimilarity = jaccard(recipeIngredientSet(a), recipeIngredientSet(b));
    let titleSimilarity = 0; for (const locale of requiredLocales) titleSimilarity = Math.max(titleSimilarity, tokenSimilarity(a.i18n?.[locale]?.title, b.i18n?.[locale]?.title));
    if (ingredientSimilarity >= policy.similarity.highJaccardThreshold || titleSimilarity >= policy.similarity.titleSimilarityThreshold) nearDuplicateCount += 1;
  }

  const denominator = activeVersions.length;
  const distributionsMap = { mealArchetypes: meal, energyBands: energy, proteinBands: protein, fiberBands: fiber, practicality, diet, recipeFamilies: families, cuisines, ingredientCategories: categories };
  const compoundCounts = new Map(policy.coverageTargets.filter(target => target.criteria?.length).map(target => [target.targetId, recipeFacets.filter(facets => target.criteria.every(criterion => facets[criterion.dimension]?.has(criterion.key))).length]));
  const coverageCells = policy.coverageTargets.map(target => {
    const currentCount = targetCount(target, distributionsMap, compoundCounts); const deficit = coverageDeficit(target, currentCount, denominator);
    return { targetId: target.targetId, currentCount, denominator, currentShare: round(deficit.currentShare), normalizedDeficit: round(deficit.normalizedDeficit), weightedDeficit: round(deficit.normalizedDeficit * target.weight) };
  });
  const undercoveredTargetIds = policy.coverageTargets.filter(target => targetIsUndercovered(target, targetCount(target, distributionsMap, compoundCounts), denominator)).map(target => target.targetId);
  const ingredientUsage = [...new Set([...ingredientUse.keys(), ...primaryUse.keys()])].sort().map(ingredientId => ({ ingredientId, recipeCount: ingredientUse.get(ingredientId) || 0, primaryCount: primaryUse.get(ingredientId) || 0, recipeShare: denominator ? round((ingredientUse.get(ingredientId) || 0) / denominator) : 0, primaryShare: denominator ? round((primaryUse.get(ingredientId) || 0) / denominator) : 0 }));
  const ingredientPairUsage = [...pairUse.entries()].map(([key, coOccurrenceCount]) => { const [ingredientIdA, ingredientIdB] = key.split('\u0000'); return { ingredientIdA, ingredientIdB, coOccurrenceCount, share: denominator ? round(coOccurrenceCount / denominator) : 0 }; }).sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount || a.ingredientIdA.localeCompare(b.ingredientIdA) || a.ingredientIdB.localeCompare(b.ingredientIdB));
  const schemaErrors = schemaErrorCount(recipeFamilies, registry, 'recipe') + schemaErrorCount(recipeVersions, registry, 'recipeVersion') + schemaErrorCount(ingredientFamilies, registry, 'ingredient') + schemaErrorCount(ingredientRevisions, registry, 'ingredientRevision');
  const identity = await computeCorpusContentIdentity({ catalogVersion, recipeFamilies, recipeVersions, ingredientRevisions });
  const digest = identity.contentDigest.replace(/^sha256:/, '');
  const timestamp = createdAt || new Date().toISOString();
  const snapshot = {
    schemaVersion: 1,
    snapshotId: snapshotId || `snapshot-${catalogVersion}-${digest.slice(0, 12)}`,
    catalogVersion,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    recipeCount: recipeVersions.length,
    activeRecipeCount: activeVersions.length,
    coverageCells,
    distributions: Object.fromEntries(Object.entries(distributionsMap).map(([key, map]) => [key, countEntries(map)])),
    ingredientUsage,
    ingredientPairUsage,
    similarity: { exactDuplicateCount, nearDuplicateCount, nearDuplicateShare: denominator ? round(nearDuplicateCount / denominator) : 0 },
    quality: { schemaErrors, unknownIngredientReferences, nutritionErrors, allergenDerivationErrors, missingRequiredLocaleFields },
    undercoveredTargetIds,
    contentDigest: `sha256:${digest}`,
    createdAt: timestamp
  };
  return snapshot;
}
