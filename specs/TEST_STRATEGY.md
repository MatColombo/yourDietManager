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
