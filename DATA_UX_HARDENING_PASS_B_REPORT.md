# V1 Data/UX Hardening Revision — Pass B Report

Status: **DONE**  
Candidate version: **1.0.0-rc.3**  
Scope: guided semantic form infrastructure over the canonical reference-data model introduced in Pass A.

## 1. Objective

Pass B removes user-memory-dependent semantic entry from operational forms. Any value later consumed by matching, filtering, scoring, planning, corpus generation, validation, or catalog classification must be selected from canonical reference data and persisted by stable ID.

Pass B deliberately does **not** implement the broader navigation/rerender/onboarding/save-feedback fixes assigned to Pass C, nor the full recipe/ingredient detail and edit-any-origin UX assigned to Pass D.

## 2. Implemented infrastructure

### 2.1 Shared guided controls

`src/ui/guidedControls.js` now provides reusable controls for:

- searchable canonical autocomplete;
- multi-select taxonomy chips;
- descriptive token chips for aliases only;
- hierarchical food group/subgroup selection;
- localized closed-enum selection;
- shared MealArchetype selection;
- ingredient-aware recipe-line units;
- localized canonical option labels.

Typing in an autocomplete does not create or persist a semantic value. A canonical option must be selected before the field is considered resolved.

### 2.2 Taxonomy/reference-data configurator

A dedicated page is available at:

`/configure/reference-data`

It supports:

- browsing/searching extensible taxonomies;
- localized IT/EN labels;
- explicit food-category hierarchy;
- creation of user taxonomy terms;
- editing user-created labels/aliases;
- read-only bundled/system terms;
- collision detection across labels and aliases;
- canonical term ID generation;
- provenance display and persistence;
- validation of the complete registry before commit.

The reference-data editor is backed by `src/services/referenceDataEditorService.js`; operational forms never create new taxonomy strings implicitly.

### 2.3 Closed registries remain closed

Pass B does not turn technical registries into extensible taxonomies. Allergens, MealArchetype, DayArchetype, ingredient state, canonical units and other technical enums remain controlled values. The UI localizes their labels while preserving their stable IDs.

## 3. Form changes

### 3.1 Ingredient authoring

The ingredient editor now uses:

- localized ingredient-state labels;
- hierarchical food group/subgroup selector;
- canonical flavor-profile autocomplete;
- the shared MealArchetype picker;
- explicit nutrition labels instead of P/C/F shorthand, including catalog/plan nutrient summaries;
- blank new nutrition inputs rather than silently coercing missing values to zero;
- tokenized aliases rather than CSV input.

Creation defaults all MealArchetypes to selected. At least one must remain selected to save.

### 3.2 Recipe authoring

The recipe editor now uses:

- the same MealArchetype semantics as ingredients;
- searchable ingredient selection over actual catalog data;
- units restricted to the selected IngredientRevision basis plus declared conversions;
- canonical chip selectors for recipe family, cuisine, diet, flavor, practical and preparation taxonomies;
- inline pre-save validation for required fields and ingredient lines.

Semantic tag fields no longer accept CSV or arbitrary strings.

### 3.3 Configuration rules and preferences

Semantic rule targets are now guided:

- ingredient targets resolve against actual ingredients;
- food-category targets resolve against the canonical food taxonomy;
- cuisine/flavor/tag targets resolve against canonical taxonomy terms;
- allergens remain a localized closed select.

Food-preference frequency controls now expose explicit `maxOccurrences` and `windowDays` labels instead of two unexplained number fields.

## 4. Authoring service hardening

`src/services/personalCatalogService.js` now enforces the same boundary as the UI:

- canonical reference-data IDs are required for semantic fields;
- legacy free-text category IDs are rejected;
- semantic recipe-tag arguments must be arrays of canonical IDs;
- unknown taxonomy terms are rejected;
- blank authoritative nutrition values are rejected rather than becoming numeric zero;
- recipe MealArchetypes require at least one value;
- ingredient MealArchetypes require at least one value.

The service layer therefore remains safe even if a future UI bypasses the shared controls.

## 5. Data/reference behavior

Pass B does not change the Pass A persistence contract:

- IndexedDB remains `DB_VERSION=4`;
- content schema remains version 3;
- `taxonomies` and `taxonomyTerms` remain authoritative runtime reference-data stores;
- manifest and corpus jobs remain frozen by reference-data version/digest;
- migration of legacy semantic strings remains governed by `contentMigration:3`.

