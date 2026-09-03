import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { fileLoader } from './helpers.mjs';

const root = process.cwd();
const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
await registry.loadAll();

const cases = [
  ['allergy-intolerance-profile.example.json','allergyIntoleranceProfile'], ['app-config.example.json','appConfig'], ['backup.example.json','backup'],
  ['calendar-day.example.json','calendarDay'], ['catalog-manifest.example.json','catalogManifest'], ['catalog-pack.example.json','catalogPack'],
  ['cycle.example.json','cycle'], ['day-classes.example.json','dayClass'], ['food-preferences.example.json','foodPreferences'],
  ['generation-run.example.json','generationRun'], ['ingredient-revision.example.json','ingredientRevision'], ['ingredient.example.json','ingredient'],
  ['meal-classes.example.json','mealClass'], ['nutrition-profile.example.json','nutritionProfile'], ['operation.example.json','operation'],
  ['plan-instance.example.json','planInstance'], ['recipe-version.example.json','recipeVersion'], ['recipe.example.json','recipe'], ['shopping-checklist.example.json','shoppingChecklist'],
  ['theme-profile.example.json','themeProfile'],
  ['recipe-corpus-orchestration-run.example.json','recipe-corpus-orchestration-run.schema.json'],
  ['recipe-corpus-policy.example.json','recipe-corpus-policy.schema.json'], ['recipe-corpus-snapshot.example.json','recipe-corpus-snapshot.schema.json'],
  ['recipe-generation-job.example.json','recipe-generation-job.schema.json']
];

test('runtime JSON Schema validator accepts all canonical examples', async () => {
  for (const [file, schema] of cases) {
    const value = JSON.parse(await readFile(path.join(root, 'examples', file), 'utf8'));
    for (const record of Array.isArray(value) ? value : [value]) {
      const result = registry.validate(schema, record);
      assert.equal(result.valid, true, `${file}: ${result.errors.join('; ')}`);
    }
  }
});

test('runtime JSON Schema validator rejects an invalid allergen id', async () => {
  const value = JSON.parse(await readFile(path.join(root, 'examples', 'ingredient-revision.example.json'), 'utf8'));
  value.allergenIds = ['not_a_real_allergen'];
  const result = registry.validate('ingredientRevision', value);
  assert.equal(result.valid, false);
});
