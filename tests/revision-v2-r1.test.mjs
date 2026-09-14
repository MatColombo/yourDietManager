import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { MemoryRepository, fileLoader, seedReferenceData, syntheticSafetyEvidence } from './helpers.mjs';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { migrateIngredientModel } from '../src/services/ingredientModelMigration.js';
import { runMigrations } from '../src/services/migrationRunner.js';
import { ensurePreV1DataEpoch } from '../src/services/preV1DataEpoch.js';
import { loadReferenceDataIndex } from '../src/services/referenceDataService.js';
import { saveFoodGroup, currentFoodGroups, saveIngredientConversion, saveIngredientMapping, stageConfigurationV2, readConfigurationV2Draft, ingredientReferenceClosure } from '../src/services/revisionV2Service.js';
import { assertIngredientPath, listIngredientConcepts, resolveIngredientRedirect, isCuratedConcept } from '../src/domain/ingredientIdentity.js';
import { convertIngredientQuantity } from '../src/domain/ingredientConversion.js';
import { assertFoodPreferencesV2, assertSafetyEvidence } from '../src/domain/revisionV2Contracts.js';
import { calculateRecipeNutrition, normalizeIngredientAmount } from '../src/domain/nutritionCore.js';
import { createBackup, importBackup } from '../src/services/backupEngine.js';
import { saveRecipe, duplicateRecipeToDraft } from '../src/services/personalCatalogService.js';
import { sha256Json } from '../src/lib/crypto.js';

const DATE = '2026-09-11T00:00:00Z';
async function fixture() {
  const repo = new MemoryRepository(), registry = new SchemaRegistry(fileLoader('schemas')); await registry.loadAll(); await seedReferenceData(repo, process.cwd());
  const sources = (await Promise.all((await readdir('public/data/ingredients')).filter(name => name.startsWith('ingredient-revisions')).map(async name => JSON.parse(await readFile(`public/data/ingredients/${name}`))))).flat();
  const original = sources.find(item => item.ingredientId === 'ing_fdc_168871');
  const cooked = { ...structuredClone(original), ingredientId: 'test_millet_cooked', ingredientRevisionId: 'test_millet_cooked_r1', origin: 'base', createdAt: DATE };
  const dry = { ...structuredClone(original), ingredientId: 'test_millet_dry', ingredientRevisionId: 'test_millet_dry_r1', origin: 'base', createdAt: DATE, basis: { amount: 100, unit: 'g', state: 'dry' }, nutrition: { ...original.nutrition, energyKcal: 370 } };
  const local = { ...structuredClone(cooked), ingredientId: 'test_local', ingredientRevisionId: 'test_local_r1', origin: 'user', catalogVersion: null };
  for (const revision of [cooked, dry, local]) { revision.contentHash = await sha256Json({ ...revision, contentHash: '' }); await repo.put('ingredientRevisions', revision); await repo.put('ingredients', { schemaVersion: 1, ingredientId: revision.ingredientId, currentRevisionId: revision.ingredientRevisionId, origin: revision.origin, status: 'active', createdAt: DATE, updatedAt: DATE }); }
  await repo.setMeta('contentSchemaVersion', 3); await repo.setMeta('activeCatalogVersion', 'synthetic-r1');
  return { repo, registry, original: [cooked, dry, local], index: await loadReferenceDataIndex(repo) };
}
const group = (id = 'group_millet') => ({ schemaVersion: 1, id, name: 'Miglio', members: [{ type: 'productFood', id: 'product_concept_millet' }], version: 1, origin: 'user', status: 'active', createdAt: DATE, updatedAt: DATE });
const conversion = () => ({ schemaVersion: 1, conversionId: 'test_yield', fromIngredientId: 'test_millet_cooked', toIngredientId: 'test_millet_dry', fromUnit: 'g', toUnit: 'g', factor: 0.4, purpose: 'shopping_yield', sourceRef: 'test-only:synthetic-yield-not-for-publication', reviewStatus: 'reviewed', version: 1 });
const rule = () => ({ id: 'millet-rule', enabled: true, mode: 'frequency', target: { type: 'productFood', id: 'product_concept_millet' }, scope: { mealClassIds: [] }, countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 7 }, minOccurrences: 2, targetOccurrences: 2.5, maxOccurrences: 4, priority: 'normal', effectiveFrom: '2026-09-11' });

