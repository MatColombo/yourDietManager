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

## Ingredient source intake

The current source adapter targets USDA FoodData Central Foundation Foods. Download/extract the official JSON, then:

```bash
npm run corpus:import-usda -- <foundation-foods.json> corpus/staging/usda-foundation-review.json
# Editorially review/approve records: labels IT/EN, taxonomy, state, allergens and culinary suitability.
npm run corpus:materialize-usda -- corpus/staging/usda-foundation-review.json corpus/staging/ingredients-reviewed 1.0.0
```

The importer creates a review queue and never silently turns heuristics into production ingredient facts.

## Release invariant

A production V1 corpus is releasable only when trusted ingredient provenance is present, all quality gates pass, hard compound coverage cells pass, diversity/similarity thresholds pass, and the resulting catalog imports successfully through the Phase 3 runtime engine. Development fixtures must never be relabeled as production nutrition data.


## Taxonomy/reference-data growth

Pass A makes reference data a frozen input of every recipe job. `RecipeGenerationJob` requires `referenceDataVersion` + `referenceDataDigest`, and the planner/pipeline require the matching registry snapshot. Corpus coverage policies use canonical term IDs for cuisine, recipe family, diet/practical tags and ingredient categories.

Corpus generation is also responsible for surfacing missing reference data. It must create a `ReferenceDataProposal`, resolve collision/review status, materialize the approved extensible term, update the registry snapshot/digest, and only then generate candidates that reference the new ID. Missing ingredients must likewise be curated from verifiable source data before use. Closed registries cannot be extended. See `../specs/REFERENCE_DATA_TAXONOMY_SPEC.md`.
