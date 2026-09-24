# Assessment: next plan/catalog features

## Implementation status

Implemented blocks now include:

- **#1 ingredient nutrition contribution:** complete in recipe detail with kcal/macronutrient/fiber values and percentage share per ingredient.
- **#2 recipe taxonomy search:** complete for recipe family, cuisine, diet, flavor, practical tags and preparation technique, in addition to existing meal/ProductFood filters.
- **#3 calories per proposed meal:** complete in generation/rebalance previews.
- **#5 recipe ingredient substitution:** complete with iso-caloric quantity, nutritional delta, semantic affinity and immutable recipe versioning.
- **#7 proposed-meal replacement:** complete with hard-constraint revalidation and nutritional-affinity ranking.
- **#4 plan-wide ingredient substitution:** complete for generation previews using frozen plan-local RecipeVersion derivatives; base recipe family pointers are never changed.

No IndexedDB schema migration was required for these features. The next major blocks are #6 temporary generation tuning and #8 structural calendar editing.

## Architectural direction

The requested features fit the current application, but they should not all be implemented independently. Three reusable primitives should be introduced first:

1. **Nutrition decomposition** — one canonical function that calculates nutrition for a single ingredient line and can aggregate/diff arbitrary effective recipes.
2. **Nutritional affinity** — one service that ranks ingredient or recipe alternatives using normalized nutrition distance plus semantic/safety compatibility.
3. **Effective recipe overlay** — plan-scoped ingredient overrides that do not mutate the base catalog recipe. All plan nutrition, shopping, rendering and validation must resolve the effective recipe through the same layer.

Without these primitives, features 4 and 5 would duplicate calculations and feature 4 would risk modifying catalog recipes globally.

## 1. Ingredient contribution in recipe detail

**Assessment:** low complexity, high value, no persisted schema change required.

Current recipe detail already loads each ingredient revision and the recipe's aggregate `calculatedNutrition`. `nutritionCore.calculateRecipeNutrition()` already contains the exact calculation formula, but it only returns the sum.

Recommended implementation:

- add a canonical `calculateIngredientLineNutrition(line, revision)` helper;
- make `calculateRecipeNutrition()` aggregate that helper;
- in recipe detail show per ingredient:
  - grams;
  - kcal;
  - protein/carbohydrate/fat/fiber contribution;
  - percentage of total recipe kcal;
  - optionally percentage of each macro total;
- use the same rounding rules as the compiler so ingredient rows sum to the displayed recipe total.

Do not recalculate with ad-hoc UI formulas.

**Likely files:** `src/domain/nutritionCore.js`, `src/ui/catalogPages.js`, CSS/i18n, tests.

## 2. Recipe search by taxonomy categories

**Assessment:** low-medium complexity. The data is already present; search UI/query support is incomplete.

Current recipe search already supports meal, ProductFood, diet and practical tags. Free-text projection also includes labels/aliases of recipe tags. Missing first-class filters include at least:

- cuisine;
- flavor profile;
- preparation technique;
- recipe family/archetype;
- ingredient category/subcategory/concept as explicit selectable facets;
- potentially multi-select AND/OR behavior.

Recommended implementation:

- expose a grouped taxonomy-filter panel rather than adding many unrelated selects;
- support multiple values per taxonomy dimension;
- use AND between dimensions and configurable OR within a dimension;
- add IndexedDB multi-entry indexes for frequently used recipe tag arrays if profiling shows the 1,030-recipe catalog scan becoming material;
- retain the existing bounded fallback for uncommon facets.

The current `CatalogQueryService` is already the correct integration point.

**Likely files:** `src/ui/catalogPages.js`, `src/services/catalogQuery.js`, `src/db/constants.js` if new indexes are added, migrations/tests/i18n.

## 3. Calories per proposed meal in plan preview

**Assessment:** very low complexity.

The preview already shows daily kcal, while `addRecipeLabels()` loads all recipe versions needed by the preview. Extend that hydration step to retain recipe nutrition (or a compact `{title,nutrition}` map), then sum component kcal for each preview meal.

No planner or persisted-schema change is needed.

Recommended display: `13:00 · Pranzo · 612 kcal` next to the proposed recipe name(s).

**Likely files:** `src/ui/planPages.js`, tests/i18n.

## 4. Plan-wide ingredient substitution with kcal-equivalent grams

**Implementation status: complete for uncommitted generation previews.**

The implementation deliberately uses frozen **plan-local RecipeVersion derivatives** instead of adding ingredient-override fields to every recipe component. For each affected recipe version the service:

- replaces every line for the selected source ingredient;
- computes target quantity from the source line kcal and target kcal density;
- recalculates full recipe nutrition and allergens;
- preserves the base recipe family and its `currentVersionId`;
- creates an immutable derived version referenced only by the proposed plan;
- persists those derived versions atomically only when the plan preview is confirmed.

