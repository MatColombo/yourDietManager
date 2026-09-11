# V1 Planner Phase G — Release Candidate Consolidation

## Status

Phase G is implemented in app `1.0.0-rc.34` on catalog `1.2.0-planner-phase-d`.

The purpose of Phase G is to close the structural gap left after Planner Phases A–F: the running application had already moved to DB v6, 1,800 fixed-serving RecipeVersions, product-food taxonomy and the Phase F quality policy, while the old V1 freeze/release gate still described the superseded rc.27 / 500-recipe / DB v5 candidate.

Phase G does **not** change recipe content, recipe quantities, planner hard constraints, reference-data taxonomy, DB schema, pre-V1 data epoch or the data cache.

## Frozen baseline

The Phase G machine-readable freeze is `corpus/production/v1-planner-release/freeze-contract.json`.

It binds the release candidate to:

- app candidate `1.0.0-rc.34`;
- catalog `1.2.0-planner-phase-d`;
- DB v6 / content schema v3 / backup format v1;
- pre-V1 epoch `v1-planner-phase-d-epoch-1`;
- 600 active IngredientFamily / 600 IngredientRevision records;
- 1,800 active RecipeFamily / 1,800 RecipeVersion records;
- core pack containing all 1,800 recipes;
- all 600 ingredients classified in the product-food taxonomy;
- 18 product categories and 203 product-food terms;
- unchanged recipe digest `5e3bd7661171cff9434b03bb9951d58779ed84dc2e0e9910d36d1ebc517f53f2`;
- hard daily-energy enforcement and fixed `servings=1`;
- Phase F soft-objective policy `phase-f-soft-objective-1` and its quality evidence digest.

The catalog publication remains `development / releaseEligible=false` at freeze time. That is intentional: Phase G freezes the final **candidate content**, not the stable publication metadata.

## PWA/runtime change

Only the application shell advances for the new release infrastructure:

- shell cache: `ydm-shell-v37`;
- data cache: unchanged at `ydm-data-v17`;
- pre-V1 epoch: unchanged.

No destructive reset is introduced.

## Manual acceptance boundary

Phase E can be treated as provisionally valid for continued development, but Phase G does not fabricate a final release decision.

`corpus/production/v1-planner-release/manual-acceptance.json` remains fail-closed with:

- `status=pending`;
- `stablePromotionAllowed=false`.

A stable `1.0.0` release requires a separate explicit final `ACCEPT V1` record. Until then `npm run release:gate` must remain blocked.

## Gate and CI

Phase G adds:

- `npm run v1:planner-phase-g-freeze` — deterministically rebuilds the freeze/evidence from the current catalog and Phase F quality evidence;
- `npm run v1:planner-phase-g` — verifies the freeze, data/persistence contract, recipe/reference digests, Phase F quality floor, cache policy and fail-closed release boundary;
- Phase G in the normal `npm run check` chain;
- an updated `Verify V1 Planner Phase G` GitHub Actions workflow that rebuilds Phase B + Phase D data, regenerates the G freeze, drift-checks it, runs the full browser-required check and uploads the release-candidate evidence.

The old stable `release:gate` is replaced with a gate aligned to the Phase G baseline. It requires all of the following before it can pass:

1. app/runtime version exactly `1.0.0`;
2. explicit accepted manual-acceptance evidence;
3. catalog publication channel `production_release` with `releaseEligible=true`;
4. unchanged 600/1800 data contract;
5. unchanged DB v6 / schema v3 / backup v1 / pre-V1 epoch;
6. unchanged recipe, reference-data, catalog-content and Phase F policy digests.

## Exit criteria

Phase G is complete when:

1. the final candidate freeze is deterministic and drift-checkable;
2. the current 1,800-recipe/600-ingredient baseline replaces the stale 500-recipe release assumptions;
3. Phase F planner quality/hard constraints are explicitly inside the freeze boundary;
4. `npm run v1:planner-phase-g` is green;
5. the full `npm run check` remains green;
6. `npm run release:gate` is blocked for only the intentional pre-stable conditions, not stale rc.27/DB v5/500-recipe assumptions;
7. no catalog regeneration, serving scaling, DB migration or pre-V1 reset occurs.

Stable promotion is intentionally outside Phase G and requires the user's explicit final release acceptance.
