import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness, resolveProductionIntake } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy } from '../../src/corpus/ingredientCuration.js';
import { planNextBatch } from '../../src/corpus/corpusOrchestrator.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';
import { applyIndustrializedBatchToIntake, assertFreshProductionSnapshot, assertProductionRecipePipelinePolicy, buildScaleGate500Report, planProductionJobIntake, processIndustrializedProductionBatch, verifyIndustrializedBatchReport } from '../../src/corpus/productionRecipePipeline.js';
import { generatePortableScaleCandidates } from '../../src/corpus/deterministicRecipeGenerator.js';
import { assertReferenceData } from '../../src/services/referenceDataService.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput=process.argv[2]; const outputRoot=process.argv[3] || 'corpus/staging/scale-batch-001'; const canonical=process.argv.includes('--canonical');
if(!corpusInput){console.error('Usage: node scripts/corpus/execute-first-scale-batch.mjs <pilot-corpus-bundle.json> [outputRoot] [--canonical]');process.exit(2);}
const registry=new SchemaRegistry(async file=>readJson(path.join('schemas',file))); await registry.loadAll();
const [corpus,corpusPolicy,contract,curationPolicy,pipelinePolicy,pilotIntake,proposals]=await Promise.all([
  loadCorpusInput(corpusInput),readJson('corpus/policies/v1-default.json'),readJson('corpus/contracts/v1-production.json'),readJson('corpus/curation/v1-ingredient-curation-policy.json'),readJson('corpus/production/v1-recipe-pipeline-policy.json'),readJson('corpus/pilot/v1-pilot-intake.json'),readJson('corpus/pilot/v1-reference-data-proposals.json')
]);
assertIngredientCurationPolicy(curationPolicy,contract,registry); assertProductionRecipePipelinePolicy(pipelinePolicy,contract,corpusPolicy,curationPolicy,registry);
const readiness=await assessProductionReadiness({contract,policy:corpusPolicy,corpus,registry});
const snapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:corpus.manifest.catalogVersion,recipeFamilies:corpus.recipeFamilies,recipeVersions:corpus.recipeVersions,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,registry});
const beforeGate=buildScaleGate500Report({pipelinePolicy,contract,corpusPolicy,productionReadiness:readiness,intake:pilotIntake,proposals,snapshot,registry});
if(beforeGate.status!=='ready') throw new Error(`First 4P-C batch requires Scale Gate 500 status ready, got ${beforeGate.status}: ${beforeGate.blockers.slice(0,12).join('; ')}`);
const referenceIndex=assertReferenceData(corpus.taxonomies||[],corpus.taxonomyTerms||[],registry);
const planned=await planNextBatch({policy:corpusPolicy,snapshot,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,mode:'focused_expansion',goal:{acceptedAddCount:100,focusMode:'restrict',intentStrategy:'focus_only',focus:{mealArchetypes:['mini_meal'],practicalityTags:['practical_portable']}},seed:`scale-batch-001-${snapshot.contentDigest}`,targetCatalogVersion:'1.0.0-production-scale-001',referenceDataVersion:corpus.manifest.referenceDataVersion,referenceDataDigest:corpus.manifest.referenceDataDigest,referenceIndex,productionContract:contract});
if(planned.jobs.length!==1) throw new Error(`Expected one production job, planner returned ${planned.jobs.length}`);
const job=planned.jobs[0]; registry.assert('recipeGenerationJob',job);
let intake=await planProductionJobIntake({job,contract,registry}); for(const record of intake.records) record.referenceScanStatus='complete';
const resolved=await resolveProductionIntake({intake,contract,taxonomies:corpus.taxonomies||[],taxonomyTerms:corpus.taxonomyTerms||[],ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,proposals,registry}); intake=resolved.intake;
if(intake.records.some(record=>record.state!=='ready_for_generation')) throw new Error('Scale intake did not resolve every candidate to ready_for_generation');
const generated=generatePortableScaleCandidates({job,intake,corpus});
await assertFreshProductionSnapshot({job,snapshot,corpus,corpusPolicy,registry});
const {result,report}=await processIndustrializedProductionBatch({job,candidates:generated.candidates,corpusPolicy,pipelinePolicy,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,existingRecipeVersions:currentRecipeVersions(corpus),taxonomies:corpus.taxonomies||[],taxonomyTerms:corpus.taxonomyTerms||[],registry,productionContext:{contractId:contract.contractId,contractVersion:contract.contractVersion,intakeId:intake.intakeId},generatedAt:new Date().toISOString()});
const updatedIntake=applyIndustrializedBatchToIntake({intake,job,report,registry});
const rejectionCodes=Object.fromEntries([...new Set((result.rejected||[]).map(item=>item.code||'unknown'))].sort().map(code=>[code,(result.rejected||[]).filter(item=>(item.code||'unknown')===code).length]));
const preVerifySummary={schemaVersion:1,batchId:job.jobId,generatedAt:new Date().toISOString(),before:{activeRecipes:snapshot.activeRecipeCount,scaleGate:beforeGate.status},candidateCount:generated.candidates.length,accepted:result.acceptedCount,rejected:result.rejectedCount,reviewBacklog:report.reviewBacklogCount,batchGate:report.batchGate.status,dispositions:report.dispositionCounts,rejectionCodes,jobNutrition:{energyKcal:job.energyKcal,proteinG:job.proteinG,fiberG:job.fiberG},generatorDiagnostics:generated.diagnostics};
await Promise.all([
  writeJson(path.join(outputRoot,'input-snapshot.json'),snapshot),writeJson(path.join(outputRoot,'orchestration-run.json'),planned.run),writeJson(path.join(outputRoot,'job.json'),job),writeJson(path.join(outputRoot,'intake.json'),updatedIntake),writeJson(path.join(outputRoot,'candidates.json'),generated.candidates),writeJson(path.join(outputRoot,'result.json'),result),writeJson(path.join(outputRoot,'batch-report.json'),report),writeJson(path.join(outputRoot,'pre-verify-summary.json'),preVerifySummary)
]);
console.log(JSON.stringify({phase:'first-scale-pre-verify',...preVerifySummary},null,2));
await verifyIndustrializedBatchReport({result,report,pipelinePolicy,registry});
const outputBundle={...corpus,catalogVersion:job.targetCatalogVersion,manifest:{...corpus.manifest,catalogVersion:job.targetCatalogVersion},recipeFamilies:[...corpus.recipeFamilies,...result.families],recipeVersions:[...corpus.recipeVersions,...result.versions]};
const afterReadiness=await assessProductionReadiness({contract,policy:corpusPolicy,corpus:outputBundle,registry});
const afterSnapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:outputBundle.manifest.catalogVersion,recipeFamilies:outputBundle.recipeFamilies,recipeVersions:outputBundle.recipeVersions,ingredientFamilies:outputBundle.ingredientFamilies,ingredientRevisions:outputBundle.ingredientRevisions,registry});
const afterGate=buildScaleGate500Report({pipelinePolicy,contract,corpusPolicy,productionReadiness:afterReadiness,intake:pilotIntake,proposals,snapshot:afterSnapshot,registry});
const summary={schemaVersion:1,batchId:job.jobId,generatedAt:new Date().toISOString(),before:{activeRecipes:snapshot.activeRecipeCount,scaleGate:beforeGate.status},candidateCount:generated.candidates.length,accepted:result.acceptedCount,rejected:result.rejectedCount,reviewBacklog:report.reviewBacklogCount,batchGate:report.batchGate.status,after:{activeRecipes:afterSnapshot.activeRecipeCount,scaleGate:afterGate.status},generatorDiagnostics:generated.diagnostics};
await Promise.all([
  writeJson(path.join(outputRoot,'input-snapshot.json'),snapshot),writeJson(path.join(outputRoot,'orchestration-run.json'),planned.run),writeJson(path.join(outputRoot,'job.json'),job),writeJson(path.join(outputRoot,'intake.json'),updatedIntake),writeJson(path.join(outputRoot,'candidates.json'),generated.candidates),writeJson(path.join(outputRoot,'result.json'),result),writeJson(path.join(outputRoot,'batch-report.json'),report),writeJson(path.join(outputRoot,'output-corpus-bundle.json'),outputBundle),writeJson(path.join(outputRoot,'after-snapshot.json'),afterSnapshot),writeJson(path.join(outputRoot,'after-scale-gate.json'),afterGate),writeJson(path.join(outputRoot,'summary.json'),summary)
]);
if(canonical){
  await writeJson(`corpus/runs/${planned.run.runId}.json`,planned.run); await writeJson(`corpus/jobs/${job.jobId}.json`,job); await writeJson(`corpus/intake/${intake.intakeId}.json`,updatedIntake); await writeJson(`corpus/reports/${report.reportId}.json`,report); await writeJson('corpus/reports/scale-gate-500.json',afterGate); await writeJson('corpus/snapshots/scale-gate-500-current.json',afterSnapshot); await writeJson('corpus/reports/first-scale-batch-summary.json',summary);
}
console.log(JSON.stringify(summary,null,2));
