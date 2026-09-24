import { assessRecipeSafety } from '../domain/safetyPolicy.js';
import { frequencyRules, legacyPreferenceRules, inRuleScope } from '../domain/frequencyCounter.js';
import { allergenCompatibility, recipeQuarantineReasons } from '../domain/safetyCompatibility.js';
import { recipeMatchesTarget, mealRuleSatisfied } from './recipeFeatures.js';
import { generationTuningHardRejections } from './generationTuning.js';

export const SIMPLE_SNACK_MAX_PREP_MINUTES = 10;

function reject(reasons, code) { reasons.push(code); }

export function hardFilterRecipe(recipe, context) {
  const reasons = recipeQuarantineReasons(recipe, context.revisionById);
  reasons.push(...generationTuningHardRejections(recipe, context));
  const { mealClass, dayClass, allergyProfile, foodPreferences, revisionById } = context;
  if (!recipe.mealArchetypes?.includes(mealClass.mealArchetype)) reject(reasons, 'meal_archetype');
  if (!['validated', 'curated'].includes(recipe.quality?.status)) reject(reasons, 'quality_not_ready');

  const safety = assessRecipeSafety(recipe, { allergyProfile, revisionById: context.safetyRevisionById || revisionById, foodGroups: context.foodGroups || [], date: context.date });
  for (const check of safety.rules) if (check.status !== 'compatible') reject(reasons, `${check.status === 'unknown' ? 'safety_unverified' : 'safety'}:${check.ruleId}:${check.reason}`);
  for (const rule of legacyPreferenceRules(foodPreferences)) {
    if (rule.autoExclude && recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById, context.foodGroups)) reject(reasons, `auto_exclude:${rule.id}`);
  }
  for (const rule of frequencyRules(foodPreferences)) {
    if (rule.mode !== 'never' || (context.date && context.date < rule.effectiveFrom) || !inRuleScope(rule, { mealClassId: mealClass.id })) continue;
    if (recipeMatchesTarget(recipe, rule.target.type, rule.target.id, revisionById, context.foodGroups)) reject(reasons, `never:${rule.id}`);
  }
  for (const rule of mealClass.rules || []) {
    if (!['forbid', 'require'].includes(rule.strength)) continue;
    const matched = mealRuleSatisfied(recipe, rule, revisionById, context.foodGroups || []);
    if (rule.strength === 'forbid' && matched) reject(reasons, `meal_rule:${rule.ruleType}:${rule.target}`);
    if (rule.strength === 'require' && !matched) reject(reasons, `meal_rule:require:${rule.ruleType}:${rule.target}`);
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
