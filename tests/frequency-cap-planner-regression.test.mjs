import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { solveDayBeam } from '../src/planner/beamSolver.js';

const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'));

const mealClasses = [
  { schemaVersion:1, id:'meal-breakfast', name:'Breakfast', abbreviation:'B', mealArchetype:'breakfast', energyShare:{target:0.2,min:0.1,max:0.3}, rules:[] },
  { schemaVersion:1, id:'meal-lunch', name:'Lunch', abbreviation:'L', mealArchetype:'lunch', energyShare:{target:0.35,min:0.2,max:0.45}, rules:[] },
  { schemaVersion:1, id:'meal-dinner', name:'Dinner', abbreviation:'D', mealArchetype:'dinner', energyShare:{target:0.35,min:0.2,max:0.45}, rules:[] },
  { schemaVersion:1, id:'meal-snack', name:'Snack', abbreviation:'S', mealArchetype:'snack', energyShare:{target:0.1,min:0.05,max:0.2}, rules:[] },
  { schemaVersion:1, id:'meal-recovery-breakfast', name:'Recovery breakfast', abbreviation:'RB', mealArchetype:'breakfast', energyShare:{target:0.15,min:0.1,max:0.16}, rules:[] }
];

const slot = (id, mealClassId, time, energyShare, dayOffset = 0) => ({ id, mealClassId, time, dayOffset, mode:'planned', energyBudgetKcal:null, energyShare, guidanceKeys:[], parallel:false, proteinMinG:null });
const capabilities = { fridge:'yes', reheating:'yes', cooking:true, complexSnack:true, portabilityRequired:false, maxPrepMinutes:null };
const dayClasses = [
  { schemaVersion:1, id:'day-standard', name:'Standard', abbreviation:'STD', color:'#000000', dayArchetype:'day', workWindows:[], capabilities:{...capabilities,maxPrepMinutes:45}, mealSlots:[slot('std-breakfast','meal-breakfast','06:00',0.2),{...slot('std-lunch','meal-lunch','13:00',null),mode:'external',energyBudgetKcal:450,estimatedNutritionPolicy:'budget_only'},slot('std-snack','meal-snack','17:00',null),slot('std-dinner','meal-dinner','20:00',null)] },
  { schemaVersion:1, id:'day-night', name:'Night', abbreviation:'NGT', color:'#000000', dayArchetype:'night', workWindows:[], capabilities, mealSlots:[slot('night-breakfast','meal-breakfast','06:00',null),slot('night-lunch','meal-lunch','11:59',0.4),slot('night-snack-a','meal-snack','16:00',0.3),slot('night-dinner','meal-dinner','18:00',0.3),slot('night-snack-b','meal-snack','23:00',0.2),slot('night-snack-c','meal-snack','02:00',0.1,1)] },
  { schemaVersion:1, id:'day-recovery', name:'Recovery', abbreviation:'REC', color:'#000000', dayArchetype:'rest', workWindows:[], capabilities:{...capabilities,complexSnack:false}, mealSlots:[slot('rec-breakfast','meal-recovery-breakfast','08:30',0.1),slot('rec-lunch','meal-lunch','14:00',0.5),slot('rec-snack','meal-snack','18:00',null),slot('rec-dinner','meal-dinner','12:00',0.3)] },
  { schemaVersion:1, id:'day-rest', name:'Rest', abbreviation:'RST', color:'#000000', dayArchetype:'rest', workWindows:[], capabilities, mealSlots:[slot('rest-breakfast','meal-breakfast','09:00',null),slot('rest-lunch','meal-lunch','13:00',null),slot('rest-snack','meal-snack','17:00',null),slot('rest-dinner','meal-dinner','19:30',null)] }
];
const cycle = { schemaVersion:1, id:'cycle-test', name:'Cycle', length:5, days:[
  {cycleDay:1,dayClassId:'day-standard'}, {cycleDay:2,dayClassId:'day-night'}, {cycleDay:3,dayClassId:'day-recovery'}, {cycleDay:4,dayClassId:'day-rest'}, {cycleDay:5,dayClassId:'day-rest'}
] };
const nutritionProfile = { schemaVersion:1, id:'nutrition', dailyEnergyKcal:1200, energyTolerancePct:5, preset:'custom', nutrients:{ proteinG:{min:30,target:null,max:null,weight:1,enabled:true}, carbsG:{min:null,target:null,max:null,weight:0,enabled:false}, fatG:{min:null,target:null,max:null,weight:0,enabled:false}, fiberG:{min:null,target:null,max:20,weight:1,enabled:true} }, dayArchetypeModifiers:{ night:{mode:'kcal',value:200} } };
const allergyProfile = { schemaVersion:1, id:'allergy', rules:[] };
const frequencyRule = (id, targetId, maxOccurrences) => ({ id, enabled:true, mode:'frequency', target:{type:'productFood',id:targetId}, scope:{mealClassIds:[]}, countUnit:'meal', countBasis:'planned', window:{kind:'rolling',days:7}, minOccurrences:null, targetOccurrences:null, maxOccurrences, priority:'normal', effectiveFrom:'2026-09-21' });
const foodPreferences = { schemaVersion:2, id:'prefs', plannerPolicy:{varietyMode:'maximum_variety'}, legacyRules:[], rules:[
  { ...frequencyRule('no-pepper','product_concept_pepper',null), mode:'never' },
  frequencyRule('max-eggs','product_category_eggs',5),
  frequencyRule('max-dairy','product_category_dairy',5)
] };

