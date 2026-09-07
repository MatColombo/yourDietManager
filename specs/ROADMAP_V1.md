# Roadmap yourDietManager V1

## Phase 0 — Contracts

- finalizzare spec;
- validare JSON Schema;
- esempi canonici;
- Skill di progetto.

## Phase 1 — App shell

- PWA;
- routing;
- IndexedDB schema + repository layer;
- catalog bootstrap JSON -> IndexedDB;
- migration runner;
- backup/import;
- i18n IT/EN;
- theme engine.

## Phase 2 — Configuration editors

- NutritionProfile;
- Allergy/Intolerance;
- MealClass;
- DayClass;
- Cycle 1–31;
- onboarding.

## Phase 3 — Catalog engine

- ingredient JSON importer/updater;
- recipe JSON importer/updater;
- IndexedDB indexes/query layer;
- search/filter;
- dynamic recipe detail;
- custom ingredient/recipe family+version records in IndexedDB.

## Phase 4 — Recipe corpus

- curate initial ingredient catalog;
- implement corpus scanner + `RecipeCorpusSnapshot`;
- implement versioned `RecipeCorpusPolicy`;
- implement deterministic Recipe Corpus Orchestrator and BUILD/EXPAND/IMPROVE/FOCUSED_EXPANSION modes;
- emit traceable `RecipeGenerationJob` batches with oversampling/diversity targets;
- run recipe generation pipeline in adaptive batches;
- coverage/diversity/similarity reports;
- target initial 3,000–5,000 validated recipes.

## Phase 5 — Plan generator

- hard filter;
- soft scoring;
- beam search;
- external slots;
- no scaling;
- carry-over.

## Phase 6 — Effective plan UX

- Oggi;
- Calendario;
- manage day;
- replace/rebalance;
- history/undo.

## Phase 7 — Shopping & prep

- civil-date shopping;
- people multiplier decimal;
- prep horizon.

## Phase 8 — Hardening

- 10k recipe scale;
- accessibility;
- offline catalog packs;
- IndexedDB structural/content migration tests;
- catalog update atomic/rollback tests;
- release V1.0.


## Release-candidate correction pass — mandatory before Phase 4 production corpus

### Pass A — Reference/Data Model Review ✅ DONE

- inventory and classification of every engine-consumed semantic field;
- canonical Reference Data Registry with 7 V1 taxonomies / 113 seed terms;
- persisted `taxonomies` / `taxonomyTerms` stores (`DB_VERSION=4`);
- version/digest in catalog manifest and RecipeGenerationJob;
- strict semantic reference validation at service/catalog/pipeline boundaries;
- legacy string -> canonical ID `contentMigration:3` with exact/alias/manual/unresolved audit and unresolved blocker;
- historical IngredientRevision/RecipeVersion preservation through new version creation;
- unified `mealArchetypes minItems=1` contract for ingredient and recipe;
- audited `ReferenceDataProposal` lifecycle for corpus-driven taxonomy growth;
- backup/export preservation of user reference data.

See `../REFERENCE_DATA_FIELD_INVENTORY.md`, `REFERENCE_DATA_TAXONOMY_SPEC.md` and `../DATA_UX_HARDENING_PASS_A_REPORT.md`.

### Pass B — Guided form infrastructure ✅ DONE

- taxonomy/reference configurator for all seven extensible V1 taxonomies;
- canonical autocomplete/search selectors for entity and taxonomy references;
- multi-select chips for recipe taxonomy metadata;
- hierarchical food group/subgroup selection with parent validation;
- reference-driven recipe/ingredient/tag/unit inputs;
- localized closed-registry values used by these forms;
- unified all-selected-by-default/min-one MealArchetype editor for ingredients and recipes;
- inline validation plus service-side rejection of legacy semantic strings/CSV shortcuts.

See `../DATA_UX_HARDENING_PASS_B_REPORT.md`.

### Pass C — Editor state and feedback ✅

- disable/revisit onboarding and use neutral standard defaults;
- fix DayClass capability mapping and full form/schema compatibility audit;
- preserve expanded panels/focus across updates;
- global dirty-state/navigation guard;
- consistent save/error feedback;
- clarify frequency-limit and nutrition labels;
- localize technical enum labels.

