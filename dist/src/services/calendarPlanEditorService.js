import { repositories } from '../repositories/repositoryHub.js';
import { stableHashId } from '../planner/seededRandom.js';
import { addCivilDays } from '../planner/planMath.js';
import { evaluateFrequencies } from '../domain/frequencyCounter.js';
import { loadConfigurationBundle, assertConfigurationBundle, activeRecords } from './configurationService.js';
import { createPlanPreview } from './planGenerationService.js';
import { loadPlanPolicyContext, validatePlanPolicy } from './planPolicyValidation.js';
import { previewContext, sealPreview, withValidatedPreview, validatePlannedDays } from './planPreviewGuard.js';
import { commitOperation, mutationSnapshot } from './operationHistoryService.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function nowIso(value) { return value || new Date().toISOString(); }

function assertCivilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('Invalid calendar date');
  return value;
}

async function activePlan(repo, planInstanceId = null) {
  const activeId = await repo.getMeta('activePlanInstanceId');
  const id = planInstanceId || activeId;
  if (!id) throw new Error('No active PlanInstance');
  if (activeId && id !== activeId) throw new Error('Structural calendar editing is available only on the active PlanInstance');
  const plan = await repo.get('planInstances', id);
  if (!plan || plan.status !== 'active') throw new Error('Active PlanInstance not found');
  return plan;
}

async function planDayForDate(repo, planInstanceId, date) {
  const rows = await repo.getAllByIndex('calendarDays', 'date', { kind: 'only', value: date });
  return rows.find(day => day.planInstanceId === planInstanceId) || null;
}

function hasRecordedAdherence(day) {
  return Boolean(day?.mealSlots?.some(slot => (slot.adherenceStatus || 'not_recorded') !== 'not_recorded' || String(slot.adherenceNotes || '').trim()));
}

function hasBatchAllocation(day) {
  return Boolean(day?.mealSlots?.some(slot => (slot.recipeComponents || []).some(component => component.productionBatchId)));
}

function hasLockedMeal(day) {
  return Boolean(day?.mealSlots?.some(slot => slot.locked));
}

function structuralRestrictions(sourceDay, action, nextDayClassId) {
  if (!sourceDay) return;
  if (hasRecordedAdherence(sourceDay)) throw new Error('La giornata contiene aderenza registrata: non può essere riscritta strutturalmente. / The day contains recorded adherence and cannot be structurally rewritten.');
  if (hasBatchAllocation(sourceDay)) throw new Error('La giornata contiene pasti assegnati a lotti: scollega prima i lotti. / The day has batch allocations; detach them first.');
  if (action === 'remove' && hasLockedMeal(sourceDay)) throw new Error('Sblocca i pasti prima di rimuovere la giornata. / Unlock meals before removing the day.');
  if (action === 'modify' && nextDayClassId !== sourceDay.dayClassId && hasLockedMeal(sourceDay)) throw new Error('Sblocca i pasti prima di cambiare tipo di giornata. / Unlock meals before changing the day class.');
}

function configurationForDayClass(bundle, dayClassId) {
  const next = clone(bundle);
  if (!next.appConfig.dayClassIds.includes(dayClassId)) throw new Error(`DayClass ${dayClassId} is not active`);
  const cycle = next.cycles.find(item => item.id === next.appConfig.cycleId);
  if (!cycle) throw new Error('Active cycle not found');
  cycle.length = 1;
  cycle.days = [{ cycleDay: 1, dayClassId }];
  return next;
}

function sameSlotShape(a, b) {
  return a.mealClassId === b.mealClassId && a.time === b.time && Number(a.dayOffset || 0) === Number(b.dayOffset || 0) && a.mode === b.mode;
}