This choice keeps downstream behavior consistent without special cases: plan validation, safety checks, shopping, calendar display and nutrition all continue to resolve normal frozen RecipeVersions. Undo of the plan-creation operation also deletes the derived versions.

The candidate ranking reuses the feature-5 affinity engine and aggregates compatibility across every affected recipe/occurrence. The preview shows aggregate replacement amount, nutritional delta, state mismatch warnings and new allergens. Before a new generation preview is sealed, all hard constraints, daily energy limits and frequency rules are revalidated.

Multiple global substitutions can be applied sequentially to the same preview, and feature #7 continues to work afterward because proposed-meal replacement now resolves uncommitted derived recipe versions as part of its policy context.

Current scope: replacement applies to every occurrence of the selected ingredient in the proposed period. Per-occurrence opt-out can be added later if needed without changing the persistence model.

## 5. Nutritionally similar ingredient substitutions in recipe view

**Assessment:** medium complexity and the correct precursor to feature 4.

Create an `IngredientAffinityService` that ranks candidate ingredient revisions using:

- compatible culinary roles;
- compatible physical state/use case;
- ProductFood/category proximity;
- current allergy/intolerance and diet compatibility;
- normalized nutritional distance for protein, carbs, fat, fiber and energy;
- optional practical penalties for implausible substitutions.

For each candidate show:

- suggested grams for approximately equal kcal;
- kcal delta;
- protein/carbs/fat/fiber delta;
- semantic reason for the match (same role, same category, etc.).

In base-recipe detail the first implementation can be a **what-if preview** only. If editing is requested, a base recipe should be duplicated to a user recipe rather than modifying the base catalog record.

This service should later power feature 4.

## 6. Temporary soft constraints for plan fine-tuning — IMPLEMENTED

Feature 6 is now implemented through a run-local `GenerationTuningOverlay`. The proposal UI provides a taxonomy-aware guided intent builder with date and MealClass scope, 1–5 soft strength, ingredient/recipe autocomplete, and presets for sweet/savory, lower fiber, lower fat, more protein, simpler/quicker preparation and faster consumption.

Availability is intentionally modeled differently from preference: “ingredient unavailable” compiles to a temporary hard exclusion, while desire/avoidance and nutritional/practical directions remain soft objective terms. The normalized overlay is stored only in `GenerationRun.configSnapshot` for reproducibility and is never copied into permanent user configuration.

The overlay is enforced by initial generation, frequency planning, Feature 7 meal replacement and Feature 4 plan-wide ingredient substitution. Re-tuning a preview with manual post-generation edits regenerates from the generation inputs and the UI explicitly warns that those manual edits will be reset.

No IndexedDB migration was required. Solver/policy versions were advanced to reflect the new scoring semantics.

## 7. Replace a proposed meal by nutritional compatibility

**Assessment:** medium complexity because much of the confirmed-plan implementation already exists.

The current confirmed-day replacement flow already:

- retrieves eligible recipes;
- respects hard constraints;
- checks daily energy tolerance;
- checks frequency policy;
- supports recipe/ingredient search;
- supports whole-meal or component replacement;
- commits through preview + undoable operation history.

What is missing for the requested behavior is:

1. make the same replacement workflow operate on the **uncommitted generation preview**;
2. rank alternatives by nutritional similarity to the current meal, not mainly by frequency penalty and daily energy delta;
3. display kcal/macronutrient/fiber deltas for each alternative.

Use a `RecipeAffinityService` parallel to the ingredient affinity service. Suggested distance should compare the complete current meal composition against each candidate composition, normalized by the current meal's kcal/macros.

This is a relatively safe early feature because the confirmed-plan replacement architecture already provides most validation logic.

## 8. Manually edit a confirmed plan from Calendar - IMPLEMENTED

Feature 8 is implemented through `calendarPlanEditorService` and the Calendar/day-management UI. The active confirmed plan now supports transactional add, modify/regenerate and remove operations for diet days. DayClass changes are solved through the normal planner, compatible locked slots can be preserved when regenerating the same DayClass, and PlanInstance bounds expand/shrink automatically at the edges.

The implementation preserves the source-day ownership invariant for `dayOffset` meals: spill-over occurrences remain stored on their source CalendarDay and are projected onto the destination `civilDate`. The preview exposes the spill-over delta, incoming spill-overs are visible in the day page, and removing/modifying the source day reconciles the projection automatically.

Safety rules block structural rewriting when adherence has been recorded or production batches are attached, and block destructive DayClass/removal changes when locked meals cannot be preserved. Removal is also checked against frequency constraints. Every structural change is committed as one operation (`calendar_day_add`, `calendar_day_modify`, `calendar_day_remove`) and is fully undoable/redoable. No IndexedDB migration was required.

## Requested feature set status

Features 1 through 8 from the requested set are now implemented. Further work can focus on hardening and UX refinement rather than another missing core feature: richer drag/drop calendar editing, direct single-slot time/mode edits, multi-day structural batch edits, and optional natural-language compilation into the Feature 6 tuning overlay are logical follow-ups.
