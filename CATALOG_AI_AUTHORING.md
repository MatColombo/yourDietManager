# yourDietManager — AI Catalog Authoring Protocol

## 1. Purpose

This file is the mandatory instruction set for any AI asked to create or modify the yourDietManager food catalog.

The AI must use this protocol every time the user asks to:

- create recipes;
- modify recipes;
- create ingredients;
- modify ingredients;
- add or refine taxonomy;
- retire incorrect catalog records;
- generate a new seed catalog.

The goal is a simple end-to-end workflow:

```text
user prompt
  -> AI produces one JSON batch
  -> JSON file is added to the catalog folder in GitHub
  -> deploy loads all JSON files in the folder
  -> catalog compiles deterministically
  -> app works with the new/updated recipes and ingredients
```

There is no staging model, proposal registry, migration chain, fuzzy reconciliation service, or production AI API.

The AI is the semantic author. The application is the deterministic validator/compiler/runtime.

---

## 2. Catalog model: append-only batches

All catalog source files live in one folder:

```text
catalog-source/
  *.json
```

Every `.json` file in the folder is loaded on build/deploy.

A file is a **batch** and may contain taxonomy terms, ingredients, and recipes together.

Do not depend on filename ordering.

Every authored record has:

```json
{
  "kind": "taxonomy_term | ingredient | recipe",
  "id": "stable_machine_id",
  "revision": 1,
  "status": "active"
}
```

Resolution rules:

1. Group records by `kind + id`.
2. Select the record with the highest integer `revision`.
3. Same `kind + id + revision` with different content is a hard error.
4. `status: "retired"` removes that logical record from the active catalog while preserving its history in source JSON.
5. Never mutate meaning in place without incrementing `revision`.
6. References always use stable logical `id`, never filenames or array positions.

This allows a future prompt to update an existing object simply by emitting a newer revision in a new batch file.

---

## 3. General authoring rules

### 3.1 Never invent catalog facts that should be sourced

Do not invent:

- nutrition values;
- allergen composition;
- authoritative food identity;
- source IDs;
- safety claims.

For a new ingredient that requires nutritional data, use an authoritative food-composition source such as CREA or USDA FoodData Central and store the provenance.

If trustworthy source data cannot be established, do not create that ingredient as production-ready. Prefer an existing ingredient or report the missing dependency.

### 3.2 Derived values are not AI-authored recipe facts

The AI authors recipe ingredients and gram amounts.

The deterministic compiler derives recipe-level:

- kcal;
- protein;
- carbohydrate;
- fat;
- fiber;
- allergens;
- diet compatibility when derivable from ingredient facts;
- ingredient totals.

Do not hard-code recipe nutrition merely to make a target pass.

### 3.3 Culinary sense is mandatory

A structurally valid recipe that is not a plausible dish is invalid.

Reject combinations that exist only to satisfy calories/macros.

Examples of invalid behavior:

- lemon as a normal full fruit portion in a fruit bowl;
- jalapeno as 150 g of the main vegetable;
- flaxseed oil as a high-heat cooking oil;
- tomato concentrate as the main vegetable portion;
- milk treated as yogurt;
- sweetened nuts inserted into an otherwise savory dish without culinary reason;
- raw grains assigned unrealistically short cooking times;
- names built by mechanically concatenating source database descriptors.

### 3.4 Prefer specific semantics

Do not create product-facing categories such as:

- other vegetable;
- other fruit;
- other citrus;
- other grain;

when the ingredient can be identified specifically.

Fallback categories may exist internally only for genuinely unresolved source records. They must not be used for newly authored ingredients or recipe-facing labels.

### 3.5 Source descriptor is not display identity

Keep separate:

- canonical food identity;
- food state;
- source database descriptor;
- user-facing name.

Example:

```text
canonical identity: bell_pepper_orange
state: raw
display.it: Peperone arancione
display.en: Orange bell pepper
source descriptor: Peppers, bell, orange, raw
```

Never expose the raw source descriptor as the normal recipe ingredient name when a natural user-facing name is available.

---

## 4. Stable IDs

IDs must be lowercase ASCII snake_case.

Recommended patterns:

```text
tax_product_zucchini
tax_category_vegetables
tax_role_main_vegetable
tax_archetype_pasta_dish

ing_zucchini_raw
ing_chickpeas_cooked
ing_extra_virgin_olive_oil

recipe_pasta_zucchini_lemon
recipe_chickpea_far_ro_salad
```

Use one stable logical ID per meaning.

