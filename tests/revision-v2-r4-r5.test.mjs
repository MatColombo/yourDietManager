import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { createReplacementPreview, commitReplacement, replacementComponents, commitGeneratedPreview, updateAdherence } from '../src/services/effectivePlanService.js';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import { commitOperation, mutationSnapshot, undoLastOperation } from '../src/services/operationHistoryService.js';
import { stageCrea, stageCiqual, stageUsda, nutrientValue, publicationReadiness } from '../src/corpus/mediterranean/sourceAdapters.js';
import { mediterraneanCoverage } from '../src/corpus/mediterranean/coverage.js';
import { sha256Json } from '../src/lib/crypto.js';

test('R4 T45 component replacement preserves nonselected components byte for byte', () => {
  const current = [{ recipeId:'a',recipeVersionId:'a1',servings:1,custom:'keep' },{ recipeId:'b',recipeVersionId:'b1',servings:1 },{ recipeId:'c',recipeVersionId:'c1',servings:1,notes:'frozen' }];
  const next = replacementComponents(current,[{recipeId:'d',recipeVersionId:'d1'}],1);
  assert.deepEqual(next[0],current[0]); assert.deepEqual(next[2],current[2]); assert.equal(next[1].servings,1); assert.equal(current[1].recipeId,'b');
  assert.throws(() => replacementComponents(current,[],1)); assert.throws(() => replacementComponents(current,[{recipeId:'d'}],7));
});
test('R4 T11/T12 a write after final preview recheck is rejected by transaction expectations', async () => {
  const deps = await plannerFixture(), preview = await createPlanPreview(options,deps);
  const atomic = deps.repo.atomicMutate.bind(deps.repo); let injected = false;
  deps.repo.atomicMutate = async mutation => {
    if (!injected) { injected=true; const config = await deps.repo.get('appConfigs','active'); config.timeZone='Europe/Paris'; await deps.repo.put('appConfigs',config); }
    return atomic(mutation);
  };
  await assert.rejects(commitGeneratedPreview(preview,deps), /Concurrent change|concurrent_change/);
  assert.equal((await deps.repo.getAll('calendarDays')).length,0); assert.equal((await deps.repo.getAll('operations')).length,0);
});
test('R4 T12/T47 persistent command receipt rejects replay after undo', async () => {
  const deps = await planned(); const id=deps.preview.planInstance.planInstanceId;
  const before=mutationSnapshot({metaDelete:['testValue']}); const after=mutationSnapshot({metaSet:{testValue:42}});
  await commitOperation({planInstanceId:id,kind:'adherence_update',before,after,metadata:{commandId:'stable-test-command'}},deps);
  await undoLastOperation(id,deps);
  assert.ok(await deps.repo.getMeta('planCommand:stable-test-command'));
  await assert.rejects(commitOperation({planInstanceId:id,kind:'adherence_update',before,after,metadata:{commandId:'stable-test-command'}},deps), /concurrent_change/);
  assert.equal(await deps.repo.getMeta('testValue'),undefined);
});
test('R4 T40/T45 replacement pagination and component selection are sealed', async () => {
  const deps=await planned(), day=deps.preview.calendarDays[0], slot=day.mealSlots[0];
  const preview=await createReplacementPreview({planInstanceId:day.planInstanceId,calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,componentIndex:0,limit:1},deps);
  assert.ok(preview.candidates.length); assert.equal(preview.candidates.length,1);
  const candidate=preview.candidates[0]; assert.deepEqual(candidate.components.slice(1),slot.recipeComponents.slice(1));
  await assert.rejects(commitReplacement({...preview,choiceId:'forged'},deps));
  const result=await commitReplacement({...preview,choiceId:candidate.choiceId},deps); assert.deepEqual(result.day.mealSlots[0].recipeComponents,candidate.components);
});
test('R4 T40 search with no matches explains bounded search, never proven infeasibility', async () => {
  const deps=await planned(),day=deps.preview.calendarDays[0],slot=day.mealSlots[0];
  const preview=await createReplacementPreview({planInstanceId:day.planInstanceId,calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,query:'zzzznonexistent'},deps);
  assert.equal(preview.total,0); assert.equal(preview.searchStatus,'search_exhausted');
});
test('R4 T11 stale before cannot overwrite an intervening adherence change', async () => {
  const deps=await planned(),day=deps.preview.calendarDays[0],slot=day.mealSlots[0];
  await updateAdherence({planInstanceId:day.planInstanceId,calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,status:'followed',notes:'authoritative'},deps);
  await assert.rejects(commitOperation({planInstanceId:day.planInstanceId,kind:'replace_meal',before:mutationSnapshot({puts:{calendarDays:[day]}}),after:mutationSnapshot({puts:{calendarDays:[day]}})},deps),/concurrent_change/);
  assert.equal((await deps.repo.get('calendarDays',day.calendarDayId)).mealSlots[0].adherenceNotes,'authoritative');
});
const options = { horizon: { startDate: '2026-09-07', endDate: '2026-09-08' }, seed: 'r0-regression', createdAt: '2026-09-11T00:00:00Z', continuationPolicy: { mode: 'prompt', triggerDaysBeforeEnd: 1, extensionDays: 1 } };
async function planned() { const deps = await plannerFixture(); const preview = await createPlanPreview(options, deps); assert.equal(preview.status, 'success'); await commitGeneratedPreview(preview, deps); return { ...deps, preview }; }

