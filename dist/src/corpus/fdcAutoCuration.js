const GROUP_LABEL_IT = {
  food_group_vegetables: 'Verdure',
  food_group_fruit: 'Frutta',
  food_group_fish_seafood: 'Pesce e frutti di mare',
  food_group_poultry: 'Pollame',
  food_group_meat: 'Carne',
  food_group_legumes: 'Legumi',
  food_group_grains: 'Cereali in chicco',
  food_group_pasta_rice_cereals: 'Pasta, riso e cereali',
  food_group_dairy_milk_yogurt: 'Latte e yogurt',
  food_group_cheese: 'Formaggi',
  food_group_eggs: 'Uova',
  food_group_nuts_seeds: 'Frutta a guscio e semi',
  food_group_fats_oils: 'Grassi e oli',
  food_group_herbs_spices: 'Erbe e spezie',
  food_group_sauces_condiments: 'Salse e condimenti',
  food_group_beverages: 'Bevande',
  food_group_other: 'Alimenti'
};

const ALLOWED_CATEGORY_PATTERNS = [
  /vegetable/i, /fruit/i, /finfish|shellfish/i, /poultry/i,
  /beef|pork|lamb|veal|game/i, /legume/i, /cereal|grain|pasta/i,
  /dairy|egg/i, /nut|seed/i, /fat|oil/i, /spice|herb/i
];
const FALLBACK_CATEGORY_PATTERNS = [/soup|sauce|grav/i, /beverage/i];
const FORBIDDEN_DESCRIPTION_PATTERNS = [
  /restaurant/i, /fast food/i, /baby food/i, /infant formula/i,
  /school lunch/i, /brand(ed)?\b/i, /commercially prepared/i
];

const LEGACY_REPLACEMENT_REQUIREMENTS = [
  { key:'salmon', pattern:/\bsalmon\b/i },
  { key:'cooked_rice', pattern:/\brice\b.*\bcooked\b|\bcooked\b.*\brice\b/i },
  { key:'zucchini', pattern:/\bzucchini\b/i },
  { key:'olive_oil', pattern:/\bolive oil\b|\boil, olive\b/i }
];

