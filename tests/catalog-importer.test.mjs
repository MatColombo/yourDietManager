import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();

test('catalog bootstrap validates then activates only after import', async () => {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const phases = [];
  const importer = new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null });
  const version = await importer.bootstrap(progress => phases.push(progress.phase));
  assert.equal(version, '0.3.0-dev');
  assert.equal(await repo.getMeta('activeCatalogVersion'), '0.3.0-dev');
  assert.equal(await repo.count('ingredients'), 4);
  assert.equal(await repo.count('ingredientRevisions'), 4);
  assert.equal(await repo.count('recipes'), 1);
  assert.equal(await repo.count('recipeVersions'), 1);
  assert.equal(await repo.count('catalogPacks'), 4);
  assert.equal(phases.at(-1), 'complete');
  assert.ok(phases.includes('validating'));
});
