# Test Strategy V1

## 1. Piramide

### Core unit tests

- nutrient calculation;
- hard constraint filtering;
- soft scoring;
- carry-over/dayOffset;
- cycle materialization;
- shopping multiplier;
- IndexedDB structural/content migrations;
- catalog JSON -> IndexedDB import;
- repository query/index correctness;
- i18n fallback.

### Integration tests

- configuration -> plan generation;
- custom DayClass -> civil agenda;
- allergies -> zero violating recipes;
- external slot -> no shopping item;
- locale/theme persistence in IndexedDB;
- backup round-trip;
- catalog update failure leaves previous catalog active;
- historical recipe/ingredient version references remain resolvable.

### Browser E2E

- fresh install boots the neutral standard configuration without forcing onboarding;
- when onboarding is re-enabled, its redesigned flow receives a separate E2E suite;
- create meal/day classes;
- build 31-day cycle;
- generate plan;
- edit calendar;
- offline reload;
- export/import.

## 2. Recipe corpus orchestrator tests

Unit/property tests:

- same policy/snapshot/mode/goal/seed -> same first batch intent;
- tie-break is deterministic (`seeded_hash_then_lexical`);
- BUILD stops only when count target + hard coverage targets + release gates are satisfied;
- EXPAND measures net accepted additions, not candidate count;
- IMPROVE never deletes historical RecipeVersion records and retirement cannot reduce hard coverage;
- FOCUSED_EXPANSION `boost` preserves global scoring while `restrict` enforces only the explicit focus;
- ingredient overuse and repeated-pair penalties increase after their policy thresholds;
- cuisine/family targets remain soft unless explicitly marked hard;
- allergen distribution never creates a positive coverage objective;
- no feasible positive-priority intent with hard gaps -> blocked diagnostic, not random generation;
- after every accepted batch a fresh snapshot is required before choosing the next job;
- `candidateCount >= targetAcceptedCount` and policy bounds are respected.

Integration tests:

- corpus scan -> snapshot -> orchestration run -> RecipeGenerationJob -> pipeline -> new snapshot;
- job `orchestration` references resolve to run/policy/snapshot;
- snapshot digest changes iff the staged corpus content changes;
- manually supplied focus is recorded and reproducible.

## 3. Recipe catalog gates

- 100% schema valid;
- 100% ingredient references valid;
- 100% required nutrients calculated;
- zero hard allergen derivation mismatches;
- zero exact duplicates;
- all accepted RecipeVersion records have servingCount=1;
- IT/EN required text complete;
- no NaN/Infinity;
- plausible amount ranges.

## 4. Generator invariants

Property tests:

- same catalog/config/solverVersion/seed -> same generated plan;
- every selected recipeVersionId resolves and remains stable after currentVersionId changes;
- every recipe ingredientRevisionId resolves and historical nutrition stays stable after currentRevisionId changes;

- never return a recipe violating allergy/intolerance;
- never set servings !=1 automatically;
- every planned slot has civil date = diet date + dayOffset;
- external slot never appears in shopping;
- shopping multiplier changes quantities linearly but not nutrition;
- shopping aggregates by ingredient family + canonical unit + compatible state and preserves historical RecipeVersion/IngredientRevision references;
- persisted shopping checklist refresh preserves manual items and unambiguous checked/note state;
- preparation horizon follows civilDate, excludes external slots and resolves frozen RecipeVersion practical metadata;
- cycle repeats identically independent of month length.

## 5. Scale tests

Testare almeno:

- 1k recipes;
- 5k recipes;
- 10k recipes;
- 31-day cycle;
- 365-day generated plan;

Obiettivo V1: interazione UI fluida su catalogo 10k usando IndexedDB candidate retrieval e senza pre-rendering di tutte le ricette nel DOM. Vedere `PERFORMANCE_BUDGET_SPEC.md`.

## 6. Persistence/recovery gates

Testare database vuoto, bootstrap catalogo, refresh/reopen, upgrade DB_VERSION, content migration interrotta/ripresa, quota insufficiente, catalog update corrotto, backup pre-import e rebuild del solo catalogo base senza perdita dei record user.

