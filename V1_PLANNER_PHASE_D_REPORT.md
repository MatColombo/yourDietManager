# V1 Planner Phase D1 + D2 Implementation Report

**App:** `1.0.0-rc.30`  
**Catalog:** `1.2.0-planner-phase-d`  
**Status:** implemented; user-led planner/product validation continues. This is not a stable V1 release.

## Scope

Phase D1+D2 addresses two problems found during manual validation:

1. regenerating selected dates could appear to do nothing because the same deterministic/best recipes were allowed to win again;
2. ingredient preferences were exposed at an overly technical IngredientRevision level, and the catalog lacked a user-facing Dairy/Latticini category.

D3–D5 (hierarchical picker, faceted search, direct Day->Recipe->Ingredient navigation) remain deliberately out of scope.

## D1 — regeneration semantics

`createRebalancePreview` now accepts two explicit modes:

- `recalculate`: current recipes are legal; same result is allowed;
- `alternative`: strict attempt excludes current RecipeVersion IDs per meal occurrence. If the strict bounded search fails, fallback uses the normal hard-filtered space but adds a large current-recipe penalty.

The preview exposes changed/retained counts and strict-attempt diagnostics. A retained recipe after strict failure is described as a bounded-search result, not as proof that no alternative exists.

A real one-day functional test confirms that, on the current 1,800-recipe corpus, strict alternative search changes every planned slot while preserving hard constraints.

## D2 — product food taxonomy

New taxonomy: `product_food`.

Hierarchy:

```text
FoodCategory
  -> FoodSubcategory
    -> IngredientConcept
      -> IngredientRevision
```

Current metrics:

- 600 / 600 IngredientRevision classified;
- 18 root categories;
- 203 terms total;
- 19 Dairy/Latticini ingredient revisions;
- 11 noodle technical variants grouped under `product_concept_noodles`;
- 0 known false Dairy assignments in the sentinel audit.

The taxonomy is independent from:

- source/USDA `foodGroup`;
- culinary role;
- allergen taxonomy.

`productFood` targets are accepted by FoodPreferences, allergy/intolerance rules and MealClass rules. A functional test confirms that `product_category_dairy + autoExclude=true` behaves as a hard planner constraint.

## Data/versioning decision

Phase D2 enriches pre-V1 IngredientRevision semantics while preserving recipe identities and quantities. Because existing browser databases may contain Phase B revisions without `productTaxonomy`, the candidate uses:

- DB version 6;
- pre-V1 data epoch `v1-planner-phase-d-epoch-1`;
- shell cache v33;
- data cache v17.

The pre-V1 reset is intentional. No compatibility guarantee is claimed before stable V1.

RecipeVersion content was not regenerated. The recipe digest remains:

`5e3bd7661171cff9434b03bb9951d58779ed84dc2e0e9910d36d1ebc517f53f2`

Serving scaling remains prohibited; every published RecipeVersion has `servingCount=1`.

## Validation

- Phase D functional tests: 4/4 PASS
- Phase D policy gate: 21/21 PASS
- repository tests: 226/226 PASS
- Phase A gate: 16/16 PASS
- Phase B gate: 18/18 PASS
- Phase B feasibility audit: 30/30 PASS over 800–2600 kcal
- Phase C gate: 25/25 PASS
- Step 2 vertical gate: 12/12 PASS
- lint: 177 JavaScript files PASS
- accessibility: 16/16 PASS
- form audit: PASS
- planner smoke: PASS
- build: PASS
- revision closure: 13/13 PASS
- Pages artifact audit: PASS
- local Chromium: SKIPPED only because localhost HTTP is blocked in the execution environment; GitHub Pages keeps `YDM_BROWSER_REQUIRED=1`.

## Next product work

D3–D5 should build on this taxonomy rather than reintroducing raw IngredientRevision selection:

1. shared hierarchical taxonomy picker;
2. faceted ingredient/recipe discovery;
3. direct contextual Day -> Recipe -> Ingredient navigation.
