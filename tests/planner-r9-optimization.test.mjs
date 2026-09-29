import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeFeatureIndex, recipeMatchesTarget } from '../src/planner/recipeFeatures.js';
import { compileFrequencySearch } from '../src/planner/compiledFrequencyState.js';
import { evaluateFrequencies } from '../src/domain/frequencyCounter.js';
import { createPlannerTelemetry } from '../src/planner/plannerTelemetry.js';

function revision(id, ingredientId, { categoryId, subcategoryId, conceptId, group = 'group_test', subgroup = 'subgroup_test' }) {
  return { ingredientRevisionId: id, ingredientId, taxonomy: { foodGroup: group, foodSubgroup: subgroup }, productTaxonomy: { categoryId, subcategoryId, conceptId } };
}

function recipe(id, revisionRow, { cuisine = 'cuisine_italian', flavor = 'flavor_savory' } = {}) {
  return {
    recipeId: id, recipeVersionId: `${id}_v1`, ingredientLines: [{ ingredientId: revisionRow.ingredientId, ingredientRevisionId: revisionRow.ingredientRevisionId, included: true, optional: false }],
    tags: { cuisines: [cuisine], families: [`family_${id}`], flavor: [flavor] }, allergenIds: []
  };
}

function occurrence(id, civilDate, dietDate, mealClassId, recipeRow) {
  return { mealOccurrenceId: id, civilDate, dietDate, mealClassId, mode: 'planned', recipeComponents: [{ recipeId: recipeRow.recipeId, recipeVersionId: recipeRow.recipeVersionId, servings: 1 }] };
}

const dairyRevision = revision('rev_dairy', 'ing_dairy', { categoryId: 'product_category_dairy', subcategoryId: 'product_subcategory_dairy_general', conceptId: 'product_concept_yogurt' });
const plainRevision = revision('rev_plain', 'ing_plain', { categoryId: 'product_category_vegetables', subcategoryId: 'product_subcategory_vegetables_general', conceptId: 'product_concept_zucchini' });
const dairyRecipe = recipe('recipe_dairy', dairyRevision);
const plainRecipe = recipe('recipe_plain', plainRevision, { cuisine: 'cuisine_fusion' });
const revisions = new Map([dairyRevision, plainRevision].map(row => [row.ingredientRevisionId, row]));
const recipesByVersion = new Map([dairyRecipe, plainRecipe].map(row => [row.recipeVersionId, row]));
const foodGroups = [{ id: 'fg_dairy', status: 'active', members: [{ type: 'productFood', id: 'product_category_dairy' }] }];

test('R9C recipe feature index preserves target matching semantics and caches repeated lookups', () => {
  const telemetry = createPlannerTelemetry();
  const index = buildRecipeFeatureIndex([dairyRecipe, plainRecipe], revisions, foodGroups, { telemetry });
  const targets = [
    ['ingredient', 'ing_dairy'], ['productFood', 'product_category_dairy'], ['foodCategory', 'group_test'], ['cuisine', 'cuisine_italian'], ['flavor', 'flavor_savory'], ['foodGroup', 'fg_dairy']
  ];
  for (const [type, id] of targets) {
    assert.equal(recipeMatchesTarget(dairyRecipe, type, id, revisions, foodGroups), recipeMatchesTarget(dairyRecipe, type, id, revisions, foodGroups, index));
    recipeMatchesTarget(dairyRecipe, type, id, revisions, foodGroups, index);
  }
  assert.equal(telemetry.counters.indexedRecipes, 2);
  assert.ok(telemetry.counters.recipeTargetCacheHits >= targets.length);
});

