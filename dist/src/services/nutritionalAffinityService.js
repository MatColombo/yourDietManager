import { calculateIngredientLineNutrition, calculateRecipeNutrition, deriveAllergens, CALCULATION_ALGORITHM_VERSION, NUTRIENTS } from '../domain/nutritionCore.js';
import { sha256Json } from '../lib/crypto.js';
import { recipeToDraft, saveRecipe } from './personalCatalogService.js';
import { repositories } from '../repositories/repositoryHub.js';

const NUTRIENT_FLOORS = { energyKcal: 100, proteinG: 10, carbsG: 20, fatG: 10, fiberG: 5 };
const NUTRIENT_WEIGHTS = { energyKcal: 3, proteinG: 2, carbsG: 1.2, fatG: 1.2, fiberG: 0.8 };
const ANIMAL_GROUPS = {
  vegan: new Set(['food_group_meat_poultry', 'food_group_fish_seafood', 'food_group_dairy', 'food_group_eggs']),
  vegetarian: new Set(['food_group_meat_poultry', 'food_group_fish_seafood']),
  pescatarian: new Set(['food_group_meat_poultry'])
};

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function nutritionDelta(next, previous) { return Object.fromEntries(NUTRIENTS.map(key => [key, round(Number(next?.[key] || 0) - Number(previous?.[key] || 0))])); }
function overlap(left = [], right = []) { const set = new Set(left); return right.filter(value => set.has(value)); }

export function nutritionAffinity(reference, candidate) {
  let weighted = 0; let weightTotal = 0;
  const relativeDelta = {};
  for (const key of NUTRIENTS) {
    const scale = Math.max(NUTRIENT_FLOORS[key], Math.abs(Number(reference?.[key] || 0)));
    const ratio = Math.abs(Number(candidate?.[key] || 0) - Number(reference?.[key] || 0)) / scale;
    relativeDelta[key] = round(ratio * 100);
    weighted += ratio * NUTRIENT_WEIGHTS[key]; weightTotal += NUTRIENT_WEIGHTS[key];
  }
  const distance = weightTotal ? weighted / weightTotal : 0;
  return { distance: round(distance, 4), score: Math.max(0, Math.min(100, Math.round(100 * Math.exp(-1.15 * distance)))), delta: nutritionDelta(candidate, reference), relativeDelta };
}

export function isoCaloricReplacement(sourceLine, sourceRevision, candidateRevision) {
  const sourceNutrition = calculateIngredientLineNutrition(sourceLine, sourceRevision);
  const energyPerBasis = Number(candidateRevision?.nutrition?.energyKcal || 0);
  const basisAmount = Number(candidateRevision?.basis?.amount || 0);
  if (!(sourceNutrition.energyKcal > 0) || !(energyPerBasis > 0) || !(basisAmount > 0)) return null;
  const rawAmount = sourceNutrition.energyKcal * basisAmount / energyPerBasis;
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return null;
  const amount = Math.max(0.1, round(rawAmount));
  const line = {
    ingredientId: candidateRevision.ingredientId,
    ingredientRevisionId: candidateRevision.ingredientRevisionId,
    amount,
    unit: candidateRevision.basis.unit,
    normalizedAmount: amount,
    normalizedUnit: candidateRevision.basis.unit,
    optional: Boolean(sourceLine.optional),
    notesKey: sourceLine.notesKey || null
  };
  const replacementNutrition = calculateIngredientLineNutrition(line, candidateRevision);
  return { line, sourceNutrition, replacementNutrition, delta: nutritionDelta(replacementNutrition, sourceNutrition) };
}

function dietCompatible(recipe, revision) {
  const diet = new Set(recipe?.tags?.diet || []); const group = revision?.taxonomy?.foodGroup;
  if (diet.has('diet_vegan') && ANIMAL_GROUPS.vegan.has(group)) return false;
  if (diet.has('diet_vegetarian') && ANIMAL_GROUPS.vegetarian.has(group)) return false;
  if (diet.has('diet_pescatarian') && ANIMAL_GROUPS.pescatarian.has(group)) return false;
  return true;
}

