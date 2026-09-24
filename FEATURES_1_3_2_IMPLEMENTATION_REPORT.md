# Features 1 + 3 + 2 implementation report

## Scope

Implemented the first low-risk feature block from `NEXT_FEATURE_ASSESSMENT.md`:

1. ingredient-level nutrition contribution in recipe detail;
3. kcal per proposed meal in plan previews;
2. recipe search by taxonomy categories.

## Feature 1 — nutrition contribution by ingredient

`src/domain/nutritionCore.js` now exposes a canonical single-line nutrition calculation and a recipe breakdown helper. Recipe detail uses the same nutrition basis and rounding contract as the recipe total.

The recipe ingredient table now shows, for every ingredient:

- original recipe amount/unit;
- kcal contribution;
- protein contribution;
- carbohydrate contribution;
- fat contribution;
- fiber contribution;
- percentage share of the recipe total for each displayed nutrient.

The ingredient name remains a direct link to the ingredient detail/revision, and the row retains variant/weighing context.

No catalog schema change is required.

## Feature 3 — kcal per proposed meal

Plan preview hydration now keeps a compact nutrition map for the recipe versions already loaded for labels. `previewDays()` sums the energy of all components in each planned meal, respecting `servings`, and renders a dedicated kcal badge beside the proposed recipe name.

The same preview component is reused by initial generation, extension and rebalance flows, so the enhancement is consistent across those previews.

No planner scoring or persisted plan schema changed.

## Feature 2 — recipe taxonomy filters

Recipe search now provides first-class filters for:

- recipe family;
- cuisine;
- diet tag;
- flavor profile;
- practical tag;
- preparation technique.

These are grouped under a dedicated taxonomy section. Existing meal, ProductFood, origin, pack, nutrition, preparation-time and allergen filters remain available and can be combined with the new filters.

`CatalogQueryService` applies AND semantics across taxonomy dimensions. A recipe must satisfy every populated taxonomy filter. The current catalog size does not justify an IndexedDB schema migration solely for tag indexes; taxonomy-only queries use the existing bounded browsable-catalog scan, while indexed filters continue to reduce the candidate set first when present.

## Caching and deployment

The PWA shell cache was advanced from `v48` to `v49` because the update changes JS, CSS and locale resources.

## Verification

Added `tests/catalog-feature-123.test.mjs` covering:

- nutrition contribution values and percentage shares;
- per-meal energy aggregation including servings;
- all six recipe taxonomy filter dimensions;
- actual `CatalogQueryService` filtering behavior.

Final gate:

- catalog compilation: pass;
- catalog tests: 23/23 pass;
- planner/interaction tests: 15/15 pass;
- lint: pass;
- PWA build: pass;
- GitHub Pages audit: pass.

Browser regression starts Chromium but is skipped in this execution environment because local HTTP navigation is blocked by policy.
