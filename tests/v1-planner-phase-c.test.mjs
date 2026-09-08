import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { PlanCandidateService } from '../src/services/planCandidateService.js';
import { loadConfigurationBundle } from '../src/services/configurationService.js';
import { applyPlannerValidationProfile } from '../src/planner/validationProfiles.js';
import { runPlannerValidationCase, runPlannerDeterminismCheck } from '../src/services/plannerValidationService.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();

async function plannerFixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  return { repo, registry };
}
const fixturePromise = plannerFixture();

test('Phase C — runtime retrieval exposes the full Phase B archetype instead of truncating at 250', async () => {
  const { repo } = await fixturePromise; const query = new PlanCandidateService({ repo });
  assert.equal((await query.retrieve('breakfast', { limit: 500 })).length, 350);
  assert.equal((await query.retrieve('lunch', { limit: 500 })).length, 450);
  assert.equal((await query.retrieve('dinner', { limit: 500 })).length, 450);
  assert.equal((await query.retrieve('snack', { limit: 500 })).length, 300);
});

test('Phase C — validation profiles are non-destructive configuration overlays', async () => {
  const { repo } = await fixturePromise; const bundle = await loadConfigurationBundle(repo); const before = structuredClone(bundle);
  const overlay = applyPlannerValidationProfile(bundle, { profileId: 'hard_practical', targetKcal: 1400, tolerancePct: 2, hardAllergenId: 'milk' });
  assert.deepEqual(bundle, before);
  assert.notDeepEqual(overlay, before);
  assert.equal(overlay.nutritionProfiles.find(x => x.id === overlay.appConfig.nutritionProfileId).dailyEnergyKcal, 1400);
});

test('Phase C — successful manual case exposes slot pipeline diagnostics, fixed servings and no persisted plan', async () => {
  const { repo, registry } = await fixturePromise;
  const before = { plans: (await repo.getAll('planInstances')).length, runs: (await repo.getAll('generationRuns')).length, days: (await repo.getAll('calendarDays')).length };
  const result = await runPlannerValidationCase({ targetKcal: 800, tolerancePct: 2, days: 1, startDate: '2026-09-08', seed: 'phase-c-800', profileId: 'current' }, { repo, registry, locale: 'it' });
  assert.equal(result.actualOutcome, 'success', JSON.stringify(result.failure));
  assert.equal(result.energy.allWithinTolerance, true);
  assert.equal(result.servingsFixed, true);
  assert.equal(result.diagnostics.candidateRetrieval.counts.lunch, 450);
  const slots = result.diagnostics.days[0].slotDiagnostics;
  assert.ok(slots.length >= 4);
  assert.ok(slots.every(slot => slot.sourceCandidateCount >= slot.acceptedCandidateCount && slot.acceptedCandidateCount >= slot.candidateFrontierCount));
  assert.ok(slots.every(slot => slot.optionCount > 0 && slot.sourceEnergyRange.minKcal != null && slot.optionEnergyRange.maxKcal != null));
  const after = { plans: (await repo.getAll('planInstances')).length, runs: (await repo.getAll('generationRuns')).length, days: (await repo.getAll('calendarDays')).length };
  assert.deepEqual(after, before);
});

test('Phase C — hard allergen remains visible in hard-filter rejection diagnostics', async () => {
  const { repo, registry } = await fixturePromise;
  const result = await runPlannerValidationCase({ targetKcal: 1800, tolerancePct: 5, days: 1, startDate: '2026-09-08', seed: 'phase-c-allergen', profileId: 'current', hardAllergenId: 'gluten_cereals' }, { repo, registry });
  assert.equal(result.actualOutcome, 'success', JSON.stringify(result.failure));
  assert.ok(Object.entries(result.rejectionCounts).some(([key, value]) => key.startsWith('safety:validation-allergen-gluten_cereals') && value > 0), JSON.stringify(result.rejectionCounts));
});



test('Phase C — intolerance and fiber stress presets exercise safety-hard and nutrient-soft paths', async () => {
  const { repo } = await fixturePromise; const bundle = await loadConfigurationBundle(repo);
  const intolerance = applyPlannerValidationProfile(bundle, { profileId: 'hard_intolerance_legumes', targetKcal: 1800, tolerancePct: 5 });
  const safety = intolerance.allergyIntoleranceProfiles.find(item => item.id === intolerance.appConfig.allergyIntoleranceProfileId);
  const rule = safety.rules.find(item => item.id === 'validation-intolerance-legumes');
  assert.equal(rule.kind, 'intolerance'); assert.equal(rule.targetType, 'foodCategory'); assert.equal(rule.targetId, 'food_group_legumes'); assert.equal(rule.enabled, true);
  const fiber = applyPlannerValidationProfile(bundle, { profileId: 'soft_high_fiber', targetKcal: 2000, tolerancePct: 2 });
  const nutrition = fiber.nutritionProfiles.find(item => item.id === fiber.appConfig.nutritionProfileId);
  assert.equal(nutrition.nutrients.fiberG.enabled, true); assert.equal(nutrition.nutrients.fiberG.weight, 8); assert.ok(nutrition.nutrients.fiberG.target >= 20);
});

