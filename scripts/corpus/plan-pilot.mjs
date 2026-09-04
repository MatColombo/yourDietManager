import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { planPilotIntake } from '../../src/corpus/productionCorpus.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2] || 'public/data';
const contractFile = process.argv[3] || 'corpus/contracts/v1-production.json';
const outputFile = process.argv[4] || 'corpus/pilot/v1-pilot-intake.json';
const seed = process.argv[5] || 'phase4-production-pilot-v1';
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, contract] = await Promise.all([loadCorpusInput(corpusInput), readJson(contractFile)]);
registry.assert('productionCorpusContract', contract);
const intake = await planPilotIntake({
  contract,
  referenceDataVersion: corpus.manifest?.referenceDataVersion,
  referenceDataDigest: corpus.manifest?.referenceDataDigest,
  seed,
  registry
});
await writeJson(outputFile, intake);
console.log(JSON.stringify({ intakeId: intake.intakeId, targetCandidateCount: intake.targetCandidateCount, outputFile }, null, 2));
