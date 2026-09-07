# Phase 4P-D Pass A — Controlled Scale 220 -> 500 — rc.21

Status: **IMPLEMENTED AND VERIFIED AGAINST THE REAL SOURCE-BACKED WORKING SET**.

## Input evidence

The implementation was verified against the successful GitHub Actions artifact supplied from the production-corpus workflow:

- artifact: `production-corpus-working-set-10.zip`
- SHA-256: `7d81cab17921cd576e998423fed1d38ae26fbdc836d18feee8ce5433dc37bee1`
- active production-ready ingredients: 600
- pilot: 120/120 accepted, 0 rejected, zero unresolved reference requests/proposals
- active recipes before 4P-D Pass A: 220
- Scale Gate 500 before controlled scale: `ready`

The final `production/current-working-bundle.json` is the source of truth. Intermediate readiness snapshots generated earlier in the source-backed workflow are not used as the 4P-D baseline.

## Controlled plan

`controlled-scale-500-v1@1.0.0` bridges exactly 220 -> 500 as three independently checkpointed tranches:

1. 100 accepted breakfast/snack recipes: 220 -> 320;
2. 100 accepted lunch/dinner recipes: 320 -> 420;
3. 80 accepted balanced-close recipes: 420 -> 500.

Each cell freezes one canonical `mealArchetype` and one canonical energy-band ID. No free-text or implicit semantic target is introduced. The runner refuses an ambiguous partial resume: tranche 1 requires exactly 220 active recipes, tranche 2 exactly 320, and tranche 3 exactly 420.

## Real execution result

| Tranche | Accepted | Rejected oversample | Review backlog | Active after | Gate |
|---|---:|---:|---:|---:|---|
| breakfast/snack | 100 | 28 | 0 | 320 | ready |
| lunch/dinner | 100 | 30 | 0 | 420 | ready |
| balanced close | 80 | 22 | 0 | 500 | pass |

Final 500-recipe snapshot:

- schema errors: 0
- unknown ingredient references: 0
- nutrition errors: 0
- allergen derivation errors: 0
- missing required locale fields: 0
- exact duplicates: 0
- near duplicates: 0
- hard coverage blockers: 0
- Scale Gate 500: `pass`

Final locally verified working-bundle SHA-256: `dba7764f3c80b17da28be50c589795f2c2e901ade7cbae3aa9b4d16963db1448`.

Rejected oversample candidates are terminal hard rejects such as `target_already_reached` or bounded diversity rejects; they are not review backlog and do not enter the active corpus.

## Execution controls added in rc.21

- `schemas/controlled-scale-plan.schema.json`
- `corpus/production/v1-controlled-scale-500-plan.json`
- `src/corpus/controlledScale.js`
- `generateControlledScaleCandidates()` with explicit meal-specific canonical profile registries
- `npm run corpus:scale-to-500`
- `npm run corpus:4pd`
- `.github/workflows/controlled-scale-500.yml`

The GitHub runner executes the three tranches as separate steps and writes a checkpoint after each. Canonical evidence is cumulative across split invocations instead of being overwritten by the latest tranche.

Freshness verification still compares the exact canonical corpus content digest. rc.21 computes that digest directly from active RecipeVersion content hashes plus IngredientRevision content hashes instead of performing a redundant full coverage/similarity scan before every cell.

## Release boundary

Scale Gate 500 passing is a Phase 4 controlled-scale milestone, not V1 production readiness. The production corpus remains blocked until at least 3,000 accepted recipes and final `productionCorpus` manifest traceability/publication requirements are satisfied.

Next milestone after the committed 500-recipe checkpoint: **4P-D Pass B — controlled scale 500 -> 1500**, preceded by a 500-recipe distribution/concentration checkpoint rather than a blind bulk expansion.

## rc.21 verification

Final release-candidate verification after the public-schema mirror fix:

- full Node test suite: 166/166 PASS;
- JavaScript syntax/lint inventory: 138 files PASS;
- 4P-D control plane: 10/10 PASS;
- accessibility gate: 16/16 PASS;
- forms, scale benchmark, build, Pass E closure and Pages root audit: PASS;
- GitHub Pages project-base audit (`/yourDietManager`): PASS;
- post-mutation CI simulation: 166/166 tests PASS after canonical 220 -> 320 -> 420 -> 500 execution;
- browser regression: Chromium launches, but localhost navigation remains SKIPPED only in the restricted local sandbox environment.

The controlled-scale workflow intentionally requires the source-backed 220-recipe `corpus/production/current-working-bundle.json` already committed by the successful production-corpus workflow. It does not recreate USDA ingestion or the 120-recipe pilot.
