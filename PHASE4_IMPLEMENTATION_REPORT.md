# Phase 4 Implementation Report

## Status

**Phase 4 engine/toolchain: implemented and verified.**

**Phase 4 production content gate: not yet complete.** The roadmap requires an initial curated ingredient catalog and a 3,000–5,000 validated recipe release. This repository does not falsely mark that requirement complete: the supplied Phase 3 nutrition records are development fixtures, and the official upstream USDA Foundation Foods binary was not available inside the execution sandbox. No nutrient values were fabricated to reach a recipe-count target.

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

- target corpus 3,000 / 4,000 / 5,000;
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
- V1 target remains 3,000–5,000;
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
5. reach 3,000–5,000 validated active recipes with all hard compound coverage and release gates green;
6. publish the production catalog and re-run runtime import/query/rollback tests.

Until those conditions are met, Phase 5 should not assume the smoke corpus is the production recipe base.

## Environment limitation

The official USDA FoodData Central pages are reachable through web research, but the execution container used for this build could not fetch the external binary archive. The implementation therefore stops at a production-ready source adapter/review workflow instead of inventing data. Browser E2E retains the Phase 2–3 managed-environment limitation for local HTTP origins; domain/integration/build/HTTP smoke validation remain available.

## Post-RC amendment — reference-data prerequisite

After the UI/data audit, the production Phase 4 gate has an additional prerequisite: complete the canonical Reference Data Registry and migrate semantic free-text fields before resuming the 3,000–5,000 recipe build. The orchestrator/pipeline must be reference-data-aware: it may propose/materialize extensible taxonomy terms and curate missing ingredients first, but accepted recipes may contain only canonical IDs. This amendment does not invalidate the existing engine tests; it tightens the production-data contract before final materialization.

