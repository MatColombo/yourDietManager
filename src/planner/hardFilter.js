import { recipeMatchesTarget, numericRuleSatisfied } from './recipeFeatures.js';

export const SIMPLE_SNACK_MAX_PREP_MINUTES = 10;

function reject(reasons, code) { reasons.push(code); }

export function hardFilterRecipe(recipe, context) {
  const reasons = [];
  const { mealClass, dayClass, allergyProfile, foodPreferences, revisionById } = context;
  if (!recipe.mealArchetypes?.includes(mealClass.mealArchetype)) reject(reasons, 'meal_archetype');
  if (!['validated', 'curated'].includes(recipe.quality?.status)) reject(reasons, 'quality_not_ready');

  for (const rule of allergyProfile?.rules || []) {
    if (!rule.enabled) continue;
    if (recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) reject(reasons, `safety:${rule.id}`);
  }
  for (const rule of foodPreferences?.rules || []) {
    if (rule.autoExclude && recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) reject(reasons, `auto_exclude:${rule.id}`);
  }
  for (const rule of mealClass.rules || []) {
    if (rule.strength !== 'forbid') continue;
    if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') {
      if (numericRuleSatisfied(recipe, rule)) reject(reasons, `meal_rule:${rule.ruleType}:${rule.target}`);
    } else if (recipeMatchesTarget(recipe, rule.ruleType, rule.target, revisionById)) {
      reject(reasons, `meal_rule:${rule.ruleType}:${rule.target}`);
    }
  }

  const capabilities = dayClass.capabilities || {};
  if (capabilities.portabilityRequired && !recipe.practical?.portable) reject(reasons, 'capability:portable');
  if (capabilities.fridge === 'no' && recipe.practical?.fridgeRequired) reject(reasons, 'capability:fridge');
  if (capabilities.reheating === 'no' && recipe.practical?.reheatingRequired) reject(reasons, 'capability:reheating');
  if (capabilities.cooking === false && Number(recipe.practical?.cookMinutes || 0) > 0) reject(reasons, 'capability:cooking');
  if (capabilities.maxPrepMinutes != null && recipe.practical?.prepMinutes > capabilities.maxPrepMinutes) reject(reasons, 'capability:prep_time');
  if (capabilities.complexSnack === false && ['snack', 'mini_meal'].includes(mealClass.mealArchetype)) {
    if (Number(recipe.practical?.cookMinutes || 0) > 0 || Number(recipe.practical?.prepMinutes || 0) > SIMPLE_SNACK_MAX_PREP_MINUTES) reject(reasons, 'capability:complex_snack');
  }

  return { allowed: reasons.length === 0, reasons };
}

export function filterCandidates(recipes, context) {
  const accepted = [];
  const rejectionCounts = {};
  for (const recipe of recipes) {
    const result = hardFilterRecipe(recipe, context);
    if (result.allowed) accepted.push(recipe);
    else for (const reason of result.reasons) rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
  }
  return { accepted, rejectionCounts };
}
