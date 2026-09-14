import { writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader, fileFetch } from '../../tests/helpers.mjs';
import { CatalogImporter } from '../../src/services/catalogImporter.js';
import { CatalogQueryService } from '../../src/services/catalogQuery.js';
import { ingredientProjection, buildIngredientProjection, searchIngredientConcepts } from '../../src/services/ingredientConceptQuery.js';
import { ingredientPresentation } from '../../src/domain/ingredientPresentation.js';
import { assertRecipeTitle } from '../../src/domain/recipePresentation.js';
import { migrateRecipePresentation } from '../../src/services/recipePresentationMigration.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';
import { buildIdentity } from './build-identity.mjs';
const started = performance.now(); const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader('schemas')); await registry.loadAll();
const original = await loadLocalCatalog('public/data');
await new CatalogImporter({ repo, registry, fetcher: fileFetch(process.cwd()), storage: null, serviceWorker: null }).bootstrap();
const query = new CatalogQueryService({ repo }); const projection = await ingredientProjection(repo);
const current = await repo.getMany('recipeVersions', (await repo.getAll('recipes')).map(r => r.currentVersionId));
assert.equal(current.length, 1800); assert.ok(current.every(r => r.schemaVersion === 2));
for (const recipe of current) { for (const text of Object.values(recipe.i18n)) { assertRecipeTitle(text.title); assert.equal('instructions' in text, false); } assert.equal(recipe.practical.finalWeightG, null); }
for (const old of original.recipeVersions) assert.deepEqual(await repo.get('recipeVersions', old.recipeVersionId), old);
for (const old of original.ingredientRevisions) assert.deepEqual(await repo.get('ingredientRevisions', old.ingredientRevisionId), old);
const before = await repo.count('recipeVersions'); await migrateRecipePresentation({ repo, registry }); assert.equal(await repo.count('recipeVersions'), before);
const millet = searchIngredientConcepts(projection, { text: 'miglio' }); assert.equal(millet[0].label, 'Miglio'); assert.equal(millet[0].forms.length, 2);
const zucchini = searchIngredientConcepts(projection, { text: 'zucchine' }); assert.equal(zucchini[0].label, 'Zucchina');
const recipesByZucchini = await query.searchRecipes({ productFoodId: zucchini[0].concept.termId }); assert.ok(recipesByZucchini.total > 0);
const titles = current.map(r => ({ id: r.recipeVersionId, it: r.i18n.it.title, en: r.i18n.en.title, editorialReview: 'pending_R5' }));
const items = Array.from({ length: 10000 }, (_, n) => { const source = projection.items[n % projection.items.length]; return { family: { ...source.family, ingredientId: `synthetic_${n}` }, revision: { ...source.revision, ingredientId: `synthetic_${n}` } }; });
const projected = buildIngredientProjection(items, projection.index); const timings = []; for (let n = 0; n < 30; n++) { const t = performance.now(); searchIngredientConcepts(projected, { text: ['miglio','zucchine','cooked','pasta','cheese'][n % 5] }); timings.push(performance.now() - t); } timings.sort((a,b) => a-b);
const report = { result: 'PASS', scope: 'Real bundled catalog, in-memory repository; search timing is Node synthetic 10k forms, not browser acceptance', buildSha256: (await buildIdentity()).sha256, catalogVersion: original.manifest.catalogVersion,
  historicalRecipesPreserved: 1800, historicalIngredientRevisionsPreserved: 600, currentRecipesV2: current.length, currentIngredientForms: projection.items.length, totalRecipeVersions: before, repeatedMigrationAddsRecords: false,
  milletForms: millet[0].forms.map(f => ({ id: f.family.ingredientId, ...ingredientPresentation(f.revision, projection.index) })), zucchiniRecipeCount: recipesByZucchini.total,
  titleLength: { max: Math.max(...titles.flatMap(t => [t.it.length,t.en.length])), over55: titles.filter(t => t.it.length > 55).length }, titlesPendingEditorialR5: titles.length,
  benchmark: { kind: 'synthetic', forms: 10000, trials: timings.length, p50Ms: timings[15], p95Ms: timings[28], maxMs: timings.at(-1), node: process.version, platform: os.platform(), architecture: os.arch() }, elapsedMs: performance.now() - started };
await writeFile('reports/revision_v2/R2/evidence/catalog-and-search.json', JSON.stringify(report,null,2)+'\n'); await writeFile('reports/revision_v2/R2/evidence/titles.json', JSON.stringify(titles,null,2)+'\n'); console.log(JSON.stringify(report,null,2));