test('R9B compiled rolling evaluator agrees with canonical evaluator for counts, reachability and penalties', () => {
  const profile = { schemaVersion: 2, rules: [
    { id: 'dairy-meals', enabled: true, mode: 'frequency', target: { type: 'productFood', id: 'product_category_dairy' }, scope: { mealClassIds: [] }, countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 3 }, minOccurrences: 1, targetOccurrences: 2, maxOccurrences: 2, priority: 'normal', effectiveFrom: '2026-09-28' },
    { id: 'italian-days', enabled: true, mode: 'frequency', target: { type: 'cuisine', id: 'cuisine_italian' }, scope: { mealClassIds: ['mc-main'] }, countUnit: 'day', countBasis: 'planned', window: { kind: 'rolling', days: 2 }, minOccurrences: 1, targetOccurrences: 1, maxOccurrences: 1, priority: 'high', effectiveFrom: '2026-09-28' }
  ], legacyRules: [] };
  const telemetry = createPlannerTelemetry();
  const index = buildRecipeFeatureIndex([dairyRecipe, plainRecipe], revisions, foodGroups, { telemetry });
  const previousCalendarDays = [{ date: '2026-09-28', calendarDayId: 'day_prev', mealSlots: [occurrence('prev', '2026-09-28', '2026-09-28', 'mc-main', plainRecipe)] }];
  const potentials = [
    { mealOccurrenceId: 'p1', dietDate: '2026-09-29', civilDate: '2026-09-29', mealClassId: 'mc-main', mode: 'planned', canMatch: { 'dairy-meals': true, 'italian-days': true } },
    { mealOccurrenceId: 'p2', dietDate: '2026-09-29', civilDate: '2026-09-30', mealClassId: 'mc-main', mode: 'planned', canMatch: { 'dairy-meals': true, 'italian-days': true } },
    { mealOccurrenceId: 'p3', dietDate: '2026-09-30', civilDate: '2026-09-30', mealClassId: 'mc-main', mode: 'planned', canMatch: { 'dairy-meals': true, 'italian-days': true } }
  ];
  const coverageDates = ['2026-09-28', '2026-09-29', '2026-09-30'];
  const endDates = ['2026-09-28', '2026-09-29', '2026-09-30'];
  const changedCivilDates = ['2026-09-29', '2026-09-30'];
  const compiled = compileFrequencySearch({ profile, previousCalendarDays, potentials, recipesByVersion, revisionById: revisions, foodGroups, recipeFeatureIndex: index, coverageDates, endDates, changedCivilDates, telemetry });
  const assignedSlots = [occurrence('p1', '2026-09-29', '2026-09-29', 'mc-main', dairyRecipe), occurrence('p2', '2026-09-30', '2026-09-29', 'mc-main', plainRecipe)];
  const compiledState = compiled.extendState(compiled.initialState, assignedSlots);
  const fast = compiled.evaluate(compiledState, { fromDietDate: '2026-09-29', strictAfter: true });
  const canonical = evaluateFrequencies({ profile, calendarDays: [...previousCalendarDays, { date: '2026-09-29', calendarDayId: 'day_current', mealSlots: assignedSlots }], recipesByVersion, revisionById: revisions, foodGroups, recipeFeatureIndex: index, coverageDates, endDates, changedCivilDates, potentialOccurrences: potentials.filter(slot => slot.dietDate > '2026-09-29'), telemetry });
  assert.equal(fast.valid, canonical.valid);
  assert.equal(fast.idealPenalty, canonical.idealPenalty);
  const canonicalByKey = new Map(canonical.windows.map(window => [`${window.ruleId}|${window.interval.endDate}`, window]));
  for (const window of fast.windows) {
    const expected = canonicalByKey.get(`${window.ruleId}|${window.interval.endDate}`);
    assert.ok(expected);
    assert.equal(window.count, expected.count);
    assert.equal(window.remainingReachable, expected.remainingReachable);
    assert.equal(window.maxViolation, expected.maxViolation);
    assert.equal(window.minViolation, expected.minViolation);
    assert.equal(window.idealPenalty, expected.idealPenalty);
  }
  assert.ok(telemetry.counters.compiledFrequencyEvaluations > 0);
  assert.ok(telemetry.counters.authoritativeFrequencyEvaluations > 0);
});

