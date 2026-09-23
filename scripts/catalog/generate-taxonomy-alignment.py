#!/usr/bin/env python3
import json, glob, os, re, copy
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(ROOT, 'catalog-source')
OUT = os.path.join(SOURCE, '008-complete-taxonomy-alignment.json')

# Load the resolved catalog before this alignment batch.
versions = {}
for fn in sorted(glob.glob(os.path.join(SOURCE, '*.json'))):
    if os.path.basename(fn) == os.path.basename(OUT):
        continue
    with open(fn, encoding='utf-8') as f:
        batch = json.load(f)
    for record in batch.get('records', []):
        key = (record['kind'], record['id'])
        if key not in versions or record['revision'] > versions[key]['revision']:
            versions[key] = copy.deepcopy(record)

terms = {r['id']: r for r in versions.values() if r['kind'] == 'taxonomy_term' and r.get('status') == 'active'}
ingredients = {r['id']: r for r in versions.values() if r['kind'] == 'ingredient' and r.get('status') == 'active'}
recipes = {r['id']: r for r in versions.values() if r['kind'] == 'recipe' and r.get('status') == 'active'}

records = []

def term(id_, taxonomy_type, it, en, aliases_it=None, aliases_en=None, parent_id=None):
    current = versions.get(('taxonomy_term', id_))
    revision = (current['revision'] + 1) if current else 1
    records.append({
        'kind': 'taxonomy_term', 'id': id_, 'revision': revision, 'status': 'active',
        'taxonomyType': taxonomy_type, 'parentId': parent_id,
        'labels': {'it': it, 'en': en},
        'aliases': {'it': aliases_it or [], 'en': aliases_en or []}
    })

# Canonical terms needed to remove implicit fallbacks and complete the authored model.
term('tax_flavor_neutral', 'flavor_profile', 'Neutro', 'Neutral')
for row in [
    ('tax_role_protein_egg', 'Proteina: uovo', 'Protein: egg'),
    ('tax_role_dairy_cheese', 'Formaggio', 'Cheese'),
    ('tax_role_dairy_milk', 'Latte e latticello', 'Milk and buttermilk'),
    ('tax_role_condiment', 'Condimento o base', 'Condiment or base'),
    ('tax_role_acid', 'Componente acida', 'Acid component'),
    ('tax_role_nut_seed', 'Frutta secca o seme', 'Nut or seed'),
    ('tax_role_nut_seed_spread', 'Crema di frutta secca o semi', 'Nut or seed spread'),
    ('tax_role_fruit_component', 'Componente di frutta', 'Fruit component'),
    ('tax_role_main_starch', 'Amido principale', 'Main starch'),
    ('tax_role_seasoning', 'Insaporitore', 'Seasoning'),
]:
    term(row[0], 'culinary_role', row[1], row[2])

for row in [
    ('tax_preparation_no_cook_assembly', 'Assemblaggio senza cottura', 'No-cook assembly'),
    ('tax_preparation_boiling', 'Bollitura o lessatura', 'Boiling'),
    ('tax_preparation_simmering', 'Cottura sobbollita', 'Simmering'),
    ('tax_preparation_pan_cooking', 'Cottura in padella', 'Pan cooking'),
    ('tax_preparation_sauteing', 'Saltare o rosolare', 'Sauteing or browning'),
    ('tax_preparation_baking', 'Cottura al forno', 'Baking'),
    ('tax_preparation_roasting', 'Arrostimento', 'Roasting'),
    ('tax_preparation_grilling', 'Griglia o piastra', 'Grilling or griddling'),
    ('tax_preparation_braising', 'Brasatura', 'Braising'),
    ('tax_preparation_stewing', 'Stufatura o cottura in umido', 'Stewing'),
    ('tax_preparation_blending', 'Frullatura', 'Blending'),
    ('tax_preparation_toasting', 'Tostatura', 'Toasting'),
    ('tax_preparation_reheating', 'Riscaldamento', 'Reheating'),
    ('tax_preparation_steaming', 'Cottura al vapore', 'Steaming'),
    ('tax_preparation_frying', 'Frittura', 'Frying'),
]:
    term(row[0], 'preparation_technique', row[1], row[2])

