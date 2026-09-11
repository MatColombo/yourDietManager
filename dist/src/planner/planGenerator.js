import { addCivilDays, dateRange, dayEnergyTarget, sumNutrition, energyConstraintStatus, energyToleranceWindow } from './planMath.js';
import { filterCandidates } from './hardFilter.js';
import { scoreRecipe } from './softScoring.js';
import { buildSlotOptions, selectCandidateFrontier, solveDayBeam } from './beamSolver.js';
import { seededTie, stableHashId } from './seededRandom.js';
import { plannerConstraintPolicySnapshot } from './constraintPolicy.js';

export const GENERATOR_VERSION = 'plan-generator-2';
export const SOLVER_VERSION = 'beam-search-2';

function mealMap(mealClasses) { return new Map(mealClasses.map(item => [item.id, item])); }
function dayMap(dayClasses) { return new Map(dayClasses.map(item => [item.id, item])); }
function revisionMap(revisions) { return new Map(revisions.map(item => [item.ingredientRevisionId, item])); }
function rejectionMerge(target, source) { for (const [key, value] of Object.entries(source || {})) target[key] = (target[key] || 0) + value; }

function slotEnergyTarget(slot, mealClass, target) {
  if (slot.energyBudgetKcal != null) return Number(slot.energyBudgetKcal);
  if (slot.energyShare != null) return target * Number(slot.energyShare);
  if (mealClass.energyShare?.target != null) return target * Number(mealClass.energyShare.target);
  return target * 0.2;
}

function externalBudget(slot, target) {
  if (slot.energyBudgetKcal != null) return Number(slot.energyBudgetKcal);
  if (slot.energyShare != null) return target * Number(slot.energyShare);
  return null;
}

function historyEntries(calendarDays, recipesByVersion) {
  const entries = [];
  for (const day of calendarDays || []) for (const slot of day.mealSlots || []) for (const component of slot.recipeComponents || []) {
    const recipe = recipesByVersion.get(component.recipeVersionId);
    if (recipe) entries.push({ date: slot.civilDate || day.date, recipe });
  }
  return entries;
}

function buildExternalSlot(slot, date) {
  const estimate = {
    policy: slot.estimatedNutritionPolicy || 'unknown',
    energyBudgetKcal: slot.energyBudgetKcal ?? null,
    proteinMinG: slot.proteinMinG ?? null,
    userEstimatedEnergyKcal: null,
    userEstimatedProteinG: null
  };
  return {
    mealOccurrenceId: stableHashId('meal', date, slot.id), mealClassId: slot.mealClassId, time: slot.time, dayOffset: slot.dayOffset,
    civilDate: addCivilDays(date, slot.dayOffset), mode: 'external', recipeComponents: [], adherenceStatus: 'not_recorded', adherenceNotes: null, externalEstimate: estimate
  };
}

function buildPlannedSlot(slot, date, option) {
  return {
    mealOccurrenceId: stableHashId('meal', date, slot.id), mealClassId: slot.mealClassId, time: slot.time, dayOffset: slot.dayOffset,
    civilDate: addCivilDays(date, slot.dayOffset), mode: 'planned',
    recipeComponents: option.recipes.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, servings: 1 })),
    adherenceStatus: 'not_recorded', adherenceNotes: null, externalEstimate: null
  };
}

function rounded(value) { return Math.round(Number(value || 0) * 10) / 10; }
function energyRange(recipes) {
  const values = (recipes || []).map(recipe => Number(recipe?.calculatedNutrition?.energyKcal || recipe?.nutrition?.energyKcal || 0)).filter(Number.isFinite);
  if (!values.length) return { minKcal: null, maxKcal: null };
  return { minKcal: rounded(Math.min(...values)), maxKcal: rounded(Math.max(...values)) };
}

