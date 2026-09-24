import { repositories } from '../repositories/repositoryHub.js';
import { NUTRIENTS } from '../domain/nutritionCore.js';
import { activeRecords, assertConfigurationBundle, loadConfigurationBundle } from './configurationService.js';
import { ingredientAffinity, derivePlanRecipeVersion, summarizeNutritionDelta } from './nutritionalAffinityService.js';
import { validatedPreviewSnapshot, sealPreview, withValidatedPreview, replaceSealedPreview, validatePlannedDays } from './planPreviewGuard.js';
import { nutritionPenalty, sumNutrition } from '../planner/planMath.js';
import { tuningOverlayHasHardExclusion } from '../planner/generationTuning.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round(Number(value || 0) * factor) / factor; }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function addNutrition(total, nutrition, factor = 1) { for (const key of NUTRIENTS) total[key] += Number(nutrition?.[key] || 0) * factor; return total; }
function zeroNutrition() { return Object.fromEntries(NUTRIENTS.map(key => [key, 0])); }
function roundedNutrition(value) { return Object.fromEntries(NUTRIENTS.map(key => [key, round(value?.[key] || 0)])); }
function ingredientName(revision, locale = 'it') { return revision?.i18n?.[locale]?.name || revision?.i18n?.it?.name || revision?.i18n?.en?.name || revision?.ingredientId || ''; }
function candidateSearchText(revision) {
  return normalize([
    revision?.i18n?.it?.name, revision?.i18n?.en?.name,
    ...(revision?.i18n?.it?.aliases || []), ...(revision?.i18n?.en?.aliases || []),
    revision?.productTaxonomy?.conceptId, revision?.productTaxonomy?.subcategoryId,
    revision?.taxonomy?.foodGroup, revision?.taxonomy?.foodSubgroup,
    ...(revision?.taxonomy?.culinaryRoles || [])
  ].filter(Boolean).join(' '));
}

async function previewRecipes(preview, repo) {
  const derived = preview?.derivedRecipeVersions || [];
  const derivedById = new Map(derived.map(recipe => [recipe.recipeVersionId, recipe]));
  const ids = [...new Set((preview?.calendarDays || []).flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId))))];
  const storedIds = ids.filter(id => !derivedById.has(id));
  const stored = await repo.getMany('recipeVersions', storedIds);
  return new Map([...stored, ...derived].map(recipe => [recipe.recipeVersionId, recipe]));
}

function previewUsageCounts(preview) {
  const counts = new Map();
  for (const day of preview?.calendarDays || []) for (const slot of day.mealSlots || []) {
    if (slot.mode !== 'planned') continue;
    for (const component of slot.recipeComponents || []) counts.set(component.recipeVersionId, (counts.get(component.recipeVersionId) || 0) + Number(component.servings || 1));
  }
  return counts;
}

async function previewRevisionMap(recipeMap, repo) {
  const ids = [...new Set([...recipeMap.values()].flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)))];
  const rows = await repo.getMany('ingredientRevisions', ids);
  return new Map(rows.map(revision => [revision.ingredientRevisionId, revision]));
}

export async function listPlanIngredientUsage(generationPreview, { repo = repositories } = {}) {
  const source = generationPreview?.status === 'success' ? generationPreview : null;
  if (!source) throw new Error('Successful plan preview required');
  const recipeMap = await previewRecipes(source, repo); const usageCounts = previewUsageCounts(source); const revisionById = await previewRevisionMap(recipeMap, repo);
  const usage = new Map();
  for (const [recipeVersionId, count] of usageCounts) {
    const recipe = recipeMap.get(recipeVersionId); if (!recipe) continue;
    for (const line of recipe.ingredientLines || []) {
      const revision = revisionById.get(line.ingredientRevisionId); if (!revision) continue;
      const row = usage.get(line.ingredientId) || { ingredientId: line.ingredientId, revision, affectedOccurrences: 0, affectedRecipeVersionIds: new Set(), lineCount: 0 };
      row.affectedOccurrences += count; row.lineCount += count; row.affectedRecipeVersionIds.add(recipeVersionId); usage.set(line.ingredientId, row);
    }
  }
  return [...usage.values()].map(row => ({ ingredientId: row.ingredientId, ingredientRevisionId: row.revision.ingredientRevisionId, ingredient: row.revision, affectedOccurrences: round(row.affectedOccurrences, 2), affectedRecipeCount: row.affectedRecipeVersionIds.size, lineCount: round(row.lineCount, 2) }))
    .sort((a, b) => b.affectedOccurrences - a.affectedOccurrences || ingredientName(a.ingredient).localeCompare(ingredientName(b.ingredient)));
}

