import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { createPlanPreview } from '../src/services/planGenerationService.js';
import { commitGeneratedPreview } from '../src/services/effectivePlanService.js';
import { createCalendarStructurePreview, commitCalendarStructurePreview, loadCivilMealsForDate } from '../src/services/calendarPlanEditorService.js';
import { undoLastOperation, redoNextOperation } from '../src/services/operationHistoryService.js';

async function activeFixture() {
  const deps = await plannerFixture();
  const nutrition = await deps.repo.get('nutritionProfiles', 'nutrition');
  nutrition.dayArchetypeModifiers = { night: { mode: 'percent', value: -25 } };
  await deps.repo.put('nutritionProfiles', nutrition);
  const preview = await createPlanPreview({ horizon: { startDate: '2026-09-23', endDate: '2026-09-23' }, seed: 'feature-8-base' }, deps);
  assert.equal(preview.status, 'success');
  await commitGeneratedPreview(preview, deps);
  return { ...deps, planId: preview.planInstance.planInstanceId, firstDay: preview.calendarDays[0] };
}

test('Feature 8 — add/remove day updates horizon and dayOffset spillovers atomically with undo/redo', async () => {
  const deps = await activeFixture();
  const addPreview = await createCalendarStructurePreview({
    planInstanceId: deps.planId,
    date: '2026-09-24',
    action: 'add',
    dayClassId: 'dc-night',
    seed: 'feature-8-add-night',
    createdAt: '2026-09-23T14:00:00.000Z'
  }, deps);
  assert.equal(addPreview.status, 'success');
  assert.equal(addPreview.proposedDay.dayClassId, 'dc-night');
  assert.equal(addPreview.proposedDay.cycleDay, null);
  assert.equal(addPreview.spillovers.added.length, 1);
  assert.equal(addPreview.spillovers.added[0].civilDate, '2026-09-25');
  assert.equal(addPreview.planAfter.endDate, '2026-09-24');

  const added = await commitCalendarStructurePreview(addPreview, deps);
  assert.equal(added.operation.kind, 'calendar_day_add');
  assert.equal((await deps.repo.get('planInstances', deps.planId)).endDate, '2026-09-24');
  const civil = await loadCivilMealsForDate('2026-09-25', deps);
  assert.equal(civil.length, 1);
  assert.equal(civil[0].sourceDate, '2026-09-24');
  assert.equal(civil[0].slot.dayOffset, 1);

  await undoLastOperation(deps.planId, deps);
  assert.equal(await deps.repo.get('calendarDays', addPreview.proposedDay.calendarDayId), undefined);
  assert.equal((await deps.repo.get('planInstances', deps.planId)).endDate, '2026-09-23');
  assert.equal((await loadCivilMealsForDate('2026-09-25', deps)).length, 0);

  await redoNextOperation(deps.planId, deps);
  assert.ok(await deps.repo.get('calendarDays', addPreview.proposedDay.calendarDayId));
  assert.equal((await loadCivilMealsForDate('2026-09-25', deps)).length, 1);

  const removePreview = await createCalendarStructurePreview({ planInstanceId: deps.planId, date: '2026-09-24', action: 'remove' }, deps);
  assert.equal(removePreview.spillovers.removed.length, 1);
  assert.equal(removePreview.planAfter.endDate, '2026-09-23');
  const removed = await commitCalendarStructurePreview(removePreview, deps);
  assert.equal(removed.operation.kind, 'calendar_day_remove');
  assert.equal(await deps.repo.get('calendarDays', addPreview.proposedDay.calendarDayId), undefined);
  assert.equal((await loadCivilMealsForDate('2026-09-25', deps)).length, 0);
});

test('Feature 8 — modifying a confirmed day regenerates the selected DayClass and cleans/rebuilds overflow', async () => {
  const deps = await activeFixture();
  const preview = await createCalendarStructurePreview({
    planInstanceId: deps.planId,
    date: '2026-09-23',
    action: 'modify',
    dayClassId: 'dc-night',
    seed: 'feature-8-modify-night',
    createdAt: '2026-09-23T15:00:00.000Z'
  }, deps);
  assert.equal(preview.sourceDay.dayClassId, 'dc-day');
  assert.equal(preview.proposedDay.dayClassId, 'dc-night');
  assert.equal(preview.proposedDay.cycleDay, null);
  assert.equal(preview.summary.sourceMealCount, 3);
  assert.equal(preview.summary.proposedMealCount, 2);
  assert.equal(preview.spillovers.added.length, 1);
  assert.equal(preview.spillovers.added[0].civilDate, '2026-09-24');

  const committed = await commitCalendarStructurePreview(preview, deps);
  assert.equal(committed.operation.kind, 'calendar_day_modify');
  const stored = await deps.repo.get('calendarDays', deps.firstDay.calendarDayId);
  assert.equal(stored.dayClassId, 'dc-night');
  assert.equal(stored.mealSlots.length, 2);
  assert.equal(stored.mealSlots.find(slot => slot.dayOffset === 1).civilDate, '2026-09-24');
  const civil = await loadCivilMealsForDate('2026-09-24', deps);
  assert.ok(civil.some(item => item.sourceDate === '2026-09-23' && item.slot.dayOffset === 1));
});

test('Feature 8 — structural edits refuse recorded adherence and batch-linked days', async () => {
  const deps = await activeFixture();
  const day = await deps.repo.get('calendarDays', deps.firstDay.calendarDayId);
  day.mealSlots[0].adherenceStatus = 'followed';
  await deps.repo.put('calendarDays', day);
  await assert.rejects(
    createCalendarStructurePreview({ planInstanceId: deps.planId, date: day.date, action: 'modify', dayClassId: 'dc-night' }, deps),
    /aderenza registrata|recorded adherence/
  );
  day.mealSlots[0].adherenceStatus = 'not_recorded';
  day.mealSlots[0].recipeComponents[0].productionBatchId = 'batch-test';
  await deps.repo.put('calendarDays', day);
  await assert.rejects(
    createCalendarStructurePreview({ planInstanceId: deps.planId, date: day.date, action: 'remove' }, deps),
    /lotti|batch allocations/
  );
});


test('Feature 8 — calendar UI exposes add/modify/remove, overflow context and undoable history labels', async () => {
  const ui = await readFile(new URL('../src/ui/planPages.js', import.meta.url), 'utf8');
  const it = JSON.parse(await readFile(new URL('../public/data/locales/it.json', import.meta.url), 'utf8'));
  assert.match(ui, /calendar-day-add-preview/);
  assert.match(ui, /calendar-day-modify-preview/);
  assert.match(ui, /calendar-day-remove-preview/);
  assert.match(ui, /incoming-spillovers/);
  assert.equal(it['plan.operation.calendar_day_add'], 'Aggiunta giornata');
  assert.equal(it['plan.operation.calendar_day_modify'], 'Modifica giornata');
  assert.equal(it['plan.operation.calendar_day_remove'], 'Rimozione giornata');
});