# Correct a few product-level category mismatches. Product and ingredient revisions move together.
product_parent_corrections = {
    'tax_product_frog_legs': 'tax_category_meat_poultry',
    'tax_product_peanut_butter': 'tax_category_nuts_seeds',
    'tax_product_tomato_paste': 'tax_category_condiments',
    'tax_product_tomato_puree': 'tax_category_condiments',
    'tax_product_tomato_sauce': 'tax_category_condiments',
}
for product_id, new_parent in product_parent_corrections.items():
    current = terms[product_id]
    updated = copy.deepcopy(current)
    updated['revision'] = current['revision'] + 1
    updated['parentId'] = new_parent
    records.append(updated)

# Ingredient taxonomy helpers.
CHEESE_MARKERS = ('mozzarella', 'parmesan', 'ricotta', 'romano_cheese', 'swiss_cheese', 'cottage_cheese')
MILK_MARKERS = ('whole_milk', 'skim_milk', 'buttermilk')
YOGURT_MARKERS = ('yogurt',)
CREAM_MARKERS = ('cream',)
DRIED_FRUIT_MARKERS = ('dried', 'raisins', 'prunes', 'golden_raisins')
CITRUS_COMPONENT_MARKERS = ('lemon', 'lime')
SHELLFISH_MARKERS = ('shrimp', 'crab', 'clams', 'oyster', 'scallop', 'squid', 'snail')
POULTRY_MARKERS = ('chicken', 'turkey', 'pheasant', 'quail')
AROMATIC_VEGETABLE_MARKERS = ('garlic', 'onion', 'celery')


def ingredient_roles(item):
    iid = item['id']
    product = item['productId']
    category = product_parent_corrections.get(product, item['categoryId'])
    hay = f'{iid} {product}'.lower()
    roles = []
    if category == 'tax_category_condiments':
        roles.append('tax_role_condiment')
        if 'vinegar' in hay:
            roles.append('tax_role_acid')
    elif category == 'tax_category_dairy':
        if any(m in hay for m in YOGURT_MARKERS): roles.append('tax_role_dairy_yogurt')
        elif any(m in hay for m in CREAM_MARKERS): roles.append('tax_role_dairy_cream')
        elif any(m in hay for m in MILK_MARKERS): roles.append('tax_role_dairy_milk')
        else: roles.append('tax_role_dairy_cheese')
    elif category == 'tax_category_eggs':
        roles.append('tax_role_protein_egg')
    elif category == 'tax_category_fish_seafood':
        roles.append('tax_role_shellfish' if any(m in hay for m in SHELLFISH_MARKERS) else 'tax_role_protein_fish')
    elif category == 'tax_category_fruit':
        state = item['state']
        if state.get('preservation') == 'dry' or any(m in hay for m in DRIED_FRUIT_MARKERS):
            roles.append('tax_role_dried_fruit')
        elif any(x in hay for x in ('juice', 'puree', 'peel')) or any(m in hay for m in CITRUS_COMPONENT_MARKERS):
            roles.append('tax_role_fruit_component')
            if any(m in hay for m in CITRUS_COMPONENT_MARKERS): roles.append('tax_role_acid')
        else:
            roles.append('tax_role_fruit_ready')
    elif category == 'tax_category_grains_starches':
        if 'flour' in hay or iid in {'ing_flour_00','ing_semolina_fine','ing_semolina_coarse'}:
            roles.append('tax_role_flour')
        elif any(x in hay for x in ('potato', 'sweet_potato')):
            roles.append('tax_role_main_starch')
        else:
            roles.append('tax_role_main_grain')
    elif category == 'tax_category_herbs_spices':
        roles.append('tax_role_seasoning')
        if not any(x in hay for x in ('table_salt', 'cumin_seed', 'coriander_seed', 'dill_seed')):
            roles.append('tax_role_aromatic')
    elif category == 'tax_category_legumes':
        roles.append('tax_role_flour' if 'flour' in hay else 'tax_role_main_legume')
    elif category == 'tax_category_meat_poultry':
        roles.append('tax_role_protein_poultry' if any(m in hay for m in POULTRY_MARKERS) else 'tax_role_protein_meat')
    elif category == 'tax_category_nuts_seeds':
        if 'flour' in hay:
            roles.append('tax_role_flour')
        elif any(x in hay for x in ('butter', 'tahini')):
            roles.append('tax_role_nut_seed_spread')
        else:
            roles.append('tax_role_nut_seed')
    elif category == 'tax_category_oils_fats':
        if 'flaxseed' in hay:
            roles.append('tax_role_finishing_fat')
        else:
            roles.extend(['tax_role_cooking_fat', 'tax_role_finishing_fat'])
    elif category == 'tax_category_vegetables':
        roles.append('tax_role_aromatic' if any(m in hay for m in AROMATIC_VEGETABLE_MARKERS) else 'tax_role_main_vegetable')
    else:
        raise ValueError(f'No role rule for {iid} category {category}')
    return sorted(set(roles))