import { compileVarietySearch } from '../src/planner/compiledVarietyState.js';
import { varietyScore, scoreRecipe, scoreRecipeFromStatic } from '../src/planner/softScoring.js';
import { filterRecipeCandidatesForVariety } from '../src/planner/varietyPolicy.js';
import { prepareStaticSlot } from '../src/planner/preparedSlots.js';
import { buildSlotOptions } from '../src/planner/beamSolver.js';

test('R9D incremental variety ledger agrees with canonical variety scoring and exact-gap filtering', () => {
  const profile = { schemaVersion: 2, rules: [], legacyRules: [], plannerPolicy: { varietyMode: 'maximum_variety' } };
  const telemetry = createPlannerTelemetry();
  const index = buildRecipeFeatureIndex([dairyRecipe, plainRecipe], revisions, foodGroups, { telemetry });
  const previousCalendarDays = [
    { date: '2026-09-27', mealSlots: [occurrence('v1', '2026-09-27', '2026-09-27', 'mc-main', dairyRecipe)] },
    { date: '2026-09-29', mealSlots: [occurrence('v2', '2026-09-29', '2026-09-29', 'mc-main', plainRecipe)] }
  ];
  const history = [
    { date: '2026-09-27', recipe: dairyRecipe },
    { date: '2026-09-29', recipe: plainRecipe }
  ];
  const compiled = compileVarietySearch({ foodPreferences: profile, previousCalendarDays, recipesByVersion, revisionById: revisions, foodGroups, recipeFeatureIndex: index, telemetry });
  for (const candidate of [dairyRecipe, plainRecipe]) {
    const canonical = varietyScore(candidate, { history, date: '2026-09-30', revisionById: revisions, foodPreferences: profile, foodGroups, recipeFeatureIndex: index });
    const fast = compiled.score(compiled.initialState, candidate, '2026-09-30');
    assert.equal(fast.score, canonical.score);
  }
  const canonicalFilter = filterRecipeCandidatesForVariety([dairyRecipe, plainRecipe], history, '2026-09-30', profile);
  const fastFilter = compiled.filterCandidates(compiled.initialState, [dairyRecipe, plainRecipe], '2026-09-30');
  assert.deepEqual(fastFilter.candidates.map(row => row.recipeVersionId), canonicalFilter.candidates.map(row => row.recipeVersionId));
  assert.equal(fastFilter.fallbackUsed, canonicalFilter.fallbackUsed);

  const added = occurrence('v3', '2026-09-30', '2026-09-30', 'mc-main', dairyRecipe);
  const nextState = compiled.extendState(compiled.initialState, [added]);
  const nextHistory = [...history, { date: '2026-09-30', recipe: dairyRecipe }];
  const canonicalNext = varietyScore(dairyRecipe, { history: nextHistory, date: '2026-10-01', revisionById: revisions, foodPreferences: profile, foodGroups, recipeFeatureIndex: index });
  const fastNext = compiled.score(nextState, dairyRecipe, '2026-10-01');
  assert.equal(fastNext.score, canonicalNext.score);
  assert.ok(telemetry.counters.varietyEvaluations > 0);
  assert.ok(telemetry.counters.varietyStateExtensions > 0);
});

function eligibleRecipe(id, energy) {
  return {
    recipeId: id,
    recipeVersionId: `${id}_v1`,
    mealArchetypes: ['lunch'],
    ingredientLines: [{ ingredientId: plainRevision.ingredientId, ingredientRevisionId: plainRevision.ingredientRevisionId, included: true, optional: false }],
    calculatedNutrition: { energyKcal: energy, proteinG: 20, carbsG: energy / 10, fatG: energy / 40, fiberG: 4 },
    practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, portable: true, fridgeRequired: false },
    tags: { cuisines: ['cuisine_italian'], families: [`family_${id}`], flavor: ['flavor_savory'] },
    allergenIds: [],
    quality: { status: 'validated' }
  };
}

