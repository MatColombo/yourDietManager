# V1 Planner Validation Plan

**Status:** authoritative pre-V1 plan. It supersedes the direct Step 3 → stable V1 promotion path.

**Current baseline:** `1.0.0-rc.29` / catalog `1.1.0-planner-phase-b`; Phase A and Phase B are implemented and Phase C instrumentation is ready. Stable promotion is suspended until Phase C is manually accepted.

## 1. Objective

Validate the planner as a general, explainable constraint solver rather than as a generator tuned to the current synthetic ~2000 kcal corpus.

The manual validation envelope is deliberately broad:

- daily energy targets from approximately **800 to 2600 kcal**;
- tolerance sweeps including **±2%, ±5% and ±10%**;
- hard safety, compatibility and feasibility constraints;
- soft preference, nutrient and variety objectives;
- external meals and carry-over;
- replacement and rebalance;
- large ingredient and recipe variety.

This is software/solver validation, not a statement that every target in the test envelope is nutritionally or medically appropriate for every person.

## 2. Non-negotiable invariant: RecipeVersion is never serving-scaled

A `RecipeVersion` is a complete standard portion. The planner MUST NOT resize it to chase calories or macros.

Every planned component remains:

```json
{"servings": 1}
```

Valid mechanisms for reaching a target are only:

1. choose a different RecipeVersion;
2. combine multiple complete RecipeVersions in a meal occurrence;
3. choose a different combination across the day;
4. fail with `NO_FEASIBLE_PLAN` when the bounded search cannot find a hard-valid combination.

Changing ingredient quantities or multiplying recipe nutrition by an automatic serving factor is prohibited.

The code may proportionally allocate **soft nutrient targets** to meal slots for scoring. That allocation changes only the objective function; it never changes recipe grams, servings or calculated nutrition.

## 3. Hard daily energy contract

`dailyEnergyKcal ± energyTolerancePct` is a **hard day-level constraint**.

Example:

```text
target = 1800 kcal
tolerance = 5%
valid total = 1710–1890 kcal
```

A successful generated/rebalanced CalendarDay cannot be outside that interval.

For budgeted external meals:

```text
budgeted daily total = known planned recipe energy + external energy budget
```

The hard interval applies to that total.

An external meal with `estimatedNutritionPolicy=unknown` prevents the engine from certifying whole-day energy. Generation must therefore return a classified failure rather than claiming a hard-valid day.

Replacement is subject to the same rule: candidates that would move the day outside the hard interval are not offered, and commit validates again defensively.

## 4. Constraint semantics — authoritative matrix

### 4.1 Hard solver constraints

| Configuration / rule | Scope | V1 semantics |
|---|---|---|
| `NutritionProfile.energyTolerancePct` | day | hard min/max window |
| enabled allergy/intolerance rules | recipe | exclude matching recipe |
| `FoodPreferences.autoExclude=true` | recipe | exclude matching recipe |
| MealClass categorical `forbid` | recipe | exclude matching recipe |
| MealClass numeric `forbid` | recipe | exclude when predicate evaluates true |
| MealClass archetype | recipe | recipe must support requested archetype |
| recipe quality status | recipe | only curated/validated candidates |
| DayClass `portabilityRequired` | recipe | hard capability |
| DayClass `fridge=no` | recipe | reject fridge-required recipes |
| DayClass `reheating=no` | recipe | reject reheating-required recipes |
| DayClass `cooking=false` | recipe | reject `cookMinutes > 0` |
| DayClass `maxPrepMinutes` | recipe | hard maximum |
| DayClass `complexSnack=false` | snack/mini-meal | no cooking and prep ≤10 min |
| fixed recipe serving | component | schema/generator/edit invariant `servings=1` |

Hard constraints are applied before/within search and are never relaxed by soft score.

### 4.2 Soft solver objectives

| Configuration / rule | Scope | V1 semantics |
|---|---|---|
| enabled protein/carbs/fat/fiber `min/target/max` | day/slot objective | penalty, not rejection |
| MealClass `prefer` / `slight_prefer` / `avoid` | recipe | reward/penalty |
| food preference level | recipe | reward/penalty |
| frequency `maxOccurrences` | history | penalty, not hard maximum |
| recipe/family/ingredient/category/cuisine repetition | history | variety penalty |
| MealClass energy-share min/target/max | slot | objective guidance |
| planned-slot `energyShare` / `energyBudgetKcal` | slot | objective target; whole-day energy remains the hard constraint |

The words `min`, `max` and `budget` in these soft fields do **not** make them hard constraints. If a future V1.x model needs hard macro/frequency/slot bounds, those must receive an explicit hard-strength field or separate constraint type.

### 4.3 Configurable fields that are not solver constraints

| Field | Meaning |
|---|---|
| external-slot `proteinMinG` | guidance for the external meal; not consumed protein and not a recipe-selection constraint |
| `guidanceKeys` | user guidance only |
| `workWindows` | day context metadata in V1; not currently a recipe filter |
| `parallel` | structural validation for overlapping slots |