A change in wording does not require a new ID.
A change in semantic identity does.

Do not encode revision numbers into logical IDs.

---

## 5. Taxonomy records

Use taxonomy to describe reusable semantic concepts, not individual recipes.

### 5.1 Required taxonomy types

The catalog should support at least:

- `ingredient_category`
- `product`
- `culinary_role`
- `recipe_archetype`
- `cuisine`
- `meal_type`
- `diet_tag`
- `practical_tag`

### 5.2 Taxonomy record schema

```json
{
  "kind": "taxonomy_term",
  "id": "tax_product_zucchini",
  "revision": 1,
  "status": "active",
  "taxonomyType": "product",
  "parentId": "tax_category_vegetables",
  "labels": {
    "it": "Zucchina",
    "en": "Zucchini"
  },
  "aliases": {
    "it": ["Zucchine"],
    "en": ["Courgette"]
  }
}
```

Rules:

- `parentId` must exist if present.
- Do not create two active product terms with the same semantic meaning.
- Singular canonical labels are preferred for ingredient concepts.
- Taxonomy labels must be natural language, not source-database strings.

---

## 6. Ingredient records

Create a new ingredient only when an appropriate existing ingredient does not already represent the required food and state.

Different culinary/nutritional states may require different ingredient records, for example:

- chickpeas dry;
- chickpeas cooked;
- chickpeas canned drained.

Do not encode the state only inside a display name.

### 6.1 Ingredient schema

```json
{
  "kind": "ingredient",
  "id": "ing_zucchini_raw",
  "revision": 1,
  "status": "active",

  "productId": "tax_product_zucchini",
  "categoryId": "tax_category_vegetables",

  "state": {
    "physical": "raw",
    "preservation": "fresh",
    "drained": false
  },

  "display": {
    "it": "Zucchina cruda",
    "en": "Raw zucchini"
  },

  "culinaryRoles": [
    "tax_role_main_vegetable_raw",
    "tax_role_main_vegetable_cook"
  ],

  "nutritionPer100g": {
    "energyKcal": 0,
    "proteinG": 0,
    "carbohydrateG": 0,
    "fatG": 0,
    "fiberG": 0
  },

  "allergens": [],

  "dietFlags": {
    "vegetarian": true,
    "vegan": true
  },

  "source": {
    "provider": "CREA | USDA_FDC | other_authoritative_source",
    "sourceId": "...",
    "description": "original source description",
    "retrievedOrVerifiedDate": "YYYY-MM-DD"
  },

  "notes": {
    "it": "",
    "en": ""
  }
}
```

`nutritionPer100g` values above are placeholders in this example only. Never publish placeholders or zero values unless the source genuinely reports zero.

### 6.2 Ingredient rules

- Nutrition basis is always per 100 g edible portion unless explicitly documented otherwise.
- Keep source provenance.
- Use gram-compatible foods for recipe calculations.
- Do not merge foods only because their English names share a word.
- Do not merge different culinary identities such as green peas, split peas, and black-eyed peas.
- Do not classify foods by naive substring matching such as `orange` -> citrus.
- Distinguish cooking oils from finishing oils when relevant.
- Distinguish main vegetables from aromatics, chilies, concentrates, condiments, and herbs.
- Distinguish yogurt from milk and cultured drinks.
- Distinguish dry grains from cooked grains and ready-to-eat cereal products.

---

## 7. Recipe records

Every recipe must represent one realistic serving because the application scales plans separately.

### 7.1 Recipe schema

```json
{
  "kind": "recipe",
  "id": "recipe_pasta_zucchini_lemon",
  "revision": 1,
  "status": "active",

  "title": {
    "it": "Pasta con zucchine e limone",
    "en": "Pasta with zucchini and lemon"
  },

  "description": {
    "it": "Pasta mediterranea con zucchine saltate, limone e olio extravergine.",
    "en": "Mediterranean pasta with sauteed zucchini, lemon and extra virgin olive oil."
  },

  "cuisineIds": ["tax_cuisine_italian", "tax_cuisine_mediterranean"],
  "mealTypeIds": ["tax_meal_lunch", "tax_meal_dinner"],
  "archetypeId": "tax_archetype_pasta_dish",

  "servings": 1,

  "ingredients": [
    {
      "ingredientId": "ing_pasta_dry",
      "grams": 80
    },
    {
      "ingredientId": "ing_zucchini_raw",
      "grams": 180
    },
    {
      "ingredientId": "ing_extra_virgin_olive_oil",
      "grams": 10
    },
    {
      "ingredientId": "ing_lemon_raw",
      "grams": 15,
      "usage": "juice_and_zest"
    }
  ],

  "steps": {
    "it": [
      "Cuoci la pasta al dente.",
      "Salta le zucchine con l'olio.",
      "Unisci la pasta e completa con succo e scorza di limone."
    ],
    "en": [
      "Cook the pasta until al dente.",
      "Saute the zucchini with the olive oil.",
      "Combine with the pasta and finish with lemon juice and zest."
    ]
  },

  "prepMinutes": 10,
  "cookMinutes": 20,

  "practicalTagIds": ["tax_practical_quick"],
  "dietTagIds": ["tax_diet_vegetarian"]
}
```

