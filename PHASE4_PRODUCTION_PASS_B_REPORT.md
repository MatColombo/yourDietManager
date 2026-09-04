# Phase 4 Production Corpus — Pass B Implementation Report

Date: 2026-09-04  
Candidate: **`1.0.0-rc.11`**  
Pass: **4P-B — Ingredient Curation & Pilot Execution**

## Status

**CONTROL PLANE: IMPLEMENTED AND VERIFIED**  
**PRODUCTION INGREDIENT CONTENT: BLOCKED ON TRUSTED SOURCE ACQUISITION + EDITORIAL REVIEW**  
**120-CANDIDATE PILOT EXECUTION: NOT STARTED; WAVE 1 HARD-BLOCKED**

4P-B deliberately distinguishes implementation completion from production-data completion. The repository now contains the deterministic acquisition/import/review/materialization/pilot gates needed to execute the pass, but it does not pretend that absent external source records have been curated.

## 1. Frozen ingredient curation policy

Added `corpus/curation/v1-ingredient-curation-policy.json` and schema/public-schema mirrors.

Policy identity:

- `ingredient-curation-v1@1.0.0`;
- bound to `ydm-v1-production-corpus@1.0.0`;
- Foundation Foods April 2026: primary generic source;
- SR Legacy April 2018: supplemental generic source;
- Branded Foods: forbidden for the V1 generic foundation;
- automatic fuzzy source merge: forbidden;
- pilot wave size: 20.

The policy freezes a primary published inventory count of 394 against the production contract floor of 400. The source planner therefore computes a structural supplemental floor of six approved concepts before nutrient completeness, duplicate filtering and editorial review are considered.

## 2. Trusted source acquisition

Added `scripts/corpus/fetch-fdc-source.mjs` and `corpus:fetch-fdc`.

The acquisition helper:

- accepts only a source declared by the frozen curation policy;
- downloads the declared archive in an internet-connected environment;
- computes SHA-256 over the archive;
- extracts into ignored `corpus/sources/cache/<sourceId>`;
- writes an acquisition manifest;
- supports `--manifest-only` so policy/source identity can be tested without network access.

Both Foundation and SR Legacy manifest-only paths were executed successfully in this environment.

The execution environment could not resolve/download the external USDA binary archive. This is recorded as a production-data blocker; no nutrition values were fabricated or copied from an unverified alternate source.

## 3. Source import adapters

Added/refactored:

- `scripts/corpus/fdc-import-lib.mjs`;
- `scripts/corpus/import-usda-foundation.mjs`;
- `scripts/corpus/import-usda-sr-legacy.mjs`.

Import behavior:

- source input digest is mandatory;
- source record IDs are retained;
- Foundation and SR Legacy source identities are distinct;
- foods missing any required energy/protein/carbohydrate/fat/fiber field are excluded from eligible review rows rather than filled with synthetic values;
- food group/state/allergen/name mappings are suggestions only;
- every imported record starts `decision=pending`, `approved=false` with all editorial checks false.

## 4. Explicit editorial review contract

Added `src/corpus/ingredientCuration.js` and the curation batch/report schemas.

An approved source record is invalid unless all eight review dimensions are explicit:

1. Italian label;
2. taxonomy;
3. state;
4. allergens;
5. culinary suitability;
6. duplicate/concept overlap;
7. nutrition;
8. source/provenance.

The record additionally requires reviewer identity, review timestamp, non-unknown state, canonical food-group/flavor references and valid group/subgroup hierarchy.

Setting `approved=true` does not bypass a missing check. Such a row is counted as `blockedApproved` and cannot be materialized.

## 5. Materialization and provenance

`materialize-usda-reviewed.mjs` now requires the 4P-B policy and production contract.

Only fully approved records are emitted. Every resulting IngredientRevision is:

- schema-valid;
- canonical-reference-valid;
- `origin=base`;
- `quality.status=curated`;
- `quality.confidence=high`;
- traceable to source provider/dataset/release/source-record ID;
- traceable to source batch and input digest.

A materialization manifest records batch ID, source ID, source input digest, curation policy identity, catalog version and resulting ingredient IDs.

## 6. Merge and fixture retirement

Added:

- `scripts/corpus/merge-curated-ingredients.mjs`;
- `schemas/ingredient-retirement-map.schema.json`;
- `corpus/curation/v1-legacy-fixture-retirement.json`.

Rules:

- a newly curated family cannot silently overwrite an existing ingredient ID;
- replacement of the four development fixtures is not inferred from labels or aliases;
- retirement must be an explicit schema-valid mapping to an ingredient materialized in the current reviewed set;
- each retirement requires rationale, approver and approval timestamp.

