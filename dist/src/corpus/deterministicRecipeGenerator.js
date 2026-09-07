const GROUP = {
  vegetables: 'food_group_vegetables',
  fruit: 'food_group_fruit',
  fish: 'food_group_fish_seafood',
  poultry: 'food_group_poultry',
  meat: 'food_group_meat',
  legumes: 'food_group_legumes',
  grains: 'food_group_grains',
  starch: 'food_group_pasta_rice_cereals',
  dairy: 'food_group_dairy_milk_yogurt',
  cheese: 'food_group_cheese',
  eggs: 'food_group_eggs',
  nuts: 'food_group_nuts_seeds',
  oils: 'food_group_fats_oils',
  herbs: 'food_group_herbs_spices'
};

const STRATUM_TEMPLATES = {
  breakfast_quick: {
    slots: [[GROUP.grains, GROUP.starch], [GROUP.fruit], [GROUP.dairy, GROUP.nuts]], amounts: [45, 140, 80],
    family: 'recipe_family_porridge', prep: 'prep_raw', practical: { prepMinutes: 8, cookMinutes: 0, coldSuitable: true, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: false }
  },
  breakfast_protein: {
    slots: [[GROUP.eggs, GROUP.dairy, GROUP.nuts, GROUP.legumes], [GROUP.vegetables, GROUP.fruit], [GROUP.grains, GROUP.starch]], amounts: [110, 120, 45],
    family: 'recipe_family_egg_dish', prep: 'prep_sauteed', practical: { prepMinutes: 8, cookMinutes: 10, coldSuitable: false, portable: false, fridgeRequired: true, mealPrepSuitable: false, reheatingRequired: false }
  },
  snack_portable: {
    slots: [[GROUP.fruit], [GROUP.nuts], [GROUP.dairy, GROUP.legumes]], amounts: [150, 25, 80],
    family: 'recipe_family_snack_plate', prep: 'prep_raw', practical: { prepMinutes: 5, cookMinutes: 0, coldSuitable: true, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: false }
  },
  lunch_quick: {
    slots: [[GROUP.starch, GROUP.grains], [GROUP.legumes, GROUP.poultry], [GROUP.vegetables], [GROUP.oils]], amounts: [90, 120, 160, 10],
    family: 'recipe_family_grain_bowl', prep: 'prep_sauteed', practical: { prepMinutes: 8, cookMinutes: 10, coldSuitable: false, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: true }
  },
  lunch_standard: {
    slots: [[GROUP.starch, GROUP.grains], [GROUP.poultry, GROUP.meat, GROUP.legumes], [GROUP.vegetables], [GROUP.oils]], amounts: [90, 130, 180, 12],
    family: 'recipe_family_protein_plate', prep: 'prep_roasted', practical: { prepMinutes: 12, cookMinutes: 25, coldSuitable: false, portable: false, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: true }
  },
  dinner_quick: {
    slots: [[GROUP.starch, GROUP.grains], [GROUP.fish, GROUP.poultry], [GROUP.vegetables], [GROUP.oils]], amounts: [90, 140, 180, 10],
    family: 'recipe_family_one_pot', prep: 'prep_pan_fried', practical: { prepMinutes: 8, cookMinutes: 12, coldSuitable: false, portable: false, fridgeRequired: true, mealPrepSuitable: false, reheatingRequired: true }
  },
  dinner_standard: {
    slots: [[GROUP.grains, GROUP.starch], [GROUP.meat, GROUP.fish, GROUP.poultry], [GROUP.vegetables], [GROUP.oils]], amounts: [95, 150, 190, 12],
    family: 'recipe_family_baked_dish', prep: 'prep_baked', practical: { prepMinutes: 15, cookMinutes: 30, coldSuitable: false, portable: false, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: true }
  },
  vegetarian_legume: {
    slots: [[GROUP.legumes], [GROUP.grains, GROUP.starch], [GROUP.vegetables], [GROUP.oils]], amounts: [150, 85, 180, 10],
    family: 'recipe_family_grain_bowl', prep: 'prep_stewed', practical: { prepMinutes: 12, cookMinutes: 20, coldSuitable: false, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: true }
  },
  fish_seafood: {
    slots: [[GROUP.fish], [GROUP.grains, GROUP.starch], [GROUP.vegetables], [GROUP.oils], [GROUP.herbs]], amounts: [150, 85, 180, 10, 3],
    family: 'recipe_family_protein_plate', prep: 'prep_grilled', practical: { prepMinutes: 10, cookMinutes: 15, coldSuitable: false, portable: false, fridgeRequired: true, mealPrepSuitable: false, reheatingRequired: false }
  },
  soups_stews: {
    slots: [[GROUP.legumes, GROUP.meat, GROUP.poultry], [GROUP.vegetables], [GROUP.vegetables], [GROUP.grains, GROUP.starch]], amounts: [130, 140, 120, 60],
    family: 'recipe_family_soup', prep: 'prep_stewed', practical: { prepMinutes: 15, cookMinutes: 35, coldSuitable: false, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: true, finalVolumeMl: 500 }
  },
  cold_portable: {
    slots: [[GROUP.grains, GROUP.starch, GROUP.legumes], [GROUP.vegetables], [GROUP.fruit, GROUP.nuts], [GROUP.oils]], amounts: [110, 160, 80, 10],
    family: 'recipe_family_salad', prep: 'prep_raw', practical: { prepMinutes: 12, cookMinutes: 0, coldSuitable: true, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: false }
  },
  components_sides: {
    slots: [[GROUP.vegetables], [GROUP.oils], [GROUP.herbs], [GROUP.nuts, GROUP.cheese]], amounts: [220, 10, 3, 20],
    family: 'recipe_family_side_dish', prep: 'prep_roasted', practical: { prepMinutes: 8, cookMinutes: 20, coldSuitable: true, portable: true, fridgeRequired: true, mealPrepSuitable: true, reheatingRequired: false }
  }
};