export async function createPlanIngredientSubstitutionPreview({ generationPreview, sourceIngredientId, query = '', limit = 8, offset = 0 }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const sourceState = await validatedPreviewSnapshot(generationPreview, { repo, kind: 'generation' }); const source = sourceState.preview;
  const recipeMap = await previewRecipes(source, repo); const usageCounts = previewUsageCounts(source); const revisionById = await previewRevisionMap(recipeMap, repo);
  const affectedRecipes = [...recipeMap.values()].filter(recipe => (recipe.ingredientLines || []).some(line => line.ingredientId === sourceIngredientId) && usageCounts.has(recipe.recipeVersionId));
  if (!affectedRecipes.length) throw new Error('Selected ingredient is not used in this plan preview');
  const sourceRevisions = affectedRecipes.flatMap(recipe => recipe.ingredientLines.filter(line => line.ingredientId === sourceIngredientId).map(line => revisionById.get(line.ingredientRevisionId))).filter(Boolean);
  const representative = sourceRevisions[0]; if (!representative) throw new Error('Source ingredient revision is unavailable');
  const families = (await repo.getAll('ingredients')).filter(item => item.status === 'active' && item.ingredientId !== sourceIngredientId);
  const candidates = await repo.getMany('ingredientRevisions', families.map(item => item.currentRevisionId));
  const words = normalize(query).split(/\s+/).filter(Boolean); const ranked = [];
  const generationTuningOverlay = source.generationTuningOverlay || source.generationRun?.configSnapshot?.generationTuningOverlay || null;
  for (const candidate of candidates) {
    if (tuningOverlayHasHardExclusion(generationTuningOverlay, { targetType: 'ingredient', target: candidate.ingredientId })) continue;
    if (words.length && !words.every(word => candidateSearchText(candidate).includes(word))) continue;
    let invalid = false; let weightedDistance = 0; let weightTotal = 0; let replacementAmountTotal = 0; let affectedLineOccurrences = 0; let stateMismatchOccurrences = 0;
    const newAllergenIds = new Set(); const semanticReasons = new Set(); const sourceNutrition = zeroNutrition(); const replacementNutrition = zeroNutrition();
    for (const recipe of affectedRecipes) {
      const occurrenceCount = usageCounts.get(recipe.recipeVersionId) || 0;
      for (const line of recipe.ingredientLines.filter(item => item.ingredientId === sourceIngredientId)) {
        const sourceRevision = revisionById.get(line.ingredientRevisionId); const affinity = sourceRevision && ingredientAffinity(line, sourceRevision, candidate, recipe);
        if (!affinity || !affinity.dietCompatible) { invalid = true; break; }
        const energyWeight = Math.max(1, Number(affinity.sourceNutrition.energyKcal || 0)) * occurrenceCount;
        weightedDistance += affinity.distance * energyWeight; weightTotal += energyWeight;
        replacementAmountTotal += Number(affinity.proposedLine.normalizedAmount || 0) * occurrenceCount;
        affectedLineOccurrences += occurrenceCount; if (affinity.stateMismatch) stateMismatchOccurrences += occurrenceCount;
        affinity.newAllergenIds.forEach(id => newAllergenIds.add(id)); affinity.semanticReasons.forEach(reason => semanticReasons.add(reason));
        addNutrition(sourceNutrition, affinity.sourceNutrition, occurrenceCount); addNutrition(replacementNutrition, affinity.replacementNutrition, occurrenceCount);
      }
      if (invalid) break;
    }
    if (invalid || !weightTotal) continue;
    const distance = weightedDistance / weightTotal;
    ranked.push({
      choiceId: candidate.ingredientRevisionId, candidateIngredientRevisionId: candidate.ingredientRevisionId, ingredient: candidate,
      score: Math.max(0, Math.min(100, Math.round(100 * Math.exp(-1.05 * distance)))), distance: round(distance, 4),
      affectedRecipeCount: affectedRecipes.length, affectedOccurrences: [...affectedRecipes].reduce((sum, recipe) => sum + Number(usageCounts.get(recipe.recipeVersionId) || 0), 0),
      affectedLineOccurrences: round(affectedLineOccurrences, 2), replacementAmountTotal: round(replacementAmountTotal), replacementUnit: candidate.basis?.unit || null,
      sourceNutrition: roundedNutrition(sourceNutrition), replacementNutrition: roundedNutrition(replacementNutrition), planDelta: summarizeNutritionDelta(replacementNutrition, sourceNutrition),
      newAllergenIds: [...newAllergenIds].sort(), stateMismatchOccurrences: round(stateMismatchOccurrences, 2), semanticReasons: [...semanticReasons].sort()
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.distance - b.distance || a.ingredient.ingredientRevisionId.localeCompare(b.ingredient.ingredientRevisionId));
  const pageSize = Math.max(1, Math.min(12, Math.floor(Number(limit) || 8))); const pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  return sealPreview({
    status: 'success', sourceGenerationPreviewId: generationPreview.previewId, sourceIngredientId, sourceIngredient: representative, query,
    affectedRecipeCount: affectedRecipes.length, affectedOccurrences: affectedRecipes.reduce((sum, recipe) => sum + Number(usageCounts.get(recipe.recipeVersionId) || 0), 0),
    total: ranked.length, offset: pageOffset, limit: pageSize, hasMore: pageOffset + pageSize < ranked.length, candidates: ranked.slice(pageOffset, pageOffset + pageSize)
  }, sourceState.contextHash, repo, 'plan_ingredient_substitution');
}

function recomputePreviewDay(day, recipeMap, nutritionProfile) {
  const planned = [];
  for (const slot of day.mealSlots || []) for (const component of slot.recipeComponents || []) {
    const recipe = recipeMap.get(component.recipeVersionId); if (!recipe) continue;
    const servings = Number(component.servings || 1); const nutrition = Object.fromEntries(NUTRIENTS.map(key => [key, Number(recipe.calculatedNutrition?.[key] || 0) * servings])); planned.push(nutrition);
  }
  const known = sumNutrition(planned); const dailyTarget = Number(day.nutritionSummary?.target?.energyKcal || nutritionProfile.dailyEnergyKcal); const plannedTarget = Number(day.nutritionSummary?.target?.plannedEnergyKcal || dailyTarget); const nutrientTargetFactor = plannedTarget / Math.max(1, dailyTarget);
  const score = nutritionPenalty(known, nutritionProfile, { energyTarget: plannedTarget, energyWeight: 3, nutrientTargetFactor });
  return { ...clone(day.nutritionSummary), knownPlanned: known, score: Math.round(score * 1000) / 1000 };
}

export async function applyPlanIngredientSubstitutionPreview({ generationPreview, substitutionPreview, candidateIngredientRevisionId }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (substitutionPreview.sourceGenerationPreviewId !== generationPreview.previewId) throw new Error('Ingredient substitution preview does not belong to this plan preview');
  return withValidatedPreview(substitutionPreview, { repo, kind: 'plan_ingredient_substitution', choice: candidateIngredientRevisionId }, async () => {
    const sourceState = await validatedPreviewSnapshot(generationPreview, { repo, kind: 'generation' }); const source = sourceState.preview;
    const selected = substitutionPreview.candidates.find(item => item.candidateIngredientRevisionId === candidateIngredientRevisionId); if (!selected) throw new Error('Replacement ingredient is not an admissible candidate');
    const candidate = await repo.get('ingredientRevisions', candidateIngredientRevisionId); if (!candidate) throw new Error('Replacement ingredient is no longer available');
    const candidateFamily = await repo.get('ingredients', candidate.ingredientId); if (!candidateFamily || candidateFamily.status !== 'active' || candidateFamily.currentRevisionId !== candidate.ingredientRevisionId) throw new Error('Replacement ingredient changed after the preview');
    const recipeMap = await previewRecipes(source, repo); const revisionById = await previewRevisionMap(recipeMap, repo); const usageCounts = previewUsageCounts(source);
    const timestamp = new Date().toISOString(); const replacements = new Map(); const newlyDerived = [];
    for (const recipe of recipeMap.values()) {
      if (!usageCounts.has(recipe.recipeVersionId) || !(recipe.ingredientLines || []).some(line => line.ingredientId === substitutionPreview.sourceIngredientId)) continue;
      const result = await derivePlanRecipeVersion({ recipe, sourceIngredientId: substitutionPreview.sourceIngredientId, candidateRevision: candidate, revisionById, createdAt: timestamp });
      if (!result) continue; registry.assert('recipeVersion', result.version); replacements.set(recipe.recipeVersionId, result.version); newlyDerived.push(result.version);
    }
    if (!newlyDerived.length) throw new Error('The source ingredient is no longer present in the plan preview');
    const next = clone(source);
    for (const day of next.calendarDays || []) for (const slot of day.mealSlots || []) for (const component of slot.recipeComponents || []) {
      const replacement = replacements.get(component.recipeVersionId); if (replacement) component.recipeVersionId = replacement.recipeVersionId;
    }
    const allDerived = [...(source.derivedRecipeVersions || []), ...newlyDerived]; next.derivedRecipeVersions = allDerived;
    const nextRecipeMap = new Map(recipeMap); for (const version of newlyDerived) nextRecipeMap.set(version.recipeVersionId, version);
    const bundle = await loadConfigurationBundle(repo); assertConfigurationBundle(bundle, registry); const active = activeRecords(bundle);
    for (const day of next.calendarDays || []) { day.nutritionSummary = recomputePreviewDay(day, nextRecipeMap, active.nutritionProfile); registry.assert('calendarDay', day); }
    const validation = await validatePlannedDays(next.calendarDays, repo, { extraRecipes: allDerived, replacePlanInstanceId: next.planInstance?.previousPlanInstanceId || null, generationTuningOverlay: next.generationTuningOverlay || next.generationRun?.configSnapshot?.generationTuningOverlay || null });
    const edit = {
      type: 'ingredient_plan_replace', sourceIngredientId: substitutionPreview.sourceIngredientId, sourceIngredientRevisionId: substitutionPreview.sourceIngredient?.ingredientRevisionId || null,
      candidateIngredientId: candidate.ingredientId, candidateIngredientRevisionId: candidate.ingredientRevisionId, affinityScore: selected.score,
      sourceNames: { it: ingredientName(substitutionPreview.sourceIngredient, 'it'), en: ingredientName(substitutionPreview.sourceIngredient, 'en') },
      candidateNames: { it: ingredientName(candidate, 'it'), en: ingredientName(candidate, 'en') },
      affectedRecipeCount: newlyDerived.length, affectedOccurrences: selected.affectedOccurrences, nutritionDelta: clone(selected.planDelta), createdAt: timestamp
    };
    next.planIngredientSubstitutions = [...(next.planIngredientSubstitutions || []), edit];
    next.diagnostics = { ...(next.diagnostics || {}), frequencies: validation.frequencies, postGenerationEdits: [...(next.diagnostics?.postGenerationEdits || []), edit] };
    next.generationRun = { ...next.generationRun, diagnostics: { ...(next.generationRun?.diagnostics || {}), frequencies: validation.frequencies, postGenerationEdits: [...(next.generationRun?.diagnostics?.postGenerationEdits || []), edit] } };
    registry.assert('generationRun', next.generationRun);
    return replaceSealedPreview(generationPreview, next, { repo, kind: 'generation' });
  });
}
