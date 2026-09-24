# Feature 4 implementation report — plan-wide ingredient substitution

## Scope

Implemented the requested action on an uncommitted generated plan: **replace ingredient X with Y across the proposal and recalculate quantities so the replaced calorie contribution remains approximately unchanged**.

## Architecture

The implementation does not modify base recipes and does not add per-component override fields to CalendarDay. Instead it creates immutable, plan-local `RecipeVersion` derivatives for only the affected recipes. Recipe family `currentVersionId` pointers stay unchanged.

This lets every existing consumer continue to operate on ordinary frozen recipe versions: nutrition, hard-constraint validation, safety, shopping, calendar rendering, meal replacement and backup/history logic do not need a parallel “effective recipe” representation.

Derived versions are kept only in the sealed generation preview until confirmation. On plan confirmation they are persisted atomically together with the GenerationRun, PlanInstance and CalendarDays. Undo of the plan creation removes the derived versions again.

## Candidate ranking

The plan-wide service reuses the Feature 5 ingredient-affinity primitives. For every candidate replacement it aggregates across all affected recipe versions and all their occurrences:

- iso-caloric quantity per ingredient line;
- protein/carbohydrate/fat/fiber deltas;
- culinary-role / ProductFood / food-group proximity;
- physical-state mismatch penalties;
- new allergen warnings;
- diet compatibility.

The UI reports the number of affected recipes/occurrences, total replacement quantity over the period and aggregate nutritional delta.

## Validation

Applying a replacement creates a new sealed generation preview. Before sealing, the complete modified plan is revalidated against:

- allergy/intolerance and safety hard constraints;
- MealClass hard rules;
- daily energy tolerance;
- rolling frequency rules;
- ingredient/revision integrity.

Feature 7 was extended to resolve uncommitted derived recipe versions, so a user can apply a global ingredient substitution and then still replace individual proposed meals by nutritional affinity.

## Persistence and compatibility

No IndexedDB schema migration is required. Existing `recipeVersions`, operation history and preview-guard mechanisms are reused.

Plan-local derived versions are marked with `generation.pipelineVersion = "plan-ingredient-substitution-1"`, have immutable content hashes, and preserve `supersedesVersionId` provenance.

## Tests

Added `tests/plan-ingredient-substitution.test.mjs` and included it in `planner:interaction-test`.

Coverage includes:

- source ingredient discovery in a generation preview;
- iso-caloric aggregate candidate preview;
- immutable derived RecipeVersion creation;
- unchanged base recipe family pointer;
- no persistence before final confirmation;
- stale old-preview rejection;
- persistence on confirmation;
- Feature 7 compatibility after the global substitution.

A real-catalog smoke check also generated a one-day plan from the 1,030-recipe catalog and successfully replaced Brussels sprouts with cauliflower across two affected recipe occurrences while keeping daily planned energy unchanged.
