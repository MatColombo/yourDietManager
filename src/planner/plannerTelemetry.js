export const PLANNER_TELEMETRY_VERSION = 'planner-telemetry-r9gh';

const COUNTERS = [
  'frequencyEvaluations', 'frequencyWindowEvaluations',
  'authoritativeFrequencyEvaluations', 'authoritativeFrequencyWindowEvaluations',
  'compiledFrequencyEvaluations', 'compiledFrequencyWindowEvaluations',
  'recipeTargetMatches', 'recipeTargetCacheHits', 'indexedRecipes',
  'candidateAdmissionChecks', 'dayStatesExpanded', 'planStatesExpanded',
  'slotOptionsGenerated', 'slotOptionsRetained',
  'slotOptionCombinationAttempts', 'slotPairOptionsGenerated', 'slotTripleOptionsGenerated',
  'preparedSlots', 'preparedCandidates', 'preparedSlotHits',
  'varietyEvaluations', 'varietyEntriesScanned', 'varietyScoreCacheHits', 'varietySnapshotCacheHits',
  'varietyCandidateFilters', 'varietyStateExtensions', 'varietyInitialEntries',
  'dominanceChecks', 'dominancePrunedStates', 'adaptiveBeamExpansions', 'adaptiveBeamRescues', 'adaptiveDayRetries',
  'runtimeContextCacheHits', 'runtimeContextCacheMisses', 'recipeFeatureIndexCacheHits', 'persistentPreparedSlotHits',
  'workerRequests', 'workerReuses'
];

const TIMINGS = [
  'candidateFilterMs', 'frequencyMs', 'scoringMs', 'optionBuildMs', 'daySolveMs',
  'featureIndexBuildMs', 'frequencyCompileMs', 'staticScoringMs',
  'varietyCompileMs', 'varietyMs', 'preparedSlotMs', 'dominanceMs', 'adaptiveRescueMs', 'runtimeCachePrepareMs'
];

export function createPlannerTelemetry() {
  return {
    version: PLANNER_TELEMETRY_VERSION,
    counters: Object.fromEntries(COUNTERS.map(key => [key, 0])),
    timingsMs: Object.fromEntries(TIMINGS.map(key => [key, 0]))
  };
}

export function telemetryIncrement(telemetry, key, amount = 1) {
  if (!telemetry) return;
  telemetry.counters ||= {};
  telemetry.counters[key] = Number(telemetry.counters[key] || 0) + amount;
}

export function telemetryAddTime(telemetry, key, elapsedMs) {
  if (!telemetry || !Number.isFinite(elapsedMs)) return;
  telemetry.timingsMs ||= {};
  telemetry.timingsMs[key] = Number(telemetry.timingsMs[key] || 0) + elapsedMs;
}

export function telemetrySnapshot(telemetry) {
  if (!telemetry) return null;
  return {
    version: telemetry.version || PLANNER_TELEMETRY_VERSION,
    counters: Object.fromEntries(Object.entries(telemetry.counters || {}).map(([key, value]) => [key, Number(value || 0)])),
    timingsMs: Object.fromEntries(Object.entries(telemetry.timingsMs || {}).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100]))
  };
}