const COMMON_BASE_TRANSLATIONS = [
  [/^apples?\b/i, 'Mela'], [/^bananas?\b/i, 'Banana'], [/^oranges?\b/i, 'Arancia'], [/^lemons?\b/i, 'Limone'], [/^limes?\b/i, 'Lime'],
  [/^pears?\b/i, 'Pera'], [/^peaches?\b/i, 'Pesca'], [/^plums?\b/i, 'Prugna'], [/^apricots?\b/i, 'Albicocca'], [/^cherries?\b/i, 'Ciliegia'],
  [/^strawberries?\b/i, 'Fragola'], [/^raspberries?\b/i, 'Lampone'], [/^blueberries?\b/i, 'Mirtillo'], [/^blackberries?\b/i, 'Mora'], [/^grapes?\b/i, 'Uva'],
  [/^watermelon\b/i, 'Anguria'], [/^melon\b|^cantaloupe\b/i, 'Melone'], [/^pineapple\b/i, 'Ananas'], [/^mango(es)?\b/i, 'Mango'], [/^kiwi(fruit)?\b/i, 'Kiwi'],
  [/^avocados?\b/i, 'Avocado'], [/^figs?\b/i, 'Fico'], [/^dates?\b/i, 'Dattero'], [/^pomegranate\b/i, 'Melagrana'],
  [/^tomatoes?\b/i, 'Pomodoro'], [/^potatoes?\b/i, 'Patata'], [/^sweet potatoes?\b/i, 'Patata dolce'], [/^carrots?\b/i, 'Carota'], [/^zucchini\b/i, 'Zucchina'],
  [/^squash\b/i, 'Zucca'], [/^pumpkin\b/i, 'Zucca'], [/^eggplant\b/i, 'Melanzana'], [/^cucumbers?\b/i, 'Cetriolo'], [/^onions?\b/i, 'Cipolla'],
  [/^garlic\b/i, 'Aglio'], [/^leeks?\b/i, 'Porro'], [/^celery\b/i, 'Sedano'], [/^spinach\b/i, 'Spinaci'], [/^lettuce\b/i, 'Lattuga'],
  [/^kale\b/i, 'Cavolo riccio'], [/^broccoli\b/i, 'Broccoli'], [/^cauliflower\b/i, 'Cavolfiore'], [/^cabbage\b/i, 'Cavolo'], [/^asparagus\b/i, 'Asparagi'],
  [/^artichokes?\b/i, 'Carciofo'], [/^mushrooms?\b/i, 'Funghi'], [/^peas?\b/i, 'Piselli'], [/^corn\b/i, 'Mais'], [/^beets?\b/i, 'Barbabietola'],
  [/^radishes?\b/i, 'Ravanello'], [/^turnips?\b/i, 'Rapa'], [/^green beans?\b/i, 'Fagiolini'],
  [/^rice\b/i, 'Riso'], [/^oats?\b/i, 'Avena'], [/^barley\b/i, 'Orzo'], [/^quinoa\b/i, 'Quinoa'], [/^millet\b/i, 'Miglio'], [/^buckwheat\b/i, 'Grano saraceno'],
  [/^wheat\b/i, 'Frumento'], [/^rye\b/i, 'Segale'], [/^pasta\b/i, 'Pasta'], [/^noodles?\b/i, 'Noodles'], [/^couscous\b/i, 'Cous cous'], [/^bulgur\b/i, 'Bulgur'],
  [/^beans?\b/i, 'Fagioli'], [/^lentils?\b/i, 'Lenticchie'], [/^chickpeas?\b/i, 'Ceci'], [/^soybeans?\b/i, 'Soia'], [/^tofu\b/i, 'Tofu'], [/^tempeh\b/i, 'Tempeh'],
  [/^peas, split\b/i, 'Piselli spezzati'],
  [/^chicken\b/i, 'Pollo'], [/^turkey\b/i, 'Tacchino'], [/^duck\b/i, 'Anatra'], [/^goose\b/i, 'Oca'],
  [/^beef\b/i, 'Manzo'], [/^pork\b/i, 'Maiale'], [/^lamb\b/i, 'Agnello'], [/^veal\b/i, 'Vitello'], [/^venison\b/i, 'Cervo'], [/^rabbit\b/i, 'Coniglio'],
  [/^salmon\b/i, 'Salmone'], [/^tuna\b/i, 'Tonno'], [/^cod\b/i, 'Merluzzo'], [/^trout\b/i, 'Trota'], [/^sardines?\b/i, 'Sardina'], [/^mackerel\b/i, 'Sgombro'],
  [/^haddock\b/i, 'Eglefino'], [/^halibut\b/i, 'Halibut'], [/^anchov/i, 'Acciuga'], [/^herring\b/i, 'Aringa'], [/^tilapia\b/i, 'Tilapia'],
  [/^shrimp\b/i, 'Gambero'], [/^prawns?\b/i, 'Gambero'], [/^crab\b/i, 'Granchio'], [/^lobster\b/i, 'Astice'], [/^clams?\b/i, 'Vongole'], [/^mussels?\b/i, 'Cozze'],
  [/^oysters?\b/i, 'Ostriche'], [/^scallops?\b/i, 'Capesante'], [/^squid\b/i, 'Calamaro'], [/^octopus\b/i, 'Polpo'],
  [/^egg(s)?\b/i, 'Uovo'], [/^milk\b/i, 'Latte'], [/^yogurt\b/i, 'Yogurt'], [/^cheese\b/i, 'Formaggio'], [/^cottage cheese\b/i, 'Fiocchi di latte'], [/^cream\b/i, 'Panna'],
  [/^butter\b/i, 'Burro'], [/^almonds?\b|^nuts, almonds?\b/i, 'Mandorla'], [/^walnuts?\b|^nuts, walnuts?\b/i, 'Noce'], [/^hazelnuts?\b|^nuts, hazelnuts?\b/i, 'Nocciola'],
  [/^pistachios?\b|^nuts, pistachios?\b/i, 'Pistacchio'], [/^cashews?\b|^nuts, cashews?\b/i, 'Anacardo'], [/^peanuts?\b/i, 'Arachide'], [/^pecans?\b|^nuts, pecans?\b/i, 'Noce pecan'],
  [/^seeds, sesame\b|^sesame\b/i, 'Sesamo'], [/^seeds, sunflower\b|^sunflower seed/i, 'Semi di girasole'], [/^seeds, pumpkin\b|^pumpkin seed/i, 'Semi di zucca'], [/^chia\b/i, 'Semi di chia'], [/^flaxseed\b|^flax seed/i, 'Semi di lino'],
  [/^olive oil\b|^oil, olive\b/i, 'Olio di oliva'], [/^canola oil\b|^oil, canola\b/i, 'Olio di colza'], [/^sunflower oil\b|^oil, sunflower\b/i, 'Olio di girasole'], [/^coconut oil\b|^oil, coconut\b/i, 'Olio di cocco'],
  [/^parsley\b/i, 'Prezzemolo'], [/^basil\b/i, 'Basilico'], [/^oregano\b/i, 'Origano'], [/^thyme\b/i, 'Timo'], [/^rosemary\b/i, 'Rosmarino'], [/^sage\b/i, 'Salvia'], [/^cilantro\b|^coriander leaves/i, 'Coriandolo'],
  [/^cinnamon\b/i, 'Cannella'], [/^pepper, black\b/i, 'Pepe nero'], [/^paprika\b/i, 'Paprika'], [/^turmeric\b/i, 'Curcuma'], [/^ginger\b/i, 'Zenzero'], [/^cumin\b/i, 'Cumino'],
  [/^mustard\b/i, 'Senape'], [/^vinegar\b/i, 'Aceto']
];

