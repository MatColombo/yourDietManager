import path from 'node:path';
import { access } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assessProductionReadiness, resolveProductionIntake } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy } from '../../src/corpus/ingredientCuration.js';
import { planNextBatch } from '../../src/corpus/corpusOrchestrator.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';
import { assertControlledScalePlan, controlledScaleCheckpoint, hardCoverageAtGate } from '../../src/corpus/controlledScale.js';
import { applyIndustrializedBatchToIntake, assertFreshProductionSnapshot, assertProductionRecipePipelinePolicy, buildScaleGate500Report, planProductionJobIntake, processIndustrializedProductionBatch, verifyIndustrializedBatchReport } from '../../src/corpus/productionRecipePipeline.js';
import { generateControlledScaleCandidates } from '../../src/corpus/deterministicRecipeGenerator.js';
import { assertReferenceData } from '../../src/services/referenceDataService.js';
import { currentRecipeVersions, loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

function option(name, fallback) {
  const prefix=`--${name}=`; const found=process.argv.find(value=>value.startsWith(prefix)); return found ? found.slice(prefix.length) : fallback;
}
function rejectionCodes(result) {
  const out={}; for(const item of result.rejected||[]) out[item.code||'unknown']=(out[item.code||'unknown']||0)+1; return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
}
function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_-]+/g,'-'); }

const corpusInput=process.argv[2];
const outputRoot=process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'corpus/staging/controlled-scale-500';
const canonical=process.argv.includes('--canonical');
const planFile=option('plan','corpus/production/v1-controlled-scale-500-plan.json');
const pilotFile=option('pilot-intake','corpus/pilot/v1-pilot-intake.json');
const proposalsFile=option('proposals','corpus/pilot/v1-reference-data-proposals.json');
const trancheOption=option('tranche',null);
if(!corpusInput){ console.error('Usage: node scripts/corpus/execute-controlled-scale-500.mjs <working-bundle.json> [outputRoot] [--canonical] [--tranche=1|2|3] [--plan=...] [--pilot-intake=...] [--proposals=...]'); process.exit(2); }

const registry=new SchemaRegistry(async file=>readJson(path.join('schemas',file))); await registry.loadAll();
const [plan,corpusPolicy,contract,curationPolicy,pipelinePolicy,pilotIntake,proposals]=await Promise.all([
  readJson(planFile),readJson('corpus/policies/v1-default.json'),readJson('corpus/contracts/v1-production.json'),readJson('corpus/curation/v1-ingredient-curation-policy.json'),readJson('corpus/production/v1-recipe-pipeline-policy.json'),readJson(pilotFile),readJson(proposalsFile)
]);
const planDiagnostics=assertControlledScalePlan(plan,contract,corpusPolicy,pipelinePolicy,registry);
assertIngredientCurationPolicy(curationPolicy,contract,registry); assertProductionRecipePipelinePolicy(pipelinePolicy,contract,corpusPolicy,curationPolicy,registry);
let corpus=await loadCorpusInput(corpusInput); const referenceIndex=assertReferenceData(corpus.taxonomies||[],corpus.taxonomyTerms||[],registry);
let snapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:corpus.manifest.catalogVersion,...corpus,registry});
let readiness=await assessProductionReadiness({contract,policy:corpusPolicy,corpus,registry});
let gate=buildScaleGate500Report({pipelinePolicy,contract,corpusPolicy,productionReadiness:readiness,intake:pilotIntake,proposals,snapshot,registry});

if(snapshot.activeRecipeCount>=plan.targetActiveRecipes){
  if(gate.status!=='pass') throw new Error(`Controlled scale input already has ${snapshot.activeRecipeCount} recipes but Scale Gate 500 is ${gate.status}: ${gate.blockers.join('; ')}`);
  const summary={schemaVersion:1,planId:plan.planId,planVersion:plan.planVersion,status:'already_complete',activeRecipeCount:snapshot.activeRecipeCount,gateStatus:gate.status,generatedAt:new Date().toISOString()};
  await Promise.all([writeJson(path.join(outputRoot,'final-working-bundle.json'),corpus),writeJson(path.join(outputRoot,'final-snapshot.json'),snapshot),writeJson(path.join(outputRoot,'final-scale-gate.json'),gate),writeJson(path.join(outputRoot,'summary.json'),summary)]);
  console.log(JSON.stringify(summary,null,2)); process.exit(0);
}
const selectedIndices=trancheOption==null ? plan.tranches.map((_,index)=>index) : [Number(trancheOption)-1];
if(selectedIndices.some(index=>!Number.isInteger(index)||index<0||index>=plan.tranches.length)) throw new Error(`--tranche must be between 1 and ${plan.tranches.length}`);
const firstSelected=selectedIndices[0];
const expectedStart=plan.startMinimumActiveRecipes + plan.tranches.slice(0,firstSelected).reduce((total,tranche)=>total+tranche.targetAcceptedCount,0);
if(snapshot.activeRecipeCount!==expectedStart) throw new Error(`Controlled scale tranche ${firstSelected+1} requires exactly ${expectedStart} active recipes at start; got ${snapshot.activeRecipeCount}. Refuse ambiguous partial resume.`);
if(gate.status!=='ready') throw new Error(`Controlled scale requires Scale Gate 500 ready at start; got ${gate.status}: ${gate.blockers.slice(0,20).join('; ')}`);

