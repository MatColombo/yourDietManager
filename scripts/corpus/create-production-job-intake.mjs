import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { planProductionJobIntake } from '../../src/corpus/productionRecipePipeline.js';
import { readJson, writeJson } from './io-lib.mjs';

const jobFile = process.argv[2];
const scaleGateFile = process.argv[3] || 'corpus/reports/scale-gate-500.json';
const contractFile = process.argv[4] || 'corpus/contracts/v1-production.json';
const output = process.argv[5] || (jobFile ? `corpus/intake/${path.basename(jobFile, '.json')}-intake.json` : null);
if (!jobFile) {
  console.error('Usage: node scripts/corpus/create-production-job-intake.mjs <job.json> [scale-gate-report.json] [contract.json] [output-intake.json]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [job, scaleGate, contract] = await Promise.all([readJson(jobFile), readJson(scaleGateFile), readJson(contractFile)]);
registry.assert('recipeGenerationJob', job); registry.assert('productionScaleGateReport', scaleGate); registry.assert('productionCorpusContract', contract);
if (scaleGate.status === 'blocked') throw new Error(`4P-C intake creation blocked by scale gate: ${scaleGate.blockers.slice(0, 8).join('; ')}`);
const intake = await planProductionJobIntake({ job, contract, registry });
await writeJson(output, intake);
console.log(JSON.stringify({ intakeId: intake.intakeId, jobId: job.jobId, candidates: intake.targetCandidateCount, output }, null, 2));