function semanticPenalty(source, candidate) {
  let penalty = 0; const reasons = [];
  const roles = overlap(source.taxonomy?.culinaryRoles, candidate.taxonomy?.culinaryRoles);
  if (roles.length) reasons.push('culinary_role'); else penalty += 0.24;
  if (source.productTaxonomy?.conceptId && source.productTaxonomy.conceptId === candidate.productTaxonomy?.conceptId) { reasons.push('product_concept'); penalty -= 0.08; }
  else if (source.productTaxonomy?.subcategoryId && source.productTaxonomy.subcategoryId === candidate.productTaxonomy?.subcategoryId) { reasons.push('product_subcategory'); penalty -= 0.04; }
  else if (source.taxonomy?.foodSubgroup && source.taxonomy.foodSubgroup === candidate.taxonomy?.foodSubgroup) { reasons.push('food_subgroup'); penalty += 0.02; }
  else if (source.taxonomy?.foodGroup === candidate.taxonomy?.foodGroup) { reasons.push('food_group'); penalty += 0.08; }
  else penalty += 0.28;
  if (source.basis?.state === candidate.basis?.state) reasons.push('same_state'); else penalty += 0.11;
  if (source.taxonomy?.flavorProfile === candidate.taxonomy?.flavorProfile) reasons.push('same_flavor'); else penalty += 0.05;
  return { penalty: Math.max(0, penalty), reasons };
}

export function ingredientAffinity(sourceLine, sourceRevision, candidateRevision, recipe = null) {
  const iso = isoCaloricReplacement(sourceLine, sourceRevision, candidateRevision);
  if (!iso) return null;
  const nutrition = nutritionAffinity(iso.sourceNutrition, iso.replacementNutrition);
  const semantic = semanticPenalty(sourceRevision, candidateRevision);
  const amountRatio = iso.line.normalizedAmount / Math.max(0.1, Number(sourceLine.normalizedAmount || sourceLine.amount || 0.1));
  const amountPenalty = amountRatio > 4 || amountRatio < 0.25 ? 0.12 : amountRatio > 2.5 || amountRatio < 0.4 ? 0.05 : 0;
  const newAllergenIds = (candidateRevision.allergenIds || []).filter(id => !(sourceRevision.allergenIds || []).includes(id));
  const totalDistance = nutrition.distance + semantic.penalty + amountPenalty + newAllergenIds.length * 0.04;
  const score = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-1.05 * totalDistance))));
  return {
    score,
    distance: round(totalDistance, 4),
    nutrition,
    proposedLine: iso.line,
    sourceNutrition: Object.fromEntries(NUTRIENTS.map(key => [key, round(iso.sourceNutrition[key])])),
    replacementNutrition: Object.fromEntries(NUTRIENTS.map(key => [key, round(iso.replacementNutrition[key])])),
    lineDelta: iso.delta,
    semanticReasons: semantic.reasons,
    stateMismatch: sourceRevision.basis?.state !== candidateRevision.basis?.state,
    newAllergenIds,
    dietCompatible: recipe ? dietCompatible(recipe, candidateRevision) : true
  };
}

function candidateSearchText(revision) {
  return normalize([
    revision.i18n?.it?.name, revision.i18n?.en?.name,
    ...(revision.i18n?.it?.aliases || []), ...(revision.i18n?.en?.aliases || []),
    revision.productTaxonomy?.conceptId, revision.taxonomy?.foodGroup, revision.taxonomy?.foodSubgroup,
    ...(revision.taxonomy?.culinaryRoles || [])
  ].filter(Boolean).join(' '));
}

