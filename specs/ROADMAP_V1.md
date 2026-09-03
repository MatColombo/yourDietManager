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