### 7.2 Recipe rules

- `servings` must be `1`.
- Every referenced ingredient must exist in the resolved catalog.
- Gram quantities must be plausible for one serving.
- Titles must sound like real dishes.
- Titles must not contain source-descriptor parentheses.
- A recipe should normally have 2–8 meaningful ingredients excluding optional water/salt/spices.
- Preparation steps must be compatible with ingredient states.
- Cooking time must be realistic.
- A recipe must not require an ingredient state that contradicts its preparation.
- Do not duplicate an existing recipe merely by changing one trivial ingredient unless the result is a genuinely distinct dish.
- Avoid recipe families made of hundreds of template permutations.

---

## 8. Mediterranean / Italian authoring principles

Prefer recipes that resemble food people would intentionally cook and recognize.

Prioritize:

- extra virgin olive oil;
- vegetables;
- legumes;
- whole grains and traditional grains;
- pasta, rice, bread, polenta, farro, barley;
- fish and seafood;
- eggs;
- moderate dairy;
- nuts and seeds;
- fruit;
- herbs and aromatics.

Use meat, processed meat, butter, cream, and highly processed foods more selectively.

Italian recipes should use plausible Italian combinations and preparation methods rather than merely Italian ingredient names.

Examples of useful recipe archetypes:

- pasta dish;
- risotto;
- grain salad;
- legume soup;
- vegetable soup/minestrone;
- frittata;
- omelette;
- fish with vegetable side;
- chicken with vegetables;
- pulse and grain bowl;
- bruschetta/crostini;
- sandwich/piadina;
- yogurt and fruit bowl;
- porridge;
- fruit and nuts snack;
- vegetable and cheese plate;
- baked vegetable dish;
- stuffed vegetable;
- simple stew;
- Mediterranean salad.

Do not force every recipe into the same protein + carbohydrate + vegetable template.

---

## 9. Creating missing taxonomy or ingredients inside a recipe batch

A batch may contain all dependencies needed by its recipes.

Order inside the JSON file does not matter.

If a requested recipe needs a missing product concept:

1. create the required taxonomy term;
2. create the ingredient record with authoritative nutrition/provenance;
3. reference the new ingredient from the recipe.

Example batch envelope:

```json
{
  "schemaVersion": 1,
  "batchId": "2026-09-17-mediterranean-round-01",
  "description": "Initial Mediterranean catalog seed",
  "records": [
    { "kind": "taxonomy_term", "id": "...", "revision": 1 },
    { "kind": "ingredient", "id": "...", "revision": 1 },
    { "kind": "recipe", "id": "...", "revision": 1 }
  ]
}
```

Do not create an ingredient if an existing ingredient already represents the same food/state adequately.

---

## 10. Updating existing records

To modify an existing recipe, ingredient, or taxonomy term:

1. read the entire current catalog source folder;
2. resolve the current highest revision for the target `id`;
3. preserve fields that remain correct;
4. emit a complete replacement record with `revision = previousRevision + 1`;
5. never emit a partial patch record.

Example:

```json
{
  "kind": "recipe",
  "id": "recipe_pasta_zucchini_lemon",
  "revision": 2,
  "status": "active",
  "...": "complete updated record"
}
```

To remove a bad recipe:

```json
{
  "kind": "recipe",
  "id": "recipe_bad_old_recipe",
  "revision": 3,
  "status": "retired"
}
```

---

## 11. Mandatory checks before emitting a batch

Before returning JSON, the AI must review every generated record against these checks.

### Taxonomy

- every referenced taxonomy ID exists in current catalog or current batch;
- no duplicate semantic concepts;
- no generic fallback when a specific concept is known;
- labels are natural Italian and English.

### Ingredients

