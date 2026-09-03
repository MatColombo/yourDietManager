import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json } from '../lib/crypto.js';
import { calculateRecipeNutrition, CALCULATION_ALGORITHM_VERSION, deriveAllergens, normalizeIngredientAmount } from '../domain/nutritionCore.js';

function slug(value, fallback) {
  const base = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34);
  return base || fallback;
}
function suffix() { return globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 10) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function splitTokens(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function cleanList(value) { return unique(String(value || '').split(',').map(item => item.trim()).filter(Boolean)); }
function nowIso() { return new Date().toISOString(); }

export async function saveUserIngredient(input, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const existing = input.ingredientId ? await repo.get('ingredients', input.ingredientId) : null;
  if (existing && existing.origin !== 'user') throw new Error('Base ingredients cannot be edited');
  const previous = existing ? await repo.get('ingredientRevisions', existing.currentRevisionId) : null;
  const ingredientId = existing?.ingredientId || `uing_${slug(input.nameIt || input.nameEn, 'ingredient')}_${suffix()}`;
  const revisionNumber = (previous?.revisionNumber || 0) + 1;
  const ingredientRevisionId = `${ingredientId}_r${revisionNumber}_${suffix().slice(0, 5)}`;
  const createdAt = nowIso();
  const revisionBase = {
    schemaVersion: 1, ingredientRevisionId, ingredientId, revisionNumber, origin: 'user', catalogVersion: null,
    i18n: {
      it: { name: String(input.nameIt || input.nameEn || '').trim(), aliases: cleanList(input.aliasesIt) },
      en: { name: String(input.nameEn || input.nameIt || '').trim(), aliases: cleanList(input.aliasesEn) }
    },
    basis: { amount: 100, unit: input.basisUnit === 'ml' ? 'ml' : 'g', state: input.state || 'unknown' },
    nutrition: {
      energyKcal: Number(input.energyKcal), proteinG: Number(input.proteinG), carbsG: Number(input.carbsG), fatG: Number(input.fatG), fiberG: Number(input.fiberG)
    },
    taxonomy: {
      foodGroup: String(input.foodGroup || 'other').trim(), foodSubgroup: String(input.foodSubgroup || 'other').trim(),
      flavorProfile: ['sweet','savory','neutral'].includes(input.flavorProfile) ? input.flavorProfile : 'neutral',
      mealArchetypes: unique(input.mealArchetypes || [])
    },
    allergenIds: unique(input.allergenIds || []), conversions: Array.isArray(input.conversions) ? input.conversions : [],
    source: { type: 'manual', label: 'User authored', reference: null, sourceRecordId: null, checkedAt: createdAt, licenseNote: null },
    quality: { status: 'validated', confidence: 'medium', notes: null }, contentHash: '', createdAt
  };
  revisionBase.contentHash = await sha256Json({ ...revisionBase, contentHash: '' });
  const family = {
    schemaVersion: 1, ingredientId, origin: 'user', currentRevisionId: ingredientRevisionId, status: 'active',
    createdAt: existing?.createdAt || createdAt, updatedAt: createdAt
  };
  registry.assert('ingredientRevision', revisionBase); registry.assert('ingredient', family);
  await repo.atomicPut({ ingredientRevisions: [revisionBase], ingredients: [family] });
  return { family, revision: revisionBase };
}

export async function archiveUserIngredient(ingredientId, { repo = repositories } = {}) {
  const family = await repo.get('ingredients', ingredientId);
  if (!family || family.origin !== 'user') throw new Error('Only personal ingredients can be archived');
  const next = { ...family, status: 'archived', updatedAt: nowIso() }; await repo.put('ingredients', next); return next;
}

async function prepareRecipeLines(inputLines, repo) {
  if (!Array.isArray(inputLines) || !inputLines.length) throw new Error('A recipe needs at least one ingredient');
  const revisionIds = inputLines.map(line => line.ingredientRevisionId);
  const revisions = await repo.getMany('ingredientRevisions', revisionIds); const byId = new Map(revisions.map(record => [record.ingredientRevisionId, record]));
  const lines = inputLines.map(line => {
    const revision = byId.get(line.ingredientRevisionId); if (!revision) throw new Error(`Ingredient revision ${line.ingredientRevisionId} does not exist`);
    if (revision.ingredientId !== line.ingredientId) throw new Error(`Ingredient/revision mismatch for ${line.ingredientId}`);
    const normalized = normalizeIngredientAmount(revision, line.amount, line.unit);
    return { ingredientId: line.ingredientId, ingredientRevisionId: line.ingredientRevisionId, amount: Number(line.amount), unit: line.unit, ...normalized, optional: Boolean(line.optional), notesKey: null };
  });
  return { lines, byId };
}

export async function saveUserRecipe(input, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const existing = input.recipeId ? await repo.get('recipes', input.recipeId) : null;
  if (existing && existing.origin !== 'user') throw new Error('Base recipes cannot be edited');
  const previous = existing ? await repo.get('recipeVersions', existing.currentVersionId) : null;
  const recipeId = existing?.recipeId || `urec_${slug(input.titleIt || input.titleEn, 'recipe')}_${suffix()}`;
  const versionNumber = (previous?.versionNumber || 0) + 1; const createdAt = nowIso();
  const recipeVersionId = `${recipeId}_v${versionNumber}_${suffix().slice(0, 5)}`;
  const { lines, byId } = await prepareRecipeLines(input.ingredientLines, repo);
  const calculatedNutrition = calculateRecipeNutrition(lines, byId); const allergenIds = deriveAllergens(lines, byId);
  const ingredientNames = [...byId.values()].flatMap(revision => Object.values(revision.i18n).flatMap(text => [text.name, ...(text.aliases || [])]));
  const tags = {
    families: cleanList(input.families), cuisines: cleanList(input.cuisines), diet: cleanList(input.diet), flavor: cleanList(input.flavor), practical: cleanList(input.practicalTags)
  };
  for (const key of Object.keys(tags)) if (!tags[key].length) delete tags[key];
  const searchTokens = unique([
    ...splitTokens(input.titleIt), ...splitTokens(input.titleEn), ...ingredientNames.flatMap(splitTokens),
    ...Object.values(tags).flatMap(values => values.flatMap(splitTokens))
  ]).sort();
  const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
  const version = {
    schemaVersion: 1, recipeVersionId, recipeId, versionNumber, supersedesVersionId: previous?.recipeVersionId || null, origin: 'user', catalogVersion: null,
    i18n: {
      it: { title: String(input.titleIt || input.titleEn || '').trim(), description: String(input.descriptionIt || '').trim(), instructions: unique(input.instructionsIt || []) },
      en: { title: String(input.titleEn || input.titleIt || '').trim(), description: String(input.descriptionEn || '').trim(), instructions: unique(input.instructionsEn || input.instructionsIt || []) }
    },
    servingCount: 1, mealArchetypes: unique(input.mealArchetypes || []), ingredientLines: lines, calculatedNutrition,
    practical: {
      prepMinutes: Number(input.prepMinutes || 0), cookMinutes: Number(input.cookMinutes || 0), reheatingRequired: Boolean(input.reheatingRequired),
      coldSuitable: Boolean(input.coldSuitable), portable: Boolean(input.portable), fridgeRequired: Boolean(input.fridgeRequired),
      freezerSuitable: Boolean(input.freezerSuitable), mealPrepSuitable: Boolean(input.mealPrepSuitable),
      finalWeightG: input.finalWeightG ? Number(input.finalWeightG) : null, finalVolumeMl: input.finalVolumeMl ? Number(input.finalVolumeMl) : null,
      yieldNotes: String(input.yieldNotes || '').trim() || null
    },
    tags, allergenIds, searchTokens, calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '',
    generation: { jobId: null, pipelineVersion: 'user-authoring-1', sourceLocale: null, generatedAt: createdAt },
    quality: { status: 'validated', reviewNotes: null }, createdAt
  };
  version.contentHash = await sha256Json({ ...version, contentHash: '' });
  const family = { schemaVersion: 1, recipeId, origin: 'user', currentVersionId: recipeVersionId, status: 'active', createdAt: existing?.createdAt || createdAt, updatedAt: createdAt };
  registry.assert('recipeVersion', version); registry.assert('recipe', family);
  await repo.atomicPut({ recipeVersions: [version], recipes: [family] }); return { family, version };
}

export async function archiveUserRecipe(recipeId, { repo = repositories } = {}) {
  const family = await repo.get('recipes', recipeId); if (!family || family.origin !== 'user') throw new Error('Only personal recipes can be archived');
  const next = { ...family, status: 'archived', updatedAt: nowIso() }; await repo.put('recipes', next); return next;
}

export async function duplicateRecipeToDraft(recipeId, { repo = repositories } = {}) {
  const family = await repo.get('recipes', recipeId); if (!family) throw new Error('Recipe not found');
  const version = await repo.get('recipeVersions', family.currentVersionId); if (!version) throw new Error('Recipe version not found');
  return {
    titleIt: `${version.i18n.it.title} - copia`, titleEn: `${version.i18n.en.title} - copy`, descriptionIt: version.i18n.it.description || '', descriptionEn: version.i18n.en.description || '',
    instructionsIt: [...version.i18n.it.instructions], instructionsEn: [...version.i18n.en.instructions], mealArchetypes: [...version.mealArchetypes],
    ingredientLines: version.ingredientLines.map(line => ({ ingredientId: line.ingredientId, ingredientRevisionId: line.ingredientRevisionId, amount: line.amount, unit: line.unit, optional: line.optional })),
    prepMinutes: version.practical.prepMinutes, cookMinutes: version.practical.cookMinutes, reheatingRequired: version.practical.reheatingRequired,
    coldSuitable: version.practical.coldSuitable, portable: version.practical.portable, fridgeRequired: version.practical.fridgeRequired,
    freezerSuitable: Boolean(version.practical.freezerSuitable), mealPrepSuitable: version.practical.mealPrepSuitable,
    finalWeightG: version.practical.finalWeightG, finalVolumeMl: version.practical.finalVolumeMl, yieldNotes: version.practical.yieldNotes || '',
    families: (version.tags.families || []).join(', '), cuisines: (version.tags.cuisines || []).join(', '), diet: (version.tags.diet || []).join(', '), flavor: (version.tags.flavor || []).join(', '), practicalTags: (version.tags.practical || []).join(', ')
  };
}
