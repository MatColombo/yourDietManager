import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { CatalogUpdater } from '../src/services/catalogUpdater.js';
import { CatalogQueryService } from '../src/services/catalogQuery.js';
import { createCustomCatalogExport, importCustomCatalogExport } from '../src/services/customCatalogTransfer.js';
import { recipeToDraft, saveIngredient, saveRecipe } from '../src/services/personalCatalogService.js';
import { routePath } from '../src/lib/appBase.js';
import { isEditableRoute } from '../src/ui/uiState.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();
async function fixture() {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null }).bootstrap();
  return { repo, registry, query: new CatalogQueryService({ repo }) };
}

function ingredientDraft(revision) {
  return {
    ingredientId: revision.ingredientId,
    nameIt: `${revision.i18n.it.name} modificato`, nameEn: `${revision.i18n.en.name} edited`,
    aliasesIt: revision.i18n.it.aliases || [], aliasesEn: revision.i18n.en.aliases || [],
    basisUnit: revision.basis.unit, state: revision.basis.state,
    energyKcal: revision.nutrition.energyKcal, proteinG: revision.nutrition.proteinG, carbsG: revision.nutrition.carbsG, fatG: revision.nutrition.fatG, fiberG: revision.nutrition.fiberG,
    foodGroup: revision.taxonomy.foodGroup, foodSubgroup: revision.taxonomy.foodSubgroup, flavorProfile: revision.taxonomy.flavorProfile,
    mealArchetypes: revision.taxonomy.mealArchetypes, allergenIds: revision.allergenIds, conversions: revision.conversions || []
  };
}

test('Pass D edits bundled recipes in-place at family level while preserving historical versions', async () => {
  const { repo, registry, query } = await fixture();
  const beforeFamily = await repo.get('recipes', 'rec_salmon_rice');
  assert.equal(beforeFamily.origin, 'base');
  const beforeVersion = await repo.get('recipeVersions', beforeFamily.currentVersionId);
  const draft = await recipeToDraft(beforeFamily.recipeId, { repo });
  assert.equal(draft.titleIt.includes('copia'), false, 'editing must not silently rename the recipe as a copy');
  draft.titleIt = `${draft.titleIt} modificata`;
  const saved = await saveRecipe({ recipeId: beforeFamily.recipeId, ...draft }, { repo, registry });
  assert.equal(saved.promotedFromBase, true);
  assert.equal(saved.family.recipeId, beforeFamily.recipeId);
  assert.equal(saved.family.origin, 'user');
  assert.equal(saved.version.origin, 'user');
  assert.equal(saved.version.supersedesVersionId, beforeVersion.recipeVersionId);
  assert.deepEqual(await repo.get('recipeVersions', beforeVersion.recipeVersionId), beforeVersion, 'historical version changed in place');
  const resolved = await query.resolveRecipe(beforeFamily.recipeId);
  assert.equal(resolved.version.recipeVersionId, saved.version.recipeVersionId);
  const history = await query.recipeHistory(beforeFamily.recipeId);
  assert.ok(history.length >= 2); assert.equal(history[0].recipeVersionId, saved.version.recipeVersionId);
  const browse = await query.searchRecipes({ limit: 100 });
  assert.equal(browse.items.filter(item => item.recipeId === beforeFamily.recipeId).length, 1, 'base and local override were both shown');
  assert.equal(browse.items.find(item => item.recipeId === beforeFamily.recipeId).recipeVersionId, saved.version.recipeVersionId);
});

test('Pass D edits bundled ingredients with a new user revision and preserves the base revision', async () => {
  const { repo, registry, query } = await fixture();
  const beforeFamily = await repo.get('ingredients', 'ing_salmon');
  const beforeRevision = await repo.get('ingredientRevisions', beforeFamily.currentRevisionId);
  const saved = await saveIngredient(ingredientDraft(beforeRevision), { repo, registry });
  assert.equal(saved.promotedFromBase, true);
  assert.equal(saved.family.ingredientId, beforeFamily.ingredientId);
  assert.equal(saved.family.origin, 'user');
  assert.equal(saved.revision.origin, 'user');
  assert.equal(saved.revision.revisionNumber, beforeRevision.revisionNumber + 1);
  assert.deepEqual(await repo.get('ingredientRevisions', beforeRevision.ingredientRevisionId), beforeRevision);
  const resolved = await query.resolveIngredient(beforeFamily.ingredientId);
  assert.equal(resolved.revision.ingredientRevisionId, saved.revision.ingredientRevisionId);
  const history = await query.ingredientHistory(beforeFamily.ingredientId);
  assert.ok(history.length >= 2); assert.equal(history[0].ingredientRevisionId, saved.revision.ingredientRevisionId);
});

