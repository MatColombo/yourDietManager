# Changelog

## 1.0.0-rc.34 — V1 Planner Phase H final release handoff

- Closed the current development tranche without fabricating final V1 acceptance.
- Added deterministic Phase H handoff evidence chained to the Phase G freeze.
- Added fail-closed stable-promotion tooling requiring an eligible Phase E report, exact `ACCEPT V1`, and explicit `--apply`; default mode is read-only dry-run.
- Restricted stable promotion to five metadata/evidence paths and verified a synthetic stable projection passes the full 10-check release gate without changing frozen catalog content.
- Refactored the stable release-state evaluator for shared gate/projection logic.
- Made historical planner/Step 2 verification transition-safe so `npm run check` remains valid after the legal metadata-only promotion from rc.34 to `1.0.0`.
- Updated GitHub Actions to `Verify V1 Planner Phase H`, including Phase G/H evidence drift checks and explicit proof that pre-acceptance release remains blocked by only the three intentional conditions.

## 1.0.0-rc.34 — Planner Phase G release-candidate consolidation

- Froze the current 600-ingredient / 1,800 fixed-serving recipe baseline with recipe, reference-data, catalog-content and Phase F quality digests.
- Replaced stale rc.27 / 500-recipe / DB v5 release-gate assumptions with the current DB v6 / Phase D catalog / Phase F policy contract.
- Added deterministic `v1:planner-phase-g-freeze` and `v1:planner-phase-g` gates and wired Phase G into the full check/CI workflow.
- Kept catalog content, product-food taxonomy, pre-V1 data epoch and data cache unchanged; shell cache advances to v37.
- Stable promotion remains fail-closed until explicit final `ACCEPT V1` evidence and a production-release manifest exist.

## 1.0.0-rc.33 — Planner Phase F quality tuning

- Corrected slot-option soft-objective composition so preference and variety are no longer attenuated to 15%.
- Strengthened short-window exact-recipe repetition penalties while keeping variety strictly soft.
- Added explicit `phase-f-soft-objective-1` policy constants and planner quality metrics.
- Planner Lab now exposes recipe uniqueness and 3/7-day repetition metrics.
- Added Phase F quality gate with real 2600-kcal/14-day and soft-direction acceptance checks.
- Catalog, DB, pre-V1 epoch and data cache remain unchanged; shell cache bumped to v36.

## 1.0.0-rc.31 — Planner Phase D3–D5

- Added one shared hierarchical `product_food` picker for preferences/safety/MealClass rules and ingredient authoring.
- Added faceted ingredient discovery by product taxonomy and technical state.
- Added faceted recipe discovery by product taxonomy, diet, practical tag and existing nutrition/meal filters.
- Added direct contextual `Day -> Recipe -> exact IngredientRevision` navigation with return to the exact meal slot.
- New preference rules default to user-level `productFood` rather than source-oriented `foodCategory`.
- Catalog/DB/data epoch remain unchanged; shell cache bumped to v34 only.
- Added D3–D5 functional/policy gates and real-Chromium acceptance for taxonomy filters and contextual drill-down.

## 1.0.0-rc.30 — Planner Phase D1+D2

- Split date regeneration into explicit **Recalculate** and **Propose alternative** semantics.
- Alternative mode uses strict current-recipe exclusion first, then an honest bounded-search fallback with retention diagnostics.
- Added hierarchical `product_food` taxonomy: 18 categories / 203 terms, classified on all 600 IngredientRevision records.
- Added explicit `Dairy / Latticini` category and grouped 11 noodle technical variants under one Noodles concept.
- Added `productFood` targets to preferences, allergy/intolerance and MealClass categorical rules.
- Bumped DB to v6, pre-V1 epoch to `v1-planner-phase-d-epoch-1`, shell/data caches to v33/v17.
- Recipe corpus remains 1,800 fixed-serving RecipeVersion records with unchanged recipe digest; serving scaling remains forbidden.

## [Planner Validation Phase C] - 2026-09-08

### Added

- observation-only `/planner-validation` laboratory with one-case, determinism and 800–2600 sweep controls;
- per-slot source/hard/frontier/option counts, energy ranges, hard rejection reasons and soft ranking diagnostics;
- reproducible hard/soft/negative stress profiles and diagnostic JSON export;
- dedicated Phase C gate and real-browser lab smoke.

