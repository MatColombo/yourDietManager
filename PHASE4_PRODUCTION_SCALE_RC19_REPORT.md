# Phase 4 Production Scale rc.19 Report

Candidate: **`1.0.0-rc.19`**

## Incident

The rc.18 GitHub production run reached the first 4P-C batch with 120 active pilot recipes, Scale Gate 500 `ready`, 125 generated candidates, zero review backlog and a tightly solved 324.45–324.55 kcal range. All 125 candidates were nevertheless terminally rejected and the batch gate was blocked.

## Root cause

`focus_only` matched coverage targets using `criteria.some(...)`. The explicit focus `mini_meal + practical_portable` therefore matched the simple meal/practicality targets **and** every compound portable energy cell because those cells contain `practical_portable` as one criterion. The generated ~324.5 kcal candidates could satisfy only the 300–399 portable cell and necessarily failed the 400–499 and 500–599 cells, causing `coverage_target_missed` for every candidate.

## Correction

- compound focus matching now requires `criteria.every(...)`;
- compound cells are included only when every criterion is explicitly present in the frozen focus;
- the first portable scale job now freezes only `meal-mini_meal-coverage` and `practical-portable-coverage`;
- adaptive planning remains unchanged;
- zero-review-backlog, target and diversity gates remain unchanged;
- the first-scale pre-verify summary now exposes `rejectionCodes` for direct failure diagnosis.

## Regression coverage

A production-policy end-to-end regression now executes: `v1-default` focus-only planning -> production intake -> portable generator -> industrialized batch. It asserts exactly the two simple coverage targets, zero `coverage_target_missed`, 100 accepted recipes, zero review backlog and a passing batch gate.

## Verification

- 159/159 repository tests PASS;
- syntax/lint: 134 JS PASS;
- production execution control plane 14/14 PASS;
- 4P-C control plane 8/8 PASS;
- accessibility 16/16 PASS; forms, scale benchmark, build, Pass E closure and Pages audits PASS;
- GitHub Pages artifact verified for both `/` and `/yourDietManager`;
- local Chromium reaches DevTools and is skipped only because localhost navigation is blocked by the execution environment.

The V1 release gate remains intentionally blocked on the five final production-content checks (3000 recipes, contract traceability, production pipeline manifest, curated/high ingredient baseline, and non-development catalog version).
