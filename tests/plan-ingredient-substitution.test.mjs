import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { syntheticSafetyEvidence } from './helpers.mjs';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import { commitGeneratedPreview, createGenerationReplacementPreview } from '../src/services/effectivePlanService.js';
import { listPlanIngredientUsage, createPlanIngredientSubstitutionPreview, applyPlanIngredientSubstitutionPreview } from '../src/services/planIngredientSubstitutionService.js';

function validRecipeFrom(source, revisionId) {
  return {
    schemaVersion: 2,
    recipeVersionId: source.recipeVersionId,
    recipeId: source.recipeId,
    versionNumber: 1,
    supersedesVersionId: null,
    origin: 'base',
    catalogVersion: 'test-1',
    i18n: { it: { title: 'Piatto di pollo', description: 'Fixture' }, en: { title: 'Chicken plate', description: 'Fixture' } },
    servingCount: 1,
    mealArchetypes: ['dinner'],
    ingredientLines: [{ ingredientId: 'ing_chicken', ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }],
    calculatedNutrition: { energyKcal: 700, proteinG: 60, carbsG: 70, fatG: 17.5, fiberG: 5 },
    practical: { prepMinutes: 5, cookMinutes: 0, eatingMinutes: 15, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, freezerSuitable: false, mealPrepSuitable: true, finalWeightG: 100, finalVolumeMl: null, yieldNotes: null },
    tags: { families: ['plate'], cuisines: ['test'], diet: [], flavor: ['flavor_savory'], practical: ['portable'], preparation: ['prep_assembly'] },
    allergenIds: [], searchTokens: ['chicken', 'plate'], calculationAlgorithmVersion: 'nutrition-core-1', inputDigest: 'fixture-input', contentHash: 'fixture-content',
    generation: { jobId: null, pipelineVersion: 'test-fixture', sourceLocale: null, generatedAt: '2026-09-23T12:00:00Z' },
    quality: { status: 'validated', reviewNotes: null }, createdAt: '2026-09-23T12:00:00Z'
  };
}

function ingredientRevision({ id, ingredientId, name, energy, protein, carbs, fat, fiber }) {
  return {
    schemaVersion: 2, ingredientRevisionId: id, ingredientId, revisionNumber: 1, origin: 'base', catalogVersion: 'test-1',
    i18n: { it: { name, aliases: [] }, en: { name, aliases: [] } }, basis: { amount: 100, unit: 'g', state: 'cooked' },
    nutrition: { energyKcal: energy, proteinG: protein, carbsG: carbs, fatG: fat, fiberG: fiber },
    taxonomy: { foodGroup: 'food_group_meat_poultry', foodSubgroup: null, flavorProfile: 'flavor_savory', culinaryRoles: ['tax_role_protein'], mealArchetypes: ['dinner'] },
    allergenIds: [], safetyEvidence: syntheticSafetyEvidence([]), source: { reference: 'test:feature4' }
  };
}

test('Feature 4 — plan-wide ingredient replacement is iso-caloric, plan-local and confirmable', async () => {
  const deps = await plannerFixture();
  const existing = await deps.repo.get('recipeVersions', 'rv_chicken');
  const sourceRevisionId = existing.ingredientLines[0].ingredientRevisionId;
  const sourceRevision = ingredientRevision({ id: sourceRevisionId, ingredientId: 'ing_chicken', name: 'Pollo', energy: 700, protein: 60, carbs: 70, fat: 17.5, fiber: 5 });
  const targetRevision = ingredientRevision({ id: 'rev_turkey_current', ingredientId: 'ing_turkey', name: 'Tacchino', energy: 350, protein: 58, carbs: 2, fat: 12, fiber: 0 });
  await deps.repo.put('ingredientRevisions', sourceRevision);
  await deps.repo.put('ingredientRevisions', targetRevision);
  await deps.repo.put('ingredients', { schemaVersion: 1, ingredientId: 'ing_chicken', origin: 'base', currentRevisionId: sourceRevisionId, status: 'active', createdAt: '2026-09-23T12:00:00Z', updatedAt: '2026-09-23T12:00:00Z' });
  await deps.repo.put('ingredients', { schemaVersion: 1, ingredientId: 'ing_turkey', origin: 'base', currentRevisionId: targetRevision.ingredientRevisionId, status: 'active', createdAt: '2026-09-23T12:00:00Z', updatedAt: '2026-09-23T12:00:00Z' });
  await deps.repo.put('recipeVersions', validRecipeFrom(existing, sourceRevisionId));

  const original = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-4' }, deps);
  assert.equal(original.status, 'success');
  const usage = await listPlanIngredientUsage(original, deps);
  assert.ok(usage.some(item => item.ingredientId === 'ing_chicken'));

  const substitution = await createPlanIngredientSubstitutionPreview({ generationPreview: original, sourceIngredientId: 'ing_chicken' }, deps);
  const candidate = substitution.candidates.find(item => item.candidateIngredientRevisionId === targetRevision.ingredientRevisionId);
  assert.ok(candidate);
  assert.ok(Math.abs(candidate.planDelta.energyKcal) <= 1);
  assert.equal(candidate.replacementAmountTotal, 200);

  const updated = await applyPlanIngredientSubstitutionPreview({ generationPreview: original, substitutionPreview: substitution, candidateIngredientRevisionId: targetRevision.ingredientRevisionId }, deps);
  assert.ok(updated.previewId && updated.previewId !== original.previewId);
  assert.equal(updated.derivedRecipeVersions.length, 1);
  const derived = updated.derivedRecipeVersions[0];
  assert.equal(derived.supersedesVersionId, 'rv_chicken');
  assert.equal(derived.ingredientLines[0].ingredientId, 'ing_turkey');
  assert.equal(derived.ingredientLines[0].amount, 200);
  assert.ok(Math.abs(derived.calculatedNutrition.energyKcal - 700) <= 1);
  assert.equal((await deps.repo.get('recipes', 'r_chicken')).currentVersionId, 'rv_chicken');
  assert.equal(await deps.repo.get('recipeVersions', derived.recipeVersionId), undefined);
  const updatedDinner = updated.calendarDays[0].mealSlots.find(slot => slot.mealClassId === 'mc-dinner');
  const mealAlternatives = await createGenerationReplacementPreview({ generationPreview: updated, mealOccurrenceId: updatedDinner.mealOccurrenceId, seed: 'feature-4-after-global' }, deps);
  assert.equal(mealAlternatives.status, 'success');
  assert.ok(mealAlternatives.candidates.length >= 1);
  await assert.rejects(commitGeneratedPreview(original, deps), { code: 'stale_preview' });

  await commitGeneratedPreview(updated, deps);
  assert.equal((await deps.repo.get('recipes', 'r_chicken')).currentVersionId, 'rv_chicken');
  const persisted = await deps.repo.get('recipeVersions', derived.recipeVersionId);
  assert.ok(persisted);
  const days = await deps.repo.getAll('calendarDays');
  const dinner = days[0].mealSlots.find(slot => slot.mealClassId === 'mc-dinner');
  assert.equal(dinner.recipeComponents[0].recipeVersionId, derived.recipeVersionId);
  assert.equal((await deps.repo.get('recipeVersions', 'rv_chicken')).ingredientLines[0].ingredientId, 'ing_chicken');
});
