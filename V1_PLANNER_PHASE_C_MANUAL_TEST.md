# V1 Planner Phase C — Manual Validation Protocol

**Status:** ready for user-led validation on `1.0.0-rc.29` / catalog `1.1.0-planner-phase-b`.

**Purpose:** judge planner power, constraint semantics, explainability and practical variety before any return to V1 release freeze.

This protocol is for software validation. The 800–2600 kcal range is intentionally broad to stress the solver and is not a nutrition recommendation.

## 1. Where to test

Open **Planner Lab** (`/planner-validation`).

The lab is observation-only:

- it clones the current configuration;
- it does not save profile changes;
- it does not confirm or replace the active plan;
- it does not write GenerationRun, PlanInstance or CalendarDay records;
- it ignores the active plan history so the same seed/configuration is reproducible;
- frequency and variety history still accumulate inside the horizon of the individual test.

Use the links at the top of the page to edit the real Nutrition, Safety, Preferences, MealClass and DayClass configuration when you want to test your own rules. Then return to the lab and use **Current configuration**.

## 2. What the diagnostics mean

For every planned slot the lab shows:

```text
source candidates -> hard accepted -> energy frontier -> slot options
```

Interpretation:

- **source candidates**: RecipeVersions retrieved for the requested archetype;
- **hard accepted**: candidates remaining after safety, autoExclude, forbid, quality and DayClass capability filters;
- **energy frontier**: hard-valid candidates retained for soft ranking while preserving energy diversity;
- **slot options**: complete recipe combinations offered to the daily beam search.

The hard rejection section must identify the actual rule that rejected candidates. The selected-meal section shows `softRank`, `frontierRank`, total score and score components.

A successful day must always show **HARD PASS** and its budgeted total must be inside `target ± tolerance`.

## 3. First pass — energy envelope

Run **Sweep 800–2600** with profile **Current configuration**.

Expected Phase B baseline:

- 10 targets: 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600 kcal;
- tolerances: ±2%, ±5%, ±10%;
- expected baseline result: **30/30** hard-feasible.

A single success outside its displayed hard interval is a P0 planner defect.

Then manually inspect at least these 7-day cases at ±2%:

| Target | What to inspect |
|---:|---|
| 800 | ability to build genuinely small complete meals; no serving scaling |
| 1200 | variety across days and slot balance |
| 1600 | transition from hypocaloric to mid-range choices |
| 2000 | reference mid-range quality |
| 2400 | use of higher-energy recipes without excessive repetition |
| 2600 | high-energy feasibility and variety |

For every case verify that every recipe component still has one fixed serving and that the plan is not composed of obvious near-identical variants.

## 4. Determinism

For at least 800, 1600, 2000 and 2600 kcal at ±2%:

1. choose a fixed seed;
2. run the case;
3. run **Determinism 2×**;
4. expect PASS and identical signatures;
5. change only the seed and verify that the planner can choose a different valid plan.

A different result for the same seed/configuration is a P0 reproducibility defect.

## 5. Hard constraints

Use the built-in profiles one at a time. A hard rule is allowed to make the case impossible; it is never allowed to be silently relaxed.

### 5.1 Safety — allergy

Use **Current configuration** plus a temporary allergen such as gluten, milk, egg, fish or tree nuts.

Verify:

- hard rejection counts include `safety:*` entries;
- no selected recipe contains the forbidden allergen;
- if the remaining catalog cannot satisfy the energy window, the case fails instead of using an unsafe recipe.

### 5.2 Safety — intolerance

Use **Hard: legumes intolerance**.

Verify:

- legume-category recipes are rejected through the same safety hard-filter family;
- no matching recipe is selected;
- the diagnostic remains explicit if the restriction makes a target infeasible.

### 5.3 Numeric forbid

Use **Hard: numeric forbid** (`fatG >= 25` on every MealClass).

Verify:

- rejection counts show the numeric MealClass rule;
- no selected recipe violates it;
- the energy hard window remains enforced simultaneously.

### 5.4 Categorical forbid

Use **Hard: categorical forbid** (`diet_vegan`).

Verify that vegan recipes are excluded rather than merely down-ranked.

### 5.5 autoExclude

Use **Hard: autoExclude** for `diet_vegan`.

Verify that this behaves as a true eligibility filter and not as a soft preference.

### 5.6 DayClass capabilities

Use **Hard: portable/no-cook day**.

Inspect source -> accepted counts and selected recipes. The selected set must respect:

- portability required;
- fridge not available;
- reheating not available;
- no cooking;
- prep <= 10 minutes;
- simple snack semantics.

A success containing an incompatible recipe is P0. A classified failure because the combination is impossible is acceptable.