### Pass D — Recipe/ingredient detail and editing ✅ DONE

- recipe detail independent from PlanInstance;
- ingredient detail;
- Edit for base and user entities with transparent new revision/version;
- duplicate as a separate action, not a prerequisite for editing;
- browser regressions for recipe/ingredient detail -> edit.

### Pass E — Final acceptance and revision closure ✅ DONE

- browser interaction gate for required-field/schema parity;
- disclosure state preserved through local editor rerenders;
- dirty navigation reject/accept through normal routed clicks;
- persistent save-success feedback after a real configuration save;
- machine-checkable revision closure across code, reports, specs, project Skill and CI browser requirement.

Passes A-E are implemented. The production corpus build can resume only after the Pass E final-acceptance browser regression is green in an unrestricted Chromium/localhost environment; the GitHub Pages workflow sets this browser gate as required. The remaining V1 release blocker is then the 3,000–5,000 curated production corpus and its provenance/quality requirements.

## Phase 4 production corpus — controlled scale-up

### 4P-A — Production Contract & Pilot Pipeline ✅ DONE

- versioned production corpus contract bound to policy, pipeline and reference-data snapshot;
- deterministic 120-slot pilot intake across 12 coverage strata;
- explicit candidate lifecycle with `needs_reference_review`, `needs_ingredient_review` and `ready_for_generation` states;
- audited `ReferenceDataProposal` reuse/propose/review/materialize lifecycle for taxonomy growth;
- production ingredient readiness requires current `IngredientRevision` `curated/high` with minimum nutrition/provenance fields;
- production processor rejects unresolved intake before Recipe Pipeline execution;
- accepted RecipeVersion records freeze candidate/intake/production-contract provenance;
- production release publication and final release gate require production-contract traceability;
- current bundled fixture remains intentionally blocked: 0/4 production-ready ingredient families versus the 400-family pilot floor.

### 4P-B — Ingredient Curation & Pilot Execution ✅ SOURCE-BACKED COMPLETE

- `ingredient-curation-v1@1.0.0` remains bound to the 4P-A contract;
- official Foundation Foods + SR Legacy acquisition completed through the GitHub production workflow;
- **600** active current ingredient families materialized at `curated/high`;
- Phase 1 ingredient/recipe fixtures retired through explicit audited replacement mappings;
- six ordered pilot waves completed **120/120 accepted**, zero unresolved reference requests and zero unhandled taxonomy proposals.

### 4P-C — Industrialized Corpus Generation & first scale batch ✅ EXECUTED

- `recipe-production-pipeline-v1@1.0.0` remains the production acceptance pipeline;
- the source-backed pilot opened Scale Gate 500 to `ready`;
- the first industrialized batch added 100 accepted recipes with zero review backlog;
- the committed production working set reached **220 active recipes** with full provenance/quality gates preserved.

### 4P-D Pass A — Controlled Scale 220 -> 500 ✅ VERIFIED / WORKFLOW READY

- `controlled-scale-500-v1@1.0.0` bridges exactly 220 -> 500;
- tranche 1: +100 breakfast/snack -> 320;
- tranche 2: +100 lunch/dinner -> 420;
- tranche 3: +80 balanced close -> 500;
- every cell uses canonical `mealArchetype × energyBand` focus, no implicit semantic targets;
- every tranche requires exact accepted count, zero review backlog, zero quality errors and zero exact/near duplicates;
- split resume is fail-closed at exact 220/320/420 start counts;
- real-artifact verification reached **500 active recipes, hard coverage blockers 0, Scale Gate 500 = pass**;
- `.github/workflows/controlled-scale-500.yml` is the canonical repository runner and commits only with explicit `commit_results=true`.

Scale Gate 500 passing is not V1 release readiness. The frozen production release minimum remains 3,000 accepted recipes plus final production-manifest traceability.

### Next — 4P-D Pass B: controlled scale 500 -> 1500

Before bulk expansion, perform a 500-recipe checkpoint on coverage balance, ingredient-use concentration, primary-ingredient concentration, pair reuse, practicality distribution and nutrition-band distribution. Only a green checkpoint may define the next canonical scale plan.
