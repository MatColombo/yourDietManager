# Phase 4 Production Catalog Review — rc.22

## Status

**Implementation: complete.**

This revision introduces one deliberate product-validation phase after the verified Scale Gate 500 checkpoint and before any further recipe generation:

1. controlled publication of the frozen 500-recipe production corpus into the application;
2. human review of those exact RecipeVersion records inside the application;
3. a fail-closed Human Review Gate that blocks subsequent scale until review is complete.

The user confirmed the real source-backed **Controlled Scale to 500 Recipes** GitHub workflow completed successfully. rc.22 does not replace that committed production working bundle; its publication workflow derives the catalog from the repository's own `corpus/production/current-working-bundle.json`.

## Controlled publication boundary

The new workflow is `.github/workflows/production-review-500.yml` (`Publish 500 Recipe Review Catalog`). It requires:

- exactly 500 active recipes in the committed production working bundle;
- Scale Gate 500 = `pass`;
- production-ready curated ingredient foundation;
- a frozen source snapshot and corpus digest.

It publishes the 500 active RecipeVersion records through a manifest with:

- `channel = production_review`;
- `requiredHumanReview = true`;
- `reviewRecipeCount = 500`;
- `reviewPolicyVersion = production-review-500-v1`;
- `releaseEligible = false`.

This is intentionally **not** a V1 production release. The workflow replaces only generated base catalog data and publication evidence. Existing IndexedDB user configuration, plans, local family overrides and review decisions are outside the repository publication transaction.

For an existing installation, the normal CatalogUpdater applies the new base catalog and preserves locally managed families/history. A fresh installation imports the review catalog directly.

## In-app human review

IndexedDB is upgraded to DB v5 with 22 object stores. The new `recipeHumanReviews` store persists one current review decision per frozen RecipeVersion/publication.

The application exposes `Recipes -> Review production`. The dashboard provides:

- expected/reviewed/approved/needs-changes/rejected/unreviewed counts;
- progress status;
- next-unreviewed navigation;
- attention list for non-approved recipes;
- checksum-bound JSON export/import.

Each recipe requires six explicit dimensions:

1. culinary coherence;
2. ingredient combination;
3. quantity plausibility;
4. instruction quality;
5. title/description quality;
6. differentiation.

Decisions are `approved`, `needs_changes` or `rejected`. Approval requires all six dimensions to pass. A non-approved decision requires at least one failed dimension and reviewer notes.

Every decision is bound to catalog version, publication ID, source publication, RecipeVersion ID and RecipeVersion content hash. Import rejects stale hashes, duplicate decisions, mismatched publication/frozen set and invalid checksums.

## Human Review Gate

Further corpus generation is blocked until strict review evidence proves:

- expected = 500;
- reviewed = 500;
- approved = 500;
- needs_changes = 0;
- rejected = 0;
- unreviewed = 0;
- checksum valid;
- publication/source corpus/frozen version identity unchanged.

A synthetic gate test verified both sides of the boundary:

- 500 approved -> PASS;
- 499 approved + 1 needs_changes -> BLOCKED.

Any non-approved recipe requires controlled remediation and re-review. Review findings must inform the next generator/scale design before 500 -> 1500 resumes.

## Recipe-count ceiling correction

The existing frozen V1 policy/contract still contain `targetCorpus.max = 5000` and `maxRecipes = 5000` for provenance compatibility with already-generated artifacts. rc.22 explicitly changes their operational meaning: **5,000 is not a hard ceiling**.

V1 semantics are now:

- 3,000 = minimum release count;
- 4,000 = current planning target;
- 5,000 legacy field = advisory compatibility reference only;
- no hard maximum corpus size.

The orchestrator no longer stops because active recipe count reaches 5,000. A functional regression verifies a BUILD plan can continue from 5,001 toward 6,000.

## State isolation

Publishing the review catalog changes `public/data` from the small development catalog to the 500-recipe production-review catalog. Development-baseline tests and the Phase 4 smoke builder are therefore bound to immutable `tests/fixtures/catalog-0.3/public/data` rather than mutable `public/data`.

This prevents the publication workflow from invalidating tests that intentionally exercise development-fixture behavior.

## Verification

Local QA was executed both before controlled publication and after replacing `public/data` with a generated 500-recipe review catalog.

Post-publication verification:

- Production Review control plane: **17/17 PASS**;
- publication validator: **PASS**, 500 recipes / 600 ingredients / `releaseEligible=false`;
- test suite: **173/173 PASS**;
- syntax/lint: **144 JavaScript files PASS**;
- accessibility: **16/16 PASS**;
- forms: **PASS**;
- scale benchmark: **PASS**;
- build: **PASS**;
- Pass E closure: **13/13 PASS**;
- Pages audit `/`: **PASS**;
- Pages audit `/yourDietManager/`: **PASS**;
- local Chromium browser regression: **SKIPPED only because localhost HTTP navigation is blocked by the sandbox policy**.

The local publication used a deterministically reconstructed 500-recipe working set solely to exercise the publication path. The real repository publication ID/source digest will be generated from the user's committed, successful 500-recipe working bundle and can therefore differ from the local QA digest.

## Exit condition

Do not resume recipe generation after deploying rc.22. Publish the real review catalog, complete in-app review, export the final review bundle and run the strict Human Review Gate. Only after 500/500 approval should the next corpus-generation phase be designed.