test('R9E prepared slots preserve static scoring and make it reusable across path-dependent variety states', () => {
  const candidates = [eligibleRecipe('prepared_a', 320), eligibleRecipe('prepared_b', 430), eligibleRecipe('prepared_c', 510)];
  const telemetry = createPlannerTelemetry();
  const index = buildRecipeFeatureIndex(candidates, revisions, foodGroups, { telemetry });
  const mealClass = { id: 'mc-lunch', mealArchetype: 'lunch', energyShare: { target: 0.3 }, rules: [] };
  const dayClass = { id: 'dc-day', dayArchetype: 'day', capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 } };
  const nutritionProfile = { dailyEnergyKcal: 1500, energyTolerancePct: 5, nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } } };
  const foodPreferences = { schemaVersion: 2, rules: [], legacyRules: [], plannerPolicy: { varietyMode: 'maximum_variety' } };
  const slot = { id: 'slot-lunch', mealClassId: mealClass.id, energyBudgetKcal: 450, dayOffset: 0, mode: 'planned' };
  const prepared = prepareStaticSlot({ date: '2026-09-30', slot, mealClass, dayClass, dayEnergyTarget: 1500, sourceCandidates: candidates,
    contextBase: { allergyProfile: { rules: [] }, foodPreferences, revisionById: revisions, foodGroups, recipeFeatureIndex: index, nutritionProfile }, telemetry });
  assert.equal(prepared.acceptedCandidates.length, candidates.length);
  assert.equal(prepared.staticScores.size, candidates.length);
  const context = { mealClass, dayClass, allergyProfile: { rules: [] }, foodPreferences, revisionById: revisions, foodGroups, recipeFeatureIndex: index,
    history: [], date: '2026-09-30', nutritionProfile, slotEnergyTarget: 450, dayEnergyTarget: 1500 };
  for (const candidate of candidates) {
    const fromPrepared = scoreRecipeFromStatic(candidate, context, prepared.staticScores.get(candidate.recipeVersionId));
    assert.deepEqual(fromPrepared, scoreRecipe(candidate, context));
  }
  assert.equal(telemetry.counters.preparedSlots, 1);
  assert.equal(telemetry.counters.preparedCandidates, candidates.length);
});

test('R9F lazy slot-option construction is deterministic and materializes a bounded subset of multi-component combinations', () => {
  const candidates = Array.from({ length: 18 }, (_, index) => eligibleRecipe(`lazy_${index}`, 90 + index * 25));
  const scored = candidates.map((row, index) => ({ recipe: row, score: { total: index / 10, components: { nutrition: 0, preference: 0, variety: 0, tuning: 0 }, reasons: [] } }));
  const nutritionProfile = { nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } } };
  const telemetryA = createPlannerTelemetry();
  const telemetryB = createPlannerTelemetry();
  const args = { targetEnergy: 500, dayEnergyTarget: 1500, nutritionProfile, maxComponents: 3, optionLimit: 18, seed: 'r9f-lazy' };
  const first = buildSlotOptions(scored, { ...args, telemetry: telemetryA });
  const second = buildSlotOptions(scored, { ...args, telemetry: telemetryB });
  const signature = options => options.map(option => option.recipes.map(row => row.recipeVersionId).sort().join('+'));
  assert.deepEqual(signature(first), signature(second));
  assert.ok(first.length > 0 && first.length <= args.optionLimit);
  assert.ok(first.every(option => option.recipes.length >= 1 && option.recipes.length <= 3));
  const exhaustiveCombinations = 18 + (18 * 17) / 2 + (18 * 17 * 16) / 6;
  assert.ok(telemetryA.counters.slotOptionsGenerated < exhaustiveCombinations);
  assert.ok(telemetryA.counters.slotPairOptionsGenerated > 0);
  assert.ok(telemetryA.counters.slotTripleOptionsGenerated > 0);
});

import { generateFrequencyPlan } from '../src/planner/frequencyPlanGenerator.js';
import { stableHashId } from '../src/planner/seededRandom.js';
import { executePlanGeneration } from '../src/services/plannerExecution.js';