const baseline={snapshotId:snapshot.snapshotId,activeRecipeCount:snapshot.activeRecipeCount,gateStatus:gate.status,hardCoverage:hardCoverageAtGate({snapshot,corpusPolicy,targetActiveRecipes:plan.targetActiveRecipes,releaseReferenceRecipeCount:pipelinePolicy.scaleGate500.releaseReferenceRecipeCount})};
await writeJson(path.join(outputRoot,'baseline.json'),baseline);
const trancheSummaries=[]; const canonicalArtifacts=[];

for(const trancheIndex of selectedIndices){
  const tranche=plan.tranches[trancheIndex]; const trancheRoot=path.join(outputRoot,`${String(trancheIndex+1).padStart(2,'0')}-${safeId(tranche.trancheId)}`);
  const beforeSnapshot=snapshot; const batchSummaries=[];
  for(let cellIndex=0; cellIndex<tranche.cells.length; cellIndex+=1){
    const cell=tranche.cells[cellIndex]; const jobRoot=path.join(trancheRoot,`${String(cellIndex+1).padStart(2,'0')}-${safeId(cell.cellId)}`);
    const targetCatalogVersion='1.0.0-production-scale-500';
    const seed=`${plan.planId}:${plan.planVersion}:${tranche.trancheId}:${cell.cellId}:${snapshot.contentDigest}`;
    const planned=await planNextBatch({policy:corpusPolicy,snapshot,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,mode:'focused_expansion',goal:{acceptedAddCount:cell.acceptedCount,focusMode:'restrict',intentStrategy:'focus_only',focus:{mealArchetypes:[cell.mealArchetype],energyBandIds:[cell.energyBandId]}},seed,targetCatalogVersion,referenceDataVersion:corpus.manifest.referenceDataVersion,referenceDataDigest:corpus.manifest.referenceDataDigest,referenceIndex,productionContract:contract});
    if(planned.jobs.length!==1) throw new Error(`${cell.cellId}: expected one job, planner returned ${planned.jobs.length}`);
    const job=planned.jobs[0]; registry.assert('recipeGenerationJob',job);
    if(job.targetAcceptedCount!==cell.acceptedCount) throw new Error(`${cell.cellId}: planner target ${job.targetAcceptedCount} does not equal controlled cell target ${cell.acceptedCount}`);
    if(job.mealArchetypes.length!==1 || job.mealArchetypes[0]!==cell.mealArchetype) throw new Error(`${cell.cellId}: planner meal focus drifted`);
    const energyBand=(corpusPolicy.energyBands||[]).find(item=>item.bandId===cell.energyBandId);
    if(!energyBand || Number(job.energyKcal.min)!==Number(energyBand.min) || Number(job.energyKcal.max)!==Number(energyBand.max)) throw new Error(`${cell.cellId}: planner energy focus drifted from ${cell.energyBandId}`);
    let intake=await planProductionJobIntake({job,contract,registry}); for(const record of intake.records) record.referenceScanStatus='complete';
    const resolved=await resolveProductionIntake({intake,contract,taxonomies:corpus.taxonomies||[],taxonomyTerms:corpus.taxonomyTerms||[],ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,proposals,registry}); intake=resolved.intake;
    if(intake.records.some(record=>record.state!=='ready_for_generation')) throw new Error(`${cell.cellId}: intake did not resolve every candidate to ready_for_generation`);
    const generated=generateControlledScaleCandidates({job,intake,corpus});
    await assertFreshProductionSnapshot({job,snapshot,corpus,corpusPolicy,registry});
    const {result,report}=await processIndustrializedProductionBatch({job,candidates:generated.candidates,corpusPolicy,pipelinePolicy,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,existingRecipeVersions:currentRecipeVersions(corpus),taxonomies:corpus.taxonomies||[],taxonomyTerms:corpus.taxonomyTerms||[],registry,productionContext:{contractId:contract.contractId,contractVersion:contract.contractVersion,intakeId:intake.intakeId},generatedAt:new Date().toISOString()});
    const updatedIntake=applyIndustrializedBatchToIntake({intake,job,report,registry});
    const preVerify={schemaVersion:1,planId:plan.planId,trancheId:tranche.trancheId,cellId:cell.cellId,jobId:job.jobId,candidateCount:generated.candidates.length,accepted:result.acceptedCount,rejected:result.rejectedCount,reviewBacklog:report.reviewBacklogCount,batchGate:report.batchGate.status,dispositions:report.dispositionCounts,rejectionCodes:rejectionCodes(result),generatorDiagnostics:generated.diagnostics,generatedAt:new Date().toISOString()};
    await Promise.all([writeJson(path.join(jobRoot,'input-snapshot.json'),snapshot),writeJson(path.join(jobRoot,'orchestration-run.json'),planned.run),writeJson(path.join(jobRoot,'job.json'),job),writeJson(path.join(jobRoot,'intake.json'),updatedIntake),writeJson(path.join(jobRoot,'candidates.json'),generated.candidates),writeJson(path.join(jobRoot,'result.json'),result),writeJson(path.join(jobRoot,'batch-report.json'),report),writeJson(path.join(jobRoot,'pre-verify-summary.json'),preVerify)]);
    console.log(JSON.stringify({phase:'controlled-scale-cell-pre-verify',...preVerify},null,2));
    await verifyIndustrializedBatchReport({result,report,pipelinePolicy,registry});
    if(result.acceptedCount!==cell.acceptedCount) throw new Error(`${cell.cellId}: accepted ${result.acceptedCount}, expected ${cell.acceptedCount}`);
    if(plan.requireZeroReviewBacklog && report.reviewBacklogCount!==0) throw new Error(`${cell.cellId}: review backlog ${report.reviewBacklogCount}`);
    corpus={...corpus,catalogVersion:targetCatalogVersion,manifest:{...corpus.manifest,catalogVersion:targetCatalogVersion,pipelineVersion:contract.pipelineVersion},recipeFamilies:[...corpus.recipeFamilies,...result.families],recipeVersions:[...corpus.recipeVersions,...result.versions]};
    const afterJobSnapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:corpus.manifest.catalogVersion,...corpus,registry});
    const batchSummary={...preVerify,afterActiveRecipes:afterJobSnapshot.activeRecipeCount,afterSnapshotId:afterJobSnapshot.snapshotId}; batchSummaries.push(batchSummary);
    await Promise.all([writeJson(path.join(jobRoot,'after-snapshot.json'),afterJobSnapshot),writeJson(path.join(jobRoot,'summary.json'),batchSummary)]);
    canonicalArtifacts.push({run:planned.run,job,intake:updatedIntake,report}); snapshot=afterJobSnapshot;
  }
  readiness=await assessProductionReadiness({contract,policy:corpusPolicy,corpus,registry});
  snapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:corpus.manifest.catalogVersion,...corpus,registry});
  gate=buildScaleGate500Report({pipelinePolicy,contract,corpusPolicy,productionReadiness:readiness,intake:pilotIntake,proposals,snapshot,registry});
  const checkpoint=controlledScaleCheckpoint({plan,tranche,beforeSnapshot,afterSnapshot:snapshot,gate,batchSummaries,corpusPolicy,pipelinePolicy});
  await Promise.all([writeJson(path.join(trancheRoot,'checkpoint.json'),checkpoint),writeJson(path.join(trancheRoot,'output-corpus-bundle.json'),corpus),writeJson(path.join(trancheRoot,'snapshot.json'),snapshot),writeJson(path.join(trancheRoot,'scale-gate.json'),gate)]);
  console.log(JSON.stringify({phase:'controlled-scale-tranche',trancheId:tranche.trancheId,status:checkpoint.status,afterActiveRecipes:checkpoint.afterActiveRecipes,gateStatus:checkpoint.gateStatus,hardCoverageRemaining:checkpoint.hardCoverageRemaining},null,2));
  if(checkpoint.status!=='pass') throw new Error(`${tranche.trancheId} checkpoint blocked: ${checkpoint.blockers.join('; ')}`);
  trancheSummaries.push(checkpoint);
}

