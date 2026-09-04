# Phase 4 corpus workspace

This directory contains build-time/editorial artifacts only. They are not IndexedDB runtime stores and are not included in user backups.

- `policies/`: immutable RecipeCorpusPolicy versions.
- `snapshots/`: derived RecipeCorpusSnapshot files.
- `runs/`: RecipeCorpusOrchestrationRun audit records.
- `jobs/`: traceable RecipeGenerationJob files.
- `staging/`: source review queues, candidate files and accepted batch bundles before release publication.
- `reports/`: coverage, diversity, similarity, rejection and release-validation reports.
- `releases/`: publishable catalog releases in Phase 3 JSON-shard format.
- `sources/`: provenance/acquisition notes for external ingredient sources.
- `CANDIDATE_GENERATION_PROTOCOL.md`: exact LLM/agent hand-off for candidate generation.


## 4P-A production contract and pilot intake

Production generation is now contract-bound. The authoritative contract is `contracts/v1-production.json`.

Current baseline commands:

```bash
# Validate contract/pilot infrastructure (does not pretend current content is ready)
npm run corpus:4pa

# Report current ingredient/reference/recipe production readiness
npm run corpus:production-readiness -- public/data contracts/v1-production.json policies/v1-default.json reports/production-readiness.json

# Materialize the deterministic 120-slot pilot ledger
npm run corpus:pilot-plan -- public/data contracts/v1-production.json pilot/v1-pilot-intake.json phase4-production-pilot-v1

# After declaring reference scans and adding referenceRequests, resolve/reuse/propose prerequisites
npm run corpus:pilot-resolve -- public/data contracts/v1-production.json pilot/v1-pilot-intake.json pilot/v1-reference-data-proposals.json

# Only ready_for_generation candidate IDs may enter this processor
npm run corpus:production-process -- <catalog> <policy> <contract> <job> <intake> <candidates> <result> [updated-intake]
```

`corpus:plan` automatically loads the production contract when the target catalog version is not marked fixture/smoke/dev. Production planning therefore ignores non-`curated/high` ingredient revisions and blocks instead of using development nutrition fixtures.

The initial `v1-pilot-intake.json` contains 120 slots across 12 stress-test strata. It is deliberately not a recipe file.

## Production policy

`policies/v1-default.json` is policy version `1.1.0` and targets 3,000 / 4,000 / 5,000 recipes (min / desired / max). It includes 99 explicit coverage targets. In addition to marginal meal, kcal, protein, fiber, practicality, diet, family, cuisine and ingredient-category targets, it uses compound `criteria[]` cells such as:

- lunch + 300–399 kcal;
- dinner + 600–699 kcal;
- energy band + protein band;
- energy band + fiber band;
- meal + energy band + quick;
- energy band + vegetarian/portable.

This prevents a corpus from appearing balanced only because its global marginals look good while specific kcal/meal cells remain empty.

## End-to-end commands

```bash
# 1. Scan current corpus
npm run corpus:scan -- <catalog-data-dir|bundle.json> corpus/policies/v1-default.json corpus/snapshots/latest.json

# 2. Plan one deterministic next batch
npm run corpus:plan -- corpus/snapshots/latest.json build corpus/policies/v1-default.json <catalog-data-dir|bundle.json> [goal.json] 1.0.0 [seed]

# 3. Generate the candidate JSON according to the produced job, then validate/process it
npm run corpus:process -- <catalog-data-dir|bundle.json> corpus/policies/v1-default.json <job.json> <candidates.json> <result.json>

# 4. Apply accepted records and rescan before planning again
npm run corpus:apply -- <catalog-data-dir|bundle.json> <result.json> <new-bundle.json> 1.0.0
npm run corpus:scan -- <new-bundle.json> corpus/policies/v1-default.json corpus/snapshots/latest.json

# 5. Production publish: curated/high-confidence ingredient provenance is mandatory
npm run corpus:publish -- <final-bundle.json> corpus/policies/v1-default.json 1.0.0 corpus/releases/1.0.0
```

`--allow-development-ingredients` exists only for smoke/test releases. Never use it for a production catalog.

## Ingredient curation and pilot execution (4P-B)

The authoritative curation policy is `curation/v1-ingredient-curation-policy.json`. Foundation Foods April 2026 is primary; SR Legacy is supplemental; Branded Foods and automatic fuzzy merging are forbidden for the V1 generic ingredient foundation.

