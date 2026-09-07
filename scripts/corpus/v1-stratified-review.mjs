import { createHash } from 'node:crypto';
import { readJson, writeJson } from './io-lib.mjs';

const BUNDLE = 'corpus/production/v1-release-bundle.json';
const POLICY = 'corpus/production/v1-release/recipe-eligibility.json';
const OUTPUT = 'corpus/production/v1-release/stratified-review.json';
const bundle = await readJson(BUNDLE);
const eligibility = await readJson(POLICY);
const revisions = new Map(bundle.ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
const roleIds = Object.fromEntries(Object.entries(eligibility.roles).map(([role, config]) => [role, new Set(config.ingredientIds)]));
const allowed = new Set(Object.values(eligibility.roles).flatMap(config => config.ingredientIds));
const profile = recipe => String(recipe.generation?.candidateId || '').replace(/^v1-(breakfast|lunch|dinner|snack|mini_meal)-\d+-/, '');
const meal = recipe => recipe.mealArchetypes?.[0];
const animalGroups = new Set(['food_group_meat','food_group_poultry','food_group_fish_seafood','food_group_eggs']);

const strata = [
  { id:'breakfast-cereal-grain', match:r=>meal(r)==='breakfast' && ['breakfast-yogurt-cereal','breakfast-warm-grain'].includes(profile(r)) },
  { id:'breakfast-egg', match:r=>meal(r)==='breakfast' && profile(r)==='breakfast-egg-grain' },
  { id:'lunch-legume', match:r=>meal(r)==='lunch' && profile(r).includes('legume') },
  { id:'lunch-poultry', match:r=>meal(r)==='lunch' && profile(r).includes('poultry') },
  { id:'lunch-meat', match:r=>meal(r)==='lunch' && profile(r).includes('meat') },
  { id:'lunch-fish', match:r=>meal(r)==='lunch' && profile(r).includes('fish') },
  { id:'dinner-legume', match:r=>meal(r)==='dinner' && profile(r).includes('legume') },
  { id:'dinner-animal', match:r=>meal(r)==='dinner' && ['dinner-poultry-plate','dinner-meat-plate','dinner-fish-plate'].includes(profile(r)) },
  { id:'snack-fruit-nuts', match:r=>meal(r)==='snack' && profile(r)==='snack-fruit-nuts' },
  { id:'snack-yogurt-fruit', match:r=>meal(r)==='snack' && profile(r)==='snack-yogurt-fruit' },
  { id:'snack-savory', match:r=>meal(r)==='snack' && profile(r)==='snack-bean-vegetable' },
  { id:'mini-meal', match:r=>meal(r)==='mini_meal' }
];
function score(id, stratum) { return createHash('sha256').update(`${stratum}|${id}`).digest('hex'); }
function reviewRecipe(recipe) {
  const issues=[];
  const target=eligibility.mealTargets[meal(recipe)]?.energyKcal;
  if(!target || recipe.calculatedNutrition.energyKcal < target.min || recipe.calculatedNutrition.energyKcal > target.max) issues.push('energy_outside_meal_target');
  for(const line of recipe.ingredientLines || []) {
    const revision=revisions.get(line.ingredientRevisionId);
    if(!allowed.has(line.ingredientId)) issues.push(`ingredient_not_explicitly_eligible:${line.ingredientId}`);
    if(Number(line.amount)>eligibility.releaseRules.maxIngredientAmountG) issues.push(`ingredient_amount_over_global_max:${line.ingredientId}`);
    if(roleIds.oilCooking.has(line.ingredientId) && Number(line.amount)>eligibility.releaseRules.maxOilAmountG) issues.push(`oil_amount:${line.ingredientId}`);
    if(roleIds.nutsSeeds.has(line.ingredientId) && Number(line.amount)>eligibility.releaseRules.maxNutsSeedsAmountG) issues.push(`nuts_amount:${line.ingredientId}`);
    if(roleIds.seasoning.has(line.ingredientId) && Number(line.amount)>eligibility.releaseRules.maxSeasoningAmountG) issues.push(`seasoning_amount:${line.ingredientId}`);
    if(Number(recipe.practical?.cookMinutes||0)===0 && animalGroups.has(revision?.taxonomy?.foodGroup) && revision?.basis?.state==='raw') issues.push(`raw_animal_in_no_cook:${line.ingredientId}`);
  }
  const rawAnimal = (recipe.ingredientLines||[]).some(line => { const revision=revisions.get(line.ingredientRevisionId); return animalGroups.has(revision?.taxonomy?.foodGroup) && revision?.basis?.state==='raw'; });
  if(rawAnimal && !recipe.i18n?.en?.instructions?.join(' ').toLowerCase().includes('cook')) issues.push('raw_animal_without_cook_instruction');
  if(!recipe.practical?.portable || Number(recipe.practical?.prepMinutes||0)>10) issues.push('not_portable_or_prep_over_10');
  return issues;
}
const samples=[];
for(const stratum of strata){
  const pool=bundle.recipeVersions.filter(stratum.match).sort((a,b)=>score(a.recipeVersionId,stratum.id).localeCompare(score(b.recipeVersionId,stratum.id)));
  if(pool.length<5) throw new Error(`V1 stratified review stratum ${stratum.id} has only ${pool.length} recipes`);
  for(const recipe of pool.slice(0,5)) samples.push({
    stratum:stratum.id, recipeVersionId:recipe.recipeVersionId, profileId:profile(recipe), mealArchetype:meal(recipe),
    titleIt:recipe.i18n.it.title, titleEn:recipe.i18n.en.title, energyKcal:recipe.calculatedNutrition.energyKcal,
    ingredients:recipe.ingredientLines.map(line=>({ ingredientId:line.ingredientId, nameEn:revisions.get(line.ingredientRevisionId)?.i18n?.en?.name, amount:line.amount, unit:line.unit })),
    automatedIssues:reviewRecipe(recipe)
  });
}
const allIssues=samples.flatMap(item=>item.automatedIssues.map(issue=>({recipeVersionId:item.recipeVersionId,issue})));
const evidence={
  schemaVersion:1, policyId:'v1-stratified-semantic-review', policyVersion:'1.0.0', reviewedAt:'2026-09-07T12:30:00.000Z',
  sampleSize:samples.length, strata:strata.map(item=>({stratumId:item.id,sampleCount:5})), automatedStatus:allIssues.length?'failed':'passed', automatedIssues:allIssues, samples
};
await writeJson(OUTPUT,evidence);
console.log(JSON.stringify({output:OUTPUT,sampleSize:samples.length,strata:strata.length,automatedStatus:evidence.automatedStatus,issueCount:allIssues.length},null,2));
for(const item of samples) console.log(`${item.stratum}\t${item.energyKcal}\t${item.titleEn}\t${item.ingredients.map(x=>`${x.amount}g ${x.nameEn}`).join(' | ')}`);
if(allIssues.length) process.exitCode=1;
