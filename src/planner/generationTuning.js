import { recipeMatchesTarget } from './recipeFeatures.js';

export const GENERATION_TUNING_VERSION = 1;
export const GENERATION_TUNING_POLICY_VERSION = 'generation-tuning-r1';

const CATEGORICAL_TARGETS = new Set(['ingredient', 'recipe', 'flavor', 'tag']);
const DIRECTIONAL_TARGETS = new Set(['nutrient', 'practical']);
const CATEGORICAL_MODES = new Set(['prefer', 'avoid', 'exclude']);
const DIRECTIONAL_MODES = new Set(['increase', 'decrease']);
const NUTRIENT_TARGETS = new Set(['proteinG', 'carbsG', 'fatG', 'fiberG']);
const PRACTICAL_TARGETS = new Set(['prepMinutes', 'cookMinutes', 'eatingMinutes']);
const NUTRIENT_REFERENCE_DENSITY = Object.freeze({ proteinG: 5, carbsG: 12, fatG: 4, fiberG: 2 });
const PRACTICAL_REFERENCE = Object.freeze({ prepMinutes: 15, cookMinutes: 20, eatingMinutes: 15 });

function cleanIdList(values) { return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))].sort(); }
function clampWeight(value) { const number = Number(value ?? 2); return Math.max(1, Math.min(5, Number.isFinite(number) ? number : 2)); }
function assertDate(value, name) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`Invalid tuning ${name}`); }
function inRange(value, start, end) { return value >= start && value <= end; }

export function normalizeGenerationTuningOverlay(overlay, { horizon, mealClassIds = [], ingredientIds = null, recipeIds = null, taxonomyTermIds = null } = {}) {
  const source = overlay || { schemaVersion: GENERATION_TUNING_VERSION, rules: [] };
  if (Number(source.schemaVersion ?? GENERATION_TUNING_VERSION) !== GENERATION_TUNING_VERSION) throw new Error('Unsupported generation tuning overlay version');
  if (!horizon?.startDate || !horizon?.endDate) throw new Error('Generation tuning requires a generation horizon');
  assertDate(horizon.startDate, 'horizon startDate'); assertDate(horizon.endDate, 'horizon endDate');
  if (horizon.endDate < horizon.startDate) throw new Error('Invalid generation tuning horizon');
  const validMealClasses = new Set(mealClassIds || []);
  const validIngredients = ingredientIds ? new Set(ingredientIds) : null;
  const validRecipes = recipeIds ? new Set(recipeIds) : null;
  const validTerms = taxonomyTermIds ? new Set(taxonomyTermIds) : null;
  const rules = [];
  for (const [index, raw] of (source.rules || []).entries()) {
    const targetType = String(raw?.targetType || ''); const mode = String(raw?.mode || ''); const target = String(raw?.target || '').trim();
    if (!CATEGORICAL_TARGETS.has(targetType) && !DIRECTIONAL_TARGETS.has(targetType)) throw new Error(`Unsupported tuning targetType ${targetType || '(empty)'}`);
    if (CATEGORICAL_TARGETS.has(targetType) && !CATEGORICAL_MODES.has(mode)) throw new Error(`Unsupported tuning mode ${mode || '(empty)'} for ${targetType}`);
    if (DIRECTIONAL_TARGETS.has(targetType) && !DIRECTIONAL_MODES.has(mode)) throw new Error(`Unsupported tuning direction ${mode || '(empty)'} for ${targetType}`);
    if (!target) throw new Error('Generation tuning target is required');
    if (targetType === 'nutrient' && !NUTRIENT_TARGETS.has(target)) throw new Error(`Unsupported tuning nutrient ${target}`);
    if (targetType === 'practical' && !PRACTICAL_TARGETS.has(target)) throw new Error(`Unsupported tuning practical target ${target}`);
    if (targetType === 'ingredient' && validIngredients && !validIngredients.has(target)) throw new Error(`Unknown tuning ingredient ${target}`);
    if (targetType === 'recipe' && validRecipes && !validRecipes.has(target)) throw new Error(`Unknown tuning recipe ${target}`);
    if (['flavor', 'tag'].includes(targetType) && validTerms && !validTerms.has(target)) throw new Error(`Unknown tuning taxonomy term ${target}`);
    const scope = raw.scope || {};
    const startDate = scope.startDate || horizon.startDate; const endDate = scope.endDate || horizon.endDate;
    assertDate(startDate, 'startDate'); assertDate(endDate, 'endDate');
    if (endDate < startDate || !inRange(startDate, horizon.startDate, horizon.endDate) || !inRange(endDate, horizon.startDate, horizon.endDate)) throw new Error('Generation tuning scope must stay inside the proposal horizon');
    const scopedMealClasses = cleanIdList(scope.mealClassIds || []);
    if (validMealClasses.size && scopedMealClasses.some(id => !validMealClasses.has(id))) throw new Error('Generation tuning references an unknown meal class');
    rules.push({
      id: `tune_${String(index + 1).padStart(3, '0')}`,
      targetType, target, mode, weight: mode === 'exclude' ? 5 : clampWeight(raw.weight),
      scope: { startDate, endDate, mealClassIds: scopedMealClasses },
      label: raw.label == null ? null : String(raw.label).trim().slice(0, 160) || null,
      intent: raw.intent == null ? null : String(raw.intent).trim().slice(0, 80) || null
    });
  }
  return { schemaVersion: GENERATION_TUNING_VERSION, policyVersion: GENERATION_TUNING_POLICY_VERSION, rules };
}

