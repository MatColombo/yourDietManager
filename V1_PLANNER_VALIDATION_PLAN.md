# V1 Planner Validation Plan

**Status:** authoritative pre-V1 plan. It supersedes the direct Step 3 → stable V1 promotion path.

**Current baseline:** `1.0.0-rc.34` / catalog `1.2.0-planner-phase-d`; Phases A–G are preserved and Phase H final release handoff is implemented. Development-tranche work is complete. Stable promotion remains suspended until an eligible Phase E report is paired with an explicit final `ACCEPT V1` decision.

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

**Implementation status: READY FOR MANUAL VALIDATION; current integrated baseline `1.0.0-rc.31`. Manual acceptance remains pending.**

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


## 11. Phase D1 + D2 — regeneration semantics and product food taxonomy

**Implementation status: COMPLETE in `1.0.0-rc.30` / catalog `1.2.0-planner-phase-d`.**

### D1 — Recalculate vs Propose alternative

The UI and engine expose two distinct operations:

- **Recalculate**: reruns the planner with current constraints. The same recipe is allowed when it remains the best bounded-search result.
- **Propose alternative**: first runs a strict search that excludes the currently assigned RecipeVersion for every planned meal occurrence in the selected date range. If the strict bounded search fails, a second search permits the current recipe only with a very large soft penalty.

The preview reports `changedSlots`, `unchangedSlots`, strict-attempt status and, when fallback retention occurs, an explicit bounded-search reason. It never claims that an unchanged meal is mathematically unavoidable; it states only that the strict alternative was not found in the current bounded search. Hard constraints, including daily energy tolerance, remain unchanged in both modes.

### D2 — Product food taxonomy

A new reference taxonomy `product_food` is separate from source nutritional classification, culinary role and allergen taxonomy. Its hierarchy is:

```text
FoodCategory -> FoodSubcategory -> IngredientConcept -> IngredientRevision
```

The current catalog contains 18 root product categories and 203 taxonomy terms. All 600 IngredientRevision records are classified. Sentinel coverage includes:

- `Dairy / Latticini`: 19 ingredient revisions;
- `Noodles`: 11 technical ingredient variants grouped under one `product_concept_noodles`;
- plant dairy alternatives remain outside Dairy;
- known false-positive dairy-like products are excluded from the Dairy category.

`productFood` can already be used as a target for FoodPreferences, allergy/intolerance rules and MealClass categorical rules. Category/subcategory/concept matching is derived from the explicit `productTaxonomy` path on each ingredient revision, not from USDA `foodGroup` and not from allergen IDs.

Labels may legitimately repeat at different hierarchy levels (for example a Beef subcategory and Beef concept). Such ambiguous text is not auto-resolved; explicit term IDs remain authoritative.

Phase D2 is a pre-V1 semantic enrichment of the ingredient catalog. It therefore uses DB v6, epoch `v1-planner-phase-d-epoch-1`, and a destructive pre-V1 reset so stale Phase B IngredientRevision records cannot survive without `productTaxonomy`. RecipeVersion identity/content is unchanged and the Phase B recipe digest remains `5e3bd7661171cff9434b03bb9951d58779ed84dc2e0e9910d36d1ebc517f53f2`. Serving scaling remains forbidden.

### Deferred to D3–D5

D1+D2 intentionally do not complete the discovery UX. The next work remains:

1. hierarchical taxonomy picker shared by Prefer/Avoid/AutoExclude/Forbid and catalog filters;
2. faceted recipe/ingredient catalog search by category/taxonomy and nutritional/practical facets;
3. direct Day -> Recipe -> Ingredient navigation with contextual back navigation/detail drawer.

### D1+D2 exit criteria

1. strict alternative changes every selected planned slot when a strict hard-valid alternative is found;
2. fallback retention is explicit and bounded-search honest;
3. all 600 ingredients have category/subcategory/concept assignments;
4. Dairy exists as an explicit product category and does not derive from the milk allergen;
5. technical noodle variants collapse to a common user-level concept;
6. `productFood` works in hard and soft planner rules;
7. 1,800 RecipeVersion records and their fixed serving quantities are unchanged;
8. Phase A/B/C and the 800–2600 feasibility envelope remain green.

All eight criteria are met by the Phase D baseline.