## 7. Phase 8 hardening and final release gate

Automated Phase 8 hardening must cover:

- additive IndexedDB structural upgrade to the current DB version;
- interrupted/resumed/idempotent content migration;
- bounded unfiltered 10k RecipeVersion browsing;
- bounded recent-history reads with 10k operations;
- offline pack shard planning/caching behavior;
- failed catalog update recovery without switching the active version;
- successful rollback that restores prior mutable catalog state while preserving staged immutable records;
- runtime storage/integrity metrics;
- source-level accessibility gates for landmarks, route focus, keyboard-visible focus, reduced motion, forced colors, localization parity and safe text rendering.

The final `1.0.0` release gate is stricter than the implementation hardening gate. It must fail unless the bundled base catalog meets the production corpus floor, declares a production pipeline/catalog version, and all authoritative base ingredient revisions satisfy the required curated/high-confidence provenance state. A release-candidate build must not be relabeled `1.0.0` while any of these checks fail.


## 8. Reference-data / taxonomy hardening gates

### Pass A — automated data/model gates

The Pass A suite must verify:

- the bundled registry validates as Taxonomy/TaxonomyTerm, has no hierarchy/collision errors and has a deterministic digest;
- canonical, label, alias and `legacyKeys` resolution always returns a term ID;
- unknown/typo cuisine/family/category/tag is rejected by service/pipeline boundaries;
- hierarchical taxonomies reject parent cycles, cross-taxonomy parents and invalid food group/subgroup pairs;
- `contentMigration:3` reports `resolved_exact | resolved_alias | resolved_manual | unresolved`;
- any `unresolved` blocks migration before family current pointers are changed;
- legacy catalog rows are not mutated: migration creates new IngredientRevision/RecipeVersion and advances the family pointer;
- configuration semantic targets are migrated atomically to canonical IDs;
- ingredient and recipe schemas both reject zero MealArchetypes;
- `ReferenceDataProposal` detects collisions, cannot extend closed registries and materializes only approved valid proposals;
- RecipeGenerationJob requires and freezes `referenceDataVersion` + `referenceDataDigest`;
- candidate acceptance rejects semantic references not present in the frozen registry snapshot;
- catalog import/update validates reference-data digest and stages registry data before ingredients/recipes;
- backup/export preserves user-created Taxonomy/TaxonomyTerm records without overwriting the base registry.

### Pass B — guided form/reference gates

Pass B deve verificare almeno:

- normal authoring services reject legacy semantic text even if it is a known legacy alias;
- semantic recipe tag inputs are arrays of canonical IDs, not CSV/string shortcuts;
- taxonomy configurator creates stable canonical IDs, rejects base-term edits and detects label/alias collisions;
- food group/subgroup choices preserve the registry parent relation;
- ingredient-dependent unit choices contain only basis + explicit conversions;
- empty creation MealArchetype input resolves to the shared all-selected default and zero selections remain invalid;
- operational UI source uses canonical autocomplete/chips/hierarchical controls for taxonomy/entity references;
- service worker/offline shell includes the guided control/configurator modules;
- IT/EN locale parity remains green and semantic field labels no longer advertise CSV entry.

### Pass C — editor/navigation hardening gates

Pass C automated gates must verify:

- fresh bootstrap is neutral: no preselected allergy/preference rules, people multiplier 1, standard one-day Cycle and disabled optional nutrient constraints;
- an untouched legacy bootstrap can upgrade to the neutral standard while explicitly saved/imported configuration is never overwritten;
- all operational disclosure state is centralized and survives editor rerenders; no feature editor introduces raw `<details>` state that collapses implicitly;
- internal programmatic navigation is centralized; editable routes use one dirty guard for internal links, Back/Forward and `beforeunload`;
- programmatic form mutations emit the same dirty signal as native input/change;
- background/full rerenders do not replace a dirty editor without explicit discard/save;
- configuration Save is disabled while schema/cross-record/reference diagnostics are blocking;
- required numeric blanks remain invalid rather than being silently coerced;
- `DayClass.capabilities` writes to the nested schema object and non-free DayClass cannot have zero slots;
- explicit save success/error feedback survives rerenders and is exposed through an accessible live region;
- source audit leaves raw history/disclosure primitives only in the shared UI-state infrastructure.

