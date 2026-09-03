# Phase 3 Implementation Report

## Status

**Phase 3 — Catalog engine: implemented.**

Roadmap deliverables:

- ingredient JSON importer/updater: complete;
- recipe JSON importer/updater: complete;
- IndexedDB indexes/query layer: complete;
- search/filter: complete;
- dynamic recipe detail: complete;
- custom ingredient/recipe family + immutable revision/version records: complete.

## Important design decisions

1. **DB_VERSION is now 2.** The upgrade routine creates missing indexes on existing object stores instead of skipping existing stores, so Phase 1/2 data survives the structural upgrade.
2. **Catalog activation is separated from staging.** Immutable IngredientRevision/RecipeVersion records may be written before activation because they are not current until family pointers and pack membership switch. The final family/pack/meta change uses one repository transaction.
3. **Optional packs control visibility, not historical existence.** Uninstall marks a pack unavailable but does not delete RecipeVersion records. Search requires base RecipeVersion membership in at least one installed pack; historical IDs remain resolvable.
4. **Required packs are installed at first bootstrap; optional packs begin `available`.** This replaces the Phase 1 behavior that marked every manifest pack installed.
5. **Selective pack download required one contract amendment.** `CatalogManifest` shard descriptors now optionally expose `recordIds`; without this mapping a client cannot know which RecipeVersion shard contains a requested pack member without downloading all shards. Legacy manifests remain valid and fall back to full-shard loading.
6. **Catalog updates preserve the previous active version on failure.** New immutable content is validated/staged first; `activeCatalogVersion` and mutable family pointers change only after successful integrity checks.
7. **The query planner seeds from the most selective available IndexedDB candidate sets.** Text uses prefix ranges on multiEntry `searchTokens`; meal archetype, origin and numeric nutrition/practical filters use their dedicated indexes. Final candidate validation enforces current-family pointer, installed-pack membership and allergen exclusions.
8. **Personal authoring never mutates historical content.** Ingredient edits create IngredientRevision records; recipe edits create RecipeVersion records. Archive changes only the family status.
9. **Nutrition for user recipes is authoritative only when derived.** Recipe-line amount/unit is normalized via the referenced IngredientRevision basis/conversions. `calculatedNutrition` and allergen IDs are recomputed from those frozen revisions.
10. **Hashes now use canonical JSON key ordering.** This aligns checksum/content-digest behavior with `JSON_STORAGE_SPEC.md` rather than relying on object insertion order.
11. **Personal catalog transfer is separate from full backup.** It exports only user ingredient/recipe families and immutable content records and rejects collisions with base IDs or divergent immutable IDs.
12. **Catalog manifest fetching is network-first in the service worker.** Otherwise the Phase 1 cache-first `/data/` rule would make update discovery permanently stale after the first load.

## Phase 3 fixture

The development catalog was upgraded to `0.3.0-dev` and contains:

- four ingredient families/revisions;
- three recipe families/versions;
- required `core` pack;
- optional `quick`, `high_protein` and `vegetarian` packs.

It exists only to verify runtime behavior and is not intended as nutritional production content.

## Automated verification

The zero-dependency Node test suite covers Phase 1–2 regressions plus Phase 3 behavior:

- required-only pack bootstrap;
- optional pack state materialization;
- indexed text + numeric + pack recipe queries;
- pack install/uninstall without deleting immutable content;
- immutable personal ingredient revisioning;
- immutable personal recipe versioning;
- deterministic nutrition calculation and allergen derivation;
- personal catalog export/import and checksum tamper detection;
- failed catalog update preserves the prior active catalog;
- the real Phase 2 `0.1.0-dev` fixture upgrades to Phase 3 while preserving old immutable records byte-for-byte;
- successful update carries forward previously installed optional packs;
- all distributed Phase 3 optional-pack records validate when loaded;
- all canonical JSON Schema examples continue to validate;
- all Phase 1–2 backup/configuration/i18n/theme/migration regressions continue to pass.

## Validation result

- 29/29 tests pass.
- 41 JavaScript files pass syntax checking before the final documentation/build pass.
- Static production build succeeds.
- HTTP smoke checks are run against the built `dist/` bundle.

## Environment limitation

As in Phase 2, the managed Chromium environment blocks navigation to local HTTP origins by policy, so browser E2E cannot be executed here. Domain/integration tests, syntax checking, build validation and HTTP smoke tests are available. A manual or CI browser E2E pass remains appropriate before production release.

## Next coherent phase

Phase 4 — Recipe corpus:

- curate the production ingredient catalog;
- implement CorpusSnapshot/Policy scanner tooling;
- run the deterministic Recipe Corpus Orchestrator;
- generate adaptive RecipeGenerationJob batches;
- produce coverage/diversity/similarity reports;
- publish the initial 3,000–5,000 validated RecipeVersion corpus through the Phase 3 catalog format.