## 12. Phase D3–D5 — taxonomy picker, faceted discovery and contextual drill-down

**Implementation status: COMPLETE in `1.0.0-rc.31`; catalog remains `1.2.0-planner-phase-d`.**

D3 provides one shared hierarchical `product_food` picker across preference/safety/MealClass rules and ingredient authoring. A concept such as `Noodles` is selected once even when 11 technical IngredientRevision variants exist; the picker shows path and current coverage. New preference rules default to `productFood`.

D4 makes taxonomy operational in discovery. Ingredient search combines text/origin/product category or concept/state. Recipe search combines product taxonomy with diet, practical, meal, energy, protein, fiber, prep and allergen facets. Sentinel results on the current catalog are 19 Dairy ingredients, 327 Noodles recipes, 637 Dairy recipes and 196 Vegan + No-cook recipes.

D5 adds direct Day -> Recipe -> Ingredient navigation. Plan recipe links freeze the exact RecipeVersion and carry a sanitized return route to `CalendarDay#meal-<mealOccurrenceId>`; ingredient links freeze the exact IngredientRevision and carry the recipe route. Returning to the day scrolls/highlights the originating slot.

No catalog data, RecipeVersion, DB schema or pre-V1 epoch changes are introduced in D3–D5. Only the application advances to rc.31 and shell cache v34; data cache remains v17.

### D3–D5 exit criteria

1. Noodles is selectable as one conceptual preference with coverage of the 11 technical variants;
2. Dairy/Latticini is discoverable as a product category and filters the 19 classified ingredients;
3. recipe taxonomy/diet/practical facets operate on the actual recipe ingredient graph and are combinable;
4. ingredient authoring requires an explicit product concept;
5. Day -> Recipe and Recipe -> Ingredient are direct links to exact immutable versions;
6. contextual Back returns to the exact meal slot;
7. no data reset or corpus regeneration occurs;
8. Phase A/B/C/D1-D2 and the 800–2600 hard-energy envelope remain green.

All eight implementation criteria are met. User acceptance of usability remains part of the ongoing manual validation.

## 13. Release policy

The previous Step 3 release freeze is suspended while this program is open.

Do not tag `v1.0.0` and do not record final manual acceptance until the planner validation program, including Phase D product-control work, is closed by the user. Pre-V1 catalog/model changes remain explicitly allowed. Compatibility guarantees start only at accepted/tagged stable V1.

## Phase E — Manual Product Acceptance

Implementation status: **harness complete; provisionally valid for continued development; final stable-release acceptance record still pending**.

The canonical manual journal is `/manual-acceptance`. It contains 18 required scenarios spanning energy 800–2600 kcal, hard and soft constraints, regeneration, product taxonomy/discovery, contextual navigation, Replace/Rebalance, shopping and reload persistence.

Release rule: all required cases must be PASS and P0/P1 findings must be zero. P2 findings require an explicit release decision. Eligibility in the harness does not change release metadata or promote `1.0.0`; final freeze/promotion remains a separate explicit step after human acceptance.


## Phase F — Planner Quality Tuning

Implementation status: **COMPLETE and preserved in `1.0.0-rc.34`; final stable-release acceptance still pending.**

Phase F corrects the soft-objective composition used by the slot-option beam. Option-level nutrition is recomputed at full strength, while per-recipe nutrition contributes only a 0.15 tie-break. Preference, variety and regeneration penalties retain full soft weight. No hard constraint changes.

The variety policy remains soft and uses 3/7/14-day windows, with a dominant penalty for exact recipe reuse in short windows. The catalog remains 1,800 fixed-serving RecipeVersions; DB v6, `v1-planner-phase-d-epoch-1` and data cache v17 are unchanged. App advances to rc.33 and shell cache v36.

Measured 14-day ±2% uniqueness after tuning is 64.3% at 800 kcal, 71.4% at 1000, 82.1% at 1400, 78.6% at 2000 and 73.2% at 2600. Exact recipe repeat pairs within 3 days are zero in all five measurements. At 2000 kcal/7 days, prefer-vegan increases vegan occurrences while avoid/frequency reduce them, and high-protein raises planned protein without collapsing variety below 70%.

Phase F exit criteria:

1. hard daily energy and fixed serving remain invariant;
2. 2600 kcal / 14 days / ±2% remains feasible with >=70% unique recipes;
3. exact recipe repeat pairs within 3 days are zero in the Phase F acceptance run;
4. high-protein moves protein upward while preserving >=70% uniqueness;
5. prefer/avoid/frequency soft rules move selections in the expected direction;
6. Planner Lab exposes quality metrics for manual inspection;
7. catalog, DB and pre-V1 epoch do not change;
8. Phase E manual acceptance remains the release authority.

All implementation criteria are met by the Phase F baseline and are frozen by Phase G. Stable promotion still requires the user's explicit final release acceptance.


## Phase G — Release Candidate Consolidation

Implementation status: **COMPLETE in `1.0.0-rc.34`.**

Phase G reconciles the final release infrastructure with the actual planner-validation baseline. The previous rc.27 freeze/release gate described a superseded 500-recipe / DB v5 candidate; Phase G freezes the current 600-ingredient / 1,800-recipe / DB v6 baseline without changing recipe content, planner hard constraints, product-food taxonomy, pre-V1 epoch or data cache.

The machine-readable freeze is `corpus/production/v1-planner-release/freeze-contract.json`. It records recipe, reference-data, catalog-content and Phase F quality-evidence digests. `v1:planner-phase-g-freeze` regenerates that evidence deterministically and the GitHub release-candidate workflow drift-checks it.

The PWA shell advances to v37; data cache remains v17. The catalog publication remains `development / releaseEligible=false` while the app is a release candidate.

Final stable release is deliberately fail-closed. `corpus/production/v1-planner-release/manual-acceptance.json` remains pending until the user explicitly records `ACCEPT V1`. The stable `release:gate` now targets the Phase G contract and additionally requires app `1.0.0` plus a `production_release / releaseEligible=true` manifest over the same frozen content.

Phase G exit criteria:

1. deterministic freeze binds rc.34 to the 600/1800 current catalog;
2. recipe digest and Phase F planner-policy digest are unchanged;
3. DB v6, content schema v3, backup v1 and pre-V1 epoch are unchanged;
4. `v1:planner-phase-g` is green;
5. full `npm run check` remains green;
6. stable `release:gate` is blocked only by intentional pre-stable conditions, not stale rc.27/500/DB v5 assumptions;
7. no stable tag is authorized without explicit final manual acceptance.


## Phase H — Final Release Handoff

Implementation status: **COMPLETE on the frozen `1.0.0-rc.34` candidate.**

Phase H closes the development tranche without changing the Phase G frozen product/data contract. The machine-readable handoff is `corpus/production/v1-planner-release/phase-h-handoff.json`; it chains to the Phase G freeze digest, records the three intentional pre-stable blockers, and defines the only legal metadata/evidence mutations for stable promotion.

Stable promotion is now executable but fail-closed through `npm run v1:promote-stable`. It requires an exported Phase E acceptance report with all required cases PASS and zero P0/P1, the exact decision token `ACCEPT V1`, and an explicit `--apply`. Without `--apply` it performs a read-only projection. The projected stable state is checked against the same ten-condition release gate before any write is allowed.

Phase H also makes the historical phase gates transition-safe: the same frozen implementation can be verified as rc.34 before promotion and as `1.0.0` after metadata-only promotion. This does not relax catalog, persistence, hard-constraint, taxonomy or Phase F quality invariants.

Phase H exit criteria:

1. Phase G recipe/reference/catalog/policy digests remain unchanged;
2. the current candidate release gate is blocked only by stable app version, final acceptance and production publication;
3. final acceptance cannot be fabricated by a build/test script;
4. promotion requires an eligible manual report plus exact `ACCEPT V1`;
5. dry-run modifies no repository file;
6. a synthetic accepted projection passes all stable release checks while preserving the frozen catalog-content digest;
7. only package/runtime version, catalog publication metadata, final acceptance evidence and stable-release evidence may change during promotion;
8. `npm run check` remains valid both before and after the metadata-only stable transition;
9. GitHub Actions `Verify V1 Planner Phase H` rebuilds and drift-checks Phase G + H release evidence;
10. stable tag/release remains forbidden until real acceptance exists and post-promotion `npm run check` plus `npm run release:gate` are both green.
