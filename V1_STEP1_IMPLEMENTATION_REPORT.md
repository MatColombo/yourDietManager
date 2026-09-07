# yourDietManager — V1 Step 1 Implementation Report

**Step:** 1 — Pre-V1 Reset + Data/Catalog Closure
**Baseline:** `5cc6491`
**Candidate app:** `1.0.0-rc.25`
**Candidate catalog:** `1.0.1-v1-candidate-500`
**Status:** implementation complete; mandatory GitHub browser acceptance runs on push

## Decision applied

All data produced before the first public `v1.0.0` release is disposable. The runtime no longer attempts to preserve RC/dev content across the new pre-V1 data epoch.

Compatibility guarantees start only after `v1.0.0`.

## Runtime reset

Added `PRE_V1_DATA_EPOCH = v1-candidate-epoch-1`.

On the first start with a missing or different epoch the application now:

1. loads and validates bundled canonical reference data;
2. atomically clears every IndexedDB application store;
3. seeds canonical taxonomies and taxonomy terms;
4. records the current epoch and reset metadata;
5. removes `ydm:*` localStorage bootstrap state;
6. removes old `ydm-shell-*` and `ydm-data-*` browser caches;
7. bootstraps the current configuration and catalog from scratch.

The runtime entry point no longer runs legacy content migrations before bootstrap. Migration code remains in the repository for historical tests/reference but is not the pre-V1 startup strategy.

## Catalog closure

The V1 candidate publisher now publishes only records reachable from the active candidate corpus.

Canonical publication contains:

- 600 active `IngredientFamily` records;
- 600 reachable `IngredientRevision` records;
- 500 active `RecipeFamily` records;
- 500 current `RecipeVersion` records;
- `core` pack containing all 500 recipe versions;
- optional packs as strict subsets of `core`;
- zero dangling ingredient/revision references;
- zero orphan revisions.

Removed from the published catalog:

- `ingrev_salmon_raw_v2`
- `ingrev_rice_cooked_v2`
- `ingrev_zucchini_raw_v2`
- `ingrev_olive_oil_v2`

These four records remain irrelevant historical development fixtures in the source working bundle but are no longer part of the runtime catalog.

## Human review gate

The 500-recipe candidate is no longer published as a `production_review` catalog.

Publication metadata is now:

- channel: `development`;
- `requiredHumanReview: false`;
- `reviewRecipeCount: 0`;
- `releaseEligible: false`.

This removes the 500/500 Human Review Gate from the path to testing planner/engine/product behavior. Human review tooling remains available in the codebase but is not active for the V1 candidate catalog.

## CI / release-speed changes

The main `npm run check` path no longer executes the historical Phase 4 production-growth control plane before every Pages deploy.

It now prioritizes product/release checks:

- V1 Step 1 catalog gate;
- planner smoke;
- lint;
- complete automated test suite;
- accessibility/form hardening;
- build;
- browser acceptance;
- revision closure;
- Pages audit.

Corpus growth workflows remain available but are not blockers for the 500-recipe V1 candidate.

## Browser acceptance added

The browser regression now seeds a stale pre-V1 state before application bootstrap:

- old epoch;
- `activeCatalogVersion = 0.3.0-dev`;
- legacy `ingrev_salmon_raw_v2` record;
- legacy `ydm:*` localStorage entry;
- legacy `ydm-data-v12-root` cache.

After startup it verifies:

- current epoch is active;
- legacy ingredient revision is gone;
- legacy localStorage is gone;
- legacy cache is gone;
- active catalog is `1.0.1-v1-candidate-500`;
- Recipe Catalog reports 500 recipes;
- recipe detail opens;
- recipe Edit opens;
- ingredient detail and Edit open.

GitHub Pages CI requires a real Chrome/Chromium run via `YDM_BROWSER_REQUIRED=1`.

## Verification performed

Local deterministic checks completed:

- `v1:step1-gate`: **PASS 14/14**
- automated test suite: **PASS 182/182**
- lint: **PASS**
- root static build: **PASS**
- GitHub Pages build with `/yourDietManager/`: **PASS**
- Pages artifact audit: **PASS**

The current execution container cannot complete Chromium localhost navigation, so the mandatory real-browser acceptance is delegated to the existing GitHub Pages workflow after push. CI is configured to fail the deployment if that browser pass fails.

## Step 1 exit state

The data/catalog compatibility problem is no longer a release blocker.

The next work item is **Step 2 — Vertical Product / Engine Acceptance**. No additional corpus scaling or compatibility work should be started before the planner → effective plan → editing → shopping flow is accepted end to end.
