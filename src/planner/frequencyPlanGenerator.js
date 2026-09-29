import { dateRange, addCivilDays, dayEnergyTarget } from './planMath.js';
import { stableHashId } from './seededRandom.js';
import { EXPLORATION_POLICY_VERSION, explorationProfile, seededExposureOrder, signedSeedJitter } from './explorationPolicy.js';
import { buildRecipeFeatureIndex } from './recipeFeatures.js';
import { frequencyRules, frequencyConflicts, evaluateFrequencies } from '../domain/frequencyCounter.js';
import { compileFrequencySearch } from './compiledFrequencyState.js';
import { compileVarietySearch } from './compiledVarietyState.js';
import { prepareStaticSlot, preparedSlotKey } from './preparedSlots.js';
import { createPlannerTelemetry, telemetryAddTime, telemetryIncrement, telemetrySnapshot } from './plannerTelemetry.js';

function failure(status, code, details = {}, telemetry = null) {
  const enriched = telemetry ? { ...details, telemetry: telemetrySnapshot(telemetry) } : details;
  return { status, failure: { code, ...enriched }, diagnostics: { status, ...enriched } };
}

function planSignature(calendarDays) {
  return calendarDays.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => `${day.date}:${slot.mealOccurrenceId}:${component.recipeVersionId}`))).join('|');
}

function seededPlanExploration(seed, calendarDays) {
  const profile = explorationProfile(seed, 'frequency-plan');
  const signature = planSignature(calendarDays);
  return { profile, jitter: signedSeedJitter(`${seed}|frequency-plan`, signature, profile.planScoreJitter) };
}

function latestCivilDate(calendarDays = []) {
  const values = calendarDays.flatMap(day => (day.mealSlots || []).map(slot => slot.civilDate || day.date));
  return values.length ? values.sort().at(-1) : calendarDays.at(-1)?.date || null;
}

function exhaustedSearchCode(lastFailure) {
  const reason = String(lastFailure?.reason || lastFailure?.code || '');
  if (reason.includes('frequency') || reason === 'no_candidates_after_frequency_caps' || lastFailure?.constraintId === 'frequency_bounds_v2') return 'frequency_candidate_frontier_exhausted';
  if (reason.includes('energy') || lastFailure?.constraintId === 'daily_energy_tolerance') return 'energy_search_exhausted';
  return 'frequency_or_energy_search_exhausted';
}

function isFrequencyExhaustion(lastFailure) {
  return exhaustedSearchCode(lastFailure) === 'frequency_candidate_frontier_exhausted';
}

function dayAssignments(date, slots) {
  return slots.map(({ slot, option }) => ({
    ...slot,
    mealOccurrenceId: stableHashId('meal', date, slot.id),
    civilDate: addCivilDays(date, slot.dayOffset),
    mode: 'planned',
    recipeComponents: option.recipes.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 }))
  }));
}

function comparePlanStates(a, b) {
  return a.selectionScore - b.selectionScore || a.score - b.score || planSignature(a.calendarDays).localeCompare(planSignature(b.calendarDays));
}

function dominancePrune(states, { compiled, compiledVariety, nextDate, keepPerKey = 1, telemetry }) {
  const started = performance.now();
  const grouped = new Map();
  for (const state of states) {
    telemetryIncrement(telemetry, 'dominanceChecks');
    const key = `${compiled.stateKey(state.frequencyState, { fromDate: nextDate })}||${compiledVariety.stateKey(state.varietyState, { fromDate: nextDate })}`;
    const bucket = grouped.get(key) || [];
    bucket.push(state); bucket.sort(comparePlanStates);
    if (bucket.length > keepPerKey) {
      telemetryIncrement(telemetry, 'dominancePrunedStates', bucket.length - keepPerKey);
      bucket.length = keepPerKey;
    }
    grouped.set(key, bucket);
  }
  const result = [...grouped.values()].flat().sort(comparePlanStates);
  telemetryAddTime(telemetry, 'dominanceMs', performance.now() - started);
  return result;
}

function nextLarger(value, maximum) {
  if (value >= maximum) return value;
  return Math.min(maximum, Math.max(value + 1, value * 2));
}

