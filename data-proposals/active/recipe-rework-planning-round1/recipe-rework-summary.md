# T4-A — REWORK classification and gap matrix

All **563/563** recipes classified `REWORK` in Tranche 3 were evaluated against the T4-B semantic role pools while preserving the original fixed ingredient amounts and meal/energy-band contract.

## Outcome

| Action | Recipes |
| --- | ---: |
| Single ingredient patch | 442 |
| Multi-ingredient patch | 41 |
| Method-only patch | 21 |
| Ingredient + method patch | 2 |
| Archetype conversion (`fruit_dairy_smoothie`) | 46 |
| Full rebuild/replacement | 11 |
| **Total REWORK** | **563** |

**506** recipes have at least one strict local deterministic repair that keeps the original energy band and does not create an exact ingredient-set duplicate. Another **46** retain their ingredient set and energy unchanged by converting the old fruit+dairy template to a smoothie archetype. Only **11** need a new recipe.

The 11 rebuilds are **10 breakfast** recipes (7 porridge, 3 cereal bowls) and **1 dinner** recipe whose invalid dry-grain substitution has no same-amount replacement inside its 500–599 kcal band.

## Corpus impact

- `KEEP_RENAME`: 1,036
- recovered `REWORK`: 552
- retained existing recipes after T4-A: **1,588**
- `RETIRE`: 105
- semantic duplicates consolidated: 96
- REWORK requiring replacement: 11
- accepted new recipes required to restore the original 1,800-recipe capacity matrix: **212**

Replacement target by meal:

- breakfast: **77**
- snack: **93**
- mini meal: **27**
- dinner: **11**
- lunch: **4**

The exact band-by-band quotas are in `gap-matrix.json`. T4-C therefore does **not** need to regenerate all 563 REWORK recipes.

## Repair policy

Strict repair is deliberately conservative:

- ingredient amounts remain fixed;
- nutrition is recalculated, never copied;
- the repaired recipe must remain inside its original energy band;
- exact ingredient-set duplicates are rejected;
- no fuzzy ingredient matching is allowed;
- if a strict repair cannot satisfy the contract, the recipe falls back to `REBUILD_REPLACEMENT` rather than being energy-fitted automatically.
