import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { autoCurateBatches } from '../../src/corpus/fdcAutoCuration.js';
import { readJson, writeJson } from './io-lib.mjs';

const foundationFile = process.argv[2];
const srFile = process.argv[3];
const outputDir = process.argv[4] || 'corpus/staging/fdc-auto-curated';
const targetCount = Number(process.argv[5] || 600);
if (!foundationFile || !srFile) {
  console.error('Usage: node scripts/corpus/auto-curate-fdc.mjs <foundation-review.json> <sr-review.json> [outputDir] [targetCount]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [batches, policy] = await Promise.all([Promise.all([readJson(foundationFile), readJson(srFile)]), readJson('corpus/curation/v1-ingredient-curation-policy.json')]);
for (const batch of batches) registry.assert('ingredientCurationBatch', batch);
const result = autoCurateBatches({ batches, targetCount, nutritionBounds: policy.nutritionBoundsPer100g });
for (const batch of result.batches) registry.assert('ingredientCurationBatch', batch);
await writeJson(path.join(outputDir, 'usda-foundation-reviewed.json'), result.batches[0]);
await writeJson(path.join(outputDir, 'usda-sr-legacy-reviewed.json'), result.batches[1]);
await writeJson(path.join(outputDir, 'auto-curation-report.json'), { schemaVersion:1, generatedAt:new Date().toISOString(), ...result.diagnostics });
console.log(JSON.stringify(result.diagnostics, null, 2));
if (!result.diagnostics.targetMet || !result.diagnostics.pilotGroupMinimumsMet || !result.diagnostics.protectedConceptsMet) process.exitCode = 2;