test('T72 R1 miglio generic query aggregates forms without merging IDs, quantities or nutrients', async () => {
  const deps = await fixture(); await migrateIngredientModel(deps);
  const ingredients = await deps.repo.getAll('ingredients'), revisions = await deps.repo.getAll('ingredientRevisions');
  const matches = listIngredientConcepts({ ingredients, revisions, index: deps.index, query: 'MIGLIO' });
  assert.equal(matches.length, 1); assert.equal(matches[0].forms.length, 3);
  assert.equal(new Set(matches[0].forms.map(item => item.ingredient.ingredientId)).size, 3);
  assert.notEqual(matches[0].forms[0].revision.nutrition.energyKcal, matches[0].forms.find(item => item.ingredient.ingredientId === 'test_millet_dry').revision.nutrition.energyKcal);
  assert.equal(isCuratedConcept('product_concept_other'), false);
});
test('T72 R1 inconsistent or non-leaf product paths are rejected instead of inferred from names', async () => {
  const deps = await fixture();
  assert.throws(() => assertIngredientPath({ ...deps.original[0], productTaxonomy: { ...deps.original[0].productTaxonomy, categoryId: 'product_category_dairy' } }, deps.index), /must belong/);
  assert.throws(() => assertIngredientPath({ ...deps.original[0], productTaxonomy: null }, deps.index), /missing/);
});
test('T06 R1 FoodGroup rejects nested, unknown and duplicate members; membership history is immutable', async () => {
  const deps = await fixture(); await saveFoodGroup(group(), deps);
  for (const members of [[{ type: 'foodGroup', id: 'group_millet' }], [{ type: 'ingredient', id: 'missing' }], [...group().members, ...group().members]]) await assert.rejects(saveFoodGroup({ ...group('invalid'), members }, deps));
  const next = { ...group(), version: 2, members: [{ type: 'ingredient', id: 'test_millet_dry' }] }; await saveFoodGroup(next, deps);
  assert.equal((await deps.repo.getAll('foodGroups')).length, 2); assert.deepEqual((await currentFoodGroups(deps))[0], next);
  await assert.rejects(saveFoodGroup({ ...next, name: 'Overwritten' }, deps), /Immutable/);
});
test('T17/T18 R1 directional shopping yield cannot alter nutritional basis or invent g/ml equivalence', async () => {
  const deps = await fixture(); const edge = conversion(); await saveIngredientConversion(edge, deps);
  const before = structuredClone(deps.original[0]); const nutrition = calculateRecipeNutrition([{ ingredientRevisionId: before.ingredientRevisionId, normalizedAmount: 150, normalizedUnit: 'g' }], new Map([[before.ingredientRevisionId, before]]));
  const request = { amount: 150, fromIngredientId: edge.fromIngredientId, toIngredientId: edge.toIngredientId, fromUnit: 'g', toUnit: 'g', purpose: 'shopping_yield' };
  assert.equal(convertIngredientQuantity(request, [edge]).amount, 60);
  assert.equal(convertIngredientQuantity({ ...request, fromIngredientId: edge.toIngredientId, toIngredientId: edge.fromIngredientId }, [edge]).status, 'conversion_missing');
  assert.equal(convertIngredientQuantity({ ...request, purpose: 'unit' }, [edge]).status, 'conversion_missing');
  assert.equal(convertIngredientQuantity(request, [edge, { ...edge, version: 2, factor: 0.5 }]).status, 'choice_required');
  assert.equal(convertIngredientQuantity({ ...request, conversionId: edge.conversionId, version: 1 }, [edge, { ...edge, version: 2 }]).amount, 60);
  assert.throws(() => normalizeIngredientAmount(before, 150, 'ml'), /No ml conversion/);
  assert.deepEqual(deps.original[0], before); assert.equal(nutrition.energyKcal, Math.round(before.nutrition.energyKcal * 1.5 * 10) / 10);
  await assert.rejects(saveIngredientConversion({ ...edge, conversionId: 'invalid', factor: 0 }, deps));
  await assert.rejects(saveIngredientConversion({ ...edge, conversionId: 'invalid', purpose: 'unit' }, deps), /preserve ingredient form/);
});
test('T59/T72 R1 migration is additive, restartable, idempotent and preserves current local pointer and old records', async () => {
  const deps = await fixture(); const sentinel = { calendarDayId: 'historical', notes: 'Keep notes', recipeVersionId: 'historical_version' };
  await deps.repo.put('calendarDays', sentinel); await deps.repo.put('operations', { operationId: 'old_op', before: { note: 'before' }, after: { note: 'after' } }); await deps.repo.put('shoppingChecklists', { checklistId: 'old_checklist', checked: true });
  const prefs = { schemaVersion: 1, id: 'prefs', rules: [{ id: 'soft', targetType: 'ingredient', targetId: 'test_local', level: 'rarely', autoExclude: false }] }; await deps.repo.put('foodPreferences', prefs);
  await assert.rejects(migrateIngredientModel({ ...deps, batchSize: 1, onStep: () => { throw new Error('injected interruption'); } }), /injected/);
  assert.equal((await deps.repo.getMeta('contentMigration:4')).status, 'interrupted');
  await migrateIngredientModel(deps); const count = await deps.repo.count('ingredientRevisions'); await migrateIngredientModel(deps); assert.equal(await deps.repo.count('ingredientRevisions'), count);
  for (const old of deps.original) assert.deepEqual(await deps.repo.get('ingredientRevisions', old.ingredientRevisionId), old);
  assert.equal((await deps.repo.get('ingredients', 'test_local')).currentRevisionId, 'test_local_r1');
  assert.equal((await deps.repo.getMeta('contentMigration:4')).reconciliation[0].status, 'awaiting_explicit_local_decision');
  assert.deepEqual(await deps.repo.get('calendarDays', 'historical'), sentinel); assert.deepEqual(await deps.repo.get('foodPreferences', 'prefs'), prefs);
  assert.equal((await deps.repo.get('shoppingChecklists', 'old_checklist')).checked, true); assert.equal((await deps.repo.get('operations', 'old_op')).before.note, 'before');
  const migrated = await deps.repo.get('ingredientRevisions', 'test_millet_cooked_r1_v2_r1'); assert.equal(migrated.safetyEvidence.assessmentStatus, 'unreviewed'); assert.equal(migrated.safetyEvidence.reviewedBy, null);
});
test('T59 R1 preserves existing data without legacy epoch and rejects content downgrade', async () => {
  const deps = await fixture(); const result = await ensurePreV1DataEpoch({ repo: deps.repo, registry: deps.registry }); assert.equal(result.reset, false); assert.equal(await deps.repo.count('ingredients'), 3);
  await deps.repo.setMeta('contentSchemaVersion', 6); await assert.rejects(runMigrations(deps.repo, { registry: deps.registry }), /downgrade refused/); assert.equal(await deps.repo.getMeta('contentSchemaVersion'), 6);
});
test('T59 R1 interrupted batches and changed local pointer cannot be overwritten', async () => {
  const deps = await fixture(); const originalMutate = deps.repo.atomicMutate.bind(deps.repo);
  let injected = false; deps.repo.atomicMutate = async mutation => { if (!injected && mutation.puts?.ingredients?.length) { injected = true; const current = await deps.repo.get('ingredients', 'test_millet_cooked'); await deps.repo.put('ingredients', { ...current, origin: 'user' }); } return originalMutate(mutation); };
  await assert.rejects(migrateIngredientModel(deps), /concurrent_change/);
  assert.equal((await deps.repo.get('ingredients', 'test_millet_cooked')).origin, 'user'); assert.equal(await deps.repo.count('ingredientRevisions'), 3);
  await migrateIngredientModel(deps); assert.equal((await deps.repo.get('ingredients', 'test_millet_cooked')).currentRevisionId, 'test_millet_cooked_r1');
});
test('T72 R1 unresolved mapping is retained for review without changing the family', async () => {
  const deps = await fixture(); const bad = { ...deps.original[0], productTaxonomy: { ...deps.original[0].productTaxonomy, conceptId: 'product_concept_missing' } }; await deps.repo.put('ingredientRevisions', bad);
  const report = await migrateIngredientModel(deps); assert.equal(report.unresolved.length, 1); assert.equal((await deps.repo.get('ingredients', bad.ingredientId)).currentRevisionId, bad.ingredientRevisionId);
});
test('T72 R1 lexical similarity never merges forms; explicit redirects retain source and reject cycles', async () => {
  const deps = await fixture(); await migrateIngredientModel(deps);
  const base = { schemaVersion: 1, mappingId: 'manual-same-form', version: 1, sourceIngredientId: 'test_local', sourceRevisionId: 'test_local_r1', targetIngredientId: 'test_millet_cooked', targetRevisionId: 'test_millet_cooked_r1_v2_r1', productTaxonomy: deps.original[0].productTaxonomy, status: 'approved', kind: 'redirect', reason: 'Synthetic same-form source selection; no nutrient averaging', sourceRef: 'test-only:explicit-selection', approvedBy: 'synthetic-mapping-reviewer', approvedAt: DATE };
  await assert.rejects(saveIngredientMapping({ ...base, approvedBy: null }, deps), /explicit decision/);
  await saveIngredientMapping(base, deps); assert.equal(resolveIngredientRedirect('test_local', await deps.repo.getAll('ingredientMappings')), 'test_millet_cooked'); assert.ok(await deps.repo.get('ingredientRevisions', 'test_local_r1'));
  await assert.rejects(saveIngredientMapping({ ...base, mappingId: 'cycle', sourceIngredientId: 'test_millet_cooked', sourceRevisionId: 'test_millet_cooked_r1', targetIngredientId: 'test_local', targetRevisionId: 'test_local_r1' }, deps), /Cyclic/);
  await assert.rejects(saveIngredientMapping({ ...base, mappingId: 'wrong-state', targetIngredientId: 'test_millet_dry', targetRevisionId: 'test_millet_dry_r1' }, deps), /different weighing states/);
});
test('T23/T39 R1 strict frequency draft validates bounds, half ideals and target references without activating V2', async () => {
  const deps = await fixture(); const ctx = { ...deps, ingredients: await deps.repo.getAll('ingredients'), foodGroups: [], mealClasses: [] };
  const profile = { schemaVersion: 2, id: 'prefs-v2', rules: [rule()] }; assertFoodPreferencesV2(profile, ctx);
  for (const change of [{ minOccurrences: 5 }, { effectiveFrom: '2026-02-30' }, { targetOccurrences: 2.3 }, { minOccurrences: null, targetOccurrences: null, maxOccurrences: null }, { window: { kind: 'rolling', days: 91 } }, { target: { type: 'ingredient', id: 'unknown' } }]) assert.throws(() => assertFoodPreferencesV2({ ...profile, rules: [{ ...rule(), ...change }] }, ctx));
  assert.throws(() => assertFoodPreferencesV2({ ...profile, rules: [rule(), { ...rule(), enabled: false }] }, ctx), /Duplicate/);
  const legacy = { schemaVersion: 1, id: 'old', rules: [] }; await deps.repo.put('foodPreferences', legacy);
  await stageConfigurationV2({ foodPreferences: profile }, deps); assert.deepEqual((await readConfigurationV2Draft(deps)).foodPreferences, profile); assert.deepEqual(await deps.repo.getAll('foodPreferences'), [legacy]);
});
test('T01/T05 R1 strict safety contract cannot invent reviewer or contain/trace equivalence', async () => {
  const deps = await fixture(); assertSafetyEvidence(syntheticSafetyEvidence([]), deps.registry);
  assert.throws(() => assertSafetyEvidence({ ...syntheticSafetyEvidence([]), reviewedBy: null }, deps.registry));
  assert.throws(() => assertSafetyEvidence({ ...syntheticSafetyEvidence(['milk']), mayContainAllergenIds: ['milk'] }, deps.registry), /distinct/);
  const safety = { schemaVersion: 2, id: 'new', rules: [{ id: 'r', kind: 'coeliac', target: { type: 'allergen', id: 'gluten_cereals' }, enabled: true, notes: 'Explicit synthetic choice', effectiveFrom: '2026-09-11' }] };
  await stageConfigurationV2({ safetyProfile: safety }, deps); assert.deepEqual((await readConfigurationV2Draft(deps)).safetyProfile, safety);
});
test('T21 R1 recipe V2 writes omit instructions and legacy versions remain lossless', async () => {
  const deps = await fixture(); const source = deps.original[0]; const input = { titleIt: 'Miglio semplice', titleEn: 'Simple millet', instructionsIt: ['Legacy fixture instruction'], instructionsEn: ['Legacy fixture instruction'], mealArchetypes: ['lunch'], ingredientLines: [{ ingredientId: source.ingredientId, ingredientRevisionId: source.ingredientRevisionId, amount: 100, unit: 'g', optional: false }], prepMinutes: 2, cookMinutes: 0 };
  const old = await saveRecipe(input, deps); const current = await saveRecipe({ ...input, recipeId: old.family.recipeId, schemaVersion: 2 }, deps);
  assert.equal(current.version.schemaVersion, 2); assert.equal('instructions' in current.version.i18n.it, false); assert.deepEqual(await deps.repo.get('recipeVersions', old.version.recipeVersionId), old.version);
  assert.equal('instructionsIt' in (await duplicateRecipeToDraft(current.family.recipeId, deps)), false);
  assert.equal(deps.registry.validate('recipeVersion', { ...current.version, i18n: { ...current.version.i18n, it: { ...current.version.i18n.it, instructions: [] } } }).valid, false);
});
test('T59 R1 portable backup 4 round-trips new registries and staged configuration', async () => {
  const deps = await fixture(); await migrateIngredientModel(deps); await saveFoodGroup(group(), deps); await saveIngredientConversion(conversion(), deps); await stageConfigurationV2({ foodPreferences: { schemaVersion: 2, id: 'new', rules: [rule()] } }, deps);
  const backup = await createBackup(deps); assert.equal(backup.formatVersion, 4); assert.equal(backup.payload.foodGroups.length, 1); assert.equal(backup.payload.migratedIngredientRevisions.length, 2);
  const target = await fixture(); await importBackup(backup, target); assert.deepEqual(await target.repo.getAll('ingredientMappings'), await deps.repo.getAll('ingredientMappings')); assert.deepEqual(await readConfigurationV2Draft(target), await readConfigurationV2Draft(deps));
  const closure = ingredientReferenceClosure({ ingredients: await deps.repo.getAll('ingredients'), mappings: await deps.repo.getAll('ingredientMappings') }); assert.ok(closure.includes('test_local_r1')); assert.ok(closure.includes('test_millet_cooked_r1_v2_r1'));
});

