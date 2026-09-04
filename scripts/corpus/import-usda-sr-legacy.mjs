import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { prepareFdcCurationBatch } from './fdc-import-lib.mjs';
import { readJson, writeJson } from './io-lib.mjs';

const input = process.argv[2]; const output = process.argv[3] || 'corpus/staging/usda-sr-legacy-review.json'; const policyFile = process.argv[4] || 'corpus/curation/v1-ingredient-curation-policy.json';
if (!input) { console.error('Usage: npm run corpus:import-usda-sr -- <extracted SR Legacy JSON> [output] [curation-policy]'); process.exit(2); }
const raw = await readFile(input, 'utf8'); const doc = JSON.parse(raw); const policy = await readJson(policyFile);
const sourcePolicy = policy.sourcePriority.find(item => item.sourceId === 'usda-sr-legacy-2018-04');
if (!sourcePolicy) throw new Error('Ingredient curation policy does not define usda-sr-legacy-2018-04');
const foods = doc.SRLegacyFoods || doc.srLegacyFoods || doc.SRLegacy || (Array.isArray(doc) ? doc : null);
const result = await prepareFdcCurationBatch({ raw, foods, sourcePolicy, policy });
await writeJson(output, result); console.log(`Prepared ${result.completeRequiredNutrientCount}/${result.inputFoodCount} USDA SR Legacy records for explicit supplemental review (incomplete=${result.incompleteRequiredNutrientCount}, structurallyInvalid=${result.structurallyInvalidFoodCount}) -> ${path.resolve(output)}`);
