import { addCivilDays, dateRange } from './planMath.js';
import { FREQUENCY_POLICY_VERSION, FREQUENCY_PRIORITY, frequencyRules, inRuleScope, occurrenceMatches, planOccurrences } from '../domain/frequencyCounter.js';
import { telemetryAddTime, telemetryIncrement } from './plannerTelemetry.js';

function maxOccurrencesForRule(rule) {
  if (rule.mode === 'never') return 0;
  if (rule.mode !== 'frequency' || rule.maxOccurrences === null) return null;
  return Number(rule.maxOccurrences);
}

function emptyState(ruleCount) {
  return { assignedIds: new Set(), ruleDateCounts: Array.from({ length: ruleCount }, () => new Map()) };
}

function cloneState(state) {
  return { assignedIds: new Set(state.assignedIds), ruleDateCounts: state.ruleDateCounts.map(counts => new Map(counts)) };
}

function incrementDate(counts, date, amount = 1) { counts.set(date, (counts.get(date) || 0) + amount); }

function dateInWindow(date, window) { return date >= window.effectiveStartDate && date <= window.endDate; }

export function compileFrequencySearch({ profile, previousCalendarDays = [], potentials = [], recipesByVersion = new Map(), revisionById = new Map(), foodGroups = [],
  recipeFeatureIndex = null, coverageDates = null, endDates = null, changedCivilDates = null, telemetry = null } = {}) {
  const started = performance.now();
  const rules = frequencyRules(profile);
  const coverage = new Set(coverageDates || previousCalendarDays.map(day => day.date));
  const baselineOccurrences = planOccurrences(previousCalendarDays);
  const dates = [...new Set(endDates || [...previousCalendarDays.map(day => day.date), ...baselineOccurrences.map(slot => slot.civilDate), ...potentials.map(slot => slot.civilDate)])].sort();
  const changed = changedCivilDates ? [...new Set(changedCivilDates)] : null;
  const baselineByRule = rules.map(rule => {
    const contributing = []; const unresolved = []; const external = [];
    for (const occurrence of baselineOccurrences) {
      if (!inRuleScope(rule, occurrence)) continue;
      if (occurrence.mode === 'external') { external.push(occurrence); continue; }
      const match = occurrenceMatches(occurrence, rule.target, { recipesByVersion, revisionById, foodGroups, recipeFeatureIndex });
      if (match.unresolved) unresolved.push(occurrence);
      if (match.matches) contributing.push(occurrence);
    }
    return { contributing, unresolved, external };
  });

  function createWindow(rule, ruleIndex, endDate) {
    const windowStart = addCivilDays(endDate, -(rule.window.days - 1));
    const effectiveStartDate = windowStart < rule.effectiveFrom ? rule.effectiveFrom : windowStart;
    const applicableDates = effectiveStartDate <= endDate ? dateRange(effectiveStartDate, endDate) : [];
    const coveredDays = applicableDates.filter(date => coverage.has(date)).length;
    const complete = windowStart >= rule.effectiveFrom && coveredDays === rule.window.days;
    const baseline = baselineByRule[ruleIndex];
    const baseContributing = baseline.contributing.filter(slot => dateInWindow(slot.civilDate, { effectiveStartDate, endDate }));
    const baseMatchedDates = new Set(baseContributing.map(slot => slot.civilDate));
    const baseUnresolved = baseline.unresolved.filter(slot => dateInWindow(slot.civilDate, { effectiveStartDate, endDate })).length;
    const baseExternal = baseline.external.filter(slot => dateInWindow(slot.civilDate, { effectiveStartDate, endDate })).length;
    const potentialSlots = potentials.filter(slot => slot.mode === 'planned' && slot.civilDate >= effectiveStartDate && slot.civilDate <= endDate && inRuleScope(rule, slot) && slot.canMatch?.[rule.id] !== false);
    const target = rule.mode === 'frequency' && rule.targetOccurrences !== null ? rule.targetOccurrences * (complete ? 1 : coveredDays / rule.window.days) : null;
    const firstCovered = [...coverage].filter(date => date >= rule.effectiveFrom).sort()[0] || rule.effectiveFrom;
    return {
      rule, ruleIndex, endDate, windowStart, effectiveStartDate, coveredDays, complete, target, firstEvaluableDate: addCivilDays(firstCovered, rule.window.days - 1),
      baseContributing, baseMatchedDates, baseMealCount: baseContributing.length, baseUnresolved, baseExternal, potentialSlots
    };
  }

  const windows = [];
  const windowByRuleAndEnd = rules.map(() => new Map());
  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
    const rule = rules[ruleIndex];
    for (const endDate of dates) {
      if (endDate < rule.effectiveFrom) continue;
      if (changed && !changed.some(date => date <= endDate && endDate <= addCivilDays(date, rule.window.days - 1))) continue;
      const window = createWindow(rule, ruleIndex, endDate);
      windows.push(window); windowByRuleAndEnd[ruleIndex].set(endDate, window);
    }
  }

  function ruleMatchesOccurrence(rule, occurrence) {
    if (occurrence.mode !== 'planned' || !inRuleScope(rule, occurrence) || occurrence.civilDate < rule.effectiveFrom) return false;
    for (const component of occurrence.recipeComponents || []) {
      if (component.included === false) continue;
      const recipe = recipesByVersion.get(component.recipeVersionId);
      if (!recipe || recipe.recipeId !== component.recipeId) continue;
      if (recipeFeatureIndex?.matches?.(recipe, rule.target.type, rule.target.id) === true) return true;
      if (!recipeFeatureIndex) {
        const match = occurrenceMatches({ ...occurrence, recipeComponents: [component] }, rule.target, { recipesByVersion, revisionById, foodGroups });
        if (match.matches) return true;
      }
    }
    return false;
  }

  function deltaForSlots(slots = []) {
    const assignedIds = new Set(); const ruleDateCounts = Array.from({ length: rules.length }, () => new Map());
    for (const occurrence of slots) {
      assignedIds.add(occurrence.mealOccurrenceId);
      if (occurrence.mode !== 'planned') continue;
      for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
        if (ruleMatchesOccurrence(rules[ruleIndex], occurrence)) incrementDate(ruleDateCounts[ruleIndex], occurrence.civilDate);
      }
    }
    return { assignedIds, ruleDateCounts };
  }

  function extendState(state, slots = []) {
    const next = cloneState(state); const delta = deltaForSlots(slots);
    for (const id of delta.assignedIds) next.assignedIds.add(id);
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) for (const [date, count] of delta.ruleDateCounts[ruleIndex]) incrementDate(next.ruleDateCounts[ruleIndex], date, count);
    return next;
  }

  function countsForWindow(window, state, extra = null) {
    const rule = window.rule; const generated = state.ruleDateCounts[window.ruleIndex]; const delta = extra?.ruleDateCounts?.[window.ruleIndex];
    if (rule.countUnit === 'day') {
      const datesMatched = new Set(window.baseMatchedDates);
      for (const [date, count] of generated) if (count > 0 && dateInWindow(date, window)) datesMatched.add(date);
      for (const [date, count] of delta || []) if (count > 0 && dateInWindow(date, window)) datesMatched.add(date);
      return { count: datesMatched.size, countedIds: datesMatched };
    }
    let generatedCount = 0;
    for (const [date, count] of generated) if (dateInWindow(date, window)) generatedCount += count;
    for (const [date, count] of delta || []) if (dateInWindow(date, window)) generatedCount += count;
    return { count: window.baseMealCount + generatedCount, countedIds: null };
  }

  function potentialForWindow(window, state, extra, { fromDietDate = null, strictAfter = false } = {}) {
    const ids = new Set(); let futureLength = 0;
    const extraAssigned = extra?.assignedIds || new Set();
    for (const slot of window.potentialSlots) {
      if (fromDietDate && (strictAfter ? slot.dietDate <= fromDietDate : slot.dietDate < fromDietDate)) continue;
      if (state.assignedIds.has(slot.mealOccurrenceId) || extraAssigned.has(slot.mealOccurrenceId)) continue;
      futureLength += 1;
      ids.add(window.rule.countUnit === 'day' ? slot.civilDate : slot.mealOccurrenceId);
    }
    return { ids, futureLength };
  }

  function evaluate(state, { extraSlots = [], fromDietDate = null, strictAfter = false } = {}) {
    const evalStarted = performance.now();
    telemetryIncrement(telemetry, 'frequencyEvaluations');
    telemetryIncrement(telemetry, 'compiledFrequencyEvaluations');
    const extra = extraSlots.length ? deltaForSlots(extraSlots) : null;
    const evaluated = [];
    for (const window of windows) {
      telemetryIncrement(telemetry, 'frequencyWindowEvaluations');
      telemetryIncrement(telemetry, 'compiledFrequencyWindowEvaluations');
      const { count, countedIds } = countsForWindow(window, state, extra);
      const future = potentialForWindow(window, state, extra, { fromDietDate, strictAfter });
      const potential = window.rule.countUnit === 'day' ? [...future.ids].filter(date => !countedIds.has(date)).length : future.ids.size;
      const maxViolation = window.rule.mode === 'never' ? count > 0 : window.rule.maxOccurrences !== null && count > window.rule.maxOccurrences;
      const minViolation = window.rule.mode === 'frequency' && window.complete && window.rule.minOccurrences !== null && count + potential < window.rule.minOccurrences;
      const stateName = window.baseUnresolved ? 'not_evaluable' : maxViolation || minViolation ? 'violated' : window.rule.mode === 'never' ? 'satisfied' : !window.complete || future.futureLength ? 'pending' : 'satisfied';
      const idealPenalty = window.target === null ? 0 : (future.futureLength ? Math.max(0, count - window.target, window.target - count - potential) : Math.abs(count - window.target)) * FREQUENCY_PRIORITY[window.rule.priority];
      evaluated.push({
        ruleId: window.rule.id, target: structuredClone(window.rule.target), countUnit: window.rule.countUnit, countBasis: 'planned',
        interval: { startDate: window.windowStart, endDate: window.endDate }, effectiveStartDate: window.effectiveStartDate, count,
        min: window.rule.mode === 'frequency' ? window.rule.minOccurrences : null, ideal: window.rule.mode === 'frequency' ? window.rule.targetOccurrences : null,
        max: window.rule.mode === 'never' ? 0 : window.rule.maxOccurrences, state: stateName, complete: window.complete, coveredDays: window.coveredDays,
        firstEvaluableDate: window.firstEvaluableDate, contributingMeals: [], unknownExternalMeals: window.baseExternal, unresolvedPlannedMeals: window.baseUnresolved,
        remainingReachable: potential, maxViolation, minViolation, deviationFromIdeal: window.target === null ? null : count - window.target,
        idealPenalty, guarantee: 'known_planned_meals_only'
      });
    }
    const violations = evaluated.filter(window => window.state === 'violated' || window.unresolvedPlannedMeals > 0);
    const result = { policyVersion: FREQUENCY_POLICY_VERSION, valid: !violations.length, windows: evaluated, violations, idealPenalty: evaluated.reduce((sum, window) => sum + window.idealPenalty, 0) };
    telemetryAddTime(telemetry, 'frequencyMs', performance.now() - evalStarted);
    return result;
  }

  function countAt(ruleIndex, endDate, state) {
    const window = windowByRuleAndEnd[ruleIndex].get(endDate) || createWindow(rules[ruleIndex], ruleIndex, endDate);
    return { window, ...countsForWindow(window, state) };
  }

  function candidateAdmission(state, { recipe, date, mealClass }) {
    telemetryIncrement(telemetry, 'candidateAdmissionChecks');
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules[ruleIndex]; const limit = maxOccurrencesForRule(rule);
      if (limit === null || date < rule.effectiveFrom) continue;
      if (rule.scope.mealClassIds.length && !rule.scope.mealClassIds.includes(mealClass.id)) continue;
      if (recipeFeatureIndex?.matches?.(recipe, rule.target.type, rule.target.id) !== true) continue;
      const { window, count } = countAt(ruleIndex, date, state);
      const sameDayAlreadyCounts = rule.countUnit === 'day' && (window.baseMatchedDates.has(date) || Number(state.ruleDateCounts[ruleIndex].get(date) || 0) > 0);
      if (!sameDayAlreadyCounts && count >= limit) return { allowed: false, reason: `frequency_cap:${rule.id}` };
    }
    return { allowed: true };
  }

  function headroomPenalty(state, { endDate, progress }) {
    let penalty = 0;
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules[ruleIndex]; const limit = maxOccurrencesForRule(rule);
      if (limit === null || limit <= 0 || endDate < rule.effectiveFrom) continue;
      const { count } = countAt(ruleIndex, endDate, state);
      const utilization = Math.min(1, count / Math.max(1, limit));
      const earlyUse = Math.max(0, utilization - Math.min(1, progress));
      penalty += earlyUse * 24 * (FREQUENCY_PRIORITY[rule.priority] || FREQUENCY_PRIORITY.normal);
    }
    return penalty;
  }

  function stateKey(state, { fromDate = null } = {}) {
    return rules.map((rule, ruleIndex) => {
      const minimumDate = fromDate ? addCivilDays(fromDate, -(Math.max(1, Number(rule.window?.days || 1)) - 1)) : null;
      const entries = [...state.ruleDateCounts[ruleIndex].entries()]
        .filter(([date, count]) => count > 0 && (!minimumDate || date >= minimumDate))
        .sort(([a], [b]) => a.localeCompare(b));
      return `${rule.id}:${entries.map(([date, count]) => `${date}=${count}`).join(',')}`;
    }).join('|');
  }

  function searchRisk(state, { endDate, fromDietDate = null } = {}) {
    let risk = 0;
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules[ruleIndex];
      if (!endDate || endDate < rule.effectiveFrom) continue;
      const { window, count } = countAt(ruleIndex, endDate, state);
      const limit = maxOccurrencesForRule(rule);
      if (limit !== null) {
        if (limit === 0 && count > 0) risk = 1;
        else if (limit > 0) risk = Math.max(risk, Math.min(1, count / limit));
      }
      if (rule.mode === 'frequency' && rule.minOccurrences !== null && Number(rule.minOccurrences) > 0 && window.complete) {
        const future = potentialForWindow(window, state, null, { fromDietDate, strictAfter: true });
        const potential = rule.countUnit === 'day'
          ? [...future.ids].filter(date => !window.baseMatchedDates.has(date) && Number(state.ruleDateCounts[ruleIndex].get(date) || 0) <= 0).length
          : future.ids.size;
        const required = Number(rule.minOccurrences);
        const slack = count + potential - required;
        if (slack <= 0) risk = Math.max(risk, 1);
        else if (potential > 0) risk = Math.max(risk, Math.max(0, 1 - slack / Math.max(1, potential)));
      }
    }
    return Math.max(0, Math.min(1, risk));
  }

  function alternativeKey(mealSlots = []) {
    return rules.map(rule => {
      const matched = mealSlots.filter(slot => slot.mode === 'planned' && inRuleScope(rule, slot) && ruleMatchesOccurrence(rule, slot));
      const byDate = new Map();
      for (const slot of matched) byDate.set(slot.civilDate, (byDate.get(slot.civilDate) || 0) + 1);
      if (rule.countUnit === 'day') return `${rule.id}:${[...byDate.keys()].sort().join(',')}`;
      return `${rule.id}:${[...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => `${date}=${count}`).join(',')}`;
    }).join('|');
  }

  telemetryAddTime(telemetry, 'frequencyCompileMs', performance.now() - started);
  return { rules, initialState: emptyState(rules.length), evaluate, extendState, candidateAdmission, headroomPenalty, alternativeKey, stateKey, searchRisk };
}