function lockedFixedSlots(sourceDay, targetDayClass) {
  if (!sourceDay || sourceDay.dayClassId !== targetDayClass.id) return [];
  const fixed = [];
  for (const slot of sourceDay.mealSlots || []) {
    if (!slot.locked) continue;
    const targetSlot = (targetDayClass.mealSlots || []).find(item => sameSlotShape(item, slot));
    if (!targetSlot) throw new Error('A locked meal no longer exists in the selected DayClass');
    fixed.push({ date: sourceDay.date, slot: clone(slot) });
  }
  return fixed;
}

function spilloverRows(day) {
  if (!day) return [];
  return (day.mealSlots || []).filter(slot => slot.civilDate !== day.date).map(slot => ({
    sourceDate: day.date,
    civilDate: slot.civilDate,
    mealOccurrenceId: slot.mealOccurrenceId,
    mealClassId: slot.mealClassId,
    time: slot.time,
    dayOffset: slot.dayOffset,
    mode: slot.mode
  }));
}

function spilloverDiff(beforeDay, afterDay) {
  const before = spilloverRows(beforeDay);
  const after = spilloverRows(afterDay);
  const signature = row => `${row.civilDate}|${row.mealClassId}|${row.time}|${row.dayOffset}|${row.mode}`;
  const beforeSet = new Set(before.map(signature));
  const afterSet = new Set(after.map(signature));
  return {
    removed: before.filter(row => !afterSet.has(signature(row))),
    added: after.filter(row => !beforeSet.has(signature(row))),
    affectedCivilDates: [...new Set([...before, ...after].map(row => row.civilDate))].sort()
  };
}

