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

- onboarding;
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
