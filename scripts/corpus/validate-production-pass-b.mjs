import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertIngredientCurationPolicy, ingredientSourcePlan, buildPilotWaveReport } from '../../src/corpus/ingredientCuration.js';
import { assessProductionReadiness, assertProductionContract } from '../../src/corpus/productionCorpus.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, contract, corpusPolicy, curationPolicy, intake, proposals] = await Promise.all([
  loadCorpusInput('public/data'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/policies/v1-default.json'),
  readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/pilot/v1-pilot-intake.json'), readJson('corpus/pilot/v1-reference-data-proposals.json')
]);
assertProductionContract(contract, corpusPolicy, registry);
assertIngredientCurationPolicy(curationPolicy, contract, registry);
const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry, generatedAt: '2026-09-04T14:00:00Z' });
const sourcePlan = ingredientSourcePlan(curationPolicy, contract);
if (sourcePlan.primaryPublishedCount !== 394) throw new Error(`4P-B source inventory drift: expected 394 Foundation Foods, found ${sourcePlan.primaryPublishedCount}`);
if (sourcePlan.minimumSupplementalFromPublishedCount !== 6) throw new Error(`4P-B supplemental source floor drift: expected 6, found ${sourcePlan.minimumSupplementalFromPublishedCount}`);
const wave = buildPilotWaveReport({ intake, waveNumber: 1, waveSize: curationPolicy.pilotExecution.waveSize, proposals, productionReadiness: readiness, curationPolicy, registry, generatedAt: '2026-09-04T14:00:00Z' });
if (!readiness.readyForPilot && wave.gate !== 'blocked') throw new Error(`4P-B wave 1 must be blocked while ingredient/reference readiness is red; got ${wave.gate}`);
if (readiness.readyForPilot && wave.blockers.some(item => item.startsWith('production-readiness:'))) throw new Error(`4P-B wave 1 retained pilot-readiness blockers after readiness became green: ${wave.blockers.join('; ')}`);
await writeJson('corpus/pilot/reports/wave-01.json', wave);
console.log(JSON.stringify({ status: 'PASS', policy: `${curationPolicy.policyId}@${curationPolicy.policyVersion}`, primaryPublishedCount: sourcePlan.primaryPublishedCount, minimumSupplementalFromPublishedCount: sourcePlan.minimumSupplementalFromPublishedCount, currentReadyForPilot: readiness.readyForPilot, wave1Gate: wave.gate }, null, 2));
