# yourDietManager — V1 Step 3 Implementation Report

**Step:** V1 Freeze + Release Candidate
**Candidate app:** `1.0.0-rc.27`
**Frozen catalog:** `1.0.0`
**Status:** implementation complete; final manual acceptance pending
**Compatibility boundary:** stable tag `v1.0.0`

## 1. Outcome

Step 3 has produced the final candidate for the user's manual product test. It intentionally does **not** create the stable `v1.0.0` tag or promote the application package to `1.0.0` yet.

The release contract is frozen at:

- IndexedDB schema: `5`;
- content schema: `3`;
- backup format: `1`;
- final destructive pre-V1 epoch: `v1-freeze-epoch-1`;
- 600 IngredientFamily / 600 IngredientRevision;
- 500 RecipeFamily / 500 RecipeVersion;
- required `core` pack: 500 recipes;
- catalog version: `1.0.0`;
- application candidate: `1.0.0-rc.27`.

The machine-readable contract is `corpus/production/v1-release/freeze-contract.json`.

## 2. Release blocker discovered and resolved

The Step 3 stratified review exposed a systemic issue that previous structural tests did not catch: the pre-freeze corpus could generate recipes that were schema-valid but not release-quality culinary combinations. Examples included inappropriate ingredient roles/amounts and combinations produced from `foodGroup` taxonomy membership alone.

The fix was deliberately systemic rather than manual editing:

1. added `corpus/production/v1-release/recipe-eligibility.json`;
2. defined explicit culinary roles and portion bounds;
3. made taxonomy-only recipe eligibility forbidden;
4. added deterministic V1 recipe generation in `src/corpus/v1ReleaseRecipeGenerator.js`;
5. rebuilt the 500-recipe corpus from the 600 curated ingredient foundation;
6. added a deterministic 60-recipe / 12-strata review gate;
7. froze the resulting catalog at `1.0.0`.

The final recipe digest is:

`7416f74b668bf44f8c2abf0c77e3f659ffb145f0b0c5141b9d08a74304cd6780`

Re-running build → review → publish produced byte-identical frozen generated data.

## 3. Corpus freeze results

Final publication:

- publication channel: `production_release`;
- `releaseEligible=true`;
- `requiredHumanReview=false`;
- stratified review: 60 recipes across 12 strata;
- review status: passed;
- schema errors: 0;
- unknown ingredient references: 0;
- nutrition errors: 0;
- allergen derivation errors: 0;
- missing required locale fields: 0;
- exact duplicate recipes: 0;
- near duplicate recipes: 0.

Pack sizes:

- `core`: 500;
- `quick`: 372;
- `high_protein`: 136;
- `vegetarian`: 372.

## 4. Planner/effective-plan correction

The rebuilt corpus exposed a latent replacement bug. `commitReplacement()` previously regenerated a ranked top-20 preview with another seed. A recipe legitimately shown to the user could therefore disappear from that second top-20 and be rejected at commit time.

The commit path now validates the selected RecipeVersion directly against the current hard-filter context. Ranking determines what is suggested; it no longer determines whether an otherwise admissible user selection can be committed.

Step 2 engine acceptance remains green on the frozen corpus: 6/6 scenarios.

## 5. Backup and local-data deletion

Added `src/services/localDataService.js` and the destructive action on the Backup page.

Default delete behavior:

- resets all application repository/IndexedDB state;
- removes owned `ydm:*` localStorage state;
- preserves public PWA shell/data caches by default so the app can bootstrap again;
- optionally supports deleting owned public caches when explicitly requested.

New Step 3 tests verify:

- V1 `1.0.0` backup validation;
- backup round-trip restores user configuration and preserves the 500 base recipes;
- local-data deletion removes private app state;
- unrelated localStorage/cache entries are not removed;
- explicit public-cache deletion removes only `ydm-shell` / `ydm-data` caches.

## 6. PWA, locale and workflow freeze

- PWA shell cache: `v29`;
- data cache: `v14` in both service worker and direct offline catalog service;
- IT/EN locale parity: 676 / 676 keys;
- previous corpus-writing workflows (`production-corpus`, `controlled-scale-500`, `production-review-500`) are retired from active GitHub Actions;
- new manual `Verify V1 Release Candidate` workflow deterministically rebuilds/reviews/publishes and fails if committed frozen output drifts;
- Pages deployment continues to run `npm run check` with `YDM_BROWSER_REQUIRED=1`.

Historical corpus tools remain in source/Git history for post-V1 expansion; they are no longer active release writers.

## 7. Verification performed

Completed in the Step 3 environment:

- V1 Step 1 gate: **14/14 PASS**;
- V1 Step 2 gate: **12/12 PASS**;
- V1 Step 2 engine: **6/6 PASS**;
- V1 Step 3 freeze gate: **22/22 PASS**;
- full repository tests: **192/192 PASS**;
- JavaScript syntax/lint: **157 files PASS**;
- accessibility source audit: **16/16 PASS**;
- form/contract audit: **PASS**;
- revision closure: **13/13 PASS** after browser report generation;
- planner smoke: **PASS**;
- GitHub Pages build for `/yourDietManager/`: **PASS**;
- Pages artifact audit: **PASS**;
- deterministic release corpus rebuild: **byte-identical PASS**.

### Chromium limitation in this execution environment

Chromium starts, but local HTTP navigation is blocked by the execution environment policy (`127.0.0.1 is blocked`). The browser regression therefore records `SKIPPED` locally for this specific environment condition.

This does not weaken CI: GitHub Pages sets `YDM_BROWSER_REQUIRED=1`, so an unavailable/skipped/failing Chromium run is a blocking failure there.

## 8. Stable release gate remains intentionally blocked

`release:gate` has been rewritten around the actual V1 500-recipe freeze contract; the old 3,000-recipe requirement is removed.

It will still block this candidate because:

- app version is `1.0.0-rc.27`, not `1.0.0`;
- manual acceptance is `pending`;
- stable promotion is explicitly disallowed until the final product test is accepted.

This is the intended state.

## 9. Final manual test

Use `V1_FINAL_TEST_CHECKLIST.md` against the deployed GitHub Pages candidate after the Step 3 push. It covers:

- clean startup/catalog;
- configuration and hard safety;
- planner → effective plan → replace/rebalance/adherence/undo-redo;
- shopping/checklist/reload;
- backup/restore;
- IT/EN/accessibility sanity;
- PWA/offline sanity;
- local-data deletion as the final destructive test.

## 10. Promotion after acceptance

If the final manual test is accepted and CI is green, do **not** regenerate the corpus or change schemas/IDs. Final promotion is limited to:

1. record manual acceptance as accepted;
2. change application version `1.0.0-rc.27` → `1.0.0`;
3. keep catalog `1.0.0` unchanged;
4. keep DB `5`, content schema `3`, backup format `1`, and `v1-freeze-epoch-1` unchanged;
5. run stable release gate;
6. create `v1.0.0` tag/release.

Any manual-test blocker that requires a data/schema/catalog change invalidates the freeze and requires Step 3 validation again before promotion.