function normal(value = '') { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function uniq(values) { return [...new Set(values)]; }
function hasAny(text, patterns) { return patterns.some(pattern => pattern.test(text)); }

export function refinedFoodGroup(record) {
  const d = String(record.description || record.suggested?.nameEn || '').toLowerCase();
  const c = String(record.category || '').toLowerCase();
  if (/\begg(s)?\b/.test(d)) return 'food_group_eggs';
  if (/\bcheese\b|parmesan|cheddar|mozzarella|ricotta|feta|gouda/.test(d)) return 'food_group_cheese';
  if (/\byogurt\b|\bmilk\b|\bkefir\b/.test(d)) return 'food_group_dairy_milk_yogurt';
  if (/\brice\b|\bpasta\b|\bnoodle|\bcouscous\b|\bbulgur\b/.test(d)) return 'food_group_pasta_rice_cereals';
  if (c.includes('vegetable')) return 'food_group_vegetables';
  if (c.includes('fruit')) return 'food_group_fruit';
  if (c.includes('finfish') || c.includes('shellfish')) return 'food_group_fish_seafood';
  if (c.includes('poultry')) return 'food_group_poultry';
  if (/beef|pork|lamb|veal|game|meat/.test(c)) return 'food_group_meat';
  if (c.includes('legume')) return 'food_group_legumes';
  if (c.includes('cereal') || c.includes('grain')) return 'food_group_grains';
  if (c.includes('dairy')) return 'food_group_dairy_milk_yogurt';
  if (c.includes('nut') || c.includes('seed')) return 'food_group_nuts_seeds';
  if (c.includes('oil') || c.includes('fat')) return 'food_group_fats_oils';
  if (c.includes('spice') || c.includes('herb')) return 'food_group_herbs_spices';
  if (c.includes('sauce') || c.includes('condiment') || c.includes('soup') || c.includes('grav')) return 'food_group_sauces_condiments';
  if (c.includes('beverage')) return 'food_group_beverages';
  return 'food_group_other';
}

export function conservativeAllergens(record) {
  const description = String(record.description || '').toLowerCase();
  const category = String(record.category || '').toLowerCase();
  const text = description;
  const out = [];
  const add = id => out.push(id);
  if (/\bpeanut/.test(text)) add('peanuts');
  if (/almond|cashew|walnut|hazelnut|pistach|pecan|macadamia|brazil nut|chestnut/.test(text)) add('tree_nuts');
  if (/\bsesame\b|tahini/.test(text)) add('sesame');
  if (/\bsoy\b|soybean|tofu|tempeh|edamame/.test(text)) add('soy');
  if (/\begg(s)?\b/.test(text)) add('eggs');
  if (/\bmilk\b|cheese|yogurt|whey|casein|buttermilk|cream\b|butter\b/.test(text)) add('milk');
  if (/\bwheat\b|\bbarley\b|\brye\b|spelt|triticale/.test(text)) add('gluten_cereals');
  if (/\bshrimp\b|prawn|\bcrab\b|lobster|crayfish/.test(text)) add('crustaceans');
  if (/clam|mussel|oyster|scallop|squid|octopus|cuttlefish/.test(text)) add('molluscs');
  if (/\bcelery\b/.test(text)) add('celery');
  if (/\bmustard\b/.test(text)) add('mustard');
  if (/\blupin\b/.test(text)) add('lupin');
  if (/sulphite|sulfite/.test(text)) add('sulphites');
  const seafoodCategory = /finfish|shellfish/.test(category);
  if (seafoodCategory && !out.includes('crustaceans') && !out.includes('molluscs')) add('fish');
  return uniq(out).sort();
}

function stateLabelIt(state) {
  return ({ raw:'crudo', cooked:'cotto', dry:'secco', drained:'sgocciolato', prepared:'preparato', ready_to_eat:'pronto al consumo', as_sold:'come venduto' })[state] || null;
}

function sourceQualifierAfterBase(source, pattern) {
  let qualifier = source.replace(pattern, '').replace(/^[\s,;:\-]+/, '');
  qualifier = qualifier
    .replace(/\b(raw|cooked|boiled|baked|roasted|dry|dried|drained|prepared|ready[- ]to[- ]eat)\b/gi, '')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '')
    .replace(/\s{2,}/g, ' ');
  return qualifier;
}

