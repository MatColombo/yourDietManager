# Assessment: next plan/catalog features

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

**Assessment:** high complexity. This should be built after feature 5 and the effective-recipe overlay primitive.

The current `CalendarDay.recipeComponents` references immutable recipe versions and has no place for per-plan ingredient modifications. Mutating the base recipe would be incorrect because it would affect every occurrence and future generation.

Recommended data model:

- extend a planned recipe component with optional plan-scoped ingredient overrides, or introduce a dedicated override record keyed by `planInstanceId + mealOccurrenceId + recipeVersionId`;
- each substitution records source ingredient/revision, target ingredient/revision, source grams, target grams, provenance and timestamp;
- central `resolveEffectiveRecipeComponent()` returns effective ingredient lines and effective nutrition;
- shopping, plan nutrition, calendar display, replacement validation and exports must consume the effective form.

Kcal-equivalent starting quantity:

`targetGrams = sourceLineEnergyKcal / targetEnergyKcalPerGram`

Then show resulting macro/fiber deltas. Zero/near-zero-energy ingredients must not use this formula.

A global “replace X with Y” action should first build a preview listing every affected occurrence. The user should be able to deselect occurrences before commit. All changes should be one undoable operation.

Hard compatibility should include allergy/intolerance, diet rules, ingredient state, culinary-role compatibility and recipe preparation plausibility. Kcal matching alone is not sufficient.

**Dependencies:** features 1 and 5 primitives; shopping integration; operation history; preview guard.

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

## 6. Temporary soft constraints for plan fine-tuning

**Assessment:** high complexity, but fits the current solver if implemented as a separate transient overlay rather than by modifying permanent configuration.

Introduce a `GenerationTuningOverlay` scoped to:

- one preview/generation run;
- a specified date range within that run;
- optionally selected meal classes.

The overlay should compile user intent into existing or new structured scoring rules. Examples:

- “I want ingredient X” -> temporary prefer rule and optionally a soft occurrence target;
- “ingredient Y is unavailable” -> this is semantically a temporary **hard exclusion**, not merely a soft constraint;
- “I want sweet food” -> temporary preference for `flavor_sweet`, optionally scoped to snack/breakfast;
- “more sensitive to fiber” -> temporary penalty/upper-target adjustment for fiber;
- “simpler and less fatty” -> practical-tag/time preference plus a fat penalty.

For a local-first PWA, the first version should use a guided intent builder with taxonomy-aware autocomplete and deterministic phrase templates. Truly unrestricted natural-language interpretation would require an LLM/service boundary and should not be made a hidden dependency of plan generation.

The structured overlay must be stored in `GenerationRun.configSnapshot` (or an explicit tuning snapshot) for reproducibility, but it should not be copied into permanent user configuration unless the user explicitly requests that.

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

## 8. Manually edit a confirmed plan from Calendar

**Assessment:** high complexity. Existing foundations are strong, but structural day editing needs a transaction model that includes neighboring spill-over dates.

Already present:

- calendar/day management;
- meal replacement;
- meal locking;
- day/range rebalancing;
- preview validation;
- operation history with undo/redo;
- `dayOffset` and `civilDate` modeling.

Missing:

- change DayClass for a confirmed day;
- add/remove manual meal occurrences;
- change time/meal class/mode for an occurrence;
- add/remove complete diet days where allowed;
- reconcile occurrences whose `dayOffset` makes them land on later civil dates.

Recommended approach: `DayStructureEditPreview`.

When day D is structurally edited, compute an **affected closure** rather than mutating D alone. Because the current schema permits `dayOffset` 0-2, validation/rendering must consider at minimum source diet days D-2 through D+2 where relevant. The preview should:

1. remove occurrences generated by the old source-day structure;
2. create occurrences from the new structure with correct `civilDate`;
3. preserve explicitly locked/manual occurrences where requested;
4. detect collisions and duplicate time/meal slots;
5. recompute nutrition and frequency windows;
6. optionally invoke the existing rebalance solver for unlocked planned meals;
7. commit all affected CalendarDays as one operation so undo/redo is atomic.

Do not store spill-over meals by physically moving them between CalendarDay records. Keep the existing invariant: the diet-day record owns its occurrence and `civilDate = date + dayOffset`; calendar views project by civil date.

## Recommended implementation sequence

### Phase A — visible/low-risk improvements

- #1 ingredient nutrition contribution;
- #3 kcal per proposed meal;
- #2 full taxonomy filters.

These require no new plan persistence model and give immediate UI value.

### Phase B — affinity engine and meal alternatives

- nutritional distance utilities;
- #5 ingredient substitution what-if;
- #7 nutritionally ranked meal replacement, including uncommitted preview support.

### Phase C — effective recipe overrides

- plan-scoped ingredient override schema/service;
- integrate overrides into nutrition, shopping, plan rendering, validation and history;
- #4 plan-wide ingredient substitution.

### Phase D — temporary generation tuning

- structured `GenerationTuningOverlay`;
- guided taxonomy-aware intent builder;
- #6 temporary date-scoped preferences/exclusions/nutrient adjustments.

### Phase E — structural calendar editing

- `DayStructureEditPreview` and affected-date closure;
- add/remove/change meal occurrences and DayClass;
- spill-over/dayOffset reconciliation;
- #8 confirmed-plan structural editing with atomic undo/redo and optional rebalance.

This order minimizes duplicate work: features 4 and 7 reuse the affinity engine, and feature 8 reuses the existing replacement/rebalance/history infrastructure rather than creating a separate calendar mutation path.
