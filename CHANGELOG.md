# Changelog

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
