# Persistence and versioning

## Layers

```text
JSON catalog/reference-data shards -> Catalog Importer -> IndexedDB -> Repositories -> Domain/UI
IndexedDB -> Backup Engine -> portable JSON backup
```

Base catalog JSON is rebuildable. User data is authoritative in IndexedDB between explicit backups.

## Current database

The current V1 Data/UX Hardening Pass A runtime uses:

- `DB_VERSION=4`;
- `contentSchemaVersion=3`;
- **21 object stores**.

In addition to config, catalog, plan/history and shopping stores, persist canonical reference data in:

- `taxonomies` keyed by `taxonomyId`;
- `taxonomyTerms` keyed by `termId` with taxonomy/parent/status/origin/search indexes.

## Versions

Keep independent:

- IndexedDB `DB_VERSION` for store/index structure;
- record/content schema version;
- `catalogVersion`;
- `referenceDataVersion` + digest;
- backup format version;
- recipe/ingredient revision/version numbers.

## Migration

Use `onupgradeneeded` for store/index changes. Make long content migrations idempotent/resumable with markers. Never delete user stores as a migration shortcut.

`contentMigration:3` seeds/loads reference data, resolves legacy semantic strings exact/alias/manual/unresolved, blocks on unresolved values, creates new IngredientRevision/RecipeVersion rows rather than mutating historical ones, and migrates mutable configuration references atomically.

## Catalog update

Validate manifest compatibility, shard checksum, JSON schema, reference-data digest/hierarchy and semantic reference integrity before switching `activeCatalogVersion`. Stage reference data before ingredient/recipe records. If update fails, keep the previous catalog active. Retain historical versions/terms still referenced by plans or catalog history.

## Transactions

Use one logical transaction/service boundary for create-version + current pointer, bulk plan edits, undo/redo, backup import replace, reference-data activation and catalog activation.

## Store contracts

`catalogPacks` and `shoppingChecklists` are first-class persisted entities with dedicated JSON Schemas. Pack membership comes from the catalog manifest; checklist state is user data included in backup/export.

Backups also preserve user-created `customTaxonomies` and `customTaxonomyTerms`; base reference data remains rebuildable from catalog shards.
## Local override of bundled families

`origin=base` is provenance, not read-only state. On first edit of a bundled Ingredient/Recipe family:

1. keep the stable `ingredientId`/`recipeId`;
2. create a new immutable `IngredientRevision`/`RecipeVersion` with `origin=user`;
3. advance the family current pointer atomically;
4. promote the family to `origin=user` local management;
5. preserve every prior base/user immutable record.

Catalog update, rollback and pack install may stage new base immutable records but must not overwrite a family already under local management. Backup/custom-catalog import must allow a user family override to overlay a bundled family with the same stable ID while rejecting collisions on immutable revision/version IDs.

