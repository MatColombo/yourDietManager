export const CALCULATION_ALGORITHM_VERSION = 'nutrition-core-1';
const NUTRIENTS = ['energyKcal','proteinG','carbsG','fatG','fiberG'];

export function normalizeIngredientAmount(revision, amount, unit) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Ingredient amount must be greater than zero');
  if (unit === revision.basis.unit) return { normalizedAmount: numeric, normalizedUnit: unit };
  const conversion = (revision.conversions || []).find(item => item.unit === unit);
  if (!conversion) throw new Error(`No ${unit} conversion is defined for ${revision.ingredientRevisionId}`);
  if (conversion.canonicalUnit !== revision.basis.unit) throw new Error(`Conversion unit does not match nutrition basis for ${revision.ingredientRevisionId}`);
  return { normalizedAmount: numeric * conversion.canonicalAmount, normalizedUnit: conversion.canonicalUnit };
}

export function calculateRecipeNutrition(lines, revisionById) {
  const total = Object.fromEntries(NUTRIENTS.map(key => [key, 0]));
  for (const line of lines) {
    const revision = revisionById.get(line.ingredientRevisionId);
    if (!revision) throw new Error(`Missing ingredient revision ${line.ingredientRevisionId}`);
    if (line.normalizedUnit !== revision.basis.unit) throw new Error(`Normalized unit mismatch for ${line.ingredientRevisionId}`);
    const factor = line.normalizedAmount / revision.basis.amount;
    for (const key of NUTRIENTS) total[key] += revision.nutrition[key] * factor;
  }
  return Object.fromEntries(NUTRIENTS.map(key => [key, Math.round(total[key] * 10) / 10]));
}

export function deriveAllergens(lines, revisionById) {
  const values = new Set();
  for (const line of lines) for (const id of revisionById.get(line.ingredientRevisionId)?.allergenIds || []) values.add(id);
  return [...values].sort();
}