### Fixed

- runtime archetype retrieval no longer truncates the 1,800-recipe Phase B corpus at 250 candidates;
- safety candidates are rejected in the canonical hard filter instead of disappearing before diagnostics;
- manual stress experiments are isolated from active-plan history and never persist generated plans.

### Validation status

- implementation is ready for user-led manual validation; stable V1 promotion remains suspended until explicit Phase C acceptance.

## [Planner Validation Phase B] - 2026-09-07

### Changed

- planner-validation catalog expanded from 500 to 1,800 fixed-portion recipes across 31 explicit energy bands;
- effective ingredient use expanded from 141 generator ingredients to 302 distinct vetted ingredients;
- app advanced to `1.0.0-rc.28`, pre-v1 epoch to `v1-planner-phase-b-epoch-1`, and PWA caches to shell v31/data v16;
- browser acceptance now derives expected recipe count/catalog version from the built manifest;
- manual corpus verification workflow now rebuilds and drift-checks Phase B instead of the suspended 500-recipe freeze.

### Added

- explicit Phase B culinary-role classifier and fixed-template recipe generator;
- 1,800-recipe Phase B build/publication evidence;
- Phase B gate and 800–2600 all-feasible validation requirement.

### Invariant

- no serving scaling and no ingredient-amount fitting to a requested calorie target.

## [Planner Validation Phase A] - 2026-09-07

### Changed

- daily calorie tolerance is now a hard day-level constraint for generation, replacement and rebalance;
- planner search preserves energy-diverse candidates/options before soft ranking and uses remaining-energy bounds;
- hard/soft constraint semantics are machine-readable and documented for manual validation;
- planned recipe components remain fixed at `servings=1`; no serving scaling was introduced;
- DayClass cooking/simple-snack capabilities and numeric `forbid` rules are now enforced correctly;
- planned slots can no longer carry the external-only `proteinMinG` guidance field;
- PWA shell/data caches bumped to v30/v15 for the planner-validation build.

### Added

- 800–2600 kcal feasibility baseline audit across ±2%, ±5% and ±10%;
- manual-visible daily hard-energy status and classified `NO_FEASIBLE_PLAN` energy diagnostics.

## [1.0.0-rc.27] - 2026-09-07

Final V1 release candidate. Stable `v1.0.0` is intentionally pending the final manual product acceptance.

### Added

- deterministic V1 500-recipe corpus generated from explicit culinary-role eligibility and portion bounds;
- 60-recipe / 12-strata release review evidence;
- machine-readable V1 freeze contract and Step 3 release-candidate gate;
- destructive local-data deletion from Backup, with public PWA caches preserved by default;
- dedicated GitHub Actions workflow to reproduce and verify the frozen V1 candidate;
- final manual acceptance checklist.

### Fixed

- replacement commit now validates the selected recipe against hard constraints instead of a second seed-dependent top-20 ranking;
- pre-freeze recipe generation no longer treats food taxonomy membership as sufficient culinary eligibility;
- PWA/offline data cache version parity.

### Changed

- catalog frozen at `1.0.0` with 600 ingredient families/revisions and 500 recipe families/versions;
- previous pre-freeze corpus writer workflows retired from active GitHub Actions;
- stable release gate now reflects the 500-recipe V1 contract and requires explicit manual acceptance.

### Stable promotion rule

After acceptance, promote only the application version to `1.0.0`, record acceptance, run the stable gate and tag `v1.0.0`. Do not regenerate the catalog or change schema/ID/data epoch during promotion.

## 1.0.0-rc.32 — Phase E manual product acceptance harness

- Added `/manual-acceptance` with 18 required human validation scenarios across 800–2600 kcal, hard/soft constraints, regeneration, taxonomy/discovery, contextual navigation, plan operations and reload persistence.
- Added P0/P1/P2 finding capture, local evidence notes and JSON export.
- Acceptance eligibility requires every required case PASS and zero P0/P1; the harness cannot promote a stable release automatically.
- Kept planner, 1,800-recipe corpus, catalog `1.2.0-planner-phase-d`, DB v6, data epoch and data cache unchanged.
- Bumped shell cache to v35 for the new validation UI.