- identity is specific and coherent;
- state is explicit;
- nutrition has authoritative provenance;
- culinary roles are plausible;
- allergens are coherent;
- no source descriptor is used as normal display identity;
- no duplicate ingredient representing the same food and state.

### Recipes

- every ingredient reference resolves;
- ingredient amounts are positive and realistic;
- serving count is 1;
- dish is culinarily plausible;
- title is natural;
- preparation matches ingredient states;
- time is realistic;
- recipe is materially distinct from existing recipes;
- no nutrition values are fabricated to meet a target;
- meal type is plausible;
- dietary labels are compatible with ingredients.

If a requested recipe fails culinary plausibility, do not generate it simply to meet a requested count. Replace it with a better recipe satisfying the same intent.

---

## 12. Output rules for the AI

For a normal user prompt, output exactly one batch JSON file ready to place into `catalog-source/`.

Preferred filename:

```text
YYYY-MM-DD-short-purpose.json
```

Do not require the user to manually edit IDs, hashes, nutrition totals, manifests, or indexes.

Do not output migration instructions.

Do not output staging/proposal artifacts.

Do not mutate existing JSON files unless the user explicitly asks for a consolidated rewrite. Normal updates are new batch files with higher revisions.

If the requested change requires a new ingredient, include the ingredient and any required taxonomy records in the same batch.

---

## 13. Seed catalog requirements

When asked to create the catalog from zero, build a compact but useful Mediterranean/Italian seed instead of a huge combinatorial dataset.

### 13.1 Ingredient seed target

Target approximately **140–180 active ingredient records**, including distinct useful states.

Prioritize:

**Grains/starches**
- durum wheat pasta, whole-wheat pasta;
- rice suitable for risotto, brown rice;
- farro, barley, couscous, oats, polenta/cornmeal;
- bread, whole-grain bread, piadina if nutritionally sourced;
- potatoes, sweet potatoes.

**Legumes**
- chickpeas;
- lentils;
- cannellini beans;
- borlotti beans;
- kidney beans;
- peas;
- broad beans when sourced.

Use dry/cooked/canned-drained states only when they are operationally useful.

**Vegetables**
- tomato, passata and tomato concentrate as distinct concepts/roles;
- zucchini;
- eggplant;
- bell peppers;
- broccoli;
- cauliflower;
- spinach;
- chard;
- carrots;
- onion;
- garlic;
- celery;
- fennel;
- lettuce;
- rocket;
- cucumber;
- pumpkin/squash;
- artichoke;
- green beans;
- asparagus;
- mushrooms;
- radicchio/cabbage family where sourced.

**Fruit**
- apple, pear;
- orange, mandarin;
- lemon as culinary acid, not normal fruit-portion default;
- banana;
- grapes;
- strawberry and representative berries;
- peach, apricot;
- kiwi;
- melon, watermelon;
- seasonal Mediterranean fruit where reliable data exists.

**Fish/seafood**
- sardines;
- mackerel;
- tuna;
- salmon;
- cod;
- sea bass;
- sea bream;
- anchovies;
- shrimp/prawns;
- selected molluscs if sourced.

**Meat/eggs**
- eggs;
- chicken breast and/or thigh;
- turkey;
- a small number of practical lean beef/pork cuts if needed.

**Dairy**
- milk;
- plain yogurt;
- Greek-style yogurt;
- mozzarella;
- ricotta;
- Parmigiano Reggiano/Parmesan-compatible entry;
- pecorino;
- selected fresh cheese if useful.

**Fats/nuts/seeds**
- extra virgin olive oil;
- selected neutral cooking oil only if needed;
- almonds, walnuts, hazelnuts, pistachios, pine nuts;
- sesame and selected seeds when useful.

**Herbs/condiments/pantry**
- basil, parsley, rosemary, sage, oregano, thyme;
- capers, olives;
- vinegar;
- lemon juice via lemon ingredient/usage rather than duplicate fabricated foods when possible;
- flour, breadcrumbs;
- passata and tomato paste;
- cocoa/honey only if useful for breakfast/snacks and properly sourced.

### 13.2 Recipe seed target

Target **120–150 active recipes**.

Suggested initial distribution:

- 20–25 breakfasts;
- 30–35 lunches;
- 30–35 dinners;
- 20–25 snacks;
- 10–15 mini meals / light meals.

The exact count is less important than variety and plausibility.

Required coverage should include:

- vegetarian recipes;
- vegan recipes;
- fish-based recipes;
- poultry recipes;
- egg-based recipes;
- legume-forward recipes;
- quick meals;
- cold/no-cook meals;
- meal-prep-friendly dishes;
- several different energy densities rather than one narrow calorie band.

