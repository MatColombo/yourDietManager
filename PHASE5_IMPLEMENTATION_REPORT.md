# Phase 5 Implementation Report — Plan Generator

## Scope

Phase 5 implements the V1 plan-generation domain engine on top of the Phase 1–4 repository. It intentionally does **not** implement the end-user Today/Calendar/manage-day UX; that is Phase 6. Phase 4 production corpus materialization is still pending, so Phase 5 is validated with deterministic planning fixtures and scale fixtures rather than misrepresenting the 8-recipe development corpus as production-ready content.

## Completed behavior

### Hard filtering

- Allergy/intolerance rules are applied before scoring and cannot be relaxed.
- Ingredient, food-category and allergen safety targets resolve from structured recipe/ingredient data rather than titles.
- `FoodPreferences.autoExclude=true` is treated as an automatic-selection exclusion.
- `MealClass` categorical/numeric `forbid` rules are hard constraints.
- DayClass portability, fridge, reheating and maximum-prep capabilities participate in hard filtering where the recipe contract provides an enforceable signal.
- Only current, active, installed and `validated|curated` RecipeVersions enter automatic planning.

### Soft scoring

- Daily/slot energy and enabled nutrient targets contribute weighted penalties.
- MealClass `prefer`, `slight_prefer` and `avoid` rules affect ranking without becoming exclusions.
- Global food preferences (`more_often`, `normal`, `less_often`, `rarely`) affect ranking.
- Frequency preferences add increasing penalties after the configured occurrence target.
- Variety penalties cover recipe family, exact recipe family ID, primary ingredient, food category and cuisine across 3/7/14-day windows.
- Intra-day repetition penalties prevent beam search from defeating the cross-day variety objective.

### Bounded beam solver

- Candidate retrieval is bounded to at most 250 RecipeVersions per meal archetype before fine filtering/ranking.
- The default fine-ranking set is top 20 candidates per slot.
- Slot composition supports 1–3 whole RecipeVersions, always at `servings=1`.
- Day composition uses bounded beam search (default width 100) rather than greedy slot-by-slot selection.
- Tie-breaking uses a seeded deterministic PRNG; planner code contains no direct `Math.random()` calls.
- Energy/nutrient deviations remain soft; safety and explicit hard constraints are never relaxed to obtain a solution.

### External slots and carry-over

- `external` slots receive no RecipeVersion assignment.
- External energy budget is reserved from the day target.
- `proteinMinG` remains an operational external target and is not counted as consumed nutrition.
- `dayOffset` materializes a separate civil consumption date without changing the diet-day accounting date.
- Invalid external budget combinations return `external_budget_inconsistency` diagnostics.

### Persistence and reproducibility

- Preview generation remains in memory.
- Confirmed generation atomically writes `generationRuns`, `planInstances` and `calendarDays` and updates active-plan metadata.
- `GenerationRun` freezes generator/solver versions, seed, catalog version, configuration snapshot/hash, horizon and compact selected-candidate diagnostics.
- `CalendarDay.nutritionSummary` now persists known planned nutrition, external budget, target energy and day score. This is a backward-compatible optional addition to schemaVersion 1.
- Historical RecipeVersion IDs are loaded from prior CalendarDays even after family `currentVersionId` advances, preserving correct variety/frequency behavior and historical explainability.

### Rolling horizon

- Initial plans begin at cycle day 1.
- Horizon extensions create a new GenerationRun and PlanInstance linked to the previous segment.
- The next segment starts on the next civil date and continues at the next cycle day instead of resetting the cycle.
- `prompt`, `auto_extend` and `fixed` continuation states are exposed through a domain helper for Phase 6.

## Failure diagnostics

The engine returns a classified failed preview rather than a partially unsafe plan. Implemented failure classes include:

- `no_candidates_after_hard_constraints`;
- `energy_range_impossible`;
- `meal_class_over_constrained`;
- `insufficient_catalog_coverage`;
- `external_budget_inconsistency`.

Per-day diagnostics also retain hard-filter rejection counts and compact score components for selected meals.

## Contract correction discovered during implementation

`PLAN_GENERATOR_SPEC.md` requires a daily nutrition summary on materialized days, while the original strict `CalendarDay` schema had no place to store it. Phase 5 adds optional `CalendarDay.nutritionSummary` to the schema and documents that selected-meal explainability remains centralized in `GenerationRun.diagnostics`.

The service-worker data cache was bumped because retaining the previous cache namespace would have left upgraded clients with the old strict CalendarDay schema and caused valid Phase 5 records to be rejected offline.

## Validation performed

Final automated gate:

- Phase 4 corpus smoke release still passes;
- Phase 5 two-day smoke plan passes schema validation and safety assertions;
- 54/54 automated tests pass;
- syntax check passes across 67 JavaScript files;
- static production build succeeds;
- planner contains no direct `Math.random()` usage;
- 10,000-recipe candidate fixture returns a bounded 250-record retrieval set;
- 365-day generation fixture completes and repeats the cycle correctly across month boundaries;
- immutable historical RecipeVersion resolution is verified after family current-version advancement;
- HTTP smoke verifies the built shell, planner module and updated CalendarDay schema.

## Known limitations / phase boundary

1. **Phase 4 production corpus remains incomplete.** The planner engine is implemented and scale-tested, but production acceptance must be repeated after the curated 3,000–5,000 recipe release exists.
2. No Phase 6 user-facing generation/preview/calendar workflow is implemented yet.
3. `DayClass.capabilities.cooking` and `complexSnack` cannot be fully enforced without a more explicit recipe-side “requires cooking at consumption” / snack-complexity contract. Phase 5 avoids inventing heuristics from ingredient count or cook time.
4. The solver is main-thread compatible today. Its boundaries are pure-domain/service-oriented so it can move to a Web Worker if real-device profiling with the production corpus shows long tasks.

## Next coherent increment

Phase 6 — Effective plan UX:

- Oggi;
- Calendario;
- plan generation preview/confirm flow;
- manage day;
- replace/rebalance;
- operation history/undo.