def ingredient_flavor(item):
    iid = item['id']
    product = item['productId']
    category = product_parent_corrections.get(product, item['categoryId'])
    hay = f'{iid} {product}'.lower()
    if category == 'tax_category_fruit':
        if any(x in hay for x in ('lemon', 'lime')):
            return 'tax_flavor_neutral'
        return 'tax_flavor_sweet'
    if category == 'tax_category_dairy':
        if 'fruit' in hay or 'strawberry' in hay:
            return 'tax_flavor_sweet'
        if any(m in hay for m in CHEESE_MARKERS):
            return 'tax_flavor_savory'
        return 'tax_flavor_neutral'
    if category in {'tax_category_meat_poultry','tax_category_fish_seafood','tax_category_vegetables','tax_category_herbs_spices','tax_category_condiments'}:
        return 'tax_flavor_savory'
    return 'tax_flavor_neutral'

# Revise every active ingredient so taxonomy intent is explicit and uniform.
for iid in sorted(ingredients):
    current = ingredients[iid]
    updated = copy.deepcopy(current)
    updated['revision'] = current['revision'] + 1
    updated['categoryId'] = product_parent_corrections.get(updated['productId'], updated['categoryId'])
    updated['culinaryRoles'] = ingredient_roles(updated)
    updated['flavorProfileId'] = ingredient_flavor(updated)
    records.append(updated)

# Recipe helpers.
SWEET_ARCHETYPES = {
    'tax_archetype_baked_fruit','tax_archetype_breakfast_cake','tax_archetype_fruit_nuts_snack',
    'tax_archetype_fruit_salad','tax_archetype_grain_pudding','tax_archetype_porridge','tax_archetype_rice_pudding',
    'tax_archetype_smoothie','tax_archetype_snack_fruit_compote','tax_archetype_snack_pudding','tax_archetype_snack_smoothie',
    'tax_archetype_semolina_porridge','tax_archetype_semolina_pudding','tax_archetype_yogurt_bowl'
}
PORTABLE_ARCHETYPES = {
    'tax_archetype_fruit_nuts_snack','tax_archetype_mini_sandwich','tax_archetype_sandwich','tax_archetype_breakfast_sandwich',
    'tax_archetype_breakfast_flatbread','tax_archetype_snack_flatbread','tax_archetype_snack_crostino','tax_archetype_snack_rollup',
    'tax_archetype_snack_savory_bite','tax_archetype_snack_skewer','tax_archetype_roasted_snack','tax_archetype_toast','tax_archetype_bruschetta'
}
COLD_ARCHETYPES = {
    'tax_archetype_fruit_nuts_snack','tax_archetype_fruit_salad','tax_archetype_grain_salad','tax_archetype_legume_salad',
    'tax_archetype_mediterranean_salad','tax_archetype_yogurt_bowl','tax_archetype_yogurt_dip','tax_archetype_hummus_snack',
    'tax_archetype_cottage_cheese_bowl','tax_archetype_ricotta_bowl','tax_archetype_legume_cup','tax_archetype_smoothie',
    'tax_archetype_snack_smoothie','tax_archetype_vegetable_cheese_plate','tax_archetype_mini_sandwich','tax_archetype_sandwich'
}
MEAL_PREP_ARCHETYPE_PARTS = ('soup','stew','bake','baked','roast','braise','grain_salad','legume_salad','pasta_bake','gratin','stuffed')
SWEET_SIGNAL_PRODUCTS = {'tax_category_fruit'}
SAVORY_SIGNAL_CATEGORIES = {'tax_category_meat_poultry','tax_category_fish_seafood','tax_category_vegetables','tax_category_condiments'}