function plannerInput() {
  return {
    nutritionProfile, allergyProfile, foodPreferences, mealClasses, dayClasses, cycle,
    recipes:catalog.recipeVersions, ingredientRevisions:catalog.ingredientRevisions, ingredients:catalog.ingredients,
    taxonomyTerms:catalog.taxonomyTerms, foodGroups:catalog.foodGroups,
    horizon:{startDate:'2026-09-21',endDate:'2026-09-27'}, startCycleDay:1,
    seed:'frequency-cap-regression', catalogVersion:catalog.manifest.catalogVersion,
    configSnapshotHash:'frequency-cap-regression', configSnapshot:{}, createdAt:'2026-09-21T08:00:00.000Z',
    candidateLimit:16, beamWidth:60, slotOptionLimit:30, previousCalendarDays:[]
  };
}

test('max dairy and egg caps do not exhaust the bounded candidate frontier when a valid plan exists', () => {
  const result = generatePlanCore(plannerInput());
  assert.equal(result.status, 'success', JSON.stringify(result.failure));
  assert.equal(result.calendarDays.length, 7);
  const completeCaps = result.diagnostics.frequencies.windows.filter(window => ['max-dairy','max-eggs'].includes(window.ruleId) && window.complete);
  assert.ok(completeCaps.length >= 2);
  assert.ok(completeCaps.every(window => !window.maxViolation && window.count <= 5), JSON.stringify(completeCaps));
  const capExclusions = result.diagnostics.days.flatMap(day => day.slotDiagnostics || []).reduce((sum, slotDiagnostic) => sum + Number(slotDiagnostic.frequencyCaps?.excludedCandidateCount || 0), 0);
  assert.ok(capExclusions > 0, 'expected saturated caps to filter candidates before shortlist construction');
});

test('day solver diagnoses frequency frontier exhaustion separately from energy exhaustion', () => {
  const recipe={recipeId:'r',recipeVersionId:'rv',calculatedNutrition:{energyKcal:300,proteinG:10,carbsG:20,fatG:10,fiberG:2}};
  const option={recipes:[recipe],nutrition:recipe.calculatedNutrition,score:0,tie:0};
  const nutrition={energyTolerancePct:5,nutrients:{proteinG:{enabled:false},carbsG:{enabled:false},fatG:{enabled:false},fiberG:{enabled:false}}};
  const result=solveDayBeam([{id:'slot',options:[option]}],{dayEnergyTarget:300,nutritionProfile:nutrition,beamWidth:10,evaluateState:()=>({valid:false,idealPenalty:0})});
  assert.equal(result.solution,null);
  assert.equal(result.diagnostics.code,'frequency_candidate_frontier_exhausted');
  assert.equal(result.diagnostics.frequencyPrunedStates,1);
  assert.equal(result.diagnostics.energyPrunedStates,0);
});
