import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import {
  completeOnboarding, configurationDiagnostics, getOnboardingDraft, loadConfigurationBundle,
  normalizeCycle, saveConfigurationBundle, saveOnboardingDraft
} from '../src/services/configurationService.js';
import { MemoryRepository, fileFetch, fileLoader, seedReferenceData } from './helpers.mjs';

const root = process.cwd();

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await seedReferenceData(repo, root);
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root) });
  return { repo, registry, bundle: await loadConfigurationBundle(repo) };
}

test('bootstrap configuration passes Phase 2 semantic validation', async () => {
  const { registry, bundle } = await fixture();
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, true, result.errors.map(item => `${item.path}: ${item.message}`).join('; '));
});

test('nutrition semantic validation rejects inverted bounds and ambiguous enabled state', async () => {
  const { registry, bundle } = await fixture();
  const profile = bundle.nutritionProfiles[0];
  profile.nutrients.proteinG = { enabled: true, min: 140, target: 120, max: 180, weight: 1 };
  profile.nutrients.fiberG = { enabled: true, min: null, target: null, max: null, weight: 1 };
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(item => item.message.includes('min must be <= target')));
  assert.ok(result.errors.some(item => item.message.includes('requires at least one')));
});

test('DayClass overlapping slots require parallel=true on every overlapping slot', async () => {
  const { registry, bundle } = await fixture();
  const day = bundle.dayClasses[0];
  const duplicate = structuredClone(day.mealSlots[0]); duplicate.id = 'slot-overlap';
  day.mealSlots.push(duplicate);
  let result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(item => item.message.includes('requires parallel=true')));
  day.mealSlots.at(-1).parallel = true; day.mealSlots[0].parallel = true;
  result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, true, result.errors.map(item => item.message).join('; '));
});

test('configuration validation rejects missing cross-record references', async () => {
  const { registry, bundle } = await fixture();
  bundle.mealClasses = bundle.mealClasses.filter(meal => meal.id !== 'mc-lunch');
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(item => item.path.includes('mealClassIds')));
  assert.ok(result.errors.some(item => item.path.includes('mealClassId')));
});

test('cycle normalization creates a contiguous 1..N sequence', async () => {
  const { bundle } = await fixture();
  const dayClassId = bundle.dayClasses[0].id;
  const cycle = structuredClone(bundle.cycles[0]); cycle.length = 4; cycle.days = [{ cycleDay: 1, dayClassId }, { cycleDay: 3, dayClassId }];
  const normalized = normalizeCycle(cycle, dayClassId);
  assert.deepEqual(normalized.days.map(day => day.cycleDay), [1, 2, 3, 4]);
  assert.equal(normalized.days[1].dayClassId, dayClassId);
});

test('saveConfigurationBundle validates before atomic activation', async () => {
  const { repo, registry, bundle } = await fixture();
  const previous = await repo.get('appConfigs', 'active');
  const invalid = structuredClone(bundle); invalid.appConfig.cycleId = 'missing-cycle';
  await assert.rejects(() => saveConfigurationBundle(invalid, { repo, registry }), /referenced Cycle does not exist/);
  assert.deepEqual(await repo.get('appConfigs', 'active'), previous);
});

test('onboarding draft persists separately and completion activates atomically', async () => {
  const { repo, registry, bundle } = await fixture();
  const draft = structuredClone(bundle); draft.nutritionProfiles[0].dailyEnergyKcal = 2050;
  await saveOnboardingDraft(draft, 3, { repo });
  assert.equal((await repo.get('nutritionProfiles', draft.nutritionProfiles[0].id)).dailyEnergyKcal, 2000);
  assert.equal((await getOnboardingDraft({ repo })).step, 3);
  await completeOnboarding(draft, { repo, registry });
  assert.equal((await repo.get('nutritionProfiles', draft.nutritionProfiles[0].id)).dailyEnergyKcal, 2050);
  assert.equal(await repo.getMeta('configurationOnboardingComplete'), true);
  assert.equal(await getOnboardingDraft({ repo }), null);
});

test('unknown quantitative MealClass target is rejected by the V1 registry', async () => {
  const { registry, bundle } = await fixture();
  bundle.mealClasses[0].rules = [{ ruleType: 'nutrition', target: 'mysteryScore', strength: 'prefer', operator: 'gte', value: 2 }];
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(item => item.message.includes('unsupported nutrition target')));
});

import { createConfigurationExport, importConfigurationExport, validateConfigurationExport } from '../src/services/configurationTransfer.js';

test('structure configuration export excludes sensitive profiles and imports over local safety settings', async () => {
  const { repo, registry, bundle } = await fixture();
  const originalAllergy = structuredClone(bundle.allergyIntoleranceProfiles);
  const document = await createConfigurationExport(bundle, { mode: 'structure' });
  assert.equal(document.mode, 'structure');
  assert.equal('allergyIntoleranceProfiles' in document.payload, false);
  assert.equal('nutritionProfiles' in document.payload, false);
  await validateConfigurationExport(document);
  document.payload.dayClasses[0].name = 'Imported work day';
  // Recompute a valid export after changing source data.
  const changed = structuredClone(bundle); changed.dayClasses[0].name = 'Imported work day';
  const changedDocument = await createConfigurationExport(changed, { mode: 'structure' });
  const saved = await importConfigurationExport(changedDocument, { repo, registry });
  assert.equal(saved.dayClasses[0].name, 'Imported work day');
  assert.deepEqual(saved.allergyIntoleranceProfiles, originalAllergy);
  assert.equal(await repo.getMeta('configurationOnboardingComplete'), true);
});

test('configuration export checksum detects tampering', async () => {
  const { bundle } = await fixture();
  const document = await createConfigurationExport(bundle, { mode: 'full' });
  document.payload.appConfig.locale = 'en';
  await assert.rejects(() => validateConfigurationExport(document), /checksum mismatch/);
});

test('cycle editor domain supports the V1 maximum of 31 contiguous days', async () => {
  const { registry, bundle } = await fixture();
  const cycle = bundle.cycles[0]; cycle.length = 31;
  const normalized = normalizeCycle(cycle, bundle.dayClasses[0].id); cycle.days = normalized.days;
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, true, result.errors.map(item => item.message).join('; '));
  assert.equal(cycle.days.length, 31);
  assert.deepEqual(cycle.days.map(day => day.cycleDay), Array.from({ length: 31 }, (_, index) => index + 1));
});