test('Pass D personal catalog transfer can carry local overrides of bundled family IDs', async () => {
  const source = await fixture();
  const beforeFamily = await source.repo.get('ingredients', 'ing_salmon');
  const beforeRevision = await source.repo.get('ingredientRevisions', beforeFamily.currentRevisionId);
  const saved = await saveIngredient(ingredientDraft(beforeRevision), { repo: source.repo, registry: source.registry });
  const document = await createCustomCatalogExport({ repo: source.repo });
  assert.ok(document.payload.ingredients.some(item => item.ingredientId === 'ing_salmon' && item.origin === 'user'));
  assert.ok(document.payload.ingredientRevisions.some(item => item.ingredientRevisionId === saved.revision.ingredientRevisionId));

  const target = await fixture();
  await importCustomCatalogExport(document, { repo: target.repo, registry: target.registry });
  const imported = await target.repo.get('ingredients', 'ing_salmon');
  assert.equal(imported.origin, 'user');
  assert.equal(imported.currentRevisionId, saved.revision.ingredientRevisionId);
});

test('Pass D catalog pack reinstall does not overwrite a locally edited bundled recipe family', async () => {
  const { repo, registry } = await fixture();
  const updater = new CatalogUpdater({ repo, registry, fetcher: fileFetch(root), storage: null });
  await updater.installPack('quick');
  const base = await repo.get('recipes', 'rec_zucchini_rice');
  const draft = await recipeToDraft(base.recipeId, { repo }); draft.titleIt = `${draft.titleIt} locale`;
  const saved = await saveRecipe({ recipeId: base.recipeId, ...draft }, { repo, registry });
  await updater.uninstallPack('quick'); await updater.installPack('quick');
  const after = await repo.get('recipes', base.recipeId);
  assert.equal(after.origin, 'user'); assert.equal(after.currentVersionId, saved.version.recipeVersionId);
});

test('Pass D routing normalizes trailing slashes and marks dynamic edit routes dirty-trackable', () => {
  assert.equal(routePath('/recipes/'), '/recipes');
  assert.equal(routePath('/recipes/rec_salmon_rice/'), '/recipes/rec_salmon_rice');
  assert.equal(isEditableRoute('/recipes/rec_salmon_rice/edit', ''), true);
  assert.equal(isEditableRoute('/configure/ingredients/ing_salmon/edit', ''), true);
  assert.equal(isEditableRoute('/recipes/rec_salmon_rice', ''), false);
});

test('Pass D source audit keeps details independent of plan state and removes origin edit gates', async () => {
  const catalogUi = await readFile(path.join(root, 'src/ui/catalogPages.js'), 'utf8');
  const service = await readFile(path.join(root, 'src/services/personalCatalogService.js'), 'utf8');
  const app = await readFile(path.join(root, 'src/ui/app.js'), 'utf8');
  assert.match(catalogUi, /data-testid': 'recipe-detail'/);
  assert.match(catalogUi, /data-testid': 'ingredient-detail'/);
  assert.match(catalogUi, /href: `\/recipes\/\$\{encodeURIComponent\(recipe\.recipeId\)\}`/);
  assert.match(catalogUi, /href: `\/recipes\/\$\{encodeURIComponent\(recipeId\)\}\/edit`/);
  assert.doesNotMatch(catalogUi, /family\.origin !== 'user'.*notEditable/);
  assert.doesNotMatch(service, /Base recipes cannot be edited|Base ingredients cannot be edited/);
  assert.match(service, /promotedFromBase/);
  assert.match(app, /recipeDetailMatch/); assert.match(app, /ingredientDetailMatch/);
  assert.doesNotMatch(catalogUi, /planInstance|GenerationRun|calendarDay/i, 'catalog detail unexpectedly depends on plan runtime');
});

test('Pass D deployment requires browser regression and origin labels describe provenance, not editability', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  const it = JSON.parse(await readFile(path.join(root, 'public/data/locales/it.json'), 'utf8'));
  const en = JSON.parse(await readFile(path.join(root, 'public/data/locales/en.json'), 'utf8'));
  assert.match(workflow, /YDM_BROWSER_REQUIRED:\s*'1'/);
  assert.equal(it['catalog.origin.base'], 'Catalogo');
  assert.equal(it['catalog.origin.user'], 'Locale');
  assert.equal(en['catalog.origin.base'], 'Catalog');
  assert.equal(en['catalog.origin.user'], 'Local');
});
