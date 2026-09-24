import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import { createGenerationReplacementPreview, applyGenerationReplacementPreview, commitGeneratedPreview } from '../src/services/effectivePlanService.js';

test('Feature 7 — generated-plan meal alternatives are ranked by nutrition and remain confirmable', async () => {
  const deps = await plannerFixture();
  const original = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-7' }, deps);
  assert.equal(original.status, 'success');
  original.recipeLabels = { rv_chicken: 'Chicken' };
  original.recipeNutrition = { rv_chicken: { energyKcal: 700 } };
  const dinner = original.calendarDays[0].mealSlots.find(slot => slot.mealClassId === 'mc-dinner');
  assert.equal(dinner.recipeComponents[0].recipeVersionId, 'rv_chicken');
  const alternatives = await createGenerationReplacementPreview({ generationPreview: original, mealOccurrenceId: dinner.mealOccurrenceId, seed: 'feature-7-replace' }, deps);
  assert.equal(alternatives.status, 'success');
  assert.equal(alternatives.candidates.length, 1);
  assert.equal(alternatives.candidates[0].recipe.recipeVersionId, 'rv_chicken2');
  assert.ok(alternatives.candidates[0].affinityScore >= 90);
  assert.equal(alternatives.candidates[0].nutritionDelta.energyKcal, -20);
  const updated = await applyGenerationReplacementPreview({ generationPreview: original, replacementPreview: alternatives, choiceId: alternatives.candidates[0].choiceId }, deps);
  const updatedDinner = updated.calendarDays[0].mealSlots.find(slot => slot.mealOccurrenceId === dinner.mealOccurrenceId);
  assert.equal(updatedDinner.recipeComponents[0].recipeVersionId, 'rv_chicken2');
  assert.ok(updated.previewId && updated.previewId !== original.previewId);
  await assert.rejects(commitGeneratedPreview(original, deps), { code: 'stale_preview' });
  const committed = await commitGeneratedPreview(updated, deps);
  assert.equal(committed.planInstance.planInstanceId, updated.planInstance.planInstanceId);
});


test('Replacement preview can show hard-incompatible recipes for comparison with quantified warnings', async () => {
  const deps = await plannerFixture();
  const original = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-7-hard-compare' }, deps);
  assert.equal(original.status, 'success');
  const dinner = original.calendarDays[0].mealSlots.find(slot => slot.mealClassId === 'mc-dinner');
  const alternatives = await createGenerationReplacementPreview({ generationPreview: original, mealOccurrenceId: dinner.mealOccurrenceId, query: 'fish', includeIncompatible: true, seed: 'feature-7-hard-compare-search' }, deps);
  assert.equal(alternatives.status, 'success');
  const fish = alternatives.candidates.find(item => item.recipe.recipeVersionId === 'rv_fish');
  assert.ok(fish);
  assert.equal(fish.hardCompatible, false);
  assert.equal(fish.safetyBlocked, true);
  assert.ok(fish.hardViolations.some(v => String(v.code).startsWith('safety:')));
  await assert.rejects(applyGenerationReplacementPreview({ generationPreview: original, replacementPreview: alternatives, choiceId: fish.choiceId }, deps), /violates hard constraints/i);
});
