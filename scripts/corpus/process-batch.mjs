import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { processCandidateBatch } from '../../src/corpus/recipePipeline.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const policyFile = process.argv[3];
const jobFile = process.argv[4];
const candidatesFile = process.argv[5];
const output = process.argv[6] || 'corpus/staging/batch-result.json';
if (!corpusInput || !policyFile || !jobFile || !candidatesFile) {
  console.error('Usage: node scripts/corpus/process-batch.mjs <catalog-data-dir|bundle.json> <policy.json> <job.json> <candidates.json> [output.json]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, policy, job, candidates] = await Promise.all([loadCorpusInput(corpusInput), readJson(policyFile), readJson(jobFile), readJson(candidatesFile)]);
registry.assert('recipeCorpusPolicy', policy); registry.assert('recipeGenerationJob', job);
if (!Array.isArray(candidates)) throw new Error('Candidate file must contain a JSON array');
const result = await processCandidateBatch({ job, candidates, policy, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, existingRecipeVersions: currentRecipeVersions(corpus), taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], registry });
await writeJson(output, result);
console.log(JSON.stringify({ jobId: result.jobId, candidateCount: result.candidateCount, acceptedCount: result.acceptedCount, rejectedCount: result.rejectedCount, targetMet: result.targetMet, diversityPassed: result.diversityPassed, rejectedByCode: Object.fromEntries([...new Set(result.rejected.map(item => item.code))].sort().map(code => [code, result.rejected.filter(item => item.code === code).length])) }, null, 2));
if (!result.targetMet || !result.diversityPassed) process.exitCode = 3;