export function activeGenerationTuningRules(overlay, { date, mealClassId } = {}) {
  if (!overlay?.rules?.length || !date) return [];
  return overlay.rules.filter(rule => date >= rule.scope.startDate && date <= rule.scope.endDate && (!rule.scope.mealClassIds.length || rule.scope.mealClassIds.includes(mealClassId)));
}

export function generationTuningRuleMatches(recipe, rule, revisionById, foodGroups = []) {
  if (rule.targetType === 'recipe') return recipe.recipeId === rule.target || recipe.recipeVersionId === rule.target;
  if (rule.targetType === 'ingredient') return recipeMatchesTarget(recipe, 'ingredient', rule.target, revisionById, foodGroups);
  if (rule.targetType === 'flavor') return recipeMatchesTarget(recipe, 'flavor', rule.target, revisionById, foodGroups);
  if (rule.targetType === 'tag') return recipeMatchesTarget(recipe, 'tag', rule.target, revisionById, foodGroups);
  return false;
}

export function generationTuningHardRejections(recipe, context = {}) {
  const reasons = [];
  for (const rule of activeGenerationTuningRules(context.generationTuningOverlay, { date: context.date, mealClassId: context.mealClass?.id })) {
    if (rule.mode !== 'exclude' || !CATEGORICAL_TARGETS.has(rule.targetType)) continue;
    if (generationTuningRuleMatches(recipe, rule, context.revisionById, context.foodGroups || [])) reasons.push(`tuning_exclude:${rule.id}:${rule.targetType}:${rule.target}`);
  }
  return reasons;
}

function nutrientDensity(recipe, key) {
  const nutrition = recipe?.calculatedNutrition || {};
  const energy = Math.max(1, Number(nutrition.energyKcal || 0));
  return Number(nutrition[key] || 0) / energy * 100;
}

function directionalScore(recipe, rule) {
  let normalized = 0;
  if (rule.targetType === 'nutrient') normalized = nutrientDensity(recipe, rule.target) / Math.max(0.1, NUTRIENT_REFERENCE_DENSITY[rule.target] || 1);
  else normalized = Number(recipe?.practical?.[rule.target] || 0) / Math.max(1, PRACTICAL_REFERENCE[rule.target] || 15);
  normalized = Math.max(0, Math.min(4, normalized));
  const magnitude = normalized * Number(rule.weight || 1) * 1.6;
  return rule.mode === 'increase' ? -magnitude : magnitude;
}

export function generationTuningScore(recipe, context = {}) {
  let score = 0; const reasons = [];
  for (const rule of activeGenerationTuningRules(context.generationTuningOverlay, { date: context.date, mealClassId: context.mealClass?.id })) {
    if (rule.mode === 'exclude') continue;
    if (CATEGORICAL_TARGETS.has(rule.targetType)) {
      const matched = generationTuningRuleMatches(recipe, rule, context.revisionById, context.foodGroups || []);
      if (!matched) continue;
      const magnitude = Number(rule.weight || 1) * (rule.mode === 'prefer' ? -4 : 4.5);
      score += magnitude; reasons.push(`tuning:${rule.mode}:${rule.targetType}:${rule.target}:${Math.round(magnitude * 100) / 100}`);
      continue;
    }
    const value = directionalScore(recipe, rule); score += value; reasons.push(`tuning:${rule.mode}:${rule.targetType}:${rule.target}:${Math.round(value * 100) / 100}`);
  }
  return { score, reasons };
}

export function tuningOverlayHasHardExclusion(overlay, { targetType, target, date = null, mealClassId = null } = {}) {
  if (!overlay?.rules?.length) return false;
  return overlay.rules.some(rule => rule.mode === 'exclude' && rule.targetType === targetType && rule.target === target
    && (!date || (date >= rule.scope.startDate && date <= rule.scope.endDate))
    && (!mealClassId || !rule.scope.mealClassIds.length || rule.scope.mealClassIds.includes(mealClassId)));
}
