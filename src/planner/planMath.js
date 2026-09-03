export const NUTRIENT_KEYS = Object.freeze(['energyKcal', 'proteinG', 'carbsG', 'fatG', 'fiberG']);

export function addCivilDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid civil date ${date}`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days));
  return parsed.toISOString().slice(0, 10);
}

export function dateRange(startDate, endDate) {
  if (endDate < startDate) throw new Error('Generation horizon endDate must be >= startDate');
  const out = [];
  for (let date = startDate; date <= endDate; date = addCivilDays(date, 1)) out.push(date);
  return out;
}

export function daysBetween(startDate, endDate) {
  return Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000);
}

export function sumNutrition(items) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, 0]));
  for (const item of items) {
    const nutrition = item?.calculatedNutrition || item || {};
    for (const key of NUTRIENT_KEYS) total[key] += Number(nutrition[key] || 0);
  }
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, Math.round(total[key] * 10) / 10]));
}

export function addNutrition(a, b) {
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, Math.round((Number(a?.[key] || 0) + Number(b?.[key] || 0)) * 10) / 10]));
}

export function dayEnergyTarget(profile, dayArchetype) {
  const base = Number(profile.dailyEnergyKcal);
  const modifier = profile.dayArchetypeModifiers?.[dayArchetype];
  if (!modifier) return base;
  if (modifier.mode === 'percent') return Math.round(base * (1 + Number(modifier.value) / 100) * 10) / 10;
  if (modifier.mode === 'kcal') return Math.max(1, Math.round((base + Number(modifier.value)) * 10) / 10);
  return base;
}

export function targetPenalty(actual, target, min, max, weight = 1) {
  if (target != null) return Math.abs(actual - target) / Math.max(1, target) * 100 * weight;
  if (min != null && actual < min) return (min - actual) / Math.max(1, min) * 100 * weight;
  if (max != null && actual > max) return (actual - max) / Math.max(1, max) * 100 * weight;
  return 0;
}

export function nutritionPenalty(nutrition, profile, { energyTarget, energyWeight = 3, nutrientScale = 1 } = {}) {
  let score = targetPenalty(nutrition.energyKcal, energyTarget, null, null, energyWeight);
  for (const key of ['proteinG', 'carbsG', 'fatG', 'fiberG']) {
    const target = profile.nutrients?.[key];
    if (!target?.enabled) continue;
    const scale = Number(nutrientScale);
    const min = target.min == null ? null : target.min * scale;
    const ideal = target.target == null ? null : target.target * scale;
    const max = target.max == null ? null : target.max * scale;
    score += targetPenalty(nutrition[key], ideal, min, max, target.weight || 1);
  }
  return score;
}

export function matchOperator(value, operator, expected) {
  if (operator === 'lte') return value <= expected;
  if (operator === 'gte') return value >= expected;
  if (operator === 'eq') return value === expected;
  return false;
}
