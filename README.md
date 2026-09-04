# yourDietManager — V1 Release Candidate

Local-first PWA implementation through **Phase 8 — Hardening & V1 release gates**.

Candidate version: **`1.0.0-rc.20`**.

Phases 1–7 remain fully present: IndexedDB persistence, onboarding/configuration, backup/import, IT/EN, theme engine, indexed catalog/search/packs, versioned catalog authoring, corpus-orchestration tooling, deterministic seeded plan generation, effective-plan UX with history/undo, shopping checklists and preparation horizon.

## Phase 8 adds

- bounded catalog browsing and operation-history access at 10k scale;
- IndexedDB DB v3 / content schema v2 migration and interruption recovery;
- catalog update journaling, recovery and reversible active-state rollback;
- offline catalog-pack shard caching;
- storage/quota and integrity metrics;
- accessibility hardening for keyboard, focus, landmarks, reduced motion and forced colors;
- automated accessibility and 10k-scale hardening gates;
- an explicit final V1 release gate.

See `PHASE8_IMPLEMENTATION_REPORT.md` for the full implementation and verification record.

## V1 Data/UX Hardening — Pass A + Pass B + Pass C + Pass D + Pass E

Pass A through Pass E are implemented on top of the release candidate. The current runtime remains **IndexedDB DB v4 / content schema v3** with canonical `taxonomies` / `taxonomyTerms`, a 7-taxonomy/113-term seed registry, reference-data digest/versioning, semantic validation and audited legacy migration.

Pass B makes those contracts the normal UI path: `Configura -> Tassonomie e reference data`, canonical autocomplete selectors for entity/taxonomy references, chip multi-selects for recipe taxonomy metadata, hierarchical food group/subgroup selection, localized closed enums, ingredient-dependent recipe-line units, unified MealArchetype defaults and inline validation. Semantic CSV/free-text entry is no longer used by ordinary authoring/configuration forms.

Pass C disables the provisional onboarding UI and boots fresh installs with a neutral standard configuration; centralizes disclosure state, dirty-route protection and persistent save/error notifications; fixes `DayClass.capabilities`; and live-validates forms against schema, cross-record invariants and reference data before Save. Background rerenders no longer replace a dirty editor.

Pass D makes recipe/ingredient detail independent from planning, adds canonical dynamic detail/edit routes, exposes Edit for both catalog and local families, and keeps internal revision/version history immutable. Editing a catalog family promotes that stable family ID to local management; later catalog updates/pack installs cannot overwrite its local current pointer. Duplicate remains a distinct new-family action. A dependency-free Chromium/CDP regression harness is included and is required by the GitHub Pages workflow; local environments that block localhost are reported as skipped rather than passed. See `DATA_UX_HARDENING_PASS_D_REPORT.md`.

Pass E turns the final interaction acceptance into an explicit gate. rc.7 hardened GitHub Actions browser startup; rc.8 corrected the dirty-navigation acceptance and CDP diagnostics; rc.9 fixes a real legacy-upgrade bootstrap failure by explicitly migrating non-hard `ingredient:uova` FoodPreferences to canonical `foodCategory:food_group_eggs` and adds a pre-app Service Worker recovery bootstrap so a fatal application bootstrap cannot pin stale cached modules. Browser coverage includes required-field/schema parity, disclosure preservation after local rerenders, dirty-navigation reject/accept, persistent save feedback, and the existing recipe/ingredient detail/edit path. `npm run hardening:revision` verifies that code, docs, Skill guidance, CI browser requirements and the latest browser report stay aligned. See `DATA_UX_HARDENING_PASS_E_REPORT.md`.



## Phase 4 production execution — rc.15 USDA energy-basis fix

A real production-corpus run reached the deterministic curator with 600 approved candidates but failed group minima because rc.14 compared every USDA energy value against a universal 4/4/9 calculation. FoodData Central distinguishes Atwater General (2047) from Atwater Specific (2048), while SR Legacy energy (1008) can reflect food-specific factors. rc.15 preserves the energy basis at import, prefers 2047 for Foundation Foods regardless of JSON nutrient ordering, applies the blocking 4/4/9 consistency gate only where General-factor comparison is valid, and carries the energy basis into materialized IngredientRevision provenance. It also expands conservative descriptor classification for common pasta forms and herbs/spices. Frozen group minimums are unchanged.

## Phase 4 production execution — rc.14 importer resilience

The USDA review-intake boundary is null-safe for real FoodData Central JSON payloads. Null/non-object food elements and records without an FDC ID are skipped with explicit audit counts; null nutrient entries are ignored without discarding other valid nutrients on the same food. These skips do not relax curation, pilot, or production thresholds. See `PHASE4_PRODUCTION_EXECUTION_REPORT.md`.

## GitHub Pages

