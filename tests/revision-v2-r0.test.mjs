import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { syntheticSafetyEvidence } from './helpers.mjs';
import { createPlanPreview, commitPlanPreview, extendPlan } from '../src/services/planGenerationService.js';
import { commitGeneratedPreview, createReplacementPreview, commitReplacement, createRebalancePreview, commitRebalancePreview, updateAdherence, undoPlanOperation } from '../src/services/effectivePlanService.js';
import { allergenCompatibility, recipeQuarantineReasons, isDocumentedReadySeafood } from '../src/domain/safetyCompatibility.js';
import { CATALOG_QUARANTINE } from '../src/domain/catalogQuarantine.js';

const options = { horizon: { startDate: '2026-09-07', endDate: '2026-09-08' }, seed: 'r0-regression', createdAt: '2026-09-11T00:00:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 1, extensionDays: 1 } };
async function planned() { const deps = await plannerFixture(); const preview = await createPlanPreview(options, deps); assert.equal(preview.status, 'success'); await commitGeneratedPreview(preview, deps); return { ...deps, preview }; }
async function safetyChange(repo) { const profile = await repo.get('allergyIntoleranceProfiles', 'allergy'); profile.rules.push({ id: 'new-milk', kind: 'allergy', targetType: 'allergen', targetId: 'milk', enabled: true }); await repo.put('allergyIntoleranceProfiles', profile); }
async function stored(repo) { return { days: await repo.getAll('calendarDays'), plans: await repo.getAll('planInstances'), ops: await repo.getAll('operations'), runs: await repo.getAll('generationRuns') }; }

for (const commit of [commitPlanPreview, commitGeneratedPreview]) test(`T07 R0 stale safety configuration rejects ${commit.name} without plan writes`, async () => {
  const deps = await plannerFixture(); const preview = await createPlanPreview(options, deps); await safetyChange(deps.repo); const before = await stored(deps.repo);
  await assert.rejects(commit(preview, deps), { code: 'stale_preview' }); assert.deepEqual(await stored(deps.repo), before);
});
test('T07 R0 extension rejects an intervening edit to the source plan', async () => {
  const deps = await planned(); const extension = await extendPlan(deps.preview.planInstance.planInstanceId, { seed: 'extension-r0' }, deps);
  const day = deps.preview.calendarDays[0]; const slot = day.mealSlots[0];
  await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'partial', notes: 'New note' }, deps);
  const before = await stored(deps.repo); await assert.rejects(commitGeneratedPreview(extension, deps), { code: 'stale_preview' }); assert.deepEqual(await stored(deps.repo), before);
});
test('T07/T45 R0 replacement validates preview target, configuration and current day', async () => {
  const deps = await planned(); const day = deps.preview.calendarDays[0], slot = day.mealSlots[0];
  const preview = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId }, deps);
  assert.ok(preview.candidates.length); await safetyChange(deps.repo); const before = await stored(deps.repo);
  await assert.rejects(commitReplacement({ ...preview, recipeVersionId: preview.candidates[0].recipe.recipeVersionId }, deps), { code: 'stale_preview' }); assert.deepEqual(await stored(deps.repo), before);
});
test('T45 R0 rebalance rejects newer adherence and preserves authoritative before', async () => {
  const deps = await planned(); const day = deps.preview.calendarDays[0], slot = day.mealSlots[0];
  const preview = await createRebalancePreview({ planInstanceId: day.planInstanceId, startDate: day.date, endDate: day.date, mode: 'recalculate' }, deps);
  await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'followed', notes: 'Do not lose me' }, deps);
  const before = await stored(deps.repo); await assert.rejects(commitRebalancePreview(preview, deps), { code: 'stale_preview' }); assert.deepEqual(await stored(deps.repo), before);
});
test('T45 R0 rejects tampered payload, changed catalog and replay after undo', async () => {
  const deps = await plannerFixture(); let preview = await createPlanPreview(options, deps);
  const tampered = structuredClone(preview); tampered.calendarDays[0].mealSlots[0].adherenceNotes = 'tampered';
  await assert.rejects(commitGeneratedPreview(tampered, deps), { code: 'stale_preview' });
  const ingredient = await deps.repo.get('ingredientRevisions', 'rev_oats'); ingredient.allergenIds = ['milk']; await deps.repo.put('ingredientRevisions', ingredient);
  await assert.rejects(commitGeneratedPreview(preview, deps), { code: 'stale_preview' });
  preview = await createPlanPreview(options, deps); const results = await Promise.allSettled([commitGeneratedPreview(preview, deps), commitGeneratedPreview(preview, deps)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await deps.repo.getAll('operations')).length, 1);
  await undoPlanOperation(preview.planInstance.planInstanceId, deps); await assert.rejects(commitGeneratedPreview(preview, deps), { code: 'preview_already_committed' });
});
test('T03 R0 missing revision and empty legacy allergen array fail closed', () => {
  const recipe = { ingredientLines: [{ ingredientId: 'pasta', ingredientRevisionId: 'r' }] };
  assert.equal(allergenCompatibility(recipe, 'gluten_cereals', new Map()), 'unknown');
  assert.equal(allergenCompatibility(recipe, 'gluten_cereals', new Map([['r', { ingredientId: 'pasta', allergenIds: [] }]])), 'unknown');
});
test('T01 R0 pasta/rice pasta and peanut butter/butter use individual evidence, not generic search names', () => {
  const rice = { ingredientId: 'rice-pasta', productTaxonomy: { conceptId: 'product_concept_pasta' }, safetyEvidence: syntheticSafetyEvidence([]) };
  const wheat = { ingredientId: 'wheat-pasta', productTaxonomy: { conceptId: 'product_concept_pasta' }, safetyEvidence: syntheticSafetyEvidence(['gluten_cereals']) };
  const peanut = { ingredientId: 'peanut-butter', safetyEvidence: syntheticSafetyEvidence(['peanuts']) };
  const butter = { ingredientId: 'butter', safetyEvidence: syntheticSafetyEvidence(['milk']) };
  const brazil = { ingredientId: 'brazil-nuts', safetyEvidence: syntheticSafetyEvidence(['tree_nuts']) };
  const noodles = { ingredientId: 'egg-noodles', safetyEvidence: syntheticSafetyEvidence(['eggs', 'gluten_cereals']) };
  const check = (revision, id) => allergenCompatibility({ allergenIds: [], ingredientLines: [{ ingredientId: revision.ingredientId, ingredientRevisionId: 'r' }] }, id, new Map([['r', revision]]));
  assert.equal(check(rice, 'gluten_cereals'), 'compatible'); assert.equal(check(wheat, 'gluten_cereals'), 'incompatible');
  assert.equal(check(peanut, 'milk'), 'compatible'); assert.equal(check(peanut, 'peanuts'), 'incompatible'); assert.equal(check(butter, 'milk'), 'incompatible');
  assert.equal(check(brazil, 'tree_nuts'), 'incompatible'); assert.equal(check(noodles, 'gluten_cereals'), 'incompatible');
});
test('T10 R0 explicit quarantine covers all 20 baseline recipe IDs without deleting historical records', async () => {
  const audit = JSON.parse(await readFile('specs/revision_v2/baseline/audit_evidence.json'));
  const ids = audit.catalogFindings.rawFishInZeroCookRecipes.map(item => item.recipeVersionId).sort();
  assert.equal(ids.length, 20); assert.deepEqual(CATALOG_QUARANTINE.recipes.map(item => item.recipeVersionId).sort(), ids);
  for (const id of ids) assert.ok(recipeQuarantineReasons({ recipeVersionId: id, ingredientLines: [] }).includes('quarantine:raw_seafood_without_cooking'));
  assert.equal(isDocumentedReadySeafood({ basis: { state: 'as_sold' }, source: { reference: 'source' } }), false);
  assert.equal(isDocumentedReadySeafood({ basis: { state: 'raw' }, source: { reference: 'source' } }), false);
  assert.equal(isDocumentedReadySeafood({ basis: { state: 'cooked' } }), false);
  assert.equal(isDocumentedReadySeafood({ basis: { state: 'cooked' }, source: { reference: 'synthetic-fixture' } }), true);
});
test('T12 R0 a valid replacement retains saved notes and can be undone', async () => {
  const deps = await planned(); const day = deps.preview.calendarDays[0], slot = day.mealSlots[0];
  await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: 'partial', notes: 'Retain this note' }, deps);
  const preview = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId }, deps);
  const before = await deps.repo.get('calendarDays', day.calendarDayId);
  const result = await commitReplacement({ ...preview, recipeVersionId: preview.candidates[0].recipe.recipeVersionId }, deps);
  assert.equal(result.day.mealSlots[0].adherenceNotes, 'Retain this note'); await undoPlanOperation(day.planInstanceId, deps);
  assert.deepEqual(await deps.repo.get('calendarDays', day.calendarDayId), before);
});

