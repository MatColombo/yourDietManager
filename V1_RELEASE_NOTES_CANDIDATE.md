# yourDietManager 1.0.0-rc.34 — Phase H Final Development Candidate

This package is the completed development-tranche handoff for the frozen V1 planner candidate.

## Included baseline

- local-first PWA with configuration, Today/Calendar, plan generation and persisted editing;
- hard daily energy tolerance with classified bounded-search failure;
- hard allergy/intolerance, auto-exclusion, MealClass forbid and DayClass capability enforcement;
- 1,800 fixed-serving RecipeVersions backed by 600 ingredient revisions;
- product-food taxonomy with 18 categories / 203 terms and all 600 ingredients classified;
- hierarchical preference/safety/catalog discovery controls;
- direct Day -> Recipe -> Ingredient contextual navigation;
- explicit Recalculate vs Propose alternative semantics;
- Replace/Rebalance/undo/redo/adherence flows;
- shopping derivation and persistent checklist;
- Planner Lab and Phase E manual acceptance harness;
- Phase F variety/preference/nutrition quality tuning;
- deterministic Phase G content freeze;
- Phase H fail-closed stable-promotion handoff and stable-compatible verification.

## Frozen data and planner contract

The authoritative content freeze remains Phase G, catalog `1.2.0-planner-phase-d`, with 600/600 ingredients and 1,800/1,800 recipes.

The recipe digest remains:

`5e3bd7661171cff9434b03bb9951d58779ed84dc2e0e9910d36d1ebc517f53f2`

Recipe serving scaling remains forbidden. Hard daily-energy validity remains mandatory. DB v6, content schema v3, backup format v1, shell/data caches v37/v17 and pre-V1 epoch `v1-planner-phase-d-epoch-1` remain unchanged.

## Phase H release boundary

Phase H does not promote the application automatically. It adds a deterministic handoff and an explicit promotion command that requires:

- an exported eligible Phase E manual acceptance report;
- the exact decision token `ACCEPT V1`;
- explicit `--apply` for repository mutation.

A dry-run projects the stable `1.0.0 / production_release` state and requires all release-gate checks to pass while preserving the Phase G catalog-content digest.

The only permitted stable-promotion mutations are package/runtime version, catalog publication metadata, final acceptance evidence and stable-release evidence. Recipe/ingredient shards, DB/schema/backup versions, pre-V1 epoch, planner policy and data cache are immutable across the promotion.

## Current release status

This package remains **`1.0.0-rc.34`**, not stable V1.

At handoff:

- manual acceptance is `pending`;
- catalog publication is `development / releaseEligible=false`;
- `npm run release:gate` is expected to report **BLOCKED 7/10**;
- the only blockers are stable app version, final manual acceptance and production-release publication.

This is intentional. Development completion is not treated as release acceptance.

## Verification

The release-candidate workflow is `.github/workflows/v1-release-candidate.yml`, now named `Verify V1 Planner Phase H`. It rebuilds Phase B/D data, regenerates and drift-checks the Phase G freeze and Phase H handoff, runs the complete browser-required verification, and verifies the intentional pre-acceptance release blockers.

Use `V1_FINAL_TEST_CHECKLIST.md` for the final user decision. After a real promotion, run:

```bash
npm run check
npm run release:gate
```

Both must pass before creating tag/release `v1.0.0`.
