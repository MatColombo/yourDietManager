import fs from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { plannerFixture } from '../../tests/revision-v2-fixture.mjs';
import { CatalogQueryService } from '../../src/services/catalogQuery.js';
import { createInitialPreview, commitGeneratedPreview, createReplacementPreview } from '../../src/services/effectivePlanService.js';
import { addCivilDays } from '../../src/planner/planMath.js';
const {repo,registry}=await plannerFixture();const versions=await repo.getAll('recipeVersions');
const begin=performance.now();const ids=[];
for(let i=0;i<10000;i++){const original=versions[i%versions.length];const row={...structuredClone(original),recipeId:`bench_${i}`,recipeVersionId:`bench_v_${i}`};await repo.put('recipes',{recipeId:row.recipeId,currentVersionId:row.recipeVersionId,origin:'base',status:'active'});await repo.put('recipeVersions',row);ids.push(row.recipeVersionId);}
for(const v of versions){await repo.delete('recipes',v.recipeId);await repo.delete('recipeVersions',v.recipeVersionId);}
await repo.put('catalogPacks',{catalogVersion:'test-1',packId:'core',status:'installed',recipeVersionIds:ids});
const importMs=performance.now()-begin;repo.getChangeToken=()=>0;
const query=new CatalogQueryService({repo});const queries=['chicken','oats','night','SYNTHETIC_NOT_FOUND'];
const coldStart=performance.now();await query.searchRecipes({text:queries[0],limit:24});const coldSearchMs=performance.now()-coldStart;
const samples=[];
for(let n=0;n<20;n++){const text=queries[n%queries.length];const start=performance.now();const result=await query.searchRecipes({text,limit:24});samples.push({query:text,milliseconds:performance.now()-start,total:result.total});}
const p95=[...samples.map(s=>s.milliseconds)].sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];
let firstPreview; const plans=[];const out='reports/revision_v2/R7/performance.json';await fs.mkdir('reports/revision_v2/R7',{recursive:true});
const report={schemaVersion:1,environment:{platform:os.platform(),release:os.release(),node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemory:os.totalmem()},dataset:{recipes:10000,kind:'Deterministic synthetic copies of seven planner regression recipes; NOT Mediterranean catalog acceptance',seed:'r7-benchmark-2026-09-11'},importMs,coldSearchMs,warmSearch:{samples,p95,budgetMs:250,observed:p95<=250?'PASS':'FAIL'},plans,uiPanel:{status:'BLOCKED',budgetMs:100},alternatives:{status:'NOT_MEASURED',budgetMs:2000},browserCancellation:{status:'BLOCKED'},T64:'INCOMPLETE: memory repository, synthetic corpus; browser and editorial prerequisites missing'};
await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
for(const [days,budgetMs] of [[7,5000],[31,15000],[90,60000]]){const start=performance.now();const result=await createInitialPreview({horizon:{startDate:'2026-09-07',endDate:addCivilDays('2026-09-07',days-1)},seed:'r7-benchmark-2026-09-11'},{repo,registry});if(days===7)firstPreview=result;plans.push({days,budgetMs,milliseconds:performance.now()-start,status:result.status,dayCount:result.calendarDays?.length||0});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(plans.at(-1)));}
console.log(JSON.stringify({importMs,coldSearchMs,p95}));

if(firstPreview?.status==='success') {
 await commitGeneratedPreview(firstPreview,{repo,registry});
 const day=firstPreview.calendarDays[0],slot=day.mealSlots.find(s=>s.mode==='planned');const samples=[];
 for(let n=0;n<10;n++){const start=performance.now();const result=await createReplacementPreview({planInstanceId:day.planInstanceId,calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,seed:`r7-alternatives-${n}`,limit:8},{repo,registry});samples.push({seed:`r7-alternatives-${n}`,milliseconds:performance.now()-start,status:result.status,choices:result.candidates?.length||0});}
 const p95=[...samples.map(s=>s.milliseconds)].sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];report.alternatives={samples,p95,budgetMs:2000,observed:p95<=2000?'PASS':'FAIL',scope:'Service only; no browser panel rendering'};
 await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({alternativeP95:p95}));
}
