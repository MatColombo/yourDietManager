import { bandIdFor, clamp, deterministicHash, round, unique } from './corpusMath.js';
import { evaluateReleaseGates } from './corpusScanner.js';
import { TAXONOMY_IDS } from '../services/referenceDataService.js';
import { sha256Json } from '../lib/crypto.js';


const SEMANTIC_DIMENSION_TAXONOMY = Object.freeze({
  practicality: TAXONOMY_IDS.practicalTag,
  diet: TAXONOMY_IDS.dietTag,
  recipe_family: TAXONOMY_IDS.recipeFamily,
  cuisine: TAXONOMY_IDS.cuisine,
  ingredient_category: TAXONOMY_IDS.foodCategory
});
function assertCanonicalCriterion(index, criterion, path) {
  const taxonomyId = SEMANTIC_DIMENSION_TAXONOMY[criterion?.dimension];
  if (!taxonomyId) return;
  try { index.assertTerm(criterion.key, taxonomyId); }
  catch (error) { throw new Error(`${path}: ${error.message}`); }
}
function assertCorpusReferenceInputs(policy, goal, index) {
  if (!index) throw new Error('Recipe corpus planning requires the frozen Reference Data Registry snapshot');
  for (const target of policy.coverageTargets || []) {
    const criteria = target.criteria?.length ? target.criteria : [{ dimension: target.dimension, key: target.key }];
    criteria.forEach((criterion, i) => assertCanonicalCriterion(index, criterion, `coverageTarget:${target.targetId}.criteria[${i}]`));
  }
  const focusMap = {
    cuisines: TAXONOMY_IDS.cuisine, recipeFamilies: TAXONOMY_IDS.recipeFamily, practicalityTags: TAXONOMY_IDS.practicalTag,
    dietTags: TAXONOMY_IDS.dietTag, ingredientCategoryIds: TAXONOMY_IDS.foodCategory
  };
  for (const [key, taxonomyId] of Object.entries(focusMap)) {
    for (const value of goal?.focus?.[key] || []) {
      try { index.assertTerm(value, taxonomyId); }
      catch (error) { throw new Error(`goal.focus.${key}: ${error.message}`); }
    }
  }
}

