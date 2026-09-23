# Seed diversification + balanced 500-recipe expansion

## Scope

This update contains two functional changes:

1. Fix generation-seed diversification while preserving deterministic reproducibility for the same seed.
2. Add 500 new curated recipe records, exactly balanced across the five supported meal archetypes and deliberately using previously underused ingredients.

The update is incremental over the taxonomy-aligned project plus the bootstrap/service-worker hotfix.

## Seed bug: root cause and fix

The previous planner used the seed mainly as an exact-score tie breaker. In realistic catalogs, candidate scores are rarely exactly equal, so changing the seed often produced the same proposal. When frequency rules were active, the outer multi-day beam further sorted alternatives almost entirely by raw objective score, effectively suppressing seed variation again.

The fix introduces a bounded seeded-diversity term in both layers:

- `src/planner/beamSolver.js`: candidate, slot-option, beam-state and finalist ranking use a seeded rank.
- `src/planner/frequencyPlanGenerator.js`: multi-day beam states and finalists include a seeded diversity penalty.
- `src/planner/qualityPolicy.js`: the maximum seeded soft-objective influence is centralized as `seededDiversityMaxPenalty: 2.5`.

Properties of the fix:

- same seed + same inputs => same plan;
- different seeds can select different near-equivalent plans;
- hard constraints remain unchanged;
- daily energy feasibility remains unchanged;
- a materially better soft-score solution is not displaced merely for randomness;
- generator/solver versions were bumped to make the behavioral change explicit in provenance.

Automated regression coverage includes both the normal planner and the frequency-aware planner. A real 7-day generation over the full catalog was also checked: repeated `seed-alpha` was identical, while `seed-beta`/`seed-gamma` changed multiple meal selections.

## 500-recipe expansion

New source batch: `catalog-source/009-balanced-recipes-500.json`.

Distribution is exact:

| Meal type | Added recipes |
|---|---:|
| Breakfast | 100 |
| Lunch | 100 |
| Dinner | 100 |
| Snack | 100 |
| Mini meal | 100 |
| **Total** | **500** |

The compiled catalog now contains 1,030 recipes and 282 ingredients.

### Ingredient balancing

Ingredient selection was driven by baseline recipe usage rather than simply reusing the most common ingredients.

- 115 ingredients occurred at most twice in the previous 530-recipe catalog.
- All 115 are represented in the new batch.
- The new 500 recipes use 224 distinct ingredients.
- After the expansion, every ingredient has at least three recipe occurrences in the resolved corpus.

This is enforced by `tests/balanced-recipes-500.test.mjs` so future edits cannot silently undo the balancing objective.

### Taxonomy and culinary integrity

Every new recipe has explicit:

- one meal type;
- archetype;
- cuisine;
- exactly one sweet/savory flavor profile;
- practical tags;
- diet tags;
- preparation technique(s);
- preparation/cooking/eating times;
- ingredient revisions that compile into calculated nutrition.

A new practical term, `tax_practical_standard`, covers recipes with 31-39 minutes total prep+cook time, avoiding the previous semantic gap between `quick` and `elaborate`.

During generation review, six dry cereal ingredients were found with misleading physical states (`raw` or `as_sold`). The batch advances those ingredient revisions and normalizes them to `physical: dry`, `preservation: dry`. No-cook generated recipes are tested to reject dry cooking staples as main components.

Additional qualitative safeguards were applied to avoid mechanically valid but implausible combinations, including limiting stuffed-vegetable templates to vegetables that can realistically be stuffed and preventing large hard-cheese portions from being used as sweet breakfast bowls.

## Regression protection

Relevant permanent tests:

- `tests/planner-seed-diversity.test.mjs`
  - same-seed determinism;
  - cross-seed diversification;
  - frequency-planner diversification.
- `tests/balanced-recipes-500.test.mjs`
  - exact 100/100/100/100/100 meal distribution;
  - baseline-underused ingredient coverage;
  - 1,030 compiled recipe count;
  - nutrition compilation;
  - dry-cereal state corrections;
  - no-cook safety for dry cooking staples.
- `tests/catalog-taxonomy-alignment.test.mjs`
  - now validates the complete 1,030-recipe corpus.

