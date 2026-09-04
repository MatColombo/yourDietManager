import { sha256Json, sha256Text } from '../../src/lib/crypto.js';

const N = {
  energy: ['2047', '2048', '1008', '208', 'metabolizable energy', 'energy'],
  protein: ['1003', '203', 'protein'], carbs: ['1005', '205', 'carbohydrate'], fat: ['1004', '204', 'total lipid', 'total fat'],
  fiber: ['1079', '291', 'fiber'], sugars: ['2000', '269', 'sugars'], satFat: ['1258', '606', 'saturated'], sodium: ['1093', '307', 'sodium']
};
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nutrientMatch(food, aliases) {
  if (!isRecord(food)) return null;
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const item of nutrients) {
    if (!isRecord(item)) continue;
    const n = isRecord(item.nutrient) ? item.nutrient : {};
    const keys = [String(n.id || ''), String(n.number || ''), String(n.name || '').toLowerCase()];
    if (aliases.some(alias => keys.some(key => key === alias || (typeof alias === 'string' && key.includes(alias))))) {
      const value = Number(item.amount);
      if (Number.isFinite(value)) return { value, nutrientId: String(n.id || n.number || ''), nutrientName: String(n.name || '') };
    }
  }
  return null;
}
function nutrient(food, aliases) { return nutrientMatch(food, aliases)?.value ?? null; }
function energyNutrient(food, dataset = '') {
  const foundation = /foundation/i.test(String(dataset));
  const priority = foundation
    ? [
        { aliases:['2047','metabolizable energy (atwater general factor)'], basis:'atwater_general' },
        { aliases:['2048','metabolizable energy (atwater specific factor)'], basis:'atwater_specific' },
        { aliases:['1008','208','energy'], basis:'legacy_energy' }
      ]
    : [
        { aliases:['1008','208','energy'], basis:'legacy_energy' },
        { aliases:['2047','metabolizable energy (atwater general factor)'], basis:'atwater_general' },
        { aliases:['2048','metabolizable energy (atwater specific factor)'], basis:'atwater_specific' }
      ];
  for (const candidate of priority) {
    const match = nutrientMatch(food, candidate.aliases);
    if (match) return { ...match, basis: candidate.basis };
  }
  return null;
}
function foodGroup(category = '') {
  const c = category.toLowerCase();
  if (c.includes('vegetable')) return 'food_group_vegetables';
  if (c.includes('fruit')) return 'food_group_fruit';
  if (c.includes('finfish') || c.includes('shellfish')) return 'food_group_fish_seafood';
  if (c.includes('poultry')) return 'food_group_poultry';
  if (c.includes('beef') || c.includes('pork') || c.includes('lamb') || c.includes('meat')) return 'food_group_meat';
  if (c.includes('legume')) return 'food_group_legumes';
  if (c.includes('cereal') || c.includes('grain')) return 'food_group_grains';
  if (c.includes('dairy')) return 'food_group_dairy_milk_yogurt';
  if (c.includes('cheese')) return 'food_group_cheese';
  if (c.includes('egg')) return 'food_group_eggs';
  if (c.includes('nut') || c.includes('seed')) return 'food_group_nuts_seeds';
  if (c.includes('oil') || c.includes('fat')) return 'food_group_fats_oils';
  if (c.includes('beverage')) return 'food_group_beverages';
  if (c.includes('spice') || c.includes('herb')) return 'food_group_herbs_spices';
  if (c.includes('sauce') || c.includes('condiment')) return 'food_group_sauces_condiments';
  return 'food_group_other';
}
function suggestedState(description = '') {
  const d = description.toLowerCase();
  if (/\braw\b/.test(d)) return 'raw';
  if (/\bcooked\b|\bboiled\b|\bbaked\b|\broasted\b/.test(d)) return 'cooked';
  if (/\bdry\b|\bdried\b/.test(d)) return 'dry';
  if (/\bdrained\b/.test(d)) return 'drained';
  if (/\bprepared\b/.test(d)) return 'prepared';
  if (/\bready[- ]to[- ]eat\b/.test(d)) return 'ready_to_eat';
  return 'unknown';
}
function allergens(description = '', category = '') {
  const text = `${description} ${category}`.toLowerCase(); const ids = [];
  const rules = [['peanut','peanuts'],['almond','tree_nuts'],['cashew','tree_nuts'],['walnut','tree_nuts'],['pistachio','tree_nuts'],['hazelnut','tree_nuts'],['milk','milk'],['cheese','milk'],['yogurt','milk'],['egg','eggs'],['salmon','fish'],['tuna','fish'],['pollock','fish'],['anchov','fish'],['shrimp','crustaceans'],['crab','crustaceans'],['lobster','crustaceans'],['soy','soy'],['sesame','sesame'],['wheat','gluten_cereals'],['barley','gluten_cereals'],['rye','gluten_cereals']];
  for (const [needle, id] of rules) if (text.includes(needle)) ids.push(id);
  return [...new Set(ids)].sort();
}

