import { dateRange, addCivilDays } from './planMath.js';
import { seededTie, stableHashId } from './seededRandom.js';
import { PLANNER_SOFT_OBJECTIVE_POLICY } from './qualityPolicy.js';
import { filterCandidates } from './hardFilter.js';
import { recipeMatchesTarget } from './recipeFeatures.js';
import { frequencyRules, frequencyConflicts, evaluateFrequencies, occurrenceMatches, countFrequencyWindow, FREQUENCY_PRIORITY } from '../domain/frequencyCounter.js';

function failure(status, code, details = {}) { return { status, failure: { code, ...details }, diagnostics: { status, ...details } }; }

function planSignature(calendarDays) {
  return calendarDays.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => `${day.date}:${slot.mealOccurrenceId}:${component.recipeVersionId}`))).join('|');
}

function seededDiversityPenalty(seed, calendarDays) {
  return seededTie(`${seed}|frequency-plan-diversity`, planSignature(calendarDays)) * PLANNER_SOFT_OBJECTIVE_POLICY.seededDiversityMaxPenalty;
}


function maxOccurrencesForRule(rule) {
  if (rule.mode === 'never') return 0;
  if (rule.mode !== 'frequency' || rule.maxOccurrences === null) return null;
  return Number(rule.maxOccurrences);
}

function maxFrequencyRules(rules) { return rules.filter(rule => maxOccurrencesForRule(rule) !== null); }

function candidateAdmissionForState({ rules, past, recipesByVersion, revisionById, foodGroups }) {
  const capped = maxFrequencyRules(rules);
  if (!capped.length) return null;
  const baseContext = { calendarDays: past, recipesByVersion, revisionById, foodGroups, coverageDates: past.map(day => day.date) };
  return ({ recipe, date, mealClass }) => {
    for (const rule of capped) {
      if (date < rule.effectiveFrom) continue;
      if (rule.scope.mealClassIds.length && !rule.scope.mealClassIds.includes(mealClass.id)) continue;
      if (!recipeMatchesTarget(recipe, rule.target.type, rule.target.id, revisionById, foodGroups)) continue;
      const window = countFrequencyWindow(rule, date, baseContext);
      const limit = maxOccurrencesForRule(rule);
      const sameDayAlreadyCounts = rule.countUnit === 'day' && window.contributingMeals.some(item => item.civilDate === date);
      if (!sameDayAlreadyCounts && window.count >= limit) return { allowed: false, reason: `frequency_cap:${rule.id}` };
    }
    return { allowed: true };
  };
}

function maxFrequencyHeadroomPenalty({ rules, calendarDays, recipesByVersion, revisionById, foodGroups, progress }) {
  const capped = maxFrequencyRules(rules).filter(rule => maxOccurrencesForRule(rule) > 0);
  if (!capped.length || !calendarDays.length) return 0;
  const endDate = calendarDays.flatMap(day => (day.mealSlots || []).map(slot => slot.civilDate || day.date)).sort().at(-1) || calendarDays.at(-1).date;
  const context = { calendarDays, recipesByVersion, revisionById, foodGroups, coverageDates: calendarDays.map(day => day.date) };
  let penalty = 0;
  for (const rule of capped) {
    if (endDate < rule.effectiveFrom) continue;
    const limit = maxOccurrencesForRule(rule);
    const window = countFrequencyWindow(rule, endDate, context);
    const utilization = Math.min(1, window.count / Math.max(1, limit));
    const earlyUse = Math.max(0, utilization - Math.min(1, progress));
    penalty += earlyUse * 24 * (FREQUENCY_PRIORITY[rule.priority] || FREQUENCY_PRIORITY.normal);
  }
  return penalty;
}

function exhaustedSearchCode(lastFailure) {
  const reason = String(lastFailure?.reason || lastFailure?.code || '');
  if (reason.includes('frequency') || reason === 'no_candidates_after_frequency_caps' || lastFailure?.constraintId === 'frequency_bounds_v2') return 'frequency_candidate_frontier_exhausted';
  if (reason.includes('energy') || lastFailure?.constraintId === 'daily_energy_tolerance') return 'energy_search_exhausted';
  return 'frequency_or_energy_search_exhausted';
}

