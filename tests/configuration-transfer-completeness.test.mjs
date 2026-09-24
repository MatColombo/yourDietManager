import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { sha256Json } from '../src/lib/crypto.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../src/services/configurationService.js';
import { createConfigurationExport, importConfigurationExport, validateConfigurationExport } from '../src/services/configurationTransfer.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const catalog = JSON.parse(await readFile(path.join(root, 'public/data/catalog.json'), 'utf8'));
  await repo.putMany('taxonomies', catalog.taxonomies);
  await repo.putMany('taxonomyTerms', catalog.taxonomyTerms);
  await repo.putMany('ingredients', catalog.ingredients);
  await repo.putMany('ingredientRevisions', catalog.ingredientRevisions);
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  return { repo, registry, bundle: await loadConfigurationBundle(repo), catalog };
}

test('complete configuration export is default and contains every active configuration section', async () => {
  const { repo, bundle, catalog } = await fixture();
  const productFood = catalog.taxonomyTerms.find(term => term.taxonomyId === 'product_food' && term.status === 'active');
  assert.ok(productFood);
  const group = { schemaVersion: 1, id: 'group-export-test', name: 'Export group', members: [{ type: 'productFood', id: productFood.termId }], version: 1, origin: 'user', status: 'active', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' };
  await repo.put('foodGroups', group);
  const declaration = { version: 1, safety: 'rules_declared', goals: 'personal', safetyProfileDigest: 'test-digest' };
  await repo.setMeta('profileDeclaration:R4', declaration);

  bundle.nutritionProfiles[0].dailyEnergyKcal = 2130;
  bundle.foodPreferences[0].rules = [{ id: 'pref-export', targetType: 'productFood', targetId: productFood.termId, level: 'more_often', autoExclude: false, frequency: null }];
  bundle.appConfig.locale = 'en';
  bundle.appConfig.timeZone = 'Europe/Paris';
  bundle.appConfig.shoppingPeopleMultiplier = 2.5;

  const document = await createConfigurationExport(bundle, { repo });
  assert.equal(document.formatVersion, 2);
  assert.equal(document.mode, 'full');
  assert.deepEqual(document.payload.configuration, bundle);
  assert.deepEqual(document.payload.foodGroups, [group]);
  assert.deepEqual(document.payload.profileDeclaration, declaration);
});

test('complete configuration import restores nutrition, preferences, app settings, FoodGroups and profile declaration', async () => {
  const { repo, registry, bundle, catalog } = await fixture();
  const productFood = catalog.taxonomyTerms.find(term => term.taxonomyId === 'product_food' && term.status === 'active');
  const group = { schemaVersion: 1, id: 'group-roundtrip', name: 'Roundtrip group', members: [{ type: 'productFood', id: productFood.termId }], version: 1, origin: 'user', status: 'active', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' };
  await repo.put('foodGroups', group);
  const declaration = { version: 1, safety: 'none_declared', goals: 'personal', safetyProfileDigest: 'roundtrip-digest' };
  await repo.setMeta('profileDeclaration:R4', declaration);
  bundle.nutritionProfiles[0].dailyEnergyKcal = 2275;
  bundle.foodPreferences[0].rules = [{ id: 'pref-roundtrip', targetType: 'productFood', targetId: productFood.termId, level: 'less_often', autoExclude: false, frequency: { maxOccurrences: 2, windowDays: 7 } }];
  bundle.appConfig.locale = 'en';
  bundle.appConfig.timeZone = 'Europe/Paris';
  bundle.appConfig.shoppingPeopleMultiplier = 3;
  const document = await createConfigurationExport(bundle, { mode: 'full', repo });

  const changed = structuredClone(bundle);
  changed.nutritionProfiles[0].dailyEnergyKcal = 1500;
  changed.foodPreferences[0].rules = [];
  changed.appConfig.locale = 'it';
  changed.appConfig.timeZone = 'Europe/Rome';
  changed.appConfig.shoppingPeopleMultiplier = 1;
  await saveConfigurationBundle(changed, { repo, registry, foodGroups: [] });
  await repo.setMeta('profileDeclaration:R4', null);

  const saved = await importConfigurationExport(document, { repo, registry });
  assert.deepEqual(saved, bundle);
  assert.deepEqual(await repo.getAll('foodGroups'), [group]);
  assert.deepEqual(await repo.getMeta('profileDeclaration:R4'), declaration);
});

test('shareable structure export remains intentionally profile-free', async () => {
  const { repo, bundle } = await fixture();
  const document = await createConfigurationExport(bundle, { mode: 'structure', repo });
  assert.equal(document.mode, 'structure');
  assert.equal('nutritionProfiles' in document.payload, false);
  assert.equal('allergyIntoleranceProfiles' in document.payload, false);
  assert.equal('foodPreferences' in document.payload, false);
  assert.equal('foodGroups' in document.payload, false);
  assert.equal('nutritionProfileId' in document.payload.appConfigPatch, false);
  assert.equal('allergyIntoleranceProfileId' in document.payload.appConfigPatch, false);
  assert.equal('foodPreferencesId' in document.payload.appConfigPatch, false);
  assert.equal('timeZone' in document.payload.appConfigPatch, false);
  assert.equal('shoppingPeopleMultiplier' in document.payload.appConfigPatch, false);
});

test('legacy v1 complete configuration documents remain importable', async () => {
  const { repo, registry, bundle } = await fixture();
  const originalEnergy = bundle.nutritionProfiles[0].dailyEnergyKcal;
  const document = { format: 'yourDietManager-configuration', formatVersion: 1, mode: 'full', createdAt: '2026-09-24T00:00:00.000Z', payload: structuredClone(bundle), sha256: null };
  document.sha256 = await sha256Json({ ...document, sha256: null });
  bundle.nutritionProfiles[0].dailyEnergyKcal = originalEnergy - 200;
  await saveConfigurationBundle(bundle, { repo, registry });
  const saved = await importConfigurationExport(document, { repo, registry });
  assert.equal(saved.nutritionProfiles[0].dailyEnergyKcal, originalEnergy);
});

test('configuration export checksum still detects tampering in v2', async () => {
  const { repo, bundle } = await fixture();
  const document = await createConfigurationExport(bundle, { mode: 'full', repo });
  document.payload.configuration.appConfig.locale = 'xx';
  await assert.rejects(() => validateConfigurationExport(document), /checksum mismatch/);
});
