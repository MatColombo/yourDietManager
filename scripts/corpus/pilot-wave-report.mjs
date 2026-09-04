import path from 'node:path';
import { access } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { buildPilotWaveReport } from '../../src/corpus/ingredientCuration.js';
import { readJson, writeJson } from './io-lib.mjs';

const waveNumber = Number(process.argv[2] || 1);
const intakeFile = process.argv[3] || 'corpus/pilot/v1-pilot-intake.json';
const proposalsFile = process.argv[4] || 'corpus/pilot/v1-reference-data-proposals.json';
const readinessFile = process.argv[5] || 'corpus/reports/production-readiness.json';
const policyFile = process.argv[6] || 'corpus/curation/v1-ingredient-curation-policy.json';
const outputFile = process.argv[7] || `corpus/pilot/reports/wave-${String(waveNumber).padStart(2, '0')}.json`;
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [intake, curationPolicy] = await Promise.all([readJson(intakeFile), readJson(policyFile)]);
let proposals = []; let readiness = null;
try { await access(proposalsFile); proposals = await readJson(proposalsFile); } catch {}
try { await access(readinessFile); readiness = await readJson(readinessFile); } catch {}
const report = buildPilotWaveReport({ intake, waveNumber, waveSize: curationPolicy.pilotExecution.waveSize, proposals, productionReadiness: readiness, curationPolicy, registry });
await writeJson(outputFile, report);
console.log(JSON.stringify(report, null, 2));
