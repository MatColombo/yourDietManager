# YourDietManager V1 Freeze Contract — Phase G content / Phase H handoff

## Current authority

The authoritative V1 **product/data freeze** remains the Phase G release-candidate consolidation implemented in `1.0.0-rc.34`.

Machine-readable freeze:

`corpus/production/v1-planner-release/freeze-contract.json`

Phase H is the authoritative **release handoff** over that freeze:

`corpus/production/v1-planner-release/phase-h-handoff.json`

The earlier rc.27 / 500-recipe freeze under `corpus/production/v1-release/` is historical evidence only and does not define the current release boundary.

## Frozen candidate boundary

The Phase G candidate freezes:

- catalog `1.2.0-planner-phase-d`;
- 600 IngredientFamily / 600 IngredientRevision records;
- 1,800 RecipeFamily / 1,800 fixed-serving RecipeVersion records;
- product-food taxonomy classification for all 600 ingredient revisions;
- DB v6;
- content schema v3;
- backup format v1;
- pre-V1 epoch `v1-planner-phase-d-epoch-1`;
- Phase F planner policy `phase-f-soft-objective-1`;
- hard daily energy tolerance and `servings=1` invariants;
- recipe/reference/catalog-content/quality evidence digests recorded in the machine contract;
- shell/data cache boundary v37/v17 for the frozen candidate.

Phase H does not change any of these frozen properties.

## Final acceptance

Final manual acceptance is stored separately in:

`corpus/production/v1-planner-release/manual-acceptance.json`

Stable promotion is allowed only after an exported Phase E report proves every required case is PASS with zero P0/P1 and the release operator supplies the exact explicit decision `ACCEPT V1`.

The accepted repository record must state:

- `status=accepted`;
- `stablePromotionAllowed=true`;
- `acceptedCandidateVersion=1.0.0-rc.34`;
- `acceptedAppVersion=1.0.0`;
- accepted catalog version equal to the Phase G frozen catalog;
- digest of the manual acceptance report used for the decision.

Development-tranche completion or provisional Phase E validity is not silently converted into final acceptance.

## Stable promotion boundary

Phase H defines stable promotion as metadata-only with respect to the frozen product/data contract.

The only allowed repository mutations are:

1. `package.json` -> application version `1.0.0`;
2. `src/db/constants.js` -> runtime version `1.0.0`;
3. `public/data/catalog-manifest.json` -> `production_release / releaseEligible=true` publication metadata over unchanged shards/content;
4. `corpus/production/v1-planner-release/manual-acceptance.json` -> explicit accepted decision evidence;
5. `corpus/production/v1-planner-release/stable-release-evidence.json` -> stable promotion evidence.

The controlled command is:

```bash
npm run v1:promote-stable -- --report <manual-acceptance-report.json> --decision "ACCEPT V1" --apply
```

Without `--apply` it is read-only. Before writing, it verifies that the projected stable state passes all ten release-gate checks and that the Phase G catalog-content/reference/recipe/planner-policy digests remain unchanged.

Stable promotion must **not** regenerate recipes, resize servings, change IDs, modify catalog shards, change DB/schema/backup format, change the pre-V1 epoch, alter the Phase F planner policy or bump/replace the frozen data cache.

After apply:

```bash
npm run check
npm run release:gate
```

must both pass. Only then may tag/release `v1.0.0` be created.

If a blocker requires any frozen product/data change, the Phase G freeze is invalidated and a new release-candidate validation cycle is required instead of using the Phase H promotion path.
