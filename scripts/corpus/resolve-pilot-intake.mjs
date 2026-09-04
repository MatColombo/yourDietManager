import path from 'node:path';
import { access } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { resolveProductionIntake } from '../../src/corpus/productionCorpus.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2] || 'public/data';
const contractFile = process.argv[3] || 'corpus/contracts/v1-production.json';
const intakeFile = process.argv[4] || 'corpus/pilot/v1-pilot-intake.json';
const proposalsFile = process.argv[5] || 'corpus/pilot/v1-reference-data-proposals.json';
const outputIntake = process.argv[6] || intakeFile;
const outputProposals = process.argv[7] || proposalsFile;
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, contract, intake] = await Promise.all([loadCorpusInput(corpusInput), readJson(contractFile), readJson(intakeFile)]);
let proposals = [];
try { await access(proposalsFile); proposals = await readJson(proposalsFile); } catch {}
const resolved = await resolveProductionIntake({
  intake,
  contract,
  taxonomies: corpus.taxonomies || [],
  taxonomyTerms: corpus.taxonomyTerms || [],
  ingredientFamilies: corpus.ingredientFamilies || [],
  ingredientRevisions: corpus.ingredientRevisions || [],
  proposals,
  registry
});
await writeJson(outputIntake, resolved.intake);
await writeJson(outputProposals, resolved.proposals);
console.log(JSON.stringify({ intakeId: resolved.intake.intakeId, summary: resolved.summary, proposalCount: resolved.proposals.length }, null, 2));