This package is GitHub Pages-ready. Use **Settings -> Pages -> Source: GitHub Actions**; do not publish the repository root directly. The included `.github/workflows/pages.yml` verifies the app, obtains the repository Pages `base_path`, builds `dist/`, checks the artifact and deploys it.

Project-site paths such as `https://USERNAME.github.io/yourDietManager/`, root user sites and root custom domains are supported without hardcoding the repository name. Direct SPA links are handled by the generated `404.html` redirect and deployment-specific `<base href>`.

See `GITHUB_PAGES_DEPLOYMENT.md` for the exact setup and troubleshooting model.

## Commands

```bash
npm run dev
npm run check
npm run hardening:a11y
npm run hardening:scale
npm run hardening:forms
npm run hardening:browser
npm run hardening:revision
npm run release:gate
```

No `npm install` is required.


## Phase 4 production — Pass A (4P-A)

4P-A introduces the versioned production-data control plane before any mass recipe generation:

- `corpus/contracts/v1-production.json` freezes production target 3,000/4,000/5,000, ingredient readiness 400/600/800 and a 120-candidate pilot;
- `schemas/production-corpus-contract.schema.json`, `production-corpus-intake.schema.json` and `production-corpus-readiness-report.schema.json` make the workflow machine-checkable;
- production planning filters out IngredientRevision records that are not `curated/high` instead of silently using development fixtures;
- pilot slots have explicit lifecycle `discovered -> needs_reference_review/needs_ingredient_review -> ready_for_generation -> generated -> accepted|rejected`;
- extensible taxonomy gaps create `ReferenceDataProposal` records; canonical matches are reused; materialization still requires explicit approval;
- `corpus:production-process` refuses candidates whose intake/reference scan is unresolved and stamps accepted RecipeVersion records with candidate/intake/contract provenance;
- production catalog manifests carry contract/policy digest metadata and the release gate requires the configured production pipeline version.

Current readiness is intentionally **not green**: the canonical reference registry is valid, but the current 4 ingredient fixtures are all `draft/low`, so production-ready ingredients are `0/400` and the 120-slot pilot must not be generated yet. See `PHASE4_PRODUCTION_PASS_A_REPORT.md` and `specs/PRODUCTION_CORPUS_CONTRACT.md`.

Commands:

```bash
npm run corpus:4pa
npm run corpus:production-readiness
npm run corpus:pilot-plan
npm run corpus:pilot-resolve
npm run corpus:production-process -- ...
```

## Phase 4 production — Pass B (4P-B)

4P-B implements the ingredient-curation and pilot-execution control plane without fabricating production nutrition data:

- `corpus/curation/v1-ingredient-curation-policy.json` freezes trusted source priority, editorial review requirements, nutrition plausibility bounds and 20-candidate pilot waves;
- USDA Foundation Foods April 2026 is the primary generic source; its frozen published inventory is 394, so the 400-family pilot floor structurally requires a supplemental source even before filtering;
- USDA SR Legacy is the only frozen supplemental source for this pass; Branded Foods and automatic fuzzy merges are forbidden;
- importers produce source-digested `pending` review batches only; heuristic taxonomy/state/allergen suggestions are never promoted automatically;
- materialization requires explicit review of Italian label, taxonomy, state, allergens, culinary suitability, duplicate status, nutrition and source provenance;
- approved materialization emits only `curated/high` revisions and an auditable source/digest manifest;
- existing development fixtures can be retired only through an explicit approved replacement map;
- the 120-slot pilot is divided into six waves of 20, and wave N+1 cannot start until wave N is terminal with zero unresolved references and zero unhandled taxonomy proposals.

This package intentionally remains `readyForPilotFoundation=false`: the execution environment could not acquire the official USDA binary/JSON source archive, so no trusted batch is vendored and no nutrient values were invented. The control plane is implemented and tested; production ingredient content and pilot execution remain blocked until source acquisition and editorial review are completed. See `specs/INGREDIENT_CURATION_PILOT_SPEC.md` and `PHASE4_PRODUCTION_PASS_B_REPORT.md`.

Commands:

```bash
npm run corpus:4pb
npm run corpus:fetch-fdc -- usda-foundation-2026-04
npm run corpus:import-usda -- <foundation-json> <review-batch.json>
npm run corpus:import-usda-sr -- <sr-legacy-json> <review-batch.json>
npm run corpus:ingredient-curation-report
npm run corpus:materialize-usda -- <review-batch.json> <output-dir> 1.0.0
npm run corpus:merge-curated-ingredients -- <catalog> <materialized-dir> <bundle> <retirement-map>
npm run corpus:pilot-wave-report -- 1
```

## Phase 4 production Pass C — industrialized recipe pipeline