readiness=await assessProductionReadiness({contract,policy:corpusPolicy,corpus,registry});
snapshot=await scanCorpus({policy:corpusPolicy,catalogVersion:corpus.manifest.catalogVersion,...corpus,registry});
gate=buildScaleGate500Report({pipelinePolicy,contract,corpusPolicy,productionReadiness:readiness,intake:pilotIntake,proposals,snapshot,registry});
const expectedEnd=expectedStart + selectedIndices.reduce((total,index)=>total+plan.tranches[index].targetAcceptedCount,0);
if(snapshot.activeRecipeCount!==expectedEnd) throw new Error(`Controlled scale ended with ${snapshot.activeRecipeCount} active recipes, expected ${expectedEnd}`);
const completedFinalTranche=selectedIndices.includes(plan.tranches.length-1);
if(completedFinalTranche && plan.requireGatePassAtCompletion && gate.status!=='pass') throw new Error(`Controlled scale reached ${snapshot.activeRecipeCount} but Scale Gate 500 is ${gate.status}: ${gate.blockers.join('; ')}`);
if(!completedFinalTranche && gate.status!=='ready') throw new Error(`Intermediate controlled scale checkpoint expected gate ready, got ${gate.status}`);
const summary={schemaVersion:1,planId:plan.planId,planVersion:plan.planVersion,status:'pass',selectedTranches:selectedIndices.map(index=>index+1),generatedAt:new Date().toISOString(),baselineActiveRecipes:baseline.activeRecipeCount,finalActiveRecipes:snapshot.activeRecipeCount,acceptedAdded:snapshot.activeRecipeCount-baseline.activeRecipeCount,gateStatus:gate.status,quality:snapshot.quality,similarity:snapshot.similarity,hardCoverageRemaining:hardCoverageAtGate({snapshot,corpusPolicy,targetActiveRecipes:plan.targetActiveRecipes,releaseReferenceRecipeCount:pipelinePolicy.scaleGate500.releaseReferenceRecipeCount}).filter(item=>item.status==='blocked'),readyForProduction:readiness.readyForProduction,productionBlockers:readiness.blockers,tranches:trancheSummaries.map(item=>({trancheId:item.trancheId,accepted:item.accepted,rejected:item.rejected,reviewBacklog:item.reviewBacklog,afterActiveRecipes:item.afterActiveRecipes,gateStatus:item.gateStatus,status:item.status}))};
await Promise.all([writeJson(path.join(outputRoot,'final-working-bundle.json'),corpus),writeJson(path.join(outputRoot,'final-snapshot.json'),snapshot),writeJson(path.join(outputRoot,'final-scale-gate.json'),gate),writeJson(path.join(outputRoot,'final-readiness.json'),readiness),writeJson(path.join(outputRoot,'summary.json'),summary)]);
if(canonical){
  const trancheEvidencePath='corpus/production/evidence/controlled-scale-500-tranches.json';
  const existingTranches=await access(trancheEvidencePath).then(()=>readJson(trancheEvidencePath)).catch(()=>[]);
  const byTrancheId=new Map((Array.isArray(existingTranches)?existingTranches:[]).map(item=>[item.trancheId,item]));
  for(const checkpoint of trancheSummaries) byTrancheId.set(checkpoint.trancheId,checkpoint);
  const cumulativeTranches=plan.tranches.map(item=>byTrancheId.get(item.trancheId)).filter(Boolean);
  const allTranchesComplete=cumulativeTranches.length===plan.tranches.length;
  const cumulativeSummary={...summary,status:allTranchesComplete&&gate.status==='pass'?'pass':'in_progress',selectedTranches:cumulativeTranches.map(item=>plan.tranches.findIndex(t=>t.trancheId===item.trancheId)+1),baselineActiveRecipes:plan.startMinimumActiveRecipes,finalActiveRecipes:snapshot.activeRecipeCount,acceptedAdded:snapshot.activeRecipeCount-plan.startMinimumActiveRecipes,tranches:cumulativeTranches.map(item=>({trancheId:item.trancheId,accepted:item.accepted,rejected:item.rejected,reviewBacklog:item.reviewBacklog,afterActiveRecipes:item.afterActiveRecipes,gateStatus:item.gateStatus,status:item.status}))};
  await Promise.all([writeJson('corpus/production/current-working-bundle.json',corpus),writeJson('corpus/reports/scale-gate-500.json',gate),writeJson('corpus/snapshots/scale-gate-500-current.json',snapshot),writeJson('corpus/production/evidence/controlled-scale-500-summary.json',cumulativeSummary),writeJson(trancheEvidencePath,cumulativeTranches)]);
  for(const artifact of canonicalArtifacts){ await writeJson(`corpus/runs/${artifact.run.runId}.json`,artifact.run); await writeJson(`corpus/jobs/${artifact.job.jobId}.json`,artifact.job); await writeJson(`corpus/intake/${artifact.intake.intakeId}.json`,artifact.intake); await writeJson(`corpus/reports/${artifact.report.reportId}.json`,artifact.report); }
}
console.log(JSON.stringify(summary,null,2));