`proteinMinG` is invalid on a `planned` slot so that the UI cannot present a no-op field as if it were enforced.

## 5. Search semantics

Hard feasibility must not be erased by soft ranking.

Phase A therefore requires the bounded search to preserve an **energy frontier**:

- candidate selection retains soft-best, target-adjacent and energy-diverse candidates;
- slot option selection retains soft-best, target-adjacent and energy-diverse complete-recipe combinations;
- beam expansion uses remaining-energy bounds to prune partial states that cannot possibly enter the daily hard interval;
- final selection accepts only hard-valid energy finalists;
- post-solve validation repeats the hard day check.

A failure is still a bounded-search result, not a proof over an infinite/unbounded space. The diagnostic must say so explicitly.

`NO_FEASIBLE_PLAN` therefore means:

> no hard-valid plan was found under the current catalog, configuration and bounded search space.

It must never mean “return the closest out-of-range plan anyway.”

## 6. Required diagnostics

For every successful day expose at least:

- effective target kcal;
- tolerance;
- allowed daily min/max;
- planned recipe energy;
- external budget;
- budgeted total;
- PASS status for hard energy;
- constraint-policy version.

For a failure expose at least:

- failure code and hard constraint id;
- target and allowed range;
- bounded-search reason/proof;
- nearest result/distance when available;
- candidate/option/beam limits;
- hard-filter rejection counts.

The day UI must show the budgeted total, target, hard interval and PASS/FAIL status. Generation failures must include the energy diagnostic rather than only a generic error.

## 7. Current corpus baseline — measured in Phase A

The current 500 recipes remain a **test fixture**, not the final variety corpus.

Current energy distribution is highly concentrated:

| Archetype | Count | Min kcal | Approx median | Max kcal |
|---|---:|---:|---:|---:|
| breakfast | 100 | 362 | 400 | 435 |
| lunch | 125 | 609 | 700 | 700 |
| dinner | 125 | 652 | 700 | 700 |
| snack | 75 | 200 | 200 | 241 |
| mini_meal | 75 | 200 | 200 | 232 |

One-day feasibility audit using the active standard DayClass:

| Tolerance | Targets where a hard-valid plan was found |
|---:|---|
| ±2% | 1800, 2000 |
| ±5% | 1800, 2000, 2600 |
| ±10% | 1800, 2000, 2200, 2600 |

Targets tested: 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 kcal.

This non-monotonic matrix is useful evidence: Phase B must fill **energy-combination gaps**, not merely extend min/max calories. In particular, the current corpus is unsuitable for meaningful hypocaloric testing below ~1600 kcal.

The machine-readable baseline is generated by `scripts/planner/audit-v1-feasibility.mjs`.

## 8. Phase A — Engine correctness and constraint audit

### Scope

- hard daily energy tolerance;
- fixed-serving invariant;
- audit all configurable hard/soft/no-op semantics;
- correct numeric `forbid` logic;
- enforce missing DayClass capabilities;
- remove misleading planned-slot protein minimum;
- ensure replacement/rebalance preserve hard validity;
- prevent soft ranking from discarding the energy frontier;
- classify bounded-search failure honestly;
- expose energy diagnostics;
- measure current 800–2600 feasibility baseline.

### Exit criteria

1. no successful day can be outside energy tolerance;
2. no automatic RecipeVersion/serving scaling path exists;
3. hard filters are semantically correct and regression-tested;
4. soft rules affect ranking but do not reject candidates;
5. no configurable UI field silently pretends to be an enforced constraint;
6. replacement/rebalance cannot create a hard-invalid day;
7. search preserves energy diversity before soft optimization;
8. `NO_FEASIBLE_PLAN` is classified as bounded-search failure;
9. 800 and 2600 synthetic feasible cases work with `servings=1`;
10. existing planner, persistence and shopping regressions stay green.

## 9. Phase B — Corpus expansion for solver power

**Status: IMPLEMENTED in `1.0.0-rc.28`.**

Phase B deliberately expands the *functional* ingredient space used by recipes without fabricating ingredient records. The vetted public ingredient base remains 600 IngredientFamily / 600 IngredientRevision records; recipe generation now uses **302 distinct ingredients** from **311 explicitly eligible** culinary-role ingredients, compared with 141 used by the previous 500-recipe generator.

The recipe corpus is expanded to **1,800 fixed-portion RecipeVersion records**. No Phase B recipe is created by multiplying an existing serving or fitting ingredient grams to a calorie target. Quantities come from discrete culinary templates; generated candidates are accepted into a target energy band only after their fixed nutrition is calculated.

### Phase B matrix

| Meal class | Recipes | Energy envelope |
|---|---:|---:|
| breakfast | 350 | 83–698 kcal |
| lunch | 450 | 181–943 kcal |
| dinner | 450 | 187–936 kcal |
| snack | 300 | 61–394 kcal |
| mini_meal | 250 | 87–499 kcal |

