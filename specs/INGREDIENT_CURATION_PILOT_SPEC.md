# Ingredient Curation & Pilot Execution Spec — 4P-B

Status: **normative for Phase 4 production Pass B**.

This specification extends `PRODUCTION_CORPUS_CONTRACT.md`. It does not relax the frozen production thresholds or the rule that recipes may reference canonical, production-ready data only.

## 1. Purpose

4P-B converts the 4P-A control plane into an executable production-data workflow:

1. acquire trusted ingredient source material;
2. import source rows as review candidates, never as canonical facts;
3. complete explicit editorial review;
4. materialize only approved `curated/high` IngredientRevision records;
5. merge them without implicit replacement of development fixtures;
6. start the 120-candidate recipe pilot only after the ingredient/reference-data readiness gate is green;
7. execute the pilot in gated waves of 20.

The implementation must fail closed when trusted source files or editorial decisions are missing.

## 2. Frozen curation policy

The machine-readable authority is:

`corpus/curation/v1-ingredient-curation-policy.json`

Identity:

- policy: `ingredient-curation-v1@1.0.0`;
- production contract: `ydm-v1-production-corpus@1.0.0`;
- minimum active production-ready ingredient families before pilot: 400;
- target: 600;
- maximum planned foundation: 800.

The policy is schema validated by `ingredient-curation-policy.schema.json`.

## 3. Trusted source hierarchy

### 3.1 Primary source

`usda-foundation-2026-04`

- provider: USDA FoodData Central;
- dataset: Foundation Foods;
- release: April 2026;
- role: primary;
- generic foods only;
- published inventory recorded by the frozen policy: 394 foods.

Because 394 is below the frozen 400-family pilot floor, the primary source cannot satisfy the minimum by itself even before nutrient-completeness, duplicate, culinary-suitability, or taxonomy filtering.

### 3.2 Supplemental source

`usda-sr-legacy-2018-04`

- provider: USDA FoodData Central;
- dataset: SR Legacy;
- role: supplemental;
- generic foods only.

At least six approved supplemental concepts are structurally required if all 394 Foundation Foods were usable and unique. In practice the supplemental requirement may be larger after review.

### 3.3 Forbidden shortcuts

- Do not use USDA Branded Foods for the V1 generic ingredient foundation.
- Do not fabricate nutrient values to satisfy counts.
- Do not merge source rows by fuzzy text similarity automatically.
- If the primary source and supplemental source express the same canonical concept, the primary source wins only after explicit duplicate review.
- Do not treat importer heuristic suggestions as canonical data.

## 4. Source acquisition and provenance

Trusted binary/JSON source material is not committed silently by the build.

Acquisition workflow:

```bash
npm run corpus:fetch-fdc -- usda-foundation-2026-04
npm run corpus:fetch-fdc -- usda-sr-legacy-2018-04
```

The acquisition helper:

- downloads only a source declared in the frozen policy;
- computes SHA-256 over the downloaded archive;
- extracts it into the ignored source cache;
- writes an acquisition manifest.

Import batches must include:

- source ID;
- provider/dataset/release;
- source record ID per row;
- archive/reference metadata;
- source input digest;
- import timestamp.

A missing source ID, record ID, or digest blocks production curation.

## 5. Import is review intake, not publication

Import commands:

```bash
npm run corpus:import-usda -- <foundation-json> <review-batch.json>
npm run corpus:import-usda-sr -- <sr-legacy-json> <review-batch.json>
```

The import adapters may suggest:

- canonical ingredient ID candidate;
- English name;
- food group/subgroup;
- flavor profile;
- meal archetypes;
- physical state;
- allergen IDs.

Every imported row starts with:

- `review.decision = pending`;
- `review.approved = false`;
- all editorial review checks false.

Therefore an imported record cannot become an IngredientRevision without an explicit review edit.

## 6. Required editorial review dimensions

Before `review.decision=approved` can be materialized, all of the following must be explicit and true:

1. Italian label reviewed;
2. taxonomy reviewed against canonical reference-data IDs;
3. physical/state value reviewed and not `unknown`;
4. allergen mapping reviewed;
5. culinary suitability reviewed;
6. duplicate/concept overlap reviewed;
7. nutrient values reviewed against broad plausibility bounds;
8. source/provenance reviewed.

Additionally:

- `reviewer` is mandatory;
- `reviewedAt` is mandatory;
- canonical group/subgroup relationships must validate;
- meal archetypes must be valid enumerated archetypes.

An `approved=true` flag with any incomplete review dimension is an invalid approval and must block materialization.

### 6.1a USDA energy basis