export async function prepareFdcCurationBatch({ raw, foods, sourcePolicy, policy, importedAt = null }) {
  if (!Array.isArray(foods)) throw new Error(`${sourcePolicy.dataset} JSON does not contain the expected food array`);
  const rows = []; let incomplete = 0; let structurallyInvalid = 0;
  const structurallyInvalidExamples = [];
  for (let index = 0; index < foods.length; index += 1) {
    const food = foods[index];
    if (!isRecord(food)) {
      structurallyInvalid += 1;
      if (structurallyInvalidExamples.length < 20) structurallyInvalidExamples.push({ index, reason: food == null ? 'null_food_record' : 'non_object_food_record' });
      continue;
    }
    if (food.fdcId == null || String(food.fdcId).trim() === '') {
      structurallyInvalid += 1;
      if (structurallyInvalidExamples.length < 20) structurallyInvalidExamples.push({ index, reason: 'missing_fdc_id' });
      continue;
    }
    const energy = energyNutrient(food, sourcePolicy.dataset);
    const required = { energyKcal: energy?.value ?? null, proteinG: nutrient(food, N.protein), carbsG: nutrient(food, N.carbs), fatG: nutrient(food, N.fat), fiberG: nutrient(food, N.fiber) };
    if (Object.values(required).some(value => value == null)) { incomplete += 1; continue; }
    const category = food.foodCategory?.description || food.foodCategory?.code || '';
    const description = food.description || food.commonName || `FDC ${food.fdcId}`;
    rows.push({
      sourceRecordId: String(food.fdcId), description, commonName: food.commonName || null, category,
      nutrition: { ...required, energyBasis: energy?.basis || 'unknown', energyNutrientId: energy?.nutrientId || null, sugarsG: nutrient(food, N.sugars), saturatedFatG: nutrient(food, N.satFat), sodiumMg: nutrient(food, N.sodium) },
      suggested: { ingredientId: `ing_fdc_${food.fdcId}`, nameEn: food.commonName || food.description || '', nameIt: '', aliasesEn: [], aliasesIt: [], foodGroup: foodGroup(category), foodSubgroup: null, flavorProfile: 'flavor_neutral', mealArchetypes: ['breakfast','lunch','dinner','snack'], state: suggestedState(description), allergenIds: allergens(description, category), conversions: [] },
      review: { decision: 'pending', approved: false, checks: { italianLabel: false, taxonomy: false, state: false, allergens: false, culinarySuitability: false, duplicate: false, nutrition: false, source: false }, reviewer: null, reviewedAt: null, notes: 'Review every suggested mapping explicitly before approval. Heuristics are proposals, not canonical data.', duplicateOfIngredientId: null }
    });
  }
  const inputDigest = await sha256Text(raw);
  const batchId = `curation-${sourcePolicy.sourceId}-${(await sha256Json({ sourceId: sourcePolicy.sourceId, inputDigest })).slice(0, 16)}`;
  return {
    schemaVersion: 1, batchId, policyId: policy.policyId, policyVersion: policy.policyVersion,
    source: { sourceId: sourcePolicy.sourceId, provider: sourcePolicy.provider, dataset: sourcePolicy.dataset, release: sourcePolicy.release, reference: sourcePolicy.reference, archive: sourcePolicy.archive, license: sourcePolicy.license, inputDigest, importedAt: importedAt || new Date().toISOString() },
    inputFoodCount: foods.length, completeRequiredNutrientCount: rows.length, incompleteRequiredNutrientCount: incomplete,
    structurallyInvalidFoodCount: structurallyInvalid, structurallyInvalidFoodExamples: structurallyInvalidExamples, records: rows
  };
}
