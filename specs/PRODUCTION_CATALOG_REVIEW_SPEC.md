# Production Catalog Review Specification

## 1. Purpose

This phase joins three activities into one controlled boundary:

1. publish the verified 500-recipe production corpus into the application catalog;
2. expose those exact frozen recipe versions to a human reviewer in the app;
3. block any further corpus scaling until the human-review gate is formally closed.

The production-review catalog is **not** a V1 production release. Publication exists so the real corpus can be evaluated as a product before generating more recipes.

## 2. Source of truth and publication boundary

The source is `corpus/production/current-working-bundle.json` at the verified Scale Gate 500 checkpoint.

Publication requires:

- exactly 500 active recipes;
- Scale Gate 500 status `pass`;
- the production ingredient foundation to remain valid and production-ready;
- the frozen recipe set to contain exactly the 500 current active RecipeVersion IDs;
- a source-corpus SHA-256 digest and snapshot ID;
- publication channel `production_review`;
- `requiredHumanReview=true`;
- `releaseEligible=false`.

The workflow may replace only generated base catalog data under `public/data/{ingredients,recipes,reference-data}` and `public/data/catalog-manifest.json`. User-local IndexedDB data, configuration, plans, overrides and review decisions are never part of this repository publication operation.

The publication is identified by its source-corpus digest. Review decisions are valid only for that publication and its frozen RecipeVersion set.

## 3. Application behavior

A fresh installation imports the production-review catalog as its base catalog.

An existing installation follows the normal CatalogUpdater path. The user applies the available catalog update; local overrides and immutable historical records are preserved by the existing catalog update contract.

When a production-review manifest is active:

- Recipes exposes a Production Review entry point;
- catalog cards show review state for frozen recipe versions;
- the review dashboard shows expected, reviewed, approved, needs-changes, rejected and unreviewed counts;
- the dashboard links to the next unreviewed frozen RecipeVersion;
- the exact frozen base version can be reviewed even when a local override owns the family current pointer;
- frozen base review versions are not edited in place during review;
- while a frozen base version is being reviewed, its detail suppresses the visible Edit action and exposes the Human Review panel instead; the canonical `/recipes/:id/edit` route remains valid and any save creates a new user-owned version without mutating the frozen reviewed RecipeVersion;
- review decisions can be exported and imported as checksum-bound JSON.

## 4. Human-review contract

Review policy: `production-review-500-v1`.

Every frozen RecipeVersion requires one current decision and six explicit dimensions:

1. `culinaryCoherence` — the dish makes culinary sense as a whole;
2. `ingredientCombination` — ingredients are compatible and appropriate;
3. `quantityPlausibility` — ingredient amounts and serving proportions are credible;
4. `instructionQuality` — preparation instructions are sufficient, ordered and usable;
5. `titleDescriptionQuality` — title and description describe the actual dish clearly;
6. `differentiation` — the recipe is meaningfully distinct rather than a cosmetic variation.

Every dimension is `pass` or `fail`.

Decision rules:

- `approved`: all six dimensions must pass;
- `needs_changes`: at least one dimension must fail and notes are mandatory;
- `rejected`: at least one dimension must fail and notes are mandatory.

Reviewer identity, review timestamp, publication ID, catalog version, recipe/version IDs and RecipeVersion content hash are persisted with every decision.

## 5. Review evidence

The app exports `ydm-production-recipe-human-review` JSON containing:

- review policy version;
- publication ID and catalog version;
- source-corpus digest;
- the exact ordered frozen RecipeVersion ID set;
- review decisions;
- deterministic summary;
- SHA-256 checksum.

Import rejects:

- checksum mismatch;
- publication/catalog mismatch;
- a different frozen recipe set;
- duplicate decisions for one RecipeVersion;
- decisions outside the frozen set;
- stale RecipeVersion content hashes;
- inconsistent decision/dimension combinations.

## 6. Human Review Gate

The phase is complete only when:

- reviewed = 500;
- approved = 500;
- needs_changes = 0;
- rejected = 0;
- unreviewed = 0;
- the review bundle checksum is valid;
- source-corpus digest still matches the frozen 500-recipe corpus.

Any `needs_changes` or `rejected` recipe requires a later controlled remediation/re-review cycle. Further corpus scaling must not resume while the Human Review Gate is blocked.

## 7. Recipe-count growth invariant

The current V1 contract/policy retain the legacy fields `maxRecipes: 5000` and `targetCorpus.max: 5000` for provenance compatibility with the already-generated corpus. **These values are advisory planning references, not hard ceilings.**

The orchestrator must never stop generation solely because active recipe count has reached or exceeded 5,000. The corpus may grow beyond 5,000 whenever coverage, diversity, product quality, new supported use cases, locales or future requirements justify additional recipes.

V1 keeps 3,000 as the minimum release count and 4,000 as the current planning target. Neither 4,000 nor 5,000 prevents subsequent controlled expansion.

## 8. Exit and next phase

After Human Review Gate PASS, inspect the approved corpus and the review evidence before redesigning/resuming generation. The next scaling pass must use the review findings as input rather than mechanically continuing the existing generator.
