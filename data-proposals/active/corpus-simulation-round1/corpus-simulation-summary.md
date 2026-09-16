# T4-E — Final corpus simulation round 1

T4-E composes the semantic ingredient overlay, T3 recipe decisions, T4-A deterministic repairs/conversions, and T4-C replacement recipes into one staging-only corpus.

## Result

- final RecipeVersion count: **1,800**
- source composition: **1,036 KEEP_RENAME + 506 local repairs + 46 archetype conversions + 212 T4-C replacements**
- Phase B meal/energy quotas: **30/30 restored exactly**
- exact recipe-signature duplicate groups: **0**
- same-meal ingredient near-duplicate pairs at Jaccard >= 0.82: **0**
- planner energy feasibility: **10/10 targets at +/-2%**, implying **30/30** across +/-2%, +/-5% and +/-10%

The simulated corpus is technically viable but is **not promotion eligible yet**.

## Residual semantic/editorial blockers

- **27** same-meal semantic product-concept duplicate groups, representing **30 excess recipes** to consolidate/replace
- **67** duplicate Italian title groups, representing **76 excess title rows**; many are title collisions rather than identical recipes
- **1** exact ingredient-set collision across different meal contexts
- **531** repaired/conversion recipes need their presentation refreshed because the T3 title was authored before the final T4-A ingredient/archetype repair
- **1** non-blocking repair-candidate-count drift (the deterministic replay finds 25 candidates where T4-A recorded 24); the chosen repair remains deterministic and valid

## Planner proof

The workflow tests targets 800, 1000, ..., 2600 kcal at the tightest configured tolerance of 2%. Every target is feasible. Because the +/-2% admissible interval is a subset of the +/-5% and +/-10% intervals, those same valid plans prove the two wider tolerance sets without rerunning another 20 expensive solver cases.

## Promotion rule

T4-E materializes only under `corpus/staging/data-proposals/corpus-simulation-round1/`. The canonical catalog remains unchanged. Technical feasibility passing is necessary but not sufficient: semantic duplicate and presentation blockers must be cleared before canonical promotion.
