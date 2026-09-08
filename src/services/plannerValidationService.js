import { repositories } from '../repositories/repositoryHub.js';
import { loadConfigurationBundle } from './configurationService.js';
import { createPlanPreview } from './planGenerationService.js';
import { addCivilDays } from '../planner/planMath.js';
import { plannerConstraintPolicySnapshot } from '../planner/constraintPolicy.js';
import {
  applyPlannerValidationProfile, plannerValidationProfileMeta,
  PLANNER_VALIDATION_TARGETS, PLANNER_VALIDATION_TOLERANCES
} from '../planner/validationProfiles.js';
import { sha256Json } from '../lib/crypto.js';

function nowMs() { return globalThis.performance?.now?.() ?? Date.now(); }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round(Number(value || 0) * factor) / factor; }
function recipeTitle(recipe, locale = 'it') { return recipe?.i18n?.[locale]?.title || recipe?.i18n?.en?.title || recipe?.i18n?.it?.title || recipe?.recipeId || recipe?.recipeVersionId; }
function endDate(startDate, days) { return addCivilDays(startDate, Math.max(1, Number(days) || 1) - 1); }

function selectedVersionIds(preview) {
  return [...new Set((preview.calendarDays || []).flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
}

function planSignaturePayload(preview) {
  return (preview.calendarDays || []).map(day => ({
    date: day.date,
    slots: (day.mealSlots || []).map(slot => ({ id: slot.mealOccurrenceId, mode: slot.mode, recipes: (slot.recipeComponents || []).map(component => component.recipeVersionId) }))
  }));
}

function aggregateRejections(preview) {
  const out = {};
  const diagnostics = preview.diagnostics || {};
  const days = diagnostics.days || [];
  for (const day of days) for (const [key, value] of Object.entries(day.rejectionCounts || {})) out[key] = (out[key] || 0) + Number(value || 0);
  for (const failure of diagnostics.failures || []) for (const [key, value] of Object.entries(failure.rejectionCounts || {})) out[key] = (out[key] || 0) + Number(value || 0);
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function energySummary(preview) {
  if (preview.status !== 'success') return { allWithinTolerance: false, days: [] };
  const days = (preview.diagnostics?.days || []).map(day => ({
    date: day.date,
    targetKcal: round(day.energyConstraint?.targetKcal),
    minKcal: round(day.energyConstraint?.dailyMinKcal),
    maxKcal: round(day.energyConstraint?.dailyMaxKcal),
    totalKcal: round(day.energyConstraint?.budgetedTotalKcal),
    deviationPct: round(day.energyConstraint?.deviationPct),
    withinTolerance: day.energyConstraint?.withinTolerance === true
  }));
  return { allWithinTolerance: days.length > 0 && days.every(day => day.withinTolerance), days };
}

async function summarizeSelection(preview, repo, locale) {
  const ids = selectedVersionIds(preview);
  const recipes = await repo.getMany('recipeVersions', ids);
  const uniqueIngredients = new Set(recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientId)));
  const dietCounts = { vegan: 0, vegetarian: 0, pescatarian: 0 };
  for (const recipe of recipes) {
    const diet = recipe.tags?.diet || [];
    if (diet.includes('diet_vegan')) dietCounts.vegan += 1;
    if (diet.includes('diet_vegetarian')) dietCounts.vegetarian += 1;
    if (diet.includes('diet_pescatarian')) dietCounts.pescatarian += 1;
  }
  return {
    uniqueRecipeCount: recipes.length,
    uniqueIngredientCount: uniqueIngredients.size,
    dietCounts,
    recipes: recipes.map(recipe => ({ recipeVersionId: recipe.recipeVersionId, recipeId: recipe.recipeId, title: recipeTitle(recipe, locale), energyKcal: round(recipe.calculatedNutrition?.energyKcal), proteinG: round(recipe.calculatedNutrition?.proteinG), tags: recipe.tags || {} }))
  };
}

export async function runPlannerValidationCase(options, { repo = repositories, registry, locale = 'it' } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const baseBundle = await loadConfigurationBundle(repo);
  const profileId = options.profileId || 'current';
  const bundle = applyPlannerValidationProfile(baseBundle, { profileId, targetKcal: options.targetKcal, tolerancePct: options.tolerancePct, hardAllergenId: options.hardAllergenId || null });
  const days = Math.min(14, Math.max(1, Number(options.days) || 1));
  const startDate = options.startDate;
  const validationContext = { phase: 'C', profileId, hardAllergenId: options.hardAllergenId || null, targetKcal: Number(options.targetKcal), tolerancePct: Number(options.tolerancePct), days };
  const started = nowMs();
  const preview = await createPlanPreview({
    horizon: { startDate, endDate: endDate(startDate, days) }, seed: options.seed || 'phase-c-manual', createdAt: options.createdAt || new Date().toISOString(),
    reason: 'manual_regeneration', configurationOverride: bundle, validationContext,
    candidateRetrievalLimit: options.candidateRetrievalLimit || 500,
    candidateLimit: options.candidateLimit || 20, beamWidth: options.beamWidth || 100, slotOptionLimit: options.slotOptionLimit || 40,
    historyPlanInstanceId: null, ignorePlanHistory: true
  }, { repo, registry });
  const durationMs = round(nowMs() - started, 1);
  const profile = plannerValidationProfileMeta(profileId);
  const signature = await sha256Json(planSignaturePayload(preview));
  const selection = preview.status === 'success' ? await summarizeSelection(preview, repo, locale) : { uniqueRecipeCount: 0, uniqueIngredientCount: 0, dietCounts: { vegan: 0, vegetarian: 0, pescatarian: 0 }, recipes: [] };
  const servingsFixed = preview.status !== 'success' || (preview.calendarDays || []).every(day => (day.mealSlots || []).every(slot => (slot.recipeComponents || []).every(component => component.servings === 1)));
  return {
    schemaVersion: 1,
    kind: 'planner_validation_case',
    options: { ...validationContext, seed: options.seed || 'phase-c-manual', startDate },
    expectedOutcome: profile?.expected || 'any',
    actualOutcome: preview.status,
    expectationMet: profile?.expected === 'failed' ? preview.status === 'failed' : true,
    durationMs,
    signature,
    energy: energySummary(preview),
    servingsFixed,
    rejectionCounts: aggregateRejections(preview),
    selection,
    constraintPolicy: plannerConstraintPolicySnapshot(),
    diagnostics: preview.diagnostics,
    failure: preview.failure || null,
    preview
  };
}

export async function runPlannerDeterminismCheck(options, deps = {}) {
  const createdAt = options.createdAt || '2026-09-08T06:00:00.000Z';
  const first = await runPlannerValidationCase({ ...options, createdAt }, deps);
  const second = await runPlannerValidationCase({ ...options, createdAt }, deps);
  return { schemaVersion: 1, kind: 'planner_determinism_check', deterministic: first.signature === second.signature && first.actualOutcome === second.actualOutcome, first, second };
}

export async function runPlannerEnergySweep(options, deps = {}) {
  const targets = options.targets || PLANNER_VALIDATION_TARGETS;
  const tolerances = options.tolerances || PLANNER_VALIDATION_TOLERANCES;
  const rows = [];
  for (const targetKcal of targets) for (const tolerancePct of tolerances) {
    const result = await runPlannerValidationCase({ ...options, targetKcal, tolerancePct, days: 1, seed: `${options.seed || 'phase-c-sweep'}-${targetKcal}-${tolerancePct}` }, deps);
    rows.push({ targetKcal, tolerancePct, status: result.actualOutcome, durationMs: result.durationMs, energyWithinTolerance: result.energy.allWithinTolerance, failureCode: result.failure?.code || null, signature: result.signature });
  }
  return { schemaVersion: 1, kind: 'planner_energy_sweep', targets: [...targets], tolerances: [...tolerances], rows, allFeasible: rows.every(row => row.status === 'success' && row.energyWithinTolerance), totalDurationMs: round(rows.reduce((sum, row) => sum + row.durationMs, 0), 1) };
}
