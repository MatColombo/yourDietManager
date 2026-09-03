# Phase 6 Implementation Report

## Scope

Phase 6 implements the user-facing effective-plan experience on top of the Phase 5 deterministic planner:

- Oggi / Today;
- Calendario / Calendar;
- plan generation preview and confirmation;
- day management;
- meal replacement;
- period/day rebalance;
- adherence capture;
- operation history with atomic undo/redo;
- rolling-horizon UI behavior.

Shopping/prep aggregation remains Phase 7. The production 3,000-5,000 recipe corpus remains an open Phase 4 data deliverable; Phase 6 is therefore validated with explicit development and scale fixtures rather than pretending the bundled catalog is production-complete.

## Completed behavior

### Oggi / Today

- Resolves the current civil date using `AppConfig.timeZone`.
- Shows the diet-day DayClass and cycle day when the current date is covered.
- Lists meals by `mealSlots[].civilDate`, so carry-over meals from a previous diet date remain visible on the correct civil date.
- Shows the next meal and a lightweight upcoming-prep indication from recipe prep metadata.
- Shows the persisted known planned nutrition summary separately from external budgets.
- Links directly to day management and operation history.
- When there is no plan, generates an in-memory preview first and writes nothing until confirmation.

### Calendar

- Month view is generated dynamically from persisted `CalendarDay` records.
- Each covered date shows the configured DayClass abbreviation/color and adherence-derived day status.
- Clicking a date opens manage-day directly.
- A range rebalance flow is available from the calendar and supports selecting which previewed dates are applied before one final confirmation.

### Manage day

- All meal occurrences are displayed on one screen.
- Per-occurrence adherence can be recorded as `not_recorded`, `followed`, `partial`, or `not_followed`.
- `CalendarDay.status` is derived from the occurrence-level statuses according to UX V1 rules.
- `adherenceNotes` are persisted per occurrence.
- External slots with `user_estimate` policy can persist retrospective estimated kcal/protein without overwriting the planned external budget.
- Planned meals expose replacement and day-rebalance actions.

### Replacement

- Replacement candidate retrieval is bounded and indexed through the Phase 5 candidate service.
- The current RecipeVersion is excluded from the alternatives.
- Every alternative passes the hard filter again, including allergy/intolerance and explicit `forbid` constraints.
- Alternatives are soft-ranked using nutrition, preference, frequency, and variety scoring.
- Confirming a replacement resets that meal occurrence adherence to `not_recorded` and recomputes the day nutrition summary.
- Whole recipes remain `servings=1`.

### Rebalance

- Rebalance creates a new `GenerationRun` with `reason=rebalance` and its own seed.
- The run records `targetPlanInstanceId`, the requested range, and the actually committed dates in diagnostics.
- The original PlanInstance identity remains stable; only selected existing CalendarDays are replaced.
- Selected days retain their stable `calendarDayId` and original `createdAt`, while generated assignments and `updatedAt` are refreshed.
- Rebalance never relaxes hard safety constraints.
- Multi-day rebalance is committed as one Operation and therefore one undo action.

### Rolling horizon

- `prompt` shows a non-invasive extension action near/end of horizon.
- `auto_extend` generates and commits the next linked PlanInstance automatically and records the change as an undoable operation.
- `fixed` never auto-extends; after the horizon ends, the UI explicitly shows the ended state and allows creation of a new independent plan.
- Linked extensions preserve Phase 5 cycle continuity and immutable historical segments.

### Operation history / undo / redo

A generic Phase 6 operation service now applies bounded before/after mutation snapshots atomically.

Implemented operation kinds:

- `plan_create`;
- `horizon_extension`;
- `adherence_update`;
- `replace_meal`;
- `rebalance`.

Each operation stores sequence, timestamp, plan identity, bounded before/after snapshots and UI metadata. Undo applies `before`; redo applies `after`. A new operation after undo invalidates the old redo branch while preserving those Operation records as audit history.

The Repository Layer now supports `atomicMutate`, combining puts, deletes, meta updates and meta deletes in one IndexedDB transaction.

## Important design decisions

1. **Civil date is authoritative for Oggi meals.** Diet date remains the solver accounting date; `mealSlots[].civilDate` determines what is physically consumed today.
2. **Replacement is not a safety shortcut.** It reruns hard filtering before presenting alternatives.
3. **Adherence is historical in V1.** Recording adherence does not silently regenerate future days.
4. **Rebalance is a new GenerationRun, not an in-place solver mutation.** The persisted run explains how the edited proposal was produced.
5. **Plan creation/extension is undoable.** Confirmation uses the same Operation mechanism as later edits.
6. **Immutable historical recipe references are preserved.** Phase 6 changes CalendarDay assignments but never mutates old RecipeVersion records.
7. **Nutrition recomputation counts occurrences, not unique IDs.** If the same RecipeVersion appears more than once in one day, every occurrence contributes to the day summary.

## Validation performed

Final gate after Phase 6 changes:

- Phase 4 corpus smoke remains green: 5/7 candidates accepted and release fixture validates;
- Phase 5 planner smoke remains green: 2 days / 4 recipe components;
- 62/62 automated tests pass;
- 8 Phase 6-specific tests cover operation semantics and effective-plan behavior;
- syntax check passes across 71 JavaScript files in source/scripts/tests/service-worker scope;
- IT and EN locale dictionaries have identical 477-key sets;
- static production build succeeds;
- HTTP smoke returns 200 for `/`, `/calendar/day`, `planPages.js`, and `effectivePlanService.js`;
- operation schema validation is performed for new/undo/redo records;
- CalendarDay and PlanInstance records are schema-validated after Phase 6 edits.

Phase 6-specific automated coverage includes:

- derived day adherence status;
- plan creation undo/redo including active-plan metadata;
- per-meal adherence undo;
- replacement hard-safety filtering and undo;
- selective rebalance and GenerationRun rollback;
- redo-branch invalidation after a new edit;
- carry-over visibility by civil consumption date;
- retrospective external `user_estimate` persistence.

## Known limitations

1. The bundled catalog is still a development fixture. Final real-world Phase 6 acceptance must be repeated after the curated Phase 4 production corpus is available.
2. Browser-managed Chromium E2E is not available in this execution environment, so interaction coverage is service/integration + static HTTP smoke rather than a real browser automation run.
3. The Phase 7 shopping/prep engine is not implemented. Phase 6 only surfaces the next recipe's prep minutes; it does not yet aggregate prep work across a horizon.
4. Operation history currently retains all records. The V1 spec permits configurable retention for very large histories; that hardening can be added in Phase 8 without changing operation semantics.

## Phase boundary

Phase 6 implementation is complete against the current development catalog and contracts.

Next coherent increment: **Phase 7 - Shopping & prep**:

- civil-date shopping aggregation;
- decimal people multiplier;
- persistent ShoppingChecklist workflow;
- prep horizon and prep aggregation.