// A bounded beam across days. Rolling-frequency validity is evaluated through a
// compiled incremental state; the canonical evaluator remains the final validator.
export function generateFrequencyPlan(input, generateLegacy) {
  const started = performance.now(); const dates = dateRange(input.horizon.startDate, input.horizon.endDate);
  const profile = input.foodPreferences; const rules = frequencyRules(profile); const telemetry = input.plannerTelemetry || createPlannerTelemetry();
  const foodGroups = input.foodGroups || [];
  const revisions = new Map(input.ingredientRevisions.map(row => [row.ingredientRevisionId, row]));
  const recipesByVersion = new Map(input.recipes.map(row => [row.recipeVersionId, row]));
  const featureStarted = performance.now();
  const recipeFeatureIndex = input.recipeFeatureIndex || buildRecipeFeatureIndex(input.recipes, revisions, foodGroups, { telemetry });
  if (!input.recipeFeatureIndex) telemetryAddTime(telemetry, 'featureIndexBuildMs', performance.now() - featureStarted);
  const terms = new Map((input.taxonomyTerms || []).map(term => [term.termId, term]));
  const conflicts = frequencyConflicts(profile, { foodGroups, index: { term: id => terms.get(id) }, ingredients: input.ingredients || [], revisions: input.ingredientRevisions });
  if (conflicts.length) return failure('infeasible_proven', 'frequency_conflict', { conflicts, proof: 'target_exclusion_contains_required_target' }, telemetry);

  const schedule = []; const potentials = []; const preparedSlots = new Map();
  const persistentPreparedSlots = input.plannerPreparedSlotCache || null;
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]; const cycleDay = ((Number(input.startCycleDay || 1) - 1 + index) % input.cycle.length) + 1;
    const dayClass = input.dayClasses.find(day => day.id === input.cycle.days.find(entry => entry.cycleDay === cycleDay)?.dayClassId);
    if (!dayClass) return failure('invalid_input', 'missing_day_class', {}, telemetry);
    schedule.push({ date, cycleDay, dayClassId: dayClass.id, mealSlots: [] });
    const dayTarget = dayEnergyTarget(input.nutritionProfile, dayClass.dayArchetype);
    for (const slot of dayClass.mealSlots) {
      const civilDate = addCivilDays(date, slot.dayOffset); const meal = input.mealClasses.find(row => row.id === slot.mealClassId);
      if (!meal) return failure('invalid_input', 'missing_meal_class', {}, telemetry);
      const fixed = input.fixedSlots?.find(entry => entry.date === date && entry.slot.mealOccurrenceId === stableHashId('meal', date, slot.id));
      let candidates = [];
      if (slot.mode === 'planned') {
        const sourceCandidates = fixed
          ? fixed.slot.recipeComponents.map(component => recipesByVersion.get(component.recipeVersionId)).filter(Boolean)
          : input.candidateSets?.[meal.mealArchetype] || input.recipes;
        const key = preparedSlotKey(date, slot.id);
        let prepared = !fixed ? persistentPreparedSlots?.get?.(key) || null : null;
        if (prepared) telemetryIncrement(telemetry, 'persistentPreparedSlotHits');
        else {
          const preparedStarted = performance.now();
          prepared = prepareStaticSlot({
            date: civilDate, slot, mealClass: meal, dayClass, dayEnergyTarget: dayTarget, sourceCandidates,
            contextBase: { allergyProfile: input.allergyProfile, foodPreferences: profile, revisionById: revisions, safetyRevisionById: input.safetyRevisionById,
              foodGroups, recipeFeatureIndex, extensions: input.extensions, generationTuningOverlay: input.generationTuningOverlay || null, nutritionProfile: input.nutritionProfile },
            telemetry
          });
          telemetryAddTime(telemetry, 'preparedSlotMs', performance.now() - preparedStarted);
          if (!fixed) persistentPreparedSlots?.set?.(key, prepared);
        }
        preparedSlots.set(key, prepared);
        candidates = prepared.acceptedCandidates;
      }
      potentials.push({ ...slot, dietDate: date, civilDate, mealOccurrenceId: stableHashId('meal', date, slot.id), recipeComponents: [],
        canMatch: Object.fromEntries(rules.map(rule => [rule.id, candidates.some(recipe => recipeFeatureIndex.matches(recipe, rule.target.type, rule.target.id))])) });
    }
  }

  const previous = (input.previousCalendarDays || []).filter(day => !dates.includes(day.date));
  const coverageDates = [...new Set([...previous.map(day => day.date), ...dates])];
  const endDates = [...new Set([...coverageDates, ...potentials.map(slot => slot.civilDate), ...previous.flatMap(day => day.mealSlots.map(slot => slot.civilDate || day.date))])].sort();
  const changedCivilDates = [...new Set(potentials.map(slot => slot.civilDate))];
  const context = { profile, recipesByVersion, revisionById: revisions, foodGroups, coverageDates, endDates, changedCivilDates, recipeFeatureIndex, telemetry };
  const compiledVariety = compileVarietySearch({ foodPreferences: profile, previousCalendarDays: previous, recipesByVersion, revisionById: revisions, foodGroups, recipeFeatureIndex, telemetry });
  const reachable = evaluateFrequencies({ ...context, calendarDays: previous, potentialOccurrences: potentials });
  if (reachable.violations.some(window => window.unresolvedPlannedMeals > 0)) return failure('invalid_input', 'missing_historical_reference', {}, telemetry);
  if (!reachable.valid) {
    const bounded = Boolean(input.retrievalTruncated);
    return failure(bounded ? 'search_exhausted' : 'infeasible_proven', 'frequency_capacity', { violations: reachable.violations, proof: bounded ? 'bounded_candidate_set' : 'maximum_reachable_occurrences' }, telemetry);
  }

  const compiled = compileFrequencySearch({ profile, previousCalendarDays: previous, potentials, recipesByVersion, revisionById: revisions, foodGroups,
    recipeFeatureIndex, coverageDates, endDates, changedCivilDates, telemetry });
  const rawExpansionLimit = input.searchBudget?.maxExpandedPlans;
  const requestedExpansionLimit = rawExpansionLimit == null ? null : Number(rawExpansionLimit);
  const baseBeamWidth = Math.max(1, Number(input.planBeamWidth ?? 6));
  const baseAlternatives = Math.max(1, Number(input.alternativesPerDay ?? 6));
  const limits = {
    planBeamWidth: baseBeamWidth,
    alternativesPerDay: baseAlternatives,
    maxPlanBeamWidth: Math.max(baseBeamWidth, Number(input.searchBudget?.maxPlanBeamWidth ?? Math.min(48, baseBeamWidth * 4))),
    maxAlternativesPerDay: Math.max(baseAlternatives, Number(input.searchBudget?.maxAlternativesPerDay ?? Math.min(24, baseAlternatives * 4))),
    maxAdaptiveRescues: Math.max(0, Number(input.searchBudget?.maxAdaptiveRescues ?? 3)),
    maxExpandedPlans: requestedExpansionLimit != null && Number.isFinite(requestedExpansionLimit) ? requestedExpansionLimit : null
  };
  const finalExplorationProfile = explorationProfile(input.seed, 'frequency-plan');
  const dominanceKeepPerKey = finalExplorationProfile.pickMode === 'uniform_feasible' ? 2 : 1;
  const initialState = { calendarDays: [], frequencyState: compiled.initialState, varietyState: compiledVariety.initialState, baseScore: 0, score: 0, dayDiagnostics: [] };
  let expandedPlans = 0; let beam = [initialState]; let latestFailure = null; let rescueCount = 0; let dateIndex = 0; let progressHighWater = 0;
  const checkpoints = []; const dayAlternativeLimits = new Map(); const rescueEvents = [];

  function reportProgress(percent, extra = {}) {
    progressHighWater = Math.max(progressHighWater, Math.max(0, Math.min(99, Number(percent || 0))));
    input.onProgress?.({ phase: 'search', completed: dateIndex, total: dates.length, percent: Math.floor(progressHighWater), expandedPlans, ...extra });
  }

  function expandDate(currentDateIndex, currentBeam, alternativesPerDay) {
    const date = dates[currentDateIndex]; const expanded = []; let localFailure = null; let alternativeLimitSaturated = false;
    for (let stateIndex = 0; stateIndex < currentBeam.length; stateIndex += 1) {
      const state = currentBeam[stateIndex];
      if (input.shouldCancel?.()) return { fatal: failure('cancelled', 'cancelled', {}, telemetry) };
      if (limits.maxExpandedPlans != null && expandedPlans >= limits.maxExpandedPlans) {
        return { fatal: failure('search_exhausted', 'search_capacity_exhausted', { limits, expandedPlans, generatedDayCount: currentDateIndex }, telemetry) };
      }
      expandedPlans += 1; telemetryIncrement(telemetry, 'planStatesExpanded');
      const partial = currentDateIndex + (currentBeam.length ? ((stateIndex + 1) / currentBeam.length) * 0.85 : 0);
      reportProgress((partial / dates.length) * 100);
      const past = [...previous, ...state.calendarDays];
      const evaluateDayState = ({ slots }) => compiled.evaluate(state.frequencyState, { extraSlots: dayAssignments(date, slots), fromDietDate: date, strictAfter: false });
      const candidateAdmission = args => compiled.candidateAdmission(state.frequencyState, args);
      const output = generateLegacy({ ...input, recipeFeatureIndex, plannerTelemetry: telemetry, candidateAdmission, preparedSlots, compiledVarietySearch: compiledVariety, varietyState: state.varietyState, onProgress: inner => {
        const innerPercent = Number.isFinite(Number(inner?.percent)) ? Math.max(0, Math.min(100, Number(inner.percent))) / 100 : 0;
        const stateProgress = (stateIndex + innerPercent) / Math.max(1, currentBeam.length);
        const partialProgress = currentDateIndex + stateProgress * 0.85;
        reportProgress((partialProgress / dates.length) * 100);
      }, horizon: { startDate: date, endDate: date }, startCycleDay: schedule[currentDateIndex].cycleDay,
        previousCalendarDays: past, evaluateDayState, daySolutionLimit: alternativesPerDay,
        dayAlternativeKey: slots => compiled.alternativeKey(slots) });
      if (output.status !== 'success') { localFailure = output.failure; continue; }
      if ((output.alternativeDays?.length || 0) >= alternativesPerDay) alternativeLimitSaturated = true;
      for (const alternative of output.alternativeDays) {
        const calendarDays = [...state.calendarDays, alternative.calendarDay];
        const frequencyState = compiled.extendState(state.frequencyState, alternative.calendarDay.mealSlots);
        const varietyState = compiledVariety.extendState(state.varietyState, alternative.calendarDay.mealSlots);
        const check = compiled.evaluate(frequencyState, { fromDietDate: date, strictAfter: true });
        if (!check.valid) continue;
        const baseScore = state.baseScore + alternative.baseScore;
        const endDate = latestCivilDate([...previous, ...calendarDays]) || date;
        const maxHeadroomPenalty = compiled.headroomPenalty(frequencyState, { endDate, progress: (currentDateIndex + 1) / dates.length });
        const score = baseScore + check.idealPenalty + maxHeadroomPenalty;
        const exploration = seededPlanExploration(input.seed, calendarDays);
        expanded.push({ calendarDays, frequencyState, varietyState, baseScore, score, selectionScore: score + exploration.jitter, seedExplorationJitter: exploration.jitter,
          dayDiagnostics: [...state.dayDiagnostics, { ...output.diagnostics.days[0], selectedMeals: alternative.selectedMeals, maxFrequencyHeadroomPenalty: Math.round(maxHeadroomPenalty * 1000) / 1000 }] });
      }
    }
    latestFailure = localFailure || latestFailure;
    const nextDate = dates[currentDateIndex + 1] || addCivilDays(dates[currentDateIndex], 1);
    return { states: dominancePrune(expanded.sort(comparePlanStates), { compiled, compiledVariety, nextDate, keepPerKey: dominanceKeepPerKey, telemetry }), localFailure, alternativeLimitSaturated };
  }

  input.onProgress?.({ phase: 'search', completed: 0, total: dates.length, percent: 0, expandedPlans });
  while (dateIndex < dates.length) {
    const date = dates[dateIndex]; const currentBeam = beam;
    const alternativesPerDay = dayAlternativeLimits.get(dateIndex) || baseAlternatives;
    const expansion = expandDate(dateIndex, currentBeam, alternativesPerDay);
    if (expansion.fatal) return expansion.fatal;

    if (expansion.states.length) {
      // Keep the normal path exactly as narrow as the configured beam. R9G widening
      // is rescue-only: proactively doubling the beam near a frequency cap made
      // ordinary runs substantially more expensive even when no rescue was needed.
      const maxRisk = expansion.states.reduce((value, state) => {
        const endDate = latestCivilDate([...previous, ...state.calendarDays]) || date;
        return Math.max(value, compiled.searchRisk(state.frequencyState, { endDate, fromDietDate: date }));
      }, 0);
      const selectedWidth = Math.min(baseBeamWidth, expansion.states.length);
      checkpoints[dateIndex] = {
        dateIndex, date, inputBeam: currentBeam, expandedStates: expansion.states, selectedWidth, alternativesPerDay, maxRisk,
        alternativeLimitSaturated: expansion.alternativeLimitSaturated
      };
      checkpoints.length = dateIndex + 1;
      beam = expansion.states.slice(0, selectedWidth);
      dateIndex += 1;
      reportProgress((dateIndex / dates.length) * 100, { completed: dateIndex });
      continue;
    }

    const frequencyExhausted = isFrequencyExhaustion(expansion.localFailure || latestFailure);
    if (!frequencyExhausted) {
      return failure('search_exhausted', exhaustedSearchCode(expansion.localFailure || latestFailure), { lastFailure: expansion.localFailure || latestFailure, limits, expandedPlans, generatedDayCount: dateIndex, rescueCount, rescueEvents }, telemetry);
    }

    let rescued = false; const failedDateIndex = dateIndex;
    if (rescueCount < limits.maxAdaptiveRescues) {
      const rescueStarted = performance.now();
      for (let checkpointIndex = dateIndex - 1; checkpointIndex >= 0; checkpointIndex -= 1) {
        const checkpoint = checkpoints[checkpointIndex];
        if (!checkpoint) continue;
        if (checkpoint.expandedStates.length > checkpoint.selectedWidth && checkpoint.selectedWidth < limits.maxPlanBeamWidth) {
          const nextWidth = Math.min(checkpoint.expandedStates.length, nextLarger(checkpoint.selectedWidth, limits.maxPlanBeamWidth));
          if (nextWidth <= checkpoint.selectedWidth) continue;
          checkpoint.selectedWidth = nextWidth;
          beam = checkpoint.expandedStates.slice(0, nextWidth);
          checkpoints.length = checkpointIndex + 1;
          dateIndex = checkpointIndex + 1;
          rescueCount += 1; telemetryIncrement(telemetry, 'adaptiveBeamRescues'); telemetryIncrement(telemetry, 'adaptiveBeamExpansions');
          rescueEvents.push({ type: 'checkpoint_widen', failedDateIndex, checkpointDateIndex: checkpointIndex, resumeDateIndex: dateIndex, planBeamWidth: nextWidth });
          rescued = true; break;
        }
        if (checkpoint.alternativeLimitSaturated && checkpoint.alternativesPerDay < limits.maxAlternativesPerDay) {
          const nextAlternatives = nextLarger(checkpoint.alternativesPerDay, limits.maxAlternativesPerDay);
          dayAlternativeLimits.set(checkpointIndex, nextAlternatives);
          beam = checkpoint.inputBeam;
          checkpoints.length = checkpointIndex;
          dateIndex = checkpointIndex;
          rescueCount += 1; telemetryIncrement(telemetry, 'adaptiveBeamRescues'); telemetryIncrement(telemetry, 'adaptiveDayRetries');
          rescueEvents.push({ type: 'checkpoint_retry_saturated', failedDateIndex, checkpointDateIndex: checkpointIndex, resumeDateIndex: dateIndex, alternativesPerDay: nextAlternatives });
          rescued = true; break;
        }
      }
      telemetryAddTime(telemetry, 'adaptiveRescueMs', performance.now() - rescueStarted);
    }
    if (rescued) continue;
    return failure('search_exhausted', exhaustedSearchCode(latestFailure), { lastFailure: latestFailure, limits, expandedPlans, generatedDayCount: dateIndex, rescueCount, rescueEvents }, telemetry);
  }

  const finalists = beam.map(state => ({ ...state, frequencies: evaluateFrequencies({ ...context, calendarDays: [...previous, ...state.calendarDays], coverageDates: null }) })).filter(state => state.frequencies.valid);
  if (!finalists.length) return failure('search_exhausted', 'independent_frequency_validation_failed', { limits, expandedPlans, rescueCount, rescueEvents }, telemetry);
  for (const finalist of finalists) {
    finalist.finalScore = finalist.baseScore + finalist.frequencies.idealPenalty;
    const exploration = seededPlanExploration(input.seed, finalist.calendarDays);
    finalist.seedExplorationJitter = exploration.jitter;
    finalist.selectionScore = finalist.finalScore + exploration.jitter;
  }
  let orderedFinalists = finalists;
  if (finalExplorationProfile.pickMode === 'uniform_feasible') orderedFinalists = seededExposureOrder(finalists, `${input.seed}|frequency-final`, state => planSignature(state.calendarDays));
  else orderedFinalists = [...finalists].sort((a, b) => a.selectionScore - b.selectionScore || a.finalScore - b.finalScore || planSignature(a.calendarDays).localeCompare(planSignature(b.calendarDays)));
  const winner = orderedFinalists[0]; const createdAt = input.createdAt || new Date().toISOString();
  const planInstanceId = stableHashId('plan', input.seed, input.horizon.startDate, input.horizon.endDate, input.catalogVersion, input.configSnapshotHash || 'pending');
  const generationRunId = stableHashId('genrun', input.seed, input.catalogVersion, input.horizon.startDate, input.horizon.endDate, input.configSnapshotHash || 'pending', input.reason || 'initial', input.previousGenerationRunId || 'none');
  const calendarDays = winner.calendarDays.map(day => ({ ...day, planInstanceId, calendarDayId: stableHashId('calday', planInstanceId, day.date) }));
  const diagnostics = { status: 'success', dayCount: calendarDays.length, days: winner.dayDiagnostics, frequencies: winner.frequencies,
    search: { limits, expandedPlans, elapsedMs: Math.round(performance.now() - started), bounded: true, compiledFrequencyEngine: 'compiled-frequency-r9b', compiledVarietyEngine: 'compiled-variety-r9d', preparedSlotEngine: 'prepared-slots-r9e', adaptiveBeamEngine: 'adaptive-beam-r9g', rescueCount, rescueEvents, telemetry: telemetrySnapshot(telemetry), exploration: { policyVersion: EXPLORATION_POLICY_VERSION, ...finalExplorationProfile } },
    summary: { hardConstraintViolations: 0, meanScore: winner.score / dates.length, seedExplorationJitter: Math.round((winner.seedExplorationJitter || 0) * 1000) / 1000 } };
  const generationRun = { schemaVersion: 1, generationRunId, generatorVersion: 'plan-generator-r3-7-r9gh-hotfix', solverVersion: 'window-beam-r3-7-r9gh-hotfix', seed: input.seed,
    catalogVersion: input.catalogVersion, configSnapshotHash: input.configSnapshotHash || 'pending', configSnapshot: input.configSnapshot || {}, horizon: structuredClone(input.horizon), createdAt,
    diagnostics, reason: input.reason || 'initial', previousGenerationRunId: input.previousGenerationRunId || null };
  const planInstance = { schemaVersion: 1, planInstanceId, generationRunId, startDate: input.horizon.startDate, endDate: input.horizon.endDate,
    status: 'active', createdAt, updatedAt: createdAt, continuationPolicy: input.continuationPolicy || { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 }, previousPlanInstanceId: input.previousPlanInstanceId || null };
  return { status: 'success', generationRun, planInstance, calendarDays, diagnostics };
}
