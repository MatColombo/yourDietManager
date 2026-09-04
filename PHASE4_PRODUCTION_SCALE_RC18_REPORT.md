# Phase 4 Production Scale — rc.18 Feasible Amount Solver Hotfix

Candidate: **`1.0.0-rc.18`**  
Date: 2026-09-04

## Trigger

The source-backed `corpus:first-scale-batch` run on rc.17 reached the production batch verifier with `reviewBacklogCount=2`. rc.17 had already reduced the earlier backlog from 125 by freezing the first scale job to `focus_only`; the remaining two candidates therefore pointed to candidate-level generation rather than orchestration intent.

## Root cause

`generatePortableScaleCandidates()` scaled the base portion `[150 g, 28 g, 100 g]` toward the job energy midpoint but clamped the multiplier to `0.55-1.8`. For sufficiently energy-dense USDA ingredient triples, even the minimum multiplier could leave the recipe above the frozen `499 kcal` ceiling. The recipe pipeline correctly classified those candidates as `nutrition_outlier`, and the industrialized batch correctly failed because `requireZeroReviewBacklogBeforeApply=true`.

## rc.18 correction

- Remove the arbitrary `0.55-1.8` scaling clamp.
- Solve a feasible multiplier from the intersection of:
  - the job `energyKcal` range;
  - maximum normalized ingredient amount `1500 g` per line;
  - normalized total portion `40-2500 g`.
- Round generated amounts to 0.01 g and re-check energy and amount bounds after rounding.
- If the initially selected ingredient triple is infeasible, deterministically try alternate canonical triples before generating the candidate.
- If no triple is feasible, fail before recipe batch processing with the candidate ID and frozen energy range.
- Reject unsupported portable-generator jobs containing protein or fiber bands before generation instead of converting them into review backlog.
- Add generator diagnostics: solver version, infeasible-combination attempt count, scale-factor range, and generated-energy range.

## Gate behavior

No production gate was relaxed. In particular, `requireZeroReviewBacklogBeforeApply` remains enabled. rc.18 fixes candidate feasibility so the specialized generator satisfies the job it claims to implement.

## Regression coverage

A high-density regression corpus (400/700/600 kcal per 100 g across the portable generator pools) requires a scale factor below `0.55`. rc.18 produces candidates inside `150-499 kcal` and closes an industrialized batch with 100 accepted recipes and zero review backlog. A second regression verifies fail-fast behavior when a portable job introduces a protein band.

## Verification

Final rc.18 verification:

- `npm test`: **158/158 PASS**
- syntax/lint: **134 JavaScript files PASS**
- production execution control-plane: **14/14 PASS**
- Phase 4P-C control-plane: **8/8 PASS**
- accessibility source audit: **16/16 PASS**
- form contract audit: **PASS**
- scale benchmark: **PASS**
- Pass E closure: **13/13 PASS**
- GitHub Pages audit `/`: **PASS**
- GitHub Pages audit `/yourDietManager`: **PASS**
- browser regression: Chromium/CDP starts; local navigation is skipped only because this execution environment blocks localhost. CI remains required.
- V1 release gate: expected **BLOCKED** on the five remaining production-content requirements.
