import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { processCandidateBatch } from '../../src/corpus/recipePipeline.js';
import { buildPhaseBEligibility } from '../../src/corpus/v1PhaseBRoleClassifier.js';
import { generatePhaseBCandidates } from '../../src/corpus/v1PhaseBRecipeGenerator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { readJson, writeJson } from './io-lib.mjs';

const SOURCE='corpus/production/v1-release-bundle.json';
const OUTPUT_DIR='corpus/production/planner-phase-b';
const OUTPUT=`${OUTPUT_DIR}/bundle.json`;
const ELIGIBILITY=`${OUTPUT_DIR}/recipe-eligibility.json`;
const EVIDENCE=`${OUTPUT_DIR}/build-evidence.json`;
const CATALOG_VERSION='1.1.0-planner-phase-b';
const GENERATED_AT='2026-09-07T18:30:00.000Z';
const PIPELINE_VERSION='v1-planner-phase-b-fixed-template-1';

const MATRIX={
  breakfast:[
    {id:'kcal-050-149',min:50,max:149,count:50},{id:'kcal-150-249',min:150,max:249,count:75},{id:'kcal-250-349',min:250,max:349,count:80},
    {id:'kcal-350-449',min:350,max:449,count:75},{id:'kcal-450-599',min:450,max:599,count:50},{id:'kcal-600-699',min:600,max:699,count:20}
  ],
  lunch:[
    {id:'kcal-180-299',min:180,max:299,count:70},{id:'kcal-300-399',min:300,max:399,count:80},{id:'kcal-400-499',min:400,max:499,count:100},
    {id:'kcal-500-599',min:500,max:599,count:90},{id:'kcal-600-699',min:600,max:699,count:60},{id:'kcal-700-849',min:700,max:849,count:40},{id:'kcal-850-949',min:850,max:949,count:10}
  ],
  dinner:[
    {id:'kcal-180-299',min:180,max:299,count:70},{id:'kcal-300-399',min:300,max:399,count:80},{id:'kcal-400-499',min:400,max:499,count:100},
    {id:'kcal-500-599',min:500,max:599,count:90},{id:'kcal-600-699',min:600,max:699,count:60},{id:'kcal-700-849',min:700,max:849,count:40},{id:'kcal-850-949',min:850,max:949,count:10}
  ],
  snack:[
    {id:'kcal-060-119',min:60,max:119,count:50},{id:'kcal-120-179',min:120,max:179,count:70},{id:'kcal-180-239',min:180,max:239,count:70},
    {id:'kcal-240-299',min:240,max:299,count:60},{id:'kcal-300-399',min:300,max:399,count:50}
  ],
  mini_meal:[
    {id:'kcal-080-149',min:80,max:149,count:40},{id:'kcal-150-219',min:150,max:219,count:55},{id:'kcal-220-299',min:220,max:299,count:60},
    {id:'kcal-300-399',min:300,max:399,count:55},{id:'kcal-400-499',min:400,max:499,count:40}
  ]
};

const [source,policy]=await Promise.all([readJson(SOURCE),readJson('corpus/policies/v1-default.json')]);
const registry=new SchemaRegistry(async file=>JSON.parse(await readFile(path.join('schemas',file),'utf8'))); await registry.loadAll();
const ingredientFamilies=source.ingredientFamilies.filter(item=>item.status==='active').sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId));
const currentIds=new Set(ingredientFamilies.map(item=>item.currentRevisionId));
const ingredientRevisions=source.ingredientRevisions.filter(item=>currentIds.has(item.ingredientRevisionId)).sort((a,b)=>a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));
if(ingredientFamilies.length!==600||ingredientRevisions.length!==600) throw new Error(`Phase B requires the vetted 600/600 ingredient base, got ${ingredientFamilies.length}/${ingredientRevisions.length}`);
const eligibility=buildPhaseBEligibility({ingredientFamilies,ingredientRevisions});
if(eligibility.usableIngredientIds.length<300) throw new Error(`Phase B culinary classifier exposed only ${eligibility.usableIngredientIds.length} usable ingredients; require >=300`);
await writeJson(ELIGIBILITY,eligibility);

