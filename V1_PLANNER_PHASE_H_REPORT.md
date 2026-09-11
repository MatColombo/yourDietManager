# V1 Planner Phase H — Final Release Handoff

## Status

Phase H is implemented on the frozen application candidate `1.0.0-rc.34` and catalog `1.2.0-planner-phase-d`.

Phase H closes the current development tranche. It does not create a stable release and does not infer final acceptance from development completion. The Phase G content freeze remains authoritative for recipes, ingredients, taxonomy, persistence and planner policy; Phase H adds the release-operator boundary needed to move that exact frozen candidate to stable only after an explicit user decision.

No application runtime feature, catalog shard, RecipeVersion, IngredientRevision, DB schema, backup format, pre-V1 epoch, planner policy, shell cache or data cache is changed by Phase H.

## Release handoff evidence

The machine-readable handoff is:

`corpus/production/v1-planner-release/phase-h-handoff.json`

It records:

- Phase H status `development_tranche_complete`;
- frozen candidate `1.0.0-rc.34` and stable target `1.0.0`;
- parent Phase G freeze digest and all frozen content/policy digests;
- the three intentional pre-stable blockers still present on the candidate;
- the exact manual decision token `ACCEPT V1`;
- the required manual acceptance report;
- the only five paths that stable promotion may modify;
- a synthetic promotion-path validation proving that the stable projection can satisfy all ten release-gate checks without changing frozen product/data content.

The synthetic validation is explicitly non-authoritative and never records user acceptance.

## Stable promotion tooling

Phase H adds:

`npm run v1:promote-stable`

The command is fail-closed. It requires both:

1. a Phase E exported manual acceptance report in which every required case is PASS and P0/P1 are zero;
2. the exact operator decision token `ACCEPT V1`.

Without `--apply`, the command is a dry-run and writes nothing. A real promotion therefore requires an explicit command equivalent to:

```bash
npm run v1:promote-stable -- --report <manual-acceptance-report.json> --decision "ACCEPT V1" --apply
```

The promotion is metadata-only. The only permitted mutations are:

- `package.json` -> app version `1.0.0`;
- `src/db/constants.js` -> runtime version `1.0.0`;
- `public/data/catalog-manifest.json` -> `production_release / releaseEligible=true` publication metadata;
- `corpus/production/v1-planner-release/manual-acceptance.json` -> accepted final decision evidence;
- creation of `corpus/production/v1-planner-release/stable-release-evidence.json`.

Recipe/ingredient content, catalog shards, DB/schema/backup versions, the pre-V1 epoch, Phase F policy and data cache are forbidden promotion mutations.

## Stable-compatible verification

Before Phase H, several historical phase gates required the literal RC version and would fail after a valid metadata-only promotion. Phase H updates those verification boundaries so the same frozen implementation can be checked in either of its two legitimate release states:

- candidate: `1.0.0-rc.34`, development publication, final acceptance pending;
- stable: `1.0.0`, production publication, final acceptance accepted.

This change does not relax product/data invariants. The Phase G freeze still binds the original tested candidate and the same catalog/planner digests.

After an actual stable promotion, the required verification is:

```bash
npm run check
npm run release:gate
```

Both must be green before a `v1.0.0` tag/release is created.

## Gate and CI

Phase H adds:

- `npm run v1:planner-phase-h-handoff` — deterministic rebuild of the handoff evidence;
- `npm run v1:planner-phase-h` — Phase H tests plus final handoff gate;
- `npm run v1:promote-stable` — dry-run/apply stable promotion tooling;
- `npm run v1:stable-verify` — full stable verification (`check` + `release:gate`);
- Phase H in the normal `npm run check` chain;
- `Verify V1 Planner Phase H` GitHub Actions workflow, which rebuilds Phase B/D, regenerates Phase G freeze and Phase H handoff, drift-checks them, runs browser-required verification, and proves that the pre-acceptance stable gate is blocked only by the three intentional conditions.

## Current release state

At Phase H completion the candidate intentionally remains:

- app `1.0.0-rc.34`;
- catalog publication `development / releaseEligible=false`;
- manual acceptance `pending / stablePromotionAllowed=false`;
- stable release gate `BLOCKED 7/10`.

The only blockers are:

1. `stable-app-version`;
2. `manual-acceptance`;
3. `production-release-publication`.

That is the correct end state for development-tranche closure. Phase H does not fabricate the final human release decision.

## Exit criteria

Phase H is complete when:

1. the Phase G frozen data/planner contract is unchanged;
2. development completion and final release acceptance are separate states;
3. stable promotion requires an explicit `ACCEPT V1` plus an eligible Phase E report;
4. dry-run is read-only and projected stable promotion passes all release-gate checks;
5. stable promotion is restricted to the five declared metadata/evidence paths;
6. the full verification chain is compatible with both rc.34 and its metadata-only `1.0.0` promotion;
7. CI rebuilds/drift-checks Phase G + H evidence and keeps stable release fail-closed before acceptance;
8. no stable tag is authorized until real manual acceptance is supplied and post-promotion `npm run check` plus `npm run release:gate` are green.
