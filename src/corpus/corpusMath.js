import { canonicalJson, sha256Text } from '../lib/crypto.js';

export function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
export function round(value, digits = 4) { const p = 10 ** digits; return Math.round((Number(value) + Number.EPSILON) * p) / p; }
export function unique(values) { return [...new Set(values.filter(value => value != null && value !== ''))]; }
export function countEntries(map) { return [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, count]) => ({ key, count })); }
export function increment(map, key, amount = 1) { if (key == null || key === '') return; map.set(key, (map.get(key) || 0) + amount); }
export function inBand(value, band) { return Number(value) >= Number(band.min) && Number(value) <= Number(band.max); }
export function bandIdFor(value, bands) { return bands.find(band => inBand(value, band))?.bandId || null; }
export function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function textTokens(value) { return normalizeText(value).split(/\s+/).filter(Boolean); }
export function jaccard(a, b) {
  const left = a instanceof Set ? a : new Set(a); const right = b instanceof Set ? b : new Set(b);
  if (!left.size && !right.size) return 1;
  let intersection = 0; for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
export function tokenSimilarity(a, b) { return jaccard(new Set(textTokens(a)), new Set(textTokens(b))); }
export function recipeIngredientSet(recipe) { return new Set((recipe.ingredientLines || []).map(line => line.ingredientId)); }
export function primaryIngredientId(recipe, exempt = new Set()) {
  const lines = (recipe.ingredientLines || []).filter(line => !exempt.has(line.ingredientId));
  if (!lines.length) return null;
  return [...lines].sort((a, b) => Number(b.normalizedAmount || 0) - Number(a.normalizedAmount || 0) || String(a.ingredientId).localeCompare(String(b.ingredientId)))[0].ingredientId;
}
export function quantityBucket(amount) {
  const n = Number(amount || 0); if (n <= 0) return '0';
  if (n < 15) return 'xs'; if (n < 50) return 's'; if (n < 120) return 'm'; if (n < 250) return 'l'; return 'xl';
}
export function exactRecipeSignature(recipe) {
  const family = [...(recipe.tags?.families || [])].sort()[0] || 'unknown';
  const ingredients = (recipe.ingredientLines || []).map(line => `${line.ingredientId}:${quantityBucket(line.normalizedAmount)}`).sort();
  const meals = [...(recipe.mealArchetypes || [])].sort();
  return canonicalJson({ family, ingredients, meals });
}
export async function deterministicHash(seed, key) { return sha256Text(`${seed}\n${key}`); }
export function coverageDeficit(target, currentCount, denominator) {
  const share = denominator > 0 ? currentCount / denominator : 0;
  const countDeficit = target.desiredCount != null ? clamp((target.desiredCount - currentCount) / Math.max(target.desiredCount, 1)) : target.minCount != null ? clamp((target.minCount - currentCount) / Math.max(target.minCount, 1)) : 0;
  const shareTarget = target.desiredShare != null ? target.desiredShare : target.minShare;
  const shareDeficit = shareTarget != null ? clamp((shareTarget - share) / Math.max(shareTarget, 1e-9)) : 0;
  return { currentShare: share, normalizedDeficit: Math.max(countDeficit, shareDeficit) };
}
export function targetIsUndercovered(target, count, denominator) {
  const share = denominator > 0 ? count / denominator : 0;
  if (target.minCount != null && count < target.minCount) return true;
  if (target.desiredCount != null && count < target.desiredCount) return true;
  if (target.minShare != null && share < target.minShare) return true;
  if (target.desiredShare != null && share < target.desiredShare) return true;
  return false;
}
export function targetHardMinimumMet(target, count, denominator) {
  const share = denominator > 0 ? count / denominator : 0;
  if (target.minCount != null && count < target.minCount) return false;
  if (target.minShare != null && share < target.minShare) return false;
  return true;
}
