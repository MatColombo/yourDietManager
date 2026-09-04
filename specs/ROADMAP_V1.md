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

### 4P-B — Ingredient Curation & Pilot Execution 🟡 CONTROL PLANE DONE / DATA BLOCKED

- frozen `ingredient-curation-v1@1.0.0` policy bound to the 4P-A production contract;
- trusted-source hierarchy: Foundation Foods April 2026 primary, SR Legacy supplemental, Branded forbidden;
- source archive/input digest and source-record provenance required;
- imported source mappings remain `pending` until every editorial review dimension is explicit;
- only fully approved records can materialize as `curated/high`;
- duplicate handling and retirement of development fixtures require explicit mappings, never fuzzy replacement;
- pilot is six ordered waves of 20; a later wave cannot start before the previous wave closes with zero unresolved references/proposals;
- current baseline is intentionally blocked because no trusted USDA source batch is vendored and the production-ready foundation remains below 400.

4P-B is complete only at the control-plane level in this candidate. **Do not execute 4P-C scale-up** until >=400 production-ready ingredient families exist and all 120 pilot slots have been executed/reviewed to terminal states.

### 4P-C — Industrialized Corpus Generation & Scale Gate 500 🟡 CONTROL PLANE DONE / EXECUTION BLOCKED

- companion policy `recipe-production-pipeline-v1@1.0.0` bound to production contract, corpus policy and 4P-B curation policy;
- deterministic per-job scale intake, never direct candidate generation from a job without a ledger;
- explicit post-generation dispositions: accepted/rejected/duplicate/reference review/recipe review/nutrition outlier;
- objective ordered 100-point quality stages; V1 production acceptance requires 100/100;
- stale-snapshot guard between job planning and execution;
- immutable result/report digest;
- explicit review/retry with maximum three attempts;
- production apply refuses review backlog, digest mismatch, target failure or diversity failure;
- Scale Gate 500 derives hard coverage floors pro-rata from the frozen 3,000-recipe release minima.

The 4P-C execution gate remains intentionally blocked in the bundled fixture until the 4P-B data/pilot prerequisites are real. Control-plane availability does not authorize generation with fixture ingredients or unfinished pilot intake.

### 4P execution bridge — rc.13 🟢 IMPLEMENTED / NETWORK RUN REQUIRED

- `.github/workflows/production-corpus.yml` executes the missing source-backed chain on a network-enabled GitHub runner;
- official USDA source acquisition is digest-pinned in evidence manifests and source archives remain uncommitted;
- deterministic high-confidence review can approve only strict generic/rule-mappable records after import; import itself remains pending/unapproved;
- curation must preserve explicit replacements for salmon, cooked rice, zucchini and olive oil before Phase 1 fixtures can retire;
- recipe fixtures retire only after their ingredient fixtures are explicitly retired, with history preserved;
- six deterministic pilot waves must close at 120/120 accepted with zero unresolved references/proposals;
- the first 4P-C 100-accepted batch is created only after Scale Gate 500 becomes `ready`;
- generated working data is staging/evidence, not a V1 release; 4P-D remains gated by the real output of this run.

The local build environment cannot fetch the USDA ZIPs, so rc.13 validates this execution path with synthetic production fixtures and leaves the local production-data gate red rather than fabricating source data.

Next after the source-backed workflow reaches a clean Scale Gate 500 trajectory: **4P-D — Controlled Scale 500 -> 1500 -> 3000+**.