test('T10 R0 fish template accepts only a documented cooked/ready form', async () => {
  const { generatePhaseBCandidates } = await import('../src/corpus/v1PhaseBRecipeGenerator.js');
  const make = state => {
    const names = ['fish', 'grain', 'vegetable', 'oil'];
    const corpus = { ingredientFamilies: names.map(id => ({ ingredientId: id, currentRevisionId: `${id}_r1`, status: 'active' })), ingredientRevisions: names.map(id => ({ ingredientId: id, ingredientRevisionId: `${id}_r1`, basis: { amount: 100, unit: 'g', state: id === 'fish' ? state : 'cooked' }, source: { reference: 'test-only:synthetic-source' }, nutrition: { energyKcal: 100 }, allergenIds: [], taxonomy: {}, i18n: { it: { name: id }, en: { name: id } } })) };
    const eligibility = { roles: Object.fromEntries(['fishSeafood', 'carbCooked', 'vegetableRaw', 'oilCooking'].map((role, i) => [role, { ingredientIds: [names[i]], portionG: { min: 0, max: 1000 } }])) };
    return generatePhaseBCandidates({ meal: 'mini_meal', band: { id: 'test', min: 0, max: 3000 }, count: 1, multiplier: 1, eligibility, corpus });
  };
  assert.equal(make('raw').length, 0); assert.equal(make('as_sold').length, 0);
  const cooked = make('cooked'); assert.equal(cooked.length, 1); assert.equal(cooked[0].phaseB.profileId, 'mini-fish-grain');
});
