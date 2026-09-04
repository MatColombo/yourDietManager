# Phase 4 Production Test Isolation — rc.20

Candidate: **`1.0.0-rc.20`**

## Observed source-backed state

The rc.19 GitHub workflow completed the production data path far enough to report:

- 600/600 active ingredient families production-ready;
- pilot readiness true;
- pilot 120/120 terminal;
- first scale batch applied, yielding 220 active recipes;
- production release still correctly blocked by the 3,000-recipe floor and missing final production manifest metadata.

The failure occurred only in the post-generation `npm test` step.

## Root cause

Four tests were coupled to canonical mutable files that the production workflow intentionally updates:

1. pilot wave 1 expected the development baseline to remain blocked;
2. pilot readiness expected wave 1 to be `ready`, but canonical pilot intake was already `closed`;
3. legacy retirement expected `retirements=[]`, but the workflow had explicitly approved four USDA replacements;
4. Scale Gate 500 expected pilot terminal count 0, but canonical pilot intake was 120/120 terminal.

These are test-isolation defects, not production-pipeline defects.

## rc.20 correction

- 4P-B and 4P-C baseline fixtures load `corpus/staging/phase4-smoke-base-bundle.json`, an immutable 4-ingredient/3-recipe development fixture.
- Pilot baseline state is recreated with `planPilotIntake()` using the frozen reference-data version/digest instead of reading mutable `corpus/pilot/v1-pilot-intake.json`.
- Baseline proposals are an explicit empty in-memory list.
- The retirement-map test remains schema-governed but is state-agnostic: an empty map is valid, and a populated map is valid only when every replacement has an explicit replacement ID, rationale, approver, and timestamp.
- The production workflow and all production gates remain unchanged.

## Acceptance rule

`npm test` must pass both on a pristine development checkout and after canonical production pilot/retirement artifacts have been mutated by the network-enabled workflow.


## Verification

- focused 4P-B/4P-C/workflow tests: pass;
- full suite on pristine tree: **160/160 pass**;
- full suite after simulating canonical pilot 120/120 closure plus four approved fixture retirements: **160/160 pass**;
- `npm run check`: pass, with browser regression recorded as environment-policy `SKIPPED`;
- accessibility: 16/16 pass;
- Pass E revision closure: 13/13 pass;
- GitHub Pages audit: pass for both `/` and `/yourDietManager`;
- V1 release gate remains intentionally blocked on the development bundle.