def recipe_flavor(recipe):
    existing = recipe.get('flavorProfileIds') or []
    if existing:
        # Breakfast was already human-reviewed in 007. Preserve any explicit prior classification.
        return [existing[0]]
    if recipe['archetypeId'] in SWEET_ARCHETYPES:
        return ['tax_flavor_sweet']
    cats = []
    ids = []
    for line in recipe['ingredients']:
        item = ingredients[line['ingredientId']]
        cats.append(product_parent_corrections.get(item['productId'], item['categoryId']))
        ids.append(item['id'])
    if any(cat in SAVORY_SIGNAL_CATEGORIES for cat in cats) or 'tax_category_eggs' in cats:
        return ['tax_flavor_savory']
    # Herbs/spices are only a savory signal outside archetypes that are inherently sweet.
    if 'tax_category_herbs_spices' in cats and recipe['archetypeId'] not in SWEET_ARCHETYPES:
        return ['tax_flavor_savory']
    if 'tax_category_fruit' in cats:
        return ['tax_flavor_sweet']
    return ['tax_flavor_savory']


def eating_minutes(recipe):
    aid = recipe['archetypeId']
    meals = set(recipe['mealTypeIds'])
    if any(x in aid for x in ('smoothie',)):
        return 5
    if any(x in aid for x in ('fruit_nuts_snack','snack_savory_bite','snack_skewer','snack_rollup','snack_crostino')):
        return 8
    if any(x in aid for x in ('mini_sandwich','sandwich','toast','bruschetta','flatbread')):
        return 10
    if any(x in aid for x in ('soup','stew','braise')):
        return 20
    if any(x in aid for x in ('salad','fish_plate','chicken_plate','meat_plate','seafood_plate','egg_plate','pasta','risotto','gnocchi','polenta','grain_bowl')):
        return 15
    if 'tax_meal_snack' in meals:
        return 8
    if 'tax_meal_breakfast' in meals or 'tax_meal_mini_meal' in meals:
        return 12
    return 18


