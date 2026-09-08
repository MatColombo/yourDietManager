const PORTIONS = Object.freeze({
  fruitReady: { min: 60, default: 120, max: 220 },
  fruitDried: { min: 10, default: 25, max: 45 },
  vegetableRaw: { min: 60, default: 120, max: 220 },
  vegetableCook: { min: 70, default: 160, max: 280 },
  carbCooked: { min: 60, default: 140, max: 280 },
  carbDryCook: { min: 25, default: 60, max: 120 },
  breakfastCereal: { min: 15, default: 35, max: 70 },
  breakfastDryGrain: { min: 20, default: 45, max: 80 },
  legumeCooked: { min: 50, default: 120, max: 220 },
  nutsSeeds: { min: 4, default: 15, max: 35 },
  nutSpread: { min: 5, default: 15, max: 35 },
  dairyYogurt: { min: 60, default: 140, max: 240 },
  cheese: { min: 10, default: 35, max: 80 },
  eggWhole: { min: 45, default: 100, max: 160 },
  poultry: { min: 50, default: 120, max: 200 },
  meat: { min: 50, default: 120, max: 200 },
  fishSeafood: { min: 50, default: 120, max: 200 },
  oilCooking: { min: 2, default: 6, max: 15 },
  seasoning: { min: 0.5, default: 2, max: 6 },
  condiment: { min: 5, default: 15, max: 35 }
});

const stateIn = (revision, values) => values.includes(revision?.basis?.state);
const energy = revision => Number(revision?.nutrition?.energyKcal || 0);
const name = revision => String(revision?.i18n?.en?.name || '');
const group = revision => revision?.taxonomy?.foodGroup;

function isFruitReady(revision) {
  return group(revision) === 'food_group_fruit'
    && stateIn(revision, ['raw','drained','ready_to_eat','as_sold'])
    && energy(revision) <= 180
    && !/juice|nectar|puree|syrup|sauce|dried|prune|raisin|maraschino|sweetened|heavy syrup|lemon peel/i.test(name(revision));
}
function isFruitDried(revision) {
  return group(revision) === 'food_group_fruit'
    && energy(revision) >= 180 && energy(revision) <= 380
    && /dried|prune|raisin|date/i.test(name(revision))
    && !/juice|nectar|syrup/i.test(name(revision));
}
function isVegetableRaw(revision) {
  return group(revision) === 'food_group_vegetables'
    && revision?.basis?.state === 'raw'
    && energy(revision) <= 120
    && !/garlic|heart of palm|seaweed/i.test(name(revision));
}
function isVegetableCook(revision) {
  return group(revision) === 'food_group_vegetables'
    && stateIn(revision, ['raw','cooked','prepared','drained','as_sold'])
    && energy(revision) <= 150
    && !/juice|yeast extract|french fried|puff|hash brown|pickles|garlic|heart of palm|seaweed/i.test(name(revision));
}
function isCarbCooked(revision) {
  return stateIn(revision, ['cooked','prepared'])
    && energy(revision) >= 60 && energy(revision) <= 220
    && /(rice|pasta|noodle|couscous|bulgur|barley|quinoa|millet|buckwheat|cornmeal|polenta|oat|potato)/i.test(name(revision))
    && !/fried|hash brown|au gratin|scalloped|with milk|margarine|butter added/i.test(name(revision));
}
function isCarbDryCook(revision) {
  return stateIn(revision, ['dry','raw','as_sold'])
    && energy(revision) >= 250 && energy(revision) <= 430
    && /(rice|pasta|noodle|couscous|bulgur|barley|quinoa|millet|buckwheat|cornmeal|polenta|oat)/i.test(name(revision))
    && !/ready-to-eat|instant breakfast|potato|flour|breaded|egg noodle/i.test(name(revision));
}
function isBreakfastCereal(revision) {
  return energy(revision) >= 250 && energy(revision) <= 450
    && (/cereals ready-to-eat/i.test(name(revision)) || /millet, puffed/i.test(name(revision)))
    && !/chocolate|sweetened/i.test(name(revision));
}
function isBreakfastDryGrain(revision) {
  return stateIn(revision, ['dry','raw','as_sold'])
    && energy(revision) >= 250 && energy(revision) <= 430
    && /(oat|millet|quinoa|buckwheat|barley)/i.test(name(revision))
    && !/ready-to-eat|flour|breaded/i.test(name(revision));
}
function isLegumeCooked(revision) {
  return group(revision) === 'food_group_legumes'
    && stateIn(revision, ['cooked','drained','prepared','as_sold'])
    && energy(revision) >= 60 && energy(revision) <= 220
    && /bean|lentil|chickpea|pea/i.test(name(revision))
    && !/liquid|mayonnaise|yogurt/i.test(name(revision));
}
function isNutsSeeds(revision) {
  return group(revision) === 'food_group_nuts_seeds'
    && energy(revision) >= 400
    && !/butter|flour|coconut meat, dried, sweetened|mixed nuts/i.test(name(revision))
    && /(nut|almond|walnut|hazelnut|cashew|pistach|pecan|seed|peanut|macadamia|brazilnut|pine nut)/i.test(name(revision));
}
function isNutSpread(revision) {
  return group(revision) === 'food_group_nuts_seeds'
    && /butter|tahini/i.test(name(revision))
    && energy(revision) >= 300;
}
function isDairyYogurt(revision) {
  return /^(Milk|Yogurt),/i.test(name(revision)) && energy(revision) <= 180 && !/imitation|human milk|dry milk/i.test(name(revision));
}
function isCheese(revision) {
  return /^Cheese,/i.test(name(revision)) && energy(revision) >= 50 && energy(revision) <= 500;
}
function isEggWhole(revision) {
  return /^Eggs?,/i.test(name(revision)) && !/white|yolk/i.test(name(revision)) && energy(revision) <= 250;
}
function isPoultry(revision) {
  return group(revision) === 'food_group_poultry'
    && energy(revision) <= 300
    && /chicken|turkey/i.test(name(revision))
    && !/skin only|giblet|heart|liver|fried|breaded|meatless/i.test(name(revision));
}
function isMeat(revision) {
  return group(revision) === 'food_group_meat'
    && energy(revision) <= 300
    && /pork|beef|lamb|veal|venison|rabbit/i.test(name(revision))
    && !/fat|bacon|belly|variety meats|chitterlings|ears|feet|organ|liver|heart|brain|kidney|lungs|spleen|stomach|pickled|fried/i.test(name(revision));
}
function isFishSeafood(revision) {
  return group(revision) === 'food_group_fish_seafood'
    && energy(revision) <= 300
    && !/jellyfish|turtle|frog|snail|liquid|breaded|fried|salted|imitation|gefilte/i.test(name(revision));
}
function isOil(revision) {
  return /^Oil,/i.test(name(revision)) && energy(revision) > 700;
}
function isSeasoning(revision) {
  return group(revision) === 'food_group_herbs_spices'
    && energy(revision) < 500
    && !/seed/i.test(name(revision))
    && !/pickles/i.test(name(revision));
}
function isCondiment(revision) {
  return ['food_group_sauces_condiments','food_group_fats_oils'].includes(group(revision))
    && energy(revision) <= 400
    && /mustard|vinegar|dressing|sauce|mayonnaise/i.test(name(revision))
    && !/blue or roquefort|bacon and tomato/i.test(name(revision));
}