function unique(values) { return [...new Set(values)]; }
function activeReadyEntries(corpus) {
  const byRevision = new Map((corpus.ingredientRevisions || []).map(item => [item.ingredientRevisionId, item]));
  return (corpus.ingredientFamilies || []).filter(family => family.status === 'active').map(family => ({ family, revision: byRevision.get(family.currentRevisionId) })).filter(({ revision }) => revision?.quality?.status === 'curated' && revision?.quality?.confidence === 'high');
}
function poolsFor(corpus) {
  const pools = new Map();
  for (const entry of activeReadyEntries(corpus)) {
    const group = entry.revision.taxonomy?.foodGroup;
    if (!pools.has(group)) pools.set(group, []);
    pools.get(group).push(entry);
  }
  for (const values of pools.values()) values.sort((a,b) => a.family.ingredientId.localeCompare(b.family.ingredientId));
  return pools;
}
function mergedPool(pools, groups) {
  return groups.flatMap(group => pools.get(group) || []).sort((a,b) => a.family.ingredientId.localeCompare(b.family.ingredientId));
}
function chooseDistinct(pool, index, used, salt) {
  if (!pool.length) return null;
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const item = pool[(index * (salt + 3) + salt * 7 + attempt) % pool.length];
    if (!used.has(item.family.ingredientId)) return item;
  }
  return null;
}
function labels(entry) {
  return {
    it: entry.revision.i18n?.it?.name || entry.revision.i18n?.en?.name || entry.family.ingredientId,
    en: entry.revision.i18n?.en?.name || entry.revision.i18n?.it?.name || entry.family.ingredientId
  };
}
function titleFor(stratumId, entries, locale) {
  const names = entries.slice(0,2).map(entry => labels(entry)[locale]);
  const prefix = locale === 'it' ? {
    breakfast_quick:'Colazione', breakfast_protein:'Colazione proteica', snack_portable:'Spuntino', lunch_quick:'Pranzo rapido', lunch_standard:'Piatto pranzo', dinner_quick:'Cena rapida', dinner_standard:'Piatto cena', vegetarian_legume:'Bowl di legumi', fish_seafood:'Piatto di pesce', soups_stews:'Zuppa', cold_portable:'Insalata fredda', components_sides:'Contorno'
  }[stratumId] : {
    breakfast_quick:'Breakfast', breakfast_protein:'Protein breakfast', snack_portable:'Portable snack', lunch_quick:'Quick lunch', lunch_standard:'Lunch plate', dinner_quick:'Quick dinner', dinner_standard:'Dinner plate', vegetarian_legume:'Legume bowl', fish_seafood:'Fish plate', soups_stews:'Soup', cold_portable:'Cold salad', components_sides:'Side dish'
  }[stratumId];
  return `${prefix}: ${names.join(locale === 'it' ? ' e ' : ' and ')}`;
}
function instructionsFor(stratumId, entries, locale) {
  const names = entries.map(entry => labels(entry)[locale]);
  const joiner = locale === 'it' ? ', ' : ', ';
  const list = names.join(joiner);
  const noCook = ['breakfast_quick','snack_portable','cold_portable'].includes(stratumId);
  if (locale === 'it') {
    if (noCook) return [`Pesare gli ingredienti: ${list}.`, 'Preparare gli ingredienti secondo lo stato indicato nel catalogo.', 'Combinare, porzionare e conservare in frigorifero se non consumato subito.'];
    if (stratumId === 'soups_stews') return [`Pesare gli ingredienti: ${list}.`, 'Cuocere gli ingredienti che lo richiedono, quindi unire in pentola.', 'Aggiungere acqua quanto basta per la consistenza e sobbollire fino a cottura completa.', 'Porzionare e raffreddare rapidamente gli avanzi.'];
    return [`Pesare gli ingredienti: ${list}.`, 'Cuocere completamente gli ingredienti crudi che lo richiedono.', 'Unire gli ingredienti con la tecnica indicata e servire nella porzione prevista.'];
  }
  if (noCook) return [`Weigh the ingredients: ${list}.`, 'Prepare each ingredient according to its catalog state.', 'Combine, portion, and refrigerate if not eaten immediately.'];
  if (stratumId === 'soups_stews') return [`Weigh the ingredients: ${list}.`, 'Cook ingredients that require cooking, then combine them in a pot.', 'Add enough water for the intended consistency and simmer until fully cooked.', 'Portion and cool leftovers promptly.'];
  return [`Weigh the ingredients: ${list}.`, 'Cook raw ingredients fully when required.', 'Combine using the stated preparation technique and serve as one standard portion.'];
}
function practicalTags(practical) {
  const out = [];
  if ((practical.prepMinutes || 0) + (practical.cookMinutes || 0) <= 20) out.push('practical_quick');
  if (practical.portable) out.push('practical_portable');
  if (practical.coldSuitable) out.push('practical_cold_suitable');
  if (practical.reheatingRequired) out.push('practical_reheatable');
  if (practical.mealPrepSuitable) out.push('practical_meal_prep');
  if ((practical.cookMinutes || 0) === 0) out.push('practical_no_cook');
  return unique(out);
}

