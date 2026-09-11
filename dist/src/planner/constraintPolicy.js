export const PLANNER_CONSTRAINT_POLICY_VERSION = 'planner-constraint-policy-1';

export const PLANNER_CONSTRAINTS = Object.freeze([
  Object.freeze({ id: 'daily_energy_tolerance', scope: 'day', strength: 'hard', source: 'NutritionProfile.energyTolerancePct', enforcement: 'bounded_search_energy_filter_and_post_validation' }),
  Object.freeze({ id: 'allergy_intolerance', scope: 'recipe', strength: 'hard', source: 'AllergyIntoleranceProfile.rules.enabled', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'food_auto_exclude', scope: 'recipe', strength: 'hard', source: 'FoodPreferences.rules.autoExclude', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'meal_rule_forbid', scope: 'recipe', strength: 'hard', source: 'MealClass.rules[strength=forbid]', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'day_capabilities', scope: 'recipe', strength: 'hard', source: 'DayClass.capabilities', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'meal_archetype', scope: 'recipe', strength: 'hard', source: 'MealClass.mealArchetype', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'recipe_quality', scope: 'recipe', strength: 'hard', source: 'RecipeVersion.quality.status', enforcement: 'candidate_filter' }),
  Object.freeze({ id: 'fixed_serving', scope: 'component', strength: 'hard', source: 'RecipeVersion.servingCount / CalendarDay.recipeComponents.servings', enforcement: 'schema_and_generator' }),
  Object.freeze({ id: 'nutrient_targets', scope: 'day', strength: 'soft', source: 'NutritionProfile.nutrients', enforcement: 'objective_penalty' }),
  Object.freeze({ id: 'meal_rule_preferences', scope: 'recipe', strength: 'soft', source: 'MealClass.rules[prefer|slight_prefer|avoid]', enforcement: 'objective_penalty' }),
  Object.freeze({ id: 'food_preferences', scope: 'recipe', strength: 'soft', source: 'FoodPreferences.rules.level', enforcement: 'objective_penalty' }),
  Object.freeze({ id: 'frequency_limits', scope: 'history', strength: 'soft', source: 'FoodPreferences.rules.frequency', enforcement: 'objective_penalty' }),
  Object.freeze({ id: 'variety', scope: 'history', strength: 'soft', source: 'recipe/family/ingredient/category/cuisine repetition', enforcement: 'objective_penalty' }),
  Object.freeze({ id: 'slot_energy_share', scope: 'slot', strength: 'soft', source: 'MealClass.energyShare / DayClass.mealSlots energy share/budget', enforcement: 'slot_objective' })
]);

export function plannerConstraintPolicySnapshot() {
  return {
    version: PLANNER_CONSTRAINT_POLICY_VERSION,
    hard: PLANNER_CONSTRAINTS.filter(item => item.strength === 'hard').map(item => ({ ...item })),
    soft: PLANNER_CONSTRAINTS.filter(item => item.strength === 'soft').map(item => ({ ...item }))
  };
}
