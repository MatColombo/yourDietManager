# Phase 4 Production Corpus — Pass C Report

Date: **2026-09-04**  
Candidate: **`1.0.0-rc.12`**  
Status: **CONTROL PLANE IMPLEMENTED / SCALE EXECUTION BLOCKED ON 4P-B**

## 1. Objective

4P-C industrializes the post-pilot recipe-generation path. It does not waive the 4P-B prerequisite and does not manufacture production recipes from fixture ingredients. The pass adds the deterministic controls required to move from a reviewed pilot to cumulative production scale.

## 2. Frozen policy

Machine policy: `corpus/production/v1-recipe-pipeline-policy.json`  
Identity: `recipe-production-pipeline-v1@1.0.0`

Bindings:

- production contract `ydm-v1-production-corpus@1.0.0`;
- corpus policy `corpus-policy-v1-default@1.1.0`;
- ingredient curation policy `ingredient-curation-v1@1.0.0`;
- pipeline `recipe-pipeline-2-production-intake`.

The policy freezes stage order, objective weights, disposition semantics, retry limits, snapshot freshness rules, batch digest requirements and Scale Gate 500.

## 3. Industrialized batch lifecycle

The production path is:

`fresh snapshot -> scale gate -> deterministic job intake -> reference resolution -> candidate generation -> industrialized processing -> disposition/review -> digest verification -> apply -> full rescan/replan`

Every candidate receives exactly one disposition:

- `accepted` — terminal;
- `rejected` — terminal hard failure;
- `duplicate` — terminal, no recipe emitted;
- `needs_reference_review` — non-terminal;
- `needs_recipe_review` — non-terminal;
- `nutrition_outlier` — non-terminal.

Non-terminal findings create review backlog and make batch application impossible.

## 4. Objective quality scoring

The ordered production stages are:

1. intake — 10;
2. structure/localization — 15;
3. ingredient normalization — 20;
4. nutrition — 15;
5. semantic references — 15;
6. culinary review — 10;
7. duplicate/diversity — 10;
8. schema/provenance — 5.

Weights total 100. V1 production acceptance requires **100/100**. This is a deterministic audit score, not a subjective model score.

Accepted warning `macro_energy_mismatch` from the generic pipeline is promoted to the blocking `nutrition_outlier` disposition in production.

## 5. Review and retry

Recipe/nutrition review decisions are explicit schema-valid artifacts. `retry` returns a candidate to `ready_for_generation`; `reject` makes it terminal. Reviewer identity and notes are mandatory and attempts are capped at 3.

Reference problems cannot be resolved through recipe review. They must use the existing `ProductionCorpusIntake.referenceRequests` plus `ReferenceDataProposal` / ingredient-curation governance.

## 6. Integrity and stale-state protection

Before execution, the full corpus is rescanned and must match the snapshot frozen into the `RecipeGenerationJob`. Any mutation after planning causes a hard stale-snapshot failure.

Every industrialized batch report contains `resultDigest`, binding:

- job identity;
- pipeline policy identity/version;
- input snapshot;
- candidate decisions;
- accepted RecipeVersion content hashes.

A modified result/report pair cannot be applied.

## 7. Scale Gate 500

The cumulative gate has three states:

- `blocked` — 4P-B prerequisites or current corpus quality fail;
- `ready` — 4P-B prerequisites and current corpus quality pass, but active corpus is still below 500;
- `pass` — at least 500 active recipes plus all quality and coverage checks pass.

The gate requires:

- 4P-B `readyForPilot=true`;
- pilot 120/120 terminal;
- zero unresolved pilot reference requests;
- zero unhandled pilot reference-data proposals;
- zero schema/reference/nutrition/allergen/locale errors;
- zero exact and near duplicates;
- hard coverage floors scaled proportionally from the 3,000-recipe release minima.

Coverage formula:

`requiredAt500 = ceil(releaseMinCount * 500 / 3000)`

The 3,000-recipe release target is not a prerequisite for starting scale execution.

## 8. Current baseline

Current Scale Gate 500 result:

- status: **blocked**;
- active recipes: **3 / 500**;
- pilot terminal: **0 / 120**;
- production ingredient readiness: **0 / 400**;
- current production nutrition errors: **3**;
- current coverage floors: not met.

The scale job-intake CLI was explicitly exercised against this baseline and failed closed before creating an intake.

`npm run corpus:scale-gate-500 -- --strict` exits **2** as designed.

The V1 release gate also exits **2**, with the same five production-data blockers:

1. recipe corpus <3000;
2. production-contract traceability missing from development manifest;
3. development pipeline version;
4. four non-curated/high ingredient revisions;
5. development catalog version.

## 9. Verification

Final rc.12 verification:

- 4P-A: PASS;
- 4P-B control plane: PASS, data gate blocked;
- 4P-C control plane: **PASS 8/8**;
- dedicated 4P-C tests: **11/11 PASS**;
- full automated suite: **137/137 PASS**;
- JavaScript syntax: **122 files PASS**;
- accessibility: **16/16 PASS**;
- form contract: PASS;
- scale benchmark: PASS;
- Pass E closure: **13/13 PASS**;
- root build/Pages audit: PASS;
- GitHub Pages `/yourDietManager` build/audit: PASS;
- browser regression: DevTools bootstrap succeeds locally; HTTP navigation remains skipped only because the execution environment blocks localhost. GitHub Actions keeps `YDM_BROWSER_REQUIRED=1`.

## 10. Completion boundary

This report closes **4P-C control-plane implementation**, not Scale Gate 500 execution.

Scale execution remains prohibited until 4P-B is real: at least 400 production-ready ingredient families, 120/120 terminal pilot records, and zero unresolved reference/proposal backlog. Only then may production job intake and cumulative batches proceed toward 500 recipes.
