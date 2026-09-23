# Catalog Taxonomy Alignment Report

## Scope

Full semantic review of the clean catalog after the UX/MealClass rule update.

Resolved active corpus:

- 282 ingredients
- 530 recipes
- 386 taxonomy terms
- 232 ProductFood terms
- 81 recipe archetypes

The review preserves nutritional values, allergen data and source provenance. Changes are limited to taxonomy, recipe semantics, preparation metadata and clearly contradictory recipe timing/steps.

## Ingredient alignment

Every active ingredient now has:

- a canonical ProductFood;
- a category that exactly matches the ProductFood parent;
- at least one explicit culinary role;
- an explicit flavor profile;
- its existing state, nutrition, allergens, diet flags and provenance preserved.

Added missing reusable culinary roles for eggs, cheese, milk/buttermilk, condiments, acidic components, nuts/seeds, nut/seed spreads, fruit components, starches and seasoning.

Corrected known semantic mismatches:

- frog legs: fish/seafood -> meat/poultry;
- peanut butter: legumes -> nuts/seeds;
- tomato paste, tomato puree and tomato sauce: vegetables -> condiments/bases;
- shellfish and molluscs use the shellfish role rather than the fish role;
- poultry/game-bird records use poultry roles where appropriate;
- dried fruit, cheese, milk, eggs, oils and condiments now have explicit roles.

Ingredient flavor coverage after alignment:

- savory: 135
- neutral: 107
- sweet: 40

`neutral` is now a real authored ingredient flavor term, not an implicit fallback.

Culinary roles are also preserved by the clean-catalog compiler in `IngredientRevision.taxonomy.culinaryRoles`, validated against the runtime `culinary_role` taxonomy, displayed in ingredient detail, and preserved/editable when a user creates a new ingredient revision. This closes the previous gap where roles were validated in source JSON but discarded at runtime.

## Recipe alignment

Every active recipe now has explicit:

- cuisine IDs;
- meal-type IDs;
- one recipe archetype;
- exactly one flavor profile;
- practical tags;
- diet-tag array (including explicit empty arrays for omnivore recipes);
- one or more preparation techniques;
- eating-time estimate.

Recipe flavor coverage:

- savory: 390
- sweet: 140
- neutral/implicit: 0

Diet classification is derived from the actual ingredient diet flags:

- vegetarian: 364
- vegan: 120
- pescatarian: 87

Practical metadata includes quick, no-cook, cold, portable, meal-prep, elaborate, no-advance-prep and quick-eat semantics. The no-advance-prep tag is conservative: a generic ingredient whose catalog state is already `cooked` is treated as prior preparation unless future source data explicitly identifies it as a ready-to-eat purchased input.

## Preparation taxonomy

Added explicit reusable preparation techniques for:

- no-cook assembly;
- boiling;
- simmering;
- pan cooking;
- sauteing/browning;
- baking;
- roasting;
- grilling/griddling;
- braising;
- stewing;
- blending;
- toasting;
- reheating;
- steaming;
- frying.

Technique assignment is based primarily on actions performed by the recipe, not words embedded in ingredient names. A sandwich containing roasted meat therefore does not become an `roasting` recipe merely because its input ingredient was roasted previously.

## Recipe consistency repairs

Selected legacy records contained contradictions between `cookMinutes`, ingredient states and generic steps. The alignment corrects the clear cases, including:

- composed salads/sandwiches with non-zero cook time but no cooking action -> no-cook where all listed inputs are usable as-is;
- egg sandwiches -> explicit egg-cooking steps;
- egg/potato salads -> explicit boiling/cooking steps;
- mackerel with raw potato -> explicit potato boiling;
- hummus with grilled zucchini -> explicit grilling;
- warm lentil salad -> explicit reheating;
- bruschetta/crostino/toast records -> explicit bread toasting where missing;
- breakfast polenta with egg -> explicit polenta and egg cooking.

## Permanent validation

`tests/catalog-taxonomy-alignment.test.mjs` now verifies catalog-wide invariants, including:

- all ingredient and recipe taxonomy references resolve to the correct taxonomy type;
- ProductFood parent/category equality;
- non-empty ingredient roles and explicit ingredient flavor;
- exactly one non-neutral recipe flavor;
- explicit practical, diet and preparation metadata;
- no-cook tag/technique agreement with `cookMinutes`;
- quick/elaborate/quick-eat threshold consistency;
- no no-cook recipe containing raw meat, fish/seafood or egg;
- vegan/vegetarian/pescatarian labels agree with ingredient facts;
- known category corrections remain canonical.

The authoring protocol was updated so future AI-generated batches must preserve these invariants instead of relying on compiler/runtime fallbacks.

## Verification

Final verification command: `npm run check`. It passes catalog compilation, catalog tests, lint, planner interaction tests, PWA build and GitHub Pages artifact audit.
