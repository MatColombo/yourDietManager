# Domain model

## DayArchetype

Fixed V1 enum: `day`, `morning`, `afternoon`, `night`, `long_shift`, `split_shift`, `on_call`, `rest`, `free`.

DayClass is user data: name, <=2-character abbreviation, color, archetype, work windows, capabilities and meal slots.

## MealArchetype

Fixed V1 enum: `breakfast`, `lunch`, `dinner`, `snack`, `mini_meal`, `brunch`, `pre_shift`, `during_shift`, `post_shift`, `night_meal`.

MealClass is user data: name, abbreviation, archetype, energy share and meal-specific rules. MealArchetype is a closed registry. Ingredient and recipe creation select all archetypes by default and require at least one.

## MealSlot

Fields include mealClassId, time, dayOffset, mode (`planned`/`external`), energy budget/share and guidance. `dayOffset` derives civil consumption date.

## Catalog identity

Ingredient family -> immutable IngredientRevision.
Recipe family -> immutable RecipeVersion.
RecipeVersion ingredient lines freeze ingredientRevisionId. Plan meal components freeze recipeVersionId and `servings=1`.

## Nutrition profile

Base kcal, tolerance, optional macro/fiber min-target-max values, weights and per-DayArchetype modifiers.

## Constraint precedence

1. Allergy/intolerance hard constraints.
2. Explicit voluntary hard exclusions.
3. Physical/equipment hard constraints.
4. Nutrition soft objective.
5. Meal/global preferences.
6. Variety/repetition/practicality.

## GenerationRun

Freeze solver/generator versions, seed, catalogVersion and configuration snapshot/hash for reproducibility.


## Reference data

Food groups/subgroups, cuisine, recipe family and engine-consumed tags are canonical taxonomy term IDs with localized labels/aliases in a Reference Data Registry. User input is guided by search/selectors; semantic free text is not a valid persisted substitute.