function rescueRecipe(id, revisionRow, energy = 500) {
  return {
    recipeId: id, recipeVersionId: `${id}_v1`, mealArchetypes: ['lunch'],
    ingredientLines: [{ ingredientId: revisionRow.ingredientId, ingredientRevisionId: revisionRow.ingredientRevisionId, included: true, optional: false }],
    calculatedNutrition: { energyKcal: energy, proteinG: 20, carbsG: 50, fatG: 15, fiberG: 5 },
    practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, portable: true, fridgeRequired: false },
    tags: { cuisines: ['cuisine_italian'], families: [`family_${id}`], flavor: ['flavor_savory'] }, allergenIds: [], quality: { status: 'validated' }
  };
}

function rescueOccurrence(date, recipeRow) {
  return {
    mealOccurrenceId: stableHashId('meal', date, 'slot-main'), mealClassId: 'mc-main', time: '13:00', dayOffset: 0, civilDate: date, mode: 'planned',
    recipeComponents: [{ recipeId: recipeRow.recipeId, recipeVersionId: recipeRow.recipeVersionId, servings: 1 }]
  };
}

test('R9G adaptive beam rescues a valid path pruned by the initial global beam', () => {
  const dairy = rescueRecipe('rescue_dairy', dairyRevision);
  const plain = rescueRecipe('rescue_plain', plainRevision);
  const foodPreferences = { schemaVersion: 2, rules: [{
    id: 'dairy-max-two', enabled: true, mode: 'frequency', target: { type: 'productFood', id: 'product_category_dairy' }, scope: { mealClassIds: [] },
    countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 3 }, minOccurrences: 0, targetOccurrences: 1, maxOccurrences: 2,
    priority: 'normal', effectiveFrom: '2026-09-29'
  }], legacyRules: [], plannerPolicy: { varietyMode: 'maximum_variety' } };
  const slot = { id: 'slot-main', mealClassId: 'mc-main', time: '13:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 500 };
  const input = {
    nutritionProfile: { dailyEnergyKcal: 500, energyTolerancePct: 5, nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } } },
    allergyProfile: { rules: [] }, foodPreferences,
    mealClasses: [{ id: 'mc-main', mealArchetype: 'lunch', energyShare: { target: 1 }, rules: [] }],
    dayClasses: [{ id: 'dc-main', dayArchetype: 'day', capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 }, mealSlots: [slot] }],
    cycle: { id: 'cycle-main', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-main' }] }, recipes: [dairy, plain], candidateSets: { lunch: [dairy, plain] },
    ingredientRevisions: [dairyRevision, plainRevision], ingredients: [], taxonomyTerms: [], foodGroups: [],
    horizon: { startDate: '2026-09-29', endDate: '2026-10-01' }, startCycleDay: 1, seed: 'r9g-rescue', catalogVersion: 'test', configSnapshotHash: 'test',
    configSnapshot: {}, createdAt: '2026-09-29T08:00:00.000Z', previousCalendarDays: [], planBeamWidth: 1, alternativesPerDay: 2,
    searchBudget: { maxPlanBeamWidth: 2, maxAlternativesPerDay: 2, maxAdaptiveRescues: 4 }
  };

  const fakeLegacy = args => {
    const date = args.horizon.startDate;
    const candidates = date === '2026-09-29' ? [{ recipe: dairy, score: -100 }, { recipe: plain, score: 100 }] : [{ recipe: dairy, score: 0 }];
    const alternatives = [];
    for (const candidate of candidates) {
      const check = args.evaluateDayState?.({ slots: [{ slot, option: { recipes: [candidate.recipe] } }] });
      if (check && !check.valid) continue;
      alternatives.push({
        calendarDay: { schemaVersion: 1, date, cycleDay: 1, dayClassId: 'dc-main', dayArchetype: 'day', mealSlots: [rescueOccurrence(date, candidate.recipe)], status: 'planned' },
        baseScore: candidate.score, selectedMeals: []
      });
    }
    if (!alternatives.length) return { status: 'failed', failure: { code: 'no_feasible_plan', reason: 'frequency_bounds_v2', constraintId: 'frequency_bounds_v2' }, diagnostics: { days: [] } };
    return { status: 'success', alternativeDays: alternatives.slice(0, args.daySolutionLimit || alternatives.length), diagnostics: { days: [{ date }] } };
  };

  const result = generateFrequencyPlan(input, fakeLegacy);
  assert.equal(result.status, 'success');
  assert.ok(result.diagnostics.search.rescueCount >= 1);
  assert.ok(result.diagnostics.search.rescueEvents.some(event => event.type === 'checkpoint_widen'));
  assert.equal(result.calendarDays[0].mealSlots[0].recipeComponents[0].recipeVersionId, plain.recipeVersionId);
  assert.ok(result.diagnostics.search.telemetry.counters.adaptiveBeamRescues >= 1);
});