const source=JSON.parse(await fs.readFile('data/revision-v2/mediterranean/sources/crea-004000.json','utf8'));
test('R5 T20 traces, absent values and numeric zeros remain different; no implicit unit conversions', async () => {
  assert.equal(nutrientValue('tr','g','test').value,null); assert.equal(nutrientValue('-','g','test').status,'missing'); assert.equal(nutrientValue('0','g','test').status,'zero');
  assert.equal(nutrientValue('<0,1','g','test').upperBound,.1); assert.throws(()=>nutrientValue('<bad','g','test')); assert.throws(()=>nutrientValue(-1,'g','test'));
  const raw=structuredClone(source.raw); raw.nutrients.energyKcal.unit='kJ'; await assert.rejects(stageCrea(raw,source.context),/Unit conversion/);
});
test('R5 T54 real CREA chickpea states retain reported values and source energy definition', async () => {
  const rows=[]; for(const code of ['004000','004005','004010']) { const data=JSON.parse(await fs.readFile(`data/revision-v2/mediterranean/sources/crea-${code}.json`,'utf8')); rows.push(await stageCrea(data.raw,data.context)); }
  assert.deepEqual(rows.map(r=>r.nutrients.energyKcal.value),[343,132,111]); assert.ok(rows.every(r=>r.nutrients.energyKcal.definition==='CREA Southgate energy'));
  assert.equal(rows[2].nutrients.sodiumMg.value,311); assert.ok(rows.every(r=>r.reviews.safety===null));
});
test('R5 T55 approvals are not inferred; changed source or mapping invalidates external review evidence', async () => {
  const record=await stageCrea(source.raw,source.context); assert.equal((await publicationReadiness(record)).publishable,false);
  record.mapping={conceptId:'med_ceci',formId:'med_ceci_1',status:'reviewed'};
  const digest=(await publicationReadiness(record)).reviewDigest;
  // Synthetic human-review envelope exercises gate validation, never enters production staging.
  for(const dimension of ['nutrition','safety','culinary']) record.reviews[dimension]={status:'approved',actorType:'human',reviewer:'SYNTHETIC TEST ONLY',reviewedAt:'2026-09-11',digest,evidence:'fixture'};
  assert.equal((await publicationReadiness(record)).publishable,true);
  record.mapping.formId='med_ceci_2'; assert.equal((await publicationReadiness(record)).publishable,false);
  record.original.nutrients.energyKcal.value=999; assert.ok((await publicationReadiness(record)).reasons.includes('source_digest_mismatch'));
});
test('R5 T53 nominal quotas and pilot are explicit; planning entries do not count as published',async()=>{
  const manifest=JSON.parse(await fs.readFile('data/revision-v2/mediterranean/manifest.json','utf8'));
  const dishes=JSON.parse(await fs.readFile('data/revision-v2/mediterranean/dish-briefs.json','utf8')).dishes;
  const report=await mediterraneanCoverage(manifest,[],dishes);
  assert.deepEqual(report.planned,{concepts:200,forms:307,dishes:120}); assert.equal(new Set(manifest.concepts.map(c=>c.labelIt)).size,200);
  assert.equal(manifest.pilot.entries.length,40);assert.equal(manifest.pilot.entries.flatMap(e=>e.formIds).length,60);assert.ok(report.groups.every(g=>g.planned>=g.minimumConcepts));
  assert.equal(report.reviewed.forms,0);assert.equal(report.pilot.status,'BLOCKED');assert.equal(report.scaleStatus,'BLOCKED');
});
test('R5 T54 USDA selects energy by semantic nutrient ID; Ciqual supports explicit extracts only',async()=>{
  const raw={fdcId:1,description:'SYNTHETIC',dataType:'Foundation',basisAmount:100,basisUnit:'g',edibleBasis:true,foodNutrients:[{nutrient:{id:2048,unitName:'kcal'},amount:90},{nutrient:{id:2047,unitName:'kcal'},amount:100}]};
  const staged=await stageUsda(raw,source.context);assert.equal(staged.nutrients.energyKcal.value,100);assert.equal(staged.nutrients.proteinG.value,null);
  await assert.rejects(stageUsda({...raw,dataType:'Branded'},source.context));
  const ciqual=await stageCiqual({...source.raw,constituents:source.raw.nutrients},source.context);assert.equal(ciqual.source,'CIQUAL');
});

