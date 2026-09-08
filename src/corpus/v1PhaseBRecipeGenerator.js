import { createHash } from 'node:crypto';

const FAMILY = Object.freeze({
  breakfastBowl:'recipe_family_yogurt_bowl', porridge:'recipe_family_porridge', egg:'recipe_family_egg_dish',
  grainBowl:'recipe_family_grain_bowl', proteinPlate:'recipe_family_protein_plate', salad:'recipe_family_salad',
  pasta:'recipe_family_pasta', onePot:'recipe_family_one_pot', snack:'recipe_family_snack_plate', side:'recipe_family_side_dish'
});
const CUISINE = 'cuisine_international';

const T = (id, family, slots, variants, practical, extra={}) => ({ id, family, slots, variants, practical, ...extra });
const noCook = (prep=5, fridge=true) => ({ prepMinutes:prep, cookMinutes:0, reheatingRequired:false, coldSuitable:true, portable:true, fridgeRequired:fridge, freezerSuitable:false, mealPrepSuitable:true });
const cooked = (prep=8,cook=12,portable=true) => ({ prepMinutes:prep, cookMinutes:cook, reheatingRequired:false, coldSuitable:false, portable, fridgeRequired:true, freezerSuitable:false, mealPrepSuitable:true });

const PROFILES = Object.freeze({
  breakfast:[
    T('fruit-yogurt-nuts', FAMILY.breakfastBowl, ['fruitReady','dairyYogurt','nutsSeeds'], [[80,80,5],[120,110,8],[150,140,10],[180,180,16],[200,220,25]], noCook(4)),
    T('cereal-yogurt-fruit', FAMILY.breakfastBowl, ['breakfastCereal','dairyYogurt','fruitReady','nutsSeeds'], [[20,80,80,4],[30,110,100,6],[40,140,120,8],[50,170,150,12],[60,200,180,20]], noCook(5)),
    T('porridge-fruit-nuts', FAMILY.porridge, ['breakfastDryGrain','dairyYogurt','fruitReady','nutsSeeds'], [[25,80,80,4],[35,100,100,6],[45,120,120,8],[60,150,150,12],[75,180,180,18]], cooked(5,8)),
    T('egg-grain-vegetable', FAMILY.egg, ['eggWhole','carbCooked','vegetableCook','oilCooking','seasoning'], [[50,60,70,2,1],[70,90,90,3,1.5],[90,120,110,4,2],[120,160,140,6,2],[150,220,180,8,3]], cooked(7,10)),
    T('egg-cheese-grain', FAMILY.egg, ['eggWhole','cheese','carbCooked','vegetableCook','oilCooking'], [[50,10,60,70,2],[70,15,90,90,3],[90,25,120,110,4],[120,35,160,140,5],[150,50,220,180,7]], cooked(8,11))
  ],
  lunch: mainProfiles('lunch'),
  dinner: mainProfiles('dinner'),
  snack:[
    T('fruit-nuts', FAMILY.snack, ['fruitReady','nutsSeeds'], [[60,4],[80,6],[120,8],[160,12],[200,20],[220,30]], noCook(2,false)),
    T('fruit-yogurt', FAMILY.snack, ['fruitReady','dairyYogurt'], [[60,60],[80,80],[120,100],[150,130],[180,170],[200,220]], noCook(3)),
    T('fruit-cheese', FAMILY.snack, ['fruitReady','cheese'], [[60,10],[80,15],[120,20],[150,30],[180,45],[200,60]], noCook(3)),
    T('fruit-nut-spread', FAMILY.snack, ['fruitReady','nutSpread'], [[60,5],[80,8],[120,12],[150,18],[180,25],[200,32]], noCook(3,false)),
    T('vegetable-legume-cup', FAMILY.salad, ['vegetableRaw','legumeCooked','condiment'], [[60,50,5],[90,65,8],[120,80,10],[150,110,12],[180,150,15]], noCook(6)),
    T('vegetable-cheese-cup', FAMILY.snack, ['vegetableRaw','cheese','condiment'], [[60,10,5],[90,15,6],[120,20,8],[150,30,10],[180,45,12]], noCook(5))
  ],
  mini_meal:[
    T('mini-fruit-yogurt-nuts', FAMILY.snack, ['fruitReady','dairyYogurt','nutsSeeds'], [[70,60,4],[100,80,6],[130,110,8],[160,140,10],[190,180,16]], noCook(4)),
    T('mini-legume-grain-salad', FAMILY.salad, ['legumeCooked','carbCooked','vegetableRaw','oilCooking'], [[50,50,60,2],[70,70,80,3],[90,90,100,4],[120,120,120,5],[150,160,150,6]], noCook(7)),
    T('mini-egg-vegetable', FAMILY.egg, ['eggWhole','vegetableCook','cheese','oilCooking'], [[45,70,10,2],[60,90,15,2],[80,110,20,3],[100,130,25,4],[130,160,35,5]], cooked(6,8)),
    T('mini-fish-grain', FAMILY.proteinPlate, ['fishSeafood','carbCooked','vegetableRaw','oilCooking'], [[50,50,60,2],[70,70,80,3],[90,90,100,4],[110,120,120,5],[140,160,150,6]], noCook(8)),
    T('mini-cheese-grain-vegetable', FAMILY.snack, ['cheese','carbCooked','vegetableRaw','condiment'], [[10,50,60,5],[15,70,80,6],[20,90,100,8],[30,120,120,10],[45,160,150,12]], noCook(6))
  ]
});

