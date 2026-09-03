# Phase 1 Implementation Report

## Status

**Phase 1 — App shell: implemented and verified.**

Roadmap deliverables:

- PWA: complete.
- routing: complete.
- IndexedDB schema + repository layer: complete.
- catalog bootstrap JSON -> IndexedDB: complete.
- migration runner: complete for content schema V1 with resumable/idempotent markers ready for future migrations.
- backup/import: complete.
- i18n IT/EN: complete.
- theme engine: complete.

## Important decisions

1. The Phase 1 runtime uses native ES modules and browser APIs only. This avoids an unverified dependency chain and keeps the local-first static deployment model small.
2. JSON Schema contracts remain the authoritative validation source. A runtime validator resolves the existing cross-file schemas rather than duplicating catalog rules in importer code.
3. First catalog activation is write-last: `activeCatalogVersion` is set only after all shards and pack records pass validation and import.
4. An already-active catalog is used directly on reopen, including offline reopen. Catalog update discovery/atomic replacement remains Phase 3 responsibility.
5. Backup import never clears the base catalog. It replaces user/config/plan data atomically while merging custom catalog records over the currently active base catalog.
6. The Phase 1 catalog is explicitly a development fixture and is not production nutritional data.

## Verification

`npm run check` verifies:

- JavaScript syntax for application, scripts, tests and service worker;
- all 24 canonical example groups against the runtime JSON Schema validator;
- rejection of a non-canonical allergen ID;
- catalog checksum/schema/reference validation and activation flow;
- backup round-trip while preserving base catalog records;
- V1 store/index metadata;
- migration idempotence;
- semver comparison;
- i18n fallback;
- WCAG theme contrast logic;
- production static build to `dist/`;
- HTTP smoke test for `/`, `/recipes/?id=rec_salmon_rice` and catalog manifest delivery.

## Deliberate Phase 1 limitations

- Full configuration editing is Phase 2.
- Catalog update/updater and indexed search/query UI are Phase 3.
- The development catalog is intentionally tiny; corpus generation/curation is Phase 4.
- Plan generation starts in Phase 5.
- Today/calendar effective-plan editing starts in Phase 6.
- Shopping computation starts in Phase 7; only checklist persistence/backup contracts exist now.