function selectedDiagnostics(slotPlan, option) {
  return option.recipes.map(recipe => {
    const allRank = slotPlan.allScored.findIndex(item => item.recipe.recipeVersionId === recipe.recipeVersionId);
    const frontierRank = slotPlan.scoredCandidates.findIndex(item => item.recipe.recipeVersionId === recipe.recipeVersionId);
    const scored = slotPlan.allScored[allRank] || slotPlan.scoredCandidates[frontierRank];
    return {
      slotId: slotPlan.id,
      mealClassId: slotPlan.mealClass.id,
      recipeId: recipe.recipeId,
      recipeVersionId: recipe.recipeVersionId,
      energyKcal: rounded(recipe.calculatedNutrition?.energyKcal),
      hardFiltersPassed: true,
      softRank: allRank < 0 ? null : allRank + 1,
      frontierRank: frontierRank < 0 ? null : frontierRank + 1,
      score: Math.round((scored?.score.total || 0) * 1000) / 1000,
      scoreComponents: scored?.score.components || {},
      reasons: (scored?.score.reasons || []).slice(0, 8),
      relaxedSoftConstraints: []
    };
  });
}

export function generatePlanCore(input) {
  const {
    nutritionProfile, allergyProfile, foodPreferences, mealClasses, dayClasses, cycle, recipes, ingredientRevisions,
    horizon, seed, catalogVersion, configSnapshotHash = 'pending', configSnapshot = {}, createdAt = new Date().toISOString(),
    reason = 'initial', previousGenerationRunId = null, previousPlanInstanceId = null, previousCalendarDays = [],
    continuationPolicy = { mode: 'prompt', triggerDaysBeforeEnd: 3, extensionDays: 7 }, candidateLimit = 20, beamWidth = 100, slotOptionLimit = 40, startCycleDay = 1, candidateSets = null,
    regenerationPolicy = null
  } = input;
  if (!nutritionProfile || !cycle || !horizon?.startDate || !horizon?.endDate || !seed) throw new Error('Missing required plan generator input');
  const meals = mealMap(mealClasses || []); const days = dayMap(dayClasses || []); const revisions = revisionMap(ingredientRevisions || []);
  const recipesByVersion = new Map((recipes || []).map(recipe => [recipe.recipeVersionId, recipe]));
  const history = historyEntries(previousCalendarDays, recipesByVersion);
  const allDates = dateRange(horizon.startDate, horizon.endDate);
  const generatedDays = []; const dayDiagnostics = []; const failures = [];

  for (let dateIndex = 0; dateIndex < allDates.length; dateIndex += 1) {
    const date = allDates[dateIndex];
    const cycleDayNumber = ((startCycleDay - 1 + dateIndex) % cycle.length) + 1;
    const cycleEntry = cycle.days.find(item => item.cycleDay === cycleDayNumber);
    const dayClass = days.get(cycleEntry?.dayClassId);
    if (!dayClass) throw new Error(`Missing DayClass for cycle day ${cycleDayNumber}`);
    const energyTarget = dayEnergyTarget(nutritionProfile, dayClass.dayArchetype);
    const externalSlots = dayClass.mealSlots.filter(slot => slot.mode === 'external');
    const plannedSlots = dayClass.mealSlots.filter(slot => slot.mode === 'planned');
    let externalEnergy = 0; let externalProteinMin = 0; let externalInvalid = false; let externalUnknown = false;
    for (const slot of externalSlots) {
      const budget = externalBudget(slot, energyTarget);
      if (slot.estimatedNutritionPolicy === 'unknown') externalUnknown = true;
      if (budget == null && slot.estimatedNutritionPolicy !== 'unknown') externalInvalid = true;
      externalEnergy += budget || 0; externalProteinMin += Number(slot.proteinMinG || 0);
    }
    const energyWindow = energyToleranceWindow(energyTarget, nutritionProfile.energyTolerancePct, externalEnergy);
    if (externalUnknown) {
      failures.push({ date, code: 'external_energy_unknown', constraintId: 'daily_energy_tolerance', externalEnergy, energyTarget, energyWindow });
      break;
    }
    if (externalInvalid || externalEnergy > energyWindow.dailyMaxKcal) {
      failures.push({ date, code: 'external_budget_inconsistency', constraintId: 'daily_energy_tolerance', externalEnergy, energyTarget, energyWindow });
      break;
    }
    const plannedEnergyTarget = energyWindow.plannedTargetKcal;
    const slotPlans = []; const rejectionCounts = {}; const slotDiagnostics = [];
    let failedSlot = null;
    for (const slot of plannedSlots) {
      const mealClass = meals.get(slot.mealClassId);
      if (!mealClass) { failedSlot = { slotId: slot.id, code: 'meal_class_over_constrained', detail: 'missing MealClass' }; break; }
      const targetEnergy = slotEnergyTarget(slot, mealClass, energyTarget);
      const context = { mealClass, dayClass, allergyProfile, foodPreferences, revisionById: revisions, history, date, nutritionProfile, slotEnergyTarget: targetEnergy, dayEnergyTarget: energyTarget };
      const sourceCandidates = candidateSets?.[mealClass.mealArchetype] || recipes || [];
      const filtered = filterCandidates(sourceCandidates, context); rejectionMerge(rejectionCounts, filtered.rejectionCounts);
      const occurrenceId = stableHashId('meal', date, slot.id);
      const currentRecipeIds = new Set(regenerationPolicy?.currentRecipeVersionIdsByOccurrence?.[occurrenceId] || []);
      let acceptedForSelection = filtered.accepted;
      let regenerationExcludedCount = 0;
      if (regenerationPolicy?.mode === 'exclude_current' && currentRecipeIds.size) {
        acceptedForSelection = filtered.accepted.filter(recipe => !currentRecipeIds.has(recipe.recipeVersionId));
        regenerationExcludedCount = filtered.accepted.length - acceptedForSelection.length;
      }
      if (!acceptedForSelection.length) {
        const code = filtered.accepted.length && regenerationPolicy?.mode === 'exclude_current'
          ? 'no_alternative_candidates_after_regeneration_exclusion'
          : 'no_candidates_after_hard_constraints';
        const diagnostic = { slotId: slot.id, mealClassId: mealClass.id, mealArchetype: mealClass.mealArchetype, targetEnergyKcal: rounded(targetEnergy), sourceCandidateCount: sourceCandidates.length, acceptedCandidateCount: filtered.accepted.length, selectableCandidateCount: 0, candidateFrontierCount: 0, optionCount: 0, sourceEnergyRange: energyRange(sourceCandidates), acceptedEnergyRange: energyRange(filtered.accepted), frontierEnergyRange: { minKcal: null, maxKcal: null }, optionEnergyRange: { minKcal: null, maxKcal: null }, hardRejectionCounts: filtered.rejectionCounts, regeneration: { mode: regenerationPolicy?.mode || null, currentRecipeVersionIds: [...currentRecipeIds], excludedCurrentCount: regenerationExcludedCount } };
        slotDiagnostics.push(diagnostic);
        failedSlot = { slotId: slot.id, mealClassId: mealClass.id, code, rejections: filtered.rejectionCounts, slotDiagnostic: diagnostic }; break;
      }
      const allScored = acceptedForSelection.map(recipe => {
        const score = scoreRecipe(recipe, context);
        if (regenerationPolicy?.mode === 'prefer_alternative' && currentRecipeIds.has(recipe.recipeVersionId)) {
          const penalty = Number(regenerationPolicy.currentRecipePenalty || 100);
          score.total += penalty;
          score.components = { ...score.components, regeneration: penalty };
          score.reasons = [...score.reasons, `regeneration:current_recipe:+${penalty}`];
        }
        return { recipe, score, tie: seededTie(seed, `${date}|${slot.id}|${recipe.recipeVersionId}`) };
      }).sort((a, b) => a.score.total - b.score.total || a.tie - b.tie || a.recipe.recipeVersionId.localeCompare(b.recipe.recipeVersionId));
      const scored = selectCandidateFrontier(allScored, { targetEnergy, limit: candidateLimit });
      const options = buildSlotOptions(scored, { targetEnergy, dayEnergyTarget: energyTarget, nutritionProfile, optionLimit: slotOptionLimit, seed: `${seed}|${date}|${slot.id}` });
      const diagnostic = {
        slotId: slot.id, mealClassId: mealClass.id, mealArchetype: mealClass.mealArchetype, targetEnergyKcal: rounded(targetEnergy),
        sourceCandidateCount: sourceCandidates.length, acceptedCandidateCount: filtered.accepted.length, selectableCandidateCount: acceptedForSelection.length, candidateFrontierCount: scored.length, optionCount: options.length,
        sourceEnergyRange: energyRange(sourceCandidates), acceptedEnergyRange: energyRange(filtered.accepted), frontierEnergyRange: energyRange(scored.map(item => item.recipe)),
        optionEnergyRange: options.length ? { minKcal: rounded(Math.min(...options.map(item => item.nutrition.energyKcal))), maxKcal: rounded(Math.max(...options.map(item => item.nutrition.energyKcal))) } : { minKcal: null, maxKcal: null },
        hardRejectionCounts: filtered.rejectionCounts,
        regeneration: { mode: regenerationPolicy?.mode || null, currentRecipeVersionIds: [...currentRecipeIds], excludedCurrentCount: regenerationExcludedCount },
        topSoftCandidates: allScored.slice(0, 5).map((item, index) => ({ recipeVersionId: item.recipe.recipeVersionId, rank: index + 1, energyKcal: rounded(item.recipe.calculatedNutrition?.energyKcal), score: Math.round(item.score.total * 1000) / 1000, scoreComponents: item.score.components, reasons: item.score.reasons.slice(0, 5) }))
      };
      slotDiagnostics.push(diagnostic);
      if (!options.length) { failedSlot = { slotId: slot.id, mealClassId: mealClass.id, code: 'energy_range_impossible', slotDiagnostic: diagnostic }; break; }
      slotPlans.push({ ...slot, mealClass, targetEnergy, options, allScored, scoredCandidates: scored, diagnostic });
    }
    if (failedSlot) { failures.push({ date, ...failedSlot, rejectionCounts, slotDiagnostics }); break; }

    const solvedResult = solveDayBeam(slotPlans, { dayEnergyTarget: energyTarget, externalEnergy, nutritionProfile, beamWidth, seed: `${seed}|${date}` });
    const solved = solvedResult.solution;
    if (!solved) {
      failures.push({
        date, code: 'no_feasible_plan', reason: solvedResult.diagnostics.code, constraintId: 'daily_energy_tolerance', hardConstraint: true,
        energy: solvedResult.diagnostics.window, nearestPlannedEnergyKcal: solvedResult.diagnostics.nearestPlannedEnergyKcal,
        nearestDistanceKcal: solvedResult.diagnostics.nearestDistanceKcal,
        search: { candidateLimit, beamWidth, slotOptionLimit, proof: solvedResult.diagnostics.proof, hardPrunedStates: solvedResult.diagnostics.hardPrunedStates || 0, evaluatedFinalists: solvedResult.diagnostics.evaluatedFinalists, feasibleFinalists: solvedResult.diagnostics.feasibleFinalists },
        rejectionCounts, slotDiagnostics
      });
      break;
    }
    const plannedOccurrences = [];
    const selectedMeals = [];
    for (const selected of solved.slots || []) {
      plannedOccurrences.push(buildPlannedSlot(selected.slot, date, selected.option));
      selectedMeals.push(...selectedDiagnostics(selected.slot, selected.option));
      const diagnostic = slotDiagnostics.find(item => item.slotId === selected.slot.id);
      if (diagnostic) { diagnostic.selectedRecipeVersionIds = selected.option.recipes.map(recipe => recipe.recipeVersionId); diagnostic.selectedEnergyKcal = rounded(selected.option.nutrition.energyKcal); }
      for (const recipe of selected.option.recipes) history.push({ date: addCivilDays(date, selected.slot.dayOffset), recipe });
    }
    const occurrences = [...plannedOccurrences, ...externalSlots.map(slot => buildExternalSlot(slot, date))]
      .sort((a, b) => a.dayOffset - b.dayOffset || a.time.localeCompare(b.time) || a.mealOccurrenceId.localeCompare(b.mealOccurrenceId));
    const knownNutrition = solved?.nutrition || sumNutrition([]);
    const dailyScore = solved?.score || 0;
    const planId = stableHashId('plan', seed, horizon.startDate, horizon.endDate, catalogVersion, configSnapshotHash);
    const energyConstraint = energyConstraintStatus(knownNutrition.energyKcal, energyTarget, nutritionProfile.energyTolerancePct, externalEnergy);
    if (!energyConstraint.withinTolerance) {
      failures.push({ date, code: 'no_feasible_plan', reason: 'post_solve_energy_validation_failed', constraintId: 'daily_energy_tolerance', hardConstraint: true, energy: energyConstraint });
      break;
    }
    const nutritionSummary = {
      knownPlanned: knownNutrition,
      externalBudget: { energyKcal: Math.round(externalEnergy * 10) / 10, proteinMinG: Math.round(externalProteinMin * 10) / 10 },
      target: { energyKcal: energyTarget, plannedEnergyKcal: Math.round(plannedEnergyTarget * 10) / 10, energyTolerancePct: nutritionProfile.energyTolerancePct },
      score: Math.round(dailyScore * 1000) / 1000
    };
    const calendarDay = {
      schemaVersion: 1, calendarDayId: stableHashId('calday', planId, date), planInstanceId: planId, date, cycleDay: cycleDayNumber,
      dayClassId: dayClass.id, dayArchetype: dayClass.dayArchetype, mealSlots: occurrences, status: 'planned', nutritionSummary, createdAt, updatedAt: createdAt
    };
    generatedDays.push(calendarDay);
    dayDiagnostics.push({ date, cycleDay: cycleDayNumber, dayClassId: dayClass.id, energyTarget, plannedEnergyTarget, externalEnergy, energyConstraint, selectedMeals, slotDiagnostics, rejectionCounts, score: nutritionSummary.score });
  }

  if (failures.length) return { status: 'failed', failure: failures[0], diagnostics: { status: 'failed', constraintPolicy: plannerConstraintPolicySnapshot(), failures, generatedDayCount: generatedDays.length } };
  const generationRunId = stableHashId('genrun', seed, catalogVersion, horizon.startDate, horizon.endDate, configSnapshotHash, reason, previousGenerationRunId || 'none');
  const planInstanceId = stableHashId('plan', seed, horizon.startDate, horizon.endDate, catalogVersion, configSnapshotHash);
  for (const day of generatedDays) day.planInstanceId = planInstanceId;
  const generationRun = {
    schemaVersion: 1, generationRunId, generatorVersion: GENERATOR_VERSION, solverVersion: SOLVER_VERSION, seed, catalogVersion,
    configSnapshotHash, configSnapshot, horizon: structuredClone(horizon), createdAt,
    diagnostics: { status: 'success', constraintPolicy: plannerConstraintPolicySnapshot(), dayCount: generatedDays.length, days: dayDiagnostics, summary: { meanScore: generatedDays.length ? Math.round(dayDiagnostics.reduce((a, b) => a + b.score, 0) / generatedDays.length * 1000) / 1000 : 0, hardConstraintViolations: 0 } },
    reason, previousGenerationRunId
  };
  const planInstance = {
    schemaVersion: 1, planInstanceId, generationRunId, startDate: horizon.startDate, endDate: horizon.endDate, status: 'active', createdAt, updatedAt: createdAt,
    continuationPolicy: structuredClone(continuationPolicy), previousPlanInstanceId
  };
  return { status: 'success', generationRun, planInstance, calendarDays: generatedDays, diagnostics: generationRun.diagnostics };
}