Prefer recognizable dishes and realistic variations, for example:

- pasta al pomodoro;
- pasta e ceci;
- pasta e lenticchie;
- pasta with zucchini;
- pasta with eggplant and tomato;
- risotto with zucchini;
- risotto with mushrooms;
- farro salad with vegetables;
- barley and legume soup;
- minestrone;
- chickpea and rosemary soup;
- lentil soup;
- panzanella;
- caprese-style salad;
- Greek/Mediterranean salad where appropriate;
- frittata with zucchini;
- frittata with spinach;
- chicken with rosemary and potatoes;
- chicken with peppers;
- baked fish with tomatoes and olives;
- sardines with vegetables;
- cod with tomato and capers;
- tuna and bean salad;
- chickpea and vegetable salad;
- lentil and farro salad;
- bruschetta with tomato;
- ricotta and tomato toast;
- yogurt with fruit and nuts;
- oat porridge with fruit;
- bread, ricotta and fruit breakfast;
- fruit and nuts snacks.

Do not generate 120 recipes by producing trivial permutations of the same template.

---

## 14. How to respond to future prompts

When the user requests new recipes or modifications:

1. Read this protocol.
2. Read all current `catalog-source/*.json` files.
3. Resolve current active taxonomy, ingredients and recipes by highest revision.
4. Interpret the user's prompt as the editorial brief.
5. Reuse existing ingredients/taxonomy whenever correct.
6. Create missing taxonomy/ingredients only when necessary.
7. Create or update recipes with realistic culinary semantics.
8. Perform the mandatory self-review in section 11.
9. Return one new complete batch JSON file.

The final objective is always:

```text
prompt -> one JSON batch -> GitHub folder -> deploy -> working catalog in app
```

Anything that does not contribute directly to that flow should be avoided.

---

## 16. Repository implementation contract

The live repository implements this protocol with these exact paths:

```text
CATALOG_AI_AUTHORING.md        # instructions for the AI author
catalog-source/*.json          # the only authored base-catalog source
public/data/catalog.json       # generated; never edit manually
```

The deterministic command is:

```bash
npm run catalog:compile
```

The deployment build runs the compiler automatically. A normal authoring loop therefore requires only one new JSON batch in `catalog-source/`.

The first application load on `clean-catalog-epoch-1` deliberately deletes the old IndexedDB contents so no legacy ingredient, recipe, taxonomy, migration artifact, plan, or historical catalog record survives into the clean catalog. Subsequent compiled-catalog changes replace catalog records and clear plan/history/shopping records that reference the previous catalog while leaving current application configuration intact.

The compiler translates this authoring model into the existing internal runtime records used by the planner and UI. The AI must never author internal `IngredientRevision`, `RecipeVersion`, hashes, catalog manifests, shards, migration records, or IndexedDB metadata.

### Exact supported ingredient state values

`state.physical` must be one of:

```text
raw
cooked
dry
drained
prepared
ready_to_eat
as_sold
unknown
```

If `state.drained` is `true`, the compiled runtime state is `drained`.

### Exact supported meal IDs

Use the foundation terms when applicable:

```text
tax_meal_breakfast
tax_meal_lunch
tax_meal_dinner
tax_meal_snack
tax_meal_mini_meal
```

Additional runtime-supported meal archetypes may be introduced only with a matching `meal_type` taxonomy term whose ID is `tax_meal_<runtime_archetype>`.

### Build failure is intentional

Do not work around compiler failures. A deploy must fail when a batch contains conflicting revisions, missing references, invalid taxonomy parentage, unsupported allergens/states, incomplete nutrition provenance, impossible diet labels, or recipes that reference missing ingredients.

## Canonical ProductFood identity: do not split preferences by cosmetic variants

`productId` is the canonical food identity used by preferences. It must not be split merely because the source dataset distinguishes color, cultivar wording, cut, preparation descriptor, brand wording, or other technical variants when users reasonably perceive them as the same food.

Examples:

- red / yellow / green / orange bell pepper -> one canonical ProductFood `Peperone`;
- raw / cooked / drained -> separate ingredient records when nutrition/use differs, but normally the same ProductFood;
- source wording such as `banana pepper` must not be relabeled as `friggitello` unless the source actually supports that identity.

A user preference on a canonical ProductFood must cover all of its ingredient forms. Create a separate ProductFood only when it is a genuinely different food concept from a user's culinary point of view.