4P-C implements the scale control plane without bypassing the 4P-B data gate. The companion policy `recipe-production-pipeline-v1@1.0.0` freezes stage order, objective scoring, explicit dispositions, review/retry rules, immutable batch digests and Scale Gate 500. Actual scale execution remains blocked in the bundled local fixture until the 400 curated/high ingredient foundation exists and the 120/120 pilot intake is terminal with zero unresolved references/proposals. rc.13 adds the network-enabled execution path that performs those prerequisites on GitHub Actions from the frozen USDA sources.

Commands:

```bash
npm run corpus:4pc
npm run corpus:scale-gate-500
npm run corpus:production-job-intake -- <job.json>
npm run corpus:production-run-batch -- <job.json> <candidates.json>
npm run corpus:production-review -- <batch-report.json> <intake.json> <decisions.json>
npm run corpus:production-apply -- <batch-report.json> <batch-result.json> <staging-dir>
```

Only `accepted`, `rejected` and `duplicate` are terminal dispositions. `needs_reference_review`, `needs_recipe_review` and `nutrition_outlier` remain quarantined until governed resolution. A batch can be applied only when its gate is `pass`, its review backlog is zero and its digest still matches the job/policy/snapshot/decision set. See `specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md` and `PHASE4_PRODUCTION_PASS_C_REPORT.md`.

## Current status

**Phase 8 implementation is complete and the hardening suite is green.**

The repository is intentionally still a **release candidate**, not V1.0 final. The final release gate blocks promotion because the bundled base catalog is still the development fixture: 3 recipes, 4 low-confidence/draft ingredient revisions, `pipelineVersion=phase3-fixture`, `catalogVersion=0.3.0-dev`.

The remaining V1 data gate is governed by the 4P-A contract and the 4P-B curation/pilot gates rather than an informal recipe-count target: first materialize at least 400 production-ready curated/high ingredients, then run the 120-candidate pilot through reference/ingredient intake, and only after its acceptance/coverage review scale toward 3,000–5,000 validated recipes. Pass E implementation closes the hardening revision; the GitHub Actions verification step requires the full final-acceptance browser regression instead of silently accepting a skipped browser run. After the production corpus is complete, rerun `npm run check` and `npm run release:gate`; only a fully green gate should be tagged `1.0.0`.


## Mandatory data/UX hardening before production corpus

The production Phase 4 corpus remains paused only for the production-data gate. Pass A canonicalizes and validates reference data at data/service/pipeline boundaries; Pass B replaces normal semantic free-text/CSV paths with guided canonical controls; Pass C hardens editor state/feedback, form/schema parity and neutral bootstrap; Pass D closes recipe/ingredient detail and transparent editing/versioning; Pass E closes the end-to-end acceptance gate for editor integrity and browser interactions. The corpus orchestrator/pipeline can propose/materialize required extensible taxonomy terms before recipe generation, while closed registries remain non-extensible. See `DATA_UX_HARDENING_REVISION.md`, `DATA_UX_HARDENING_PASS_D_REPORT.md`, `DATA_UX_HARDENING_PASS_E_REPORT.md`, `REFERENCE_DATA_FIELD_INVENTORY.md` and `specs/REFERENCE_DATA_TAXONOMY_SPEC.md`.


## Phase 4 production execution bridge — rc.13

rc.13 implements the missing execution chain without relaxing the 4P-A/4P-B/4P-C gates. The canonical network-enabled runner is `.github/workflows/production-corpus.yml` (`Build Production Corpus Working Set`). It performs:

1. official USDA Foundation Foods 04/2026 + SR Legacy 04/2018 acquisition with archive SHA-256;
2. review-intake import;
3. deterministic high-confidence review (`ydm-deterministic-fdc-curator-v1`) restricted to generic, nutrient-complete, rule-mappable records; no fuzzy semantic merge and no taxonomy creation;
4. materialization of only explicit eight-check `curated/high` approvals;
5. explicit replacement/retirement of the four Phase 1 ingredient fixtures and three Phase 1 recipe fixtures, preserving history;
6. pilot-readiness hard gate (`>=400` current curated/high ingredients);
7. deterministic execution of all six pilot waves, requiring 120/120 accepted and zero unresolved references/proposals;
8. Scale Gate 500 transition to `ready`;
9. first industrialized 4P-C batch targeting 100 accepted recipes;
10. upload of the working bundle and audit evidence. `commit_results=true` is optional and explicit; source archives are never committed.

The execution container used to build this package cannot download the USDA ZIP payloads, so the bundled local catalog remains the development fixture and `readyForPilot=false`. This is an environment/network limitation, not a bypass: `npm run corpus:production-execution` validates the execution control plane while the GitHub workflow is responsible for the real source-backed run. See `specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md` and `PHASE4_PRODUCTION_EXECUTION_REPORT.md`.