export function conservativeItalianLabel(record, state = null) {
  const source = String(record.commonName || record.description || record.suggested?.nameEn || '').trim();
  for (const [pattern, it] of COMMON_BASE_TRANSLATIONS) {
    if (pattern.test(source)) {
      const suffix = stateLabelIt(state || record.suggested?.state);
      const base = suffix ? `${it}, ${suffix}` : it;
      const qualifier = sourceQualifierAfterBase(source, pattern);
      return qualifier ? `${base} — ${qualifier}` : base;
    }
  }
  const group = refinedFoodGroup(record);
  const prefix = GROUP_LABEL_IT[group] || GROUP_LABEL_IT.food_group_other;
  return `${prefix} — ${source}`;
}

export function curationEligibility(record, { allowFallbackCategories = false } = {}) {
  const description = String(record.description || '');
  const category = String(record.category || '');
  const reasons = [];
  if (!description.trim()) reasons.push('missing_description');
  if (hasAny(description, FORBIDDEN_DESCRIPTION_PATTERNS)) reasons.push('forbidden_description');
  const primaryCategory = hasAny(category, ALLOWED_CATEGORY_PATTERNS);
  const fallbackCategory = allowFallbackCategories && hasAny(category, FALLBACK_CATEGORY_PATTERNS);
  if (!primaryCategory && !fallbackCategory) reasons.push('category_not_ingredient_foundation');
  const n = record.nutrition || {};
  for (const key of ['energyKcal','proteinG','carbsG','fatG','fiberG']) if (!Number.isFinite(n[key])) reasons.push(`missing_${key}`);
  if (Number.isFinite(n.energyKcal) && n.energyKcal > 0 && ['proteinG','carbsG','fatG'].every(key => Number.isFinite(n[key]))) {
    const macroEnergy = n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
    if (Math.abs(macroEnergy - n.energyKcal) / n.energyKcal > 0.2) reasons.push('macro_energy_mismatch');
  }
  return { eligible: reasons.length === 0, reasons };
}

