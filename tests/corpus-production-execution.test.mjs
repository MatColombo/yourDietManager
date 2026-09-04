import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { planPilotIntake, productionContractDigest, resolveProductionIntake, markProductionBatchOutcomes } from '../src/corpus/productionCorpus.js';
import { buildPilotWaveReport } from '../src/corpus/ingredientCuration.js';
import { buildPilotWaveJob, generatePilotCandidates, generatePortableScaleCandidates, pilotIngredientDiagnostics } from '../src/corpus/deterministicRecipeGenerator.js';
import { processCandidateBatch } from '../src/corpus/recipePipeline.js';
import { processIndustrializedProductionBatch } from '../src/corpus/productionRecipePipeline.js';
import { readJson } from '../scripts/corpus/io-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const GROUPS=['food_group_vegetables','food_group_fruit','food_group_fish_seafood','food_group_poultry','food_group_meat','food_group_legumes','food_group_grains','food_group_pasta_rice_cereals','food_group_dairy_milk_yogurt','food_group_cheese','food_group_eggs','food_group_nuts_seeds','food_group_fats_oils','food_group_herbs_spices'];
function syntheticCorpus(taxonomies,taxonomyTerms){
  const ingredientFamilies=[]; const ingredientRevisions=[]; const createdAt='2026-09-04T16:00:00Z';
  for(const group of GROUPS) for(let i=1;i<=22;i+=1){
    const id=`ing_test_${group.replace('food_group_','')}_${String(i).padStart(2,'0')}`; const rid=`${id}_r1`;
    ingredientFamilies.push({schemaVersion:1,ingredientId:id,origin:'base',currentRevisionId:rid,status:'active',createdAt,updatedAt:createdAt});
    ingredientRevisions.push({schemaVersion:1,ingredientRevisionId:rid,ingredientId:id,revisionNumber:1,origin:'base',catalogVersion:'test-production',i18n:{it:{name:`it${group.replace('food_group_','').replaceAll('_','')}${i}`,aliases:[]},en:{name:`en${group.replace('food_group_','').replaceAll('_','')}${i}`,aliases:[]}},basis:{amount:100,unit:'g',state:'as_sold'},nutrition:{energyKcal:98,proteinG:5,carbsG:15,fatG:2,fiberG:3},taxonomy:{foodGroup:group,foodSubgroup:null,flavorProfile:'flavor_neutral',mealArchetypes:['breakfast','lunch','dinner','snack','mini_meal']},allergenIds:[],conversions:[],source:{type:'imported',label:'Synthetic test source',reference:null,sourceRecordId:id,checkedAt:createdAt,licenseNote:'Test only'},quality:{status:'curated',confidence:'high',notes:'Test only'},contentHash:'a'.repeat(64),createdAt});
  }
  return {catalogVersion:'test-production',manifest:{catalogVersion:'test-production',referenceDataVersion:'1.0.0',referenceDataDigest:'56f3949bd1c0348f8fe65861ebcda23c2a198805cd2e9f70b00610a328753b52'},taxonomies,taxonomyTerms,ingredientFamilies,ingredientRevisions,recipeFamilies:[],recipeVersions:[]};
}
async function fixture(){
  const registry=new SchemaRegistry(async file=>readJson(path.join(root,'schemas',file))); await registry.loadAll();
  const [contract,policy,curationPolicy,taxonomies,taxonomyTerms]=await Promise.all([readJson(path.join(root,'corpus/contracts/v1-production.json')),readJson(path.join(root,'corpus/policies/v1-default.json')),readJson(path.join(root,'corpus/curation/v1-ingredient-curation-policy.json')),readJson(path.join(root,'public/data/reference-data/taxonomies-0001.json')),readJson(path.join(root,'public/data/reference-data/taxonomy-terms-0001.json'))]);
  return {registry,contract,policy,curationPolicy,corpus:syntheticCorpus(taxonomies,taxonomyTerms)};
}

test('deterministic pilot generator covers every frozen pilot stratum using curated/high ingredients only',async()=>{
  const {registry,contract,corpus}=await fixture();
  const intake=await planPilotIntake({contract,referenceDataVersion:corpus.manifest.referenceDataVersion,referenceDataDigest:corpus.manifest.referenceDataDigest,createdAt:'2026-09-04T16:01:00Z',registry});
  const generated=generatePilotCandidates({intake,corpus});
  assert.equal(generated.candidates.length,120); assert.deepEqual(pilotIngredientDiagnostics(corpus).missingGroups,[]);
  assert.equal(new Set(generated.candidates.map(item=>item.candidateId)).size,120);
  for(const candidate of generated.candidates){assert.equal(candidate.culinaryReview.status,'approved');assert.ok(candidate.ingredientLines.length>=3);assert.ok(candidate.i18n.it.title);assert.ok(candidate.i18n.en.title);}
});

