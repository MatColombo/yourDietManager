# Feature 8 Implementation Report - Structural Calendar Editing

## Scope

Feature 8 adds transactional structural editing for an already confirmed active plan from Calendar. It is implemented without changing the persisted schema and without moving spill-over meal ownership between CalendarDay records.

## Implemented behavior

- Add a missing diet day inside or at either boundary of the active plan.
- Change the DayClass of an existing day and regenerate its planned meals.
- Regenerate an existing day with the same DayClass while preserving compatible locked meal slots.
- Remove an existing diet day, including internal gaps, while keeping at least one day in the active plan.
- Recompute PlanInstance startDate/endDate when edits extend or shrink the plan boundaries.
- Project incoming meals by civilDate so dayOffset spill-overs remain visible on the destination calendar date while still owned by their source diet day.
- Preview outgoing spill-over additions/removals before commit.
- Commit add/modify/remove as one undoable operation with kinds calendar_day_add, calendar_day_modify and calendar_day_remove.
- Preserve the existing quick day rebalance and meal replacement flows after structural edits.

## Invariants and safety gates

- Structural edits are allowed only on the active PlanInstance.
- A source CalendarDay always owns its meal occurrences. dayOffset never transfers the occurrence to another CalendarDay.
- Removing a source day removes its projected spill-over from later civil dates automatically.
- Recorded adherence or adherence notes block structural rewriting.
- Production-batch allocations block structural rewriting until detached.
- Locked meals block removal and block a DayClass change. With the same DayClass, compatible locked slots are kept as fixed solver inputs.
- Removal is rejected if it would violate configured frequency constraints.
- Generated replacement days pass normal plan policy and planned-day validation before commit.
- Preview sealing/validation protects against stale commits.

## UI

Calendar empty cells inside the active plan context can open the day editor. The day-management page exposes a guided DayClass selector and actions to add, modify/regenerate or remove a day. Incoming spill-overs are shown separately with their source date. Structural previews show the proposed day, plan-horizon change and spill-over delta before confirmation.

## Persistence and history

No IndexedDB migration is required. Existing PlanInstance, CalendarDay, GenerationRun and Operation records are reused. Solver-generated structural changes store a GenerationRun diagnostic marker and are committed together with the PlanInstance/CalendarDay mutation through operation history, so undo/redo is atomic.

## Verification

The final gate passed on the 1,030-recipe catalog:

- catalog tests: 25/25 PASS;
- planner/interactions: 23/23 PASS;
- frequency-cap tests: 2/2 PASS;
- lint/syntax: PASS;
- PWA build: PASS;
- GitHub Pages audit: PASS.

The browser regression runner starts Chromium but marks the run SKIPPED because local HTTP navigation is blocked by the execution environment policy.
