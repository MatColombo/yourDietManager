import { addCivilDays, dateRange } from '../planner/planMath.js';
import { recipeMatchesTarget } from '../planner/recipeFeatures.js';

export const FREQUENCY_POLICY_VERSION = 'frequency-policy-r3-1';
export const FREQUENCY_PRIORITY = Object.freeze({ low: 1, normal: 2, high: 4 });
export function frequencyRules(profile) { return profile?.schemaVersion === 2 ? profile.rules.filter(rule => rule.enabled && rule.mode !== 'none') : []; }
export function legacyPreferenceRules(profile) { return profile?.schemaVersion === 2 ? profile.legacyRules || [] : profile?.rules || []; }
export function frequencyHistoryDays(profile) {
  return Math.max(14, ...frequencyRules(profile).map(rule => rule.window.days - 1), ...legacyPreferenceRules(profile).map(rule => Math.max(0, (rule.frequency?.windowDays || 1) - 1))) + 2;
}
export function inRuleScope(rule, occurrence) { return !rule.scope.mealClassIds.length || rule.scope.mealClassIds.includes(occurrence.mealClassId); }

export function planOccurrences(calendarDays = []) {
  const occurrences = new Map();
  for (const day of calendarDays) for (const slot of day.mealSlots || []) {
    const date = slot.civilDate || addCivilDays(day.date, Number(slot.dayOffset || 0));
    const value = { ...slot, civilDate: date, dietDate: day.date, calendarDayId: day.calendarDayId };
    const previous = occurrences.get(slot.mealOccurrenceId);
    if (previous && (previous.civilDate !== date || JSON.stringify(previous.recipeComponents) !== JSON.stringify(slot.recipeComponents))) throw new Error(`Conflicting meal occurrence ${slot.mealOccurrenceId}`);
    occurrences.set(slot.mealOccurrenceId, value);
  }
  return [...occurrences.values()].sort((a, b) => a.civilDate.localeCompare(b.civilDate) || a.mealOccurrenceId.localeCompare(b.mealOccurrenceId));
}
export function occurrenceMatches(occurrence, target, { recipesByVersion, revisionById, foodGroups = [] }) {
  let missing = false; let matches = false;
  for (const component of occurrence.recipeComponents || []) {
    if (component.included === false) continue;
    const recipe = recipesByVersion.get(component.recipeVersionId);
    if (!recipe || recipe.recipeId !== component.recipeId) { missing = true; continue; }
    if ((recipe.ingredientLines || []).some(line => line.included !== false && !revisionById.has(line.ingredientRevisionId))) missing = true;
    if (recipeMatchesTarget(recipe, target.type, target.id, revisionById, foodGroups)) matches = true;
  }
  return { matches, unresolved: missing };
}

// One counter for UI, solver reachability, final validation and every commit.
// A materialized civil day is coverage; missing days are never fabricated zeros.
export function countFrequencyWindow(rule, endDate, context) {
  const windowStart = addCivilDays(endDate, -(rule.window.days - 1));
  const startDate = windowStart < rule.effectiveFrom ? rule.effectiveFrom : windowStart;
  const coverage = new Set(context.coverageDates || context.calendarDays.map(day => day.date));
  const all = context.occurrences || planOccurrences(context.calendarDays);
  const relevant = all.filter(slot => slot.civilDate >= startDate && slot.civilDate <= endDate && inRuleScope(rule, slot));
  const contributing = []; let unknownExternalMeals = 0; let unresolvedPlannedMeals = 0;
  for (const occurrence of relevant) {
    if (occurrence.mode === 'external') { unknownExternalMeals += 1; continue; }
    const match = occurrenceMatches(occurrence, rule.target, context);
    if (match.unresolved) unresolvedPlannedMeals += 1;
    if (match.matches) contributing.push({ mealOccurrenceId: occurrence.mealOccurrenceId, civilDate: occurrence.civilDate, mealClassId: occurrence.mealClassId, calendarDayId: occurrence.calendarDayId });
  }
  const count = rule.countUnit === 'day' ? new Set(contributing.map(item => item.civilDate)).size : contributing.length;
  const applicableDates = startDate <= endDate ? dateRange(startDate, endDate) : [];
  const coveredDays = applicableDates.filter(date => coverage.has(date)).length;
  const complete = windowStart >= rule.effectiveFrom && coveredDays === rule.window.days;
  const future = (context.potentialOccurrences || []).filter(slot => slot.mode === 'planned' && slot.civilDate >= startDate && slot.civilDate <= endDate && inRuleScope(rule, slot)
    && slot.canMatch?.[rule.id] !== false);
  const countedIds = new Set(contributing.map(item => rule.countUnit === 'day' ? item.civilDate : item.mealOccurrenceId));
  const potential = new Set(future.map(slot => rule.countUnit === 'day' ? slot.civilDate : slot.mealOccurrenceId).filter(id => !countedIds.has(id))).size;
  const maxViolation = rule.mode === 'never' ? count > 0 : rule.maxOccurrences !== null && count > rule.maxOccurrences;
  const minViolation = rule.mode === 'frequency' && complete && rule.minOccurrences !== null && count + potential < rule.minOccurrences;
  const target = rule.mode === 'frequency' && rule.targetOccurrences !== null ? rule.targetOccurrences * (complete ? 1 : coveredDays / rule.window.days) : null;
  const state = !rule.enabled || rule.mode === 'none' || endDate < rule.effectiveFrom ? 'not_evaluable' : unresolvedPlannedMeals ? 'not_evaluable'
    : maxViolation || minViolation ? 'violated' : rule.mode === 'never' ? 'satisfied' : !complete || future.length ? 'pending' : 'satisfied';
  const firstCovered = [...coverage].filter(date => date >= rule.effectiveFrom).sort()[0] || rule.effectiveFrom;
  return { ruleId: rule.id, target: structuredClone(rule.target), countUnit: rule.countUnit, countBasis: 'planned', interval: { startDate: windowStart, endDate },
    effectiveStartDate: startDate, count, min: rule.mode === 'frequency' ? rule.minOccurrences : null, ideal: rule.mode === 'frequency' ? rule.targetOccurrences : null,
    max: rule.mode === 'never' ? 0 : rule.maxOccurrences, state, complete, coveredDays, firstEvaluableDate: addCivilDays(firstCovered, rule.window.days - 1),
    contributingMeals: contributing, unknownExternalMeals, unresolvedPlannedMeals, remainingReachable: potential, maxViolation, minViolation,
    deviationFromIdeal: target === null ? null : count - target, idealPenalty: target === null ? 0 : (future.length ? Math.max(0, count - target, target - count - potential) : Math.abs(count - target)) * FREQUENCY_PRIORITY[rule.priority],
    guarantee: 'known_planned_meals_only' };
}

