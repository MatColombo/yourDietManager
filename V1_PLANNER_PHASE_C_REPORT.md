# V1 Planner Phase C Implementation Report

**Implementation status:** READY FOR MANUAL VALIDATION  
**Manual acceptance:** PENDING  
**App:** `1.0.0-rc.29`  
**Catalog:** `1.1.0-planner-phase-b` / 1,800 fixed-serving recipes

## Objective

Phase C does not increase corpus size. It turns the application into an inspectable manual validation environment for the expanded Phase B planner space, so the user can judge hard/soft constraint correctness, solver behavior and practical variety directly.

## Runtime audit correction

The Phase B catalog contained 350 breakfast, 450 lunch, 450 dinner and 300 snack candidates, but `PlanCandidateService` still capped retrieval at 250 per archetype. This meant a material part of the expanded corpus was invisible to runtime search.

Phase C raises the planner retrieval ceiling to 500. The manual diagnostic confirms source counts including 450 lunch and 450 dinner candidates.

Allergy/allergen pre-filtering was also removed from candidate retrieval. Safety remains hard, but it is now applied in the canonical hard filter, so rejected candidates and the exact safety rule are visible in diagnostics.

## Manual Planner Lab

New route: `/planner-validation`.

The lab supports:

- target 800–2600 kcal;
- tolerance ±2%, ±5%, ±10%;
- horizon 1, 3, 7 or 14 days;
- explicit seed;
- temporary stress profiles;
- temporary hard allergen;
- one-case diagnostics;
- same-seed 2× determinism check;
- full 30-case energy sweep;
- JSON diagnostic export.

Experiments clone the current configuration and never commit a plan. They also ignore active-plan history so results are reproducible; frequency/variety history still accumulates inside the test horizon.

## Stress profiles

Hard/negative:

- portable/no-cook DayClass capabilities;
- numeric MealClass forbid;
- categorical MealClass forbid;
- FoodPreferences autoExclude;
- food-category intolerance;
- optional temporary allergen;
- everything forbidden negative control;
- external meal with unknown energy negative control.

Soft:

- protein priority;
- fiber priority;
- vegan FoodPreferences reward;
- vegan MealClass `avoid` penalty;
- vegan rolling frequency penalty.

These presets are temporary overlays. The user can also edit the real configuration and run the lab using **Current configuration**.

## Diagnostics added

Every slot now exposes:

- source candidate count and energy range;
- hard-accepted count and range;
- energy-frontier count and range;
- slot-option count and range;
- hard rejection counts by reason;
- top soft-ranked candidates with score components/reasons;
- selected recipe soft rank and frontier rank.

Generation diagnostics also expose retrieval limit, per-archetype counts and total unique retrieved recipes.

## Constraint isolation

The Phase C service cannot call `commitPlanPreview`; validation cases leave GenerationRun, PlanInstance and CalendarDay persistence unchanged. A regression test verifies this directly.

The lab is intentionally separate from normal product-flow history. After isolated constraint testing, the manual protocol requires selected scenarios to be repeated through the normal confirmed-plan flow to validate replacement, rebalance, history, shopping and reload behavior.

## Current automated validation

At implementation close:

- Phase C focused tests: 11/11;
- Phase C policy/instrumentation gate: 25/25;
- Phase B 800–2600 feasibility remains 30/30 after full-archetype retrieval;
- Phase B corpus gate remains 18/18.

Full repository/build/browser results are recorded after final regression in this implementation pass.

## Release status

This is not a V1 release candidate. Stable V1 promotion remains suspended.

The next decision is manual: the user must execute `V1_PLANNER_PHASE_C_MANUAL_TEST.md`, report defects/quality findings, and explicitly accept or reject planner behavior. Only an accepted Phase C can reopen V1 freeze/promotion work.

## Final regression results

Final verification after aligning replacement retrieval with the full Phase B search space:

- repository tests: **221/221 PASS**;
- Phase C focused tests: **11/11 PASS**;
- Phase C gate: **25/25 PASS**;
- Phase B gate: **18/18 PASS**;
- Phase B 800–2600 feasibility: **30/30 PASS**;
- planner smoke: PASS;
- lint: **172 JavaScript files**;
- accessibility source audit: **16/16 PASS**;
- form/contract audit: PASS;
- build: PASS;
- revision closure: **13/13 PASS**;
- GitHub Pages build/audit for `/yourDietManager/`: PASS.

Local Chromium remains skipped only because this execution environment blocks localhost navigation. GitHub Pages keeps `YDM_BROWSER_REQUIRED=1`, and the browser regression now includes a real Phase C Planner Lab run; therefore the deploy will fail if the lab cannot render and complete a default 7-day hard-valid diagnostic case in CI.

## Additional replacement audit correction

The full-archetype audit found the same historical 250-candidate cap in replacement preview. Phase C now makes replacement retrieve up to the shared `MAX_PLANNER_CANDIDATES_PER_ARCHETYPE=500` and removes its separate allergen prefilter. Replacement still performs the canonical hard filter plus the day-level hard energy check before presenting candidates.

This keeps generation and replacement aligned on candidate visibility and safety semantics.
