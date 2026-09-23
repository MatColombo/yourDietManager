import { effectiveProductTaxonomy } from '../domain/foodPresentationCorrections.js';
import { matchOperator } from './planMath.js';

export function tagValues(recipe) { return Object.values(recipe.tags || {}).flatMap(value => Array.isArray(value) ? value : []); }
export function cuisines(recipe) { return recipe.tags?.cuisines || []; }
export function families(recipe) { return recipe.tags?.families || []; }
export function primaryIngredientId(recipe) { return recipe.ingredientLines?.find(line => !line.optional)?.ingredientId || recipe.ingredientLines?.[0]?.ingredientId || null; }

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

export function recipeMatchesTarget(recipe, targetType, targetId, revisionById, foodGroups = []) {
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

export function mealRuleSatisfied(recipe, rule, revisionById, foodGroups = []) {
  if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') return numericRuleSatisfied(recipe, rule);
  return recipeMatchesTarget(recipe, rule.ruleType, rule.target, revisionById, foodGroups);
}
