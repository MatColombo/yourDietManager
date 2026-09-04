import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness, markProductionBatchOutcomes, planPilotIntake, productionContractDigest, resolveProductionIntake } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy, buildPilotWaveReport } from '../../src/corpus/ingredientCuration.js';
import { processCandidateBatch } from '../../src/corpus/recipePipeline.js';
import { buildPilotWaveJob, generatePilotCandidates } from '../../src/corpus/deterministicRecipeGenerator.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const outputRoot = process.argv[3] || 'corpus/staging/production-pilot';
const canonical = process.argv.includes('--canonical');
if (!corpusInput) {
  console.error('Usage: node scripts/corpus/execute-production-pilot.mjs <catalog-data-dir|bundle.json> [outputRoot] [--canonical]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpusPolicy, contract, curationPolicy, proposals, corpus] = await Promise.all([
  readJson('corpus/policies/v1-default.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/pilot/v1-reference-data-proposals.json'), loadCorpusInput(corpusInput)
]);
assertIngredientCurationPolicy(curationPolicy, contract, registry);
const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry });
if (!readiness.readyForPilot) throw new Error(`Production pilot is blocked: ${(readiness.pilotBlockers || readiness.blockers).join('; ')}`);
const contractDigest = await productionContractDigest(contract);
let intake = await planPilotIntake({ contract, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest, registry });
for (const record of intake.records) record.referenceScanStatus = 'complete';
let resolved = await resolveProductionIntake({ intake, contract, taxonomies:corpus.taxonomies || [], taxonomyTerms:corpus.taxonomyTerms || [], ingredientFamilies:corpus.ingredientFamilies, ingredientRevisions:corpus.ingredientRevisions, proposals, registry });
intake = resolved.intake;
if (resolved.proposals.some(item => !['materialized','rejected'].includes(item.status))) throw new Error('Pilot reference resolution created unresolved taxonomy proposals');
if (intake.records.some(record => record.state !== 'ready_for_generation')) throw new Error('Pilot intake did not resolve every candidate to ready_for_generation');
const generated = generatePilotCandidates({ intake, corpus });
const working = structuredClone(corpus);
working.catalogVersion = '1.0.0-production-pilot';
working.manifest = { ...working.manifest, catalogVersion:working.catalogVersion };
const waveReports = [];
const jobs = [];
const results = [];
const waveSize = curationPolicy.pilotExecution.waveSize;
const waveCount = Math.ceil(intake.targetCandidateCount / waveSize);
for (let waveNumber = 1; waveNumber <= waveCount; waveNumber += 1) {
  const job = buildPilotWaveJob({ intake, candidates:generated.candidates, corpus:working, contract, contractDigest, waveNumber, waveSize, targetCatalogVersion:working.catalogVersion });
  registry.assert('recipeGenerationJob', job);
  const ids = new Set(intake.records.slice((waveNumber-1)*waveSize, waveNumber*waveSize).map(record => record.candidateId));
  const candidates = generated.candidates.filter(candidate => ids.has(candidate.candidateId));
  const result = await processCandidateBatch({ job, candidates, policy:corpusPolicy, ingredientFamilies:working.ingredientFamilies, ingredientRevisions:working.ingredientRevisions, existingRecipeVersions:currentRecipeVersions(working), taxonomies:working.taxonomies || [], taxonomyTerms:working.taxonomyTerms || [], registry, productionContext:{ contractId:contract.contractId, contractVersion:contract.contractVersion, intakeId:intake.intakeId }, generatedAt:new Date().toISOString() });
  intake = markProductionBatchOutcomes({ intake, job, result, registry });
  working.recipeFamilies.push(...result.families); working.recipeVersions.push(...result.versions);
  const waveReport = buildPilotWaveReport({ intake, waveNumber, waveSize, proposals:resolved.proposals, productionReadiness:readiness, curationPolicy, registry });
  if (!result.targetMet || result.acceptedCount !== candidates.length || result.rejectedCount !== 0) throw new Error(`Pilot wave ${waveNumber} failed recipe acceptance: accepted=${result.acceptedCount}, rejected=${result.rejectedCount}`);
  if (waveReport.gate !== 'pass') throw new Error(`Pilot wave ${waveNumber} did not close cleanly: ${waveReport.blockers.join('; ')}`);
  jobs.push(job); results.push(result); waveReports.push(waveReport);
  await Promise.all([
    writeJson(path.join(outputRoot, `wave-${String(waveNumber).padStart(2,'0')}-job.json`), job),
    writeJson(path.join(outputRoot, `wave-${String(waveNumber).padStart(2,'0')}-candidates.json`), candidates),
    writeJson(path.join(outputRoot, `wave-${String(waveNumber).padStart(2,'0')}-result.json`), result),
    writeJson(path.join(outputRoot, `wave-${String(waveNumber).padStart(2,'0')}-report.json`), waveReport)
  ]);
}
const accepted = intake.records.filter(record => record.state === 'accepted').length;
const rejected = intake.records.filter(record => record.state === 'rejected').length;
const summary = { schemaVersion:1, pilotId:intake.intakeId, generatedAt:new Date().toISOString(), target:intake.targetCandidateCount, accepted, rejected, terminal:accepted+rejected, waveCount, allWavesPassed:waveReports.every(report => report.gate === 'pass'), unresolvedReferenceRequests:intake.records.flatMap(record=>record.referenceRequests).filter(request=>!['reused','materialized','resolved','rejected'].includes(request.status)).length, generatorDiagnostics:generated.diagnostics };
if (summary.terminal !== summary.target || summary.accepted !== summary.target || !summary.allWavesPassed || summary.unresolvedReferenceRequests !== 0) throw new Error(`Pilot summary gate failed: ${JSON.stringify(summary)}`);
await Promise.all([
  writeJson(path.join(outputRoot,'pilot-intake.json'), intake), writeJson(path.join(outputRoot,'reference-data-proposals.json'), resolved.proposals),
  writeJson(path.join(outputRoot,'pilot-summary.json'), summary), writeJson(path.join(outputRoot,'pilot-corpus-bundle.json'), working)
]);
if (canonical) {
  await writeJson('corpus/pilot/v1-pilot-intake.json', intake);
  await writeJson('corpus/pilot/v1-reference-data-proposals.json', resolved.proposals);
  for (const report of waveReports) await writeJson(`corpus/pilot/reports/wave-${String(report.waveNumber).padStart(2,'0')}.json`, report);
  await writeJson('corpus/pilot/reports/pilot-summary.json', summary);
}
console.log(JSON.stringify(summary, null, 2));
