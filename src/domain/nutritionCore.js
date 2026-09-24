import { convertIngredientQuantity } from './ingredientConversion.js';
export const CALCULATION_ALGORITHM_VERSION = 'nutrition-core-1';
export const NUTRIENTS = ['energyKcal','proteinG','carbsG','fatG','fiberG'];

export function normalizeIngredientAmount(revision, amount, unit, { conversions = [], conversionId = null, version = null } = {}) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Ingredient amount must be greater than zero');
  if (unit === revision.basis.unit) return { normalizedAmount: numeric, normalizedUnit: unit };
  if (revision.schemaVersion === 2) {
    const result = convertIngredientQuantity({ amount: numeric, fromIngredientId: revision.ingredientId, toIngredientId: revision.ingredientId, fromUnit: unit, toUnit: revision.basis.unit, purpose: 'unit', conversionId, version }, conversions);
    if (result.status !== 'converted') throw new Error(`No reviewed ${unit} conversion is selected for ${revision.ingredientRevisionId}`);
    return { normalizedAmount: result.amount, normalizedUnit: result.unit };
  }
  const conversion = (revision.conversions || []).find(item => item.unit === unit);
  if (!conversion) throw new Error(`No ${unit} conversion is defined for ${revision.ingredientRevisionId}`);
  if (conversion.canonicalUnit !== revision.basis.unit) throw new Error(`Conversion unit does not match nutrition basis for ${revision.ingredientRevisionId}`);
  return { normalizedAmount: numeric * conversion.canonicalAmount, normalizedUnit: conversion.canonicalUnit };
}

export function calculateIngredientLineNutrition(line, revision) {
  if (!revision) throw new Error(`Missing ingredient revision ${line.ingredientRevisionId}`);
  if (line.ingredientId && line.ingredientId !== revision.ingredientId) throw new Error('Ingredient/revision mismatch');
  if (!Number.isFinite(line.normalizedAmount) || line.normalizedAmount <= 0) throw new Error('Normalized amount must be finite and positive');
  if (revision.basis.amount !== 100 || NUTRIENTS.some(key => !Number.isFinite(revision.nutrition[key]) || revision.nutrition[key] < 0)) throw new Error('Unresolved nutritional basis');
  if (line.normalizedUnit !== revision.basis.unit) throw new Error(`Normalized unit mismatch for ${line.ingredientRevisionId}`);
  const factor = line.normalizedAmount / revision.basis.amount;
  return Object.fromEntries(NUTRIENTS.map(key => [key, revision.nutrition[key] * factor]));
}

export function calculateRecipeNutrition(lines, revisionById) {
  const total = Object.fromEntries(NUTRIENTS.map(key => [key, 0]));
  for (const line of lines) {
    const nutrition = calculateIngredientLineNutrition(line, revisionById.get(line.ingredientRevisionId));
    for (const key of NUTRIENTS) total[key] += nutrition[key];
  }
  return Object.fromEntries(NUTRIENTS.map(key => [key, Math.round(total[key] * 10) / 10]));
}


function rounded(value) { return Math.round(Number(value || 0) * 10) / 10; }
function sharePercent(value, total) { return Number(total) > 0 ? Math.round((Number(value || 0) / Number(total)) * 1000) / 10 : null; }

export function calculateIngredientNutritionBreakdown(lines, revisionById, totalNutrition = null) {
  const total = totalNutrition || calculateRecipeNutrition(lines, revisionById);
  return (lines || []).map((line, index) => {
    const rawNutrition = calculateIngredientLineNutrition(line, revisionById.get(line.ingredientRevisionId));
    const nutrition = Object.fromEntries(NUTRIENTS.map(key => [key, rounded(rawNutrition[key])]));
    return {
      index,
      ingredientId: line.ingredientId || revisionById.get(line.ingredientRevisionId)?.ingredientId || null,
      ingredientRevisionId: line.ingredientRevisionId,
      amount: line.amount,
      unit: line.unit,
      normalizedAmount: line.normalizedAmount,
      normalizedUnit: line.normalizedUnit,
      nutrition,
      sharePercent: Object.fromEntries(NUTRIENTS.map(key => [key, sharePercent(rawNutrition[key], total?.[key])]))
    };
  });
}

export function calculateMealEnergyKcal(recipeComponents, nutritionByVersion) {
  const getNutrition = id => nutritionByVersion instanceof Map ? nutritionByVersion.get(id) : nutritionByVersion?.[id];
  let total = 0;
  for (const component of recipeComponents || []) {
    const nutrition = getNutrition(component.recipeVersionId);
    if (!nutrition || !Number.isFinite(Number(nutrition.energyKcal))) return null;
    const servings = Number(component.servings ?? 1);
    if (!Number.isFinite(servings) || servings <= 0) return null;
    total += Number(nutrition.energyKcal) * servings;
  }
  return rounded(total);
}

export function deriveAllergens(lines, revisionById) {
  const values = new Set();
  for (const line of lines) for (const id of revisionById.get(line.ingredientRevisionId)?.allergenIds || []) values.add(id);
  return [...values].sort();
}
