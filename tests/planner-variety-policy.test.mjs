import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecipeCandidatesForVariety, plannerPolicy, VARIETY_MODES } from '../src/planner/varietyPolicy.js';
import { varietyScore } from '../src/planner/softScoring.js';
import { solveDayBeam } from '../src/planner/beamSolver.js';

const profile = mode => ({ schemaVersion:2, id:'prefs', rules:[], plannerPolicy:{ varietyMode:mode } });
const recipe = (id, ingredientId='ing_a', revisionId='ing_a_r1') => ({
  recipeId:id, recipeVersionId:`${id}_v1`, ingredientLines:[{ ingredientId, ingredientRevisionId:revisionId, included:true }],
  tags:{ families:['recipe_family_test'], cuisines:['cuisine_italian'] }
});
const revisions = new Map([
  ['ing_a_r1',{ ingredientRevisionId:'ing_a_r1', basis:{state:'raw'}, productTaxonomy:{categoryId:'product_category_vegetables'}, taxonomy:{foodGroup:'food_group_vegetables'} }],
  ['ing_b_r1',{ ingredientRevisionId:'ing_b_r1', basis:{state:'raw'}, productTaxonomy:{categoryId:'product_category_vegetables'}, taxonomy:{foodGroup:'food_group_vegetables'} }]
]);

test('maximum variety removes recently used exact recipe when alternatives exist', () => {
  const a=recipe('recipe_a'); const b=recipe('recipe_b','ing_b','ing_b_r1');
  const result=filterRecipeCandidatesForVariety([a,b],[{date:'2026-09-20',recipe:a}],'2026-09-21',profile(VARIETY_MODES.maximum));
  assert.deepEqual(result.candidates.map(item=>item.recipeId),['recipe_b']);
  assert.equal(result.excludedCount,1);
  assert.equal(result.fallbackUsed,false);
});

test('maximum variety falls back instead of making the plan impossible', () => {
  const a=recipe('recipe_a');
  const result=filterRecipeCandidatesForVariety([a],[{date:'2026-09-20',recipe:a}],'2026-09-21',profile(VARIETY_MODES.maximum));
  assert.equal(result.candidates.length,1);
  assert.equal(result.fallbackUsed,true);
});

test('no-variety mode does not exclude or penalize exact repeats', () => {
  const a=recipe('recipe_a');
  const selection=filterRecipeCandidatesForVariety([a],[{date:'2026-09-20',recipe:a}],'2026-09-21',profile(VARIETY_MODES.none));
  assert.equal(selection.candidates.length,1);
  const scored=varietyScore(a,{history:[{date:'2026-09-20',recipe:a}],date:'2026-09-21',revisionById:revisions,foodPreferences:profile(VARIETY_MODES.none)});
  assert.equal(scored.score,0);
});

test('perishable proximity rewards a different recipe reusing a fresh ingredient', () => {
  const prior=recipe('recipe_prior','ing_a','ing_a_r1');
  const reuse={...recipe('recipe_reuse','ing_a','ing_a_r1'),tags:{families:['recipe_family_other'],cuisines:['cuisine_italian']}};
  const unrelated={...recipe('recipe_other','ing_b','ing_b_r1'),tags:{families:['recipe_family_other2'],cuisines:['cuisine_italian']}};
  const context={history:[{date:'2026-09-20',recipe:prior}],date:'2026-09-21',revisionById:revisions,foodPreferences:profile(VARIETY_MODES.perishables)};
  assert.ok(varietyScore(reuse,context).score < varietyScore(unrelated,context).score);
});

test('profiles without the new field default to maximum variety', () => {
  assert.equal(plannerPolicy({schemaVersion:1,id:'old',rules:[]}).varietyMode,VARIETY_MODES.maximum);
  assert.equal(plannerPolicy({schemaVersion:2,id:'v2',rules:[]}).varietyMode,VARIETY_MODES.maximum);
});


test('intra-day repetition follows the selected global variety strategy', () => {
  const a={...recipe('recipe_a'),calculatedNutrition:{energyKcal:300,proteinG:20,carbsG:30,fatG:10,fiberG:5}};
  const b={...recipe('recipe_b','ing_b','ing_b_r1'),calculatedNutrition:{energyKcal:300,proteinG:20,carbsG:30,fatG:10,fiberG:5}};
  const option=(recipes,score)=>({recipes,nutrition:{energyKcal:300,proteinG:20,carbsG:30,fatG:10,fiberG:5},score,tie:0});
  const slotPlans=[
    {id:'slot_1',options:[option([a],0)]},
    {id:'slot_2',options:[option([a],0),option([b],5)]}
  ];
  const nutritionProfile={energyTolerancePct:1,nutrients:{proteinG:{enabled:false},carbsG:{enabled:false},fatG:{enabled:false},fiberG:{enabled:false}}};
  const common={dayEnergyTarget:600,externalEnergy:0,nutritionProfile,beamWidth:20,seed:'variety-day'};
  const maximum=solveDayBeam(slotPlans,{...common,varietyMode:VARIETY_MODES.maximum}).solution;
  const none=solveDayBeam(slotPlans,{...common,varietyMode:VARIETY_MODES.none}).solution;
  assert.deepEqual(maximum.slots.map(row=>row.option.recipes[0].recipeId),['recipe_a','recipe_b']);
  assert.deepEqual(none.slots.map(row=>row.option.recipes[0].recipeId),['recipe_a','recipe_a']);
});
