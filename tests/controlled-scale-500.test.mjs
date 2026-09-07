import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { assertControlledScalePlan, controlledScalePlanDiagnostics } from '../src/corpus/controlledScale.js';
import { computeCorpusContentIdentity, scanCorpus } from '../src/corpus/corpusScanner.js';
import { generateControlledScaleCandidates } from '../src/corpus/deterministicRecipeGenerator.js';
import { loadCorpusInput, readJson } from '../scripts/corpus/io-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function registry(){ const value=new SchemaRegistry(async file=>readJson(path.join(root,'schemas',file))); await value.loadAll(); return value; }

function ingredientCorpus(){
  const groups=['food_group_pasta_rice_cereals','food_group_grains','food_group_legumes','food_group_poultry','food_group_fish_seafood','food_group_vegetables','food_group_fats_oils'];
  const ingredientFamilies=[]; const ingredientRevisions=[];
  for(const group of groups) for(let i=1;i<=10;i+=1){
    const ingredientId=`ing_control_${group.replace('food_group_','')}_${i}`; const ingredientRevisionId=`${ingredientId}_r1`;
    ingredientFamilies.push({ingredientId,currentRevisionId:ingredientRevisionId,status:'active'});
    ingredientRevisions.push({ingredientRevisionId,ingredientId,i18n:{it:{name:`IT ${ingredientId}`},en:{name:`EN ${ingredientId}`}},nutrition:{energyKcal:98,proteinG:5,carbsG:15,fatG:2,fiberG:3},taxonomy:{foodGroup:group},quality:{status:'curated',confidence:'high'}});
  }
  return {ingredientFamilies,ingredientRevisions,recipeFamilies:[],recipeVersions:[]};
}

test('controlled-scale schema is mirrored into the public PWA schema surface', async()=>{
  const [source,published]=await Promise.all([readFile(path.join(root,'schemas/controlled-scale-plan.schema.json'),'utf8'),readFile(path.join(root,'public/schemas/controlled-scale-plan.schema.json'),'utf8')]);
  assert.equal(published,source);
});

test('4P-D controlled plan is schema-valid, policy-bound and bridges exactly 220 -> 500 as 100+100+80', async()=>{
  const [r,plan,contract,corpusPolicy,pipelinePolicy]=await Promise.all([
    registry(),readJson(path.join(root,'corpus/production/v1-controlled-scale-500-plan.json')),readJson(path.join(root,'corpus/contracts/v1-production.json')),readJson(path.join(root,'corpus/policies/v1-default.json')),readJson(path.join(root,'corpus/production/v1-recipe-pipeline-policy.json'))
  ]);
  const diagnostics=assertControlledScalePlan(plan,contract,corpusPolicy,pipelinePolicy,r);
  assert.equal(diagnostics.valid,true);
  assert.equal(diagnostics.plannedAcceptedCount,280);
  assert.equal(plan.startMinimumActiveRecipes,220);
  assert.equal(plan.targetActiveRecipes,500);
  assert.deepEqual(plan.tranches.map(item=>item.targetAcceptedCount),[100,100,80]);
  assert.equal(plan.requireZeroReviewBacklog,true);
  assert.equal(plan.requireGatePassAtCompletion,true);
  const broken=structuredClone(plan); broken.tranches[0].cells[0].energyBandId='kcal-typo';
  assert.equal(controlledScalePlanDiagnostics(broken,contract,corpusPolicy,pipelinePolicy).valid,false);
});

test('freshness identity helper reproduces scanCorpus content digest without re-running coverage analysis', async()=>{
  const [r,policy,corpus]=await Promise.all([registry(),readJson(path.join(root,'corpus/policies/v1-default.json')),loadCorpusInput(path.join(root,'corpus/staging/phase4-smoke-base-bundle.json'))]);
  const snapshot=await scanCorpus({policy,catalogVersion:corpus.manifest.catalogVersion,...corpus,registry:r});
  const identity=await computeCorpusContentIdentity({catalogVersion:corpus.manifest.catalogVersion,recipeFamilies:corpus.recipeFamilies,recipeVersions:corpus.recipeVersions,ingredientRevisions:corpus.ingredientRevisions});
  assert.equal(identity.activeRecipeCount,snapshot.activeRecipeCount);
  assert.equal(identity.contentDigest,snapshot.contentDigest);
});

test('controlled-scale generator produces deterministic lunch candidates inside the frozen energy band from curated/high ingredients only',()=>{
  const corpus=ingredientCorpus(); const allowed=corpus.ingredientFamilies.map(item=>item.ingredientId);
  const job={mealArchetypes:['lunch'],energyKcal:{min:300,max:399},proteinG:null,fiberG:null,requiredTags:[],forbiddenTags:[],practicalityTargets:[],recipeFamilies:[],cuisineFocus:[],allowedIngredientIds:allowed,preferredUnderusedIngredientIds:[],diversityTargets:{maxIngredientPairFrequency:4}};
  const intake={records:Array.from({length:8},(_,index)=>({candidateId:`controlled-${index+1}`}))};
  const generated=generateControlledScaleCandidates({job,intake,corpus});
  assert.equal(generated.candidates.length,8);
  assert.equal(generated.diagnostics.generatorVersion,'controlled-scale-generator-v1');
  assert.equal(generated.diagnostics.mealArchetype,'lunch');
  assert.ok(generated.diagnostics.generatedEnergyRangeKcal.min>=300);
  assert.ok(generated.diagnostics.generatedEnergyRangeKcal.max<=399);
  for(const candidate of generated.candidates){
    assert.deepEqual(candidate.mealArchetypes,['lunch']);
    assert.ok(candidate.ingredientLines.length>=4);
    const byId=new Map(corpus.ingredientRevisions.map(item=>[item.ingredientId,item]));
    const energy=candidate.ingredientLines.reduce((total,line)=>total+byId.get(line.ingredientId).nutrition.energyKcal*line.amount/100,0);
    assert.ok(energy>=299.95&&energy<=399.05,`energy=${energy}`);
  }
});

test('pre-freeze controlled-scale writer workflow is retired while the historical runner remains available in Git history/source', async()=>{
  await assert.rejects(readFile(path.join(root,'.github/workflows/controlled-scale-500.yml'),'utf8'), /ENOENT/);
  const runner=await readFile(path.join(root,'scripts/corpus/execute-controlled-scale-500.mjs'),'utf8');
  assert.match(runner,/--tranche/);
  assert.match(runner,/--canonical/);
});

test('split controlled-scale runner accumulates canonical tranche evidence instead of overwriting prior checkpoints', async()=>{
  const runner=await readFile(path.join(root,'scripts/corpus/execute-controlled-scale-500.mjs'),'utf8');
  assert.match(runner,/existingTranches/);
  assert.match(runner,/byTrancheId/);
  assert.match(runner,/cumulativeTranches/);
  assert.match(runner,/allTranchesComplete/);
  assert.match(runner,/Refuse ambiguous partial resume/);
});
