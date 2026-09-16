# yourDietManager recipe proposal contract

Use this reference when writing `data-proposals/recipes/*.json`.

## Top level

```json
{
  "schemaVersion": 1,
  "proposalId": "2026-09-mediterranean-dinners-01",
  "generatedAt": "2026-09-16T14:30:00.000Z",
  "taxonomyTerms": [],
  "culinaryRoles": [],
  "culinaryArchetypes": [],
  "ingredients": [],
  "recipes": []
}
```

`taxonomyTerms`, `culinaryRoles`, `culinaryArchetypes`, and `ingredients` are optional when no additions are needed. `recipes` may contain any positive batch size.

## New taxonomy term

Use the repository `taxonomy-term.schema.json`. A typical new ProductFood concept is:

```json
{
  "schemaVersion": 1,
  "termId": "product_concept_kale_lacinato",
  "taxonomyId": "product_food",
  "origin": "base",
  "parentTermId": "product_subcategory_leafy_greens",
  "i18n": {
    "it": { "label": "Cavolo nero", "description": "" },
    "en": { "label": "Lacinato kale", "description": "" }
  },
  "aliases": { "it": ["cavolo toscano"], "en": ["Tuscan kale"] },
  "legacyKeys": [],
  "status": "active",
  "supersedesTermId": null,
  "provenance": {
    "sourceType": "curated",
    "sourceLabel": "Recipe catalog authoring",
    "reference": null,
    "rationale": "Specific food concept required by authored recipes."
  },
  "searchTokens": ["cavolo", "kale", "lacinato", "nero", "tuscan"],
  "createdAt": "2026-09-16T14:30:00.000Z",
  "updatedAt": "2026-09-16T14:30:00.000Z"
}
```

Use an existing ProductFood concept instead if it already represents the food.

## Optional new culinary role

```json
{
  "roleId": "broth_liquid",
  "purpose": "Broth or stock used as the cooking liquid of soups and stews.",
  "portionG": { "min": 100, "default": 250, "max": 500 },
  "ingredientRevisionIds": ["existing_revision_id"]
}
```

`ingredientRevisionIds` may be empty when the role is introduced only for new ingredient proposals in the same batch. New ingredient proposals join roles through `culinaryRoleIds`.

## Optional new culinary archetype

```json
{
  "archetypeId": "legume_vegetable_soup",
  "label": "Legume and vegetable soup",
  "mealArchetypes": ["lunch", "dinner"],
  "method": { "type": "heated", "minimumCookMinutes": 20 },
  "slots": [
    { "roleId": "legume_cooked", "minG": 80, "maxG": 180 },
    { "roleId": "vegetable_main_cook", "minG": 80, "maxG": 240 },
    { "roleId": "broth_liquid", "minG": 150, "maxG": 450 },
    { "roleId": "oil_cooking_heat", "minG": 2, "maxG": 10, "optional": true }
  ]
}
```

All slot roles must exist either in T4-B or in `culinaryRoles` from this or an earlier append-only batch.

## New ingredient

The publisher creates an IngredientRevision schema-v2 record. Supply:

```json
{
  "proposalIngredientId": "kale_raw",
  "i18n": {
    "it": { "name": "Cavolo nero, crudo", "aliases": ["cavolo toscano"] },
    "en": { "name": "Lacinato kale, raw", "aliases": ["Tuscan kale"] }
  },
  "basis": { "amount": 100, "unit": "g", "state": "raw" },
  "nutrition": {
    "energyKcal": 0,
    "proteinG": 0,
    "carbsG": 0,
    "fatG": 0,
    "fiberG": 0,
    "sugarsG": null,
    "saturatedFatG": null,
    "saltG": null,
    "sodiumMg": null
  },
  "taxonomy": {
    "foodGroup": "food_group_vegetables",
    "foodSubgroup": "food_subgroup_leafy_greens",
    "flavorProfile": "flavor_fresh",
    "mealArchetypes": ["lunch", "dinner"]
  },
  "productTaxonomy": {
    "categoryId": "product_category_vegetables",
    "subcategoryId": "product_subcategory_leafy_greens",
    "conceptId": "product_concept_kale_lacinato"
  },
  "allergenIds": [],
  "conversions": [],
  "source": {
    "type": "imported",
    "label": "AUTHORITATIVE SOURCE NAME",
    "reference": "STABLE SOURCE REFERENCE",
    "sourceRecordId": "SOURCE RECORD ID",
    "checkedAt": "2026-09-16T14:30:00.000Z",
    "licenseNote": null,
    "energyBasis": "unknown",
    "energyNutrientId": null,
    "energySourceUnit": "kcal",
    "energyOriginalValue": null,
    "energyConversion": "none"
  },
  "quality": {
    "status": "validated",
    "confidence": "high",
    "notes": "Nutrition and identity checked against cited source."
  },
  "display": {
    "it": { "variantLabel": "crudo" },
    "en": { "variantLabel": "raw" }
  },
  "safetyEvidence": {
    "assessmentStatus": "reviewed",
    "containsAllergenIds": [],
    "mayContainAllergenIds": [],
    "compositionCompleteness": "complete",
    "sourceRefs": ["STABLE SOURCE REFERENCE"],
    "reviewedBy": "ChatGPT recipe catalog author",
    "reviewedAt": "2026-09-16T14:30:00.000Z",
    "policyVersion": "ingredient-safety-evidence-v1"
  },
  "culinaryRoleIds": ["vegetable_main_raw", "vegetable_main_cook"]
}
```