export function pilotIngredientDiagnostics(corpus) {
  const pools = poolsFor(corpus);
  const requiredGroups = unique(Object.values(STRATUM_TEMPLATES).flatMap(template => template.slots.flat()));
  const missing = requiredGroups.filter(group => !(pools.get(group) || []).length);
  return { readyIngredientCount: activeReadyEntries(corpus).length, groupCounts: Object.fromEntries([...pools].map(([group, items]) => [group, items.length])), missingGroups: missing };
}

export function generatePilotCandidates({ intake, corpus }) {
  const pools = poolsFor(corpus);
  const diagnostics = pilotIngredientDiagnostics(corpus);
  if (diagnostics.missingGroups.length) throw new Error(`Pilot generator is missing production-ready ingredient groups: ${diagnostics.missingGroups.join(', ')}`);
  const byStratumIndex = new Map();
  const candidates = [];
  for (const record of intake.records || []) {
    const template = STRATUM_TEMPLATES[record.stratumId];
    if (!template) throw new Error(`No deterministic pilot template for ${record.stratumId}`);
    const localIndex = byStratumIndex.get(record.stratumId) || 0;
    byStratumIndex.set(record.stratumId, localIndex + 1);
    const stratumOrdinal = Object.keys(STRATUM_TEMPLATES).indexOf(record.stratumId);
    const selectionIndex = localIndex + stratumOrdinal * 11;
    const used = new Set();
    const chosen = [];
    for (let slotIndex = 0; slotIndex < template.slots.length; slotIndex += 1) {
      const pool = mergedPool(pools, template.slots[slotIndex]);
      const entry = chooseDistinct(pool, selectionIndex, used, slotIndex + 1);
      if (!entry) throw new Error(`Unable to choose distinct ingredient for ${record.candidateId} slot ${slotIndex + 1}`);
      used.add(entry.family.ingredientId); chosen.push(entry);
    }
    const practical = { ...template.practical, finalWeightG: template.practical.finalVolumeMl ? null : template.amounts.reduce((a,b)=>a+b,0), yieldNotes: 'One standard serving generated by deterministic Phase 4 production pilot.' };
    const mealArchetypes = unique(record.concept?.mealArchetypes || []);
    const candidate = {
      candidateId: record.candidateId,
      i18n: {
        it: { title: titleFor(record.stratumId, chosen, 'it'), description: `Ricetta pilota deterministica per lo strato ${record.stratumId}.`, instructions: instructionsFor(record.stratumId, chosen, 'it') },
        en: { title: titleFor(record.stratumId, chosen, 'en'), description: `Deterministic pilot recipe for stratum ${record.stratumId}.`, instructions: instructionsFor(record.stratumId, chosen, 'en') }
      },
      mealArchetypes,
      ingredientLines: chosen.map((entry, index) => ({ ingredientId: entry.family.ingredientId, amount: template.amounts[index], unit: 'g', optional: false })),
      practical,
      tags: { families:[template.family], cuisines:['cuisine_international'], flavor:['flavor_neutral'], practical:practicalTags(practical), preparation:[template.prep] },
      culinaryReview: { status:'approved', notes:`Deterministic Phase 4 pilot template ${record.stratumId}; canonical ingredients only; structure and safety semantics reviewed by recipe-pilot-generator-v1.` }
    };
    candidates.push(candidate);
  }
  return { candidates, diagnostics };
}

