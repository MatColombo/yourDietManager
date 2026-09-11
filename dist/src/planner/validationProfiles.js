export const PLANNER_VALIDATION_TARGETS = Object.freeze([800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600]);
export const PLANNER_VALIDATION_TOLERANCES = Object.freeze([2, 5, 10]);
export const PLANNER_VALIDATION_ALLERGENS = Object.freeze(['gluten_cereals','crustaceans','eggs','fish','peanuts','soy','milk','tree_nuts','celery','mustard','sesame','sulphites','lupin','molluscs']);

export const PLANNER_VALIDATION_PROFILES = Object.freeze([
  Object.freeze({ id: 'current', expected: 'any', category: 'baseline' }),
  Object.freeze({ id: 'hard_practical', expected: 'any', category: 'hard' }),
  Object.freeze({ id: 'hard_numeric_forbid', expected: 'any', category: 'hard' }),
  Object.freeze({ id: 'hard_categorical_forbid', expected: 'any', category: 'hard' }),
  Object.freeze({ id: 'hard_autoexclude', expected: 'any', category: 'hard' }),
  Object.freeze({ id: 'hard_intolerance_legumes', expected: 'any', category: 'hard' }),
  Object.freeze({ id: 'soft_high_protein', expected: 'any', category: 'soft' }),
  Object.freeze({ id: 'soft_high_fiber', expected: 'any', category: 'soft' }),
  Object.freeze({ id: 'soft_vegan_preference', expected: 'any', category: 'soft' }),
  Object.freeze({ id: 'soft_meal_avoid_vegan', expected: 'any', category: 'soft' }),
  Object.freeze({ id: 'soft_frequency_vegan', expected: 'any', category: 'soft' }),
  Object.freeze({ id: 'impossible_all_forbidden', expected: 'failed', category: 'negative' }),
  Object.freeze({ id: 'external_unknown', expected: 'failed', category: 'negative' })
]);

function activeById(bundle, collection, idKey) {
  const ids = new Set(bundle.appConfig[idKey] || []);
  return (bundle[collection] || []).filter(item => ids.has(item.id));
}

function activeNutrition(bundle) { return (bundle.nutritionProfiles || []).find(item => item.id === bundle.appConfig.nutritionProfileId); }
function activeAllergy(bundle) { return (bundle.allergyIntoleranceProfiles || []).find(item => item.id === bundle.appConfig.allergyIntoleranceProfileId); }
function activePreferences(bundle) { return (bundle.foodPreferences || []).find(item => item.id === bundle.appConfig.foodPreferencesId); }

function appendRule(target, rule) { target.rules ||= []; target.rules.push(rule); }

export function applyPlannerValidationProfile(bundle, { profileId = 'current', targetKcal = null, tolerancePct = null, hardAllergenId = null } = {}) {
  const draft = structuredClone(bundle);
  const nutrition = activeNutrition(draft);
  const allergy = activeAllergy(draft);
  const preferences = activePreferences(draft);
  const mealClasses = activeById(draft, 'mealClasses', 'mealClassIds');
  const dayClasses = activeById(draft, 'dayClasses', 'dayClassIds');
  if (!nutrition || !allergy || !preferences || !mealClasses.length || !dayClasses.length) throw new Error('Planner validation requires a complete active configuration');

  if (targetKcal != null) nutrition.dailyEnergyKcal = Number(targetKcal);
  if (tolerancePct != null) nutrition.energyTolerancePct = Number(tolerancePct);
  nutrition.preset = 'custom';

  if (profileId === 'hard_practical') {
    for (const day of dayClasses) day.capabilities = { ...day.capabilities, fridge: 'no', reheating: 'no', cooking: false, complexSnack: false, portabilityRequired: true, maxPrepMinutes: Math.min(10, day.capabilities?.maxPrepMinutes ?? 10) };
  } else if (profileId === 'hard_numeric_forbid') {
    for (const meal of mealClasses) appendRule(meal, { ruleType: 'nutrition', target: 'fatG', strength: 'forbid', operator: 'gte', value: 25 });
  } else if (profileId === 'hard_categorical_forbid') {
    for (const meal of mealClasses) appendRule(meal, { ruleType: 'tag', target: 'diet_vegan', strength: 'forbid' });
  } else if (profileId === 'hard_autoexclude') {
    appendRule(preferences, { id: 'validation-autoexclude-vegan', targetType: 'recipeTag', targetId: 'diet_vegan', level: 'normal', autoExclude: true });
  } else if (profileId === 'hard_intolerance_legumes') {
    appendRule(allergy, { id: 'validation-intolerance-legumes', kind: 'intolerance', targetType: 'foodCategory', targetId: 'food_group_legumes', enabled: true, label: 'Validation legumes intolerance', notes: 'Temporary Phase C validation rule' });
  } else if (profileId === 'soft_high_protein') {
    const target = Math.max(40, Math.round(Number(nutrition.dailyEnergyKcal) * 0.0625));
    nutrition.nutrients.proteinG = { enabled: true, min: null, target, max: null, weight: 8 };
  } else if (profileId === 'soft_high_fiber') {
    const target = Math.max(20, Math.round(Number(nutrition.dailyEnergyKcal) * 0.015));
    nutrition.nutrients.fiberG = { enabled: true, min: null, target, max: null, weight: 8 };
  } else if (profileId === 'soft_vegan_preference') {
    appendRule(preferences, { id: 'validation-prefer-vegan', targetType: 'recipeTag', targetId: 'diet_vegan', level: 'more_often', autoExclude: false });
  } else if (profileId === 'soft_meal_avoid_vegan') {
    for (const meal of mealClasses) appendRule(meal, { ruleType: 'tag', target: 'diet_vegan', strength: 'avoid' });
  } else if (profileId === 'soft_frequency_vegan') {
    appendRule(preferences, { id: 'validation-frequency-vegan', targetType: 'recipeTag', targetId: 'diet_vegan', level: 'normal', autoExclude: false, frequency: { maxOccurrences: 1, windowDays: 3 } });
  } else if (profileId === 'impossible_all_forbidden') {
    for (const meal of mealClasses) appendRule(meal, { ruleType: 'nutrition', target: 'energyKcal', strength: 'forbid', operator: 'gte', value: 0 });
  } else if (profileId === 'external_unknown') {
    const day = dayClasses[0];
    const slot = day.mealSlots.find(item => item.mode === 'planned');
    if (!slot) throw new Error('External-unknown validation profile requires at least one planned slot');
    slot.mode = 'external'; slot.estimatedNutritionPolicy = 'unknown'; slot.energyBudgetKcal = null; slot.proteinMinG = null;
  } else if (profileId !== 'current') {
    throw new Error(`Unknown planner validation profile ${profileId}`);
  }

  if (hardAllergenId) appendRule(allergy, { id: `validation-allergen-${hardAllergenId}`, kind: 'allergy', targetType: 'allergen', targetId: hardAllergenId, enabled: true, label: `Validation ${hardAllergenId}`, notes: 'Temporary Phase C validation rule' });
  return draft;
}

export function plannerValidationProfileMeta(profileId) {
  return PLANNER_VALIDATION_PROFILES.find(item => item.id === profileId) || null;
}
