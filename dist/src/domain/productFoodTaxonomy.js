export const PRODUCT_FOOD_TAXONOMY_ID = 'product_food';

const CATEGORY_DEFS = Object.freeze({
  cereals: ['Cereals, grains and starches', 'Cereali, granaglie e amidacei'],
  legumes: ['Legumes and plant proteins', 'Legumi e proteine vegetali'],
  vegetables: ['Vegetables', 'Verdure'],
  fruit: ['Fruit', 'Frutta'],
  nuts_seeds: ['Nuts and seeds', 'Frutta a guscio e semi'],
  meat: ['Meat', 'Carne'],
  poultry: ['Poultry', 'Pollame'],
  fish_seafood: ['Fish and seafood', 'Pesce e frutti di mare'],
  eggs: ['Eggs', 'Uova'],
  dairy: ['Dairy', 'Latticini'],
  plant_alternatives: ['Plant-based alternatives', 'Alternative vegetali'],
  fats_oils: ['Fats and oils', 'Grassi e oli'],
  sauces_condiments: ['Sauces and condiments', 'Salse e condimenti'],
  herbs_spices: ['Herbs and spices', 'Erbe e spezie'],
  sweets: ['Sweets and desserts', 'Dolci e dessert'],
  beverages: ['Beverages', 'Bevande'],
  prepared_foods: ['Prepared foods', 'Alimenti preparati'],
  other: ['Other foods', 'Altri alimenti']
});

