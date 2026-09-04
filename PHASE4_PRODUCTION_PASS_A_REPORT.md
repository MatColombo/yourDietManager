# Phase 4 Production Corpus — Pass A Report

## Status

**4P-A Production Contract & Pilot Pipeline: IMPLEMENTED.**

This pass implements the production-data control plane. It does **not** claim that the production corpus is ready to generate or release.

Candidate app version: `1.0.0-rc.10`.

## Decisions frozen

- Production corpus contract: `ydm-v1-production-corpus@1.0.0`.
- Corpus policy: `corpus-policy-v1-default@1.1.0`.
- Production pipeline: `recipe-pipeline-2-production-intake`.
- Recipe target: 3,000 minimum / 4,000 target / 5,000 maximum.
- Ingredient target: 400 minimum / 600 target / 800 maximum active production-ready families.
- Pilot: 120 candidate slots, 12 strata, waves of 20.
- Production ingredient quality: current revision must be `curated/high`.
- Production recipe candidate may enter deterministic processing only from intake state `ready_for_generation` with complete reference scan and zero unresolved requests.

## Implemented artifacts

### Contracts and schemas

- `specs/PRODUCTION_CORPUS_CONTRACT.md`
- `corpus/contracts/v1-production.json`
- `schemas/production-corpus-contract.schema.json`
- `schemas/production-corpus-intake.schema.json`
- `schemas/production-corpus-readiness-report.schema.json`

The runtime/public schema mirror is updated under `public/schemas/`.

### Production intake lifecycle

`ProductionCorpusIntake` records use explicit states:

`discovered -> needs_reference_review / needs_ingredient_review -> ready_for_generation -> generated -> accepted | rejected`

A separate `referenceScanStatus` prevents an empty request list from being interpreted as “nothing missing” until the operator/agent explicitly completes the reference scan.

### Reference-data proposal lifecycle

`src/corpus/productionCorpus.js` implements:

- canonical reuse of existing taxonomy IDs from ID/label/alias;
- proposal creation only for active taxonomies extensible by `editorial_pipeline`;
- collision status `needs_review` rather than heuristic selection;
- explicit approval prerequisite for materialization;
- schema/reference validation after materialization;
- recalculated reference-data digest;
- production ingredient resolution that remains blocked when the matched current revision is not production-ready.

### Production planner hardening

When a production contract is supplied, `planNextBatch`:

- binds the job to contract ID/version/digest;
- uses `recipe-pipeline-2-production-intake`;
- filters allowed ingredients to those satisfying the production ingredient readiness contract;
- returns `blocked / no_feasible_batch_intent` rather than using draft/low-confidence fixtures.

The normal `corpus:plan` CLI automatically loads the production contract for non-dev/non-smoke/non-fixture target catalog versions.

### Production processing gate

New command:

`npm run corpus:production-process -- ...`

It verifies contract, job, intake and reference snapshot parity before calling the deterministic Recipe Pipeline. A candidate cannot be processed if:

- it is absent from the intake ledger;
- reference scan is pending;
- state is not `ready_for_generation`;
- any reference request remains unresolved;
- job/intake/catalog reference version or digest differ;
- pipeline version differs from the production contract.

Accepted RecipeVersion records carry:

- `generation.candidateId`;
- `generation.intakeId`;
- `generation.productionContractId`;
- `generation.productionContractVersion`.

### Production publication traceability

`CatalogManifest` can now carry `productionCorpus` contract/policy metadata. Production publication validates current RecipeVersion intake provenance and uses the production pipeline version. The V1 release gate requires contract traceability and the exact production pipeline version.

## Pilot infrastructure

`corpus/pilot/v1-pilot-intake.json` contains 120 deterministic slots across:

1. breakfast quick;
2. breakfast protein;
3. snack portable;
4. lunch quick;
5. lunch standard;
6. dinner quick;
7. dinner standard;
8. vegetarian/legume;
9. fish/seafood;
10. soups/stews;
11. cold/portable;
12. components/sides.

The generated file is an intake ledger, not recipe content. All records start `discovered` with `referenceScanStatus=pending`.

## Current readiness baseline

`corpus/reports/production-readiness.json` currently reports:

- reference-data registry: PASS;
- reference-data digest: PASS;
- taxonomies: 7;
- terms: 113;
- active ingredient families: 4;
- production-ready ingredient families: **0**;
- blocked ingredient families: **4**;
- reason `quality_not_curated`: 4;
- reason `confidence_not_high`: 4;
- required production-ready ingredients: >=400;
- active recipes: 3;
- required recipes: >=3000;
- production manifest contract metadata: absent on the development catalog;
- `readyForPilot = false`;
- `readyForProduction = false`.

This is intentional. 4P-A makes the blocker explicit instead of allowing recipe generation to run against development nutrient fixtures.

## Automated tests added

The 4P-A suite verifies:

1. contract/schema/policy alignment and exact 120-slot pilot;
2. current readiness correctly reports 0/4 production-ready ingredients;
3. production planner filters draft/low ingredients and blocks;
4. canonical taxonomy reuse avoids duplicate proposals;
5. new taxonomy terms require propose -> approve -> materialize;
6. intake can resolve taxonomy while remaining blocked on ingredient quality;
7. unresolved intake cannot enter the production processor;
8. accepted production versions retain candidate/intake/contract provenance.

## Operator commands

```bash
npm run corpus:4pa
npm run corpus:production-readiness
npm run corpus:pilot-plan
npm run corpus:pilot-resolve
npm run corpus:production-process -- ...
```

Use `--strict` on `corpus:production-readiness` only when a non-zero exit is desired for a content-readiness gate.

## Next pass

4P-B should not begin by generating 120 recipes immediately. The next production action is the ingredient/reference-data readiness build:

1. acquire trusted ingredient source data;
2. curate/materialize the first production ingredient set toward >=400;
3. rerun `corpus:production-readiness` until `readyForPilot=true`;
4. then execute the 120-slot pilot in waves of 20, resolving discovered taxonomy/ingredient gaps between waves.

## Final verification

4P-A candidate `1.0.0-rc.10` passed the integrated repository gate on 2026-09-04:

- `npm run corpus:4pa`: PASS, 120 deterministic pilot slots, production contract digest `a3a7541e755a...`;
- JavaScript syntax/lint: PASS on 105 files;
- automated tests: **118/118 PASS**;
- accessibility source audit: **16/16 PASS**;
- form-contract audit: PASS;
- scale benchmark: PASS;
- root static build + Pages audit: PASS;
- `/yourDietManager` GitHub Pages build + explicit base-path audit: PASS;
- Pass E revision closure: **13/13 PASS**;
- project Skill validation/package: PASS.

The local browser regression reaches Chromium DevTools but is skipped only because this execution environment blocks localhost navigation. GitHub Actions still runs it with `YDM_BROWSER_REQUIRED=1`.

`corpus:production-readiness --strict` exits **2** intentionally because production content is not ready. The final V1 release gate is likewise intentionally blocked by five concrete production conditions: recipe corpus minimum, production-contract manifest traceability, exact production pipeline version, curated/high ingredient revisions, and non-dev catalog version. These are content/release blockers, not 4P-A infrastructure failures.
