import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generatePlanCore } from '../../src/planner/planGenerator.js';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { fileLoader } from '../../tests/helpers.mjs';

const root = process.cwd();
const rev = (id, ingredientId, group, allergens = []) => ({ ingredientRevisionId: id, ingredientId, taxonomy: { foodGroup: group, foodSubgroup: group }, allergenIds: allergens });
const rec = (id, archetype, kcal, protein, ingredientId, revisionId, allergens = []) => ({
  recipeVersionId: `rv_${id}`, recipeId: `r_${id}`, mealArchetypes: [archetype], calculatedNutrition: { energyKcal: kcal, proteinG: protein, carbsG: kcal / 10, fatG: kcal / 40, fiberG: 5 },
  practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true },
  tags: { families: ['smoke'], cuisines: ['test'], diet: [], flavor: ['savory'], practical: ['portable'] }, allergenIds: allergens,
  ingredientLines: [{ ingredientId, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }], quality: { status: 'validated' }, origin: 'base'
});
const ingredientRevisions = [rev('rev_oats','ing_oats','grains'), rev('rev_chicken','ing_chicken','meat'), rev('rev_fish','ing_fish','fish_seafood',['fish']), rev('rev_night','ing_night','grains')];
const recipes = [rec('oats','breakfast',400,20,'ing_oats','rev_oats'), rec('chicken','dinner',700,60,'ing_chicken','rev_chicken'), rec('fish','dinner',700,55,'ing_fish','rev_fish',['fish']), rec('night','night_meal',500,30,'ing_night','rev_night')];
const mealClasses = [
  { schemaVersion:1,id:'mc-breakfast',name:'Breakfast',abbreviation:'BR',mealArchetype:'breakfast',energyShare:{target:0.22,min:0.15,max:0.3},rules:[] },
  { schemaVersion:1,id:'mc-dinner',name:'Dinner',abbreviation:'DI',mealArchetype:'dinner',energyShare:{target:0.35,min:0.2,max:0.5},rules:[] },
  { schemaVersion:1,id:'mc-night',name:'Night',abbreviation:'NI',mealArchetype:'night_meal',energyShare:{target:0.25,min:0.15,max:0.35},rules:[] },
  { schemaVersion:1,id:'mc-lunch',name:'Lunch',abbreviation:'LU',mealArchetype:'lunch',energyShare:{target:0.28,min:0.2,max:0.4},rules:[] }
];
const cap = { fridge:'yes',reheating:'yes',cooking:true,complexSnack:true,portabilityRequired:false,maxPrepMinutes:60 };
const dayClasses = [
  { schemaVersion:1,id:'dc-day',name:'Day',abbreviation:'DA',color:'#446644',dayArchetype:'day',workWindows:[],capabilities:cap,mealSlots:[
    { id:'breakfast',mealClassId:'mc-breakfast',time:'08:00',dayOffset:0,mode:'planned',energyBudgetKcal:400,energyShare:null,guidanceKeys:[],parallel:false,proteinMinG:null },
    { id:'lunch',mealClassId:'mc-lunch',time:'13:00',dayOffset:0,mode:'external',energyBudgetKcal:500,energyShare:null,guidanceKeys:['external.guidance'],parallel:false,proteinMinG:25,estimatedNutritionPolicy:'budget_only' },
    { id:'dinner',mealClassId:'mc-dinner',time:'20:00',dayOffset:0,mode:'planned',energyBudgetKcal:700,energyShare:null,guidanceKeys:[],parallel:false,proteinMinG:null }
  ]},
  { schemaVersion:1,id:'dc-night',name:'Night',abbreviation:'NT',color:'#333366',dayArchetype:'night',workWindows:[{start:'20:00',end:'08:00',endDayOffset:1}],capabilities:cap,mealSlots:[
    { id:'pre',mealClassId:'mc-dinner',time:'19:00',dayOffset:0,mode:'planned',energyBudgetKcal:700,energyShare:null,guidanceKeys:[],parallel:false,proteinMinG:null },
    { id:'night',mealClassId:'mc-night',time:'02:00',dayOffset:1,mode:'planned',energyBudgetKcal:500,energyShare:null,guidanceKeys:[],parallel:false,proteinMinG:null }
  ]}
];
const nutritionProfile = { schemaVersion:1,id:'nutrition',dailyEnergyKcal:1800,energyTolerancePct:10,preset:'balanced',nutrients:{ proteinG:{enabled:true,min:70,target:100,max:null,weight:1.5},carbsG:{enabled:false,min:null,target:null,max:null,weight:0},fatG:{enabled:false,min:null,target:null,max:null,weight:0},fiberG:{enabled:false,min:null,target:null,max:null,weight:0}},dayArchetypeModifiers:{night:{mode:'percent',value:5}} };
const result = generatePlanCore({ nutritionProfile, allergyProfile:{schemaVersion:1,id:'allergy',rules:[{id:'fish',kind:'allergy',targetType:'allergen',targetId:'fish',label:'Fish',enabled:true,notes:''}]}, foodPreferences:{schemaVersion:1,id:'prefs',rules:[]}, mealClasses, dayClasses, cycle:{schemaVersion:1,id:'cycle',name:'Smoke cycle',length:2,days:[{cycleDay:1,dayClassId:'dc-day'},{cycleDay:2,dayClassId:'dc-night'}]}, recipes, ingredientRevisions, horizon:{startDate:'2026-09-07',endDate:'2026-09-08'}, seed:'phase5-smoke', catalogVersion:'phase5-smoke', configSnapshotHash:'1234567890abcdef', configSnapshot:{kind:'phase5-smoke'}, createdAt:'2026-09-03T14:00:00Z', continuationPolicy:{mode:'prompt',triggerDaysBeforeEnd:1,extensionDays:2} });
if (result.status !== 'success') throw new Error(`Phase 5 smoke generation failed: ${JSON.stringify(result.failure)}`);
const registry = new SchemaRegistry(fileLoader(path.join(root,'schemas'))); await registry.loadAll(); registry.assert('generationRun',result.generationRun); registry.assert('planInstance',result.planInstance); for (const day of result.calendarDays) registry.assert('calendarDay',day);
if (result.calendarDays.flatMap(day=>day.mealSlots.flatMap(slot=>slot.recipeComponents)).some(c=>c.recipeVersionId==='rv_fish')) throw new Error('Safety regression: fish allergy recipe selected');
await mkdir(path.join(root,'planner/reports'),{recursive:true}); await writeFile(path.join(root,'planner/reports/phase5-smoke-plan.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Phase 5 smoke plan generated: ${result.calendarDays.length} days, ${result.diagnostics.days.reduce((n,d)=>n+d.selectedMeals.length,0)} selected recipe components.`);
