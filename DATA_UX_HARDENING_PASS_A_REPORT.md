# V1 Data / UX Hardening Revision - Pass A Implementation Report

## Status

Pass A - Reference/Data Model Review is complete.

This pass makes semantic reference data explicit and machine-checkable before the guided form work in Pass B. It does not claim that the current UI has already been converted to autocomplete/chip/hierarchical selectors; those changes remain Pass B.

## Scope completed

### 1. Reference field inventory

`REFERENCE_DATA_FIELD_INVENTORY.md` classifies semantic fields across ingredients, recipes, configuration rules, corpus orchestration and runtime consumers.

Every field is classified as one of:

- free descriptive text;
- validated numeric/measurement input;
- closed system enum;
- entity reference;
- extensible taxonomy reference;
- hierarchical taxonomy reference;
- multi-reference;
- derived/read-only value;
- historical/versioned value.

The governing rule is that any value consumed later by filtering, matching, planner rules, corpus generation or validation must resolve to a canonical ID. User/model memory is not a valid source of identifiers.

### 2. Canonical reference registry

Pass A introduces 7 extensible taxonomies and 113 seeded terms:

1. `food_category` - hierarchical group/subgroup taxonomy;
2. `cuisine`;
3. `recipe_family`;
4. `diet_tag`;
5. `practical_tag`;
6. `flavor_profile`;
7. `preparation_technique`.

Reference data is distributed in:

- `public/data/reference-data/taxonomies-0001.json`;
- `public/data/reference-data/taxonomy-terms-0001.json`.

The active seed version is `1.0.0`; its SHA-256 registry digest is:

`56f3949bd1c0348f8fe65861ebcda23c2a198805cd2e9f70b00610a328753b52`

System registries such as allergens, MealArchetype, DayArchetype and technical states remain closed and are not extensible by recipe generation.

### 3. Data contracts

New JSON Schema contracts:

- `taxonomy.schema.json`;
- `taxonomy-term.schema.json`;
- `reference-data-proposal.schema.json`.

Existing contracts were tightened so semantic recipe/ingredient fields use canonical IDs and both IngredientRevision and RecipeVersion require at least one MealArchetype.

The catalog manifest can freeze reference-data version, digest and shards. RecipeGenerationJob now requires the reference-data version and digest used for planning.

### 4. IndexedDB and persistence

Runtime persistence advances to:

- IndexedDB database version: `4`;
- content schema version: `3`;
- stores: `21`.

New stores:

- `taxonomies`;
- `taxonomyTerms`.

`taxonomyTerms` includes indexes for taxonomy, parent, status, origin, taxonomy+status and search tokens.

Backup/export now includes user-created taxonomies and taxonomy terms while preserving base reference data on import.

### 5. Legacy migration

`contentMigration:3` resolves legacy semantic strings with explicit outcomes:

- `exact`;
- `alias`;
- `manual`;
- `unresolved`.

There is no silent fallback. Any unresolved semantic reference blocks migration before active family/version pointers are advanced.

A concrete legacy defect found during the audit was the MealClass target `fish`, while ingredient taxonomy used `fish_seafood`. Pass A maps the legacy value to canonical `food_group_fish_seafood` instead of relying on string equality.

Historical IngredientRevision and RecipeVersion rows are never rewritten. If current semantic content needs canonicalization, migration creates a new revision/version and advances the current pointer. Mutable configuration references are migrated atomically in place.

Legacy ingredient MealArchetype `[]`, whose previous runtime meaning was unrestricted, is migrated to the complete explicit MealArchetype set. After migration, zero selections are invalid for both ingredients and recipes.

### 6. Semantic write gates

`ReferenceDataIndex` and semantic validation now protect service/catalog/pipeline boundaries.

The runtime rejects:

- unknown taxonomy IDs;
- unknown term IDs;
- invalid food group/subgroup parent relationships;
- semantic typos that do not resolve to a canonical term;
- ingredient or recipe records with zero MealArchetypes.

Personal catalog saves temporarily resolve known legacy aliases to canonical IDs and reject unknown values. Pass B will replace the remaining free-text UI paths with guided controls so this service-side rejection becomes an exceptional safety net rather than normal UX.

### 7. Corpus pipeline and taxonomy growth

The corpus pipeline is now reference-data-aware.

Every generation job freezes:

- `referenceDataVersion`;
- `referenceDataDigest`;
- the exact reference snapshot used by the planner.

All semantic coverage/focus criteria in the V1 and smoke corpus policies now resolve to active canonical taxonomy terms.

If the pipeline needs a new extensible semantic concept, it must use the ReferenceDataProposal lifecycle:

`gap -> proposal -> collision/hierarchy validation -> approval -> materialization -> canonical ID -> recipe generation`

It cannot place an invented string directly in a recipe.

Closed registries cannot be extended through this mechanism. Missing ingredients may be materialized only from verifiable source data after provenance, nutrition, allergen and taxonomy quality gates.

### 8. Release and offline integration

The catalog loader/importer/updater validates and stages reference data before ingredients and recipes. Catalog update/rollback persists the reference-data metadata.

The service worker and offline catalog packs include the reference registry assets.

The V1 release gate now checks:

- reference data is present;
- registry structure/hierarchy is valid;
- manifest digest matches the actual registry.

All three checks pass.

## Verification

Full automated gate after Pass A:

- Phase 4 corpus smoke: PASS, 5/7 candidates accepted;
- Phase 5 planner smoke: PASS, 2 days / 4 recipe components;
- JavaScript syntax check: 86 files PASS;
- automated tests: 88/88 PASS;
- accessibility source audit: 16/16 PASS;
- 10k scale benchmark: PASS;
- production build for `/`: PASS;
- GitHub Pages artifact audit for `/`: PASS;
- GitHub Pages build/audit for `/yourDietManager`: PASS.

The V1 release gate remains intentionally BLOCKED only by the production corpus prerequisites:

1. recipe corpus has 3 RecipeVersion records instead of >=3000;
2. fixture pipeline version is still `phase3-fixture`;
3. 4 base IngredientRevision records are not yet curated/high-confidence;
4. catalog version is still `0.3.0-dev`.

Reference-data presence, validity and digest gates all pass, so Pass A does not introduce a release blocker of its own.

## Deferred work

Pass A does not implement the final editor UX. The following remain deliberately open:

### Pass B - Guided form infrastructure

- taxonomy/reference configurators;
- autocomplete and searchable entity selectors;
- chip multi-selects;
- hierarchical group/subgroup selector;
- localized closed enums;
- ingredient-aware unit selector;
- inline form validation;
- removal of semantic CSV/free-text inputs.

### Pass C - Editor integrity

- disable current onboarding and use neutral standard bootstrap configuration;
- preserve expanded/focus/editor state across updates;
- fix DayClass capabilities binding and complete form/schema audit;
- global dirty-state/navigation guard;
- consistent save/error feedback;
- clearer frequency/nutrition labels.

### Pass D - Detail/edit UX

- recipe/ingredient detail independent from plan existence;
- editing of current base or user entities through new immutable revisions/versions;
- duplicate as a separate action;
- browser regression tests for the complete editing flows.

Production corpus generation remains paused until Passes B-D are complete, so the application cannot reintroduce semantic mismatches through its normal UI before thousands of records are created.
