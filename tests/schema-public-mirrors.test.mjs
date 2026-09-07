import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry, SCHEMA_FILES } from '../src/lib/schemaValidator.js';
import { fileLoader } from './helpers.mjs';

const root = process.cwd();

test('every browser-loaded JSON schema is an exact mirror of the canonical schema', async () => {
  for (const file of SCHEMA_FILES) {
    const [canonical, published] = await Promise.all([
      readFile(path.join(root, 'schemas', file), 'utf8'),
      readFile(path.join(root, 'public', 'schemas', file), 'utf8')
    ]);
    assert.equal(published, canonical, `public schema mirror drift: ${file}`);
  }
});

test('public ingredientRevision schema accepts production energy provenance but remains closed', async () => {
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'public', 'schemas')));
  await registry.loadAll();
  const bundle = JSON.parse(await readFile(path.join(root, 'corpus', 'staging', 'phase4-smoke-base-bundle.json'), 'utf8'));
  const revision = structuredClone(bundle.ingredientRevisions[0]);
  revision.source = {
    ...revision.source,
    energyBasis: 'legacy_energy',
    energyNutrientId: '1008',
    energySourceUnit: 'kcal',
    energyOriginalValue: 208,
    energyConversion: 'none'
  };
  registry.assert('ingredientRevision', revision);

  revision.source.uncontrolledField = 'must-not-be-accepted';
  assert.throws(() => registry.assert('ingredientRevision', revision), /additional properties not allowed: uncontrolledField/);
});
