# Phase 4 Implementation Report

## Status

**Phase 4 engine/toolchain: implemented and verified.**

**Phase 4 production content gate: not yet complete.** The roadmap requires an initial curated ingredient catalog, at least 3,000 validated recipes for V1 release (4,000 current planning target), and the required production/review provenance gates. There is no hard recipe-count ceiling. This repository does not falsely mark that requirement complete: the supplied Phase 3 nutrition records are development fixtures, and the official upstream USDA Foundation Foods binary was not available inside the execution sandbox. No nutrient values were fabricated to reach a recipe-count target.

The repository is versioned `0.4.0-phase4`; the included `0.4.0-dev` corpus is an end-to-end smoke release only.

## Implemented Phase 4 behavior

### Corpus scanner

- Builds schema-valid `RecipeCorpusSnapshot` artifacts from the current family pointers.
- Measures meal, energy, protein, fiber, practicality, diet, family, cuisine and ingredient-category distributions.
- Measures ingredient usage, primary-ingredient usage and ingredient-pair co-occurrence.
- Detects exact/near duplicates.
- Recalculates nutrition/allergens from frozen IngredientRevision records.
- Verifies recipe `inputDigest` provenance as part of nutrition-quality gates.
- Counts missing required locales and schema/reference errors.
- Evaluates hard release coverage and diversity/similarity gates.

### Versioned production policy

`corpus/policies/v1-default.json` is now `1.1.0`:

- frozen legacy target fields 3,000 / 4,000 / 5,000, interpreted operationally as 3,000 release minimum / 4,000 current planning target / 5,000 advisory compatibility reference only;
- deterministic oversampling/batch limits;
- 99 target cells;
- hard meal and meal×energy coverage;
- soft kcal/protein/fiber distributions;
- soft energy×protein and energy×fiber intersections;
- practicality/diet intersections;
- soft cuisine/family/category targets;
- primary-ingredient and recurring-pair limits;
- exact/near-duplicate gates.

The schema now supports optional `coverageTarget.criteria[]`. A compound cell counts only recipes matching every criterion. This closes the implementation gap where independent global marginals could not prove “protein/fiber coverage inside each calorie band”.

### Deterministic Recipe Corpus Orchestrator

- BUILD, EXPAND, IMPROVE and FOCUSED_EXPANSION modes.
- Deterministic priority scoring and seeded tie-breaks.
- User focus as `boost` or explicit `restrict` constraint.
- Automatic meal/kcal/protein/fiber/family/cuisine/practicality choice from policy deficits.
- Preferred underused ingredient selection.
- Candidate oversampling separated from net accepted target.
- Intra-batch primary/pair diversity targets sized to the feasible ingredient set.
- Full policy/snapshot/run/job provenance.

### Recipe Pipeline

- Accepts editorial/LLM candidate JSON only.
- Rejects ingredients outside the job/current catalog.
- Normalizes quantities using IngredientRevision units/conversions.
- Computes nutrition deterministically.
- Derives allergens deterministically.
- Checks job kcal/protein/fiber/prep/family/cuisine/practicality constraints.
- Enforces required/forbidden tags.
- Rejects exact and near duplicates.
- Enforces intra-batch primary/pair diversity.
- Generates deterministic immutable family/version IDs from job seed + candidate identity/signature.
- Derives `inputDigest`, `contentHash` and search tokens.

### Operational CLI workflow

The entire adaptive loop is executable through stable commands:

- `corpus:scan`
- `corpus:plan`
- `corpus:process`
- `corpus:apply`
- `corpus:publish`
- `corpus:smoke`
- `corpus:import-usda`
- `corpus:materialize-usda`

The agent/LLM hand-off is documented in `corpus/CANDIDATE_GENERATION_PROTOCOL.md`. The user can continue to issue high-level instructions; the agent derives batch details from policy and snapshot.

### Ingredient-source intake

- USDA Foundation Foods JSON intake script.
- Required-nutrient completeness filter.
- Source-record IDs and provenance metadata retained.
- Suggested taxonomy/allergen mappings are explicitly review-only.
- Materialization requires editorial approval and an explicit catalog version.
- Production publication requires every ingredient revision to be `curated` + `high` confidence unless a development-only override flag is deliberately supplied.

### Release publication

- Release-level schema/reference/hash/inputDigest/nutrition/allergen validation.
- Policy release gates before shard publication.
- Phase 3 manifest/shard/checksum format.
- Runtime import compatibility tested.

