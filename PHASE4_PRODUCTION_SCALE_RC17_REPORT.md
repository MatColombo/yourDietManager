# Phase 4 Production Scale — rc.17 First-Batch Contract Hotfix

Date: **2026-09-04**  
Candidate: **`1.0.0-rc.17`**  
Status: **IMPLEMENTED / SOURCE-BACKED RERUN REQUIRED**

## Failure observed

The source-backed rc.16 workflow reached `corpus:first-scale-batch` and failed with `Production batch has review backlog 125`. The number 125 equals the 100 accepted target multiplied by the frozen 1.25 oversample ratio.

## Root cause

The first scale runner requests a specialized deterministic portable mini-meal generator. The generic `focused_expansion` planner could nevertheless enrich the requested `mini_meal + practical_portable` focus with unrelated global coverage deficits, including energy/protein/fiber bands. The generator does not claim to solve arbitrary protein/fiber bands. This made the generated candidates incompatible with the frozen job and produced non-terminal nutrition review backlog.

## Correction

- Add orchestration goal `intentStrategy` with `adaptive` and `focus_only` values.
- Keep `adaptive` as the default for existing planner behavior.
- Use `focus_only` only for the first specialized portable scale batch.
- Freeze that job to `mini_meal`, `practical_portable`, `150-499 kcal`, `proteinG=null`, `fiberG=null`, with focus-matching coverage targets only.
- Keep `requireZeroReviewBacklogBeforeApply=true` unchanged.
- Persist `job.json`, `batch-report.json`, `result.json` and `pre-verify-summary.json` before verification.
- Upload pre-verification evidence from GitHub Actions even when the batch fails.
- Bump PWA caches to `ydm-shell-v20` and `ydm-data-v10` because the orchestration schema changed.

## Verification

Final rc.17 verification:

- `npm run check`: PASS;
- tests: **156/156 PASS**;
- syntax/lint: **134 JavaScript files PASS**;
- 4P-C control plane: **8/8 PASS**;
- production execution control plane: **14/14 PASS**;
- accessibility: **16/16 PASS**;
- form contract: PASS;
- scale benchmark: PASS;
- Pass E closure: **13/13 PASS**;
- Pages artifact `/`: PASS;
- Pages artifact `/yourDietManager`: PASS;
- V1 release gate remains intentionally blocked by the existing production-content requirements.

The source-backed GitHub workflow must now be rerun with `target_ingredients=600` and `commit_results=false`.