test('six deterministic pilot waves close with 120 accepted candidates and zero unresolved references',async()=>{
  const {registry,contract,policy,curationPolicy,corpus}=await fixture(); const contractDigest=await productionContractDigest(contract);
  let intake=await planPilotIntake({contract,referenceDataVersion:corpus.manifest.referenceDataVersion,referenceDataDigest:corpus.manifest.referenceDataDigest,createdAt:'2026-09-04T16:02:00Z',registry});
  for(const record of intake.records) record.referenceScanStatus='complete';
  const resolved=await resolveProductionIntake({intake,contract,taxonomies:corpus.taxonomies,taxonomyTerms:corpus.taxonomyTerms,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,proposals:[],registry,resolvedAt:'2026-09-04T16:03:00Z'}); intake=resolved.intake;
  const generated=generatePilotCandidates({intake,corpus}); const working=structuredClone(corpus);
  const readiness={readyForPilot:true,readyForProduction:false,pilotBlockers:[],blockers:[],checks:[]};
  for(let wave=1;wave<=6;wave+=1){
    const job=buildPilotWaveJob({intake,candidates:generated.candidates,corpus:working,contract,contractDigest,waveNumber:wave,waveSize:20,targetCatalogVersion:'test-production'}); registry.assert('recipeGenerationJob',job);
    const ids=new Set(intake.records.slice((wave-1)*20,wave*20).map(r=>r.candidateId)); const candidates=generated.candidates.filter(c=>ids.has(c.candidateId));
    const result=await processCandidateBatch({job,candidates,policy,ingredientFamilies:working.ingredientFamilies,ingredientRevisions:working.ingredientRevisions,existingRecipeVersions:working.recipeVersions,taxonomies:working.taxonomies,taxonomyTerms:working.taxonomyTerms,registry,productionContext:{contractId:contract.contractId,contractVersion:contract.contractVersion,intakeId:intake.intakeId},generatedAt:`2026-09-04T16:${String(10+wave).padStart(2,'0')}:00Z`});
    assert.equal(result.acceptedCount,20,JSON.stringify(result.rejected.slice(0,3))); assert.equal(result.rejectedCount,0);
    intake=markProductionBatchOutcomes({intake,job,result,processedAt:`2026-09-04T16:${String(20+wave).padStart(2,'0')}:00Z`,registry}); working.recipeFamilies.push(...result.families); working.recipeVersions.push(...result.versions);
    const report=buildPilotWaveReport({intake,waveNumber:wave,waveSize:20,proposals:[],productionReadiness:readiness,curationPolicy,registry,generatedAt:`2026-09-04T16:${String(30+wave).padStart(2,'0')}:00Z`}); assert.equal(report.gate,'pass');
  }
  assert.equal(intake.records.filter(r=>r.state==='accepted').length,120); assert.equal(intake.records.flatMap(r=>r.referenceRequests).length,0);
});

test('portable scale generator can feed a 100-accepted industrialized batch without review backlog',async()=>{
  const {registry,contract,policy,corpus}=await fixture();
  const job={schemaVersion:1,jobId:'test-scale-001',targetCatalogVersion:'test-production',referenceDataVersion:corpus.manifest.referenceDataVersion,referenceDataDigest:corpus.manifest.referenceDataDigest,seed:'test-scale',pipelineVersion:contract.pipelineVersion,sourceLocale:'en',requiredLocales:['it','en'],targetAcceptedCount:100,candidateCount:125,mealArchetypes:['mini_meal'],energyKcal:{min:150,max:499},proteinG:null,fiberG:null,maxTotalMinutes:null,recipeFamilies:[],cuisineFocus:[],practicalityTargets:['practical_portable'],requiredTags:[],forbiddenTags:[],preferredUnderusedIngredientIds:[],diversityTargets:{minDistinctPrimaryIngredients:15,minDistinctIngredientIds:40,maxPrimaryIngredientFrequency:15,maxIngredientPairFrequency:8},coverageTargets:[{targetId:'meal-mini_meal-coverage',key:'mini_meal',dimension:'meal_archetype',criteria:[{dimension:'meal_archetype',key:'mini_meal'}],desiredAcceptedGain:100},{targetId:'practical-portable-coverage',key:'practical_portable',dimension:'practicality',criteria:[{dimension:'practicality',key:'practical_portable'}],desiredAcceptedGain:100}],allowedIngredientIds:corpus.ingredientFamilies.map(f=>f.ingredientId),orchestration:{runId:'test-run',inputSnapshotId:'test-snapshot',policyId:policy.policyId,policyVersion:policy.policyVersion,plannedPriority:1,targetIds:['meal-mini_meal-coverage','practical-portable-coverage'],reasons:['test']},productionContract:{contractId:contract.contractId,contractVersion:contract.contractVersion,contractDigest:'b'.repeat(64)}}; registry.assert('recipeGenerationJob',job);
  const intake={schemaVersion:1,intakeId:'scale-test-intake',contractId:contract.contractId,contractVersion:contract.contractVersion,seed:job.seed,referenceDataVersion:job.referenceDataVersion,referenceDataDigest:job.referenceDataDigest,targetCandidateCount:125,records:Array.from({length:125},(_,i)=>({candidateId:`scale-test-${String(i+1).padStart(3,'0')}`,stratumId:job.jobId,state:'ready_for_generation',referenceScanStatus:'complete',concept:{mealArchetypes:['mini_meal'],focus:['test'],rationale:'test'},referenceRequests:[],jobId:null,generatedAt:null,outcome:null,audit:[]})),createdAt:'2026-09-04T16:40:00Z',updatedAt:'2026-09-04T16:40:00Z'}; registry.assert('productionCorpusIntake',intake);
  const generated=generatePortableScaleCandidates({job,intake,corpus}); assert.equal(generated.candidates.length,125);
  const pipelinePolicy=await readJson(path.join(root,'corpus/production/v1-recipe-pipeline-policy.json'));
  const processed=await processIndustrializedProductionBatch({job,candidates:generated.candidates,corpusPolicy:policy,pipelinePolicy,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,existingRecipeVersions:[],taxonomies:corpus.taxonomies,taxonomyTerms:corpus.taxonomyTerms,registry,productionContext:{contractId:contract.contractId,contractVersion:contract.contractVersion,intakeId:intake.intakeId},generatedAt:'2026-09-04T16:41:00Z'});
  assert.equal(processed.report.batchGate.status,'pass',JSON.stringify(processed.report.batchGate)); assert.equal(processed.result.acceptedCount,100); assert.equal(processed.report.reviewBacklogCount,0);
});