function mainProfiles(prefix) {
  const p = prefix === 'lunch' ? {prep:8,cook:12} : {prep:9,cook:15};
  const protein = (id, role, family=FAMILY.proteinPlate) => T(`${prefix}-${id}-cooked-grain`, family, [role,'carbCooked','vegetableCook','oilCooking','seasoning'], [
    [55,70,100,2,1],[75,100,120,3,1.5],[100,140,150,5,2],[130,190,180,7,2.5],[170,250,220,10,3]
  ], cooked(p.prep,p.cook));
  const dryProtein = (id, role, family=FAMILY.onePot) => T(`${prefix}-${id}-dry-grain`, family, [role,'carbDryCook','vegetableCook','oilCooking','seasoning'], [
    [60,30,100,2,1],[80,45,120,3,1.5],[110,60,150,5,2],[140,80,180,7,2.5],[180,105,220,11,3]
  ], cooked(p.prep+2,p.cook+4));
  return [
    protein('legume','legumeCooked',FAMILY.grainBowl), dryProtein('legume','legumeCooked',FAMILY.onePot),
    protein('poultry','poultry'), dryProtein('poultry','poultry'),
    protein('meat','meat'), dryProtein('meat','meat'),
    protein('fish','fishSeafood'), dryProtein('fish','fishSeafood'),
    T(`${prefix}-egg-cheese-grain`, FAMILY.egg, ['eggWhole','cheese','carbCooked','vegetableCook','oilCooking'], [[50,10,70,100,2],[70,15,100,120,3],[90,25,140,150,5],[120,35,190,180,7],[150,50,250,220,10]], cooked(p.prep,p.cook)),
    T(`${prefix}-legume-cheese-bowl`, FAMILY.grainBowl, ['legumeCooked','cheese','carbCooked','vegetableCook','oilCooking'], [[50,10,60,100,2],[70,15,90,120,3],[100,20,130,150,5],[140,30,180,180,7],[180,45,240,220,10]], cooked(p.prep,p.cook)),
    T(`${prefix}-legume-nut-bowl`, FAMILY.grainBowl, ['legumeCooked','carbCooked','vegetableCook','nutsSeeds','oilCooking'], [[50,60,100,4,2],[70,90,120,6,3],[100,130,150,10,4],[140,180,180,16,6],[180,240,220,24,8]], cooked(p.prep,p.cook))
  ];
}

function digestInt(key) { return createHash('sha256').update(key).digest().readUInt32BE(0); }
function entryMap(corpus) {
  const revisions = new Map((corpus.ingredientRevisions || []).map(item => [item.ingredientRevisionId, item]));
  return new Map((corpus.ingredientFamilies || []).filter(item => item.status === 'active').map(family => [family.ingredientId, { family, revision:revisions.get(family.currentRevisionId) }]));
}
function kcalPerGram(entry) { return Number(entry.revision?.nutrition?.energyKcal || 0) / Number(entry.revision?.basis?.amount || 100); }
function candidateEnergy(selected) { return Math.round(selected.reduce((sum,item)=>sum+kcalPerGram(item.entry)*item.amount,0)*10)/10; }
function lineWeight(selected) { return Math.round(selected.reduce((sum,item)=>sum+item.amount,0)*10)/10; }

