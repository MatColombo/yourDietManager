# Changelog

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