async function planDays(repo, planInstanceId) {
  return (await repo.getAllByIndex('calendarDays', 'planInstanceId', { kind: 'only', value: planInstanceId }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function shiftDayDate(day, delta, updatedAt, registry) {
  const next = clone(day);
  next.date = addCivilDays(day.date, delta);
  next.updatedAt = updatedAt;
  next.mealSlots = (next.mealSlots || []).map(slot => ({
    ...slot,
    civilDate: addCivilDays(slot.civilDate || addCivilDays(day.date, Number(slot.dayOffset || 0)), delta)
  }));
  registry.assert('calendarDay', next);
  return next;
}

function assertShiftableDays(days) {
  for (const day of days) {
    if (hasRecordedAdherence(day)) throw new Error(`La giornata ${day.date} contiene aderenza registrata e non può essere spostata. / Day ${day.date} contains recorded adherence and cannot be shifted.`);
    if (hasBatchAllocation(day)) throw new Error(`La giornata ${day.date} contiene pasti assegnati a lotti e non può essere spostata. / Day ${day.date} has batch allocations and cannot be shifted.`);
  }
}

async function validateProjectedPlan(projectedDays, planInstanceId, repo, { allowFrequencyWarnings = false } = {}) {
  const context = await loadPlanPolicyContext(repo, { days: projectedDays, planInstanceId });
  // A timeline splice changes dates, so the whole active-plan slice must be replaced during validation.
  // Otherwise old rows at dates no longer present in the projection can coexist with their shifted copies.
  context.calendarDays = context.calendarDays.filter(day => day.planInstanceId !== planInstanceId);
  const policy = validatePlanPolicy(projectedDays, context, { replacePlanInstanceId: planInstanceId });
  const warnings = allowFrequencyWarnings ? policy.violations.filter(row => row.code === 'frequency_window') : [];
  const blocking = policy.violations.filter(row => !(allowFrequencyWarnings && row.code === 'frequency_window'));
  if (blocking.length) {
    const error = new Error(`Piano non ammissibile / Plan constraints not met: ${[...new Set(blocking.map(row => row.code))].join(', ')}`);
    error.code = 'plan_constraint_violation';
    error.violations = blocking;
    throw error;
  }
  return { ...policy, structuralWarnings: warnings, valid: blocking.length === 0 };
}

async function recomputePlanBounds(repo, plan, { date, action }) {
  const days = (await repo.getAllByIndex('calendarDays', 'planInstanceId', { kind: 'only', value: plan.planInstanceId }))
    .filter(day => !(action === 'remove' && day.date === date));
  if (action === 'add') days.push({ date });
  const dates = [...new Set(days.map(day => day.date))].sort();
  if (!dates.length) throw new Error('The active plan must keep at least one calendar day');
  return { startDate: dates[0], endDate: dates.at(-1) };
}

async function generateManualDay({ plan, sourceDay, date, dayClassId, seed, createdAt }, { repo, registry }) {
  const bundle = await loadConfigurationBundle(repo);
  assertConfigurationBundle(bundle, registry);
  const active = activeRecords(bundle);
  const targetDayClass = active.dayClasses.find(item => item.id === dayClassId);
  if (!targetDayClass) throw new Error(`DayClass ${dayClassId} not found`);
  const fixedSlots = lockedFixedSlots(sourceDay, targetDayClass);
  const generated = await createPlanPreview({
    configurationOverride: configurationForDayClass(bundle, dayClassId),
    horizon: { startDate: date, endDate: date },
    seed,
    createdAt,
    reason: 'rebalance',
    startCycleDayOverride: 1,
    historyPlanInstanceId: plan.planInstanceId,
    previousGenerationRunIdOverride: plan.generationRunId,
    continuationPolicy: plan.continuationPolicy,
    fixedSlots
  }, { repo, registry });
  if (generated.status !== 'success') {
    const error = new Error(`Unable to build the selected day: ${generated.failure?.reason || generated.failure?.code || 'no feasible plan'}`);
    error.code = generated.failure?.code || 'no_feasible_plan';
    error.failure = generated.failure;
    throw error;
  }
  const day = clone(generated.calendarDays[0]);
  day.calendarDayId = sourceDay?.calendarDayId || stableHashId('calday', plan.planInstanceId, date);
  day.planInstanceId = plan.planInstanceId;
  day.createdAt = sourceDay?.createdAt || createdAt;
  day.updatedAt = createdAt;
  day.cycleDay = sourceDay?.dayClassId === dayClassId ? sourceDay.cycleDay : null;
  const run = clone(generated.generationRun);
  run.diagnostics = {
    ...(run.diagnostics || {}),
    structuralCalendarEdit: true,
    targetPlanInstanceId: plan.planInstanceId,
    targetDate: date,
    targetDayClassId: dayClassId
  };
  registry.assert('calendarDay', day);
  registry.assert('generationRun', run);
  return { day, generationRun: run };
}

async function validateRemoval(sourceDay, planInstanceId, repo) {
  const context = await loadPlanPolicyContext(repo, { days: [sourceDay], planInstanceId });
  const projected = context.calendarDays.filter(day => !(day.planInstanceId === planInstanceId && day.date === sourceDay.date));
  const changedCivilDates = [...new Set([sourceDay.date, ...(sourceDay.mealSlots || []).map(slot => slot.civilDate || addCivilDays(sourceDay.date, slot.dayOffset || 0))])];
  const frequencies = evaluateFrequencies({
    profile: context.active.foodPreferences,
    calendarDays: projected,
    recipesByVersion: context.recipesByVersion,
    revisionById: context.revisionById,
    foodGroups: context.foodGroups,
    changedCivilDates
  });
  if (frequencies.violations?.length) {
    const error = new Error('Removing this day would violate configured frequency constraints');
    error.code = 'plan_constraint_violation';
    error.violations = frequencies.violations.map(window => ({ code: 'frequency_window', ruleId: window.ruleId, window }));
    throw error;
  }
  return frequencies;
}

export async function createCalendarStructurePreview({ planInstanceId = null, date, action, dayClassId = null, seed = null, createdAt = null }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  assertCivilDate(date);
  if (!['add', 'modify', 'remove', 'insert', 'remove_shift'].includes(action)) throw new Error(`Unsupported calendar edit action ${action}`);
  const contextHash = await previewContext(repo);
  const plan = await activePlan(repo, planInstanceId);
  const sourceDay = await planDayForDate(repo, plan.planInstanceId, date);
  if (action === 'add' && sourceDay) throw new Error('A calendar day already exists on this date');
  if (action === 'insert' && !sourceDay) throw new Error('Insert requires an existing anchor day');
  if (!['add', 'insert'].includes(action) && !sourceDay) throw new Error('Calendar day not found');
  structuralRestrictions(sourceDay, action === 'remove_shift' ? 'remove' : action, dayClassId);
  const timestamp = nowIso(createdAt);
  let proposedDay = null;
  let generationRun = null;
  let shiftedDays = [];
  let projectedDays = null;

  if (action === 'insert' || action === 'remove_shift') {
    const existingDays = await planDays(repo, plan.planInstanceId);
    const toShift = existingDays.filter(day => action === 'insert' ? day.date >= date : day.date > date);
    assertShiftableDays(action === 'remove_shift' ? [sourceDay, ...toShift] : toShift);
    shiftedDays = toShift.map(day => shiftDayDate(day, action === 'insert' ? 1 : -1, timestamp, registry));
    if (action === 'insert') {
      if (!dayClassId) throw new Error('DayClass is required');
      ({ day: proposedDay, generationRun } = await generateManualDay({ plan, sourceDay: null, date, dayClassId, seed: seed || `calendar-insert-${date}-${dayClassId}`, createdAt: timestamp }, { repo, registry }));
      proposedDay.calendarDayId = stableHashId('calday-insert', plan.planInstanceId, date, generationRun.generationRunId);
      proposedDay.mealSlots = (proposedDay.mealSlots || []).map(slot => ({ ...slot, mealOccurrenceId: stableHashId('meal-insert', proposedDay.calendarDayId, slot.mealOccurrenceId) }));
      registry.assert('calendarDay', proposedDay);
      projectedDays = [...existingDays.filter(day => day.date < date), proposedDay, ...shiftedDays].sort((a, b) => a.date.localeCompare(b.date));
    } else {
      projectedDays = [...existingDays.filter(day => day.date < date), ...shiftedDays].sort((a, b) => a.date.localeCompare(b.date));
      if (!projectedDays.length) throw new Error('The active plan must keep at least one calendar day');
    }
    const projectedPolicy = await validateProjectedPlan(projectedDays, plan.planInstanceId, repo, { allowFrequencyWarnings: true });
    const bounds = { startDate: projectedDays[0].date, endDate: projectedDays.at(-1).date };
    const nextPlan = { ...clone(plan), ...bounds, updatedAt: timestamp };
    registry.assert('planInstance', nextPlan);
    const spillovers = { removed: spilloverRows(sourceDay), added: proposedDay ? spilloverRows(proposedDay) : [], affectedCivilDates: [...new Set([...(spilloverRows(sourceDay) || []), ...(spilloverRows(proposedDay) || [])].map(row => row.civilDate))].sort() };
    return sealPreview({
      status: 'success', action, planInstanceId: plan.planInstanceId, date, sourceDay: clone(sourceDay), proposedDay: clone(proposedDay), shiftedDays: clone(shiftedDays),
      shiftedBefore: clone(toShift), calendarDays: proposedDay ? [clone(proposedDay)] : [], projectedCalendarDays: clone(projectedDays), generationRun: clone(generationRun), planBefore: clone(plan), planAfter: nextPlan, spillovers,
      policyWarnings: clone(projectedPolicy.structuralWarnings || []),
      summary: { sourceMealCount: sourceDay?.mealSlots?.length || 0, proposedMealCount: proposedDay?.mealSlots?.length || 0, shiftedDayCount: shiftedDays.length, removedSpillovers: spillovers.removed.length, addedSpillovers: spillovers.added.length, frequencyWarningCount: projectedPolicy.structuralWarnings?.length || 0, newStartDate: nextPlan.startDate, newEndDate: nextPlan.endDate }
    }, contextHash, repo, 'calendar_structure');
  }
  if (action !== 'remove') {
    if (!dayClassId) throw new Error('DayClass is required');
    ({ day: proposedDay, generationRun } = await generateManualDay({ plan, sourceDay, date, dayClassId, seed: seed || `calendar-${action}-${date}-${dayClassId}`, createdAt: timestamp }, { repo, registry }));
    const policyContext = await loadPlanPolicyContext(repo, { days: [proposedDay], planInstanceId: plan.planInstanceId });
    const policy = validatePlanPolicy([proposedDay], policyContext, { replacePlanInstanceId: plan.planInstanceId });
    if (!policy.valid) {
      const error = new Error(`Piano non ammissibile / Plan constraints not met: ${[...new Set(policy.violations.map(row => row.code))].join(', ')}`);
      error.code = 'plan_constraint_violation'; error.violations = policy.violations; throw error;
    }
  } else {
    await validateRemoval(sourceDay, plan.planInstanceId, repo);
  }
  const bounds = await recomputePlanBounds(repo, plan, { date, action });
  const nextPlan = { ...clone(plan), ...bounds, updatedAt: timestamp };
  registry.assert('planInstance', nextPlan);
  const spillovers = spilloverDiff(sourceDay, proposedDay);
  return sealPreview({
    status: 'success', action, planInstanceId: plan.planInstanceId, date, sourceDay: clone(sourceDay), proposedDay: clone(proposedDay),
    calendarDays: proposedDay ? [clone(proposedDay)] : [], generationRun: clone(generationRun), planBefore: clone(plan), planAfter: nextPlan,
    spillovers, summary: {
      sourceMealCount: sourceDay?.mealSlots?.length || 0,
      proposedMealCount: proposedDay?.mealSlots?.length || 0,
      removedSpillovers: spillovers.removed.length,
      addedSpillovers: spillovers.added.length,
      newStartDate: nextPlan.startDate,
      newEndDate: nextPlan.endDate
    }
  }, contextHash, repo, 'calendar_structure');
}

async function metaBefore(repo, keys) {
  const metaSet = {}; const metaDelete = [];
  for (const key of keys) { const value = await repo.getMeta(key); if (value === undefined) metaDelete.push(key); else metaSet[key] = value; }
  return { metaSet, metaDelete };
}

export async function commitCalendarStructurePreview(preview, { repo = repositories, registry, createdAt = null } = {}) {
  return withValidatedPreview(preview, { repo, kind: 'calendar_structure' }, async recheck => {
    const plan = await activePlan(repo, preview.planInstanceId);
    const sourceDay = await planDayForDate(repo, plan.planInstanceId, preview.date);
    if (preview.action === 'add' && sourceDay) throw new Error('Calendar day was added by another change');
    if (preview.action === 'insert' && (!sourceDay || sourceDay.calendarDayId !== preview.sourceDay?.calendarDayId)) throw new Error('Insert anchor changed before commit');
    if (!['add', 'insert'].includes(preview.action) && (!sourceDay || sourceDay.calendarDayId !== preview.sourceDay?.calendarDayId)) throw new Error('Calendar day changed before commit');
    structuralRestrictions(sourceDay, preview.action === 'remove_shift' ? 'remove' : preview.action, preview.proposedDay?.dayClassId || null);
    if (['insert', 'remove_shift'].includes(preview.action)) {
      const currentDays = await planDays(repo, plan.planInstanceId);
      const expected = preview.shiftedBefore || [];
      for (const beforeDay of expected) {
        const current = currentDays.find(day => day.calendarDayId === beforeDay.calendarDayId);
        if (!current || current.date !== beforeDay.date || current.updatedAt !== beforeDay.updatedAt) throw new Error('A shifted calendar day changed before commit');
      }
      assertShiftableDays(preview.action === 'remove_shift' ? [sourceDay, ...expected] : expected);
      await validateProjectedPlan(preview.projectedCalendarDays || [], plan.planInstanceId, repo, { allowFrequencyWarnings: true });
    } else if (preview.proposedDay) await validatePlannedDays([preview.proposedDay], repo, { replacePlanInstanceId: plan.planInstanceId });
    else await validateRemoval(sourceDay, plan.planInstanceId, repo);

    const timestamp = nowIso(createdAt);
    const nextPlan = { ...clone(preview.planAfter), updatedAt: timestamp };
    registry.assert('planInstance', nextPlan);
    const run = preview.generationRun ? { ...clone(preview.generationRun), createdAt: preview.generationRun.createdAt || timestamp } : null;
    if (run) registry.assert('generationRun', run);
    const currentRun = run ? await repo.get('generationRuns', run.generationRunId) : null;
    const beforeMeta = await metaBefore(repo, ['lastSuccessfulGenerationRunId', 'planUpdatedAt']);
    const beforePuts = { planInstances: [plan] };
    const beforeDeletes = {};
    const afterPuts = { planInstances: [nextPlan] };
    const afterDeletes = {};
    if (['insert', 'remove_shift'].includes(preview.action)) {
      beforePuts.calendarDays = [...(preview.shiftedBefore || []), ...(preview.action === 'remove_shift' ? [sourceDay] : [])];
      if (preview.action === 'insert') beforeDeletes.calendarDays = [preview.proposedDay.calendarDayId];
      afterPuts.calendarDays = [...(preview.shiftedDays || []), ...(preview.action === 'insert' ? [preview.proposedDay] : [])];
      if (preview.action === 'remove_shift') afterDeletes.calendarDays = [sourceDay.calendarDayId];
    } else {
      if (sourceDay) beforePuts.calendarDays = [sourceDay];
      else beforeDeletes.calendarDays = [preview.proposedDay.calendarDayId];
      if (preview.action === 'remove') afterDeletes.calendarDays = [sourceDay.calendarDayId];
      else afterPuts.calendarDays = [preview.proposedDay];
    }
    if (run) {
      afterPuts.generationRuns = [run];
      if (currentRun) beforePuts.generationRuns = [currentRun]; else beforeDeletes.generationRuns = [run.generationRunId];
    }
    const before = mutationSnapshot({ puts: beforePuts, deletes: beforeDeletes, ...beforeMeta });
    const after = mutationSnapshot({ puts: afterPuts, deletes: afterDeletes, metaSet: { planUpdatedAt: timestamp, ...(run ? { lastSuccessfulGenerationRunId: run.generationRunId } : {}) } });
    const kind = `calendar_day_${preview.action}`;
    const operation = await commitOperation({
      planInstanceId: plan.planInstanceId,
      kind,
      before,
      after,
      createdAt: timestamp,
      metadata: {
        date: preview.date,
        beforeDayClassId: sourceDay?.dayClassId || null,
        afterDayClassId: preview.proposedDay?.dayClassId || null,
        spillovers: clone(preview.spillovers),
        generationRunId: run?.generationRunId || null,
        shiftedDayCount: preview.shiftedDays?.length || 0
      }
    }, { repo, registry, beforeCommit: recheck });
    return { planInstance: nextPlan, calendarDay: preview.proposedDay || null, operation, generationRun: run };
  });
}

export async function loadCivilMealsForDate(date, { repo = repositories } = {}) {
  assertCivilDate(date);
  const activeId = await repo.getMeta('activePlanInstanceId');
  if (!activeId) return [];
  const planIds = new Set(); let id = activeId;
  while (id && !planIds.has(id)) { planIds.add(id); const plan = await repo.get('planInstances', id); id = plan?.previousPlanInstanceId || null; }
  const sourceDays = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: addCivilDays(date, -2), upper: date });
  return sourceDays.filter(day => planIds.has(day.planInstanceId)).flatMap(day => (day.mealSlots || [])
    .filter(slot => slot.civilDate === date)
    .map(slot => ({ sourceDate: day.date, sourceCalendarDayId: day.calendarDayId, planInstanceId: day.planInstanceId, slot: clone(slot) })))
    .sort((a, b) => a.slot.time.localeCompare(b.slot.time) || a.slot.mealOccurrenceId.localeCompare(b.slot.mealOccurrenceId));
}