// A bounded beam across days, with window reachability checked at every meal.
// Bounded pruning never establishes global impossibility.
export function generateFrequencyPlan(input, generateLegacy) {
  const started = performance.now(); const dates = dateRange(input.horizon.startDate, input.horizon.endDate);
  const profile = input.foodPreferences; const rules = frequencyRules(profile);
  const foodGroups = input.foodGroups || [];
  const revisions = new Map(input.ingredientRevisions.map(row => [row.ingredientRevisionId, row]));
  const recipesByVersion = new Map(input.recipes.map(row => [row.recipeVersionId, row]));
  const terms = new Map((input.taxonomyTerms || []).map(term => [term.termId, term]));
  const conflicts = frequencyConflicts(profile, { foodGroups, index: { term: id => terms.get(id) }, ingredients: input.ingredients || [], revisions: input.ingredientRevisions });
  if (conflicts.length) return failure('infeasible_proven', 'frequency_conflict', { conflicts, proof: 'target_exclusion_contains_required_target' });
  const schedule = []; const potentials = [];
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]; const cycleDay = ((Number(input.startCycleDay || 1) - 1 + index) % input.cycle.length) + 1;
    const dayClass = input.dayClasses.find(day => day.id === input.cycle.days.find(entry => entry.cycleDay === cycleDay)?.dayClassId);
    if (!dayClass) return failure('invalid_input', 'missing_day_class');
    schedule.push({ date, cycleDay, dayClassId: dayClass.id, mealSlots: [] });
    for (const slot of dayClass.mealSlots) {
      const civilDate = addCivilDays(date, slot.dayOffset); const meal = input.mealClasses.find(meal => meal.id === slot.mealClassId);
      if (!meal) return failure('invalid_input', 'missing_meal_class');
      const fixed=input.fixedSlots?.find(entry=>entry.date===date&&entry.slot.mealOccurrenceId===stableHashId('meal',date,slot.id));
      const candidates = slot.mode === 'planned' ? filterCandidates(fixed ? fixed.slot.recipeComponents.map(c=>recipesByVersion.get(c.recipeVersionId)).filter(Boolean) : input.candidateSets?.[meal.mealArchetype] || input.recipes, {
        mealClass: meal, dayClass, allergyProfile: input.allergyProfile, foodPreferences: profile, revisionById: revisions,
        safetyRevisionById: input.safetyRevisionById, foodGroups, date: civilDate
      }).accepted : [];
      potentials.push({ ...slot, dietDate: date, civilDate, mealOccurrenceId: stableHashId('meal', date, slot.id), recipeComponents: [],
        canMatch: Object.fromEntries(rules.map(rule => [rule.id, candidates.some(recipe => recipeMatchesTarget(recipe, rule.target.type, rule.target.id, revisions, foodGroups))])) });
    }
  }
  const previous = (input.previousCalendarDays || []).filter(day => !dates.includes(day.date));
  const coverageDates = [...new Set([...previous.map(day => day.date), ...dates])];
  const endDates = [...new Set([...coverageDates, ...potentials.map(slot => slot.civilDate), ...previous.flatMap(day => day.mealSlots.map(slot => slot.civilDate || day.date))])].sort();
  const context = { profile, recipesByVersion, revisionById: revisions, foodGroups, coverageDates, endDates, changedCivilDates: [...new Set(potentials.map(slot => slot.civilDate))] };
  const reachable = evaluateFrequencies({ ...context, calendarDays: previous, potentialOccurrences: potentials });
  if (reachable.violations.some(w => w.unresolvedPlannedMeals > 0)) return failure('invalid_input', 'missing_historical_reference');
  if (!reachable.valid) {
    const bounded = Boolean(input.retrievalTruncated);
    return failure(bounded ? 'search_exhausted' : 'infeasible_proven', 'frequency_capacity', { violations: reachable.violations, proof: bounded ? 'bounded_candidate_set' : 'maximum_reachable_occurrences' });
  }
  const rawExpansionLimit = input.searchBudget?.maxExpandedPlans;
  const requestedExpansionLimit = rawExpansionLimit == null ? null : Number(rawExpansionLimit);
  const limits = {
    planBeamWidth: input.planBeamWidth ?? 4,
    alternativesPerDay: input.alternativesPerDay ?? 4,
    // There is intentionally no wall-clock timeout. Normal app generation runs until
    // it finds a result, proves a bounded failure, or the user aborts the worker.
    maxExpandedPlans: requestedExpansionLimit != null && Number.isFinite(requestedExpansionLimit) ? requestedExpansionLimit : null
  };
  let expandedPlans = 0; let beam = [{ calendarDays: [], baseScore: 0, score: 0, dayDiagnostics: [] }]; let latestFailure = null;
  input.onProgress?.({ phase: 'search', completed: 0, total: dates.length, percent: 0, expandedPlans });
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
    const date = dates[dateIndex]; const expanded = [];
    const currentBeam = beam;
    for (let stateIndex = 0; stateIndex < currentBeam.length; stateIndex += 1) {
      const state = currentBeam[stateIndex];
      if (input.shouldCancel?.()) return failure('cancelled', 'cancelled');
      if (limits.maxExpandedPlans != null && expandedPlans >= limits.maxExpandedPlans) {
        return failure('search_exhausted', 'search_capacity_exhausted', { limits, expandedPlans, generatedDayCount: dateIndex });
      }
      expandedPlans += 1;
      const partial = dateIndex + (currentBeam.length ? ((stateIndex + 1) / currentBeam.length) * 0.85 : 0);
      input.onProgress?.({ phase: 'search', completed: dateIndex, total: dates.length, percent: Math.min(99, Math.floor((partial / dates.length) * 100)), expandedPlans });
      const past = [...previous, ...state.calendarDays];
      const evaluateDayState = ({ slots }) => {
        const assigned = slots.map(({ slot, option }) => ({ ...slot, mealOccurrenceId: stableHashId('meal', date, slot.id), civilDate: addCivilDays(date, slot.dayOffset),
          recipeComponents: option.recipes.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 })) }));
        const assignedIds = new Set(assigned.map(slot => slot.mealOccurrenceId));
        const remaining = potentials.filter(slot => slot.dietDate >= date && !assignedIds.has(slot.mealOccurrenceId));
        return evaluateFrequencies({ ...context, calendarDays: [...past, { date, mealSlots: assigned }], potentialOccurrences: remaining });
      };
      const candidateAdmission = candidateAdmissionForState({ rules, past, recipesByVersion, revisionById: revisions, foodGroups });
      const output = generateLegacy({ ...input, candidateAdmission, onProgress: inner => {
        const innerPercent = Number.isFinite(Number(inner?.percent)) ? Math.max(0, Math.min(100, Number(inner.percent))) / 100 : 0;
        const stateProgress = (stateIndex + innerPercent) / Math.max(1, currentBeam.length);
        const partialProgress = dateIndex + stateProgress * 0.85;
        input.onProgress?.({ phase: 'search', completed: dateIndex, total: dates.length, percent: Math.min(99, Math.floor((partialProgress / dates.length) * 100)), expandedPlans });
      }, horizon: { startDate: date, endDate: date }, startCycleDay: schedule[dateIndex].cycleDay,
        previousCalendarDays: past, evaluateDayState, daySolutionLimit: limits.alternativesPerDay,
        dayAlternativeKey: slots => rules.map(rule => slots.filter(slot => slot.mode === 'planned' && (!rule.scope.mealClassIds.length || rule.scope.mealClassIds.includes(slot.mealClassId))
          && occurrenceMatches(slot, rule.target, context).matches).map(slot => rule.countUnit === 'day' ? slot.civilDate : slot.mealOccurrenceId)).map(values => new Set(values).size).join('|') });
      if (output.status !== 'success') { latestFailure = output.failure; continue; }
      for (const alternative of output.alternativeDays) {
        const calendarDays = [...state.calendarDays, alternative.calendarDay];
        const check = evaluateFrequencies({ ...context, calendarDays: [...previous, ...calendarDays], potentialOccurrences: potentials.filter(slot => slot.dietDate > date) });
        if (!check.valid) continue;
        const baseScore = state.baseScore + alternative.baseScore;
        const maxHeadroomPenalty = maxFrequencyHeadroomPenalty({ rules, calendarDays: [...previous, ...calendarDays], recipesByVersion, revisionById: revisions, foodGroups, progress: (dateIndex + 1) / dates.length });
        const score = baseScore + check.idealPenalty + maxHeadroomPenalty;
        const seedDiversityPenalty = seededDiversityPenalty(input.seed, calendarDays);
        expanded.push({ calendarDays, baseScore, score, selectionScore: score + seedDiversityPenalty, seedDiversityPenalty,
          dayDiagnostics: [...state.dayDiagnostics, { ...output.diagnostics.days[0], selectedMeals: alternative.selectedMeals, maxFrequencyHeadroomPenalty: Math.round(maxHeadroomPenalty * 1000) / 1000 }] });
      }
    }
    expanded.sort((a, b) => a.selectionScore - b.selectionScore || a.score - b.score || planSignature(a.calendarDays).localeCompare(planSignature(b.calendarDays)));
    beam = expanded.slice(0, limits.planBeamWidth);
    if (!beam.length) return failure('search_exhausted', exhaustedSearchCode(latestFailure), { lastFailure: latestFailure, limits, expandedPlans, generatedDayCount: dateIndex });
    input.onProgress?.({ phase: 'search', completed: dateIndex + 1, total: dates.length, percent: Math.round(((dateIndex + 1) / dates.length) * 100), expandedPlans });
  }
  const finalists = beam.map(state => ({ ...state, frequencies: evaluateFrequencies({ ...context, calendarDays: [...previous, ...state.calendarDays], coverageDates: null }) })).filter(state => state.frequencies.valid);
  if (!finalists.length) return failure('search_exhausted', 'independent_frequency_validation_failed', { limits, expandedPlans });
  for (const finalist of finalists) {
    finalist.finalScore = finalist.baseScore + finalist.frequencies.idealPenalty;
    finalist.seedDiversityPenalty = seededDiversityPenalty(input.seed, finalist.calendarDays);
    finalist.selectionScore = finalist.finalScore + finalist.seedDiversityPenalty;
  }
  finalists.sort((a, b) => a.selectionScore - b.selectionScore || a.finalScore - b.finalScore || planSignature(a.calendarDays).localeCompare(planSignature(b.calendarDays)));
  const winner = finalists[0]; const createdAt = input.createdAt || new Date().toISOString();
  const planInstanceId = stableHashId('plan', input.seed, input.horizon.startDate, input.horizon.endDate, input.catalogVersion, input.configSnapshotHash || 'pending');
  const generationRunId = stableHashId('genrun', input.seed, input.catalogVersion, input.horizon.startDate, input.horizon.endDate, input.configSnapshotHash || 'pending', input.reason || 'initial', input.previousGenerationRunId || 'none');
  const calendarDays = winner.calendarDays.map(day => ({ ...day, planInstanceId, calendarDayId: stableHashId('calday', planInstanceId, day.date) }));
  const diagnostics = { status: 'success', dayCount: calendarDays.length, days: winner.dayDiagnostics, frequencies: winner.frequencies,
    search: { limits, expandedPlans, elapsedMs: Math.round(performance.now() - started), bounded: true, seededDiversityMaxPenalty: PLANNER_SOFT_OBJECTIVE_POLICY.seededDiversityMaxPenalty },
    summary: { hardConstraintViolations: 0, meanScore: winner.score / dates.length, seedDiversityPenalty: Math.round((winner.seedDiversityPenalty || 0) * 1000) / 1000 } };
  const generationRun = { schemaVersion: 1, generationRunId, generatorVersion: 'plan-generator-r3-2', solverVersion: 'window-beam-r3-2', seed: input.seed,
    catalogVersion: input.catalogVersion, configSnapshotHash: input.configSnapshotHash || 'pending', configSnapshot: input.configSnapshot || {}, horizon: structuredClone(input.horizon), createdAt,
    diagnostics, reason: input.reason || 'initial', previousGenerationRunId: input.previousGenerationRunId || null };
  const planInstance = { schemaVersion: 1, planInstanceId, generationRunId, startDate: input.horizon.startDate, endDate: input.horizon.endDate,
    status: 'active', createdAt, updatedAt: createdAt, continuationPolicy: input.continuationPolicy || { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 }, previousPlanInstanceId: input.previousPlanInstanceId || null };
  return { status: 'success', generationRun, planInstance, calendarDays, diagnostics };
}