function pickIngredient({ roleId, role, entries, key, used }) {
  const pool = role.ingredientIds || [];
  if (!pool.length) throw new Error(`Phase B role ${roleId} has no ingredients`);
  const start = digestInt(key) % pool.length;
  for (let offset=0; offset<pool.length; offset += 1) {
    const ingredientId = pool[(start + offset) % pool.length];
    if (used.has(ingredientId)) continue;
    const entry = entries.get(ingredientId);
    if (entry?.revision) return entry;
  }
  return null;
}

function shortLabel(entry, locale) {
  const raw = String(entry.revision?.i18n?.[locale]?.name || entry.revision?.i18n?.en?.name || entry.family.ingredientId).trim();
  if (locale === 'it') {
    const [base, qualifier] = raw.split('—').map(x=>x.trim());
    if (qualifier) return `${base} (${qualifier.split(',').slice(0,2).join(', ').slice(0,42)})`;
    return raw.split(',').slice(0,2).join(',').trim();
  }
  return raw.split(',').slice(0,3).join(',').replace(/\s*\([^)]*\)\s*$/,'').trim();
}
function familyPhrase(profile, selected, locale) {
  const names = selected.slice(0,3).map(item=>shortLabel(item.entry,locale));
  if (locale === 'it') {
    if (profile.family === FAMILY.salad) return `Insalata di ${names.join(', ')}`;
    if (profile.family === FAMILY.egg) return `Piatto di ${names.join(', ')}`;
    if (profile.family === FAMILY.breakfastBowl || profile.family === FAMILY.porridge) return `Bowl con ${names.join(', ')}`;
    if (profile.family === FAMILY.snack) return `Spuntino con ${names.join(', ')}`;
    return `${names[0]} con ${names.slice(1).join(' e ')}`;
  }
  if (profile.family === FAMILY.salad) return `${names.join(', ')} salad`;
  if (profile.family === FAMILY.egg) return `${names.join(', ')} plate`;
  if (profile.family === FAMILY.breakfastBowl || profile.family === FAMILY.porridge) return `Bowl with ${names.join(', ')}`;
  if (profile.family === FAMILY.snack) return `Snack with ${names.join(', ')}`;
  return `${names[0]} with ${names.slice(1).join(' and ')}`;
}
function practicalTags(practical) {
  const tags=[]; const total=Number(practical.prepMinutes||0)+Number(practical.cookMinutes||0);
  if(total<=20)tags.push('practical_quick'); if(practical.portable)tags.push('practical_portable'); if(practical.coldSuitable)tags.push('practical_cold_suitable');
  if(practical.mealPrepSuitable)tags.push('practical_meal_prep'); if(!practical.cookMinutes)tags.push('practical_no_cook'); return tags.sort();
}
function dietTags(selected) {
  const groups = new Set(selected.map(item=>item.entry.revision.taxonomy?.foodGroup));
  const hasMeat=[...groups].some(g=>['food_group_meat','food_group_poultry'].includes(g));
  const hasFish=groups.has('food_group_fish_seafood');
  const hasEgg=groups.has('food_group_eggs');
  const hasDairy=groups.has('food_group_cheese') || selected.some(item=>item.role==='dairyYogurt' && !/tofu yogurt|imitation/i.test(String(item.entry.revision.i18n?.en?.name||'')));
  const tags=[];
  if(!hasMeat&&!hasFish) tags.push('diet_vegetarian');
  if(!hasMeat&&!hasFish&&!hasEgg&&!hasDairy) tags.push('diet_vegan');
  if(!hasMeat && hasFish) tags.push('diet_pescatarian');
  return tags.sort();
}
function instructions(profile, selected, locale) {
  const names=selected.map(item=>shortLabel(item.entry,locale));
  if(locale==='it') {
    if(!profile.practical.cookMinutes) return [`Pesare ${names.slice(0,-1).join(', ')}${names.length>1?` e ${names.at(-1)}`:''} nelle quantità indicate.`, 'Preparare gli ingredienti già pronti al consumo e combinarli senza modificarne le quantità.', 'Servire come singola porzione standard.'];
    return ['Pesare tutti gli ingredienti nelle quantità indicate prima della cottura o dell’assemblaggio.', 'Cuocere completamente gli ingredienti che lo richiedono e preparare gli altri secondo lo stato indicato nel catalogo.', 'Assemblare la singola porzione senza ridimensionare o moltiplicare la ricetta.'];
  }
  if(!profile.practical.cookMinutes) return [`Weigh ${names.join(', ')} in the stated amounts.`, 'Prepare the ready-to-eat ingredients and combine them without changing the quantities.', 'Serve as one standard portion.'];
  return ['Weigh every ingredient in the stated amount before cooking or assembly.', 'Cook ingredients that require cooking thoroughly and prepare the others according to their catalog state.', 'Assemble one standard portion without resizing or multiplying the recipe.'];
}

