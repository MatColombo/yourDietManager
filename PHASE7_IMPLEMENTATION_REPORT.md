# Phase 7 Implementation Report

## Scope

Phase 7 implements Shopping & preparation UX on top of the effective-plan chain from Phase 6:

- civil-date shopping aggregation;
- decimal equivalent-people multiplier;
- persisted ShoppingChecklist workflow;
- checklist staleness/refresh;
- manual shopping items;
- preparation horizon derived from frozen RecipeVersion practical metadata.

The production 3,000-5,000 recipe corpus remains an open Phase 4 data deliverable. Phase 7 therefore validates behavior using development fixtures while preserving historical version references exactly as production will.

## Completed behavior

### Civil-date shopping engine

- Uses `mealSlots[].civilDate` as the consumption date, not the diet/source date.
- Queries up to two preceding diet dates so night carry-over meals are included in the correct civil range.
- Ignores every `mode=external` slot by construction.
- Resolves each planned component by the frozen `recipeVersionId` stored in CalendarDay.
- Resolves each recipe line by the frozen `ingredientRevisionId` stored in RecipeVersion.
- Aggregates normalized recipe-line amounts, never recipe final yield.
- Aggregates by ingredient family + canonical normalized unit + compatible ingredient state, preventing raw/cooked quantities from being merged accidentally.
- Missing historical RecipeVersion or IngredientRevision references are hard errors rather than fallbacks to current family pointers.

### Shopping multiplier

- `AppConfig.shoppingPeopleMultiplier` remains constrained to 0.1-20.0 and supports decimals.
- Calculation is `normalized recipe-line amount × component servings × people multiplier`.
- Since planner components remain `servings=1`, the multiplier affects shopping quantities only.
- Changing the multiplier does not mutate CalendarDay, RecipeVersion, nutrition summaries or solver inputs.
- The Shopping page can save a new default multiplier through the Phase 2 configuration service and schema validation.

### Persistent ShoppingChecklist

- A calculated list can be materialized in the existing `shoppingChecklists` IndexedDB store.
- Checklist creation stores civil range, multiplier, source plan timestamp, derived source meal occurrence IDs and user state.
- Checked state and notes are editable for both derived and manual items.
- Derived quantity/unit/ingredient identity are read-only; changes must come from a plan refresh.
- Manual items support label, optional quantity/unit, checked state and notes.
- Manual items can be deleted without changing the plan.
- Deleting the entire checklist never changes the plan.
- Shopping checklists remain included in the existing full backup/import flow.

### Staleness and refresh

- A checklist records the effective-chain `planUpdatedAt` timestamp (falling back to the newest PlanInstance timestamp).
- Any later effective-plan mutation marks the checklist stale.
- This is intentionally chain-aware: a shopping range can include occurrences from linked PlanInstance segments.
- Refresh recalculates only derived items from the current effective plan.
- Existing checked state and notes transfer when the deterministic semantic item ID still matches uniquely.
- Manual items are always preserved.
- Refresh replaces the checklist in one IndexedDB write, so there is no half-refreshed persisted record.

### Preparation horizon

- Supports 1, 2, 3, 5 and 7 civil-day horizons in the UI.
- Uses the same civil occurrence resolver as Shopping, including carry-over behavior.
- Excludes external meal occurrences.
- Resolves frozen RecipeVersion practical metadata and localized instructions.
- Surfaces prep/cook time, meal-prep suitability, refrigeration, freezer suitability, reheating and cold suitability.
- Shows aggregate prep and cooking minutes across the selected horizon.
- Preparation remains a derived read-only view in V1; no new persisted prep-task entity is introduced.

### Shopping UI

The `/shopping` primary navigation route is now a functional screen with:

- custom civil date range;
- quick ranges: today, tomorrow, next 48h, 5 days, 7 days;
- decimal people multiplier;
- calculated ingredient list with source-meal counts;
- save multiplier;
- save checklist;
- saved-checklist selector;
- stale warning and refresh action;
- checkbox and notes workflow;
- manual shopping-item creation/deletion;
- preparation horizon and practical flags.

IT and EN strings are complete for the new surface.

## Contract clarifications

`SHOPPING_SPEC.md` and `SHOPPING_CHECKLIST_SPEC.md` were hardened where Phase 7 exposed previously implicit behavior:

1. preparation horizon now has an explicit V1 contract;
2. civil shopping/checklist ranges may span linked PlanInstance segments;
3. `sourcePlanUpdatedAt` is defined against the effective-plan chain/global plan mutation timestamp so changes to a contributing older segment cannot silently leave a checklist fresh.

No JSON Schema change was required.

## Important design decisions

1. **Historical references are authoritative.** Shopping never substitutes `currentVersionId` or `currentRevisionId` for a frozen plan reference.
2. **State compatibility is part of aggregation identity.** Raw/cooked/dry/prepared amounts are never blindly summed.
3. **Shopping is non-nutritional.** The people multiplier and checklist state do not feed back into nutrition or planning.
4. **Derived checklist quantities are immutable user-side.** Editing quantity directly would create a second source of truth; refresh-from-plan is the only derived recalculation path.
5. **Prep is derived, not another planning system.** Phase 7 does not create prep tasks or mutate meal assignments.
6. **Staleness is conservative across the active chain.** A plan mutation can make a checklist stale even if the affected occurrence is outside its exact range; this favors correctness and a cheap deterministic rule over under-detecting changes.

## Validation performed

Final Phase 7 gate:

- Phase 4 corpus smoke remains green;
- Phase 5 planner smoke remains green;
- 68/68 automated tests pass;
- 6 Phase 7-specific tests cover shopping/checklist/preparation behavior;
- syntax check passes across 74 JavaScript files;
- IT and EN dictionaries have identical 517-key sets;
- static production build succeeds;
- HTTP smoke returns 200 for `/shopping`, `shoppingPages.js`, `shoppingService.js`, locale data and the service worker;
- service worker precache includes `shoppingService.js` and `shoppingPages.js`;
- ShoppingChecklist records are schema-validated on create, refresh and item mutation.

Phase 7-specific automated coverage includes:

- civil-date carry-over inclusion and external-slot exclusion;
- linear decimal multiplier without plan mutation;
- raw/cooked state-separated aggregation;
- stale detection + refresh preservation of checked/note/manual items;
- read-only derived quantities and manual-item deletion;
- prep horizon metadata from frozen historical RecipeVersion records.

## Known limitations

1. The bundled catalog remains a development fixture; final real-world shopping/prep acceptance must be repeated after the curated Phase 4 production corpus exists.
2. Commercial package-size optimization, store aisles, pantry inventory and package rounding are intentionally outside V1.
3. Preparation tasks are not independently persisted; the Phase 7 prep horizon is derived from the plan every time.
4. Browser-managed Chromium E2E is unavailable in this execution environment, so verification uses service/integration tests plus static HTTP smoke.

## Phase boundary

Phase 7 implementation is complete against the current V1 contracts and development catalog.

Next coherent increment: **Phase 8 - Hardening**:

- 10k recipe scale acceptance;
- accessibility pass;
- offline catalog-pack behavior;
- IndexedDB structural/content migration stress tests;
- catalog update atomicity/rollback stress tests;
- V1.0 release preparation.
