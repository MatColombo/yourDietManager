# Phase 4 Production Curation rc.15 Report

Candidate: **`1.0.0-rc.15`**

## Trigger

A real GitHub Actions run successfully imported USDA Foundation 04/2026 and SR Legacy, then selected 600 curated candidates. The run failed only because frozen pilot group minimums were not met: pasta/rice/cereals 27/40, eggs 13/15, herbs/spices 12/20. The same report showed a large number of `macro_energy_mismatch` exclusions.

## Root cause

The importer treated USDA energy nutrients as interchangeable. Foundation Foods may contain both Atwater General (2047) and Atwater Specific (2048). rc.14 selected the first matching energy item in JSON order and the curator then compared it to General-factor 4/4/9. SR Legacy energy (1008) was subjected to the same comparison even though historical USDA energy can use food-specific factors. This could exclude valid foods, disproportionately reducing small groups.

## rc.15 correction

1. Foundation energy selection is deterministic: 2047 General -> 2048 Specific -> 1008 legacy fallback.
2. SR Legacy selection is deterministic: 1008 -> 2047 -> 2048.
3. Review intake records `energyBasis` and `energyNutrientId`.
4. The 4/4/9 blocking check applies only to General/unknown-basis energy.
5. Materialized IngredientRevision provenance carries the selected basis.
6. Recipe-level macro mismatch warnings are emitted only when all contributing ingredients are General-comparable.
7. Conservative descriptor refinement adds common pasta forms and herbs/spices.
8. Frozen group minimums remain 40 / 15 / 20; no threshold was lowered.
9. Curator diagnostics now include source-record count, unique ineligibility, eligible capacity by group, and energy-basis counts.
10. PWA shell/data caches are bumped to v18/v8 so deployed runtime schemas cannot remain stale after the IngredientRevision provenance schema change.

## Expected rerun

Rerun `Build Production Corpus Working Set` with `target_ingredients=600` and `commit_results=false`. If a group still lacks capacity, inspect the uploaded `auto-curation-report.json`; rc.15 reports the actual eligible capacity per group instead of only repeated rejection counters.
