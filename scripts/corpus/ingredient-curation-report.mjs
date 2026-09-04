import path from 'node:path';
import { access } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessIngredientCurationBatch } from '../../src/corpus/ingredientCuration.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2] || 'public/data';
const batchFile = process.argv[3] || 'corpus/staging/usda-foundation-review.json';
const policyFile = process.argv[4] || 'corpus/curation/v1-ingredient-curation-policy.json';
const contractFile = process.argv[5] || 'corpus/contracts/v1-production.json';
const outputFile = process.argv[6] || 'corpus/reports/ingredient-curation-readiness.json';
const strict = process.argv.includes('--strict');
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, policy, contract] = await Promise.all([loadCorpusInput(corpusInput), readJson(policyFile), readJson(contractFile)]);
let batch = null;
try { await access(batchFile); batch = await readJson(batchFile); } catch {}
let existingProductionReadyCount = 0;
if (corpus.ingredientFamilies?.length) {
  const revById = new Map(corpus.ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  existingProductionReadyCount = corpus.ingredientFamilies.filter(family => family.status === 'active').filter(family => {
    const revision = revById.get(family.currentRevisionId);
    return revision?.quality?.status === contract.ingredientReadiness.qualityStatus && revision?.quality?.confidence === contract.ingredientReadiness.confidence;
  }).length;
}
const report = assessIngredientCurationBatch({ batch, policy, contract, taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], registry, existingProductionReadyCount });
await writeJson(outputFile, report);
console.log(JSON.stringify(report, null, 2));
if (strict && !report.readyForPilotFoundation) process.exitCode = 2;
