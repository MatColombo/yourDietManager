import { matchOperator } from './planMath.js';

export function tagValues(recipe) { return Object.values(recipe.tags || {}).flatMap(value => Array.isArray(value) ? value : []); }
export function cuisines(recipe) { return recipe.tags?.cuisines || []; }
export function families(recipe) { return recipe.tags?.families || []; }
export function primaryIngredientId(recipe) { return recipe.ingredientLines?.find(line => !line.optional)?.ingredientId || recipe.ingredientLines?.[0]?.ingredientId || null; }

export function foodCategories(recipe, revisionById) {
  const values = new Set();
  for (const line of recipe.ingredientLines || []) {
    const taxonomy = revisionById.get(line.ingredientRevisionId)?.taxonomy;
    if (taxonomy?.foodGroup) values.add(taxonomy.foodGroup);
    if (taxonomy?.foodSubgroup) values.add(taxonomy.foodSubgroup);
  }
  return values;
}

export function recipeMatchesTarget(recipe, targetType, targetId, revisionById) {
  if (targetType === 'ingredient') return recipe.ingredientLines?.some(line => line.ingredientId === targetId) || false;
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
  return typeof value === 'number' && matchOperator(value, rule.operator, rule.value);
}