export function phaseBRecipeProfiles() { return structuredClone(PROFILES); }

export function generatePhaseBCandidates({ meal, band, count, eligibility, corpus, multiplier=10 }) {
  const profiles=PROFILES[meal]; if(!profiles) throw new Error(`Unknown Phase B meal ${meal}`);
  const entries=entryMap(corpus); const candidates=[]; const seenIngredientSets=new Set();
  const maxAttempts=Math.max(count*multiplier*profiles.length, 1200);
  for(let attempt=0; attempt<maxAttempts && candidates.length<count*multiplier; attempt += 1) {
    const profile=profiles[attempt % profiles.length];
    const variant=profile.variants[Math.floor(attempt/profiles.length) % profile.variants.length];
    const used=new Set(); const selected=[]; let invalid=false;
    for(let slotIndex=0; slotIndex<profile.slots.length; slotIndex += 1) {
      const roleId=profile.slots[slotIndex]; const role=eligibility.roles?.[roleId];
      if(!role?.ingredientIds?.length){ invalid=true; break; }
      const entry=pickIngredient({ roleId,role,entries,key:`${meal}|${band.id}|${profile.id}|${attempt}|${slotIndex}`,used });
      if(!entry){ invalid=true; break; } used.add(entry.family.ingredientId);
      const amount=Number(variant[slotIndex]); const bounds=role.portionG;
      if(!(amount>=Number(bounds.min)&&amount<=Number(bounds.max))){ invalid=true; break; }
      selected.push({ role:roleId, entry, amount });
    }
    if(invalid) continue;
    const ingredientSet=[...used].sort().join('|');
    if(seenIngredientSets.has(ingredientSet)) continue;
    const energyKcal=candidateEnergy(selected);
    if(energyKcal<band.min || energyKcal>band.max) continue;
    seenIngredientSets.add(ingredientSet);
    const practical={...profile.practical,finalWeightG:lineWeight(selected),finalVolumeMl:null,yieldNotes:'One fixed standard serving; Phase B quantities are template-defined and never energy-fitted.'};
    const diet=dietTags(selected);
    candidates.push({
      candidateId:`phase-b-${meal}-${band.id}-${String(candidates.length+1).padStart(5,'0')}-${profile.id}`,
      i18n:{
        it:{title:familyPhrase(profile,selected,'it'),description:`Ricetta ${meal.replace('_',' ')} a porzione fissa per validazione del planner nella fascia ${band.min}-${band.max} kcal.`,instructions:instructions(profile,selected,'it')},
        en:{title:familyPhrase(profile,selected,'en'),description:`Fixed-portion ${meal.replace('_',' ')} recipe for planner validation in the ${band.min}-${band.max} kcal band.`,instructions:instructions(profile,selected,'en')}
      },
      mealArchetypes:[meal], ingredientLines:selected.map(item=>({ingredientId:item.entry.family.ingredientId,amount:item.amount,unit:item.entry.revision.basis.unit,optional:false})),
      practical, tags:{families:[profile.family],cuisines:[CUISINE],...(diet.length?{diet}:{}),practical:practicalTags(practical)},
      culinaryReview:{status:'approved',notes:`Phase B fixed-template recipe. profile=${profile.id}; energyBand=${band.id}; no serving scaling; no energy fitting by ingredient amount.`},
      phaseB:{profileId:profile.id,energyBandId:band.id,quantityStrategy:'fixed-template-only'}, expectedEnergyKcal:energyKcal
    });
  }
  return candidates;
}
