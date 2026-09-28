import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const SOURCE = path.join(ROOT, 'catalog-source');
function resolved() {
  const versions = new Map();
  for (const file of fs.readdirSync(SOURCE).filter(x => x.endsWith('.json')).sort()) {
    const batch = JSON.parse(fs.readFileSync(path.join(SOURCE, file), 'utf8'));
    for (const record of batch.records ?? []) {
      const key = `${record.kind}:${record.id}`;
      const prev = versions.get(key);
      if (!prev || record.revision > prev.revision) versions.set(key, record);
    }
  }
  const active=[...versions.values()].filter(x=>x.status==='active');
  return {
    terms:new Map(active.filter(x=>x.kind==='taxonomy_term').map(x=>[x.id,x])),
    ingredients:new Map(active.filter(x=>x.kind==='ingredient').map(x=>[x.id,x])),
    recipes:new Map(active.filter(x=>x.kind==='recipe').map(x=>[x.id,x]))
  };
}

test('full culinary time audit reviews all pre-expansion recipes semantically and keeps plausible floors', () => {
  const audit=JSON.parse(fs.readFileSync(path.join(SOURCE,'010-complete-recipe-time-audit.json'),'utf8'));
  assert.equal(audit.records.length,1030);
  assert.ok(audit.records.every(r=>r.kind==='recipe' && r.timeReview?.policy==='culinary_time_audit_v1'));
  const increased=audit.records.filter(r=>r.prepMinutes>r.timeReview.previousPrepMinutes || r.cookMinutes>r.timeReview.previousCookMinutes).length;
  const decreased=audit.records.filter(r=>r.prepMinutes<r.timeReview.previousPrepMinutes || r.cookMinutes<r.timeReview.previousCookMinutes).length;
  assert.ok(increased>300,'audit should correct optimistic times');
  assert.ok(decreased>50,'audit must not be a blanket multiplier');
  const {ingredients,recipes}=resolved();
  for (const r of recipes.values()) {
    const techniques=new Set(r.preparationTechniqueIds ?? []);
    if (techniques.has('tax_preparation_no_cook_assembly')) assert.equal(r.cookMinutes,0,`${r.id} no-cook mismatch`);
    if (techniques.has('tax_preparation_baking')) assert.ok(r.cookMinutes>=18,`${r.id} baking too short`);
    if (techniques.has('tax_preparation_braising')) assert.ok(r.cookMinutes>=20,`${r.id} braising too short`);
    if (techniques.has('tax_preparation_roasting')) assert.ok(r.cookMinutes>=25,`${r.id} roasting too short`);
    if (techniques.has('tax_preparation_steaming')) assert.ok(r.cookMinutes>=10,`${r.id} steaming too short`);
    if (techniques.has('tax_preparation_frying')) assert.ok(r.cookMinutes>=8,`${r.id} frying too short`);
    const rawAnimal=r.ingredients.some(line=>{
      const i=ingredients.get(line.ingredientId);
      return i?.state?.physical==='raw' && ['tax_category_meat_poultry','tax_category_fish_seafood','tax_category_eggs'].includes(i.categoryId);
    });
    if (rawAnimal) assert.ok(r.cookMinutes>=8,`${r.id} raw animal ingredient with implausible cook time`);
  }
  const complexFloors = {
    recipe_gnocchi_patate_pomodoro_basilico: [25, 30],
    recipe_gnocchi_patata_dolce_salvia_ricotta: [25, 30],
    recipe_r2_elaborate_ragu_fegatini_pasta_uovo: [15, 45],
    recipe_parmigiana_leggera_melanzane: [18, 40],
    recipe_melanzana_ripiena_riso_cannellini: [20, 40],
    recipe_r2_elaborate_spalla_maiale_finocchio_arrosto: [20, 70]
  };
  const auditedById=new Map(audit.records.map(r=>[r.id,r]));
  for (const [id,[prepFloor,cookFloor]] of Object.entries(complexFloors)) {
    const r=auditedById.get(id);
    assert.ok(r,`${id} missing from time-audit batch`);
    assert.ok(r.prepMinutes>=prepFloor,`${id} prep floor`);
    assert.ok(r.cookMinutes>=cookFloor,`${id} cook floor`);
  }
});

