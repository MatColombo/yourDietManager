import { repositories } from '../repositories/repositoryHub.js';
import { availableCurrentRecipeIds } from './catalogAvailability.js';
import { validatedPreviewSnapshot } from './planPreviewGuard.js';
import { createPlanPreview } from './planGenerationService.js';
import { GENERATION_TUNING_VERSION } from '../planner/generationTuning.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function ingredientName(revision, locale = 'it') { return revision?.i18n?.[locale]?.name || revision?.i18n?.it?.name || revision?.i18n?.en?.name || revision?.ingredientId || ''; }
function recipeTitle(recipe, locale = 'it') { return recipe?.i18n?.[locale]?.title || recipe?.i18n?.it?.title || recipe?.i18n?.en?.title || recipe?.recipeId || ''; }

export function generationTuningOverlayFromPreview(preview) {
  return clone(preview?.generationTuningOverlay || preview?.generationRun?.configSnapshot?.generationTuningOverlay || { schemaVersion: GENERATION_TUNING_VERSION, rules: [] });
}

export async function listGenerationTuningTargets({ repo = repositories, locale = 'it' } = {}) {
  const families = (await repo.getAll('ingredients')).filter(item => item.status === 'active');
  const revisions = await repo.getMany('ingredientRevisions', families.map(item => item.currentRevisionId));
  const ingredientFamilyByRevision = new Map(families.map(item => [item.currentRevisionId, item]));
  const ingredients = revisions.map(revision => ({ ingredientId: revision.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, label: ingredientName(revision, locale) }))
    .filter(item => ingredientFamilyByRevision.has(item.ingredientRevisionId)).sort((a, b) => a.label.localeCompare(b.label) || a.ingredientId.localeCompare(b.ingredientId));

  const versionIds = await availableCurrentRecipeIds(repo); const recipeVersions = await repo.getMany('recipeVersions', versionIds);
  const recipes = recipeVersions.map(recipe => ({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, label: recipeTitle(recipe, locale), mealArchetypes: recipe.mealArchetypes || [] }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.recipeId.localeCompare(b.recipeId));
  return { ingredients, recipes };
}

export async function createGenerationTuningPreview({ generationPreview, rules = [], signal = null, onProgress = null, createdAt = null }, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const sourceState = await validatedPreviewSnapshot(generationPreview, { repo, kind: 'generation' }); const source = sourceState.preview;
  if (source.status !== 'success') throw new Error('Successful generation preview required');
  const overlay = { schemaVersion: GENERATION_TUNING_VERSION, rules: clone(rules) };
  const result = await createPlanPreview({
    horizon: clone(source.generationRun.horizon),
    seed: source.generationRun.seed,
    createdAt: createdAt || new Date().toISOString(),
    reason: source.generationRun.reason,
    previousPlanInstanceId: source.planInstance?.previousPlanInstanceId || null,
    continuationPolicy: clone(source.planInstance?.continuationPolicy),
    generationTuningOverlay: overlay,
    signal, onProgress
  }, { repo, registry });
  return result;
}