export async function suggestIngredientSubstitutions({ recipeVersionId, lineIndex, query = '', limit = 10, offset = 0 }, { repo = repositories } = {}) {
  const recipe = await repo.get('recipeVersions', recipeVersionId);
  if (!recipe) throw new Error(`RecipeVersion ${recipeVersionId} not found`);
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= recipe.ingredientLines.length) throw new Error('Invalid ingredient line');
  const sourceLine = recipe.ingredientLines[lineIndex];
  const sourceRevision = await repo.get('ingredientRevisions', sourceLine.ingredientRevisionId);
  if (!sourceRevision) throw new Error(`Ingredient revision ${sourceLine.ingredientRevisionId} not found`);
  const families = (await repo.getAll('ingredients')).filter(item => item.status === 'active' && item.ingredientId !== sourceRevision.ingredientId);
  const revisions = await repo.getMany('ingredientRevisions', families.map(item => item.currentRevisionId));
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const currentRevisionById = new Map(families.map(item => [item.currentRevisionId, item]));
  const sourceRevisionIds = [...new Set(recipe.ingredientLines.map(line => line.ingredientRevisionId))];
  const recipeRevisions = await repo.getMany('ingredientRevisions', sourceRevisionIds);
  const originalRevisionById = new Map(recipeRevisions.map(item => [item.ingredientRevisionId, item]));
  const originalNutrition = recipe.calculatedNutrition || calculateRecipeNutrition(recipe.ingredientLines, originalRevisionById);
  const ranked = [];
  for (const revision of revisions) {
    if (!currentRevisionById.has(revision.ingredientRevisionId)) continue;
    if (words.length && !words.every(word => candidateSearchText(revision).includes(word))) continue;
    const affinity = ingredientAffinity(sourceLine, sourceRevision, revision, recipe);
    if (!affinity || !affinity.dietCompatible) continue;
    const nextLines = recipe.ingredientLines.map((line, index) => index === lineIndex ? affinity.proposedLine : structuredClone(line));
    const revisionById = new Map(originalRevisionById); revisionById.set(revision.ingredientRevisionId, revision);
    const nextNutrition = calculateRecipeNutrition(nextLines, revisionById);
    ranked.push({
      ingredient: revision,
      ...affinity,
      affinityScore: affinity.score,
      recipeNutrition: nextNutrition,
      recipeDelta: nutritionDelta(nextNutrition, originalNutrition)
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.distance - b.distance || a.ingredient.ingredientRevisionId.localeCompare(b.ingredient.ingredientRevisionId));
  const pageSize = Math.max(1, Math.min(20, Math.floor(Number(limit) || 10))); const pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  return {
    recipeVersionId,
    recipeId: recipe.recipeId,
    lineIndex,
    sourceLine: structuredClone(sourceLine),
    sourceIngredient: sourceRevision,
    originalNutrition: structuredClone(originalNutrition),
    query,
    total: ranked.length,
    offset: pageOffset,
    limit: pageSize,
    hasMore: pageOffset + pageSize < ranked.length,
    candidates: ranked.slice(pageOffset, pageOffset + pageSize)
  };
}

export async function applyIngredientSubstitution({ recipeId, recipeVersionId, lineIndex, candidateIngredientRevisionId, amount = null, newName = '', locale = 'it' }, { repo = repositories, registry } = {}) {
  const family = await repo.get('recipes', recipeId);
  if (!family || family.currentVersionId !== recipeVersionId) throw new Error('Recipe changed after the substitution preview. Open the current version and retry.');
  const recipe = await repo.get('recipeVersions', recipeVersionId);
  if (!recipe || recipe.recipeId !== recipeId) throw new Error('Recipe version not found');
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= recipe.ingredientLines.length) throw new Error('Invalid ingredient line');
  const candidate = await repo.get('ingredientRevisions', candidateIngredientRevisionId);
  if (!candidate) throw new Error('Replacement ingredient is no longer available');
  const candidateFamily = await repo.get('ingredients', candidate.ingredientId);
  if (!candidateFamily || candidateFamily.status !== 'active' || candidateFamily.currentRevisionId !== candidate.ingredientRevisionId) throw new Error('Replacement ingredient changed after the preview');
  const sourceLine = recipe.ingredientLines[lineIndex]; const sourceRevision = await repo.get('ingredientRevisions', sourceLine.ingredientRevisionId);
  const affinity = ingredientAffinity(sourceLine, sourceRevision, candidate, recipe);
  if (!affinity || !affinity.dietCompatible) throw new Error('Replacement ingredient is not compatible with the recipe');
  const draft = await recipeToDraft(recipeId, { repo, recipeVersionId });
  const requestedName = String(newName || '').trim();
  if (!requestedName) throw new Error('A new recipe name is required when saving an ingredient substitution');
  if (locale === 'en') draft.titleEn = requestedName; else draft.titleIt = requestedName;
  const proposedAmount = amount == null ? affinity.proposedLine.amount : Number(amount);
  if (!(proposedAmount > 0) || !Number.isFinite(proposedAmount)) throw new Error('Replacement amount must be positive');
  draft.ingredientLines[lineIndex] = {
    ingredientId: candidate.ingredientId,
    ingredientRevisionId: candidate.ingredientRevisionId,
    amount: round(proposedAmount),
    unit: candidate.basis.unit,
    optional: Boolean(sourceLine.optional)
  };
  if (draft.finalWeightG != null) {
    if (sourceLine.normalizedUnit === 'g' && candidate.basis.unit === 'g') draft.finalWeightG = Math.max(0.1, round(Number(draft.finalWeightG) - Number(sourceLine.normalizedAmount) + round(proposedAmount)));
    else draft.finalWeightG = null;
  }
  return saveRecipe({ ...draft, recipeId }, { repo, registry });
}