def repair_recipe_semantics(recipe):
    """Repair source inconsistencies where timing/steps contradict the listed ingredient state."""
    rid = recipe['id']
    no_cook_ids = {
        'recipe_barbabietola_ricotta_noci',
        'recipe_coppa_fagioli_occhio_mais',
        'recipe_fagioli_lima_spinaci_limone',
        'recipe_fagioli_occhio_mais_peperone',
        'recipe_hummus_barbabietola_cetriolo',
        'recipe_insalata_cannellini_finocchio',
        'recipe_insalata_ceci_cetriolo_pomodoro',
        'recipe_panino_pollo_peperoni_rucola',
        'recipe_panino_ricotta_carciofi_rucola',
        'recipe_panino_sardine_pomodoro_finocchio',
        'recipe_r2_breakfast_panino_lonza_mela_senape',
        'recipe_r2_breakfast_panino_prosciutto_mozzarella_rucola',
        'recipe_r2_quick_cernia_finocchio_limone',
        'recipe_r2_quick_panino_fagiano_mela_rucola',
        'recipe_panino_mozzarella_pomodoro_basilico',
        'recipe_panino_tacchino_rucola_pomodoro',
        'recipe_panino_tonno_cetriolo',
        'recipe_r2_quick_panino_coscia_maiale_svizzero_cetriolo',
        'recipe_r2_quick_panino_lonza_brasata_senape_rucola',
    }
    if rid in no_cook_ids:
        recipe['cookMinutes'] = 0

    # Remove a legacy generic egg instruction from sandwiches without egg.
    if rid in {
        'recipe_panino_mozzarella_pomodoro_basilico',
        'recipe_panino_tacchino_rucola_pomodoro',
        'recipe_panino_tonno_cetriolo',
    }:
        recipe['steps'] = {
            'it': [
                'Prepara e affetta gli ingredienti della farcitura.',
                'Farcisci il pane distribuendo uniformemente gli ingredienti.',
                'Chiudi, taglia e servi.'
            ],
            'en': [
                'Prepare and slice the filling ingredients.',
                'Fill the bread, distributing the ingredients evenly.',
                'Close, cut and serve.'
            ]
        }

    # Make required cooking actions explicit where legacy generic steps omitted them.
    if rid in {'recipe_panino_uovo_rucola','recipe_mini_panino_uovo_pomodoro','recipe_panino_uovo_rucola_cetriolo_senape'}:
        recipe['steps'] = {
            'it': [
                'Cuoci l’uovo fino a completa cottura e lascialo intiepidire.',
                'Prepara gli altri ingredienti e farcisci il pane.',
                'Chiudi, taglia e servi.'
            ],
            'en': [
                'Cook the egg until fully done and let it cool slightly.',
                'Prepare the remaining ingredients and fill the bread.',
                'Close, cut and serve.'
            ]
        }
    elif rid == 'recipe_insalata_uovo_patate_fagiolini':
        recipe['steps'] = {
            'it': [
                'Lessa la patata e i fagiolini finché teneri e cuoci l’uovo fino a completa cottura; lascia intiepidire.',
                'Taglia gli ingredienti cotti e riuniscili in una ciotola.',
                'Condisci, mescola delicatamente e servi.'
            ],
            'en': [
                'Boil the potato and green beans until tender and cook the egg until fully done; let them cool slightly.',
                'Cut the cooked ingredients and combine them in a bowl.',
                'Dress, toss gently and serve.'
            ]
        }
    elif rid == 'recipe_insalata_uovo_patate_ravanelli_senape':
        recipe['steps'] = {
            'it': [
                'Lessa la patata e cuoci l’uovo fino a completa cottura; lascia intiepidire.',
                'Taglia patata, uovo e ravanelli e riuniscili in una ciotola.',
                'Condisci con senape e olio, mescola delicatamente e servi.'
            ],
            'en': [
                'Boil the potato and cook the egg until fully done; let both cool slightly.',
                'Cut the potato, egg and radishes and combine them in a bowl.',
                'Dress with mustard and oil, toss gently and serve.'
            ]
        }
    elif rid == 'recipe_sgombro_patate_ravanelli':
        recipe['steps'] = {
            'it': [
                'Lessa la patata finché tenera, scolala e lasciala intiepidire.',
                'Taglia patata e ravanelli e uniscili allo sgombro.',
                'Condisci con limone e olio, mescola delicatamente e servi.'
            ],
            'en': [
                'Boil the potato until tender, drain and let it cool slightly.',
                'Cut the potato and radishes and combine them with the mackerel.',
                'Dress with lemon and oil, toss gently and serve.'
            ]
        }
    elif rid == 'recipe_hummus_zucchine_grigliate':
        recipe['steps'] = {
            'it': [
                'Taglia le zucchine e grigliale o cuocile su piastra finché tenere.',
                'Condisci le zucchine con olio e limone.',
                'Servile con l’hummus.'
            ],
            'en': [
                'Slice the zucchini and grill or griddle until tender.',
                'Dress the zucchini with oil and lemon.',
                'Serve with the hummus.'
            ]
        }
    elif rid == 'recipe_lenticchie_spinaci_ricotta_tiepide':
        recipe['steps'] = {
            'it': [
                'Riscalda brevemente le lenticchie già cotte senza farle asciugare.',
                'Uniscile a spinaci, ricotta e cipolla preparati.',
                'Condisci con olio, mescola delicatamente e servi tiepido.'
            ],
            'en': [
                'Briefly reheat the cooked lentils without drying them out.',
                'Combine with the prepared spinach, ricotta and onion.',
                'Dress with oil, toss gently and serve warm.'
            ]
        }
    elif rid == 'recipe_r2_breakfast_polenta_pancetta_uovo':
        recipe['steps'] = {
            'it': [
                'Cuoci la polenta mescolando finché cremosa.',
                'Scalda la pancetta già cotta e cuoci l’uovo in padella fino a completa cottura.',
                'Completa la polenta con pancetta, uovo e parmigiano e servi.'
            ],
            'en': [
                'Cook the polenta, stirring until creamy.',
                'Warm the cooked bacon and pan-cook the egg until fully done.',
                'Top the polenta with bacon, egg and Parmesan and serve.'
            ]
        }

    # Generic bruschetta records use a short cook time that represents bread toasting.
    if recipe['archetypeId'] in {'tax_archetype_bruschetta','tax_archetype_snack_crostino','tax_archetype_toast'} and recipe['cookMinutes'] > 0:
        steps_it = ' '.join(recipe.get('steps',{}).get('it',[])).lower()
        if not any(k in steps_it for k in ('tosta','forno','piastra')):
            recipe['steps'] = {
                'it': ['Tosta il pane fino a renderlo leggermente croccante.', 'Prepara la copertura e distribuiscila sul pane.', 'Condisci se previsto e servi subito.'],
                'en': ['Toast the bread until lightly crisp.', 'Prepare the topping and spread it over the bread.', 'Dress if needed and serve immediately.']
            }
    return recipe


