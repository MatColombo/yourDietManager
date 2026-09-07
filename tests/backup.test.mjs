import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { createBackup, importBackup, validateBackup } from '../src/services/backupEngine.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root = process.cwd();
const devRoot = path.join(root, 'tests/fixtures/catalog-0.3');

test('backup round-trip restores config and preserves base catalog', async () => {
  const repo = new MemoryRepository();
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const fetcher = fileFetch(devRoot);
  await new CatalogImporter({ repo, registry, fetcher, storage: null }).bootstrap();
  const config = await ensureBootstrapConfiguration({ repo, registry, fetcher });
  const backup = await createBackup({ repo, registry });
  await validateBackup(backup, { repo, registry });
  const theme = await repo.get('themeProfiles', config.themeProfileId);
  theme.density = theme.density === 'compact' ? 'comfortable' : 'compact';
  await repo.put('themeProfiles', theme);
  await importBackup(backup, { repo, registry });
  assert.equal((await repo.get('themeProfiles', config.themeProfileId)).density, backup.payload.configuration.themeProfiles[0].density);
  assert.equal(await repo.count('recipes'), 1);
  assert.equal((await repo.get('recipes', 'rec_salmon_rice')).origin, 'base');
});