function boundedTitle(value) {
  const text = String(value || '').trim();
  return text.length <= 70 ? text : `${text.slice(0, 67).trimEnd()}...`;
}
function replaceIngredientNameInTitle(title, sourceName, targetName) {
  const text = String(title || '').trim();
  const source = String(sourceName || '').trim();
  const target = String(targetName || '').trim();
  if (!target) return boundedTitle(text);
  if (source) {
    const index = normalize(text).indexOf(normalize(source));
    if (index >= 0) return boundedTitle(`${text.slice(0, index)}${target}${text.slice(index + source.length)}`);
  }
  return boundedTitle(`${text} · ${target}`);
}
function localizedIngredientName(revision, locale) {
  return revision?.i18n?.[locale]?.name || revision?.i18n?.it?.name || revision?.i18n?.en?.name || revision?.ingredientId || '';
}

export async function derivePlanRecipeVersion({ recipe, sourceIngredientId, candidateRevision, revisionById, createdAt = new Date().toISOString(), idSuffix = null }) {
  if (!recipe || recipe.schemaVersion !== 2) throw new Error('Plan ingredient substitution requires RecipeVersion v2');
  if (!sourceIngredientId || !candidateRevision) throw new Error('Source and replacement ingredient are required');
  const suffixValue = idSuffix || globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const nextLines = [];
  let affectedLines = 0;
  let sourceForTitle = null;
  for (const line of recipe.ingredientLines || []) {
    if (line.ingredientId !== sourceIngredientId) { nextLines.push(structuredClone(line)); continue; }
    const sourceRevision = revisionById.get(line.ingredientRevisionId);
    if (!sourceRevision) throw new Error(`Missing source ingredient revision ${line.ingredientRevisionId}`);
    const affinity = ingredientAffinity(line, sourceRevision, candidateRevision, recipe);
    if (!affinity || !affinity.dietCompatible) throw new Error('Replacement ingredient is not compatible with one of the affected recipes');
    nextLines.push(structuredClone(affinity.proposedLine));
    affectedLines += 1; sourceForTitle ||= sourceRevision;
  }
  if (!affectedLines) return null;
  const nextRevisionById = new Map(revisionById); nextRevisionById.set(candidateRevision.ingredientRevisionId, candidateRevision);
  const calculatedNutrition = calculateRecipeNutrition(nextLines, nextRevisionById);
  const allergenIds = deriveAllergens(nextLines, nextRevisionById);
  const recipeVersionId = `${recipe.recipeVersionId}_plan_${suffixValue}`;
  const i18n = structuredClone(recipe.i18n || {});
  for (const locale of Object.keys(i18n)) {
    const sourceName = localizedIngredientName(sourceForTitle, locale);
    const targetName = localizedIngredientName(candidateRevision, locale);
    i18n[locale] = { ...i18n[locale], title: replaceIngredientNameInTitle(i18n[locale]?.title, sourceName, targetName) };
  }
  const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: nextLines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
  const version = {
    ...structuredClone(recipe), recipeVersionId, versionNumber: Number(recipe.versionNumber || 1) + 1, supersedesVersionId: recipe.recipeVersionId,
    origin: 'user', catalogVersion: null, i18n, ingredientLines: nextLines, calculatedNutrition, allergenIds,
    calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '',
    generation: { jobId: null, pipelineVersion: 'plan-ingredient-substitution-1', sourceLocale: null, generatedAt: createdAt },
    quality: { status: 'validated', reviewNotes: 'Plan-local ingredient substitution' }, createdAt
  };
  version.contentHash = await sha256Json({ ...version, contentHash: '' });
  return { version, affectedLines };
}

export function mealNutritionAffinity(referenceNutrition, candidateNutrition) {
  return nutritionAffinity(referenceNutrition, candidateNutrition);
}

export function summarizeNutritionDelta(next, previous) { return nutritionDelta(next, previous); }
export function allergenDelta(sourceIds = [], candidateIds = []) { return unique(candidateIds.filter(id => !sourceIds.includes(id))).sort(); }
