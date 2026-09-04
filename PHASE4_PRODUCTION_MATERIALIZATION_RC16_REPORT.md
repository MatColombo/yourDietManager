# Phase 4 Production Materialization Hotfix — rc.16

Candidate: **`1.0.0-rc.16`**

## Trigger

The GitHub production-corpus workflow passed acquisition, import and deterministic curation, then failed while materializing Foundation Foods:

`Approved 746768 fails curation gate: nutrition_out_of_bounds_energyKcal`

## Root cause

Two independent validation paths had diverged. `materialize-usda-reviewed.mjs` called the canonical curation gate, including `nutritionBoundsPer100g`, while `auto-curate-fdc` evaluated category/completeness and energy consistency but did not apply those frozen absolute bounds. Therefore an impossible-to-materialize row could still receive `decision=approved`.

The importer also did not retain Energy unit metadata. This made generic Energy fallback unsafe when source payloads expose a non-kcal unit.

## Correction

- shared nutrition-bound validation is exported from `ingredientCuration.js`;
- `auto-curate-fdc.mjs` loads `v1-ingredient-curation-policy.json` and applies its exact bounds during selection;
- FDC Energy import is unit-aware; kJ is converted to kcal and unsupported generic units are ignored;
- energy original value, source unit and conversion mode are retained in curation and IngredientRevision provenance;
- PWA shell/data caches are bumped because schemas changed;
- regression tests cover both the rc.15 bound mismatch and kJ normalization.

## Frozen constraints

No nutrition maximum, ingredient target, group minimum, taxonomy rule or materialization criterion is reduced.
