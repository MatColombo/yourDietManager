# V1 Planner Validation — Phase A Implementation Report

**Status:** COMPLETE — engine/constraint audit implemented and regression-verified

## Purpose

Phase A turns the planner from a best-score generator into a solver with an explicit hard/soft contract suitable for manual stress testing from approximately 800 to 2600 kcal.

## Corrected defects

The audit found and corrected these engine/model defects:

1. daily calorie tolerance was a score preference rather than a hard constraint;
2. numeric MealClass `forbid` logic was inverted;
3. `DayClass.capabilities.cooking=false` was configurable but unenforced;
4. `complexSnack=false` had no executable meaning;
5. replacement could commit a recipe that moved a day outside its calorie window;
6. soft ranking/top-N selection could erase high/low-energy candidates before hard-feasibility search;
7. `proteinMinG` was editable on planned slots despite having no planned-slot enforcement.

## Engine changes

- Hard daily energy window applied to budgeted daily total.
- Unknown-energy external meal returns classified failure.
- Energy-diverse candidate frontier added before soft optimization.
- Energy-diverse slot-option frontier added for complete fixed-serving recipe combinations.
- Beam search prunes states using valid remaining-energy bounds.
- Only hard-valid finalists can become a successful CalendarDay.
- Post-solve energy validation is repeated defensively.
- Failure diagnostics identify bounded-search proof/status rather than claiming mathematical impossibility.
- Replacement preview and commit enforce the same hard daily energy contract.
- Rebalance inherits the corrected generator contract.

## Serving invariant

No RecipeVersion is resized. Generated and edited recipe components remain `servings=1`.

Internal proportional allocation of soft nutrient targets was renamed to `nutrientTargetFactor` to make clear that it is objective weighting, not recipe/serving scaling.

## Hard / soft policy

Machine-readable policy: `src/planner/constraintPolicy.js`.

Hard:

- daily energy tolerance;
- allergies/intolerances;
- food autoExclude;
- MealClass forbid;
- DayClass capabilities;
- meal archetype;
- recipe quality;
- fixed serving.

Soft:

- macro/fiber targets and bounds;
- MealClass prefer/slight_prefer/avoid;
- food preference levels;
- frequency limits;
- variety/repetition;
- slot energy allocation targets.

External `proteinMinG` is guidance, not a solver constraint, and is now invalid on planned slots.

## Manual-visible diagnostics

The day page now shows:

- budgeted total kcal;
- target kcal;
- hard allowed interval;
- hard energy PASS/FAIL.

A `NO_FEASIBLE_PLAN` generation error includes target/range and nearest bounded-search information when available.

## 800–2600 baseline on the current 500-recipe corpus

The Phase A audit tests 10 targets × 3 tolerances = 30 cases without modifying recipe portions.

Current standard-day results:

- ±2%: 1800, 2000 feasible;
- ±5%: 1800, 2000, 2600 feasible;
- ±10%: 1800, 2000, 2200, 2600 feasible.

The remaining cases are correctly classified as no hard-valid plan found in the current bounded search. This is a corpus-density signal for Phase B, not a reason to relax the hard calorie constraint.

The current recipes are tightly clustered around ~400 kcal breakfast, ~700 lunch/dinner and ~200 snack/mini-meal. They are therefore unsuitable for the requested low-energy manual test envelope.

## Phase A automated gates

- `npm run v1:engine-phase-a`
  - focused engine tests;
  - source/spec policy gate;
  - 800–2600 feasibility baseline audit.
- Full repository tests remain mandatory before delivery.
- GitHub browser acceptance remains mandatory for deployed builds.

## Handoff to Phase B

Phase B must add real ingredient/recipe variety and energy-combination density. It must not manufacture coverage by multiplying ingredient quantities or servings of existing recipes.

## Final verification

- Phase A focused tests: **12/12 PASS**.
- Phase A policy gate: **16/16 PASS**.
- Feasibility audit: **30/30 cases classified without invalid success**.
- Full repository tests: **204/204 PASS**.
- Historical Step 1 gate: **14/14 PASS**.
- Historical Step 2 gate: **12/12 PASS**.
- Historical Step 3 gate: **22/22 PASS**.
- Planner smoke: PASS after correcting the legacy fixture so it is genuinely inside the new hard energy window.
- Lint: **161 JavaScript files PASS**.
- Accessibility source audit: **16/16 PASS**.
- Form/contract audit: PASS.
- Build: PASS.
- Revision closure: **13/13 PASS**.
- GitHub Pages artifact audit: PASS.
- Local Chromium gate: SKIPPED only because this execution environment blocks local HTTP navigation; GitHub Pages continues to require the browser gate with `YDM_BROWSER_REQUIRED=1`.

## Phase A conclusion

The engine is now suitable to proceed to corpus-expansion Phase B. Phase A does **not** claim that the current 500-recipe corpus can support the requested 800–2600 kcal manual test envelope; the measured feasibility matrix demonstrates that it cannot.