const SUBCATEGORY_DEFS = Object.freeze({
  rice: ['cereals', 'Rice', 'Riso'],
  pasta_noodles: ['cereals', 'Pasta and noodles', 'Pasta e noodles'],
  breakfast_cereals: ['cereals', 'Breakfast cereals', 'Cereali da colazione'],
  grain_flours: ['cereals', 'Flours and grain ingredients', 'Farine e ingredienti di cereali'],
  whole_grains: ['cereals', 'Whole grains and cooked grains', 'Cereali integrali e cereali cotti'],
  cereals_other: ['cereals', 'Other cereals and starches', 'Altri cereali e amidacei'],

  beans_pulses: ['legumes', 'Beans and pulses', 'Fagioli e legumi'],
  soy_products: ['legumes', 'Soy products', 'Prodotti di soia'],
  plant_protein_products: ['legumes', 'Plant protein products', 'Prodotti proteici vegetali'],
  legumes_other: ['legumes', 'Other legumes', 'Altri legumi'],

  potatoes_tubers: ['vegetables', 'Potatoes and tubers', 'Patate e tuberi'],
  alliums: ['vegetables', 'Onion, garlic and alliums', 'Cipolla, aglio e allium'],
  tomatoes: ['vegetables', 'Tomatoes and tomato products', 'Pomodori e derivati'],
  leafy_greens: ['vegetables', 'Leafy greens', 'Verdure a foglia'],
  cruciferous: ['vegetables', 'Cruciferous vegetables', 'Crucifere'],
  mushrooms: ['vegetables', 'Mushrooms', 'Funghi'],
  sea_vegetables: ['vegetables', 'Sea vegetables', 'Alghe alimentari'],
  vegetables_other: ['vegetables', 'Other vegetables', 'Altre verdure'],

  citrus: ['fruit', 'Citrus fruit', 'Agrumi'],
  berries: ['fruit', 'Berries', 'Frutti di bosco'],
  apples_pears: ['fruit', 'Apples and pears', 'Mele e pere'],
  bananas: ['fruit', 'Bananas', 'Banane'],
  stone_fruit: ['fruit', 'Stone fruit', 'Frutta a nocciolo'],
  tropical_fruit: ['fruit', 'Tropical fruit', 'Frutta tropicale'],
  dried_fruit: ['fruit', 'Dried fruit', 'Frutta essiccata'],
  fruit_juice: ['fruit', 'Fruit juices', 'Succhi di frutta'],
  fruit_other: ['fruit', 'Other fruit', 'Altra frutta'],

  nut_butters: ['nuts_seeds', 'Nut and seed butters', 'Creme di frutta a guscio e semi'],
  nuts: ['nuts_seeds', 'Nuts', 'Frutta a guscio'],
  seeds: ['nuts_seeds', 'Seeds', 'Semi'],
  coconut: ['nuts_seeds', 'Coconut', 'Cocco'],
  nuts_seeds_other: ['nuts_seeds', 'Other nuts and seeds', 'Altra frutta a guscio e semi'],

  pork: ['meat', 'Pork', 'Maiale'],
  beef: ['meat', 'Beef', 'Manzo'],
  lamb_mutton: ['meat', 'Lamb and mutton', 'Agnello e montone'],
  cured_meat: ['meat', 'Cured and processed meat', 'Carni conservate e lavorate'],
  game_meat: ['meat', 'Game meat', 'Selvaggina'],
  meat_other: ['meat', 'Other meat', 'Altre carni'],

  chicken: ['poultry', 'Chicken', 'Pollo'],
  turkey: ['poultry', 'Turkey', 'Tacchino'],
  game_birds: ['poultry', 'Game birds', 'Volatili da selvaggina'],
  poultry_other: ['poultry', 'Other poultry', 'Altro pollame'],

  fish: ['fish_seafood', 'Fish', 'Pesce'],
  crustaceans: ['fish_seafood', 'Crustaceans', 'Crostacei'],
  molluscs: ['fish_seafood', 'Molluscs', 'Molluschi'],
  seafood_other: ['fish_seafood', 'Other seafood', 'Altri prodotti ittici'],

  whole_eggs: ['eggs', 'Whole eggs and egg products', 'Uova intere e ovoprodotti'],
  eggs_other: ['eggs', 'Other egg products', 'Altri ovoprodotti'],

  milk: ['dairy', 'Milk', 'Latte'],
  yogurt: ['dairy', 'Yogurt and fermented dairy', 'Yogurt e latticini fermentati'],
  cheese: ['dairy', 'Cheese', 'Formaggi'],
  cream: ['dairy', 'Cream', 'Panna'],
  butter: ['dairy', 'Butter', 'Burro'],
  dairy_other: ['dairy', 'Other dairy', 'Altri latticini'],

  plant_milk: ['plant_alternatives', 'Plant-based milk alternatives', 'Alternative vegetali al latte'],
  plant_yogurt: ['plant_alternatives', 'Plant-based yogurt alternatives', 'Alternative vegetali allo yogurt'],
  plant_cream: ['plant_alternatives', 'Plant-based cream alternatives', 'Alternative vegetali alla panna'],
  plant_cheese: ['plant_alternatives', 'Plant-based cheese alternatives', 'Alternative vegetali al formaggio'],
  plant_alternatives_other: ['plant_alternatives', 'Other plant-based alternatives', 'Altre alternative vegetali'],

  oils: ['fats_oils', 'Oils', 'Oli'],
  spreads: ['fats_oils', 'Fat spreads', 'Grassi spalmabili'],
  mayonnaise_dressings: ['fats_oils', 'Mayonnaise and dressings', 'Maionese e dressing'],
  fats_oils_other: ['fats_oils', 'Other fats and oils', 'Altri grassi e oli'],

  sauces: ['sauces_condiments', 'Sauces and savory spreads', 'Salse e creme salate'],
  pickles_preserves: ['sauces_condiments', 'Pickles and preserves', 'Sottaceti e conserve'],
  condiments_other: ['sauces_condiments', 'Other condiments', 'Altri condimenti'],

  fresh_herbs: ['herbs_spices', 'Fresh herbs', 'Erbe fresche'],
  spices: ['herbs_spices', 'Spices', 'Spezie'],
  ginger_aromatics: ['herbs_spices', 'Ginger and aromatics', 'Zenzero e aromi'],
  herbs_spices_other: ['herbs_spices', 'Other herbs and spices', 'Altre erbe e spezie'],

  desserts: ['sweets', 'Desserts and toppings', 'Dessert e guarnizioni'],
  confectionery: ['sweets', 'Confectionery', 'Dolciumi'],
  sweets_other: ['sweets', 'Other sweets', 'Altri dolci'],

  breakfast_drinks: ['beverages', 'Breakfast and nutrition drinks', 'Bevande da colazione e nutrizionali'],
  beverages_other: ['beverages', 'Other beverages', 'Altre bevande'],

  prepared_potato: ['prepared_foods', 'Prepared potato foods', 'Preparazioni a base di patate'],
  convenience_meals: ['prepared_foods', 'Convenience meals and components', 'Piatti pronti e componenti'],
  prepared_other: ['prepared_foods', 'Other prepared foods', 'Altri alimenti preparati'],

  other: ['other', 'Other', 'Altro']
});