Additional commands:

```bash
npm run corpus:auto-curate-fdc -- <foundation-review.json> <sr-review.json> <out-dir> 600
npm run corpus:combine-materialized -- <out-dir> <foundation-dir> <sr-dir>
npm run corpus:generate-fixture-retirement -- <materialized-dir>
npm run corpus:retire-recipe-fixtures -- <bundle.json>
npm run corpus:pilot-execute -- <clean-foundation-bundle.json> <out-dir> --canonical
npm run corpus:first-scale-batch -- <pilot-corpus-bundle.json> <out-dir> --canonical
npm run corpus:production-execution
```



## Phase 4 production execution — rc.20 mutable-working-set test isolation

The source-backed rc.19 workflow reached 600 curated/high ingredients, closed the 120/120 pilot, applied the first 100-recipe scale batch, and then failed only when `npm test` ran against canonical files already mutated by that same workflow. Four tests were incorrectly stateful: they assumed development `public/data`, an open pilot intake, an empty fixture-retirement map, and a 0/120 Scale Gate baseline. rc.20 makes 4P-B/4P-C baseline tests load the immutable `corpus/staging/phase4-smoke-base-bundle.json` and regenerate a fresh pilot intake with `planPilotIntake()`. The retirement-map test now validates explicit approval semantics whether the canonical map is empty or populated. Production execution remains unchanged; this is test isolation, not a gate relaxation. The application shell cache advances to `ydm-shell-v22`; the data cache remains `ydm-data-v10`.

## Phase 4 production execution — rc.19 exact focus coverage matching

The source-backed rc.18 run reached Scale Gate 500 `ready` and generated 125 nutritionally feasible candidates, but all 125 were terminally rejected. Root cause: `focus_only` matched compound coverage cells when **any** criterion matched the focus, so `practical_portable` silently attached three mutually incompatible portable energy-band cells to the same job. rc.19 requires all criteria of a compound target to be explicitly present in the frozen focus. The first portable scale job therefore binds only `meal-mini_meal-coverage` and `practical-portable-coverage` unless an energy band is explicitly requested. `pre-verify-summary.json` also includes rejection counts by code.

## Phase 4 production execution — rc.18 feasible amount solver

A source-backed rc.17 run reached the first industrialized batch with only `reviewBacklogCount=2`, proving the `focus_only` contract fix removed the broad planner/generator mismatch. The two remaining non-terminal candidates exposed a second generator defect: amount scaling toward the job energy midpoint was artificially clamped to `0.55-1.8`, so dense USDA combinations could remain outside the frozen `150-499 kcal` band. rc.18 replaces that heuristic with a deterministic feasibility solver derived from the actual production constraints: job energy range, `<=1500 g` per ingredient line, and `40-2500 g` total normalized portion. Infeasible combinations are retried deterministically; unsupported protein/fiber bands fail before batch execution. The zero-review-backlog gate remains unchanged.

## Phase 4 production execution — rc.17 first-scale intent contract

A source-backed run reached the first industrialized 4P-C batch with `reviewBacklogCount=125`. The failure exposed a planner/generator contract mismatch: `focused_expansion` could enrich the requested `mini_meal + practical_portable` focus with global energy/protein/fiber deficits, while the specialized portable generator only targeted its portable mini-meal structure. rc.17 introduces `goal.intentStrategy=focus_only` for this first batch. The resulting job keeps the mini-meal default energy range `150-499 kcal`, leaves `proteinG` and `fiberG` unconstrained, and carries only focus-matching coverage targets. The zero-review-backlog apply gate remains unchanged.

The first-scale runner writes `job.json`, `batch-report.json` and `pre-verify-summary.json` before final verification, and the production workflow uploads those files on failure. `pre-verify-summary.json` now also reports rejection counts by code. For `focus_only`, a compound coverage cell is attached to the job only when every criterion in that cell is explicitly present in the frozen focus; a portable focus alone must not silently attach mutually incompatible energy-band cells. The rc.19 planner-only application change is deploy-safe with `ydm-shell-v21` / `ydm-data-v10`.

## Phase 4 production execution — rc.16 curation/materialization nutrition contract

A real production run reached materialization with an auto-approved USDA record (`FDC 746768`) that violated the frozen `nutritionBoundsPer100g` energy gate. rc.16 removes the contract split: deterministic auto-curation now applies the exact curation-policy nutrition bounds before approval, so a record that cannot materialize cannot be marked approved. The FDC importer is also unit-aware for Energy: kcal is preserved, kJ is converted explicitly to kcal, and original value/unit/conversion provenance is carried through the curation batch into the materialized IngredientRevision source metadata. Generic Energy with an unknown unsupported unit is not relabeled as kcal. Frozen nutrition bounds and pilot quotas are unchanged.
