import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { CatalogUpdater } from '../src/services/catalogUpdater.js';
import { CatalogQueryService } from '../src/services/catalogQuery.js';
import { createCustomCatalogExport, importCustomCatalogExport } from '../src/services/customCatalogTransfer.js';
import { saveUserIngredient, saveUserRecipe } from '../src/services/personalCatalogService.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();
async function fixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const importer = new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null }); await importer.bootstrap();
  return { repo, registry, query: new CatalogQueryService({ repo }), updater: new CatalogUpdater({ repo, registry, fetcher: fileFetch(root), storage: null }) };
}

test('Phase 3 bootstrap installs required packs only and keeps optional packs available', async () => {
  const { repo } = await fixture();
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.equal(await repo.count('recipes'), 1);
  assert.equal(await repo.count('recipeVersions'), 1);
  const packs = await repo.getAll('catalogPacks');
  assert.equal(packs.length, 4);
  assert.equal(packs.find(pack => pack.packId === 'core').status, 'installed');
  assert.equal(packs.find(pack => pack.packId === 'quick').status, 'available');
});

test('indexed recipe query combines text, numeric filters, current-version and installed-pack membership', async () => {
  const { query, updater } = await fixture();
  let result = await query.searchRecipes({ text: 'zuc', limit: 50 });
  assert.equal(result.total, 1); // core recipe contains zucchini
  await updater.installPack('quick');
  result = await query.searchRecipes({ text: 'zuc', packId: 'quick', energyMax: 500, limit: 50 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].recipeId, 'rec_zucchini_rice');
  assert.equal(result.items[0].origin, 'base');
});

test('pack uninstall hides recipes without deleting immutable versions', async () => {
  const { repo, query, updater } = await fixture();
  await updater.installPack('quick');
  assert.ok(await repo.get('recipeVersions', 'recver_zucchini_rice_v1'));
  await updater.uninstallPack('quick');
  const result = await query.searchRecipes({ packId: 'quick' });
  assert.equal(result.total, 0);
  assert.ok(await repo.get('recipeVersions', 'recver_zucchini_rice_v1'));
  await assert.rejects(() => updater.uninstallPack('core'), /cannot be uninstalled/);
});

test('personal ingredient edits create immutable revisions and advance the family pointer', async () => {
  const { repo, registry } = await fixture();
  const first = await saveUserIngredient({ nameIt: 'Tofu test', nameEn: 'Test tofu', basisUnit: 'g', state: 'ready_to_eat', energyKcal: 120, proteinG: 13, carbsG: 3, fatG: 6, fiberG: 1, foodGroup: 'legumes', foodSubgroup: 'soy_products', flavorProfile: 'savory', mealArchetypes: ['lunch','dinner'], allergenIds: ['soy'] }, { repo, registry });
  const second = await saveUserIngredient({ ingredientId: first.family.ingredientId, nameIt: 'Tofu test', nameEn: 'Test tofu', basisUnit: 'g', state: 'ready_to_eat', energyKcal: 125, proteinG: 14, carbsG: 3, fatG: 6, fiberG: 1, foodGroup: 'legumes', foodSubgroup: 'soy_products', flavorProfile: 'savory', mealArchetypes: ['lunch','dinner'], allergenIds: ['soy'] }, { repo, registry });
  assert.equal(second.revision.revisionNumber, 2);
  assert.notEqual(first.revision.ingredientRevisionId, second.revision.ingredientRevisionId);
  assert.ok(await repo.get('ingredientRevisions', first.revision.ingredientRevisionId));
  assert.equal((await repo.get('ingredients', first.family.ingredientId)).currentRevisionId, second.revision.ingredientRevisionId);
  await assert.rejects(() => saveUserIngredient({ ingredientId: 'ing_salmon' }, { repo, registry }), /Base ingredients cannot be edited/);
});

test('personal recipe nutrition and allergens are derived from frozen ingredient revisions and edits create versions', async () => {
  const { repo, registry } = await fixture();
  const ingredient = await saveUserIngredient({ nameIt: 'Tofu test', nameEn: 'Test tofu', basisUnit: 'g', state: 'ready_to_eat', energyKcal: 120, proteinG: 13, carbsG: 3, fatG: 6, fiberG: 1, foodGroup: 'legumes', foodSubgroup: 'soy_products', flavorProfile: 'savory', mealArchetypes: ['lunch'], allergenIds: ['soy'] }, { repo, registry });
  const payload = { titleIt: 'Tofu semplice', titleEn: 'Simple tofu', instructionsIt: ['Servi.'], instructionsEn: ['Serve.'], mealArchetypes: ['lunch'], ingredientLines: [{ ingredientId: ingredient.family.ingredientId, ingredientRevisionId: ingredient.revision.ingredientRevisionId, amount: 200, unit: 'g', optional: false }], prepMinutes: 2, cookMinutes: 0, portable: true, coldSuitable: true, fridgeRequired: true, mealPrepSuitable: true };
  const first = await saveUserRecipe(payload, { repo, registry });
  assert.deepEqual(first.version.calculatedNutrition, { energyKcal: 240, proteinG: 26, carbsG: 6, fatG: 12, fiberG: 2 });
  assert.deepEqual(first.version.allergenIds, ['soy']);
  const second = await saveUserRecipe({ ...payload, recipeId: first.family.recipeId, titleIt: 'Tofu semplice 2' }, { repo, registry });
  assert.equal(second.version.versionNumber, 2); assert.equal(second.version.supersedesVersionId, first.version.recipeVersionId);
  assert.ok(await repo.get('recipeVersions', first.version.recipeVersionId));
});