test('R4 T46 approved two-component replacement works when its singles violate daily energy',async()=>{
  const deps=await planned(), day=deps.preview.calendarDays[0], slot=day.mealSlots.find(s=>s.mealClassId==='mc-dinner');
  const original=await deps.repo.get('recipeVersions','rv_chicken'); const pair=[];
  for(const suffix of ['side-a','side-b']) {
    const recipe=structuredClone(original);recipe.recipeId=`r_${suffix}`;recipe.recipeVersionId=`rv_${suffix}`;
    recipe.ingredientLines[0].amount=50;recipe.ingredientLines[0].normalizedAmount=50;
    for(const key of Object.keys(recipe.calculatedNutrition)) recipe.calculatedNutrition[key]/=2;
    pair.push(recipe);await deps.repo.put('recipeVersions',recipe);await deps.repo.put('recipes',{recipeId:recipe.recipeId,currentVersionId:recipe.recipeVersionId,origin:'base',status:'active'});
  }
  const pack=await deps.repo.get('catalogPacks',['test-1','core']); pack.recipeVersionIds.push(...pair.map(r=>r.recipeVersionId)); await deps.repo.put('catalogPacks',pack);
  await deps.repo.setMeta('approvedMealCompositions',[{status:'approved',reviewedBy:'SYNTHETIC TEST ONLY',reviewedAt:'2026-09-11',mealArchetype:'dinner',recipeVersionIds:pair.map(r=>r.recipeVersionId),recipeContentDigest:await sha256Json(pair)}]);
  const preview=await createReplacementPreview({planInstanceId:day.planInstanceId,calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,componentIndex:null},deps);
  const combined=preview.candidates.find(c=>c.recipes.length===2);assert.ok(combined);assert.ok(!preview.candidates.some(c=>c.recipes.length===1 && pair.some(r=>r.recipeVersionId===c.recipe.recipeVersionId)));
  const result=await commitReplacement({...preview,choiceId:combined.choiceId},deps);assert.equal(result.day.mealSlots.find(s=>s.mealOccurrenceId===slot.mealOccurrenceId).recipeComponents.length,2);
});

test('R4 T12 synchronous clone failure aborts the repository transaction before any partial commit', async()=>{
  const {RepositoryHub}=await import('../src/repositories/repositoryHub.js');
  let aborted=false; const pending=[];
  const tx={error:null,objectStore:()=>({put(value){if(value.bad) throw new DOMException('Cannot clone','DataCloneError');pending.push(value);}}),abort(){aborted=true;pending.length=0;queueMicrotask(()=>this.onabort?.());}};
  const repo=new RepositoryHub(async()=>({transaction:()=>tx}));
  await assert.rejects(repo.atomicMutate({puts:{calendarDays:[{id:'first'},{bad:true}]}}),{name:'DataCloneError'});
  assert.equal(aborted,true);assert.equal(pending.length,0);
});

test('R5 T55 a published label and arbitrary digest strings do not certify a dish',async()=>{
  const manifest=JSON.parse(await fs.readFile('data/revision-v2/mediterranean/manifest.json','utf8'));
  const report=await mediterraneanCoverage(manifest,[],[{status:'published',dishId:'fake',recipeVersionId:'fake',publicationEvidence:{nutritionDigest:'fake',humanReviewDigest:'fake'}}]);
  assert.equal(report.reviewed.dishes,0);assert.equal(report.scaleStatus,'BLOCKED');
});