The automated Pass C suite is a source/domain regression gate; click-level browser verification remains part of the final Pass D browser regression suite.

### Pass D — detail/edit and browser flow gates

Pass D automated domain/source gates verify:

- recipe and ingredient detail resolve with zero PlanInstance records and use canonical dynamic routes;
- trailing-slash normalization cannot route a recipe detail request to the plan/today fallback;
- editing any base or user catalog family creates a new current revision/version without mutating historical records;
- first edit of a base family keeps the stable family ID, promotes it to local management and catalog pack/update logic preserves that local current pointer;
- custom-catalog export/import can carry a local override of a bundled family ID while immutable ID collisions remain forbidden;
- duplicate remains separate from edit and creates a new family;
- dynamic edit routes are included in the centralized dirty-navigation guard;
- the operational UI has no origin-based gate hiding Edit from a current recipe/ingredient.

A dependency-free Chromium/CDP regression harness (`npm run hardening:browser`) additionally exercises click-level navigation from recipe card -> recipe detail -> edit and ingredient detail -> edit when the execution environment permits local HTTP browser access. If the environment blocks localhost, the run is recorded as `skipped` with the policy reason and must never be reported as a passed browser test.

### Pass E — final interaction acceptance and revision closure

Pass E extends the browser harness so the final acceptance run on an unrestricted browser environment must exercise, through normal user interaction paths:

- a required numeric field becoming blank and blocking Save before persistence;
- a controlled disclosure remaining open after an editor-local rerender;
- dirty navigation rejected on cancel and completed on explicit discard;
- a valid save producing persistent visible success feedback;
- the Pass D recipe card -> detail -> edit and ingredient detail -> edit paths.

`npm run hardening:revision` then verifies version sync, Pass E documentation/Skill coverage, the CI-required browser setting, presence of all acceptance checks and the status of the latest Pass E browser report. With `YDM_BROWSER_REQUIRED=1`, only `status=passed` is acceptable; recognized environment-policy skips are acceptable only for local non-release verification.

CI browser startup must not rely on a guessed fixed debugging port. The Pages workflow selects an executable stable Chrome when available, exports it through `CHROMIUM_PATH`, and the harness uses a temporary profile plus `--remote-debugging-port=0`, discovering the assigned DevTools endpoint before starting acceptance navigation. Browser spawn/early-exit diagnostics are release-gate failures, not silent skips.

## 9. Phase 4 production corpus gates

### 4P-A — contract and pilot infrastructure

The 4P-A suite must verify:

- the production corpus contract validates and is bound exactly to the active `RecipeCorpusPolicy` ID/version;
- contract digest is deterministic and frozen into every production `RecipeGenerationJob`;
- the pilot planner produces exactly 120 deterministic intake slots across the 12 declared strata;
- a production job can use only current IngredientRevision records meeting the contract's `curated/high` quality/provenance requirements;
- draft/low fixture ingredients cannot become production job inputs merely because they exist in the catalog;
- reference-data intake reuses a unique canonical term, proposes only on extensible taxonomies, blocks collisions and never materializes without explicit approval;
- `referenceScanStatus` must be complete and unresolved prerequisite counts must be zero before an intake can become `ready_for_generation`;
- the production processor rejects unresolved or contract/snapshot-mismatched intake before invoking the Recipe Pipeline;
- accepted production RecipeVersion records freeze `candidateId`, `intakeId`, production contract ID/version and the contract-bound pipeline version;
- release publication includes production contract/policy traceability and the final release gate rejects catalogs without that provenance;
- current development fixtures are reported as blocked rather than silently promoted to production-ready data.


### 4P-B — ingredient curation and pilot execution

The 4P-B suite must verify:

- the curation policy is bound exactly to the production contract and source-count assumptions are explicit;
- the primary Foundation source count alone cannot satisfy the 400-family floor, and the supplemental floor is computed rather than hidden;
- source import writes an input digest and every source row remains pending/unapproved by default;
- heuristic suggestions never satisfy editorial review checks automatically;
- `approved=true` with any incomplete review dimension is rejected;
- Foundation and SR Legacy imports are source-bound and schema-valid; Branded datasets are forbidden;
- source nutrition rows missing required macronutrient fields are excluded from the eligible review batch rather than filled with invented values;
- materialization produces only schema-valid `curated/high` IngredientRevision records with source-record and batch provenance;
- ingredient family ID collisions are rejected and development fixture retirement requires a schema-valid explicit replacement map;
- wave 1 is blocked when production ingredient readiness fails;
- wave 1 is not blocked by final 3,000-recipe/production-manifest release checks once `readyForPilot` is green;
- wave N+1 is blocked until wave N is fully terminal;
- wave close requires zero unresolved reference requests and zero unhandled taxonomy proposals;
- the current repository baseline reports `readyForPilotFoundation=false` rather than treating missing trusted source data as a skip/pass.


## 4P-C industrialized production pipeline / Scale Gate 500

- `recipe-production-pipeline-v1@1.0.0` schema-valid and bound to ProductionCorpusContract, RecipeCorpusPolicy and ingredient curation policy.
- Job-specific scale intake is deterministic and starts all records `discovered` with `referenceScanStatus=pending`.
- 4P-C scale intake/run is impossible while Scale Gate 500 is `blocked` by unfinished 4P-B prerequisites.
- Production batch execution requires a fresh snapshot matching `job.orchestration.inputSnapshotId`; catalog mutation after planning is a hard failure.
- Every candidate receives exactly one explicit disposition: accepted, rejected, duplicate, needs_reference_review, needs_recipe_review or nutrition_outlier.
- `needs_reference_review`, `needs_recipe_review` and `nutrition_outlier` are non-terminal and create review backlog; batch apply is forbidden while backlog >0.
- `macro_energy_mismatch` is a blocking production nutrition outlier when the underlying ingredient energy is Atwater General (or lacks source-basis metadata). Do not apply a General-factor 4/4/9 mismatch gate to USDA Atwater Specific or SR Legacy energy values; those remain subject to source provenance and bounded nutrition validation.
- Objective stage weights total 100; V1 accepted candidates require score 100.
- Batch result/report digest detects tampering or mismatched result artifacts.
- Recipe/nutrition retry requires explicit reviewer identity/notes and cannot exceed three candidate attempts.
- Exact/near duplicates are explicit duplicate dispositions and never produce accepted RecipeVersion records.
- Production apply requires gate=pass, targetMet, diversityPassed, zero review backlog and matching digest.
- Scale Gate 500 requires 4P-B pilot completion, >=500 active recipes, zero schema/reference/nutrition/allergen/locale errors, zero exact/near duplicates and pro-rata hard coverage floors derived from the 3,000-recipe release minima.
- `npm run corpus:scale-gate-500 -- --strict` must exit non-zero until the 500 gate actually passes.


### 4P execution bridge — source-backed missing-step execution

The rc.13 execution suite must verify:

- the GitHub workflow preserves the strict order Foundation/SR acquisition -> review intake -> deterministic bounded review -> materialization -> explicit fixture retirement -> pilot readiness -> six pilot waves -> Scale Gate 500 -> first industrialized scale batch;
- source archives are never included in the commit set and acquisition manifests retain SHA-256 plus source identity;
- deterministic review rejects non-generic/forbidden records, missing required nutrient fields and gross macro/energy mismatch; no fuzzy semantic merge is introduced;
- deterministic review preserves eligible USDA replacements for salmon, cooked rice, zucchini and olive oil before the legacy retirement map is generated;
- the deterministic pilot generator produces exactly 120 unique candidates using only active `curated/high` ingredients;
- all six synthetic production pilot waves can close 120/120 accepted through the real Recipe Pipeline with zero unresolved references;
- the deterministic focused scale generator can feed a 125-candidate industrialized batch that reaches the 100-accepted target with zero review backlog under a clean production fixture;
- `--pilot-strict` fails closed when the real ingredient foundation is not ready;
- source/network unavailability is reported as a blocked execution prerequisite, never converted into a passing data gate.
