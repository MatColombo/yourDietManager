export const ALLERGEN_IDS = Object.freeze([
  'gluten_cereals', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'tree_nuts',
  'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
]);

export const MEAL_ARCHETYPES = Object.freeze([
  'breakfast', 'lunch', 'dinner', 'snack', 'mini_meal', 'brunch', 'pre_shift', 'during_shift', 'post_shift', 'night_meal'
]);

export const DAY_ARCHETYPES = Object.freeze([
  'day', 'morning', 'afternoon', 'night', 'long_shift', 'split_shift', 'on_call', 'rest', 'free'
]);

export const NUTRIENT_KEYS = Object.freeze(['proteinG', 'carbsG', 'fatG', 'fiberG']);
export const NUTRITION_PRESETS = Object.freeze(['balanced', 'higher_protein', 'lower_fiber', 'moderate_fiber', 'higher_fiber', 'moderate_carbs', 'custom']);
export const RULE_STRENGTHS = Object.freeze(['prefer', 'slight_prefer', 'neutral', 'avoid', 'forbid']);
export const RULE_TYPES = Object.freeze(['productFood', 'foodCategory', 'ingredient', 'tag', 'flavor', 'nutrition', 'practical']);
export const NUMERIC_OPERATORS = Object.freeze(['eq', 'lte', 'gte']);

// V1 registry required by MEAL_CLASS_SPEC.md §8. Unknown quantitative targets are rejected.
export const MEAL_RULE_TARGET_REGISTRY = Object.freeze({
  nutrition: Object.freeze({ energyKcal: 'kcal', proteinG: 'g', carbsG: 'g', fatG: 'g', fiberG: 'g' }),
  practical: Object.freeze({ prepMinutes: 'min', cookMinutes: 'min' })
});

export const FOOD_PREFERENCE_TARGET_TYPES = Object.freeze(['productFood', 'ingredient', 'foodCategory', 'recipeTag', 'cuisine']);
export const FOOD_PREFERENCE_LEVELS = Object.freeze(['more_often', 'normal', 'less_often', 'rarely']);
export const ALLERGY_TARGET_TYPES = Object.freeze(['allergen', 'productFood', 'ingredient', 'foodCategory']);
export const ALLERGY_KINDS = Object.freeze(['allergy', 'intolerance']);

export function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}