FoodData Central energy values are source semantics, not interchangeable fields. Importers must preserve the selected energy basis and nutrient ID. For Foundation Foods the deterministic preference is `2047` Atwater General, then `2048` Atwater Specific, then legacy `1008` only as fallback. For SR Legacy, `1008` remains the primary historical energy field. A blocking `4/4/9` macro-energy comparison is valid only for Atwater General values (or legacy records with no basis metadata); Atwater Specific and SR Legacy energy must not be rejected merely because they differ from General factors. Broad nutrition bounds, provenance, and downstream recipe gates still apply.

### 6.1 Deterministic bounded reviewer (rc.13 execution amendment)

The requirement for explicit review does **not** require a human click for every source row. After import has created only `pending` review intake, the later reviewer `ydm-deterministic-fdc-curator-v1` may write an explicit approval when—and only when—the source row satisfies every bounded rule in `PRODUCTION_CORPUS_EXECUTION_SPEC.md`. The reviewer must persist all eight review dimensions, reviewer identity, review timestamp, source ID/FDC ID, exact rule-based taxonomy mapping and provenance notes.

This amendment does not authorize import-time approval, fuzzy duplicate matching, guessed semantic values, automatic taxonomy creation, or approval of rows outside the frozen source/category/nutrient/safety rules. Such rows remain pending/rejected for human review.

## 7. Taxonomy discoveries during ingredient review

If source review requires a semantic value absent from an extensible taxonomy:

1. do not type a provisional free-text value into the canonical ingredient;
2. create a `ReferenceDataProposal` using the same lifecycle introduced in 4P-A;
3. review the proposal;
4. materialize it only when explicitly approved;
5. re-run reference-data validation;
6. only then finish the ingredient review.

Closed taxonomies remain closed. A missing term never authorizes a fuzzy substitute.

## 8. Materialization

Command:

```bash
npm run corpus:materialize-usda -- <review-batch.json> <output-dir> <catalog-version>
```

Only fully approved rows are materialized. Each output revision must be:

- `origin=base`;
- `quality.status=curated`;
- `quality.confidence=high`;
- bound to the reviewed source record;
- bound to the source input digest via provenance notes;
- schema-valid;
- reference-data-valid.

The materializer also produces a manifest containing source batch identity, input digest, curation policy identity, catalog version, and materialized ingredient IDs.

## 9. Duplicate handling and legacy fixture retirement

Newly curated ingredients never overwrite an existing ingredient family implicitly.

`corpus:merge-curated-ingredients` rejects ID collisions. Development fixture retirement is governed by:

`corpus/curation/v1-legacy-fixture-retirement.json`

Every retirement entry must declare:

- legacy ingredient ID;
- newly materialized replacement ingredient ID;
- rationale;
- approver;
- approval timestamp.

A retirement can point only to an ingredient in the current materialized set. An empty retirement map means no existing family is retired.

## 10. Readiness before pilot wave 1

The ingredient curation readiness report must be generated before pilot execution:

```bash
npm run corpus:ingredient-curation-report
npm run corpus:production-readiness
```

Wave 1 must remain blocked unless at minimum:

- canonical reference-data registry validates;
- at least 400 active current ingredient families satisfy the production `curated/high` gate;
- no required source/curation blocker remains;
- production corpus contract and policy bindings validate.

`ProductionCorpusReadinessReport.pilotBlockers` is intentionally separate from final production `blockers`. The pilot must **not** wait for the 3,000-recipe release floor or the final production manifest: those become relevant only to `readyForProduction`.

The application must not substitute the four development fixtures for missing production ingredients.

## 11. Pilot wave execution

The deterministic 120-slot pilot is executed in six waves of 20.

For each wave:

1. scan the 20 candidate intake records;
2. resolve or propose missing reference data;
3. curate missing ingredients;
4. move only fully resolved intake records to `ready_for_generation`;
5. generate/process candidates through `recipe-pipeline-2-production-intake`;
6. record accepted/rejected outcomes;
7. compute the wave report.

A wave closes only when:

- every record in that wave is terminal (`accepted` or `rejected`);
- unresolved reference requests = 0;
- unhandled taxonomy proposals = 0.

Wave N+1 is blocked until wave N closes. The sequence cannot be bypassed by manually invoking the recipe processor.

## 12. 4P-B completion definition

4P-B has two distinct statuses.

### Control plane implemented

This status requires:

- curation policy and schemas;
- trusted-source acquisition/import adapters;
- explicit review gate;
- materializer and merge/retirement gate;
- ingredient readiness report;
- gated pilot-wave reports;
- automated tests.

### Production data/pilot complete

This stronger status requires:

- trusted source batches acquired with digests;
- >=400 active production-ready curated/high ingredient families;
- editorial review complete for the materialized foundation;
- all six pilot waves executed and closed;
- 120 pilot slots terminal, with zero unresolved references/proposals;
- pilot acceptance/coverage/quality review completed.

Do not mark 4P-B production data/pilot complete while the source batch is absent or wave 1 is blocked.
