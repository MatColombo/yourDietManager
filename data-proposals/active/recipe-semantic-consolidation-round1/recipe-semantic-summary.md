# Recipe semantic review — Round 1

## Scope

- RecipeVersion reviewed: **1800/1800**
- Ingredient semantics: **ingredient-semantic-consolidation-round1**
- Generator profiles: **38**
- Unreviewed recipes: **0**

## Decisions

| Decision | Count | Meaning |
|---|---:|---|
| KEEP_RENAME | 1036 | Culinary structure is plausible; replace technical/source-like presentation. |
| REWORK | 563 | Core dish can be salvaged, but one or more role/ingredient/practical assumptions must change. |
| RETIRE | 105 | Current generated combination is not worth preserving as a recipe. |
| CONSOLIDATE_DUPLICATE | 96 | Same user-visible core dish as another reviewed RecipeVersion. |

The review does **not** mutate the canonical catalog. It is a staging semantic decision set for reconciliation and for Tranche 4 replacement generation.

## Main structural findings

- `flaxseed_oil_used_for_heated_cooking`: **357**
- `dairy_role_mismatch`: **128**
- `fruit_role_not_ready_or_culinary_fit`: **105**
- `same_user_visible_core_dish`: **96**
- `hot_pepper_main_portion`: **55**
- `dry_grain_role_mismatch`: **35**
- `porridge_cook_time_too_short_for_quinoa`: **33**
- `tomato_paste_used_as_main_vegetable`: **25**
- `sweet_nut_variant_in_savory_bowl`: **6**
- `raw_vegetable_role_mismatch`: **4**

## Interpretation

The corpus is not uniformly bad: **1036** recipes have a plausible culinary skeleton once ingredient semantics are cleaned. However, **668** recipes contain a substantive role/ingredient issue that should not be hidden by renaming, and **96** additional entries are user-visible semantic duplicates.

All existing titles are treated as development/source-oriented presentation. Clean candidate titles are included for every recipe, but descriptions and generic template instructions remain explicitly marked for later editorial rewrite.

## Planner coverage impact before replacements

Using only the **1036 KEEP_RENAME** recipes, all **30** existing meal/energy-band generator jobs still retain at least one recipe. The smallest retained band contains **7** recipes. This is a structural coverage check only; full feasibility remains a Tranche 4/post-replacement gate.
