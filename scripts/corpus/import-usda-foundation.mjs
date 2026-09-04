import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { prepareFdcCurationBatch } from './fdc-import-lib.mjs';
import { readJson, writeJson } from './io-lib.mjs';

const input = process.argv[2]; const output = process.argv[3] || 'corpus/staging/usda-foundation-review.json'; const policyFile = process.argv[4] || 'corpus/curation/v1-ingredient-curation-policy.json';
if (!input) { console.error('Usage: npm run corpus:import-usda -- <extracted Foundation Foods JSON> [output] [curation-policy]'); process.exit(2); }
const raw = await readFile(input, 'utf8'); const doc = JSON.parse(raw); const policy = await readJson(policyFile);
const sourcePolicy = policy.sourcePriority.find(item => item.sourceId === 'usda-foundation-2026-04');
if (!sourcePolicy) throw new Error('Ingredient curation policy does not define usda-foundation-2026-04');
const foods = doc.FoundationFoods || doc.foundationFoods || (Array.isArray(doc) ? doc : null);
const result = await prepareFdcCurationBatch({ raw, foods, sourcePolicy, policy });
await writeJson(output, result); console.log(`Prepared ${result.completeRequiredNutrientCount}/${result.inputFoodCount} USDA Foundation records for explicit editorial review (incomplete=${result.incompleteRequiredNutrientCount}, structurallyInvalid=${result.structurallyInvalidFoodCount}) -> ${path.resolve(output)}`);