def preparation_techniques(recipe):
    aid = recipe['archetypeId']
    steps_text = ' '.join(recipe.get('steps',{}).get('it',[])).lower()
    ingredient_ids = {line['ingredientId'] for line in recipe['ingredients']}
    tech = set()

    if recipe['cookMinutes'] == 0:
        tech.add('tax_preparation_no_cook_assembly')
        if 'frull' in steps_text or 'smoothie' in aid:
            tech.add('tax_preparation_blending')
        return sorted(tech)

    # Strong structural signals first. They describe actions performed by this recipe,
    # unlike words such as "arrosto" or "brasato" that may only describe an input ingredient.
    if any(k in aid for k in ('toast','bruschetta','snack_crostino')):
        tech.add('tax_preparation_toasting')
    if any(k in aid for k in ('baked','bake','gratin','pasta_bake','stuffed_vegetable','savory_bake','polenta_bake','grain_bake','roasted_snack')):
        tech.add('tax_preparation_baking')
    if any(k in aid for k in ('meat_roast','game_roast','roast_chicken')):
        tech.add('tax_preparation_roasting')
    if 'meat_braise' in aid:
        tech.add('tax_preparation_braising')
    if 'stew' in aid:
        tech.add('tax_preparation_stewing')
    if any(k in aid for k in ('legume_soup','vegetable_soup','risotto','porridge','pudding','polenta_bowl','polenta_plate','semolina')):
        tech.add('tax_preparation_simmering')
    if any(k in aid for k in ('pasta_dish','quick_pasta','gnocchi','grain_salad','seafood_rice')):
        tech.add('tax_preparation_boiling')
    if any(k in aid for k in ('breakfast_grain_bowl','legume_grain_bowl')):
        grain_inputs = [ingredients[line['ingredientId']] for line in recipe['ingredients'] if ingredients[line['ingredientId']]['categoryId'] == 'tax_category_grains_starches']
        if any(i.get('state',{}).get('physical') in {'dry','raw','as_sold'} for i in grain_inputs):
            tech.add('tax_preparation_boiling')
        elif grain_inputs:
            tech.add('tax_preparation_reheating')
    if aid in {'tax_archetype_breakfast_flatbread','tax_archetype_snack_flatbread'}:
        tech.add('tax_preparation_pan_cooking')
    if aid == 'tax_archetype_ricotta_bowl' and recipe['cookMinutes'] > 0:
        tech.add('tax_preparation_simmering')
    if aid == 'tax_archetype_snack_fruit_compote':
        if 'forno' in recipe['title'].get('it','').lower():
            tech.add('tax_preparation_baking')
        else:
            tech.add('tax_preparation_simmering')
    if aid == 'tax_archetype_snack_skewer' and recipe['cookMinutes'] > 0:
        tech.add('tax_preparation_reheating')
    if any(k in aid for k in ('frittata','omelette','scrambled','pancake','crepe','skillet','egg_plate','egg_snack','legume_patty')):
        tech.add('tax_preparation_pan_cooking')
    if any(k in aid for k in ('fish_plate','chicken_plate','quick_meat_plate','quick_seafood_plate')):
        tech.add('tax_preparation_pan_cooking')

    # Cooked sandwiches only need a technique when a raw egg is actually cooked in the recipe.
    if any(k in aid for k in ('sandwich','mini_sandwich')) and 'ing_egg_whole_raw' in ingredient_ids:
        tech.add('tax_preparation_pan_cooking')

    # Explicit recipe actions may add a secondary technique.
    if 'frull' in steps_text:
        tech.add('tax_preparation_blending')
    if 'vapore' in steps_text:
        tech.add('tax_preparation_steaming')
    if any(k in steps_text for k in ('friggi','frittura')):
        tech.add('tax_preparation_frying')
    if any(k in steps_text for k in ('griglia','grigl','piastra')) and 'antiaderente' not in steps_text:
        tech.add('tax_preparation_grilling')
    if any(k in steps_text for k in ('bras','brasat')):
        tech.add('tax_preparation_braising')
    if any(k in steps_text for k in ('stufa','stufato','in umido','guazzetto')):
        tech.add('tax_preparation_stewing')
    if any(k in steps_text for k in ('forno','inforna')) and 'tax_preparation_roasting' not in tech:
        tech.add('tax_preparation_baking')
    if any(k in steps_text for k in ('padella','rosola','rosol','salta','saltat')):
        tech.add('tax_preparation_pan_cooking')
        if any(k in steps_text for k in ('rosola','rosol','salta','saltat')):
            tech.add('tax_preparation_sauteing')
    if any(k in steps_text for k in ('tosta','tostare')):
        tech.add('tax_preparation_toasting')
    if any(k in steps_text for k in ('boll','lessa','acqua bollente','cuoci la pasta','cuoci i gnocchi')):
        tech.add('tax_preparation_boiling')
    if any(k in steps_text for k in ('sobboll','fuoco dolce')):
        tech.add('tax_preparation_simmering')
    if any(k in steps_text for k in ('riscalda','scalda')) and not any(t in tech for t in ('tax_preparation_pan_cooking','tax_preparation_baking','tax_preparation_boiling','tax_preparation_simmering','tax_preparation_toasting','tax_preparation_grilling')):
        tech.add('tax_preparation_reheating')

    # A cooked recipe must never fall back to an unrelated technique. Generic quick records
    # are conservatively classified as pan cooking; warm composed salads as reheating.
    if not tech:
        if aid in {'tax_archetype_legume_salad','tax_archetype_mediterranean_salad','tax_archetype_vegetable_cheese_plate'}:
            tech.add('tax_preparation_reheating')
        else:
            tech.add('tax_preparation_pan_cooking')
    return sorted(tech)