test('personal catalog export/import preserves user family+version records with checksum', async () => {
  const { repo, registry } = await fixture();
  await saveUserIngredient({ nameIt: 'Ingrediente export', nameEn: 'Export ingredient', basisUnit: 'g', state: 'raw', energyKcal: 10, proteinG: 1, carbsG: 1, fatG: 0, fiberG: 1, foodGroup: 'vegetables', foodSubgroup: 'other', flavorProfile: 'neutral', mealArchetypes: ['lunch'], allergenIds: [] }, { repo, registry });
  const doc = await createCustomCatalogExport({ repo }); assert.equal(doc.payload.ingredients.length, 1);
  const target = new MemoryRepository();
  // Base catalog is required because personal recipes may reference base revisions; import this fixture's base data first.
  await new CatalogImporter({ repo: target, registry, fetcher: fileFetch(root), storage: null }).bootstrap();
  await importCustomCatalogExport(doc, { repo: target, registry });
  assert.equal((await target.getAll('ingredients')).filter(record => record.origin === 'user').length, 1);
  doc.payload.ingredients[0].status = 'retired';
  await assert.rejects(() => importCustomCatalogExport(doc, { repo: target, registry }), /checksum mismatch/);
});

test('failed catalog update leaves the previous active version untouched', async () => {
  const { repo, registry } = await fixture(); const normal = fileFetch(root);
  const brokenFetch = async input => {
    const raw = typeof input === 'string' ? input : input.url; const pathname = new URL(raw, 'http://local.test').pathname;
    if (pathname === '/data/catalog-manifest.json') {
      const response = await normal(input); const manifest = await response.json(); manifest.catalogVersion = '0.4.0'; manifest.recipeVersions.shards[0].sha256 = '0'.repeat(64); return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return normal(input);
  };
  const updater = new CatalogUpdater({ repo, registry, fetcher: brokenFetch, storage: null });
  await assert.rejects(() => updater.update(), /Checksum mismatch/);
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.equal((await repo.get('recipes', 'rec_salmon_rice')).currentVersionId, 'recver_salmon_rice_v2');
});

test('all distributed Phase 3 catalog records validate, including optional packs', async () => {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const updater = new CatalogUpdater({ repo, registry, fetcher: fileFetch(root), storage: null });
  // Simulate a valid older active catalog so the current distributed manifest is treated as an update.
  await repo.setMeta('activeCatalogVersion', '0.2.0');
  await repo.put('catalogPacks', { schemaVersion: 1, packId: 'quick', catalogVersion: '0.2.0', labelKey: 'catalog.pack.quick.label', descriptionKey: 'catalog.pack.quick.description', required: false, estimatedBytes: 1, recipeVersionIds: [], status: 'installed', installedAt: '2026-09-01T00:00:00Z', lastErrorCode: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' });
  const result = await updater.update();
  assert.equal(result.updated, true); assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.equal((await repo.get('catalogPacks', ['0.3.0-dev','quick'])).status, 'installed');
  assert.ok(await repo.get('recipeVersions', 'recver_zucchini_rice_v1'));
  // Install the remaining optional pack to force validation of its recipe version.
  await updater.installPack('high_protein');
  assert.ok(await repo.get('recipeVersions', 'recver_salmon_zucchini_v1'));
});

test('real Phase 2 catalog fixture upgrades to Phase 3 without mutating historical immutable records', async () => {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const oldRoot = path.join(root, 'tests/fixtures/catalog-0.1');
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(oldRoot), storage: null }).bootstrap();
  const oldRecipe = await repo.get('recipeVersions', 'recver_salmon_rice_v1'); const oldRevision = await repo.get('ingredientRevisions', 'ingrev_salmon_raw_v1');
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.1.0-dev');
  const updater = new CatalogUpdater({ repo, registry, fetcher: fileFetch(root), storage: null }); await updater.update();
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.equal((await repo.get('recipes', 'rec_salmon_rice')).currentVersionId, 'recver_salmon_rice_v2');
  assert.equal((await repo.get('ingredients', 'ing_salmon')).currentRevisionId, 'ingrev_salmon_raw_v2');
  assert.deepEqual(await repo.get('recipeVersions', 'recver_salmon_rice_v1'), oldRecipe);
  assert.deepEqual(await repo.get('ingredientRevisions', 'ingrev_salmon_raw_v1'), oldRevision);
});
