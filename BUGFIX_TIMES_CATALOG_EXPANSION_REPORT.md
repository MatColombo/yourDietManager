# Bugfix + Time Audit + Catalog Expansion Report

Date: 2026-09-24

## Scope

This update closes four reported application defects and expands/reviews the authored food corpus.

### Functional defects

1. Generated-plan meal replacement no longer throws `check is not defined`; the preview UI now owns the checkbox helper used by the incompatible-candidate mode.
2. Ingredient substitution candidates expose a stable numeric `affinityScore` alias, preventing `NaN%` in recipe pages.
3. Calendar timeline insert/remove controls are available directly on the main calendar page. A structural splice can proceed when the resulting projection contains `frequency_window` violations; those violations are surfaced as explicit warnings so the timeline manipulation itself is not blocked.
4. The quick-snack preset preparation ceiling is aligned with the reviewed corpus (`prepMinutes <= 10`) instead of the former overly tight six-minute threshold.

## Full recipe-time audit

Batch `010-complete-recipe-time-audit.json` revises all 1,030 pre-expansion recipes.

The audit is semantic rather than multiplicative. It considers:

- washing/cutting/portioning work;
- raw meat, fish and egg cooking;
- dry grain, pasta and legume hydration/cooking;
- the declared preparation technique;
- multiple active cooking techniques;
- recipe-step count and shaping work;
- dish-specific multi-stage floors for gnocchi, ragù, ribollita, parmigiana, timballi, gratins, baked pasta, crespelle, stuffed baked vegetables, croquettes/fritters and slow pork roasts.

Observed changes versus the previous corpus:

- prep median: 8 -> 12 min; mean: 8.7 -> 11.8 min;
- cook median: 12 -> 12 min; mean: 14.7 -> 17.3 min;
- total median: 18.5 -> 26 min; mean: 23.4 -> 29.1 min;
- prep: 860 increased, 99 decreased, 71 unchanged;
- cook: 415 increased, 205 decreased, 410 unchanged.

The decreases are intentional evidence that this is not a blanket inflation pass.

## Ingredient and recipe expansion

Batch `011-global-cuisine-technique-expansion.json` adds 13 ingredients and 230 recipes.

New ingredients include beef sirloin, rabbit, lean lamb leg, tofu, avocado, feta, paneer, shoyu, miso, sesame oil, corn tortilla, rice paper and paprika.

### Meat coverage

- Beef: 30 unique recipes.
- Rabbit: 30 unique recipes.
- Lamb: 30 unique recipes.

Each set spans pan cooking, grilling, braising, roasting, stewing and sauteing with different vegetable/aromatic combinations.

### Requested non-Italian cuisines

- Japanese: 10.
- Indian: 3.
- Greek: 2.
- Spanish: 10.
- Chinese: 10.
- Mexican: 5.

These are main-meal recipes with varied energy profiles and reuse existing catalog ingredients where a reasonable adaptation exists.

### Fusion

Exactly 100 recipes are classified under the new Fusion cuisine. The final set is manually structured as cookable modern recipes rather than combinatorial placeholders. It includes rice-paper crispy parcels, miso/avocado/feta pasta, tofu/seafood bowls, modern tacos, steamed dishes, sheet-pan roasts and blended sauces.

The Fusion block also closes every preparation-technique/diet combination that was empty before the expansion. Final corpus counts are:

| Technique | Vegan | Vegetarian | Pescatarian |
| --- | ---: | ---: | ---: |
| Blending | 8 | 43 | 5 |
| Braising | 5 | 10 | 5 |
| Frying | 6 | 12 | 7 |
| Roasting | 7 | 14 | 5 |
| Steaming | 5 | 11 | 6 |

## Resulting catalog

- Ingredients: 295.
- Recipes: 1,260.
- Authored source files: 12.
- Compiled catalog: `clean-6e81d46b0cd7`.

## Verification

`npm run check` passes:

- catalog tests: 28/28;
- configuration transfer tests: 5/5;
- planner/interaction tests: 29/29;
- frequency-cap tests: 2/2;
- JavaScript syntax/lint: PASS (291 files);
- static PWA build: PASS;
- GitHub Pages audit: PASS.

Browser regression starts Chromium but is marked `SKIPPED` because the execution environment blocks local HTTP navigation; this is an environment limitation rather than an application failure.