const DIMENSION_TO_SCORE = {
  meal_archetype: 'meal', energy_band: 'nutrition', protein_band: 'nutrition', fiber_band: 'nutrition', practicality: 'practicality',
  cuisine: 'cuisine', recipe_family: 'recipeFamily', ingredient_category: 'ingredientDiversity', diet: 'practicality'
};
function cellMap(snapshot) { return new Map(snapshot.coverageCells.map(cell => [cell.targetId, cell])); }
function targetDeficit(policy, snapshot, target) { return cellMap(snapshot).get(target.targetId)?.normalizedDeficit || 0; }
function targetWeightedDeficit(policy, snapshot, target) { return cellMap(snapshot).get(target.targetId)?.weightedDeficit || 0; }
function topTargets(policy, snapshot) { return policy.coverageTargets.map(target => ({ target, deficit: targetDeficit(policy, snapshot, target), weighted: targetWeightedDeficit(policy, snapshot, target) })).filter(item => item.deficit > 0).sort((a, b) => b.weighted - a.weighted || a.target.targetId.localeCompare(b.target.targetId)); }
function targetByDimension(items, dimension) { return items.filter(item => item.target.dimension === dimension); }
function focusValues(goal, key) { return goal?.focus?.[key] || []; }
function matchesFocus(intent, focus) {
  if (!focus) return false;
  const tests = [
    ['mealArchetypes', intent.mealArchetypes], ['cuisines', intent.cuisines], ['recipeFamilies', intent.recipeFamilies], ['practicalityTags', intent.practicality], ['energyBandIds', intent.energyBandId ? [intent.energyBandId] : []], ['proteinBandIds', intent.proteinBandId ? [intent.proteinBandId] : []], ['fiberBandIds', intent.fiberBandId ? [intent.fiberBandId] : []], ['dietTags', intent.dietTags]
  ];
  return tests.some(([key, values]) => (focus[key] || []).some(value => values.includes(value)));
}
function restrictFocusSatisfied(intent, focus) {
  if (!focus) return true;
  const checks = [
    ['mealArchetypes', intent.mealArchetypes], ['cuisines', intent.cuisines], ['recipeFamilies', intent.recipeFamilies], ['practicalityTags', intent.practicality], ['energyBandIds', intent.energyBandId ? [intent.energyBandId] : []], ['proteinBandIds', intent.proteinBandId ? [intent.proteinBandId] : []], ['fiberBandIds', intent.fiberBandId ? [intent.fiberBandId] : []], ['dietTags', intent.dietTags]
  ];
  for (const [key, actual] of checks) if ((focus[key] || []).length && !(focus[key] || []).some(value => actual.includes(value))) return false;
  return true;
}
function applyCriterionToIntent(intent, dimension, key) {
  switch (dimension) {
    case 'meal_archetype': intent.mealArchetypes.push(key); break;
    case 'energy_band': intent.energyBandId = key; break;
    case 'protein_band': intent.proteinBandId = key; break;
    case 'fiber_band': intent.fiberBandId = key; break;
    case 'practicality': intent.practicality.push(key); break;
    case 'diet': intent.dietTags.push(key); break;
    case 'recipe_family': intent.recipeFamilies.push(key); break;
    case 'cuisine': intent.cuisines.push(key); break;
    case 'ingredient_category': intent.ingredientCategories.push(key); break;
  }
}
function targetCriteria(target) { return target.criteria?.length ? target.criteria : [{ dimension: target.dimension, key: target.key }]; }
function criterionConflicts(intent, criterion) {
  const singleton = { meal_archetype:'mealArchetypes', recipe_family:'recipeFamilies', cuisine:'cuisines', diet:'dietTags' };
  const scalar = { energy_band:'energyBandId', protein_band:'proteinBandId', fiber_band:'fiberBandId' };
  if (scalar[criterion.dimension]) { const value = intent[scalar[criterion.dimension]]; return Boolean(value && value !== criterion.key); }
  if (singleton[criterion.dimension]) { const values = intent[singleton[criterion.dimension]]; return values.length > 0 && !values.includes(criterion.key); }
  return false;
}
function targetCompatible(intent, target) {
  const draft = structuredClone(intent);
  for (const criterion of targetCriteria(target)) {
    if (criterionConflicts(draft, criterion)) return false;
    applyCriterionToIntent(draft, criterion.dimension, criterion.key);
  }
  return true;
}
function targetToIntent(intent, target, policy) {
  if (!targetCompatible(intent, target)) return false;
  for (const criterion of targetCriteria(target)) applyCriterionToIntent(intent, criterion.dimension, criterion.key);
  intent.targetIds.push(target.targetId);
  return true;
}
function normalizeIntent(intent) {
  for (const key of ['mealArchetypes','practicality','dietTags','recipeFamilies','cuisines','ingredientCategories','targetIds']) intent[key] = unique(intent[key]).sort();
  return intent;
}
function canonicalIntentKey(intent) { return JSON.stringify(normalizeIntent(structuredClone(intent))); }
function buildIntents(policy, snapshot, goal, ingredientFamilies = [], ingredientRevisions = []) {
  const revisionById = new Map(ingredientRevisions.map(record => [record.ingredientRevisionId, record]));
  const activeIngredientCategories = new Set(ingredientFamilies.filter(family => family.status === 'active').map(family => revisionById.get(family.currentRevisionId)?.taxonomy?.foodGroup).filter(Boolean));
  const targetFeasible = target => targetCriteria(target).filter(criterion => criterion.dimension === 'ingredient_category').every(criterion => activeIngredientCategories.has(criterion.key));
  const items = topTargets(policy, snapshot).filter(item => targetFeasible(item.target)); if (!items.length) return [];
  const intents = [];
  for (const primary of items.slice(0, policy.batchPlanning.candidateIntentLimit)) {
    const intent = { mealArchetypes: [], energyBandId: null, proteinBandId: null, fiberBandId: null, practicality: [], dietTags: [], recipeFamilies: [], cuisines: [], ingredientCategories: [], targetIds: [] };
    targetToIntent(intent, primary.target, policy);
    // Enrich only with the strongest compatible deficits; cap simultaneous targets to avoid over-constrained batches.
    const maxTargets = policy.batchPlanning.maxCoverageTargetsPerJob || 5;
    for (const dimension of ['meal_archetype','energy_band','protein_band','fiber_band','practicality','diet','recipe_family','cuisine','ingredient_category']) {
      if (intent.targetIds.length >= maxTargets) break;
      const item = items.find(candidate => candidate.target.dimension === dimension && candidate.deficit > 0.15 && !intent.targetIds.includes(candidate.target.targetId) && targetCompatible(intent, candidate.target));
      if (item) targetToIntent(intent, item.target, policy);
    }
    intents.push(normalizeIntent(intent));
  }
  // Focus-only intent lets a focused expansion proceed even when the global coverage cell itself is not under target.
  if (goal?.focus) {
    const intent = { mealArchetypes: [...focusValues(goal,'mealArchetypes')], energyBandId: focusValues(goal,'energyBandIds')[0] || null, proteinBandId: focusValues(goal,'proteinBandIds')[0] || null, fiberBandId: focusValues(goal,'fiberBandIds')[0] || null, practicality: [...focusValues(goal,'practicalityTags')], dietTags: [...focusValues(goal,'dietTags')], recipeFamilies: [...focusValues(goal,'recipeFamilies')], cuisines: [...focusValues(goal,'cuisines')], ingredientCategories: [...focusValues(goal,'ingredientCategoryIds')], targetIds: [] };
    const matching = policy.coverageTargets.filter(target => {
      const map = { meal_archetype:'mealArchetypes', energy_band:'energyBandIds', protein_band:'proteinBandIds', fiber_band:'fiberBandIds', practicality:'practicalityTags', diet:'dietTags', recipe_family:'recipeFamilies', cuisine:'cuisines', ingredient_category:'ingredientCategoryIds' };
      const criteria = target.criteria?.length ? target.criteria : [{ dimension: target.dimension, key: target.key }];
      return criteria.every(criterion => (goal.focus[map[criterion.dimension]] || []).includes(criterion.key));
    });
    intent.targetIds.push(...matching.map(target => target.targetId));
    if (!intent.targetIds.length) intent.targetIds.push(items[0].target.targetId);
    const normalizedFocusIntent = normalizeIntent(intent);
    if (goal.intentStrategy === 'focus_only') return [normalizedFocusIntent];
    intents.unshift(normalizedFocusIntent);
  }
  const seen = new Set(); return intents.filter(intent => { const key = canonicalIntentKey(intent); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, policy.batchPlanning.candidateIntentLimit);
}
function scoreIntent(intent, policy, snapshot, goal) {
  const byId = new Map(policy.coverageTargets.map(target => [target.targetId, target])); const cells = cellMap(snapshot);
  const raw = { nutrition: 0, meal: 0, practicality: 0, cuisine: 0, ingredientDiversity: 0, recipeFamily: 0, focusBoost: 0, similarityPenalty: 0, ingredientOverusePenalty: 0, pairRepetitionPenalty: 0 };
  for (const targetId of intent.targetIds) {
    const target = byId.get(targetId), cell = cells.get(targetId); if (!target || !cell) continue;
    const bucket = DIMENSION_TO_SCORE[target.dimension]; if (bucket) raw[bucket] = Math.max(raw[bucket], cell.normalizedDeficit);
  }
  const primaryDistinct = snapshot.ingredientUsage.filter(item => item.primaryCount > 0).length;
  raw.ingredientDiversity = Math.max(raw.ingredientDiversity, clamp((policy.diversity.minimumDistinctPrimaryIngredients - primaryDistinct) / policy.diversity.minimumDistinctPrimaryIngredients));
  raw.similarityPenalty = clamp(snapshot.similarity.nearDuplicateShare / Math.max(policy.similarity.nearDuplicateMaxShare, 1e-9));
  const maxPrimary = Math.max(0, ...snapshot.ingredientUsage.map(item => item.primaryShare));
  raw.ingredientOverusePenalty = clamp((maxPrimary - policy.diversity.ingredientOverusePenaltyStartShare) / Math.max(policy.diversity.primaryIngredientMaxShare - policy.diversity.ingredientOverusePenaltyStartShare, 1e-9));
  const maxPair = Math.max(0, ...snapshot.ingredientPairUsage.map(item => item.share));
  raw.pairRepetitionPenalty = clamp((maxPair - policy.diversity.pairPenaltyStartShare) / Math.max(policy.diversity.repeatedPairMaxShare - policy.diversity.pairPenaltyStartShare, 1e-9));
  raw.focusBoost = matchesFocus(intent, goal?.focus) ? 1 : 0;
  const w = policy.scoreWeights;
  const priority = w.nutrition*raw.nutrition + w.meal*raw.meal + w.practicality*raw.practicality + w.cuisine*raw.cuisine + w.ingredientDiversity*raw.ingredientDiversity + w.recipeFamily*raw.recipeFamily + w.focusBoost*raw.focusBoost - w.similarityPenalty*raw.similarityPenalty - w.ingredientOverusePenalty*raw.ingredientOverusePenalty - w.pairRepetitionPenalty*raw.pairRepetitionPenalty;
  return { priority: round(priority, 6), scoreBreakdown: Object.fromEntries(Object.entries(raw).map(([key,value]) => [key, round(value, 6)])) };
}
function rangeById(bands, id, fallback) { const band = bands.find(item => item.bandId === id); return band ? { min: band.min, max: band.max } : fallback; }
function defaultEnergyForMeals(meals) {
  if (meals.some(value => ['breakfast','snack','mini_meal','pre_shift','during_shift','post_shift','night_meal'].includes(value))) return { min: 150, max: 499 };
  return { min: 300, max: 799 };
}
function productionIngredientEligible(revision, productionContract) {
  if (!productionContract) return true;
  if (!revision) return false;
  if (revision.quality?.status !== productionContract.ingredientReadiness?.qualityStatus) return false;
  if (revision.quality?.confidence !== productionContract.ingredientReadiness?.confidence) return false;
  for (const field of productionContract.ingredientReadiness?.requiredNutritionFields || []) if (!Number.isFinite(revision.nutrition?.[field]) || revision.nutrition[field] < 0) return false;
  if (productionContract.ingredientReadiness?.requireSourceLabel && !revision.source?.label?.trim()) return false;
  return true;
}
function allowedIngredients({ ingredientFamilies, ingredientRevisions, intent, goal, productionContract = null }) {
  const revisionById = new Map(ingredientRevisions.map(record => [record.ingredientRevisionId, record]));
  let entries = ingredientFamilies.filter(family => family.status === 'active').map(family => ({ family, revision: revisionById.get(family.currentRevisionId) })).filter(item => item.revision && productionIngredientEligible(item.revision, productionContract));
  const focus = goal?.focus || null;
  if (goal?.focusMode === 'restrict' && focus?.ingredientIds?.length) entries = entries.filter(item => focus.ingredientIds.includes(item.family.ingredientId));
  if (goal?.focusMode === 'restrict' && focus?.ingredientCategoryIds?.length) entries = entries.filter(item => focus.ingredientCategoryIds.includes(item.revision.taxonomy?.foodGroup));
  return entries;
}
function intentFeasible(intent, ingredientFamilies, ingredientRevisions, productionContract = null) {
  if (!intent.ingredientCategories.length) return true;
  const revisionById = new Map(ingredientRevisions.map(record => [record.ingredientRevisionId, record]));
  const activeCategories = new Set(ingredientFamilies.filter(family => family.status === 'active').map(family => revisionById.get(family.currentRevisionId)).filter(revision => productionIngredientEligible(revision, productionContract)).map(revision => revision?.taxonomy?.foodGroup).filter(Boolean));
  return intent.ingredientCategories.every(category => activeCategories.has(category));
}
function acceptedCountFor(mode, goal, policy, snapshot) {
  let remaining = policy.batchPlanning.defaultAcceptedCount;
  if (mode === 'build') remaining = Math.max(0, (goal.targetRecipeCount || policy.targetCorpus.target) - snapshot.activeRecipeCount);
  else if (mode === 'expand' || mode === 'focused_expansion') remaining = goal.acceptedAddCount || policy.batchPlanning.defaultAcceptedCount;
  const cap = Math.min(policy.batchPlanning.maxAcceptedCount, policy.batchPlanning.defaultAcceptedCount);
  return Math.max(1, Math.min(remaining || cap, cap));
}
function stopEvaluation(mode, goal, policy, snapshot) {
  const gates = evaluateReleaseGates(snapshot, policy); const hardCoverageFailures = gates.failed.filter(item => item.key.startsWith('coverage:'));
  if (mode === 'build') {
    const target = goal.targetRecipeCount || policy.targetCorpus.target;
    if (snapshot.activeRecipeCount >= target && gates.passed) return { stop: true, status: 'completed', stopReason: 'target_reached' };
    if (snapshot.activeRecipeCount >= policy.targetCorpus.max && hardCoverageFailures.length) return { stop: true, status: 'blocked', stopReason: 'quality_gate_failure' };
  }
  return { stop: false, gates };
}

export async function planNextBatch({ policy, snapshot, ingredientFamilies = [], ingredientRevisions = [], mode = 'build', goal = {}, seed = 'corpus-seed', targetCatalogVersion = '0.4.0-dev', referenceDataVersion = null, referenceDataDigest = null, referenceIndex = null, productionContract = null, runId = null, createdAt = null }) {
  if (!referenceDataVersion || !referenceDataDigest) throw new Error('Recipe corpus planning requires referenceDataVersion and referenceDataDigest');
  if (!/^[a-f0-9]{64}$/.test(String(referenceDataDigest))) throw new Error('Recipe corpus planning requires a valid SHA-256 referenceDataDigest');
  assertCorpusReferenceInputs(policy, goal, referenceIndex);
  let pipelineVersion = 'recipe-pipeline-1';
  let productionContractRef = null;
  if (productionContract) {
    if (productionContract.policyId !== policy.policyId || productionContract.policyVersion !== policy.policyVersion) throw new Error('Production contract policy does not match RecipeCorpusPolicy');
    if (!productionContract.pipelineVersion) throw new Error('Production contract requires pipelineVersion');
    pipelineVersion = productionContract.pipelineVersion;
    productionContractRef = { contractId: productionContract.contractId, contractVersion: productionContract.contractVersion, contractDigest: await sha256Json(productionContract) };
  }
  const normalizedGoal = {
    targetRecipeCount: goal.targetRecipeCount ?? null,
    acceptedAddCount: goal.acceptedAddCount ?? null,
    maxJobs: goal.maxJobs ?? (mode === 'improve' ? 1 : null),
    allowRetire: Boolean(goal.allowRetire),
    focusMode: goal.focusMode || 'boost',
    intentStrategy: goal.intentStrategy || 'adaptive',
    focus: goal.focus || null
  };
  if (mode === 'build' && normalizedGoal.targetRecipeCount == null) normalizedGoal.targetRecipeCount = policy.targetCorpus.target;
  if ((mode === 'expand' || mode === 'focused_expansion') && normalizedGoal.acceptedAddCount == null) normalizedGoal.acceptedAddCount = policy.batchPlanning.defaultAcceptedCount;
  if (mode === 'focused_expansion' && !normalizedGoal.focus) throw new Error('focused_expansion requires a focus');
  const timestamp = createdAt || new Date().toISOString(); const actualRunId = runId || `orun-${mode}-${(await deterministicHash(seed, snapshot.snapshotId)).slice(0, 12)}`;
  const stop = stopEvaluation(mode, normalizedGoal, policy, snapshot);
  if (stop.stop) {
    return { run: { schemaVersion: 1, runId: actualRunId, mode, plannerVersion: policy.plannerVersion, policyId: policy.policyId, policyVersion: policy.policyVersion, inputSnapshotId: snapshot.snapshotId, outputSnapshotId: snapshot.snapshotId, seed, goal: normalizedGoal, status: stop.status, stopReason: stop.stopReason, plannedJobs: [], createdAt: timestamp, completedAt: timestamp }, jobs: [] };
  }
  let intents = buildIntents(policy, snapshot, normalizedGoal, ingredientFamilies, ingredientRevisions);
  if (normalizedGoal.focusMode === 'restrict') intents = intents.filter(intent => restrictFocusSatisfied(intent, normalizedGoal.focus));
  intents = intents.filter(intent => intentFeasible(intent, ingredientFamilies, ingredientRevisions, productionContract));
  const ingredientEntries = allowedIngredients({ ingredientFamilies, ingredientRevisions, intent: intents[0] || { ingredientCategories: [] }, goal: normalizedGoal, productionContract });
  if (!intents.length || !ingredientEntries.length) {
    return { run: { schemaVersion: 1, runId: actualRunId, mode, plannerVersion: policy.plannerVersion, policyId: policy.policyId, policyVersion: policy.policyVersion, inputSnapshotId: snapshot.snapshotId, outputSnapshotId: null, seed, goal: normalizedGoal, status: 'blocked', stopReason: 'no_feasible_batch_intent', plannedJobs: [], createdAt: timestamp, completedAt: timestamp }, jobs: [] };
  }
  const scored = [];
  for (const intent of intents) {
    const score = scoreIntent(intent, policy, snapshot, normalizedGoal); const key = canonicalIntentKey(intent); const tie = await deterministicHash(seed, key); scored.push({ intent, key, tie, ...score });
  }
  scored.sort((a,b) => b.priority-a.priority || a.tie.localeCompare(b.tie) || a.key.localeCompare(b.key));
  const chosen = scored[0];
  if (policy.batchPlanning.stopWhenNoPositivePriority && chosen.priority <= 0 && mode !== 'focused_expansion') {
    return { run: { schemaVersion: 1, runId: actualRunId, mode, plannerVersion: policy.plannerVersion, policyId: policy.policyId, policyVersion: policy.policyVersion, inputSnapshotId: snapshot.snapshotId, outputSnapshotId: null, seed, goal: normalizedGoal, status: 'completed', stopReason: 'no_positive_priority', plannedJobs: [], createdAt: timestamp, completedAt: timestamp }, jobs: [] };
  }
  const targetAcceptedCount = acceptedCountFor(mode, normalizedGoal, policy, snapshot);
  const candidateCount = Math.min(policy.batchPlanning.maxCandidateCount, Math.max(targetAcceptedCount, Math.ceil(targetAcceptedCount * policy.batchPlanning.oversampleRatio)));
  const intent = chosen.intent; const meals = intent.mealArchetypes.length ? intent.mealArchetypes : (normalizedGoal.focus?.mealArchetypes?.length ? normalizedGoal.focus.mealArchetypes : ['lunch','dinner']);
  const entries = allowedIngredients({ ingredientFamilies, ingredientRevisions, intent, goal: normalizedGoal, productionContract });
  const usage = new Map(snapshot.ingredientUsage.map(item => [item.ingredientId, item]));
  const targetCategorySet = new Set(intent.ingredientCategories);
  const preferred = entries.filter(item => !(policy.diversity.exemptIngredientIds || []).includes(item.family.ingredientId)).sort((a,b) => { const ac = targetCategorySet.has(a.revision.taxonomy?.foodGroup) ? 0 : 1; const bc = targetCategorySet.has(b.revision.taxonomy?.foodGroup) ? 0 : 1; return ac-bc || (usage.get(a.family.ingredientId)?.primaryShare || 0)-(usage.get(b.family.ingredientId)?.primaryShare || 0) || a.family.ingredientId.localeCompare(b.family.ingredientId); }).slice(0, 40).map(item => item.family.ingredientId);
  const targetById = new Map(policy.coverageTargets.map(target => [target.targetId,target]));
  const reasons = intent.targetIds.map(id => { const target = targetById.get(id); const deficit = cellMap(snapshot).get(id)?.normalizedDeficit || 0; return `${target?.dimension || 'coverage'}:${target?.key || id} deficit=${round(deficit,3)}`; });
  if (normalizedGoal.focus) reasons.push(`user focus mode=${normalizedGoal.focusMode}`);
  if (!reasons.length) reasons.push('selected by deterministic corpus priority');
  const jobHash = await deterministicHash(seed, `${actualRunId}:${chosen.key}:${targetAcceptedCount}`); const jobId = `batch-${jobHash.slice(0, 14)}`;
  const job = {
    schemaVersion: 1, jobId, pipelineVersion, productionContract: productionContractRef, referenceDataVersion, referenceDataDigest, seed: `${seed}:${jobHash.slice(0,16)}`, targetCatalogVersion, sourceLocale: 'it', requiredLocales: ['it','en'], targetAcceptedCount, candidateCount,
    mealArchetypes: unique(meals),
    energyKcal: rangeById(policy.energyBands, intent.energyBandId, defaultEnergyForMeals(meals)),
    proteinG: intent.proteinBandId ? rangeById(policy.proteinBands, intent.proteinBandId, null) : null,
    fiberG: intent.fiberBandId ? rangeById(policy.fiberBands, intent.fiberBandId, null) : null,
    maxTotalMinutes: intent.practicality.includes('practical_quick') ? 20 : null,
    recipeFamilies: unique(intent.recipeFamilies), cuisineFocus: unique(intent.cuisines), practicalityTargets: unique(intent.practicality), requiredTags: unique(intent.dietTags), forbiddenTags: [], preferredUnderusedIngredientIds: preferred,
    diversityTargets: (() => { const eligiblePrimaryCount = Math.max(1, entries.filter(item => !(policy.diversity.exemptIngredientIds || []).includes(item.family.ingredientId)).length); const minPrimary = Math.max(1, Math.min(eligiblePrimaryCount, targetAcceptedCount, Math.ceil(Math.sqrt(targetAcceptedCount) * 2))); const minIngredients = Math.max(1, Math.min(entries.length, Math.ceil(Math.sqrt(targetAcceptedCount) * 4))); return { minDistinctPrimaryIngredients: minPrimary, minDistinctIngredientIds: minIngredients, maxPrimaryIngredientFrequency: Math.max(1, Math.ceil(targetAcceptedCount / minPrimary), Math.ceil(targetAcceptedCount * 0.15)), maxIngredientPairFrequency: Math.max(2, Math.ceil(targetAcceptedCount * 0.08)) }; })(),
    coverageTargets: intent.targetIds.map(targetId => { const target = targetById.get(targetId); return { targetId, key: target?.key || targetId, dimension: target?.dimension || null, criteria: target ? targetCriteria(target) : [], desiredAcceptedGain: Math.max(1, Math.min(targetAcceptedCount, Math.ceil(targetAcceptedCount / intent.targetIds.length))) }; }),
    allowedIngredientIds: entries.map(item => item.family.ingredientId).sort(),
    orchestration: { runId: actualRunId, inputSnapshotId: snapshot.snapshotId, policyId: policy.policyId, policyVersion: policy.policyVersion, plannedPriority: chosen.priority, targetIds: intent.targetIds, reasons }
  };
  const planned = { jobId, priority: chosen.priority, scoreBreakdown: chosen.scoreBreakdown, targetIds: intent.targetIds, reasons, expectedAcceptedCount: targetAcceptedCount };
  const run = { schemaVersion: 1, runId: actualRunId, mode, plannerVersion: policy.plannerVersion, policyId: policy.policyId, policyVersion: policy.policyVersion, inputSnapshotId: snapshot.snapshotId, outputSnapshotId: null, seed, goal: normalizedGoal, status: 'planned', stopReason: null, plannedJobs: [planned], createdAt: timestamp, completedAt: null };
  return { run, jobs: [job], rankedIntents: scored.slice(0, 10).map(item => ({ key: item.key, priority: item.priority, scoreBreakdown: item.scoreBreakdown, targetIds: item.intent.targetIds })) };
}
