import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertProductionContract, planPilotIntake, productionContractDigest } from '../../src/corpus/productionCorpus.js';
import { loadCorpusInput, readJson } from './io-lib.mjs';

const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [contract, policy, corpus] = await Promise.all([
  readJson('corpus/contracts/v1-production.json'),
  readJson('corpus/policies/v1-default.json'),
  loadCorpusInput('public/data')
]);
assertProductionContract(contract, policy, registry);
const digest = await productionContractDigest(contract);
if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Production contract digest is not SHA-256');
const intake = await planPilotIntake({
  contract,
  referenceDataVersion: corpus.manifest.referenceDataVersion,
  referenceDataDigest: corpus.manifest.referenceDataDigest,
  seed: 'phase4p-a-contract-validation',
  createdAt: '2026-09-04T13:30:00Z',
  registry
});
if (intake.records.length !== contract.pilot.targetCandidates) throw new Error('Pilot intake size does not match contract');
if (intake.records.some(record => record.referenceScanStatus !== 'pending' || record.state !== 'discovered')) throw new Error('Fresh pilot slots must start discovered with pending reference scan');
console.log(`Phase 4P-A contract/pilot infrastructure: PASS (${intake.records.length} pilot slots, contract ${digest.slice(0, 12)})`);