The current retirement map is intentionally empty because no trusted replacement batch has yet been materialized.

## 7. Ingredient readiness reporting

Added `corpus:ingredient-curation-report`.

Current canonical report: `corpus/reports/ingredient-curation-readiness.json`.

Current state:

- reference-data registry: PASS — 7 taxonomies / 113 terms;
- primary source capacity: WARNING — 394 < 400;
- trusted source batch present: BLOCKED;
- projected production-ready foundation: 0 / 400;
- `readyToMaterialize=false`;
- `readyForPilotFoundation=false`.

With `--strict`, this report exits **2** while those production-data blockers remain. This is intentional.

## 8. Pilot wave gate

Added `schemas/pilot-wave-report.schema.json`, `corpus:pilot-wave-report` and canonical wave reports under `corpus/pilot/reports/`.

The 120 deterministic 4P-A slots are six ordered waves of 20.

Wave rules:

- wave 1 waits only for **pilot readiness**: contract/reference-data integrity and >=400 production-ready ingredients;
- final 3,000-recipe count and production manifest do **not** block starting the pilot;
- wave N+1 is blocked until wave N has 20 terminal accepted/rejected records;
- a wave can pass only with zero unresolved reference requests and zero unhandled taxonomy proposals.

A 4P-B correction introduced a dedicated `pilotBlockers` field in ProductionCorpusReadinessReport so final release blockers cannot accidentally deadlock the pilot.

Current wave 1:

- records: 20;
- pending reference scans: 20;
- state: `blocked`;
- gate: `blocked`;
- blockers: 0 production-ready ingredients / minimum 400 (quality and count).

The recipe-count and final-manifest blockers are intentionally absent from the wave-1 blocker list.

## 9. Schemas added/extended

Added:

- `ingredient-curation-policy.schema.json`;
- `ingredient-curation-batch.schema.json`;
- `ingredient-curation-report.schema.json`;
- `ingredient-retirement-map.schema.json`;
- `pilot-wave-report.schema.json`.

Extended:

- `production-corpus-readiness-report.schema.json` with required `pilotBlockers`.

All public schema mirrors and runtime aliases were updated.

## 10. Automated verification

Final rc.11 verification:

- `npm run corpus:4pa`: PASS;
- `npm run corpus:4pb`: PASS;
- full unit/integration suite: **126/126 PASS**;
- syntax/lint gate: **114 JavaScript files PASS**;
- accessibility source audit: **16/16 PASS**;
- form/contract audit: PASS;
- scale benchmark: PASS;
- root build: PASS;
- GitHub Pages `/yourDietManager` build/audit: PASS;
- Pass E revision closure: **13/13 PASS**;
- local browser regression: SKIPPED only because this execution environment blocks localhost HTTP; CI remains required;
- project Skill: validation/package PASS.

Expected blockers:

- `corpus:ingredient-curation-report --strict`: exit 2 because trusted source batch is absent and foundation is 0/400;
- `release:gate`: exit 2 because the production corpus itself is not yet materialized.

The release gate currently remains blocked by the five expected production-content conditions: recipe minimum, production-contract manifest traceability, production pipeline version, four non-curated/high fixture revisions and development catalog version.

## 11. Documentation and Skill alignment

Added/updated:

- `specs/INGREDIENT_CURATION_PILOT_SPEC.md`;
- `specs/PRODUCTION_CORPUS_CONTRACT.md`;
- `specs/ROADMAP_V1.md`;
- `specs/TEST_STRATEGY.md`;
- `corpus/README.md`;
- `corpus/pilot/README.md`;
- source notes for Foundation and SR Legacy;
- project README/spec index;
- `yourdietmanager-builder` Skill and its recipe-pipeline, corpus-orchestrator, quality-gate and reference-data guidance.

An automated test checks that the 4P-B source/review/wave invariants are mirrored in the normative spec and project Skill.

## 12. What remains to finish 4P-B data execution

The control plane is ready. The production-data portion remains deliberately open:

1. acquire the official Foundation April 2026 source archive in an internet-connected environment;
2. import it and complete explicit editorial review;
3. materialize the approved Foundation subset;
4. acquire/import SR Legacy and review enough non-duplicate supplemental generic concepts to bring the active `curated/high` foundation to >=400;
5. approve explicit retirement mappings for any development fixture being replaced;
6. merge and re-run production readiness until `readyForPilot=true`;
7. execute pilot waves 1–6, resolving taxonomy/ingredient discoveries between waves;
8. close all 120 pilot records and complete pilot acceptance/coverage review.

**4P-C must not begin before steps 1–8 are complete.**
