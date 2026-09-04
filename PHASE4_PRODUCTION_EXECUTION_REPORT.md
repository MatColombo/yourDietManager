# Phase 4 Production Corpus — Missing-Step Execution Bridge Report

Date: **2026-09-04**  
Candidate: **`1.0.0-rc.18`**  
Status: **EXECUTION CONTROL PLANE COMPLETE / SOURCE-BACKED RUN REQUIRED**

## 1. Objective

rc.14 implements the missing executable path between the completed 4P-B/4P-C control planes and real corpus production. It does **not** declare the production corpus complete and does not substitute synthetic nutrition data for USDA source records.

A source-backed rc.16 run later reached the first industrialized scale batch and exposed a specialized-generator contract mismatch: all 125 oversampled candidates became non-terminal review backlog because the generic focused planner could enrich the portable mini-meal focus with nutrition dimensions not supported by that generator. rc.17 fixes the first-batch contract with `intentStrategy=focus_only`; it does not weaken the zero-backlog gate. Failure evidence is persisted before verification.

The required order is now executable and fail-closed:

`USDA acquisition -> pending review intake -> bounded deterministic review -> curated/high materialization -> explicit fixture retirement -> pilot readiness -> 6 x 20 pilot waves -> Scale Gate 500 ready -> first 100-accepted 4P-C batch -> rescan`

## 2. Source-backed ingredient foundation

The curation policy remains bound to the frozen trusted-source hierarchy:

- USDA FoodData Central Foundation Foods 04/2026 as primary source;
- USDA FoodData Central SR Legacy 04/2018 as generic supplemental source;
- Branded foods excluded from this production-foundation path.

The execution target is **600 curated/high ingredient families**, while the pilot floor remains **>=400**. Source acquisition writes SHA-256 and extracted-file provenance. Raw source archives are runtime-only and are ignored by Git/source commits.

Import remains review intake only. Every imported record starts pending/unapproved. The later reviewer `ydm-deterministic-fdc-curator-v1` may approve a row only when all bounded source/category/nutrient/taxonomy/safety rules are satisfied and all eight review dimensions are persisted explicitly. There is no fuzzy duplicate merge, guessed taxonomy value, or automatic taxonomy creation.

## 2.1 rc.14 USDA importer resilience fix

A real GitHub Actions run against `FoodData_Central_foundation_food_json_2026-04-30.json` exposed at least one `null` element in the USDA food array. rc.13 dereferenced `food.foodNutrients` unconditionally and failed before review intake. rc.14 makes the import boundary null-safe without weakening review or readiness requirements:

- non-object/null food elements are skipped and counted as structurally invalid;
- food records without `fdcId` are skipped and counted separately from nutrient-incomplete foods;
- null/non-object entries inside `foodNutrients` are ignored while valid nutrient entries remain usable;
- importer output records `structurallyInvalidFoodCount` plus up to 20 indexed reason samples;
- curation assessment exposes structural skips as a warning, never as materializable data;
- the production target is still evaluated only from valid reviewed/materialized ingredients.

A regression test now reproduces null food records, missing-FDC-ID records and null nutrient entries.


## 2.2 rc.15 USDA energy-basis and coverage fix

A GitHub Actions production run reached `corpus:auto-curate-fdc` with `targetMet=true` at 600 ingredients but failed frozen pilot group minimums for pasta/rice/cereals (27/40), eggs (13/15), and herbs/spices (12/20). Diagnostics also showed a very large `macro_energy_mismatch` rejection count. The root cause was source semantics: rc.14 selected whichever energy nutrient appeared first in each USDA JSON record and then applied a universal General-factor 4/4/9 comparison. FoodData Central can expose both nutrient 2047 (Atwater General) and 2048 (Atwater Specific), and SR Legacy uses nutrient 1008.

rc.15:

- deterministically prefers 2047 over 2048 for Foundation Foods, independent of JSON order;
- preserves `energyBasis` and `energyNutrientId` in review intake and materialized IngredientRevision provenance;
- applies the blocking 4/4/9 mismatch rule only to Atwater General/unknown-basis records, not Atwater Specific or SR Legacy energy;
- expands conservative descriptor refinement for common pasta forms and herbs/spices that can live in broader USDA categories;
- adds unique eligibility/capacity diagnostics by group and energy basis;
- keeps all frozen group minimums unchanged.

## 2.3 rc.16 USDA curation/materialization nutrition-contract fix

The first rc.15 source-backed run reached `corpus:materialize-usda` and failed on auto-approved FDC record `746768` with `nutrition_out_of_bounds_energyKcal`. This exposed a contract split: materialization enforced `ingredient-curation-v1.nutritionBoundsPer100g`, while deterministic auto-curation did not.

rc.16 makes the gate single-source and fail-closed:

- `ingredientNutritionBoundIssues()` is the shared bound checker used by materialization readiness and auto-curation;
- `corpus:auto-curate-fdc` loads the frozen curation policy and passes its exact nutrition bounds into candidate eligibility;
- out-of-bound rows are rejected before approval and therefore cannot fail later merely because materialization applies stricter bounds;
- the FDC importer records the Energy unit, preserves kcal, converts kJ to kcal with `value / 4.184`, and records original value/unit/conversion metadata;
- unknown generic Energy units are not silently interpreted as kcal;
- the provenance fields are carried into the materialized IngredientRevision source record.

No nutrition bound or group quota is relaxed.

## 3. Deterministic curation hardening

rc.13 adds source-row filters and mappings required for real FoodData Central data:

- mixed USDA `Dairy and Egg Products` is refined by descriptor into eggs, cheese, or milk/yogurt rather than mapped wholesale to dairy;
- physical state is not guessed; ambiguous rows use conservative `as_sold`;
- Italian labels use controlled translations where available and otherwise preserve the exact source qualifier so distinct cuts/concepts do not collapse to one display/concept key;
- major allergens use conservative descriptor/category rules;
- required macro/fiber fields must be finite;
- rows with declared energy versus macro-derived energy mismatch above 20% are excluded from automatic approval;
- exact concept-key deduplication is allowed; fuzzy semantic merge is forbidden;
- minimum inventory by production food group is enforced in addition to the global count.

The curation gate must also identify source-backed replacements for the four Phase 1 ingredient fixtures: salmon, cooked rice, zucchini and olive oil.

## 4. Explicit fixture retirement

Development fixtures are not deleted by name matching. The execution creates an explicit, schema-valid retirement map from curated/high USDA replacements. Only after all four ingredient mappings are valid may the three Phase 1 recipe fixtures be retired while preserving immutable history.

This removes the development nutrition errors from the production trajectory without rewriting historical versions.

## 5. Pilot execution

`corpus:pilot-execute` consumes only the clean curated production foundation. It:

1. requires `readyForPilot=true`;
2. replans the frozen 120-slot intake;
3. completes canonical reference scans and resolution;
4. refuses unresolved taxonomy proposals/reference requests;
5. generates deterministic candidates using only active `curated/high` ingredients;
6. processes six ordered waves of 20 through the real Recipe Pipeline;
7. requires every wave to close 20 accepted / 0 rejected before advancing;
8. writes canonical pilot intake, proposals, wave reports and a `pilot-corpus-bundle.json`.

Synthetic production-fixture verification proves the execution mechanics can close **120/120 accepted** with zero unresolved references. This is a test of the execution path, not a claim that the USDA-backed pilot has already run.

## 6. First 4P-C industrialized batch

After the real pilot closes, the script recomputes Scale Gate 500. No scale job can be created unless the gate state is exactly `ready`.

The first industrialized run creates 125 deterministic candidates targeting 100 accepted recipes, uses the 4P-C stale-snapshot/digest/review-backlog gates, applies only a passing batch, and immediately rescans the resulting working corpus.

Synthetic production-fixture verification proves the industrialized pipeline reaches **100 accepted** with zero review backlog under a clean production fixture. After the real workflow, the expected working corpus trajectory is approximately 120 pilot recipes + 100 first-scale recipes (plus any retained non-development production content); Scale Gate 500 remains a trajectory gate until cumulative active production recipes reach 500.

## 7. GitHub Actions network execution

`.github/workflows/production-corpus.yml` is the canonical network-enabled executor. It is manual (`workflow_dispatch`) and defaults to:

- `target_ingredients=600`;
- `commit_results=false`.

The workflow uses current Node-24-generation GitHub actions (`actions/checkout@v7`, `actions/setup-node@v7`), executes all data gates in order, uploads diagnostics/evidence even on a failed run, and commits generated working data only when `commit_results=true` is explicitly requested.

The working bundle is not a V1 release artifact. Source ZIPs are never added to Git.

## 8. Local environment boundary

The build/runtime environment used to assemble rc.13 can reach FoodData Central documentation but cannot download the official USDA ZIP archives. Therefore the real source-backed materialization was **not executed locally**. No production ingredient count, pilot completion, or first-scale acceptance count is claimed from synthetic/source-substitute data.

Current bundled baseline remains intentionally blocked:

- production-ready ingredient families: **0 / 400 minimum**;
- pilot terminal records: **0 / 120**;
- active development recipes: **3**;
- Scale Gate 500: **blocked**;
- V1 release gate: **blocked**.

## 9. Verification

Final rc.13 verification after the execution-bridge changes:

- dedicated source/curation/pilot/workflow tests: PASS;
- synthetic six-wave pilot: **120/120 accepted**;
- synthetic first industrialized scale batch: **100 accepted**, zero review backlog;
- full automated suite: **149/149 PASS**;
- JavaScript syntax: **134 files PASS**;
- production execution control plane: **14/14 PASS**;
- 4P-A: PASS;
- 4P-B control plane: PASS, local data gate blocked;
- 4P-C control plane: PASS, Scale Gate blocked on real prerequisites;
- accessibility: **16/16 PASS**;
- form contract: PASS;
- scale benchmark: PASS;
- Pass E closure: **13/13 PASS**;
- root build/Pages audit: PASS;
- `/yourDietManager` GitHub Pages build/audit: PASS;
- browser bootstrap: DevTools starts locally; navigation remains skipped only because this execution environment blocks localhost HTTP;
- `corpus:production-readiness -- --pilot-strict`: expected exit **2** on current bundled baseline;
- `corpus:scale-gate-500 -- --strict`: expected exit **2**;
- `release:gate`: expected exit **2** with the five existing production-content blockers.

## 10. Completion boundary and next action

The missing-step **execution machinery** is complete. The missing-step **production data run** is not complete until the GitHub workflow succeeds against the official USDA archives.

Recommended first network run: dispatch **Build Production Corpus Working Set** with `target_ingredients=600` and `commit_results=false`. Review the uploaded acquisition/curation/pilot/scale evidence. Only after a clean artifact review should the same result be committed or the workflow be rerun with explicit `commit_results=true`.

After a successful source-backed run, continue with **4P-D — Controlled Scale 500 -> 1500 -> 3000+**; do not start 4P-D from the bundled development baseline.

### rc.18 first-scale candidate feasibility

A later source-backed rc.17 run reduced first-batch review backlog to 2. The remaining candidates exposed the portable generator's hard-coded `0.55-1.8` amount scaling clamp. rc.18 replaces that heuristic with a deterministic feasibility solver over the frozen energy range and production amount bounds, retries alternate canonical triples when needed, and fails before batch processing for unsupported protein/fiber-constrained jobs. Zero-review-backlog remains mandatory.