const CONCEPT_DEFS = Object.freeze({
  rice: ['rice', 'Rice', 'Riso'],
  rice_flour: ['rice', 'Rice flour', 'Farina di riso'],
  noodles: ['pasta_noodles', 'Noodles', 'Noodles'],
  pasta: ['pasta_noodles', 'Pasta', 'Pasta'],
  breakfast_cereal: ['breakfast_cereals', 'Breakfast cereal', 'Cereale da colazione'],
  cornmeal: ['grain_flours', 'Cornmeal and polenta', 'Farina di mais e polenta'],
  wheat_gluten: ['grain_flours', 'Wheat gluten', 'Glutine di frumento'],
  grain_flour: ['grain_flours', 'Grain flour', 'Farina di cereali'],
  millet: ['whole_grains', 'Millet', 'Miglio'],
  cooked_grain: ['whole_grains', 'Cooked grain', 'Cereale cotto'],
  cereals_other: ['cereals_other', 'Other cereal or starch', 'Altro cereale o amidaceo'],

  beans: ['beans_pulses', 'Beans', 'Fagioli'],
  lentils: ['beans_pulses', 'Lentils', 'Lenticchie'],
  chickpeas: ['beans_pulses', 'Chickpeas', 'Ceci'],
  peas: ['beans_pulses', 'Peas and split peas', 'Piselli e piselli spezzati'],
  soy: ['soy_products', 'Soy', 'Soia'],
  tofu: ['soy_products', 'Tofu', 'Tofu'],
  plant_protein_product: ['plant_protein_products', 'Plant-based protein product', 'Prodotto proteico vegetale'],
  legumes_other: ['legumes_other', 'Other legume', 'Altro legume'],

  potato: ['potatoes_tubers', 'Potato', 'Patata'],
  sweet_potato: ['potatoes_tubers', 'Sweet potato', 'Patata dolce'],
  onion: ['alliums', 'Onion', 'Cipolla'],
  garlic: ['alliums', 'Garlic', 'Aglio'],
  tomato: ['tomatoes', 'Tomato', 'Pomodoro'],
  leafy_green: ['leafy_greens', 'Leafy green', 'Verdura a foglia'],
  cruciferous: ['cruciferous', 'Cruciferous vegetable', 'Verdura crucifera'],
  mushroom: ['mushrooms', 'Mushroom', 'Fungo'],
  seaweed: ['sea_vegetables', 'Seaweed', 'Alga'],
  vegetable_juice: ['vegetables_other', 'Vegetable juice', 'Succo di verdura'],
  vegetables_other: ['vegetables_other', 'Other vegetable', 'Altra verdura'],

  lemon: ['citrus', 'Lemon', 'Limone'],
  citrus: ['citrus', 'Other citrus', 'Altro agrume'],
  berry: ['berries', 'Berry', 'Frutto di bosco'],
  apple: ['apples_pears', 'Apple', 'Mela'],
  pear: ['apples_pears', 'Pear', 'Pera'],
  banana: ['bananas', 'Banana', 'Banana'],
  plum_prune: ['stone_fruit', 'Plum and prune', 'Prugna e prugna secca'],
  stone_fruit: ['stone_fruit', 'Other stone fruit', 'Altra frutta a nocciolo'],
  tropical_fruit: ['tropical_fruit', 'Tropical fruit', 'Frutta tropicale'],
  dried_fruit: ['dried_fruit', 'Dried fruit', 'Frutta essiccata'],
  fruit_juice: ['fruit_juice', 'Fruit juice', 'Succo di frutta'],
  fruit_other: ['fruit_other', 'Other fruit', 'Altra frutta'],

  peanut_butter: ['nut_butters', 'Peanut butter', 'Burro di arachidi'],
  nut_butter: ['nut_butters', 'Nut butter', 'Crema di frutta a guscio'],
  almond: ['nuts', 'Almond', 'Mandorla'],
  cashew: ['nuts', 'Cashew', 'Anacardio'],
  mixed_nuts: ['nuts', 'Mixed nuts', 'Frutta a guscio mista'],
  nuts_other: ['nuts', 'Other nut', 'Altra frutta a guscio'],
  sunflower_seed: ['seeds', 'Sunflower seed', 'Semi di girasole'],
  seeds_other: ['seeds', 'Other seed', 'Altro seme'],
  coconut: ['coconut', 'Coconut', 'Cocco'],

  pork: ['pork', 'Pork', 'Maiale'],
  bacon: ['cured_meat', 'Bacon', 'Bacon'],
  beef: ['beef', 'Beef', 'Manzo'],
  lamb_mutton: ['lamb_mutton', 'Lamb or mutton', 'Agnello o montone'],
  cured_meat: ['cured_meat', 'Cured meat', 'Carne conservata'],
  game_meat: ['game_meat', 'Game meat', 'Selvaggina'],
  meat_other: ['meat_other', 'Other meat', 'Altra carne'],

  chicken: ['chicken', 'Chicken', 'Pollo'],
  turkey: ['turkey', 'Turkey', 'Tacchino'],
  game_bird: ['game_birds', 'Game bird', 'Volatile da selvaggina'],
  poultry_other: ['poultry_other', 'Other poultry', 'Altro pollame'],

  fish: ['fish', 'Fish', 'Pesce'],
  scallop: ['molluscs', 'Scallop', 'Capesanta'],
  mollusc: ['molluscs', 'Mollusc', 'Mollusco'],
  crustacean: ['crustaceans', 'Crustacean', 'Crostaceo'],
  seafood_other: ['seafood_other', 'Other seafood', 'Altro prodotto ittico'],

  egg: ['whole_eggs', 'Egg', 'Uovo'],
  egg_product: ['eggs_other', 'Egg product', 'Ovoprodotto'],

  milk: ['milk', 'Milk', 'Latte'],
  buttermilk: ['milk', 'Buttermilk', 'Latticello'],
  yogurt: ['yogurt', 'Yogurt', 'Yogurt'],
  cheese: ['cheese', 'Cheese', 'Formaggio'],
  cottage_cheese: ['cheese', 'Cottage cheese', 'Cottage cheese'],
  mozzarella: ['cheese', 'Mozzarella', 'Mozzarella'],
  parmesan: ['cheese', 'Parmesan', 'Parmigiano'],
  cream: ['cream', 'Cream', 'Panna'],
  sour_cream: ['cream', 'Sour cream', 'Panna acida'],
  butter: ['butter', 'Butter', 'Burro'],
  dairy_other: ['dairy_other', 'Other dairy', 'Altro latticino'],

  plant_milk: ['plant_milk', 'Plant-based milk alternative', 'Alternativa vegetale al latte'],
  plant_yogurt: ['plant_yogurt', 'Plant-based yogurt alternative', 'Alternativa vegetale allo yogurt'],
  plant_cream: ['plant_cream', 'Plant-based cream alternative', 'Alternativa vegetale alla panna'],
  plant_cheese: ['plant_cheese', 'Plant-based cheese alternative', 'Alternativa vegetale al formaggio'],
  plant_alternative: ['plant_alternatives_other', 'Other plant-based alternative', 'Altra alternativa vegetale'],

  oil: ['oils', 'Cooking oil', 'Olio alimentare'],
  fat_spread: ['spreads', 'Fat spread', 'Grasso spalmabile'],
  mayonnaise: ['mayonnaise_dressings', 'Mayonnaise', 'Maionese'],
  salad_dressing: ['mayonnaise_dressings', 'Salad dressing', 'Dressing per insalata'],
  fats_oils_other: ['fats_oils_other', 'Other fat or oil', 'Altro grasso o olio'],

  sauce: ['sauces', 'Sauce', 'Salsa'],
  yeast_extract: ['sauces', 'Yeast extract spread', 'Crema di estratto di lievito'],
  pickle: ['pickles_preserves', 'Pickle', 'Sottaceto'],
  condiment: ['condiments_other', 'Condiment', 'Condimento'],

  fresh_herb: ['fresh_herbs', 'Fresh herb', 'Erba fresca'],
  spice: ['spices', 'Spice', 'Spezia'],
  ginger: ['ginger_aromatics', 'Ginger', 'Zenzero'],
  herb_spice_other: ['herbs_spices_other', 'Other herb or spice', 'Altra erba o spezia'],

  dessert_topping: ['desserts', 'Dessert topping', 'Guarnizione per dessert'],
  sweet: ['sweets_other', 'Sweet food', 'Alimento dolce'],

  breakfast_drink: ['breakfast_drinks', 'Breakfast drink', 'Bevanda da colazione'],
  beverage: ['beverages_other', 'Beverage', 'Bevanda'],

  prepared_potato: ['prepared_potato', 'Prepared potato food', 'Preparazione di patate'],
  convenience_food: ['convenience_meals', 'Convenience food', 'Alimento pronto'],
  prepared_other: ['prepared_other', 'Other prepared food', 'Altro alimento preparato'],
  other: ['other', 'Other food', 'Altro alimento']
});

