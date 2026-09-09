import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../src/services/configurationService.js';
import { createInitialPreview, commitGeneratedPreview, createRebalancePreview } from '../src/services/effectivePlanService.js';
import { loadReferenceDataIndex, TAXONOMY_IDS } from '../src/services/referenceDataService.js';
import { MemoryRepository, fileLoader, fileFetch } from './helpers.mjs';

const root = process.cwd();
const DATE = '2026-09-08';

async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
  await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
  await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });
  return { repo, registry };
}

function plannedMap(days) {
  return new Map(days.flatMap(day => day.mealSlots.filter(slot => slot.mode === 'planned').map(slot => [slot.mealOccurrenceId, (slot.recipeComponents || []).map(c => c.recipeVersionId).sort()]))) ;
}

async function selectedRecipes(repo, preview) {
  const ids = [...new Set(preview.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => (slot.recipeComponents || []).map(c => c.recipeVersionId))))];
  return repo.getMany('recipeVersions', ids);
}

test('Phase D2 - all 600 ingredient revisions have a valid three-level product taxonomy', async () => {
  const { repo } = await fixture();
  const revisions = await repo.getAll('ingredientRevisions');
  assert.equal(revisions.length, 600);
  assert.ok(revisions.every(item => item.productTaxonomy?.categoryId && item.productTaxonomy?.subcategoryId && item.productTaxonomy?.conceptId));
  const index = await loadReferenceDataIndex(repo);
  assert.equal(index.taxonomy(TAXONOMY_IDS.productFood)?.hierarchical, true);
  const noodles = revisions.filter(item => item.productTaxonomy.conceptId === 'product_concept_noodles');
  const dairy = revisions.filter(item => item.productTaxonomy.categoryId === 'product_category_dairy');
  assert.equal(noodles.length, 11);
  assert.equal(dairy.length, 19);
  assert.ok(index.isDescendantOrSelf('product_concept_noodles', 'product_category_cereals'));
  assert.ok(index.isDescendantOrSelf('product_concept_yogurt', 'product_category_dairy'));
  assert.equal(index.term('product_category_dairy')?.i18n?.it?.label, 'Latticini');
  assert.equal(index.resolveLegacy(TAXONOMY_IDS.productFood, 'Noodles'), 'product_concept_noodles');
  assert.equal(index.resolveLegacy(TAXONOMY_IDS.productFood, 'Beef'), null, 'ambiguous hierarchical label must not auto-resolve to the wrong level');
});

test('Phase D2 - Dairy productFood autoExclude is enforced as a hard planner constraint', async () => {
  const { repo, registry } = await fixture();
  const bundle = await loadConfigurationBundle(repo);
  const preferences = bundle.foodPreferences.find(item => item.id === bundle.appConfig.foodPreferencesId);
  preferences.rules = [{ id: 'no-dairy-product', targetType: 'productFood', targetId: 'product_category_dairy', level: 'rarely', autoExclude: true }];
  await saveConfigurationBundle(bundle, { repo, registry });
  const preview = await createInitialPreview({ horizon: { startDate: DATE, endDate: DATE }, seed: 'phase-d-no-dairy', createdAt: '2026-09-08T14:20:00.000Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 } }, { repo, registry });
  assert.equal(preview.status, 'success');
  const recipes = await selectedRecipes(repo, preview);
  const revisionIds = [...new Set(recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)))];
  const revisions = new Map((await repo.getMany('ingredientRevisions', revisionIds)).map(item => [item.ingredientRevisionId, item]));
  for (const recipe of recipes) {
    const containsDairy = recipe.ingredientLines.some(line => revisions.get(line.ingredientRevisionId)?.productTaxonomy?.categoryId === 'product_category_dairy');
    assert.equal(containsDairy, false, `${recipe.recipeVersionId} violates Dairy autoExclude`);
  }
});

test('Phase D1 - propose alternative changes every planned slot when strict alternative search is feasible', async () => {
  const { repo, registry } = await fixture();
  const initial = await createInitialPreview({ horizon: { startDate: DATE, endDate: DATE }, seed: 'phase-d-initial', createdAt: '2026-09-08T14:25:00.000Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 } }, { repo, registry });
  assert.equal(initial.status, 'success');
  await commitGeneratedPreview(initial, { repo, registry, createdAt: '2026-09-08T14:25:01.000Z' });
  const source = plannedMap(initial.calendarDays);
  const alternative = await createRebalancePreview({ planInstanceId: initial.planInstance.planInstanceId, startDate: DATE, endDate: DATE, seed: 'phase-d-alternative', createdAt: '2026-09-08T14:26:00.000Z', mode: 'alternative' }, { repo, registry });
  assert.equal(alternative.status, 'success');
  assert.equal(alternative.regenerationSummary.strictAttemptStatus, 'success');
  assert.equal(alternative.regenerationSummary.unchangedSlots, 0);
  assert.equal(alternative.regenerationSummary.changedSlots, alternative.regenerationSummary.totalPlannedSlots);
  const next = plannedMap(alternative.calendarDays);
  for (const [occurrenceId, ids] of source) assert.notDeepEqual(next.get(occurrenceId), ids, `slot ${occurrenceId} should use a different recipe`);
});

test('Phase D1 - recalculate and alternative are distinct, explicit modes', async () => {
  const { repo, registry } = await fixture();
  const initial = await createInitialPreview({ horizon: { startDate: DATE, endDate: DATE }, seed: 'phase-d-recalc-initial', createdAt: '2026-09-08T14:30:00.000Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 } }, { repo, registry });
  assert.equal(initial.status, 'success');
  await commitGeneratedPreview(initial, { repo, registry, createdAt: '2026-09-08T14:30:01.000Z' });
  const recalculated = await createRebalancePreview({ planInstanceId: initial.planInstance.planInstanceId, startDate: DATE, endDate: DATE, seed: 'phase-d-recalculate', createdAt: '2026-09-08T14:31:00.000Z', mode: 'recalculate' }, { repo, registry });
  assert.equal(recalculated.status, 'success');
  assert.equal(recalculated.rebalanceMode, 'recalculate');
  assert.equal(recalculated.regenerationSummary.mode, 'recalculate');
  assert.equal(recalculated.regenerationSummary.strictAttemptStatus, 'not_applicable');
  for (const detail of recalculated.regenerationSummary.details.filter(item => !item.changed)) assert.equal(detail.reason, 'recalculate_mode_same_result_allowed');
});
