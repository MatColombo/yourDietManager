import { extensionPreferenceScore } from '../domain/productExtensions.js';
import { legacyPreferenceRules } from '../domain/frequencyCounter.js';
import { nutritionPenalty, matchOperator } from './planMath.js';
import { recipeMatchesTarget, mealRuleSatisfied, families, cuisines, primaryIngredientId, ingredientIds, foodCategories } from './recipeFeatures.js';
import { plannerPolicy, VARIETY_MODES } from './varietyPolicy.js';
import { generationTuningScore } from './generationTuning.js';

const STRENGTH = Object.freeze({ prefer: -2, slight_prefer: -1, neutral: 0, avoid: 3 });
const PREFERENCE = Object.freeze({ more_often: -1.5, normal: 0, less_often: 1.5, rarely: 3.5 });

function recent(history, currentDate, days) {
  const threshold = new Date(`${currentDate}T00:00:00Z`).getTime() - days * 86400000;
  return history.filter(entry => new Date(`${entry.date}T00:00:00Z`).getTime() >= threshold && entry.date < currentDate);
}

function countFeature(entries, getter, values) {
  const target = new Set(values.filter(Boolean));
  if (!target.size) return 0;
  return entries.reduce((count, entry) => count + (getter(entry.recipe).some(value => target.has(value)) ? 1 : 0), 0);
}

export function preferenceScore(recipe, { mealClass, foodPreferences, revisionById }) {
  let score = 0;
  const reasons = [];
  for (const rule of mealClass.rules || []) {
    if (rule.strength === 'forbid' || rule.strength === 'require' || rule.strength === 'neutral') continue;
    const matched = mealRuleSatisfied(recipe, rule, revisionById);
    if (matched) {
      score += STRENGTH[rule.strength] || 0;
      reasons.push(`${rule.strength}:${rule.ruleType}:${rule.target}`);
    } else if ((rule.ruleType === 'nutrition' || rule.ruleType === 'practical') && ['prefer', 'slight_prefer'].includes(rule.strength)) score += 0.75;
  }
  for (const rule of legacyPreferenceRules(foodPreferences)) {
    if (rule.autoExclude) continue;
    if (recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) {
      score += PREFERENCE[rule.level] || 0;
      reasons.push(`preference:${rule.level}:${rule.targetId}`);
    }
  }
  return { score, reasons };
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
    const state = revision?.basis?.state;
    if (!PERISHABLE_CATEGORIES.has(revision?.productTaxonomy?.categoryId)) continue;
    if (['dry', 'drained'].includes(state)) continue;
    ids.add(line.ingredientId);
  }
  return ids;
}

export function varietyScore(recipe, { history = [], date, revisionById, foodPreferences }) {
  let score = 0;
  const reasons = [];
  const policy = plannerPolicy(foodPreferences);
  const primary = primaryIngredientId(recipe);
  const cats = [...foodCategories(recipe, revisionById)];
  for (const window of policy.varietyWindows) {
    const entries = recent(history, date, window.days);
    const recipeCount = entries.filter(entry => entry.recipe.recipeId === recipe.recipeId).length;
    const familyCount = countFeature(entries, r => families(r), families(recipe));
    const primaryCount = entries.filter(entry => primary && primaryIngredientId(entry.recipe) === primary).length;
    const ingredientCount = countFeature(entries, r => ingredientIds(r), ingredientIds(recipe));
    const categoryCount = countFeature(entries, r => [...foodCategories(r, revisionById)], cats);
    const cuisineCount = countFeature(entries, r => cuisines(r), cuisines(recipe));
    score += recipeCount * window.recipe + familyCount * window.family + primaryCount * window.primary + ingredientCount * Number(window.ingredient || 0) + categoryCount * window.category + cuisineCount * window.cuisine;
  }
  if (policy.varietyMode === VARIETY_MODES.perishables) {
    const wanted = perishableIngredientIds(recipe, revisionById);
    if (wanted.size) {
      const seen = new Set();
      for (const entry of recent(history, date, policy.perishableWindowDays)) {
        for (const id of perishableIngredientIds(entry.recipe, revisionById)) if (wanted.has(id)) seen.add(id);
      }
      if (seen.size) {
        const reward = Math.min(6, seen.size * policy.perishableOverlapReward);
        score -= reward;
        reasons.push(`perishable-proximity:-${Math.round(reward * 100) / 100}`);
      }
    }
  }
  for (const rule of legacyPreferenceRules(foodPreferences)) {
    if (!rule.frequency || !recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) continue;
    const entries = recent(history, date, rule.frequency.windowDays);
    const occurrences = entries.filter(entry => recipeMatchesTarget(entry.recipe, rule.targetType, rule.targetId, revisionById)).length;
    const next = occurrences + 1;
    if (next > rule.frequency.maxOccurrences) {
      const penalty = (next - rule.frequency.maxOccurrences) * 8;
      score += penalty;
      reasons.push(`frequency:${rule.targetId}:${next}/${rule.frequency.maxOccurrences}`);
    }
  }
  if (score !== 0) reasons.push(`variety:${Math.round(score * 100) / 100}`);
  return { score, reasons };
}

export function scoreRecipe(recipe, context) {
  const pref = preferenceScore(recipe, context); const extension = extensionPreferenceScore(recipe, context); pref.score += extension.score; pref.reasons.push(...extension.reasons);
  const variety = varietyScore(recipe, context);
  const tuning = generationTuningScore(recipe, context);
  const target = context.slotEnergyTarget;
  const nutrientTargetFactor = target / Math.max(1, context.dayEnergyTarget);
  const nutrition = nutritionPenalty(recipe.calculatedNutrition, context.nutritionProfile, { energyTarget: target, energyWeight: 1.5, nutrientTargetFactor });
  return {
    total: nutrition + pref.score + variety.score + tuning.score,
    components: { nutrition, preference: pref.score, variety: variety.score, tuning: tuning.score },
    reasons: [...pref.reasons, ...variety.reasons, ...tuning.reasons]
  };
}
