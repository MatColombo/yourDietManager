# V1 Planner Validation — Phase B Implementation Report

**Status:** COMPLETE for planner-power validation

**App:** `1.0.0-rc.28`

**Catalog:** `1.1.0-planner-phase-b`

**Publication channel:** `development` (`releaseEligible=false`)

## 1. Objective

Phase B expands the search space available to the corrected Phase A planner so the user can manually stress the engine across approximately 800–2600 kcal and across hard/soft constraints.

The objective is combinatorial and functional variety, not a release claim about culinary quality.

## 2. Non-negotiable recipe invariant

Phase B does not create scaled servings.

- every `RecipeVersion.servingCount` is `1`;
- every planned recipe component remains `servings=1`;
- ingredient quantities come from discrete fixed templates;
- no algorithm changes ingredient amounts to hit a requested calorie target;
- energy bands are selection filters applied *after* fixed recipe nutrition is calculated.

Machine-readable evidence records:

```text
quantityStrategy = fixed-template-only
servingScalingAllowed = false
energyFittingByIngredientAmountAllowed = false
```

## 3. Ingredient expansion

The public ingredient base remains **600 IngredientFamily / 600 IngredientRevision** records. No synthetic ingredient records were added.

The previous release generator exposed only 141 ingredients to recipe generation. Phase B introduces an explicit culinary-role classifier over the vetted base:

- **311 ingredients eligible** for at least one culinary role;
- **302 distinct ingredients actually used** by the 1,800 recipes.

Roles include ready fruit, dried fruit, raw/cook vegetables, cooked and dry-cook carbohydrates, breakfast cereals/grains, cooked legumes, nuts/seeds, spreads, yogurt/milk, cheese, whole egg, poultry, meat, fish/seafood, cooking oils, seasonings and condiments.

A qualitative cleanup excludes several technically edible but poor general-validation choices from the main roles rather than inflating the diversity metric.

The originally proposed 1,000–1,500 total ingredient-family target is not used as a blocker in this cycle because the Phase A repository snapshot does not include the raw USDA acquisition cache needed to materialize hundreds of additional records safely. Phase B deliberately does not invent foods or duplicate nutrition records to reach a number.

## 4. Recipe corpus

**1,800 RecipeFamily / 1,800 RecipeVersion records.**

Exact meal distribution:

| Meal | Count | Min kcal | Max kcal |
|---|---:|---:|---:|
| Breakfast | 350 | 83.2 | 698.0 |
| Lunch | 450 | 180.5 | 942.8 |
| Dinner | 450 | 186.7 | 935.7 |
| Snack | 300 | 61.0 | 394.2 |
| Mini meal | 250 | 86.7 | 498.5 |
| **Total** | **1,800** |  |  |

The build enforces **31 explicit energy-band quotas** rather than generating toward one ~2000 kcal/day cluster.

## 5. Variety metrics

Current corpus includes at least:

- 1,251 vegetarian recipes;
- 396 vegan recipes;
- 215 pescatarian recipes;
- 1,180 quick recipes;
- 647 no-cook recipes;
- 647 cold-suitable recipes.

Recipe families include bowls, protein plates, egg dishes, one-pot dishes, salads, porridges and snack plates. Allergen exposure is intentionally varied so manual exclusion testing has meaningful candidates to filter.

## 6. Structural quality

Publication scan result:

```text
schemaErrors = 0
unknownIngredientReferences = 0
nutritionErrors = 0
allergenDerivationErrors = 0
missingRequiredLocaleFields = 0
exactDuplicateCount = 0
nearDuplicateCount = 0
```

This is structural validation. Phase C manual use remains responsible for judging plan quality, culinary usefulness and perceived variety.

## 7. Planner feasibility improvement

The Phase A baseline failed most low-energy targets on the 500-recipe corpus.

On Phase B, the standard one-day validation profile succeeds in **30/30 target/tolerance combinations** without serving scaling:

| Tolerance | Feasible targets |
|---:|---|
| ±2% | 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 |
| ±5% | 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 |
| ±10% | 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 |

A separate 7-day ±2% smoke also succeeded at 800, 1400, 2000 and 2600 kcal. Measured generation time in the build environment was approximately 0.5–0.7 seconds per 7-day preview for those four probes.

These numbers demonstrate solver/corpus coverage; they are not dietary recommendations.

## 8. Runtime / PWA changes

- app version: `1.0.0-rc.28`;
- destructive pre-v1 epoch: `v1-planner-phase-b-epoch-1` so browsers do not mix the 500-recipe snapshot with Phase B;
- shell cache: `v31`;
- data cache: `v16`;
- browser acceptance derives expected recipe count and catalog version from the built manifest instead of hardcoding `500` / `1.0.0`;
- active CI workflow rebuilds Phase B, republishes it and fails on generated drift.

## 9. Automated Phase B gate

`npm run v1:planner-phase-b` checks:

- 1,800 recipe publication;
- 600/600 ingredient reference integrity;
- >=300 eligible and actually used ingredients;
- fixed-template / no-scaling contract;
- exact 31-band matrix;
- energy envelopes;
- diet/practical variety floors;
- zero structural quality blockers;
- full core pack;
- PWA cache parity;
- dynamic browser manifest expectations;
- deterministic CI rebuild contract;
- all 30 800–2600 feasibility cases.

## 10. Known limitations before Phase C

1. The ingredient-family count is still 600; Phase B increases *effective use* rather than raw source count.
2. USDA source labels can be verbose or uncommon. The corpus is suitable for planner stress testing but has not received a final culinary/editorial review.
3. `NO_FEASIBLE_PLAN` remains a bounded-search statement as defined in Phase A.
4. The standard 30-case feasibility matrix does not prove every hard/soft-constraint combination is feasible; that is exactly what Phase C manual stress testing is for.
5. Stable V1 promotion remains suspended.

## 11. Handoff

Phase B creates a sufficiently broad baseline to begin **Phase C — user-led manual planner validation**.

Phase C should test target/tolerance, hard exclusions, deliberately impossible configurations, soft preferences/macros/frequency/variety, DayClass capabilities, external meals, replacement, rebalance and shopping behavior while inspecting the planner diagnostics introduced in Phase A.