test('Phase C — soft MealClass avoid and frequency presets remain non-excluding scoring rules', async () => {
  const { repo } = await fixturePromise; const bundle = await loadConfigurationBundle(repo);
  const avoid = applyPlannerValidationProfile(bundle, { profileId: 'soft_meal_avoid_vegan', targetKcal: 2000, tolerancePct: 2 });
  const avoidMeals = avoid.mealClasses.filter(item => new Set(avoid.appConfig.mealClassIds).has(item.id));
  assert.ok(avoidMeals.every(meal => meal.rules.some(rule => rule.ruleType === 'tag' && rule.target === 'diet_vegan' && rule.strength === 'avoid')));
  assert.ok(avoidMeals.every(meal => !meal.rules.some(rule => rule.target === 'diet_vegan' && rule.strength === 'forbid')));
  const frequency = applyPlannerValidationProfile(bundle, { profileId: 'soft_frequency_vegan', targetKcal: 2000, tolerancePct: 2 });
  const prefs = frequency.foodPreferences.find(item => item.id === frequency.appConfig.foodPreferencesId);
  const rule = prefs.rules.find(item => item.id === 'validation-frequency-vegan');
  assert.deepEqual(rule.frequency, { maxOccurrences: 1, windowDays: 3 });
  assert.equal(rule.autoExclude, false);
});


test('Phase C — soft MealClass avoid changes scores without changing hard eligibility counts', async () => {
  const { repo, registry } = await fixturePromise;
  const baseOptions = { targetKcal: 2000, tolerancePct: 2, days: 1, startDate: '2026-09-08', seed: 'phase-c-soft-eligibility' };
  const current = await runPlannerValidationCase({ ...baseOptions, profileId: 'current' }, { repo, registry });
  const avoid = await runPlannerValidationCase({ ...baseOptions, profileId: 'soft_meal_avoid_vegan' }, { repo, registry });
  assert.equal(current.actualOutcome, 'success'); assert.equal(avoid.actualOutcome, 'success');
  const currentSlots = current.diagnostics.days[0].slotDiagnostics;
  const avoidSlots = avoid.diagnostics.days[0].slotDiagnostics;
  assert.deepEqual(avoidSlots.map(slot => slot.acceptedCandidateCount), currentSlots.map(slot => slot.acceptedCandidateCount));
  assert.ok(avoid.constraintPolicy.soft.some(item => item.id === 'meal_rule_preferences'));
  assert.ok(!avoid.constraintPolicy.hard.some(item => item.id === 'meal_rule_preferences'));
});

test('Phase C — deliberately impossible and external-unknown profiles fail with classified hard reasons', async () => {
  const { repo, registry } = await fixturePromise;
  const impossible = await runPlannerValidationCase({ targetKcal: 1800, tolerancePct: 5, days: 1, startDate: '2026-09-08', seed: 'phase-c-impossible', profileId: 'impossible_all_forbidden' }, { repo, registry });
  assert.equal(impossible.actualOutcome, 'failed'); assert.equal(impossible.expectationMet, true);
  assert.equal(impossible.failure.code, 'no_candidates_after_hard_constraints');
  assert.ok((impossible.rejectionCounts['meal_rule:nutrition:energyKcal'] || 0) > 0);
  const external = await runPlannerValidationCase({ targetKcal: 1800, tolerancePct: 5, days: 1, startDate: '2026-09-08', seed: 'phase-c-external', profileId: 'external_unknown' }, { repo, registry });
  assert.equal(external.actualOutcome, 'failed'); assert.equal(external.failure.code, 'external_energy_unknown'); assert.equal(external.expectationMet, true);
});

test('Phase C — soft profile changes scoring without becoming a hard constraint', async () => {
  const { repo, registry } = await fixturePromise;
  const result = await runPlannerValidationCase({ targetKcal: 2000, tolerancePct: 2, days: 3, startDate: '2026-09-08', seed: 'phase-c-soft-protein', profileId: 'soft_high_protein' }, { repo, registry });
  assert.equal(result.actualOutcome, 'success', JSON.stringify(result.failure));
  assert.equal(result.energy.allWithinTolerance, true);
  assert.ok(result.constraintPolicy.soft.some(item => item.id === 'nutrient_targets'));
  assert.ok(!result.constraintPolicy.hard.some(item => item.id === 'nutrient_targets'));
  assert.ok(result.diagnostics.days.flatMap(day => day.selectedMeals).some(item => Number(item.scoreComponents?.nutrition || 0) > 0));
});

test('Phase C — same seed and configuration produce the same plan signature', async () => {
  const { repo, registry } = await fixturePromise;
  const result = await runPlannerDeterminismCheck({ targetKcal: 2200, tolerancePct: 2, days: 3, startDate: '2026-09-08', seed: 'phase-c-determinism', profileId: 'soft_vegan_preference' }, { repo, registry });
  assert.equal(result.deterministic, true);
  assert.equal(result.first.signature, result.second.signature);
});

test('Phase C — UI exposes the manual validation route and diagnostic actions', async () => {
  const [app, page, worker] = await Promise.all([readFile(path.join(root, 'src/ui/app.js'), 'utf8'), readFile(path.join(root, 'src/ui/plannerValidationPage.js'), 'utf8'), readFile(path.join(root, 'public/service-worker.js'), 'utf8')]);
  assert.match(app, /\/planner-validation/);
  for (const id of ['planner-validation-run','planner-validation-determinism','planner-validation-sweep','planner-validation-result']) assert.match(page, new RegExp(id));
  assert.match(page, /runPlannerValidationCase/); assert.match(page, /runPlannerEnergySweep/);
  assert.match(worker, /src\/ui\/plannerValidationPage\.js/);
  const browser = await readFile(path.join(root, 'scripts/hardening/browser-regression.mjs'), 'utf8');
  assert.match(browser, /phaseCManualLab/); assert.match(browser, /planner-validation-run/);
});