function nodeId(kind, key) { return `product_${kind}_${key}`; }

export function productFoodReferenceTaxonomy({ createdAt = '2026-09-08T12:00:00.000Z' } = {}) {
  return {
    schemaVersion: 1, taxonomyId: PRODUCT_FOOD_TAXONOMY_ID, origin: 'base', hierarchical: true,
    extensibleBy: ['editorial_pipeline'], allowedConsumers: ['ingredient','recipe','meal_class','food_preferences','allergy_profile','corpus_policy','corpus_pipeline','search'],
    status: 'active',
    i18n: {
      it: { label: 'Tassonomia alimentare prodotto', description: 'Gerarchia canonica di prodotto: categoria, sottocategoria e concetto ingrediente.' },
      en: { label: 'Product food taxonomy', description: 'Canonical product hierarchy: category, subcategory and ingredient concept.' }
    },
    createdAt, updatedAt: createdAt
  };
}

function term({ termId, parentTermId = null, en, it, aliasesEn = [], aliasesIt = [], createdAt }) {
  const tokens = [...new Set([en, it, ...aliasesEn, ...aliasesIt].flatMap(value => String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(Boolean)))];
  return {
    schemaVersion: 1, termId, taxonomyId: PRODUCT_FOOD_TAXONOMY_ID, origin: 'base', parentTermId,
    i18n: { it: { label: it, description: '' }, en: { label: en, description: '' } },
    aliases: { it: aliasesIt, en: aliasesEn }, legacyKeys: [], status: 'active', supersedesTermId: null,
    provenance: { sourceType: 'curated', sourceLabel: 'V1 D2 product taxonomy', reference: null, rationale: 'Product-facing hierarchy intentionally separated from nutrient-source grouping and allergen taxonomy.' },
    searchTokens: tokens, createdAt, updatedAt: createdAt
  };
}

