import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import { createGenerationTuningPreview } from '../src/services/generationTuningService.js';
import { commitGeneratedPreview, createGenerationReplacementPreview } from '../src/services/effectivePlanService.js';
import { generationTuningScore, normalizeGenerationTuningOverlay } from '../src/planner/generationTuning.js';

function dinner(preview) { return preview.calendarDays[0].mealSlots.find(slot => slot.mealClassId === 'mc-dinner'); }

async function addIngredientFamiliesForFixture(deps) {
  const versions = await deps.repo.getAll('recipeVersions');
  const byIngredient = new Map();
  for (const recipe of versions) for (const line of recipe.ingredientLines || []) if (!byIngredient.has(line.ingredientId)) byIngredient.set(line.ingredientId, line.ingredientRevisionId);
  for (const [ingredientId, revisionId] of byIngredient) await deps.repo.put('ingredients', { schemaVersion: 1, ingredientId, origin: 'base', currentRevisionId: revisionId, status: 'active', createdAt: '2026-09-23T12:00:00Z', updatedAt: '2026-09-23T12:00:00Z' });
}

test('Feature 6 — tuning overlay normalizes scope and applies scoped soft scoring', () => {
  const overlay = normalizeGenerationTuningOverlay({ schemaVersion: 1, rules: [{ targetType: 'flavor', target: 'flavor_sweet', mode: 'prefer', weight: 3, scope: { startDate: '2026-09-23', endDate: '2026-09-24', mealClassIds: ['mc-breakfast'] } }] }, { horizon: { startDate: '2026-09-23', endDate: '2026-09-25' }, mealClassIds: ['mc-breakfast'] });
  assert.equal(overlay.rules[0].id, 'tune_001');
  const recipe = { recipeId: 'r-sweet', recipeVersionId: 'rv-sweet', calculatedNutrition: { energyKcal: 400, fiberG: 5 }, tags: { flavor: ['flavor_sweet'] }, ingredientLines: [] };
  const active = generationTuningScore(recipe, { generationTuningOverlay: overlay, date: '2026-09-23', mealClass: { id: 'mc-breakfast' }, revisionById: new Map(), foodGroups: [] });
  const inactiveDate = generationTuningScore(recipe, { generationTuningOverlay: overlay, date: '2026-09-25', mealClass: { id: 'mc-breakfast' }, revisionById: new Map(), foodGroups: [] });
  assert.ok(active.score < 0);
  assert.equal(inactiveDate.score, 0);
});

test('Feature 6 — recipe preference regenerates proposal and stays only in generation snapshot', async () => {
  const deps = await plannerFixture();
  const original = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-6-recipe' }, deps);
  assert.equal(original.status, 'success');
  const tuned = await createGenerationTuningPreview({ generationPreview: original, createdAt: '2026-09-23T14:00:00.000Z', rules: [{ targetType: 'recipe', target: 'r_chicken2', mode: 'prefer', weight: 5, scope: { startDate: '2026-09-23', endDate: '2026-09-23', mealClassIds: ['mc-dinner'] }, intent: 'recipe_prefer', label: 'chicken2' }] }, deps);
  assert.equal(tuned.status, 'success');
  assert.equal(dinner(tuned).recipeComponents[0].recipeVersionId, 'rv_chicken2');
  assert.equal(tuned.generationTuningOverlay.rules.length, 1);
  assert.deepEqual(tuned.generationRun.configSnapshot.generationTuningOverlay, tuned.generationTuningOverlay);
  const persistedConfig = await deps.repo.get('mealClasses', 'mc-dinner');
  assert.deepEqual(persistedConfig.rules, []);
});

test('Feature 6 — unavailable ingredient is a temporary hard exclusion, survives meal replacement validation and commit', async () => {
  const deps = await plannerFixture();
  await addIngredientFamiliesForFixture(deps);
  const chicken = await deps.repo.get('recipeVersions', 'rv_chicken2');
  const sourceLine = chicken.ingredientLines[0]; const sourceRevision = await deps.repo.get('ingredientRevisions', sourceLine.ingredientRevisionId);
  const turkeyRevision = { ...structuredClone(sourceRevision), ingredientRevisionId: 'rev_turkey_feature6', ingredientId: 'ing_turkey', taxonomy: { ...(sourceRevision.taxonomy || {}), foodGroup: 'meat', foodSubgroup: 'meat' } };
  await deps.repo.put('ingredientRevisions', turkeyRevision);
  await deps.repo.put('ingredients', { schemaVersion: 1, ingredientId: 'ing_turkey', origin: 'base', currentRevisionId: turkeyRevision.ingredientRevisionId, status: 'active', createdAt: '2026-09-23T12:00:00Z', updatedAt: '2026-09-23T12:00:00Z' });
  const turkey = structuredClone(chicken); turkey.recipeId = 'r_turkey'; turkey.recipeVersionId = 'rv_turkey'; turkey.i18n = { it: { title: 'Tacchino' }, en: { title: 'Turkey' } }; turkey.ingredientLines[0] = { ...turkey.ingredientLines[0], ingredientId: 'ing_turkey', ingredientRevisionId: turkeyRevision.ingredientRevisionId }; turkey.calculatedNutrition = { ...turkey.calculatedNutrition, energyKcal: 690, proteinG: 61 };
  await deps.repo.put('recipes', { recipeId: turkey.recipeId, currentVersionId: turkey.recipeVersionId, origin: 'base', status: 'active' }); await deps.repo.put('recipeVersions', turkey);
  const pack = await deps.repo.get('catalogPacks', ['test-1', 'core']); pack.recipeVersionIds = [...pack.recipeVersionIds, turkey.recipeVersionId]; await deps.repo.put('catalogPacks', pack);

  const original = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-6-hard' }, deps);
  const tuned = await createGenerationTuningPreview({ generationPreview: original, rules: [{ targetType: 'ingredient', target: 'ing_chicken', mode: 'exclude', scope: { startDate: '2026-09-23', endDate: '2026-09-23', mealClassIds: ['mc-dinner'] }, intent: 'ingredient_unavailable', label: 'Chicken unavailable' }] }, deps);
  assert.equal(tuned.status, 'success');
  assert.equal(dinner(tuned).recipeComponents[0].recipeVersionId, 'rv_turkey');
  const alternatives = await createGenerationReplacementPreview({ generationPreview: tuned, mealOccurrenceId: dinner(tuned).mealOccurrenceId, seed: 'feature-6-replace' }, deps);
  assert.ok(alternatives.candidates.every(item => !(item.recipe.ingredientLines || []).some(line => line.ingredientId === 'ing_chicken')));
  await commitGeneratedPreview(tuned, deps);
  const run = await deps.repo.get('generationRuns', tuned.generationRun.generationRunId);
  assert.equal(run.configSnapshot.generationTuningOverlay.rules[0].target, 'ing_chicken');
});


test('Feature 6 — proposal UI exposes guided tuning controls and temporary scope', async () => {
  const source = await readFile(new URL('../src/ui/planPages.js', import.meta.url), 'utf8');
  assert.match(source, /data-testid': 'generation-tuning-open'/);
  assert.match(source, /data-testid': 'generation-tuning-intent'/);
  assert.match(source, /data-testid': 'generation-tuning-target'/);
  assert.match(source, /data-testid': 'generation-tuning-add'/);
  assert.match(source, /data-testid': 'generation-tuning-apply'/);
  assert.match(source, /ingredient_unavailable/);
  assert.match(source, /simpler_lower_fat/);
});