The new UI consumes those contracts rather than introducing a second taxonomy source.

## 6. Important UX semantics fixed

### MealArchetype

Ingredients and recipes now use one rule:

- creation starts with all archetypes selected;
- all selected means compatible with all;
- one or more explicit selections may be retained;
- zero selected is invalid and cannot be saved.

### Units

Recipe lines do not accept arbitrary unit strings. Unit options are derived from the selected IngredientRevision. If the ingredient does not declare a conversion, that unit cannot be selected.

### Food hierarchy

Food group and subgroup are no longer two independent text fields. The subgroup list is constrained by the selected group, preventing impossible parent/child combinations at entry time.

## 7. Files added or materially changed

Primary Pass B implementation:

- `src/ui/guidedControls.js`
- `src/ui/referenceDataPages.js`
- `src/services/referenceDataEditorService.js`
- `src/services/personalCatalogService.js`
- `src/ui/catalogPages.js`
- `src/ui/configurationPages.js`
- `src/main.js`
- `src/ui/app.js`
- `src/styles.css`
- `public/data/locales/it.json`
- `public/data/locales/en.json`
- `public/service-worker.js`
- `scripts/hardening/a11y-audit.mjs`
- `tests/data-ux-pass-b.test.mjs`

Specifications/documentation aligned:

- `README.md`
- `SPEC_README.md`
- `DATA_UX_HARDENING_REVISION.md`
- `REFERENCE_DATA_FIELD_INVENTORY.md`
- `specs/REFERENCE_DATA_TAXONOMY_SPEC.md`
- `specs/ARCHITECTURE_SPEC.md`
- `specs/UX_SPEC.md`
- `specs/FOOD_PREFERENCES_SPEC.md`
- `specs/MEAL_CLASS_SPEC.md`
- `specs/RECIPE_CATALOG_SPEC.md`
- `specs/INGREDIENT_TAXONOMY_SPEC.md`
- `specs/TEST_STRATEGY.md`
- `specs/ROADMAP_V1.md`
- project Skill reference-data guidance.

## 8. Verification

The Pass B regression suite covers, among other cases:

- canonical taxonomy choices and hierarchy;
- shared MealArchetype creation semantics;
- ingredient-aware unit choices;
- taxonomy-term creation and collision rejection;
- base taxonomy-term read-only behavior;
- rejection of legacy semantic strings;
- rejection of blank authoritative nutrition;
- canonical recipe tag persistence;
- absence of semantic CSV fields in operational forms;
- offline precache of the new guided modules.

Final automated gates:

- **94/94 tests passed**;
- syntax check passed for **90 JavaScript files**;
- accessibility source audit **16/16**;
- Phase 8 10k scale benchmark passed;
- Phase 4 corpus smoke passed;
- Phase 5 planner smoke passed;
- production build and Pages artifact audit passed for both `/` and `/yourDietManager`;
- IT/EN locale parity: **593 keys each**;
- project Skill validation and packaging passed.

The V1 release gate is intentionally still blocked only by the four known production-corpus requirements: fewer than 3,000 recipes, fixture pipeline version, four base ingredient revisions not yet curated/high-confidence, and the development catalog version. Reference-data and app-version gates are green.

## 9. Explicitly deferred to Pass C

Pass B does not claim to solve:

- disabling/replacing the current onboarding flow;
- neutral standard bootstrap defaults;
- destructive full-rerender/collapsing `<details>` behavior;
- global dirty-state/navigation guard;
- global save/error feedback;
- the DayClass capability nesting bug and the complete form/schema parity audit.

Those items form Pass C.

## 10. Explicitly deferred to Pass D

Pass B also does not claim to complete:

- recipe detail independent of plan-generation UI;
- ingredient detail page;
- edit action for bundled/base-origin ingredients and recipes;
- transparent new revision/version creation for edits regardless of origin;
- duplicate as an independent action rather than an edit workaround.

Those items form Pass D.

## 11. Acceptance result

**Pass B is complete when all operational engine-consumed semantic fields in the covered authoring/configuration flows are selected from canonical data rather than typed from memory, and the service layer rejects bypass attempts.**

That condition is met by the current candidate. Pass C is the next hardening block.