export function productFoodReferenceTerms({ createdAt = '2026-09-08T12:00:00.000Z' } = {}) {
  const terms = [];
  for (const [key, [en, it]] of Object.entries(CATEGORY_DEFS)) {
    const aliasesIt = key === 'dairy' ? ['latticini', 'latte e derivati'] : [];
    terms.push(term({ termId: nodeId('category', key), en, it, aliasesIt, createdAt }));
  }
  for (const [key, [category, en, it]] of Object.entries(SUBCATEGORY_DEFS)) {
    terms.push(term({ termId: nodeId('subcategory', key), parentTermId: nodeId('category', category), en, it, createdAt }));
  }
  for (const [key, [subcategory, en, it]] of Object.entries(CONCEPT_DEFS)) {
    const aliasesEn = key === 'noodles' ? ['egg noodles','cooked noodles','dry noodles','enriched noodles','protein enriched noodles'] : [];
    const aliasesIt = key === 'noodles' ? ['pasta lunga asiatica','noodle all uovo','noodle cotti','noodle secchi'] : [];
    terms.push(term({ termId: nodeId('concept', key), parentTermId: nodeId('subcategory', subcategory), en, it, aliasesEn, aliasesIt, createdAt }));
  }
  return terms.sort((a,b) => a.termId.localeCompare(b.termId));
}

