import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCurateBatches, conservativeAllergens, conservativeItalianLabel, refinedFoodGroup } from '../src/corpus/fdcAutoCuration.js';

function record(id, description, category, state='unknown') {
  return {
    sourceRecordId:String(id), description, commonName:null, category,
    nutrition:{energyKcal:100,proteinG:5,carbsG:10,fatG:4,fiberG:2,sugarsG:null,saturatedFatG:null,sodiumMg:null},
    suggested:{ingredientId:`ing_fdc_${id}`,nameEn:description,nameIt:'',aliasesEn:[],aliasesIt:[],foodGroup:'food_group_other',foodSubgroup:null,flavorProfile:'flavor_neutral',mealArchetypes:['breakfast','lunch','dinner','snack'],state,allergenIds:[],conversions:[]},
    review:{decision:'pending',approved:false,checks:{italianLabel:false,taxonomy:false,state:false,allergens:false,culinarySuitability:false,duplicate:false,nutrition:false,source:false},reviewer:null,reviewedAt:null,notes:null,duplicateOfIngredientId:null}
  };
}
function batch(sourceId, records) {
  return {schemaVersion:1,batchId:`b-${sourceId}`,policyId:'ingredient-curation-v1',policyVersion:'1.0.0',source:{sourceId,provider:'USDA FoodData Central',dataset:'fixture',release:'fixture',reference:'https://fdc.nal.usda.gov/',archive:null,license:'CC0',inputDigest:'a'.repeat(64),importedAt:'2026-09-04T00:00:00Z'},inputFoodCount:records.length,completeRequiredNutrientCount:records.length,incompleteRequiredNutrientCount:0,records};
}

test('refines mixed dairy and egg category by food descriptor', () => {
  assert.equal(refinedFoodGroup(record(1,'Egg, whole, raw','Dairy and Egg Products')),'food_group_eggs');
  assert.equal(refinedFoodGroup(record(2,'Cheese, mozzarella','Dairy and Egg Products')),'food_group_cheese');
  assert.equal(refinedFoodGroup(record(3,'Milk, whole','Dairy and Egg Products')),'food_group_dairy_milk_yogurt');
});

test('conservative allergen derivation distinguishes seafood and common major allergens', () => {
  assert.deepEqual(conservativeAllergens(record(1,'Shrimp, raw','Finfish and Shellfish Products')),['crustaceans']);
  assert.deepEqual(conservativeAllergens(record(2,'Clams, raw','Finfish and Shellfish Products')),['molluscs']);
  assert.deepEqual(conservativeAllergens(record(3,'Salmon, raw','Finfish and Shellfish Products')),['fish']);
  assert.deepEqual(conservativeAllergens(record(4,'Yogurt, plain','Dairy and Egg Products')),['milk']);
});

test('Italian label uses controlled translation where available and source-preserving fallback otherwise', () => {
  assert.equal(conservativeItalianLabel(record(1,'Apples, raw','Fruits and Fruit Juices','raw'),'raw'),'Mela, crudo');
  assert.match(conservativeItalianLabel(record(2,'Cherimoya, raw','Fruits and Fruit Juices','raw'),'raw'),/^Frutta — Cherimoya, raw$/);
  assert.notEqual(conservativeItalianLabel(record(3,'Chicken, breast, meat only, raw','Poultry Products','raw'),'raw'),conservativeItalianLabel(record(4,'Chicken, thigh, meat only, raw','Poultry Products','raw'),'raw'));
});

test('auto curation is deterministic, rejects complex categories, avoids exact display duplicates and meets target when eligible inventory exists', () => {
  const f = batch('usda-foundation-2026-04',[
    record(1,'Apples, raw','Fruits and Fruit Juices','raw'),
    record(2,'Bananas, raw','Fruits and Fruit Juices','raw'),
    record(3,'Restaurant, pizza','Restaurant Foods','prepared')
  ]);
  const s = batch('usda-sr-legacy-2018-04',[
    record(4,'Salmon, raw','Finfish and Shellfish Products','raw'),
    record(5,'Eggs, whole, raw','Dairy and Egg Products','raw'),
    record(6,'Apples, raw','Fruits and Fruit Juices','raw')
  ]);
  const one = autoCurateBatches({batches:[f,s],targetCount:4,reviewedAt:'2026-09-04T00:00:00Z'});
  const two = autoCurateBatches({batches:[f,s],targetCount:4,reviewedAt:'2026-09-04T00:00:00Z'});
  assert.deepEqual(one,two);
  assert.equal(one.diagnostics.targetMet,true);
  assert.equal(one.diagnostics.approved,4);
  assert.equal(one.batches.flatMap(x=>x.records).filter(x=>x.review.decision==='approved').length,4);
  assert.equal(one.batches[0].records[2].review.decision,'rejected');
  assert.equal(one.batches[1].records[2].review.decision,'rejected');
  for (const row of one.batches.flatMap(x=>x.records).filter(x=>x.review.decision==='approved')) {
    assert.equal(row.review.approved,true);
    assert.ok(Object.values(row.review.checks).every(Boolean));
    assert.notEqual(row.suggested.state,'unknown');
    assert.ok(row.suggested.nameIt.length>0);
  }
});


test('deterministic curation rejects source rows whose declared energy is grossly inconsistent with macros', () => {
  const r = record(90,'Apples, raw','Fruits and Fruit Juices','raw');
  r.nutrition = {...r.nutrition, energyKcal: 500, proteinG: 1, carbsG: 10, fatG: 1};
  const result = autoCurateBatches({batches:[batch('usda-foundation-2026-04',[r]),batch('usda-sr-legacy-2018-04',[])],targetCount:1,groupMinimums:{},reviewedAt:'2026-09-04T00:00:00Z'});
  assert.equal(result.diagnostics.approved,0);
  assert.ok(result.diagnostics.ineligible.macro_energy_mismatch >= 1);
});

test('deterministic curation protects explicit replacements for all four Phase 1 ingredient fixtures', () => {
  const rows = [
    record(101,'Salmon, Atlantic, raw','Finfish and Shellfish Products','raw'),
    record(102,'Rice, white, long-grain, cooked','Cereal Grains and Pasta','cooked'),
    record(103,'Zucchini, raw','Vegetables and Vegetable Products','raw'),
    record(104,'Oil, olive, salad or cooking','Fats and Oils','as_sold')
  ];
  const result = autoCurateBatches({batches:[batch('usda-foundation-2026-04',rows),batch('usda-sr-legacy-2018-04',[])],targetCount:4,groupMinimums:{},reviewedAt:'2026-09-04T00:00:00Z'});
  assert.equal(result.diagnostics.protectedConceptsMet,true);
  assert.deepEqual(result.diagnostics.protectedConceptFailures,[]);
  assert.equal(result.diagnostics.approved,4);
});