export function autoCurateBatches({ batches, targetCount = 600, reviewedAt = null, reviewer = 'ydm-deterministic-fdc-curator-v1', groupMinimums = null } = {}) {
  const now = reviewedAt || new Date().toISOString();
  const copies = batches.map(batch => structuredClone(batch));
  const selectedKeys = new Set();
  let approved = 0;
  const groupCounts = {};
  const diagnostics = { considered: 0, approved: 0, rejected: 0, duplicateConcepts: 0, ineligible: {}, bySource: {}, byGroup: {}, groupMinimums: groupMinimums || {}, protectedConcepts: {}, protectedConceptFailures: [] };
  const defaultMinimums = {
    food_group_vegetables: 60, food_group_fruit: 40, food_group_pasta_rice_cereals: 40, food_group_grains: 30,
    food_group_legumes: 40, food_group_fish_seafood: 40, food_group_poultry: 30, food_group_meat: 30,
    food_group_dairy_milk_yogurt: 30, food_group_cheese: 15, food_group_eggs: 15, food_group_nuts_seeds: 30,
    food_group_fats_oils: 20, food_group_herbs_spices: 20
  };
  const minimums = groupMinimums || defaultMinimums;
  diagnostics.groupMinimums = minimums;
  const priority = copies.flatMap((batch, batchIndex) => (batch.records || []).map((record, recordIndex) => ({ batchIndex, recordIndex, record })));

  function tryApprove(item, { allowFallbackCategories = false, enforceMinimum = null } = {}) {
    if (approved >= targetCount) return false;
    const { batchIndex, recordIndex, record } = item;
    if (copies[batchIndex].records[recordIndex].review?.decision !== 'pending') return false;
    diagnostics.considered += 1;
    const eligibility = curationEligibility(record, { allowFallbackCategories });
    if (!eligibility.eligible) {
      for (const reason of eligibility.reasons) diagnostics.ineligible[reason] = (diagnostics.ineligible[reason] || 0) + 1;
      return false;
    }
    const group = refinedFoodGroup(record);
    if (group === 'food_group_other') return false;
    if (enforceMinimum && group !== enforceMinimum) return false;
    const state = record.suggested?.state === 'unknown' ? 'as_sold' : record.suggested?.state;
    const nameIt = conservativeItalianLabel(record, state);
    const conceptKey = `${normal(nameIt)}|${state}|${group}`;
    if (selectedKeys.has(conceptKey)) { diagnostics.duplicateConcepts += 1; return false; }
    selectedKeys.add(conceptKey);
    const current = copies[batchIndex].records[recordIndex];
    current.suggested.nameIt = nameIt;
    current.suggested.foodGroup = group;
    current.suggested.state = state;
    current.suggested.allergenIds = conservativeAllergens(current);
    current.suggested.flavorProfile = group === 'food_group_fruit' ? 'flavor_sweet' : group === 'food_group_vegetables' ? 'flavor_fresh' : 'flavor_neutral';
    current.suggested.aliasesEn = uniq([...(current.suggested.aliasesEn || []), current.description].filter(value => value && value !== current.suggested.nameEn));
    current.review = {
      decision: 'approved', approved: true,
      checks: { italianLabel:true, taxonomy:true, state:true, allergens:true, culinarySuitability:true, duplicate:true, nutrition:true, source:true },
      reviewer, reviewedAt: now,
      notes: `Deterministic high-confidence curation. Italian label uses a controlled food translation when available; otherwise it preserves the exact USDA English descriptor under an Italian category prefix. No fuzzy semantic merge. Source=${copies[batchIndex].source.sourceId}; FDC=${current.sourceRecordId}.`,
      duplicateOfIngredientId: null
    };
    approved += 1;
    groupCounts[group] = (groupCounts[group] || 0) + 1;
    diagnostics.byGroup[group] = (diagnostics.byGroup[group] || 0) + 1;
    const sourceId = copies[batchIndex].source.sourceId;
    diagnostics.bySource[sourceId] = (diagnostics.bySource[sourceId] || 0) + 1;
    return true;
  }

  // Preserve explicit replacements for the four Phase 1 development fixtures before generic filling.
  for (const requirement of LEGACY_REPLACEMENT_REQUIREMENTS) {
    const candidate = priority.find(item => requirement.pattern.test(String(item.record.description || item.record.commonName || '')) && curationEligibility(item.record).eligible);
    if (candidate && tryApprove(candidate)) diagnostics.protectedConcepts[requirement.key] = candidate.record.suggested?.ingredientId || `ing_fdc_${candidate.record.sourceRecordId}`;
    else diagnostics.protectedConceptFailures.push(requirement.key);
  }

  // First satisfy a deterministic minimum inventory for the groups needed by the pilot generator.
  for (const [group, minimum] of Object.entries(minimums)) {
    for (const item of priority) {
      if ((groupCounts[group] || 0) >= minimum || approved >= targetCount) break;
      tryApprove(item, { enforceMinimum: group });
    }
  }
  // Then fill the target from ingredient-like source categories while preserving source priority.
  for (const item of priority) {
    if (approved >= targetCount) break;
    tryApprove(item);
  }
  // Only if required, allow generic sauces/beverages as the last deterministic fallback.
  for (const item of priority) {
    if (approved >= targetCount) break;
    tryApprove(item, { allowFallbackCategories: true });
  }

  for (const batch of copies) {
    for (const record of batch.records || []) {
      if (record.review?.decision === 'pending') {
        record.review.decision = 'rejected'; record.review.approved = false; record.review.reviewer = reviewer; record.review.reviewedAt = now;
        record.review.notes = approved >= targetCount ? 'Not selected after target foundation capacity was reached.' : 'Not eligible for deterministic high-confidence ingredient foundation curation.';
      }
    }
  }
  diagnostics.approved = approved;
  diagnostics.rejected = copies.reduce((sum,batch)=>sum+(batch.records||[]).filter(record=>record.review.decision==='rejected').length,0);
  diagnostics.targetCount = targetCount;
  diagnostics.targetMet = approved >= targetCount;
  diagnostics.groupMinimumFailures = Object.entries(minimums).filter(([group, minimum]) => (groupCounts[group] || 0) < minimum).map(([group, minimum]) => ({ group, actual: groupCounts[group] || 0, required: minimum }));
  diagnostics.pilotGroupMinimumsMet = diagnostics.groupMinimumFailures.length === 0;
  diagnostics.protectedConceptsMet = diagnostics.protectedConceptFailures.length === 0;
  return { batches: copies, diagnostics };
}