function nameOf(revision) {
  return String(revision?.i18n?.en?.name || revision?.i18n?.it?.name || '').toLowerCase();
}
function hit(name, regex) { return regex.test(name); }
function result(conceptKey) {
  const concept = CONCEPT_DEFS[conceptKey];
  if (!concept) throw new Error(`Unknown product-food concept ${conceptKey}`);
  const [subcategoryKey] = concept; const [categoryKey] = SUBCATEGORY_DEFS[subcategoryKey];
  return {
    categoryId: nodeId('category', categoryKey),
    subcategoryId: nodeId('subcategory', subcategoryKey),
    conceptId: nodeId('concept', conceptKey)
  };
}

export function classifyProductFood(revision) {
  const name = nameOf(revision);
  const legacy = revision?.taxonomy?.foodGroup || '';

  // Product identity wins over source grouping. Order matters for compound USDA names.
  if (hit(name, /\bnoodles?\b/)) return result('noodles');
  if (hit(name, /\brice flour\b/)) return result('rice_flour');
  if (hit(name, /\brice\b/)) return result('rice');
  if (hit(name, /\bpasta\b|\bmacaroni\b|\bspaghetti\b|\bvermicelli\b/)) return result('pasta');
  if (hit(name, /cereals? ready-to-eat|breakfast cereal/)) return result('breakfast_cereal');
  if (hit(name, /\bcornmeal\b|\bpolenta\b/)) return result('cornmeal');
  if (hit(name, /vital wheat gluten|wheat gluten/)) return result('wheat_gluten');
  if (hit(name, /\bflour\b/)) return result('grain_flour');
  if (hit(name, /\bmillet\b/)) return result('millet');

  if (hit(name, /meatless|vegetarian fillet|vegetarian.*patty|plant-based.*protein|luncheon slices, meatless|sandwich spread, meatless/)) return result('plant_protein_product');
  if (hit(name, /\btofu yogurt\b/)) return result('plant_yogurt');
  if (hit(name, /\btofu\b/)) return result('tofu');
  if (hit(name, /\bsoy\b/)) return result('soy');
  if (hit(name, /\bchickpeas?\b|\bgarbanzo\b/)) return result('chickpeas');
  if (hit(name, /\blentils?\b/)) return result('lentils');
  if (hit(name, /split peas?|\bpeas?\b/)) return result('peas');
  if (hit(name, /\bbeans?\b/)) return result('beans');

  if (hit(name, /mashed.*potato|hash brown|french fried.*potato/)) return result('prepared_potato');
  if (hit(name, /\bsweet potatoes?\b/)) return result('sweet_potato');
  if (hit(name, /\bpotatoes?\b/)) return result('potato');
  if (hit(name, /\bgarlic\b/)) return result('garlic');
  if (hit(name, /\bonions?\b/)) return result('onion');
  if (hit(name, /tomato and vegetable juice|vegetable juice/)) return result('vegetable_juice');
  if (hit(name, /\btomato\b/)) return result('tomato');
  if (hit(name, /\bseaweed\b/)) return result('seaweed');
  if (hit(name, /\bmushroom\b/)) return result('mushroom');
  if (hit(name, /spinach|lettuce|chard|kale|collard|leafy/)) return result('leafy_green');
  if (hit(name, /broccoli|cauliflower|cabbage|brussels sprout|bok choy/)) return result('cruciferous');

  if (hit(name, /\blemon juice\b|\borange juice\b|\bgrapefruit juice\b|\bprune juice\b|\bfruit juice\b/)) return result('fruit_juice');
  if (hit(name, /\blemon\b/)) return result('lemon');
  if (hit(name, /orange|grapefruit|tangerine|mandarin|lime\b/)) return result('citrus');
  if (hit(name, /blueberr|strawberr|raspberr|blackberr|cranberr/)) return result('berry');
  if (hit(name, /\bapple\b/)) return result('apple');
  if (hit(name, /\bpear\b|prickly pears?/)) return result('pear');
  if (hit(name, /\bbananas?\b/)) return result('banana');
  if (hit(name, /\bprunes?\b|\bplums?\b/)) return result('plum_prune');
  if (hit(name, /peach|nectarine|apricot|cherr/)) return result('stone_fruit');
  if (hit(name, /mango|papaya|pineapple|guava|passion fruit/)) return result('tropical_fruit');
  if (hit(name, /\bdried\b|\bdehydrated\b/)) {
    if (legacy === 'food_group_fruit') return result('dried_fruit');
  }

  if (hit(name, /\bpeanut butter\b/)) return result('peanut_butter');
  if (hit(name, /\b(?:almond|cashew|sunflower seed) butter\b/)) return result('nut_butter');
  if (hit(name, /\bcoconut\b/)) return result('coconut');
  if (hit(name, /\balmonds?\b/)) return result('almond');
  if (hit(name, /\bcashew\b/)) return result('cashew');
  if (hit(name, /\bmixed nuts?\b/)) return result('mixed_nuts');
  if (hit(name, /\bsunflower seed\b/)) return result('sunflower_seed');
  if (hit(name, /\bseeds?\b/)) return result('seeds_other');

  if (hit(name, /salad dressing|dressing,|french dressing|peppercorn dressing/)) return result('salad_dressing');
  if (hit(name, /\bmayonnaise\b|mayonnaise-like/)) return result('mayonnaise');
  if (hit(name, /yeast extract/)) return result('yeast_extract');
  if (hit(name, /\bpickles?\b/)) return result('pickle');
  if (hit(name, /\bsauce\b/)) return result('sauce');

  if (hit(name, /imitation cheese|cheese substitute/)) return result('plant_cheese');
  if (hit(name, /imitation milk|milk substitute|non-dairy milk/)) return result('plant_milk');
  if (hit(name, /cream substitute|non-dairy cream/)) return result('plant_cream');
  if (hit(name, /\bcottage cheese\b|\bcheese, cottage\b/)) return result('cottage_cheese');
  if (hit(name, /\bmozzarella\b/)) return result('mozzarella');
  if (hit(name, /\bparmesan\b/)) return result('parmesan');
  if (hit(name, /\bcheese\b/)) return result('cheese');
  if (hit(name, /\byogurt\b/)) return result('yogurt');
  if (hit(name, /\bbuttermilk\b/)) return result('buttermilk');
  if (hit(name, /\bsour cream\b/)) return result('sour_cream');
  if (hit(name, /\bcream\b/) && !hit(name, /cream(y)? dressing/)) return result('cream');
  if (hit(name, /margarine|butter spread|oil-butter spread/)) return result('fat_spread');
  if (hit(name, /\bbutter\b/)) return result('butter');
  if (hit(name, /\bmilk\b/) && !hit(name, /without milk/)) return result('milk');

  if (hit(name, /\boil\b/)) return result('oil');
  if (hit(name, /\bspread\b/)) return result('fat_spread');

  if (hit(name, /\bpork\b/)) return hit(name, /\bbacon\b/) ? result('bacon') : result('pork');
  if (hit(name, /\bham\b|\bsausage\b|\bsalami\b|\bpastrami\b/)) return result('cured_meat');
  if (hit(name, /\bbeef\b/)) return result('beef');
  if (hit(name, /\blamb\b|\bmutton\b/)) return result('lamb_mutton');

  if (hit(name, /\bchicken\b/)) return result('chicken');
  if (hit(name, /\bturkey\b/)) return result('turkey');
  if (hit(name, /\bquail\b|\bpheasant\b|\bdove\b|\bsquab\b/)) return result('game_bird');

  if (hit(name, /\bscallop\b/)) return result('scallop');
  if (hit(name, /\bshrimp\b|\bprawn\b|\bcrab\b|\blobster\b/)) return result('crustacean');
  if (hit(name, /\bmollusk|\bmollusc|\boyster\b|\bclam\b|\bmussel\b|\bsnail\b/)) return result('mollusc');
  if (hit(name, /\bfish\b|\bmackerel\b|\bbass\b|\bbluefish\b|\bburbot\b|\bbutterfish\b|\bsalmon\b|\btuna\b|\bcod\b|\btrout\b/)) return result('fish');

  if (hit(name, /\beggs?\b|\begg, whole\b/)) return result('egg');

  if (hit(name, /\bginger\b/)) return result('ginger');
  if (hit(name, /\bcilantro\b|\bcoriander.*leaves\b|\bparsley\b|\bbasil\b|\bmint\b|\bdill\b/)) return result('fresh_herb');
  if (hit(name, /\bspices?,|\bbay leaf\b|\bcaraway\b|\bcardamom\b|\bpepper\b|\bcinnamon\b|\bclove\b|\bnutmeg\b/)) return result('spice');

  if (hit(name, /whipped topping|dessert topping/)) return result('dessert_topping');
  if (hit(name, /instant breakfast|nutrition drink|breakfast powder/)) return result('breakfast_drink');

  // Conservative source-group fallbacks. They preserve complete coverage without pretending that
  // nutrient-source classification is the product taxonomy.
  if (legacy === 'food_group_grains' || legacy === 'food_group_pasta_rice_cereals') return result('cereals_other');
  if (legacy === 'food_group_legumes') return result('legumes_other');
  if (legacy === 'food_group_vegetables') return result('vegetables_other');
  if (legacy === 'food_group_fruit') return result('fruit_other');
  if (legacy === 'food_group_nuts_seeds') return result('nuts_other');
  if (legacy === 'food_group_meat') return result('meat_other');
  if (legacy === 'food_group_poultry') return result('poultry_other');
  if (legacy === 'food_group_fish_seafood') return result('seafood_other');
  if (legacy === 'food_group_eggs') return result('egg_product');
  if (legacy === 'food_group_cheese' || legacy === 'food_group_dairy_milk_yogurt') return result('dairy_other');
  if (legacy === 'food_group_plant_dairy_alternative') return result('plant_alternative');
  if (legacy === 'food_group_fats_oils') return result('fats_oils_other');
  if (legacy === 'food_group_sauces_condiments') return result('condiment');
  if (legacy === 'food_group_herbs_spices') return result('herb_spice_other');
  if (legacy === 'food_group_sweets') return result('sweet');
  if (legacy === 'food_group_beverages') return result('beverage');
  if (legacy === 'food_group_convenience_food') return result('convenience_food');
  return result('other');
}

export function productFoodPathForRevision(revision) {
  return classifyProductFood(revision);
}

export function validateProductFoodAssignment(index, revision) {
  const product = revision?.productTaxonomy;
  if (!product?.categoryId || !product?.subcategoryId || !product?.conceptId) throw new Error(`IngredientRevision ${revision?.ingredientRevisionId || 'unknown'} is missing productTaxonomy`);
  const category = index.assertTerm(product.categoryId, PRODUCT_FOOD_TAXONOMY_ID);
  const subcategory = index.assertTerm(product.subcategoryId, PRODUCT_FOOD_TAXONOMY_ID);
  const concept = index.assertTerm(product.conceptId, PRODUCT_FOOD_TAXONOMY_ID);
  if (category.parentTermId !== null) throw new Error(`Product category ${category.termId} must be a root`);
  if (subcategory.parentTermId !== category.termId) throw new Error(`Product subcategory ${subcategory.termId} must belong to ${category.termId}`);
  if (concept.parentTermId !== subcategory.termId) throw new Error(`Ingredient concept ${concept.termId} must belong to ${subcategory.termId}`);
  return { category, subcategory, concept };
}