The detailed 31-band quota matrix is machine-readable in `corpus/production/planner-phase-b/build-evidence.json`.

Functional variety floors achieved:

- 1,251 vegetarian recipes;
- 396 vegan recipes;
- 215 pescatarian recipes;
- 1,180 quick recipes;
- 647 no-cook / cold-suitable recipes;
- 302 distinct ingredient families actually referenced by recipes.

Structural publication quality is zero-blocker for schema errors, unknown ingredient references, nutrition errors, allergen derivation errors, required-locale omissions, exact duplicates and near-duplicates. The publication channel remains `development` and `releaseEligible=false`: this corpus exists to test planner power, not to assert final culinary release quality.

### 800–2600 solver coverage after Phase B

The same Phase A audit now finds a hard-valid plan for **all 30 combinations** of:

- targets: 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 kcal;
- tolerance: ±2%, ±5%, ±10%.

A 7-day narrow-tolerance smoke was also measured successfully at 800, 1400, 2000 and 2600 kcal with fixed servings. This is a coverage result, not a nutritional recommendation.

### Ingredient-count decision

The original planning target of 1,000–1,500 IngredientFamily records is **not treated as a numeric gate** for this validation cycle. The repository snapshot available for Phase B contains 600 vetted USDA-backed families but not the raw acquisition cache required to safely materialize hundreds of additional source records. Phase B therefore prioritizes using the existing vetted ingredient base much more deeply rather than creating synthetic duplicates or unverified foods. A future data-ingestion pass may enlarge the family count from authoritative source files; it is not required to begin Phase C engine validation.

### Phase B exit criteria

1. at least 1,500 fixed-portion recipes with deliberate energy-band coverage;
2. at least 300 distinct vetted ingredients actually used by recipes;
3. zero serving-scaling / energy-fitting generation path;
4. all 800–2600 targets feasible at ±2%, ±5% and ±10% in the standard validation DayClass;
5. enough diet/practical/allergen variation to exercise hard and soft constraints;
6. structural corpus quality gates green;
7. 7-day planner generation remains practical on the expanded corpus.

All seven criteria are met by the Phase B baseline.

## 10. Phase C — user-led manual planner validation

**Implementation status: READY FOR MANUAL VALIDATION in `1.0.0-rc.29`. Manual acceptance remains pending.**

Phase C adds `/planner-validation`, an observation-only planner laboratory. Tests use a cloned configuration, do not commit plans, and ignore the active plan history so same seed + same configuration is reproducible. Frequency and variety history still accumulate within the test horizon.

A runtime audit also removed a hidden Phase B bottleneck: candidate retrieval is now capped at 500 rather than 250, so all current 350 breakfast / 450 lunch / 450 dinner / 300 snack candidates can enter the planner. The same 500-candidate bound is used by replacement preview. Safety matches are no longer removed during generation/replacement retrieval; the canonical hard filter rejects them and records the exact reason.

Manual targets at minimum:

800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 kcal.

Built-in probes cover:

- hard allergy and intolerance safety paths;
- hard categorical/numeric `forbid`;
- hard autoExclude;
- DayClass capabilities;
- deliberately impossible configurations;
- soft MealClass prefer/avoid semantics;
- soft protein and fiber targets;
- soft FoodPreferences and frequency;
- variety over multi-day horizons;
- external meal with unknown energy negative control;
- same-seed determinism;
- 30-case 800–2600 energy sweep.

Each slot exposes the pipeline `source -> hard accepted -> energy frontier -> slot options`, energy ranges, hard rejection reasons, top soft candidates and selected ranking/score components. Diagnostics can be exported as JSON.

After isolated probes, selected configurations must still be tested in the normal product flow for external meals/carry-over, confirmation, replacement/rebalance, real history, undo/redo, shopping/checklist and reload persistence.

The authoritative operator procedure and acceptance record are in `V1_PLANNER_PHASE_C_MANUAL_TEST.md`. The user, not an automated quality score, decides whether variety and planner behavior are sufficient for V1.

### Phase C exit criteria

1. no hard constraint is observed being relaxed;
2. successful days always remain inside the hard energy interval;
3. soft rules visibly affect score/ranking without becoming eligibility filters;
4. same experiment is deterministic;
5. deliberately impossible cases fail with the expected classified reason;
6. diagnostics explain candidate reduction and selected ranking sufficiently to investigate a defect;
7. 800–2600 coverage remains usable with the full 1,800-recipe runtime search space;
8. normal confirmed-plan replace/rebalance/history/shopping flows remain coherent under the tested constraints;
9. the user judges practical variety and plan quality acceptable.

Exit criteria 1–7 are instrumented/automated where possible. Criteria 8–9 require the user-led manual pass.

## 11. Release policy

The previous Step 3 release freeze is suspended while this program is open.

Do not tag `v1.0.0` and do not record final manual acceptance until A, B and C are closed. Catalog/model changes required for Phase B are explicitly allowed before stable V1. Compatibility guarantees start only at accepted/tagged stable V1.
