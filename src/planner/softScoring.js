import { nutritionPenalty, matchOperator } from './planMath.js';
import { recipeMatchesTarget, numericRuleSatisfied, families, cuisines, primaryIngredientId, foodCategories } from './recipeFeatures.js';

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
    if (rule.strength === 'forbid' || rule.strength === 'neutral') continue;
    let matched;
    if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') matched = numericRuleSatisfied(recipe, rule);
    else matched = recipeMatchesTarget(recipe, rule.ruleType, rule.target, revisionById);
    if (matched) {
      score += STRENGTH[rule.strength] || 0;
      reasons.push(`${rule.strength}:${rule.ruleType}:${rule.target}`);
    } else if ((rule.ruleType === 'nutrition' || rule.ruleType === 'practical') && ['prefer', 'slight_prefer'].includes(rule.strength)) score += 0.75;
  }
  for (const rule of foodPreferences?.rules || []) {
    if (rule.autoExclude) continue;
    if (recipeMatchesTarget(recipe, rule.targetType, rule.targetId, revisionById)) {
      score += PREFERENCE[rule.level] || 0;
      reasons.push(`preference:${rule.level}:${rule.targetId}`);
    }
  }
  return { score, reasons };
}

export function varietyScore(recipe, { history = [], date, revisionById, foodPreferences }) {
  let score = 0;
  const reasons = [];
  const windows = [{ days: 3, recipe: 6, family: 2.5, primary: 1.8, category: 0.8, cuisine: 0.7 }, { days: 7, recipe: 2.5, family: 1.2, primary: 0.8, category: 0.35, cuisine: 0.25 }, { days: 14, recipe: 0.8, family: 0.35, primary: 0.25, category: 0.1, cuisine: 0.08 }];
  const primary = primaryIngredientId(recipe);
  const cats = [...foodCategories(recipe, revisionById)];
  for (const window of windows) {
    const entries = recent(history, date, window.days);
    const recipeCount = entries.filter(entry => entry.recipe.recipeId === recipe.recipeId).length;
    const familyCount = countFeature(entries, r => families(r), families(recipe));
    const primaryCount = entries.filter(entry => primary && primaryIngredientId(entry.recipe) === primary).length;
    const categoryCount = countFeature(entries, r => [...foodCategories(r, revisionById)], cats);
    const cuisineCount = countFeature(entries, r => cuisines(r), cuisines(recipe));
    score += recipeCount * window.recipe + familyCount * window.family + primaryCount * window.primary + categoryCount * window.category + cuisineCount * window.cuisine;
  }
  for (const rule of foodPreferences?.rules || []) {
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
  if (score > 0) reasons.push(`variety:${Math.round(score * 100) / 100}`);
  return { score, reasons };
}

export function scoreRecipe(recipe, context) {
  const pref = preferenceScore(recipe, context);
  const variety = varietyScore(recipe, context);
  const target = context.slotEnergyTarget;
  const nutrientTargetFactor = target / Math.max(1, context.dayEnergyTarget);
  const nutrition = nutritionPenalty(recipe.calculatedNutrition, context.nutritionProfile, { energyTarget: target, energyWeight: 1.5, nutrientTargetFactor });
  return {
    total: nutrition + pref.score + variety.score,
    components: { nutrition, preference: pref.score, variety: variety.score },
    reasons: [...pref.reasons, ...variety.reasons]
  };
}