export function evaluateFrequencies({ profile, calendarDays = [], recipesByVersion = new Map(), revisionById = new Map(), foodGroups = [], changedCivilDates = null,
  endDates = null, coverageDates = null, potentialOccurrences = [] }) {
  const rules = frequencyRules(profile); const occurrences = planOccurrences(calendarDays);
  const dates = [...new Set(endDates || [...calendarDays.map(day => day.date), ...occurrences.map(slot => slot.civilDate)])].sort();
  const windows = [];
  for (const rule of rules) for (const endDate of dates) {
    if (endDate < rule.effectiveFrom) continue;
    if (changedCivilDates && !changedCivilDates.some(date => date <= endDate && endDate <= addCivilDays(date, rule.window.days - 1))) continue;
    windows.push(countFrequencyWindow(rule, endDate, { calendarDays, occurrences, recipesByVersion, revisionById, foodGroups, coverageDates, potentialOccurrences }));
  }
  const violations = windows.filter(window => window.state === 'violated' || window.unresolvedPlannedMeals > 0);
  return { policyVersion: FREQUENCY_POLICY_VERSION, valid: !violations.length, windows, violations, idealPenalty: windows.reduce((sum, window) => sum + window.idealPenalty, 0) };
}

function scopeContains(a, b) { return !a.length || (b.length > 0 && b.every(id => a.includes(id))); }
export function targetContains(parent, child, { index, foodGroups = [], ingredients = [], revisions = [] } = {}) {
  if (parent.type === child.type && parent.id === child.id) return true;
  if (parent.type === 'foodGroup') {
    const group = foodGroups.find(group => group.id === parent.id && group.status === 'active');
    return Boolean(group?.members.some(member => targetContains(member, child, { index, foodGroups: [], ingredients, revisions })));
  }
  if (parent.type === 'productFood' && child.type === 'productFood') {
    let term = index?.term(child.id); const seen = new Set();
    while (term && !seen.has(term.termId)) { if (term.termId === parent.id) return true; seen.add(term.termId); term = index.term(term.parentTermId); }
  }
  if (parent.type === 'productFood' && child.type === 'ingredient') {
    const family = ingredients.find(item => item.ingredientId === child.id);
    const revision = revisions.find(item => item.ingredientRevisionId === family?.currentRevisionId);
    return Object.values(revision?.productTaxonomy || {}).includes(parent.id);
  }
  if (child.type === 'foodGroup') {
    const group = foodGroups.find(group => group.id === child.id && group.status === 'active');
    return Boolean(group?.members.length && group.members.every(member => targetContains(parent, member, { index, foodGroups: [], ingredients, revisions })));
  }
  return false;
}
export function frequencyConflicts(profile, context = {}) {
  const rules = frequencyRules(profile); const conflicts = [];
  for (const child of rules.filter(rule => rule.mode === 'frequency' && rule.minOccurrences > 0)) {
    for (const parent of rules.filter(rule => rule.mode === 'never' || (rule.mode === 'frequency' && rule.maxOccurrences === 0))) {
      if (parent.id === child.id || parent.effectiveFrom > child.effectiveFrom) continue;
      if (scopeContains(parent.scope.mealClassIds, child.scope.mealClassIds) && targetContains(parent.target, child.target, context)) conflicts.push({ code: 'excluded_target_requires_minimum', ruleIds: [parent.id, child.id] });
    }
  }
  return conflicts;
}
