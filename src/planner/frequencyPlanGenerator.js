import { dateRange, addCivilDays } from './planMath.js';
import { stableHashId } from './seededRandom.js';
import { filterCandidates } from './hardFilter.js';
import { recipeMatchesTarget } from './recipeFeatures.js';
import { frequencyRules, frequencyConflicts, evaluateFrequencies, occurrenceMatches } from '../domain/frequencyCounter.js';

function failure(status, code, details = {}) { return { status, failure: { code, ...details }, diagnostics: { status, ...details } }; }

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
  const limits = { planBeamWidth: input.planBeamWidth ?? 4, alternativesPerDay: input.alternativesPerDay ?? 4,
    maxExpandedPlans: input.searchBudget?.maxExpandedPlans ?? 1500,
    maxMillis: input.searchBudget?.maxMillis ?? (dates.length <= 7 ? 5000 : dates.length <= 31 ? 15000 : 60000) };
  let expandedPlans = 0; let beam = [{ calendarDays: [], baseScore: 0, score: 0, dayDiagnostics: [] }]; let latestFailure = null;
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
    const date = dates[dateIndex]; const expanded = [];
    for (const state of beam) {
      if (input.shouldCancel?.()) return failure('cancelled', 'cancelled');
      if (expandedPlans >= limits.maxExpandedPlans || performance.now() - started > limits.maxMillis) return failure('search_exhausted', 'search_budget_exhausted', { limits, expandedPlans, generatedDayCount: dateIndex });
      expandedPlans += 1;
      const past = [...previous, ...state.calendarDays];
      const evaluateDayState = ({ slots }) => {
        const assigned = slots.map(({ slot, option }) => ({ ...slot, mealOccurrenceId: stableHashId('meal', date, slot.id), civilDate: addCivilDays(date, slot.dayOffset),
          recipeComponents: option.recipes.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 })) }));
        const assignedIds = new Set(assigned.map(slot => slot.mealOccurrenceId));
        const remaining = potentials.filter(slot => slot.dietDate >= date && !assignedIds.has(slot.mealOccurrenceId));
        return evaluateFrequencies({ ...context, calendarDays: [...past, { date, mealSlots: assigned }], potentialOccurrences: remaining });
      };
      const output = generateLegacy({ ...input, horizon: { startDate: date, endDate: date }, startCycleDay: schedule[dateIndex].cycleDay,
        previousCalendarDays: past, evaluateDayState, daySolutionLimit: limits.alternativesPerDay,
        dayAlternativeKey: slots => rules.map(rule => slots.filter(slot => slot.mode === 'planned' && (!rule.scope.mealClassIds.length || rule.scope.mealClassIds.includes(slot.mealClassId))
          && occurrenceMatches(slot, rule.target, context).matches).map(slot => rule.countUnit === 'day' ? slot.civilDate : slot.mealOccurrenceId)).map(values => new Set(values).size).join('|') });
      if (output.status !== 'success') { latestFailure = output.failure; continue; }
      for (const alternative of output.alternativeDays) {
        const calendarDays = [...state.calendarDays, alternative.calendarDay];
        const check = evaluateFrequencies({ ...context, calendarDays: [...previous, ...calendarDays], potentialOccurrences: potentials.filter(slot => slot.dietDate > date) });
        if (!check.valid) continue;
        const baseScore = state.baseScore + alternative.baseScore;
        expanded.push({ calendarDays, baseScore, score: baseScore + check.idealPenalty,
          dayDiagnostics: [...state.dayDiagnostics, { ...output.diagnostics.days[0], selectedMeals: alternative.selectedMeals }] });
      }
    }
    expanded.sort((a, b) => a.score - b.score || a.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => slot.recipeComponents.map(c => c.recipeVersionId))).join('|').localeCompare(b.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => slot.recipeComponents.map(c => c.recipeVersionId))).join('|')));
    beam = expanded.slice(0, limits.planBeamWidth);
    if (!beam.length) return failure('search_exhausted', 'frequency_or_energy_search_exhausted', { lastFailure: latestFailure, limits, expandedPlans, generatedDayCount: dateIndex });
    input.onProgress?.({ completed: dateIndex + 1, total: dates.length });
  }
  const finalists = beam.map(state => ({ ...state, frequencies: evaluateFrequencies({ ...context, calendarDays: [...previous, ...state.calendarDays], coverageDates: null }) })).filter(state => state.frequencies.valid);
  if (!finalists.length) return failure('search_exhausted', 'independent_frequency_validation_failed', { limits, expandedPlans });
  finalists.sort((a, b) => (a.baseScore + a.frequencies.idealPenalty) - (b.baseScore + b.frequencies.idealPenalty));
  const winner = finalists[0]; const createdAt = input.createdAt || new Date().toISOString();
  const planInstanceId = stableHashId('plan', input.seed, input.horizon.startDate, input.horizon.endDate, input.catalogVersion, input.configSnapshotHash || 'pending');
  const generationRunId = stableHashId('genrun', input.seed, input.catalogVersion, input.horizon.startDate, input.horizon.endDate, input.configSnapshotHash || 'pending', input.reason || 'initial', input.previousGenerationRunId || 'none');
  const calendarDays = winner.calendarDays.map(day => ({ ...day, planInstanceId, calendarDayId: stableHashId('calday', planInstanceId, day.date) }));
  const diagnostics = { status: 'success', dayCount: calendarDays.length, days: winner.dayDiagnostics, frequencies: winner.frequencies,
    search: { limits, expandedPlans, elapsedMs: Math.round(performance.now() - started), bounded: true }, summary: { hardConstraintViolations: 0, meanScore: winner.score / dates.length } };
  const generationRun = { schemaVersion: 1, generationRunId, generatorVersion: 'plan-generator-r3-1', solverVersion: 'window-beam-r3-1', seed: input.seed,
    catalogVersion: input.catalogVersion, configSnapshotHash: input.configSnapshotHash || 'pending', configSnapshot: input.configSnapshot || {}, horizon: structuredClone(input.horizon), createdAt,
    diagnostics, reason: input.reason || 'initial', previousGenerationRunId: input.previousGenerationRunId || null };
  const planInstance = { schemaVersion: 1, planInstanceId, generationRunId, startDate: input.horizon.startDate, endDate: input.horizon.endDate,
    status: 'active', createdAt, updatedAt: createdAt, continuationPolicy: input.continuationPolicy || { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 }, previousPlanInstanceId: input.previousPlanInstanceId || null };
  return { status: 'success', generationRun, planInstance, calendarDays, diagnostics };
}