test('T18 R1 V2 unit conversion requires a reviewed directional density; legacy unsourced conversion cannot be used', async () => {
  const deps = await fixture(); await migrateIngredientModel(deps);
  const revision = await deps.repo.get('ingredientRevisions', 'test_millet_cooked_r1_v2_r1');
  revision.conversions = [{ unit: 'ml', canonicalAmount: 1, canonicalUnit: 'g' }];
  assert.throws(() => normalizeIngredientAmount(revision, 100, 'ml'), /No reviewed/);
  const density = { ...conversion(), conversionId: 'synthetic-density', toIngredientId: revision.ingredientId, fromUnit: 'ml', factor: 0.8, purpose: 'unit' };
  assert.deepEqual(normalizeIngredientAmount(revision, 100, 'ml', { conversions: [density] }), { normalizedAmount: 80, normalizedUnit: 'g' });
  assert.throws(() => normalizeIngredientAmount(revision, 100, 'ml', { conversions: [{ ...density, reviewStatus: 'unreviewed' }] }), /No reviewed/);
});
test('T59/T74 R1 app/DB/cache contracts are current and every declared offline shell asset exists', async () => {
  const { APP_VERSION, DB_VERSION, CONTENT_SCHEMA_VERSION, BACKUP_FORMAT_VERSION, PRE_V1_DATA_EPOCH } = await import('../src/db/constants.js');
  assert.equal(APP_VERSION, '1.1.0-dev.r8'); assert.equal(DB_VERSION, 9); assert.equal(CONTENT_SCHEMA_VERSION, 5); assert.equal(BACKUP_FORMAT_VERSION, 4); assert.equal(PRE_V1_DATA_EPOCH, 'v1-planner-phase-d-epoch-1');
  const worker = await readFile('public/service-worker.js', 'utf8'); assert.match(worker, /ydm-shell-v42-/); assert.match(worker, /ydm-data-v22-/); assert.match(await readFile('src/services/offlineCatalog.js', 'utf8'), /ydm-data-v22-/);
  const paths = [...worker.slice(worker.indexOf('const SHELL = ['), worker.indexOf('].map(scoped)')).matchAll(/'([A-Za-z0-9_./-]+)'/g)].map(match => match[1]);
  for (const file of paths) {
    try { await readFile(file); } catch { await readFile(`public/${file}`); }
  }
});