export function buildPilotWaveJob({ intake, candidates, corpus, contract, contractDigest, waveNumber, waveSize = 20, targetCatalogVersion = '1.0.0-production-pilot' }) {
  const start = (waveNumber - 1) * waveSize;
  const waveIds = new Set((intake.records || []).slice(start, start + waveSize).map(item => item.candidateId));
  const waveCandidates = candidates.filter(candidate => waveIds.has(candidate.candidateId));
  if (waveCandidates.length !== waveSize) throw new Error(`Pilot wave ${waveNumber} expected ${waveSize} candidates, got ${waveCandidates.length}`);
  const allowedIngredientIds = activeReadyEntries(corpus).map(entry => entry.family.ingredientId).sort();
  const mealArchetypes = unique(waveCandidates.flatMap(candidate => candidate.mealArchetypes)).sort();
  return {
    schemaVersion:1,
    jobId:`pilot-production-wave-${String(waveNumber).padStart(2,'0')}`,
    targetCatalogVersion,
    referenceDataVersion:intake.referenceDataVersion,
    referenceDataDigest:intake.referenceDataDigest,
    seed:`${intake.seed}-wave-${String(waveNumber).padStart(2,'0')}`,
    pipelineVersion:contract.pipelineVersion,
    sourceLocale:'en', requiredLocales:[...contract.requiredLocales], targetAcceptedCount:waveSize, candidateCount:waveSize,
    mealArchetypes,
    energyKcal:{ min:0, max:2500 }, proteinG:null, fiberG:null, maxTotalMinutes:null,
    coverageTargets:[{ targetId:`pilot-wave-${String(waveNumber).padStart(2,'0')}-structural`, key:'pilot', desiredAcceptedGain:waveSize }],
    allowedIngredientIds,
    diversityTargets:{ minDistinctPrimaryIngredients:1, minDistinctIngredientIds:1, maxPrimaryIngredientFrequency:waveSize, maxIngredientPairFrequency:waveSize },
    productionContract:{ contractId:contract.contractId, contractVersion:contract.contractVersion, contractDigest }
  };
}

export function pilotTemplateIds() { return Object.keys(STRATUM_TEMPLATES); }

function macroReliable(entry, tolerance = 0.15) {
  const n = entry.revision.nutrition || {};
  const energy = Number(n.energyKcal || 0);
  if (energy <= 0) return false;
  const macro = Number(n.proteinG || 0) * 4 + Number(n.carbsG || 0) * 4 + Number(n.fatG || 0) * 9;
  return Math.abs(macro - energy) / energy <= tolerance;
}
function energyFor(entries, amounts) {
  return entries.reduce((sum, entry, index) => sum + Number(entry.revision.nutrition?.energyKcal || 0) * Number(amounts[index] || 0) / 100, 0);
}
function rangeBound(range, key, fallback) {
  if (!range || range[key] == null) return fallback;
  const value=Number(range[key]);
  return Number.isFinite(value) ? value : fallback;
}
function roundAmount(value) { return Math.round(value * 100) / 100; }
function solveAmountsForEnergy(entries, baseAmounts, energyRange) {
  const baseEnergy=energyFor(entries,baseAmounts);
  if (!(baseEnergy > 0)) return null;
  const baseTotal=baseAmounts.reduce((sum,value)=>sum+Number(value||0),0);
  const minEnergy=rangeBound(energyRange,'min',0);
  const maxEnergy=rangeBound(energyRange,'max',Number.POSITIVE_INFINITY);
  const lower=Math.max(40/baseTotal,minEnergy>0?minEnergy/baseEnergy:0);
  const lineUpper=Math.min(...baseAmounts.map(amount=>1500/Number(amount||1)));
  const upper=Math.min(2500/baseTotal,lineUpper,Number.isFinite(maxEnergy)?maxEnergy/baseEnergy:Number.POSITIVE_INFINITY);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return null;
  const finiteTargetMax=Number.isFinite(maxEnergy)?maxEnergy:Math.max(minEnergy,baseEnergy);
  const targetEnergy=minEnergy>0 || Number.isFinite(maxEnergy) ? (minEnergy+finiteTargetMax)/2 : baseEnergy;
  const preferred=targetEnergy/baseEnergy;
  const candidates=[Math.min(upper,Math.max(lower,preferred)),lower+(upper-lower)*0.5,lower,upper];
  for(const factor of candidates){
    if(!Number.isFinite(factor) || factor<=0) continue;
    const amounts=baseAmounts.map(amount=>roundAmount(amount*factor));
    const total=amounts.reduce((sum,value)=>sum+value,0);
    const energy=energyFor(entries,amounts);
    if(total<40-1e-6 || total>2500+1e-6) continue;
    if(amounts.some(amount=>amount<=0 || amount>1500+1e-6)) continue;
    if(energy<minEnergy-0.05 || energy>maxEnergy+0.05) continue;
    return {amounts,factor,energyKcal:energy,baseEnergyKcal:baseEnergy};
  }
  return null;
}
function portablePractical(job) {
  const targets = new Set(job.practicalityTargets || []);
  const quick = targets.has('practical_quick') || job.maxTotalMinutes != null;
  return {
    prepMinutes: quick ? 8 : 12, cookMinutes: 0,
    reheatingRequired: targets.has('practical_reheatable'),
    coldSuitable: !targets.has('practical_reheatable'),
    portable: targets.has('practical_portable') || true,
    fridgeRequired: true,
    mealPrepSuitable: targets.has('practical_meal_prep') || true,
    finalWeightG: null, yieldNotes:'One standard serving generated by deterministic Phase 4 scale candidate generator.'
  };
}