The zero nutrition values above are placeholders demonstrating structure only. Never copy placeholder nutrition into a real proposal. Real values must come from the cited source.

`source.label` plus `source.reference` or `source.sourceRecordId` is mandatory. New deployable ingredients require reviewed, complete safety evidence. `allergenIds` must equal `safetyEvidence.containsAllergenIds`.

## Recipe

```json
{
  "proposalRecipeId": "kale_chickpea_bowl_001",
  "culinaryArchetypeId": "legume_grain_salad",
  "mealArchetypes": ["lunch"],
  "i18n": {
    "it": {
      "title": "Insalata di farro, ceci e cavolo nero",
      "description": "Insalata completa con cereali, legumi e verdure.",
      "instructions": [
        "Cuoci e raffredda il farro se non è già pronto.",
        "Massaggia il cavolo nero tagliato finemente con il condimento.",
        "Unisci ceci e farro e servi."
      ]
    },
    "en": {
      "title": "Spelt, chickpea and lacinato kale salad",
      "description": "A complete grain, legume and vegetable salad.",
      "instructions": [
        "Cook and cool the spelt if it is not already prepared.",
        "Massage the finely sliced kale with the dressing.",
        "Combine with chickpeas and spelt and serve."
      ]
    }
  },
  "ingredientLines": [
    { "roleId": "grain_cooked", "ingredientRevisionId": "EXISTING_REVISION", "amountG": 140 },
    { "roleId": "legume_cooked", "ingredientRevisionId": "EXISTING_REVISION", "amountG": 100 },
    { "roleId": "vegetable_main_raw", "proposalIngredientId": "kale_raw", "amountG": 90 },
    { "roleId": "oil_finishing", "ingredientRevisionId": "EXISTING_REVISION", "amountG": 7 }
  ],
  "practical": {
    "prepMinutes": 12,
    "cookMinutes": 0,
    "reheatingRequired": false,
    "coldSuitable": true,
    "portable": true,
    "fridgeRequired": true,
    "freezerSuitable": false,
    "mealPrepSuitable": true,
    "yieldNotes": "One fixed standard serving."
  },
  "tags": {
    "families": ["VALID_RECIPE_FAMILY_TERM"],
    "cuisines": ["VALID_CUISINE_TERM"],
    "diet": ["VALID_DIET_TERM"],
    "flavor": ["VALID_FLAVOR_TERM"],
    "practical": ["VALID_PRACTICAL_TERM"],
    "preparation": ["VALID_PREPARATION_TERM"]
  },
  "culinaryReview": {
    "notes": "Explain briefly why the combination and preparation are coherent."
  }
}
```

Use only tag IDs that exist in current reference data or add the complete taxonomy term in the same proposal. Omit a tag category rather than inventing an ID.

The publisher derives recipe IDs/version IDs, serving count, normalized amounts, nutrition, allergens, search tokens, input digest, content hash and catalog version.

## Validation behavior

`npm run recipes:check` rejects, among other things:

- duplicate/missing proposal IDs;
- invalid schemas/reference data;
- missing provenance for new ingredients;
- unreviewed/incomplete safety evidence on new ingredients;
- ProductFood hierarchy mismatches;
- unknown culinary roles/archetypes;
- role-membership mismatches;
- amounts outside archetype slot ranges;
- missing required archetype slots;
- duplicate titles;
- exact recipe duplicates;
- near-duplicate ingredient sets within overlapping meal archetypes;
- diet tags that contradict ingredient food groups.