## Phase 3 contract corrections discovered during implementation

1. A later catalog release may reuse an immutable IngredientRevision/RecipeVersion introduced by an earlier release. `record.catalogVersion` is the introduction release, not a requirement that every unchanged record be re-versioned. The loader now rejects only records claiming a *future* catalog version.
2. The runtime SchemaRegistry loaded the orchestrator schema files but had no nominal aliases for them. `recipeCorpusPolicy`, `recipeCorpusSnapshot`, `recipeCorpusOrchestrationRun` and `recipeGenerationJob` are now registered.
3. Cross-dimensional coverage is now explicit through `coverageTarget.criteria[]`; target marginals alone were insufficient for the corpus-plan promise.

## Smoke release

`corpus/releases/0.4.0-dev/` proves the full path using the intentionally tiny development fixture:

- 4 development ingredient families/revisions;
- 3 normalized existing recipe families plus 5 accepted generated families = 8 active recipes;
- 7 generated candidates;
- 5 accepted;
- 1 exact duplicate rejected;
- 1 nutrition-range failure rejected;
- hard smoke coverage satisfied;
- diversity passed;
- exact duplicates in final corpus: 0;
- near duplicates in final corpus: 0;
- schema/reference/nutrition/allergen/locale errors: 0;
- release imported successfully by the Phase 3 runtime catalog engine.

The smoke release is **not** production nutritional content.

## Automated verification

The Phase 1–3 suite plus Phase 4 tests verifies:

- runtime schema aliases and canonical orchestrator artifacts;
- scanner quality/release gates;
- `inputDigest` drift detection;
- deterministic same-seed planning;
- candidate oversampling;
- focused-expansion constraints;
- exact-duplicate and nutrition-range rejection;
- generated release import through `CatalogImporter`;
- old immutable record reuse and future-version rejection;
- production rejection of draft/low-confidence ingredient fixtures;
- USDA source intake remains review-only until approval and materializes schema-valid curated/high revisions only after approval;
- V1 release minimum remains 3,000 and current planning target 4,000; corpus growth may continue beyond 5,000;
- compound coverage cells count intersections, not independent marginals;
- all Phase 1–3 regressions.

The generic process/apply/scan/publish CLI chain is also exercised against the smoke batch. An HTTP smoke test also serves the production build and resolves the app shell, Phase 4 orchestrator module and corpus-policy schema.

Final automated gate for this package: **43/43 tests passed**, syntax validation passed for **56 JavaScript files**, and the static production build completed successfully.

## Remaining Phase 4 completion gate

To mark the roadmap phase itself **DONE**, production data must still be materialized:

1. acquire the official trusted ingredient-source JSON;
2. run source import and editorial curation;
3. materialize approximately 400–800 production IngredientRevision records with provenance;
4. BUILD adaptively from repeated scan → plan → generate → process → apply loops;
5. reach at least 3,000 validated active recipes (current planning target 4,000, with no hard maximum) with all hard compound coverage and release gates green;
6. publish the production catalog and re-run runtime import/query/rollback tests.

Until those conditions are met, Phase 5 should not assume the smoke corpus is the production recipe base.

## Environment limitation

The official USDA FoodData Central pages are reachable through web research, but the execution container used for this build could not fetch the external binary archive. The implementation therefore stops at a production-ready source adapter/review workflow instead of inventing data. Browser E2E retains the Phase 2–3 managed-environment limitation for local HTTP origins; domain/integration/build/HTTP smoke validation remain available.

## Post-RC amendment — reference-data prerequisite

After the UI/data audit, the production Phase 4 gate has an additional prerequisite: complete the canonical Reference Data Registry and migrate semantic free-text fields before resuming the production recipe build toward the 3,000 release minimum / 4,000 planning target and beyond if required. The orchestrator/pipeline must be reference-data-aware: it may propose/materialize extensible taxonomy terms and curate missing ingredients first, but accepted recipes may contain only canonical IDs. This amendment does not invalidate the existing engine tests; it tightens the production-data contract before final materialization.



## Phase 4 production Pass A — contract/pilot hardening

4P-A is implemented in `PHASE4_PRODUCTION_PASS_A_REPORT.md` and `specs/PRODUCTION_CORPUS_CONTRACT.md`.

The production path is now contract-bound rather than recipe-count-only:

- the frozen 3,000/4,000/5,000 recipe fields and 400/600/800 ingredient readiness are machine-checkable; the 5,000 recipe field is not a runtime ceiling;
- a deterministic 120-slot pilot ledger exists;
- production planning excludes non-`curated/high` ingredient revisions;
- taxonomy gaps create/reuse governed ReferenceDataProposal artifacts before candidate generation;
- unresolved intake records cannot enter the production recipe processor;
- accepted versions carry candidate/intake/contract provenance;
- production manifest/release gates require the production contract and pipeline version.

The current development catalog correctly remains `readyForPilot=false`: 0 of 4 active ingredient families are production-ready. This replaces the prior vague “curate ingredients first” prerequisite with a measurable gate.


## Phase 4 production Pass B — ingredient curation/pilot execution

4P-B extends the production path with a source-governed ingredient curation layer and ordered pilot waves. The implementation is normative in `specs/INGREDIENT_CURATION_PILOT_SPEC.md`.

Implemented control-plane behavior:

- Foundation Foods April 2026 primary source and SR Legacy supplemental source are frozen in a schema-valid curation policy;
- source acquisition records archive/input digest provenance;
- source importers produce pending editorial review records, not canonical ingredients;
- explicit review is required for Italian label, taxonomy, state, allergens, culinary suitability, duplicate status, nutrition and provenance;
- materialization emits only reviewed `curated/high` IngredientRevision records;
- existing fixture retirement requires an explicit approved replacement map;
- pilot wave reports enforce 20-record ordered waves and no unresolved references/proposals at wave close.

The production-data portion is **not marked complete** in this candidate. The execution sandbox could not acquire the trusted external USDA archive, so no nutrition values were fabricated and wave 1 remains blocked. A trusted source batch must be acquired and editorially reviewed before the 400-family pilot gate can become green.


## Phase 4 production Pass C addendum — rc.12

4P-C industrializes the post-pilot production recipe path without authorizing execution before 4P-B closes. The companion policy `recipe-production-pipeline-v1@1.0.0` adds deterministic per-job intake, ordered objective stages, explicit candidate dispositions, review/retry governance, immutable result/report digests, stale-snapshot rejection and Scale Gate 500.

Current execution remains intentionally blocked because the bundled development fixture has 0/400 production-ready ingredient families, pilot terminal count 0/120, three production nutrition errors and only 3 active recipes. The scale CLI refuses to create a production job intake while this gate is blocked.

The 4P-C control plane is covered by dedicated schemas, CLI tools and automated tests. Scale execution is complete only after the 4P-B data/pilot gate closes and the cumulative corpus reaches >=500 clean recipes with the pro-rata hard coverage floors.


## Phase 4 production verification addendum — rc.20

The source-backed GitHub run reached 600 production-ready ingredient families, pilot 120/120 terminal and 220 active recipes before post-generation verification. The four failing tests were development-baseline assertions coupled to mutable canonical pilot/retirement state. rc.20 isolates those tests on the immutable Phase 4 smoke bundle and fresh deterministic pilot intake. Production workflow semantics and gates are unchanged. The full suite is additionally verified against a simulated post-workflow canonical state.


## Phase 4 production review addendum — rc.22

The verified 500-recipe controlled-scale checkpoint is now a mandatory product-review boundary before further generation. rc.22 publishes the exact frozen 500 RecipeVersion set into the application through catalog channel `production_review`, with `requiredHumanReview=true` and `releaseEligible=false`.

Human review is persisted in IndexedDB and bound to publication ID, source-corpus digest, RecipeVersion ID and content hash. Every recipe requires six explicit dimensions plus an `approved`, `needs_changes` or `rejected` decision. The phase closes only when all 500 are approved; any unresolved/non-approved item blocks further scale and requires remediation/re-review.

This addendum also removes 5,000 as a behavioral stop. Existing contract/policy fields retain 5,000 only for compatibility with frozen provenance; the orchestrator must continue beyond it whenever coverage, diversity or product requirements call for more recipes.

## rc.24 production-review browser schema mirror hardening

The review publication exposed a deployment-contract drift: canonical production ingredient schemas accepted the rc.15–rc.16 energy provenance fields while the PWA mirror rejected them. rc.24 synchronizes all browser-loaded schema mirrors, adds a byte-for-byte mirror gate plus a build preflight, and tests the 500-recipe bootstrap using the actual `public/schemas` surface. See `PHASE4_PRODUCTION_REVIEW_RC24_SCHEMA_MIRROR_REPORT.md`.