def diet_tags(recipe):
    items = [ingredients[line['ingredientId']] for line in recipe['ingredients']]
    all_vegan = all(i.get('dietFlags',{}).get('vegan') is True for i in items)
    all_vegetarian = all(i.get('dietFlags',{}).get('vegetarian') is True or i.get('dietFlags',{}).get('vegan') is True for i in items)
    corrected_categories = [product_parent_corrections.get(i['productId'], i['categoryId']) for i in items]
    has_fish = 'tax_category_fish_seafood' in corrected_categories
    has_meat = 'tax_category_meat_poultry' in corrected_categories
    tags = []
    if all_vegan:
        tags.extend(['tax_diet_vegan','tax_diet_vegetarian'])
    elif all_vegetarian:
        tags.append('tax_diet_vegetarian')
    elif has_fish and not has_meat:
        tags.append('tax_diet_pescatarian')
    return tags


def practical_tags(recipe, eat_minutes):
    existing = set(recipe.get('practicalTagIds') or [])
    total = recipe['prepMinutes'] + recipe['cookMinutes']
    tags = {t for t in existing if t not in {'tax_practical_quick','tax_practical_elaborate','tax_practical_no_cook','tax_practical_quick_eat','tax_practical_no_advance_prep'}}
    if total <= 30:
        tags.add('tax_practical_quick')
    if total >= 40:
        tags.add('tax_practical_elaborate')
    if recipe['cookMinutes'] == 0:
        tags.add('tax_practical_no_cook')
    aid = recipe['archetypeId']
    if recipe['cookMinutes'] == 0 or aid in COLD_ARCHETYPES:
        tags.add('tax_practical_cold')
    if aid in PORTABLE_ARCHETYPES:
        tags.add('tax_practical_portable')
    if any(part in aid for part in MEAL_PREP_ARCHETYPE_PARTS):
        tags.add('tax_practical_meal_prep')
    # A recipe is marked as requiring no advance preparation only when it can start from
    # ready/raw/canned inputs. A generic "cooked" component is conservatively treated as
    # prior preparation unless it is explicitly a ready-to-eat/canned ingredient state.
    steps_text = ' '.join(recipe.get('steps',{}).get('it',[])).lower()
    explicit_advance = bool(re.search(r'ammoll|marin|lievit|una notte|per \d+ ore|refrigera per \d+ ore', steps_text))
    has_prior_cooked_component = any(
        ingredients[line['ingredientId']]['state'].get('physical') == 'cooked'
        for line in recipe['ingredients']
    )
    if not explicit_advance and not has_prior_cooked_component:
        tags.add('tax_practical_no_advance_prep')
    if eat_minutes <= 10:
        tags.add('tax_practical_quick_eat')
    return sorted(tags)

