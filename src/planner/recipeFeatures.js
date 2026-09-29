import { effectiveProductTaxonomy } from '../domain/foodPresentationCorrections.js';
import { matchOperator } from './planMath.js';
import { telemetryIncrement } from './plannerTelemetry.js';

export function tagValues(recipe) { return Object.values(recipe.tags || {}).flatMap(value => Array.isArray(value) ? value : []); }
export function cuisines(recipe) { return recipe.tags?.cuisines || []; }
export function families(recipe) { return recipe.tags?.families || []; }
export function primaryIngredientId(recipe) { return recipe.ingredientLines?.find(line => !line.optional)?.ingredientId || recipe.ingredientLines?.[0]?.ingredientId || null; }
export function ingredientIds(recipe) { return [...new Set((recipe.ingredientLines || []).filter(line => line.included !== false).map(line => line.ingredientId).filter(Boolean))]; }

export function foodCategories(recipe, revisionById) {
  const values = new Set();
  for (const line of recipe.ingredientLines || []) {
    if (line.included === false) continue;
    const taxonomy = revisionById.get(line.ingredientRevisionId)?.taxonomy;
    if (taxonomy?.foodGroup) values.add(taxonomy.foodGroup);
    if (taxonomy?.foodSubgroup) values.add(taxonomy.foodSubgroup);
  }
  return values;
}

export function productFoodTerms(recipe, revisionById) {
  const values = new Set();
  for (const line of recipe.ingredientLines || []) {
    if (line.included === false) continue;
    const product = effectiveProductTaxonomy(revisionById.get(line.ingredientRevisionId));
    if (product?.categoryId) values.add(product.categoryId);
    if (product?.subcategoryId) values.add(product.subcategoryId);
    if (product?.conceptId) values.add(product.conceptId);
  }
  return values;
}

const PERISHABLE_CATEGORIES = new Set([
  'product_category_vegetables', 'product_category_fruit', 'product_category_fish_seafood',
  'product_category_meat_poultry', 'product_category_eggs', 'product_category_dairy'
]);

function perishableIngredientIds(recipe, revisionById) {
  const ids = new Set();
  for (const line of recipe.ingredientLines || []) {
    if (line.included === false) continue;
    const revision = revisionById.get(line.ingredientRevisionId);
    if (!PERISHABLE_CATEGORIES.has(revision?.productTaxonomy?.categoryId) || ['dry', 'drained'].includes(revision?.basis?.state)) continue;
    if (line.ingredientId) ids.add(line.ingredientId);
  }
  return ids;
}

function featureRecord(recipe, revisionById) {
  return {
    recipeId: recipe.recipeId,
    recipeVersionId: recipe.recipeVersionId,
    ingredientIds: new Set(ingredientIds(recipe)),
    families: new Set(families(recipe)),
    primaryIngredientId: primaryIngredientId(recipe),
    perishableIngredientIds: perishableIngredientIds(recipe, revisionById),
    productFoodTerms: productFoodTerms(recipe, revisionById),
    foodCategories: foodCategories(recipe, revisionById),
    tags: new Set(tagValues(recipe)),
    cuisines: new Set(cuisines(recipe)),
    allergens: new Set(recipe.allergenIds || []),
    flavors: new Set(recipe.tags?.flavor || []),
    cache: new Map()
  };
}

function directFeatureMatch(features, targetType, targetId) {
  if (targetType === 'ingredient') return features.ingredientIds.has(targetId);
  if (targetType === 'productFood') return features.productFoodTerms.has(targetId);
  if (targetType === 'foodCategory') return features.foodCategories.has(targetId);
  if (targetType === 'recipeTag' || targetType === 'tag') return features.tags.has(targetId);
  if (targetType === 'cuisine') return features.cuisines.has(targetId);
  if (targetType === 'allergen') return features.allergens.has(targetId);
  if (targetType === 'flavor') return features.flavors.has(targetId);
  return false;
}

export function buildRecipeFeatureIndex(recipes = [], revisionById = new Map(), foodGroups = [], { telemetry = null } = {}) {
  let activeTelemetry = telemetry;
  const byVersionId = new Map();
  const groupById = new Map((foodGroups || []).filter(group => group.status === 'active').map(group => [group.id, group]));
  for (const recipe of recipes || []) {
    if (!recipe?.recipeVersionId) continue;
    byVersionId.set(recipe.recipeVersionId, featureRecord(recipe, revisionById));
    telemetryIncrement(activeTelemetry, 'indexedRecipes');
  }
  function matches(recipe, targetType, targetId) {
    telemetryIncrement(activeTelemetry, 'recipeTargetMatches');
    const features = byVersionId.get(recipe?.recipeVersionId);
    if (!features) return null;
    const cacheKey = `${targetType}:${targetId}`;
    if (features.cache.has(cacheKey)) {
      telemetryIncrement(activeTelemetry, 'recipeTargetCacheHits');
      return features.cache.get(cacheKey);
    }
    let matched;
    if (targetType === 'foodGroup') {
      const group = groupById.get(targetId);
      matched = Boolean(group?.members.some(member => member.type !== 'foodGroup' && directFeatureMatch(features, member.type, member.id)));
    } else matched = directFeatureMatch(features, targetType, targetId);
    features.cache.set(cacheKey, matched);
    return matched;
  }
  function get(recipe) { return byVersionId.get(recipe?.recipeVersionId) || null; }
  function setTelemetry(nextTelemetry = null) { activeTelemetry = nextTelemetry; }
  return { byVersionId, matches, get, setTelemetry };
}

export function recipeMatchesTarget(recipe, targetType, targetId, revisionById, foodGroups = [], featureIndex = null) {
  const indexed = featureIndex?.matches?.(recipe, targetType, targetId);
  if (indexed !== null && indexed !== undefined) return indexed;
  if (targetType === 'foodGroup') { const group = foodGroups.find(item => item.id === targetId && item.status === 'active'); return Boolean(group?.members.some(member => recipeMatchesTarget(recipe, member.type, member.id, revisionById, []))); }
  if (targetType === 'ingredient') return recipe.ingredientLines?.some(line => line.included !== false && line.ingredientId === targetId) || false;
  if (targetType === 'productFood') return productFoodTerms(recipe, revisionById).has(targetId);
  if (targetType === 'foodCategory') return foodCategories(recipe, revisionById).has(targetId);
  if (targetType === 'recipeTag' || targetType === 'tag') return tagValues(recipe).includes(targetId);
  if (targetType === 'cuisine') return cuisines(recipe).includes(targetId);
  if (targetType === 'allergen') return recipe.allergenIds?.includes(targetId) || false;
  if (targetType === 'flavor') return recipe.tags?.flavor?.includes(targetId) || false;
  return false;
}

export function numericRuleValue(recipe, rule) {
  if (rule.ruleType === 'nutrition') return recipe.calculatedNutrition?.[rule.target];
  if (rule.ruleType === 'practical') return recipe.practical?.[rule.target];
  return undefined;
}

export function numericRuleSatisfied(recipe, rule) {
  const value = numericRuleValue(recipe, rule);
  return typeof value === 'number' && typeof rule.value === 'number' && matchOperator(value, rule.operator, rule.value);
}

export function mealRuleSatisfied(recipe, rule, revisionById, foodGroups = [], featureIndex = null) {
  if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') return numericRuleSatisfied(recipe, rule);
  return recipeMatchesTarget(recipe, rule.ruleType, rule.target, revisionById, foodGroups, featureIndex);
}