const recipeFamilies=[]; const recipeVersions=[]; const diagnostics={};
for(const [meal,bands] of Object.entries(MATRIX)){
  diagnostics[meal]={bands:{}};
  for(const band of bands){
    const candidates=generatePhaseBCandidates({meal,band,count:band.count,eligibility,corpus:source,multiplier:10});
    if(candidates.length<band.count) throw new Error(`${meal}/${band.id} generated only ${candidates.length}/${band.count}`);
    const job={
      schemaVersion:1, jobId:`phase-b-${meal}-${band.id}`, targetCatalogVersion:CATALOG_VERSION,
      seed:`phase-b-${meal}-${band.id}-fixed-template-2026-09-07`, pipelineVersion:PIPELINE_VERSION,
      sourceLocale:'it', requiredLocales:['it','en'], targetAcceptedCount:band.count, candidateCount:candidates.length,
      mealArchetypes:[meal], energyKcal:{min:band.min,max:band.max}, proteinG:null,fiberG:null,maxTotalMinutes:null,
      coverageTargets:[], allowedIngredientIds:eligibility.usableIngredientIds, requiredTags:[],forbiddenTags:[],recipeFamilies:[],cuisineFocus:[],practicalityTargets:[],
      diversityTargets:{minDistinctPrimaryIngredients:1,minDistinctIngredientIds:1,maxPrimaryIngredientFrequency:Math.max(25,band.count),maxIngredientPairFrequency:Math.max(20,band.count)}
    };
    const result=await processCandidateBatch({
      job,candidates,policy,ingredientFamilies,ingredientRevisions,existingRecipeVersions:recipeVersions,
      taxonomies:source.taxonomies||[],taxonomyTerms:source.taxonomyTerms||[],registry,generatedAt:GENERATED_AT
    });
    if(!result.targetMet||result.acceptedCount!==band.count){
      const byCode=Object.fromEntries([...new Set(result.rejected.map(item=>item.code))].map(code=>[code,result.rejected.filter(item=>item.code===code).length]));
      throw new Error(`Phase B ${meal}/${band.id} accepted ${result.acceptedCount}/${band.count}; generated=${candidates.length}; rejected=${JSON.stringify(byCode)}`);
    }
    recipeFamilies.push(...result.families); recipeVersions.push(...result.versions);
    diagnostics[meal].bands[band.id]={target:band.count,generated:candidates.length,accepted:result.acceptedCount,rejected:result.rejectedCount,warnings:result.warnings.length,energy:{min:Math.min(...result.versions.map(v=>v.calculatedNutrition.energyKcal)),max:Math.max(...result.versions.map(v=>v.calculatedNutrition.energyKcal))}};
  }
}
recipeFamilies.sort((a,b)=>a.recipeId.localeCompare(b.recipeId)); recipeVersions.sort((a,b)=>a.recipeVersionId.localeCompare(b.recipeVersionId));
const targetRecipes=Object.values(MATRIX).flat().reduce((sum,b)=>sum+b.count,0);
if(recipeFamilies.length!==targetRecipes||recipeVersions.length!==targetRecipes) throw new Error(`Phase B requires ${targetRecipes}/${targetRecipes} recipes, got ${recipeFamilies.length}/${recipeVersions.length}`);
const usedIngredientIds=new Set(recipeVersions.flatMap(v=>v.ingredientLines.map(line=>line.ingredientId)));
if(usedIngredientIds.size<250) throw new Error(`Phase B recipes use only ${usedIngredientIds.size} distinct ingredients; require >=250`);
const recipeDigest=await sha256Json(recipeVersions.map(item=>({recipeVersionId:item.recipeVersionId,contentHash:item.contentHash})));
const coverage={};
for(const meal of Object.keys(MATRIX)){
  const versions=recipeVersions.filter(v=>v.mealArchetypes.includes(meal));
  coverage[meal]={count:versions.length,minEnergyKcal:Math.min(...versions.map(v=>v.calculatedNutrition.energyKcal)),maxEnergyKcal:Math.max(...versions.map(v=>v.calculatedNutrition.energyKcal)),bands:Object.fromEntries(MATRIX[meal].map(b=>[b.id,versions.filter(v=>v.calculatedNutrition.energyKcal>=b.min&&v.calculatedNutrition.energyKcal<=b.max).length]))};
}
const bundle={
  manifest:{schemaVersion:1,catalogVersion:CATALOG_VERSION,referenceDataVersion:source.manifest?.referenceDataVersion||'1.0.0',referenceDataDigest:source.manifest?.referenceDataDigest||null,source:{type:'planner-phase-b-rebuild',baseCatalogVersion:source.manifest?.catalogVersion||'1.0.0',eligibilityPolicy:`${eligibility.policyId}@${eligibility.policyVersion}`,quantityStrategy:'fixed-template-only'},counts:{ingredientFamilies:600,ingredientRevisions:600,recipeFamilies:targetRecipes,recipeVersions:targetRecipes},recipeDigest,builtAt:GENERATED_AT},
  taxonomies:source.taxonomies||[],taxonomyTerms:source.taxonomyTerms||[],ingredientFamilies,ingredientRevisions,recipeFamilies,recipeVersions,catalogVersion:CATALOG_VERSION
};
await writeJson(OUTPUT,bundle);
await writeJson(EVIDENCE,{schemaVersion:1,status:'planner_validation_corpus',builtAt:GENERATED_AT,catalogVersion:CATALOG_VERSION,pipelineVersion:PIPELINE_VERSION,quantityStrategy:'fixed-template-only',servingScalingAllowed:false,energyFittingByIngredientAmountAllowed:false,counts:bundle.manifest.counts,usableIngredientCount:eligibility.usableIngredientIds.length,usedIngredientCount:usedIngredientIds.size,recipeDigest,coverage,diagnostics});
console.log(JSON.stringify({output:OUTPUT,catalogVersion:CATALOG_VERSION,counts:bundle.manifest.counts,usableIngredientCount:eligibility.usableIngredientIds.length,usedIngredientCount:usedIngredientIds.size,recipeDigest,coverage},null,2));
