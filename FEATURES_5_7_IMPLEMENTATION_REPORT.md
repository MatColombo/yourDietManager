# Features 5 + 7 implementation report

## Scope

This increment implements:

- **#5 ingredient substitution in recipe detail by nutritional affinity**;
- **#7 meal replacement in an uncommitted generated-plan preview by nutritional compatibility**.

It also upgrades the existing confirmed-plan meal replacement ranking to use the same nutritional-affinity information.

## Shared affinity engine

A new `src/services/nutritionalAffinityService.js` provides the common calculation layer.

Ingredient affinity combines:

- iso-caloric replacement quantity;
- protein/carbohydrate/fat/fiber distance after energy normalization;
- culinary-role overlap;
- ProductFood/category proximity;
- ingredient-state compatibility;
- flavor-profile compatibility;
- amount-ratio plausibility;
- newly introduced allergen warnings;
- recipe diet-tag compatibility.

Meal affinity compares the complete nutrition vector of the current meal against each alternative using normalized weighted distance across energy, protein, carbohydrates, fat and fiber.

## Feature 5 — ingredient substitution

Recipe detail now exposes `Sostituisci / Replace` on every ingredient of the current recipe version.

The replacement dialog:

- searches current active ingredient revisions;
- excludes the source ingredient;
- proposes an amount that keeps the source line's energy approximately unchanged;
- ranks candidates by nutritional + semantic affinity;
- shows the delta on the **complete recipe** for kcal, protein, carbohydrates, fat and fiber;
- warns when the ingredient state changes;
- warns about newly introduced allergens.

Applying a candidate does not mutate an existing RecipeVersion. It uses the existing catalog versioning contract and creates a new user-owned RecipeVersion, promoting a base family to local management when necessary.

Historical versions remain unchanged.

## Feature 7 — meal replacement in generation preview

Each planned meal in the initial generation preview now has a `Sostituisci / Replace` action.

Candidate recipes:

1. come from the same meal archetype;
2. are checked through the existing hard-filter path;
3. are revalidated against the complete preview for safety, MealClass rules, daily energy tolerance and frequency policy;
4. are then ranked by nutritional affinity to the current meal.

The UI shows:

- candidate recipe nutrition;
- nutritional-affinity percentage;
- kcal/protein/carbohydrate/fat/fiber delta;
- frequency summary.

When the user selects an alternative, the original sealed generation preview is invalidated and replaced with a **new sealed generation preview**. The final `Conferma piano / Confirm plan` operation therefore retains stale-preview and catalog/configuration consistency guarantees.

The preview guard now explicitly treats `recipeLabels` and `recipeNutrition` as UI hydration data, not as part of the sealed generation payload. This also closes a latent conflict introduced when per-meal kcal hydration was added in feature #3.

## Confirmed-plan replacement

The pre-existing confirmed-plan replacement flow still performs its full hard validation and operation-history commit. Its ordering now prefers nutritionally closer admissible alternatives and displays nutritional affinity plus nutrient deltas.

## Persistence and schemas

No IndexedDB schema migration was required.

Feature #5 persists only through the existing immutable RecipeVersion model. Feature #7 modifies only an uncommitted preview until the user confirms the plan.

## Tests

New tests cover:

- iso-caloric amount calculation;
- semantic/nutritional ingredient ranking;
- recipe-level nutrient delta;
- immutable new recipe version on ingredient replacement;
- generated-plan meal affinity ranking;
- replacement of a meal inside an uncommitted preview;
- invalidation of the old preview;
- successful final commit of the newly sealed preview.

`npm run check` passes after the implementation. Browser regression is skipped by the execution environment because local HTTP navigation is blocked.