test('R9H safety rollback uses a disposable worker per generation so browser transfer/cache overhead cannot accumulate', async () => {
  const originalWorker = globalThis.Worker;
  let instances = 0; let terminations = 0;
  class FakeWorker {
    constructor() { instances += 1; this.onmessage = null; this.onerror = null; }
    postMessage(input) { queueMicrotask(() => this.onmessage?.({ data: { type: 'result', result: { status: 'success', seed: input.seed } } })); }
    terminate() { terminations += 1; }
  }
  globalThis.Worker = FakeWorker;
  try {
    const first = await executePlanGeneration({ seed: 'one' });
    const second = await executePlanGeneration({ seed: 'two' });
    assert.equal(first.seed, 'one'); assert.equal(second.seed, 'two');
    assert.equal(instances, 2);
    assert.equal(terminations, 2);
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

test('R9G does not retry an identical failed day just by increasing daySolutionLimit', () => {
  const dairy = rescueRecipe('same_day_dairy', dairyRevision);
  const foodPreferences = { schemaVersion: 2, rules: [{
    id: 'dairy-zero', enabled: true, mode: 'frequency', target: { type: 'productFood', id: 'product_category_dairy' }, scope: { mealClassIds: [] },
    countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 2 }, minOccurrences: 0, targetOccurrences: 0, maxOccurrences: 0,
    priority: 'normal', effectiveFrom: '2026-09-29'
  }], legacyRules: [], plannerPolicy: { varietyMode: 'maximum_variety' } };
  const slot = { id: 'slot-main', mealClassId: 'mc-main', time: '13:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 500 };
  let calls = 0;
  const input = {
    nutritionProfile: { dailyEnergyKcal: 500, energyTolerancePct: 5, nutrients: { proteinG: { enabled: false }, carbsG: { enabled: false }, fatG: { enabled: false }, fiberG: { enabled: false } } },
    allergyProfile: { rules: [] }, foodPreferences,
    mealClasses: [{ id: 'mc-main', mealArchetype: 'lunch', energyShare: { target: 1 }, rules: [] }],
    dayClasses: [{ id: 'dc-main', dayArchetype: 'day', capabilities: { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 }, mealSlots: [slot] }],
    cycle: { id: 'cycle-main', length: 1, days: [{ cycleDay: 1, dayClassId: 'dc-main' }] }, recipes: [dairy], candidateSets: { lunch: [dairy] },
    ingredientRevisions: [dairyRevision], ingredients: [], taxonomyTerms: [], foodGroups: [], horizon: { startDate: '2026-09-29', endDate: '2026-09-29' }, startCycleDay: 1,
    seed: 'same-day-failure', catalogVersion: 'test', configSnapshotHash: 'test', configSnapshot: {}, createdAt: '2026-09-29T08:00:00.000Z', previousCalendarDays: [],
    planBeamWidth: 1, alternativesPerDay: 1, searchBudget: { maxPlanBeamWidth: 4, maxAlternativesPerDay: 8, maxAdaptiveRescues: 3 }
  };
  const fakeLegacy = () => { calls += 1; return { status: 'failed', failure: { code: 'no_feasible_plan', reason: 'frequency_bounds_v2', constraintId: 'frequency_bounds_v2' }, diagnostics: { days: [] } }; };
  const result = generateFrequencyPlan(input, fakeLegacy);
  assert.equal(result.status, 'search_exhausted');
  assert.equal(calls, 1);
  assert.equal(result.failure.rescueCount || 0, 0);
});
