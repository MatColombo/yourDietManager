# Rolling frequency / dayOffset bugfix

Date: 2026-09-29

## Symptom

Plan generation could stop with `frequency_candidate_frontier_exhausted` on longer horizons even when a valid rolling-frequency schedule existed.

The failure was reproducible when a DayClass contains planned meals with different `dayOffset` values (for example a night-shift meal belonging to the next civil day) and a rolling min/max rule constrains the same target.

## Root cause

The frequency planner requested multiple feasible alternatives from the single-day solver, but deduplicated them only by the **number** of matches per frequency rule.

Two alternatives such as:

- target occurrence on civil day D;
- target occurrence on civil day D+1;

were therefore treated as equivalent if both had one occurrence. They are not equivalent for a rolling window: the D+1 occurrence remains inside later windows for one extra day and can consume the final headroom needed by a future meal.

The planner could retain only the temporally worse alternative, then later reject every candidate because the rolling maximum was already saturated. This produced the user-visible frontier-exhausted error even though the discarded alternative would have completed the plan.

## Fix

`src/planner/frequencyPlanGenerator.js` now builds the day-alternative frequency signature from the distribution of matches by **civil date**, not only from the aggregate count.

For meal-count rules the signature records `civilDate -> occurrence count`; for day-count rules it records the exact set of matching civil dates. Alternatives that have the same total count but different rolling-window consequences are therefore preserved independently.

## Regression coverage

Added `rolling alternatives preserve civil-date placement across dayOffset boundaries` to `tests/planner-frequency-cap-headroom.test.mjs`.

The fixture requires exactly one target occurrence in a rolling two-day window, offers two same-count placements on the first diet day, and then forces a future occurrence. Before the fix the chosen placement can exhaust the rolling cap; after the fix the planner retains the valid placement and succeeds.

Two stale assertions in `tests/frequency-cap-planner-regression.test.mjs` were also aligned with the current planner diagnostics. Both were already failing on the unmodified v1.4 baseline and were unrelated to this runtime defect.

## Validation

- focused rolling/frequency/revision suite: 20/20 PASS;
- planner interaction suite: 32/32 PASS;
- frequency-cap suite: 3/3 PASS.
