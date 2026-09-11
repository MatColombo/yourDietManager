# V1 Planner Phase F — Quality Tuning Report

## Status

Phase F implementation is complete in app `1.0.0-rc.33` on catalog `1.2.0-planner-phase-d`. The catalog, DB v6, pre-V1 data epoch and data cache v17 are unchanged. Shell cache advances to v36 only.

Phase F changes planner **soft-objective composition**. It does not relax or reinterpret any hard constraint. Daily energy tolerance, allergy/intolerance, `autoExclude`, MealClass `forbid`, day capabilities, recipe readiness, meal archetype compatibility and fixed serving remain hard.

## Finding

The pre-F planner had sufficient catalog coverage but poor long-horizon variety. On 14-day standard plans at ±2%, only 41–45% of recipe components were unique at 1400/2000/2600 kcal and the same recipe could repeat 31–41 times in pairwise 7-day windows.

The root cause was not the corpus. `buildSlotOptions()` recomputed slot nutrition at full weight, then multiplied the entire per-recipe score by `0.15`. Because that score also contained preference and variety, user-facing soft constraints were attenuated to 15% at the final option-selection stage.

## Change

Phase F introduces `PLANNER_SOFT_OBJECTIVE_POLICY` and separates option scoring into:

- slot nutrition: full recomputed option-level objective;
- per-recipe nutrition: 0.15 tie-break contribution only;
- preference: full weight;
- variety: full weight;
- regeneration penalty: full weight;
- additional complete RecipeVersion components: unchanged small penalty.

Variety windows remain soft but are strengthened for exact short-window repeats:

| Window | exact recipe | family | primary ingredient | source food category | cuisine |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 days | 24 | 3.5 | 3.0 | 0.9 | 0.7 |
| 7 days | 12 | 1.5 | 1.2 | 0.35 | 0.25 |
| 14 days | 3 | 0.4 | 0.35 | 0.1 | 0.08 |

No repeat is made hard. If hard feasibility requires reuse, the planner may still reuse a recipe.

## Measured result

14-day standard configuration, ±2% energy tolerance:

| kcal | unique recipe rate | same-recipe pairs ≤3d | same-recipe pairs ≤7d |
| ---: | ---: | ---: | ---: |
| 800 | 64.3% | 0 | 0 |
| 1000 | 71.4% | 0 | 0 |
| 1400 | 82.1% | 0 | 0 |
| 2000 | 78.6% | 0 | 0 |
| 2600 | 73.2% | 0 | 6 |

Before F, the measured unique rates were 44.6% at 1400, 44.6% at 2000 and 41.1% at 2600; same-recipe pairs within seven days were respectively 33, 31 and 41.

The raw planner objective score is not compared before/after because Phase F intentionally changes objective composition; quality metrics and hard validity are the comparison dimensions.

## Soft-direction checks

At 2000 kcal / 7 days / ±2%:

- baseline: 4 vegan occurrences;
- prefer vegan: 6;
- MealClass avoid vegan: 3;
- frequency vegan: 2;
- high-protein profile raises average planned protein from about 102.9 g/day to 125.0 g/day while retaining 78.6% unique recipes;
- high-fiber profile converges to its configured 30 g/day target while retaining 71.4% unique recipes.

All measured cases stay inside the hard daily energy window and all recipe components keep `servings=1`.

## Diagnostics

Planner Lab now exports/displays:

- recipe uniqueness rate;
- same-recipe pair count within 3 and 7 days;
- primary-ingredient repetition within 3 days;
- average daily protein/fiber in the quality payload.

This makes future quality tuning observable rather than subjective-only.

## Release gate

`v1:planner-phase-f` checks policy wiring and runs catalog-backed acceptance. The critical runtime floor is:

- 2600 kcal / 14 days / ±2% must remain feasible;
- unique recipe rate >=70%;
- same-recipe pairs within 3 days = 0;
- high-protein remains directionally effective with >=70% uniqueness;
- vegan prefer/avoid/frequency change occurrences in the expected direction;
- fixed serving and hard energy remain intact.

Phase F does not close manual Phase E acceptance and does not authorize `v1.0.0` promotion by itself.