const CLASSIFIERS = Object.freeze({
  fruitReady:isFruitReady, fruitDried:isFruitDried, vegetableRaw:isVegetableRaw, vegetableCook:isVegetableCook,
  carbCooked:isCarbCooked, carbDryCook:isCarbDryCook, breakfastCereal:isBreakfastCereal, breakfastDryGrain:isBreakfastDryGrain, legumeCooked:isLegumeCooked,
  nutsSeeds:isNutsSeeds, nutSpread:isNutSpread, dairyYogurt:isDairyYogurt, cheese:isCheese, eggWhole:isEggWhole,
  poultry:isPoultry, meat:isMeat, fishSeafood:isFishSeafood, oilCooking:isOil, seasoning:isSeasoning, condiment:isCondiment
});

export function phaseBRoleClassifiers() { return { ...CLASSIFIERS }; }
export function phaseBPortionBounds() { return structuredClone(PORTIONS); }

export function buildPhaseBEligibility({ ingredientFamilies = [], ingredientRevisions = [] } = {}) {
  const revisionById = new Map(ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  const active = ingredientFamilies.filter(item => item.status === 'active')
    .map(family => ({ family, revision:revisionById.get(family.currentRevisionId) }))
    .filter(item => item.revision)
    .sort((a,b) => a.family.ingredientId.localeCompare(b.family.ingredientId));
  const roles = {};
  for (const [roleId, classifier] of Object.entries(CLASSIFIERS)) {
    roles[roleId] = {
      portionG: { ...PORTIONS[roleId] },
      ingredientIds: active.filter(item => classifier(item.revision)).map(item => item.family.ingredientId)
    };
  }
  const usableIngredientIds = [...new Set(Object.values(roles).flatMap(role => role.ingredientIds))].sort();
  return {
    schemaVersion:1,
    policyId:'v1-planner-phase-b-recipe-eligibility',
    policyVersion:'1.0.0',
    description:'Coverage-driven culinary-role eligibility for planner power validation. Roles are derived conservatively from the vendored 600-ingredient USDA-backed catalog; no taxonomy-only inclusion and no synthetic ingredient duplication.',
    quantityStrategy:'fixed-template-only',
    roles,
    usableIngredientIds,
    releaseRules:{
      requireExplicitCulinaryRole:true,
      allowTaxonomyOnlyEligibility:false,
      allowServingScaling:false,
      allowEnergyFittingByIngredientAmount:false,
      maxIngredientAmountG:320,
      maxOilAmountG:15,
      maxNutsSeedsAmountG:35,
      maxSeasoningAmountG:6
    }
  };
}