test('global expansion source batch adds required meats, cuisines and exactly 100 fusion recipes', () => {
  const batch=JSON.parse(fs.readFileSync(path.join(SOURCE,'011-global-cuisine-technique-expansion.json'),'utf8'));
  const ingredients=new Map((batch.records ?? []).filter(r=>r.kind==='ingredient' && r.status==='active').map(r=>[r.id,r]));
  const recipes=(batch.records ?? []).filter(r=>r.kind==='recipe' && r.status==='active');
  for (const [id,min] of [['ing_beef_sirloin_raw',30],['ing_rabbit_meat_raw',30],['ing_lamb_leg_lean_raw',30]]) {
    assert.ok(ingredients.has(id));
    const meatRecipes=recipes.filter(r=>r.ingredients.some(line=>line.ingredientId===id));
    assert.ok(meatRecipes.length>=min,`${id} recipe coverage`);
    assert.ok(new Set(meatRecipes.map(r=>r.title.it.toLocaleLowerCase('it'))).size>=min,`${id} unique recipe titles`);
  }
  const wants={tax_cuisine_japanese:10,tax_cuisine_indian:3,tax_cuisine_greek:2,tax_cuisine_spanish:10,tax_cuisine_chinese:10,tax_cuisine_mexican:5,tax_cuisine_fusion:100};
  for (const [cuisine,want] of Object.entries(wants)) assert.ok(recipes.filter(r=>r.cuisineIds.includes(cuisine)).length>=want,`${cuisine} count`);
  const fusion=recipes.filter(r=>r.cuisineIds.includes('tax_cuisine_fusion'));
  assert.equal(fusion.length,100);
  assert.equal(new Set(fusion.map(r=>r.title.it.toLocaleLowerCase('it'))).size,100,'fusion Italian titles must be unique');
  assert.ok(fusion.every(r=>(r.steps?.it?.length ?? 0)>=3),'fusion recipes need actionable steps');
  assert.ok(fusion.every(r=>(r.ingredients?.length ?? 0)>=5),'fusion recipes need complete ingredient sets');
  assert.ok(fusion.filter(r=>r.ingredients.some(line=>line.ingredientId==='ing_rice_paper_dry')).length>=15,'rice-paper crispy concept coverage');
  assert.ok(fusion.filter(r=>r.ingredients.some(line=>line.ingredientId==='ing_miso_paste')).length>=20,'miso modern-use coverage');
  assert.ok(fusion.filter(r=>r.ingredients.some(line=>line.ingredientId==='ing_avocado_raw')).length>=8,'avocado modern-use coverage');
  assert.ok(fusion.filter(r=>r.ingredients.some(line=>line.ingredientId==='ing_feta_cheese')).length>=8,'feta modern-use coverage');
  assert.equal(fusion.some(r=>/Braisé fusion|Vapore fusion allo zenzero|Teglia arrosto fusion con|Pasta fusion in crema frullata/i.test(r.title.it)),false,'mechanical placeholder fusion titles must not return');
});

test('global expansion source batch closes previously empty technique/diet combinations', () => {
  const batch=JSON.parse(fs.readFileSync(path.join(SOURCE,'011-global-cuisine-technique-expansion.json'),'utf8'));
  const recipes=(batch.records ?? []).filter(r=>r.kind==='recipe' && r.status==='active');
  const techniques=['tax_preparation_blending','tax_preparation_braising','tax_preparation_frying','tax_preparation_roasting','tax_preparation_steaming'];
  const diets=['tax_diet_vegan','tax_diet_vegetarian','tax_diet_pescatarian'];
  for (const technique of techniques) for (const diet of diets) {
    const count=recipes.filter(r=>r.preparationTechniqueIds.includes(technique) && r.dietTagIds.includes(diet)).length;
    assert.ok(count>=5,`${technique}/${diet} only ${count}`);
  }
});
