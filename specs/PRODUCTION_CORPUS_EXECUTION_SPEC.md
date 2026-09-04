# Production Corpus Execution Spec — 4P-B/4P-C completion

Status: **normative execution companion for Phase 4 production**.

This specification operationalizes the already-frozen 4P-A, 4P-B and 4P-C contracts. It does not lower any ingredient, pilot, quality, or scale threshold.

## 1. Execution sequence

The missing production steps must run in this order:

1. acquire the official USDA FoodData Central Foundation Foods 04/2026 archive and SR Legacy 04/2018 archive;
2. import both archives as review-intake batches;
3. perform a deterministic high-confidence review pass that may approve only generic, nutrient-complete, unambiguous rows that satisfy the frozen taxonomy and safety rules;
4. materialize only rows whose eight review dimensions are explicitly true;
5. build and validate an explicit retirement map for the four Phase 1 ingredient fixtures;
6. merge the curated ingredient foundation and retire the three Phase 1 recipe fixtures while preserving history;
7. require production readiness for the pilot (`>=400` active current IngredientRevision records at `curated/high`);
8. resolve and execute all six pilot waves, 20 candidates each, with every wave gate passing before the next wave;
9. require the pilot to close at 120/120 terminal with zero unresolved reference requests and zero unhandled taxonomy proposals;
10. re-evaluate Scale Gate 500; it must be `ready` before any 4P-C scale batch is created;
11. execute the first industrialized 4P-C batch for 100 accepted recipes and re-scan the corpus.

No step may substitute synthetic or development-fixture data for a missing production input.

## 2. Deterministic review is still explicit review

The import adapters remain **review intake only**. Import never publishes canonical data.

For the production foundation, `ydm-deterministic-fdc-curator-v1` is permitted to act as a deterministic reviewer only when all of the following are true:

- the source is one of the two frozen USDA sources;
- required macronutrient/fiber fields are present and finite;
- the food belongs to a whitelisted generic ingredient category;
- no forbidden commercial/restaurant/baby/brand descriptor is present;
- physical state is explicit or conservatively normalized to `as_sold` rather than guessed as raw/cooked;
- food-group mapping is rule-based against existing canonical IDs;
- allergen mapping uses conservative exact descriptor/category rules;
- the Italian label is either a controlled translation or a source-preserving category-prefixed label;
- duplicate handling is exact concept-key based only; fuzzy semantic merge remains forbidden;
- all eight review dimensions are written explicitly as `true`, with reviewer, reviewed timestamp, source ID and FDC ID in the audit notes.

Rows outside those conditions remain rejected/pending for later human review. The deterministic reviewer is not authorized to create new taxonomy terms. A missing semantic term still enters the `ReferenceDataProposal` lifecycle.

## 2.1 USDA source-structure tolerance

The import boundary must tolerate structurally invalid array elements in otherwise valid official USDA payloads without crashing the run. A `null`/primitive food element or a food record without `fdcId` is never converted into a review record. It is skipped, counted as structurally invalid, and sampled in the curation-batch audit metadata. Null/non-object entries inside `foodNutrients` are ignored while valid nutrient entries on the same food remain usable.

Structural skips are warnings, not approvals. Nutrient-incomplete foods remain counted separately. Downstream pilot/production thresholds are still evaluated only against valid materializable `curated/high` records, so importer tolerance cannot make a deficient source pass a readiness gate.

## 2.2 Energy-unit and nutrition-bound parity

The USDA import boundary must treat nutrient unit metadata as semantic data, not presentation metadata. Energy is normalized to kcal before curation. Values already expressed in kcal are preserved; kJ values are converted with `kcal = kJ / 4.184`; the original value, source unit and conversion mode remain auditable in the curation record and materialized source provenance. A generic Energy nutrient with an unknown unsupported unit must not be relabeled as kcal.

Deterministic review and materialization must apply the same frozen `ingredient-curation-v1.nutritionBoundsPer100g`. A record outside any bound is ineligible for automatic approval. It must never be possible for `ydm-deterministic-fdc-curator-v1` to mark a record approved that the materializer will reject solely because of those same bounds.

## 3. Foundation coverage required for the pilot generator

The deterministic review must meet both the global production-foundation target and minimum inventory by food group. The current execution target is 600 approved ingredients. The pilot cannot start unless at least 400 remain active and `curated/high` after deduplication/retirement.

The curation command also requires explicit replacement concepts for:

- salmon;
- cooked rice;
- zucchini;
- olive oil.

Failure to identify any one of these from curated/high USDA records blocks retirement of the Phase 1 fixtures.

## 4. Pilot generation

The pilot generator is deterministic and consumes only active current `curated/high` ingredients. Each frozen 4P-A stratum maps to a fixed structural template. Candidate identity, ingredient selection and recipe text are deterministic for a frozen intake and ingredient catalog.

Every wave is processed through the production Recipe Pipeline. A wave passes only when all 20 records are terminal and the existing 4P-B unresolved-reference and taxonomy-proposal limits are satisfied.

## 5. First Scale Gate batch

After 120/120 pilot closure, Scale Gate 500 is re-evaluated. The first 4P-C batch is permitted only from gate state `ready`. It uses the frozen industrialized pipeline, stale-snapshot protection, result digest, review backlog rules and apply gate.

The first scale batch targets 100 accepted recipes. Its output is a **working production bundle**, not a V1 release. The V1 release gate remains blocked until the frozen production minimum of 3,000 accepted recipes and all final release requirements are satisfied.

## 6. GitHub Actions execution

`.github/workflows/production-corpus.yml` is the canonical network-enabled runner for this sequence. It downloads source archives from URLs frozen in the curation policy, records archive SHA-256, imports/curates/materializes, runs the pilot and first scale batch, and uploads all generated artifacts.

By default the workflow does not commit generated corpus data. An explicit `commit_results=true` workflow input may commit the resulting working production bundle and audit reports to the invoking branch. The official source archives remain excluded from source control.