export function generatePortableScaleCandidates({ job, intake, corpus }) {
  if (job.proteinG != null || job.fiberG != null) throw new Error('Portable scale generator requires unconstrained proteinG and fiberG; use a generator matching the job nutrition intent');
  const all = activeReadyEntries(corpus).filter(entry => job.allowedIngredientIds.includes(entry.family.ingredientId) && macroReliable(entry));
  const byGroup = new Map();
  for (const entry of all) {
    const group=entry.revision.taxonomy?.foodGroup;
    if(!byGroup.has(group)) byGroup.set(group,[]);
    byGroup.get(group).push(entry);
  }
  for(const values of byGroup.values()) values.sort((a,b)=>a.family.ingredientId.localeCompare(b.family.ingredientId));
  const first = [...(byGroup.get(GROUP.fruit)||[]), ...(byGroup.get(GROUP.vegetables)||[])];
  const second = [...(byGroup.get(GROUP.nuts)||[]), ...(byGroup.get(GROUP.legumes)||[])];
  const third = [...(byGroup.get(GROUP.dairy)||[]), ...(byGroup.get(GROUP.eggs)||[]), ...(byGroup.get(GROUP.grains)||[])];
  if (first.length < 20 || second.length < 15 || third.length < 15) throw new Error(`Scale candidate pools are insufficient after macro reliability filter: first=${first.length}, second=${second.length}, third=${third.length}`);
  const targetEnergy=(Number(job.energyKcal.min)+Number(job.energyKcal.max))/2;
  const practical=portablePractical(job);
  const family=(job.recipeFamilies||[])[0] || 'recipe_family_snack_plate';
  const cuisine=(job.cuisineFocus||[])[0] || 'cuisine_international';
  const practicalTagsSet=new Set([...practicalTags(practical), ...(job.practicalityTargets||[])]);
  const candidates=[];
  let infeasibleCombinationAttempts=0;
  let minScaleFactor=Number.POSITIVE_INFINITY; let maxScaleFactor=0; let minGeneratedEnergy=Number.POSITIVE_INFINITY; let maxGeneratedEnergy=0;
  const baseAmounts=[150,28,100];
  for(let index=0; index<intake.records.length; index+=1){
    const record=intake.records[index];
    let entries=null; let solved=null;
    const maxAttempts=Math.max(32,Math.min(256,first.length+second.length+third.length));
    for(let attempt=0; attempt<maxAttempts; attempt+=1){
      const a=first[(index*7+attempt*3)%first.length];
      const b=second[(index*11+3+attempt*5)%second.length];
      const c=third[(index*13+5+attempt*7)%third.length];
      const ids=[a.family.ingredientId,b.family.ingredientId,c.family.ingredientId];
      if(new Set(ids).size!==ids.length){infeasibleCombinationAttempts+=1;continue;}
      const candidateEntries=[a,b,c];
      const candidateSolution=solveAmountsForEnergy(candidateEntries,baseAmounts,job.energyKcal);
      if(!candidateSolution){infeasibleCombinationAttempts+=1;continue;}
      entries=candidateEntries; solved=candidateSolution; break;
    }
    if(!entries || !solved) throw new Error(`Portable scale candidate ${record.candidateId} has no feasible ingredient combination for energy ${job.energyKcal.min}-${job.energyKcal.max} kcal under production amount bounds`);
    const amounts=solved.amounts;
    minScaleFactor=Math.min(minScaleFactor,solved.factor); maxScaleFactor=Math.max(maxScaleFactor,solved.factor);
    minGeneratedEnergy=Math.min(minGeneratedEnergy,solved.energyKcal); maxGeneratedEnergy=Math.max(maxGeneratedEnergy,solved.energyKcal);
    const total=amounts.reduce((x,y)=>x+y,0); practical.finalWeightG=total;
    const requiredMeals=unique(job.mealArchetypes||[]);
    const itNames=entries.map(entry=>labels(entry).it); const enNames=entries.map(entry=>labels(entry).en);
    const candidate={
      candidateId:record.candidateId,
      i18n:{
        it:{title:`Mini pasto: ${itNames[0]} e ${itNames[1]} con ${itNames[2]}`,description:'Mini pasto portatile generato deterministicamente da ingredienti production-ready.',instructions:[`Pesare gli ingredienti: ${itNames.join(', ')}.`,'Preparare ogni ingrediente secondo lo stato canonico del catalogo.','Combinare nella porzione prevista e conservare in frigorifero se non consumato subito.']},
        en:{title:`Mini meal: ${enNames[0]} and ${enNames[1]} with ${enNames[2]}`,description:'Portable mini meal generated deterministically from production-ready ingredients.',instructions:[`Weigh the ingredients: ${enNames.join(', ')}.`,'Prepare each ingredient according to its canonical catalog state.','Combine as one standard portion and refrigerate if not eaten immediately.']}
      },
      mealArchetypes:requiredMeals,
      ingredientLines:entries.map((entry,i)=>({ingredientId:entry.family.ingredientId,amount:amounts[i],unit:'g',optional:false})),
      practical:{...practical,finalWeightG:total},
      tags:{families:[family],cuisines:[cuisine],flavor:['flavor_neutral'],practical:[...practicalTagsSet].sort(),preparation:['prep_raw'],...(job.requiredTags?.length?{diet:[...job.requiredTags]}:{})},
      culinaryReview:{status:'approved',notes:'Deterministic focused scale candidate; canonical curated/high ingredients; amounts solved against frozen job energy and production normalization bounds by recipe-scale-generator-v2.'}
    };
    candidates.push(candidate);
  }
  return {candidates,diagnostics:{
    generatorVersion:'recipe-scale-generator-v2',eligibleMacroReliableIngredients:all.length,poolSizes:{first:first.length,second:second.length,third:third.length},targetEnergyKcal:targetEnergy,
    infeasibleCombinationAttempts,minScaleFactor:Number.isFinite(minScaleFactor)?minScaleFactor:null,maxScaleFactor:maxScaleFactor||null,
    generatedEnergyRangeKcal:{min:Number.isFinite(minGeneratedEnergy)?Math.round(minGeneratedEnergy*100)/100:null,max:maxGeneratedEnergy?Math.round(maxGeneratedEnergy*100)/100:null}
  }};
}

