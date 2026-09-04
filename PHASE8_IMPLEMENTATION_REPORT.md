# Phase 8 Implementation Report — Hardening & V1 Release Gate

## Status

**Phase 8 implementation: COMPLETE**

**V1.0 final release: BLOCKED by the pre-existing Phase 4 production-data gate.**

Candidate application version: `1.0.0-rc.1`.

The Phase 8 hardening gate is green. The final release gate intentionally refuses to label this build `1.0.0` while the bundled catalog is still the Phase 3/4 development fixture rather than the required curated production corpus.

## Scope completed

Phase 8 implements the roadmap hardening work for:

- 10,000 RecipeVersion catalog scale;
- bounded catalog browsing and candidate loading;
- bounded operation-history reads;
- accessibility hardening;
- offline catalog-pack caching;
- IndexedDB structural/content migration stress and recovery;
- catalog update journaling, recovery and rollback;
- runtime storage/integrity metrics;
- final release gating.

## 1. 10k catalog scale

### Catalog query boundedness

The default catalog path no longer materializes every RecipeVersion. For unfiltered browsing it resolves the active pack IDs, slices the requested page and loads only that page with `getMany`.

`CatalogQuery.lastQueryDiagnostics` records the selected strategy:

- `bounded-id-page`;
- `bounded-id-scan`;
- `indexed-intersection`.

The query API caps page size at 100. Non-indexable fallback filtering operates in bounded chunks rather than loading the entire catalog into the UI path.

### Operation history boundedness

Operation history now keeps an incremental per-plan pointer in `meta`:

- `maxSequence`;
- `headOperationId`;
- `redoStack`.

New operations link to `previousActiveOperationId`. Normal commit, undo and redo therefore avoid rereading the complete operation log. Recent-history UI reads use a descending indexed cursor page.

### Benchmark result

`npm run hardening:scale` generates 10,000 RecipeVersion records and 10,000 operations.

Latest diagnostic run in the supplied environment:

- unfiltered catalog page of 50: ~9.47 ms;
- indexed/filtered page of 50: ~76.91 ms;
- recent 100 operations: ~15.93 ms;
- RecipeVersion full-store `getAll` calls on unfiltered browse: **0**;
- maximum unfiltered `getMany`: **50**;
- operation-history cursor page calls: **1**.

Timings are diagnostic Node/in-memory numbers, not cross-device browser SLAs. The release invariant is bounded work and bounded materialization.

## 2. IndexedDB hardening

Current runtime persistence versions:

- `DB_VERSION = 3`;
- `CONTENT_SCHEMA_VERSION = 2`.

DB v3 adds the compound `originAndCatalogVersion` index to immutable ingredient/recipe revision stores without removing or rewriting user stores.

Content migration 2 is:

- idempotent;
- resumable after interruption;
- status-tracked in `meta`;
- backward compatible with existing Phase 1–7 data.

It also reconstructs operation-history pointers for older installations and adds the shopping people multiplier default only when absent.

## 3. Catalog update recovery and rollback

Catalog updates now maintain explicit journal/recovery metadata.

Before the atomic catalog switch, the updater captures enough previous mutable state to restore:

- base family pointers;
- catalog-pack state;
- previous manifest/version.

If staging fails, the old active catalog remains active. Recovery marks an interrupted/failed journal as recovered rather than pretending the new catalog succeeded.

Rollback restores previous family pointers and pack state atomically. New immutable IngredientRevision/RecipeVersion records staged by the newer release are deliberately retained because historical plans may reference immutable IDs; newly introduced families are retired instead of hard-deleted.

## 4. Offline catalog packs

Phase 8 computes the concrete shard URLs needed by a selected pack and caches them through the service worker. If the page is not yet controlled by the service worker, first-install caching falls back to the Cache API directly.

The service worker now:

- uses versioned shell/data caches;
- accepts only same-origin `/data/` and `/schemas/` cache requests;
- caches manifest/shards for offline pack operation;
- provides SPA navigation fallback offline;
- removes obsolete cache namespaces during activation.

IndexedDB remains the application database; Cache Storage is only the offline transport/cache layer.

## 5. Storage and integrity metrics

Runtime metrics persisted in `meta` include:

- active catalog version;
- per-store record counts;
- catalog import duration;
- approximate storage usage/quota where supported;
- last successful integrity check.

Catalog import/update paths perform storage estimation before large operations where available.

## 6. Accessibility hardening

Phase 8 adds:

- skip link;
- explicit main/navigation landmarks;
- `aria-current` for active navigation;
- localized navigation/progress labels;
- route-heading focus management;
- document-title updates;
- minimum 44 px interactive targets;
- keyboard-visible focus states;
- `prefers-reduced-motion` handling;
- forced-colors support;
- safe text rendering without `innerHTML`.

`npm run hardening:a11y` currently passes **16/16 source/static gates**.

This source audit does not replace manual assistive-technology/browser acceptance on target devices.

## 7. Verification

Latest full `npm run check` result:

- Phase 4 corpus smoke: PASS;
- Phase 5 planner smoke: PASS;
- JavaScript syntax check: **80 files PASS**;
- automated tests: **77/77 PASS**;
- accessibility hardening audit: **16/16 PASS**;
- 10k scale benchmark: PASS;
- production build: PASS.

Static-build HTTP smoke passes for `/`, SPA recipe/shopping routes, the Phase 8 offline/storage modules, the IT locale and the service worker. IT/EN locale catalogs contain **522 keys each** with exact key parity, and every static path referenced by the service worker resolves in the build.

The prior environment limitation still applies to managed-browser E2E against local HTTP; the source/static accessibility audit therefore does not claim assistive-technology E2E coverage.

## 8. Final V1 release gate

`npm run release:gate` is deliberately separate from `npm run check`.

Current result: **BLOCKED — 1/5 release checks pass**.

Passing:

- application/package version synchronization.

Blocking:

1. production recipe corpus minimum: 3 RecipeVersion records present, required >= 3,000;
2. production pipeline: bundled manifest still reports `phase3-fixture`;
3. ingredient provenance: 4 base ingredient revisions are not `curated/high`;
4. catalog version: current catalog is `0.3.0-dev`.

These are the known Phase 4 production-data deliverables, not Phase 8 implementation defects.

The release gate writes `reports/v1-release-gate.json` and exits non-zero while any blocker remains.

## 9. Release decision

Do **not** rename this build to `1.0.0` yet.

The correct state is:

- Phases 0–3: complete;
- Phase 4 engine/toolchain: complete;
- Phase 4 production corpus: incomplete;
- Phases 5–8 implementation: complete;
- V1 hardening candidate: `1.0.0-rc.1`;
- V1.0 production release: blocked until the Phase 4 corpus gate is satisfied and the full acceptance suite is rerun against it.

Once the curated production catalog is published, rerun:

```bash
npm run check
npm run release:gate
```

Only a green release gate should be promoted from `1.0.0-rc.1` to `1.0.0`.

## Post-RC release-gate amendment

Before `1.0.0`, the Phase 4 production-data gate also requires the reference-data hardening pass: zero unresolved legacy semantic strings, canonical taxonomy IDs for engine-consumed classifications, and audited pipeline creation of any required extensible taxonomy terms/supporting ingredients. The release remains blocked until this is validated together with the existing 3,000+ corpus/provenance requirements.

