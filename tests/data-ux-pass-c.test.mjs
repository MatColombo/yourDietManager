import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { ensureBootstrapConfiguration, STANDARD_BOOTSTRAP_VERSION } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle, configurationDiagnostics } from '../src/services/configurationService.js';
import { initializeUiState, isEditableRoute, confirmDiscardChanges } from '../src/ui/uiState.js';
import { MemoryRepository, fileFetch, fileLoader, seedReferenceData } from './helpers.mjs';

const root = process.cwd();

async function registryAndRepo() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  await seedReferenceData(repo, root);
  return { repo, registry };
}

test('Pass C standard bootstrap is neutral, complete and schema-valid', async () => {
  const { repo, registry } = await registryAndRepo();
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  const bundle = await loadConfigurationBundle(repo);
  assert.equal(bundle.appConfig.shoppingPeopleMultiplier, 1);
  assert.equal(bundle.allergyIntoleranceProfiles[0].rules.length, 0);
  assert.equal(bundle.foodPreferences[0].rules.length, 0);
  assert.equal(bundle.dayClasses.length, 1);
  assert.equal(bundle.cycles[0].length, 1);
  assert.equal(bundle.cycles[0].days[0].dayClassId, bundle.dayClasses[0].id);
  for (const nutrient of Object.values(bundle.nutritionProfiles[0].nutrients)) {
    assert.equal(nutrient.enabled, false);
    assert.equal(nutrient.min, null); assert.equal(nutrient.target, null); assert.equal(nutrient.max, null); assert.equal(nutrient.weight, 0);
  }
  const result = configurationDiagnostics(bundle, registry);
  assert.equal(result.valid, true, result.errors.map(item => `${item.path}: ${item.message}`).join('; '));
  assert.equal(await repo.getMeta('bootstrapConfigurationVersion'), STANDARD_BOOTSTRAP_VERSION);
});

test('Pass C bootstrap upgrades only untouched legacy defaults and preserves explicit user configuration', async () => {
  const { repo, registry } = await registryAndRepo();
  const legacy = JSON.parse(await readFile(path.join(root, 'tests/fixtures/catalog-0.1/public/data/bootstrap/default-configuration.json'), 'utf8'));
  await repo.atomicReplace({
    appConfigs: [legacy.appConfig], nutritionProfiles: legacy.nutritionProfiles, allergyIntoleranceProfiles: legacy.allergyIntoleranceProfiles,
    foodPreferences: legacy.foodPreferences, themeProfiles: legacy.themeProfiles, mealClasses: legacy.mealClasses, dayClasses: legacy.dayClasses, cycles: legacy.cycles
  });
  await repo.setMeta('bootstrapConfigurationSource', 'default-configuration.json');
  await repo.setMeta('bootstrapConfigurationVersion', 'legacy-v1');
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  let bundle = await loadConfigurationBundle(repo);
  assert.equal(bundle.nutritionProfiles[0].dailyEnergyKcal, 2000);
  assert.deepEqual(bundle.allergyIntoleranceProfiles[0].rules, []);

  bundle.nutritionProfiles[0].dailyEnergyKcal = 2130;
  await saveConfigurationBundle(bundle, { repo, registry });
  await repo.setMeta('bootstrapConfigurationVersion', 'legacy-v2');
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  bundle = await loadConfigurationBundle(repo);
  assert.equal(bundle.nutritionProfiles[0].dailyEnergyKcal, 2130);
});

test('Pass C editable-route registry and dirty confirmation use one global navigation rule', () => {
  assert.equal(isEditableRoute('/configure/days', ''), true);
  assert.equal(isEditableRoute('/configure/ingredients', '?new=1'), true);
  assert.equal(isEditableRoute('/configure/ingredients', ''), false);
  assert.equal(isEditableRoute('/configure/reference-data', '?edit=term'), true);
  assert.equal(isEditableRoute('/recipes/edit', '?id=abc'), true);
  assert.equal(isEditableRoute('/recipes', ''), false);

  const state = { i18n: { t: () => 'discard?' } }; initializeUiState(state);
  state.ui.dirty = { routeSignature: '/configure/days', changedAt: '2026-09-04T10:00:00Z' };
  assert.equal(confirmDiscardChanges(state, () => false), false);
  assert.ok(state.ui.dirty);
  assert.equal(confirmDiscardChanges(state, () => true), true);
  assert.equal(state.ui.dirty, null);
});

test('Pass C source audit centralizes disclosure state, guarded navigation, feedback and DayClass capabilities', async () => {
  const uiDir = path.join(root, 'src/ui');
  const uiFiles = (await readdir(uiDir)).filter(name => name.endsWith('.js'));
  const sources = Object.fromEntries(await Promise.all(uiFiles.map(async name => [name, await readFile(path.join(uiDir, name), 'utf8')])));
  const config = sources['configurationPages.js'];
  const main = await readFile(path.join(root, 'src/main.js'), 'utf8');
  const sw = await readFile(path.join(root, 'public/service-worker.js'), 'utf8');
  const recovery = await readFile(path.join(root, 'src/recoveryBootstrap.js'), 'utf8');
  const index = await readFile(path.join(root, 'index.html'), 'utf8');

  assert.match(config, /capabilitiesEditor\(state, day\.capabilities\)/);
  assert.doesNotMatch(config, /capabilitiesEditor\(state, day\)(?!\.)/);
  assert.match(config, /save\.disabled = !result\.valid/);
  assert.match(config, /day\.dayArchetype !== 'free' && day\.mealSlots\.length <= 1/);
  assert.match(config, /state\.notify\?\.\('success', state\.i18n\.t\('config\.saved'\)\)/);

  for (const [name, source] of Object.entries(sources)) {
    if (name !== 'uiState.js') assert.doesNotMatch(source, /element\('details'/, `${name} bypasses controlledDetails`);
    if (name !== 'uiState.js') assert.doesNotMatch(source, /history\.(?:pushState|replaceState)/, `${name} bypasses guarded navigation`);
  }
  assert.match(sources['uiState.js'], /beforeunload/);
  assert.match(sources['uiState.js'], /ydm:draft-change/);
  assert.match(main, /onboardingEnabled: false/);
  assert.doesNotMatch(main, /location\.pathname\s*=.*onboarding|navigate\(['"]\/onboarding/);
  assert.match(sw, /ydm-shell-v22/);
  assert.match(sw, /ydm-data-v10/);
  assert.match(sw, /src\/recoveryBootstrap\.js/);
  assert.match(index, /src\/recoveryBootstrap\.js/);
  assert.match(recovery, /updateViaCache: 'none'/);
  assert.match(recovery, /registration\.update\(\)/);
  assert.match(sw, /src\/ui\/uiState\.js/);
});