const CONTROLLED_SCALE_PROFILES = Object.freeze({
  breakfast: [
    { profileId:'breakfast-grain-fruit', slots:[[GROUP.grains,GROUP.starch],[GROUP.fruit],[GROUP.dairy,GROUP.nuts]], amounts:[170,130,90], family:'recipe_family_grain_bowl', practical:{prepMinutes:8,cookMinutes:10,reheatingRequired:false,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:false} },
    { profileId:'breakfast-egg-plate', slots:[[GROUP.eggs],[GROUP.vegetables],[GROUP.grains,GROUP.starch]], amounts:[170,130,100], family:'recipe_family_egg_dish', practical:{prepMinutes:8,cookMinutes:12,reheatingRequired:false,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:false} },
    { profileId:'breakfast-fruit-nut', slots:[[GROUP.fruit],[GROUP.nuts],[GROUP.dairy,GROUP.grains]], amounts:[180,45,110], family:'recipe_family_snack_plate', practical:{prepMinutes:6,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:false} }
  ],
  snack: [
    { profileId:'snack-fruit-nut', slots:[[GROUP.fruit],[GROUP.nuts],[GROUP.dairy,GROUP.legumes]], amounts:[180,35,100], family:'recipe_family_snack_plate', practical:{prepMinutes:5,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:false} },
    { profileId:'snack-veg-legume', slots:[[GROUP.vegetables],[GROUP.legumes],[GROUP.cheese,GROUP.nuts]], amounts:[180,100,45], family:'recipe_family_snack_plate', practical:{prepMinutes:8,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'snack-fruit-grain', slots:[[GROUP.fruit],[GROUP.grains,GROUP.starch],[GROUP.dairy,GROUP.nuts]], amounts:[160,90,80], family:'recipe_family_snack_plate', practical:{prepMinutes:6,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:false} }
  ],
  lunch: [
    { profileId:'lunch-grain-bowl', slots:[[GROUP.starch,GROUP.grains],[GROUP.legumes,GROUP.poultry,GROUP.fish],[GROUP.vegetables],[GROUP.oils]], amounts:[180,130,150,12], family:'recipe_family_grain_bowl', practical:{prepMinutes:12,cookMinutes:20,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'lunch-protein-plate', slots:[[GROUP.legumes,GROUP.poultry,GROUP.fish,GROUP.meat],[GROUP.vegetables],[GROUP.starch,GROUP.grains],[GROUP.oils]], amounts:[180,150,120,12], family:'recipe_family_protein_plate', practical:{prepMinutes:12,cookMinutes:22,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'lunch-legume-bowl', slots:[[GROUP.legumes],[GROUP.starch,GROUP.grains],[GROUP.vegetables],[GROUP.oils]], amounts:[180,130,150,10], family:'recipe_family_grain_bowl', practical:{prepMinutes:10,cookMinutes:18,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} }
  ],
  dinner: [
    { profileId:'dinner-protein-plate', slots:[[GROUP.fish,GROUP.poultry,GROUP.meat,GROUP.legumes],[GROUP.vegetables],[GROUP.starch,GROUP.grains],[GROUP.oils]], amounts:[185,155,120,12], family:'recipe_family_protein_plate', practical:{prepMinutes:12,cookMinutes:25,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'dinner-grain-bowl', slots:[[GROUP.starch,GROUP.grains],[GROUP.fish,GROUP.poultry,GROUP.meat,GROUP.legumes],[GROUP.vegetables],[GROUP.oils]], amounts:[180,140,160,12], family:'recipe_family_grain_bowl', practical:{prepMinutes:12,cookMinutes:24,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'dinner-legume-plate', slots:[[GROUP.legumes],[GROUP.vegetables],[GROUP.starch,GROUP.grains],[GROUP.oils]], amounts:[185,155,120,10], family:'recipe_family_protein_plate', practical:{prepMinutes:10,cookMinutes:20,reheatingRequired:true,coldSuitable:false,portable:false,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} }
  ],
  mini_meal: [
    { profileId:'mini-fruit-nut', slots:[[GROUP.fruit,GROUP.vegetables],[GROUP.nuts,GROUP.legumes],[GROUP.dairy,GROUP.eggs,GROUP.grains]], amounts:[170,45,105], family:'recipe_family_snack_plate', practical:{prepMinutes:6,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} },
    { profileId:'mini-veg-legume', slots:[[GROUP.vegetables],[GROUP.legumes,GROUP.nuts],[GROUP.grains,GROUP.dairy]], amounts:[170,100,90], family:'recipe_family_snack_plate', practical:{prepMinutes:8,cookMinutes:0,reheatingRequired:false,coldSuitable:true,portable:true,fridgeRequired:true,freezerSuitable:false,mealPrepSuitable:true} }
  ]
});

function controlledScaleActiveRecipeVersions(corpus) {
  const byId = new Map((corpus.recipeVersions || []).map(version => [version.recipeVersionId, version]));
  return (corpus.recipeFamilies || []).filter(family => family.status === 'active').map(family => byId.get(family.currentVersionId)).filter(Boolean);
}
function ingredientSetKey(ids) { return [...new Set(ids)].sort().join('|'); }
function ingredientPairKeys(ids) {
  const values=[...new Set(ids)].sort(); const out=[];
  for(let i=0;i<values.length;i+=1) for(let j=i+1;j<values.length;j+=1) out.push(`${values[i]}\u0000${values[j]}`);
  return out;
}
function controlledScaleExistingSets(corpus) { return new Set(controlledScaleActiveRecipeVersions(corpus).map(recipe=>ingredientSetKey((recipe.ingredientLines||[]).map(line=>line.ingredientId)))); }
function orderedControlledPool(entries, preferred) {
  const priority=new Map((preferred||[]).map((id,index)=>[id,index]));
  return [...entries].sort((a,b)=>{
    const ap=priority.has(a.family.ingredientId)?priority.get(a.family.ingredientId):Number.MAX_SAFE_INTEGER;
    const bp=priority.has(b.family.ingredientId)?priority.get(b.family.ingredientId):Number.MAX_SAFE_INTEGER;
    return ap-bp || a.family.ingredientId.localeCompare(b.family.ingredientId);
  });
}
function controlledScalePools(job, corpus) {
  const allowed=new Set(job.allowedIngredientIds||[]); const preferred=job.preferredUnderusedIngredientIds||[]; const pools=new Map();
  for(const entry of activeReadyEntries(corpus).filter(entry=>allowed.has(entry.family.ingredientId) && macroReliable(entry))){
    const group=entry.revision.taxonomy?.foodGroup; if(!pools.has(group)) pools.set(group,[]); pools.get(group).push(entry);
  }
  for(const [group,values] of pools) pools.set(group,orderedControlledPool(values,preferred));
  return pools;
}
function controlledTitle(meal, entries, locale) {
  const names=entries.slice(0,3).map(entry=>labels(entry)[locale]);
  const prefixes=locale==='it'
    ? {breakfast:'Colazione',snack:'Spuntino',lunch:'Bowl pranzo',dinner:'Piatto cena',mini_meal:'Mini pasto'}
    : {breakfast:'Breakfast',snack:'Snack',lunch:'Lunch bowl',dinner:'Dinner plate',mini_meal:'Mini meal'};
  const joiner=locale==='it'?' e ':' and '; const connector=locale==='it'?' con ':' with ';
  return `${prefixes[meal]||(locale==='it'?'Piatto':'Dish')}: ${names.slice(0,2).join(joiner)}${connector}${names[2]}`;
}
function controlledInstructions(entries, locale) {
  const names=entries.map(entry=>labels(entry)[locale]).join(', ');
  if(locale==='it') return [
    `Pesare gli ingredienti nella quantità indicata: ${names}.`,
    'Usare ogni ingrediente nello stato canonico indicato nel catalogo; cuocere completamente gli alimenti che non sono già cotti o pronti al consumo.',
    'Combinare gli ingredienti nella porzione prevista e refrigerare gli avanzi o la porzione preparata se non consumata subito.'
  ];
  return [
    `Weigh the ingredients in the stated amounts: ${names}.`,
    'Use each ingredient in its canonical catalog state; fully cook any food that is not already cooked or ready to eat.',
    'Combine the ingredients as one portion and refrigerate leftovers or the prepared portion if it is not eaten immediately.'
  ];
}
function validateControlledScaleJob(job) {
  if(job.proteinG!=null || job.fiberG!=null) throw new Error('Controlled scale 500 generator requires unconstrained proteinG and fiberG');
  if((job.mealArchetypes||[]).length!==1) throw new Error('Controlled scale 500 generator requires exactly one mealArchetype per job');
  const meal=job.mealArchetypes[0]; if(!CONTROLLED_SCALE_PROFILES[meal]) throw new Error(`Controlled scale 500 generator has no profile registry for ${meal}`);
  if((job.requiredTags||[]).length || (job.forbiddenTags||[]).length || (job.practicalityTargets||[]).length || (job.recipeFamilies||[]).length || (job.cuisineFocus||[]).length) throw new Error('Controlled scale 500 generator accepts only meal+energy focused jobs; additional semantic targets require a dedicated generator profile');
  return meal;
}

export function generateControlledScaleCandidates({ job, intake, corpus }) {
  const meal=validateControlledScaleJob(job); const profiles=CONTROLLED_SCALE_PROFILES[meal]; const pools=controlledScalePools(job,corpus);
  const existingSets=controlledScaleExistingSets(corpus); const generatedSets=new Set(); const generatedPairCounts=new Map(); const candidates=[];
  let infeasibleCombinationAttempts=0, duplicateSetAvoidances=0, pairLimitAvoidances=0, minScaleFactor=Number.POSITIVE_INFINITY, maxScaleFactor=0, minGeneratedEnergy=Number.POSITIVE_INFINITY, maxGeneratedEnergy=0;
  const profileUsage={};
  for(let index=0; index<(intake.records||[]).length; index+=1){
    const record=intake.records[index]; let chosen=null, solved=null, profile=null;
    const maxAttempts=800;
    for(let attempt=0; attempt<maxAttempts; attempt+=1){
      profile=profiles[(index+attempt)%profiles.length]; const used=new Set(); const entries=[]; let missing=false;
      for(let slotIndex=0; slotIndex<profile.slots.length; slotIndex+=1){
        const pool=mergedPool(pools,profile.slots[slotIndex]);
        const entry=chooseDistinct(pool,index+attempt*5,used,slotIndex+3+(attempt%11));
        if(!entry){missing=true;break;} used.add(entry.family.ingredientId); entries.push(entry);
      }
      if(missing){infeasibleCombinationAttempts+=1;continue;}
      const ids=entries.map(entry=>entry.family.ingredientId); const setKey=ingredientSetKey(ids);
      if(existingSets.has(setKey)||generatedSets.has(setKey)){duplicateSetAvoidances+=1;continue;}
      const pairs=ingredientPairKeys(ids); const maxPair=Math.max(1,Number(job.diversityTargets?.maxIngredientPairFrequency||2));
      if(pairs.some(key=>(generatedPairCounts.get(key)||0)>=maxPair)){pairLimitAvoidances+=1;continue;}
      const solution=solveAmountsForEnergy(entries,profile.amounts,job.energyKcal);
      if(!solution){infeasibleCombinationAttempts+=1;continue;}
      chosen=entries; solved=solution; generatedSets.add(setKey); for(const key of pairs) generatedPairCounts.set(key,(generatedPairCounts.get(key)||0)+1); break;
    }
    if(!chosen || !solved || !profile) throw new Error(`Controlled scale candidate ${record.candidateId} has no feasible canonical profile for ${meal} ${job.energyKcal.min}-${job.energyKcal.max} kcal`);
    profileUsage[profile.profileId]=(profileUsage[profile.profileId]||0)+1;
    minScaleFactor=Math.min(minScaleFactor,solved.factor); maxScaleFactor=Math.max(maxScaleFactor,solved.factor); minGeneratedEnergy=Math.min(minGeneratedEnergy,solved.energyKcal); maxGeneratedEnergy=Math.max(maxGeneratedEnergy,solved.energyKcal);
    const amounts=solved.amounts; const total=amounts.reduce((sum,value)=>sum+value,0); const practical={...profile.practical,finalWeightG:total,finalVolumeMl:null,yieldNotes:'One standard serving generated by controlled-scale-generator-v1.'};
    const family=profile.family;
    candidates.push({
      candidateId:record.candidateId,
      i18n:{
        it:{title:controlledTitle(meal,chosen,'it'),description:`Ricetta ${meal} generata deterministicamente per la copertura controllata verso Scale Gate 500.`,instructions:controlledInstructions(chosen,'it')},
        en:{title:controlledTitle(meal,chosen,'en'),description:`Deterministic ${meal} recipe generated for controlled coverage toward Scale Gate 500.`,instructions:controlledInstructions(chosen,'en')}
      },
      mealArchetypes:[meal],
      ingredientLines:chosen.map((entry,i)=>({ingredientId:entry.family.ingredientId,amount:amounts[i],unit:'g',optional:false})),
      practical,
      tags:{families:[family],cuisines:['cuisine_international'],practical:practicalTags(practical)},
      culinaryReview:{status:'approved',notes:`Controlled scale profile ${profile.profileId}; canonical curated/high ingredients only; energy solved inside the frozen job band; no cuisine or preparation semantics inferred beyond the explicit profile.`}
    });
  }
  return {candidates,diagnostics:{
    generatorVersion:'controlled-scale-generator-v1',mealArchetype:meal,energyKcal:job.energyKcal,eligibleMacroReliableIngredients:[...pools.values()].reduce((sum,values)=>sum+values.length,0),profileUsage,
    infeasibleCombinationAttempts,duplicateSetAvoidances,pairLimitAvoidances,minScaleFactor:Number.isFinite(minScaleFactor)?minScaleFactor:null,maxScaleFactor:maxScaleFactor||null,
    generatedEnergyRangeKcal:{min:Number.isFinite(minGeneratedEnergy)?Math.round(minGeneratedEnergy*100)/100:null,max:maxGeneratedEnergy?Math.round(maxGeneratedEnergy*100)/100:null}
  }};
}

export function controlledScaleProfileIds() { return Object.fromEntries(Object.entries(CONTROLLED_SCALE_PROFILES).map(([meal,profiles])=>[meal,profiles.map(profile=>profile.profileId)])); }