## 6. Deliberately impossible cases

These are required negative controls.

### Everything forbidden

Profile: **Negative: everything forbidden**.

Expected:

```text
status = FAILED
failure = no_candidates_after_hard_constraints
```

The planner must never return the "closest" plan.

### Unknown external meal

Profile: **Negative: unknown external meal**.

Expected:

```text
status = FAILED
failure = external_energy_unknown
```

If external energy is unknown, whole-day hard energy cannot be certified.

## 7. Soft constraints

The key rule: a soft constraint may change scores/ranking/selection but must not reduce hard-accepted candidate counts by itself.

For comparisons use the **same target, tolerance, horizon and seed**.

### Protein priority

Compare **Current configuration** vs **Soft: protein priority**.

Inspect:

- hard accepted counts stay compatible;
- nutrition score component changes;
- selected recipes can move toward more protein;
- energy remains hard-valid even if the protein target is not reached exactly.

### Fiber priority

Repeat with **Soft: fiber priority**. The same semantics apply to fiber.

### FoodPreferences vegan preference

Compare with **Soft: vegan preference**.

Vegan recipes should receive a ranking reward but alternatives remain eligible.

### MealClass avoid

Use **Soft: MealClass avoid vegan**.

The number of hard-accepted recipes must not drop solely because of this rule. Vegan matches receive an `avoid` score penalty rather than a rejection.

### Frequency

Use **Soft: vegan frequency limit** over 7 or 14 days.

The preset requests max one vegan match in a rolling 3-day window as a soft objective. Inspect `variety`/frequency reasons on later days. Exceeding the limit is allowed when needed for hard feasibility.

### Variety

With a 7- or 14-day horizon inspect:

- exact RecipeVersion repetition;
- RecipeFamily repetition;
- primary ingredient repetition;
- category/cuisine repetition;
- whether a different seed produces materially different valid plans.

Variety is a ranking objective, not permission to violate hard constraints.

## 8. User-configured combinations

After the single-rule probes, configure combinations in the real editors and use **Current configuration** in the lab.

Recommended combinations:

1. 1200 kcal ±2% + milk allergy + portable/no-cook day;
2. 1600 kcal ±5% + vegetarian preference + high protein target;
3. 1800 kcal ±2% + ingredient/category intolerance + MealClass avoid;
4. 2200 kcal ±2% + frequency limit + strong variety pressure;
5. 2600 kcal ±2% + categorical forbid + practical constraints.

The objective is to find interaction defects: hard rules must remain absolute even when soft ranking strongly prefers an incompatible recipe.

## 9. Normal product-flow validation after lab probes

The Planner Lab intentionally cannot commit a plan. After the constraint semantics look correct, repeat selected cases through the normal product flow:

```text
Configure -> Generate -> Preview -> Confirm -> Today/Calendar -> Replace -> Rebalance -> Adherence -> Undo/Redo -> Shopping -> Checklist -> Reload
```

Verify specifically:

- confirmed day remains inside the hard energy interval;
- Replace only offers/commits hard-valid alternatives;
- Rebalance does not relax safety or energy;
- real plan history influences frequency/variety as expected;
- Undo/Redo restores the correct effective plan;
- Shopping derives from the final effective fixed-serving plan;
- reload preserves the confirmed plan and checklist.

## 10. Evidence to save for a defect

Use **Export diagnostics JSON** and record:

- target/tolerance;
- horizon;
- profile or real configuration changes;
- seed;
- expected behavior;
- observed behavior;
- plan signature;
- failing date/slot/recipe when applicable.

For a soft-quality complaint, also note what alternative you expected and why. This lets us distinguish a scoring-weight issue from a search-space or hard-filter issue.

## 11. Severity for Phase C

**P0 — blocks V1:** hard constraint violated, unsafe recipe selected, out-of-tolerance successful day, serving scaling, nondeterminism with same experiment, corrupted persistence.

**P1 — blocks Phase C acceptance:** severe lack of variety, obviously irrational ranking across common configurations, Replace/Rebalance breaking intended semantics, diagnostic contradicting actual selection.

**P2 — can be tuned after core validation:** preference weight feels weak/strong, minor repetition, wording/diagnostic presentation issue with correct solver behavior.

## 12. Acceptance record

Phase C is not complete when automated gates are green. It is complete only after the user records a manual verdict.

Suggested record:

```text
Manual Phase C verdict: PASS / FAIL
Date:
Build/commit:
Targets tested:
Hard constraints tested:
Soft constraints tested:
Negative controls tested:
Normal product flows tested:
P0 findings:
P1 findings:
P2 findings:
Overall planner/variety assessment:
```
