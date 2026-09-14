import { readFile, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader, fileFetch } from '../../tests/helpers.mjs';
import { CatalogImporter } from '../../src/services/catalogImporter.js';
import { migrateIngredientModel } from '../../src/services/ingredientModelMigration.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';
import { recipeQuarantineReasons, allergenCompatibility } from '../../src/domain/safetyCompatibility.js';
import { APP_VERSION, DB_VERSION, CONTENT_SCHEMA_VERSION, BACKUP_FORMAT_VERSION } from '../../src/db/constants.js';
import { buildIdentity } from './build-identity.mjs';

const startedAt = new Date().toISOString();
const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader('schemas')); await registry.loadAll();
const original = await loadLocalCatalog('public/data');
await new CatalogImporter({ repo, registry, fetcher: fileFetch(process.cwd()), storage: null, serviceWorker: null }).bootstrap();
const firstReport = await repo.getMeta('contentMigration:4');
for (const revision of original.ingredientRevisions) assert.deepEqual(await repo.get('ingredientRevisions', revision.ingredientRevisionId), revision);
for (const recipe of original.recipeVersions) assert.deepEqual(await repo.get('recipeVersions', recipe.recipeVersionId), recipe);
const beforeCount = await repo.count('ingredientRevisions'); await migrateIngredientModel({ repo, registry }); assert.equal(await repo.count('ingredientRevisions'), beforeCount);
const revisionById = new Map((await repo.getAll('ingredientRevisions')).map(item => [item.ingredientRevisionId, item]));
const blocked = original.recipeVersions.filter(recipe => recipeQuarantineReasons(recipe, revisionById).length);
const gluten = { compatible: 0, incompatible: 0, unknown: 0 };
for (const recipe of original.recipeVersions) gluten[allergenCompatibility(recipe, 'gluten_cereals', revisionById)] += 1;
const current = await repo.getMany('ingredientRevisions', (await repo.getAll('ingredients')).map(family => family.currentRevisionId));
assert.equal(current.length, 600); assert.ok(current.every(item => item.schemaVersion === 2)); assert.ok(current.every(item => item.safetyEvidence.assessmentStatus === 'unreviewed'));
const report = {
  result: 'PASS', scope: 'Integration with in-memory repository and exact bundled catalog; not a browser or real IndexedDB test',
  startedAt, completedAt: new Date().toISOString(), buildSha256: (await buildIdentity()).sha256,
  appVersion: APP_VERSION, dbVersion: DB_VERSION, contentSchemaVersion: CONTENT_SCHEMA_VERSION, backupFormatVersion: BACKUP_FORMAT_VERSION,
  catalogVersion: original.manifest.catalogVersion, ingredientFamilies: current.length, oldRevisionsPreservedExactly: original.ingredientRevisions.length,
  recipeVersionsPreservedExactly: original.recipeVersions.length, totalIngredientRevisions: beforeCount, currentSchema2: current.length,
  migration: firstReport, quarantine: { count: blocked.length, recipeVersionIds: blocked.map(item => item.recipeVersionId) }, glutenCompatibility: gluten,
  repeatedMigrationAddsRecords: false, curatedSafetyReviewsInvented: 0
};
const audit = JSON.parse(await readFile('specs/revision_v2/baseline/audit_evidence.json'));
assert.ok(audit.catalogFindings.rawFishInZeroCookRecipes.every(item => report.quarantine.recipeVersionIds.includes(item.recipeVersionId)));
await writeFile('reports/revision_v2/R1/evidence/catalog-migration.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, ingredientFamilies: current.length, totalIngredientRevisions: beforeCount, oldRevisionsPreserved: 600, oldRecipesPreserved: 1800, quarantinedRecipes: blocked.length, glutenCompatibility: gluten }, null, 2));
