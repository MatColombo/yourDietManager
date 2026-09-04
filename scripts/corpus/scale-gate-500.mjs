import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness, assertProductionContract } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy } from '../../src/corpus/ingredientCuration.js';
import { assertProductionRecipePipelinePolicy, buildScaleGate500Report } from '../../src/corpus/productionRecipePipeline.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const strict = process.argv.includes('--strict');
const args = process.argv.slice(2).filter(value => value !== '--strict');
const corpusInput = args[0] || 'public/data'; const output = args[1] || 'corpus/reports/scale-gate-500.json'; const snapshotOutput = args[2] || 'corpus/snapshots/scale-gate-500-current.json';
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, corpusPolicy, contract, curationPolicy, pipelinePolicy, pilotIntake, proposals] = await Promise.all([
  loadCorpusInput(corpusInput), readJson('corpus/policies/v1-default.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/production/v1-recipe-pipeline-policy.json'), readJson('corpus/pilot/v1-pilot-intake.json'), readJson('corpus/pilot/v1-reference-data-proposals.json')
]);
assertProductionContract(contract, corpusPolicy, registry); assertIngredientCurationPolicy(curationPolicy, contract, registry); assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry);
const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry });
const snapshot = await scanCorpus({ policy: corpusPolicy, catalogVersion: corpus.manifest.catalogVersion, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, registry });
registry.assert('recipeCorpusSnapshot', snapshot);
const report = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy, productionReadiness: readiness, intake: pilotIntake, proposals, snapshot, registry });
await Promise.all([writeJson(output, report), writeJson(snapshotOutput, snapshot)]);
console.log(JSON.stringify({ gateId: report.gateId, status: report.status, activeRecipeCount: report.activeRecipeCount, targetActiveRecipes: report.targetActiveRecipes, pilot: report.pilot, blockers: report.blockers.slice(0, 12), output, snapshotOutput }, null, 2));
if (strict && report.status !== 'pass') process.exitCode = 2;