Source acquisition (internet-connected environment):

```bash
npm run corpus:fetch-fdc -- usda-foundation-2026-04
npm run corpus:fetch-fdc -- usda-sr-legacy-2018-04
```

The cache is ignored by git. Acquisition writes an SHA-256-backed manifest. Import extracted JSON as a review batch:

```bash
npm run corpus:import-usda -- <foundation-foods.json> corpus/staging/usda-foundation-review.json
npm run corpus:import-usda-sr -- <sr-legacy.json> corpus/staging/usda-sr-review.json
```

Import is never approval. Every row starts pending, with all editorial checks false. Review every retained row explicitly for Italian label, taxonomy, state, allergens, culinary suitability, duplicates, nutrition and source. Then assess/materialize:

```bash
npm run corpus:ingredient-curation-report -- public/data corpus/staging/usda-foundation-review.json corpus/curation/v1-ingredient-curation-policy.json corpus/contracts/v1-production.json corpus/reports/ingredient-curation-readiness.json
npm run corpus:materialize-usda -- corpus/staging/usda-foundation-review.json corpus/staging/foundation-reviewed 1.0.0
npm run corpus:merge-curated-ingredients -- public/data corpus/staging/foundation-reviewed corpus/staging/production-foundation-bundle.json corpus/curation/v1-legacy-fixture-retirement.json
```

`corpus:materialize-usda` accepts only fully approved records and emits `curated/high` revisions. Existing families are never overwritten by ID collision. Development fixtures are retired only through the explicit retirement map.

After the merged production-ready foundation reaches the contract floor, execute the deterministic pilot in ordered waves of 20. Use `corpus:pilot-wave-report` after every wave. Wave N+1 is blocked until wave N is terminal and has zero unresolved reference requests and zero unhandled taxonomy proposals.

Current repository baseline deliberately reports `readyForPilotFoundation=false`: no trusted source curation batch is vendored and the current four ingredients remain development fixtures. Missing external source data is a blocker, not a skipped/pass condition.

## Release invariant

A production V1 corpus is releasable only when trusted ingredient provenance is present, all quality gates pass, hard compound coverage cells pass, diversity/similarity thresholds pass, and the resulting catalog imports successfully through the Phase 3 runtime engine. Development fixtures must never be relabeled as production nutrition data.


## Taxonomy/reference-data growth

Pass A makes reference data a frozen input of every recipe job. `RecipeGenerationJob` requires `referenceDataVersion` + `referenceDataDigest`, and the planner/pipeline require the matching registry snapshot. Corpus coverage policies use canonical term IDs for cuisine, recipe family, diet/practical tags and ingredient categories.

Corpus generation is also responsible for surfacing missing reference data. It must create a `ReferenceDataProposal`, resolve collision/review status, materialize the approved extensible term, update the registry snapshot/digest, and only then generate candidates that reference the new ID. Missing ingredients must likewise be curated from verifiable source data before use. Closed registries cannot be extended. See `../specs/REFERENCE_DATA_TAXONOMY_SPEC.md`.

## 4P-C industrialized production scale

The post-pilot scale control plane is governed by `corpus/production/v1-recipe-pipeline-policy.json` (`recipe-production-pipeline-v1@1.0.0`). It adds deterministic per-job intake, explicit candidate dispositions, stale-snapshot protection, review/retry, result/report digest verification and Scale Gate 500.

Current execution remains blocked until 4P-B data/pilot closure is real. Do not use these commands to bypass the ingredient or pilot gates.

```bash
npm run corpus:scale-gate-500
npm run corpus:production-job-intake -- <job.json> <scale-gate-report.json> [contract.json] [output-intake.json]
npm run corpus:production-run-batch -- <catalog> <snapshot> <job> <intake> <candidates> <result> <batch-report> [updated-intake]
npm run corpus:production-review -- <intake> <batch-report> <review-decisions> [updated-intake]
npm run corpus:production-apply -- <catalog> <result> <batch-report> [output-bundle] [targetCatalogVersion]
```

A batch with `needs_reference_review`, `needs_recipe_review` or `nutrition_outlier` is not applicable. Re-scan and re-plan after every applied batch; stale snapshots are hard failures.