# Revise every active recipe so every supported semantic dimension is authored, not implicit.
for rid in sorted(recipes):
    current = recipes[rid]
    updated = copy.deepcopy(current)
    updated['revision'] = current['revision'] + 1
    updated = repair_recipe_semantics(updated)
    updated['cuisineIds'] = sorted(set(updated.get('cuisineIds') or []))
    updated['mealTypeIds'] = list(dict.fromkeys(updated.get('mealTypeIds') or []))
    updated['flavorProfileIds'] = recipe_flavor(updated)
    eat = eating_minutes(updated)
    updated['eatingMinutes'] = eat
    updated['practicalTagIds'] = practical_tags(updated, eat)
    updated['dietTagIds'] = diet_tags(updated)
    updated['preparationTechniqueIds'] = preparation_techniques(updated)
    records.append(updated)

batch = {
    'schemaVersion': 1,
    'batchId': 'catalog_complete_taxonomy_alignment_v1',
    'description': 'Complete taxonomy alignment for the clean catalog: explicit ingredient roles/flavor, corrected product categories, explicit recipe flavor/diet/practical/preparation metadata, and eating-time estimates.',
    'records': records
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(batch, f, ensure_ascii=False, indent=2)
    f.write('\n')

print(f'Wrote {OUT}')
print('records', len(records))
print(Counter(r['kind'] for r in records))
