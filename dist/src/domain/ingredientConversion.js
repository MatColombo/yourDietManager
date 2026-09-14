export function assertIngredientConversion(conversion, { ingredients, registry }) {
  registry.assert('ingredientConversion', conversion);
  for (const id of [conversion.fromIngredientId, conversion.toIngredientId]) {
    if (!ingredients.some(item => item.ingredientId === id && item.status === 'active')) throw new Error(`Unknown or inactive conversion form ${id}`);
  }
  if (!conversion.sourceRef.trim()) throw new Error('Conversion requires a source');
  if (conversion.purpose === 'unit' && conversion.fromIngredientId !== conversion.toIngredientId) throw new Error('Unit conversion must preserve ingredient form');
  return conversion;
}

export function convertIngredientQuantity({ amount, fromIngredientId, toIngredientId, fromUnit, toUnit, purpose, conversionId = null, version = null }, conversions = []) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Quantity must be a finite positive number');
  if (!['unit', 'shopping_yield'].includes(purpose)) throw new Error('Unknown conversion purpose');
  if (fromIngredientId === toIngredientId && fromUnit === toUnit) return { status: 'converted', amount, unit: toUnit, conversion: null };
  const matches = conversions.filter(item => item.fromIngredientId === fromIngredientId && item.toIngredientId === toIngredientId
    && item.fromUnit === fromUnit && item.toUnit === toUnit && item.purpose === purpose && item.reviewStatus === 'reviewed'
    && item.sourceRef?.trim() && Number.isFinite(item.factor) && item.factor > 0
    && (conversionId === null || item.conversionId === conversionId) && (version === null || item.version === version));
  // Never reverse an edge or select silently between different versions/sources.
  if (matches.length !== 1) return { status: matches.length ? 'choice_required' : 'conversion_missing', amount: null, unit: toUnit, candidates: matches };
  const conversion = matches[0];
  const result = amount * conversion.factor;
  if (!Number.isFinite(result)) throw new Error('Converted quantity is not finite');
  return { status: 'converted', amount: result, unit: toUnit, conversion };
}
