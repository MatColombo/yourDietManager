import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CALCULATION_ALGORITHM_VERSION, calculateRecipeNutrition, deriveAllergens, normalizeIngredientAmount } from '../../src/domain/nutritionCore.js';
import { exactRecipeSignature, jaccard, recipeIngredientSet, textTokens } from '../../src/corpus/corpusMath.js';
import { sha256Json } from '../../src/lib/crypto.js';

const FIXED_AT = '2026-09-16T00:00:00.000Z';
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const round1 = value => Math.round(Number(value) * 10) / 10;

function fail(message) { throw new Error(message); }
function ingredientSetKey(lines) { return [...new Set((lines || []).map(line => line.ingredientId))].sort().join('|'); }
function normalizeTitle(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function hashText(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function jobBand(jobId) {
  const match = String(jobId || '').match(/^phase-b-(breakfast|lunch|dinner|snack|mini_meal)-kcal-(\d+)-(\d+)$/);
  if (!match) fail(`Invalid Phase B job ${jobId}`);
  return { mealArchetype: match[1], minKcal: Number(match[2]), maxKcal: Number(match[3]) };
}
function productConceptSetKey(recipe, ingredientByRevisionId) {
  return [...new Set((recipe.ingredientLines || []).map(line => ingredientByRevisionId.get(line.ingredientRevisionId)?.productTaxonomy?.conceptId).filter(Boolean))].sort().join('|');
}
function practicalTags(practical) {
  const out = [];
  const total = Number(practical?.prepMinutes || 0) + Number(practical?.cookMinutes || 0);
  if (total <= 20) out.push('practical_quick');
  if (practical?.portable) out.push('practical_portable');
  if (practical?.coldSuitable) out.push('practical_cold_suitable');
  if (practical?.reheatingRequired) out.push('practical_reheatable');
  if (practical?.mealPrepSuitable) out.push('practical_meal_prep');
  if (!Number(practical?.cookMinutes || 0)) out.push('practical_no_cook');
  return [...new Set(out)].sort();
}
function dietTags(lines, ingredientByRevisionId) {
  const groups = new Set((lines || []).map(line => ingredientByRevisionId.get(line.ingredientRevisionId)?.taxonomy?.foodGroup).filter(Boolean));
  const meat = groups.has('food_group_meat') || groups.has('food_group_poultry');
  const fish = groups.has('food_group_fish_seafood');
  const egg = groups.has('food_group_eggs');
  const dairy = groups.has('food_group_cheese') || groups.has('food_group_dairy_milk_yogurt');
  const out = [];
  if (!meat && !fish) out.push('diet_vegetarian');
  if (!meat && !fish && !egg && !dairy) out.push('diet_vegan');
  if (!meat && fish) out.push('diet_pescatarian');
  return out.sort();
}
function buildSearchTokens(recipe, ingredientByRevisionId) {
  return [...new Set([
    recipe.i18n?.it?.title, recipe.i18n?.en?.title,
    ...(recipe.ingredientLines || []).flatMap(line => {
      const revision = ingredientByRevisionId.get(line.ingredientRevisionId);
      return [revision?.i18n?.it?.name, revision?.i18n?.en?.name];
    }),
    ...Object.values(recipe.tags || {}).flat()
  ].filter(Boolean).flatMap(textTokens))].sort();
}
function applyPresentation(base, semanticRow) {
  const next = structuredClone(base);
  const it = semanticRow?.proposedPresentation?.titleIt;
  const en = semanticRow?.proposedPresentation?.titleEn;
  if (it) next.i18n.it.title = it;
  if (en) next.i18n.en.title = en;
  next.i18n.it.description = 'Ricetta a porzione singola con ingredienti in quantità fisse.';
  next.i18n.en.description = 'Single-serving recipe with fixed ingredient quantities.';
  return next;
}
function findTargetIndex(recipe, row, target, ingredientByRevisionId) {
  const reason = (row.reasons || []).find(item => item.code === target.reasonCode);
  return (recipe.ingredientLines || []).findIndex(line => ingredientByRevisionId.get(line.ingredientRevisionId)?.i18n?.en?.name === reason?.detail);
}
function candidateCombos(recipe, row, roleById, ingredientByRevisionId) {
  const targets = [];
  for (const target of row.patchTargets || []) {
    const index = findTargetIndex(recipe, row, target, ingredientByRevisionId);
    if (index < 0) fail(`Repair target ${target.reasonCode} not found on ${row.recipeVersionId}`);
    const line = recipe.ingredientLines[index];
    const role = roleById.get(target.targetRoleId);
    if (!role) fail(`Unknown repair role ${target.targetRoleId}`);
    const amount = Number(line.amount);
    const candidates = (role.ingredientRevisionIds || []).filter(id => id !== line.ingredientRevisionId).filter(id => {
      const revision = ingredientByRevisionId.get(id);
      if (!revision) return false;
      if ((recipe.ingredientLines || []).some((other, otherIndex) => otherIndex !== index && other.ingredientId === revision.ingredientId)) return false;
      return amount >= Number(role.portionG?.min ?? 0) && amount <= Number(role.portionG?.max ?? Infinity);
    }).sort();
    targets.push({ index, roleId: target.targetRoleId, candidates });
  }
  let combos = [[]];
  for (const target of targets) {
    const next = [];
    for (const combo of combos) for (const id of target.candidates) next.push([...combo, id]);
    combos = next;
  }
  return { targets, combos };
}
async function finalizeVersion(version, ingredientByRevisionId, registry) {
  const next = structuredClone(version);
  next.searchTokens = buildSearchTokens(next, ingredientByRevisionId);
  next.contentHash = await sha256Json({ ...next, contentHash: '' });
  if (registry) registry.assert('recipeVersion', next);
  return next;
}
async function repairVersion({ base, row, semanticRow, roleById, ingredientByRevisionId, baselineSets, registry }) {
  let version = applyPresentation(base, semanticRow);
  if (row.actionClass === 'PATCH_METHOD_ONLY') {
    if (row.methodPatch?.minimumCookMinutes) version.practical.cookMinutes = Math.max(Number(version.practical.cookMinutes || 0), Number(row.methodPatch.minimumCookMinutes));
    version.tags = { ...version.tags, practical: practicalTags(version.practical), diet: dietTags(version.ingredientLines, ingredientByRevisionId) };
    version.generation = { ...version.generation, pipelineVersion: 't4e-method-repair-1' };
    return { version: await finalizeVersion(version, ingredientByRevisionId, registry), candidateCount: 1, replacementIds: [] };
  }
  if (row.actionClass === 'CONVERT_ARCHETYPE') {
    version.generation = { ...version.generation, pipelineVersion: 't4e-archetype-conversion-1' };
    version.tags = { ...version.tags, families: ['recipe_family_smoothie'], practical: practicalTags(version.practical), diet: dietTags(version.ingredientLines, ingredientByRevisionId) };
    return { version: await finalizeVersion(version, ingredientByRevisionId, registry), candidateCount: 0, replacementIds: [] };
  }
  const { targets, combos } = candidateCombos(version, row, roleById, ingredientByRevisionId);
  const band = jobBand(row.energyBandJobId);
  let candidateCount = 0;
  let chosen = null;
  for (const combo of combos) {
    const lines = version.ingredientLines.map(line => ({ ...line }));
    for (let i = 0; i < targets.length; i += 1) {
      const index = targets[i].index;
      const revision = ingredientByRevisionId.get(combo[i]);
      const normalized = normalizeIngredientAmount(revision, Number(lines[index].amount), lines[index].unit);
      lines[index] = { ...lines[index], ingredientId: revision.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, ...normalized };
    }
    const key = ingredientSetKey(lines);
    if ((baselineSets.get(key) || []).some(id => id !== row.recipeVersionId)) continue;
    const used = new Map(lines.map(line => [line.ingredientRevisionId, ingredientByRevisionId.get(line.ingredientRevisionId)]));
    const nutrition = calculateRecipeNutrition(lines, used);
    if (nutrition.energyKcal < band.minKcal || nutrition.energyKcal > band.maxKcal) continue;
    candidateCount += 1;
    if (!chosen) chosen = { lines, nutrition, allergenIds: deriveAllergens(lines, used), replacementIds: combo };
  }
  if (!chosen) fail(`No deterministic local repair for ${row.recipeVersionId}`);
  version.ingredientLines = chosen.lines;
  version.calculatedNutrition = chosen.nutrition;
  version.allergenIds = chosen.allergenIds;
  if (row.methodPatch?.minimumCookMinutes) version.practical.cookMinutes = Math.max(Number(version.practical.cookMinutes || 0), Number(row.methodPatch.minimumCookMinutes));
  version.tags = { ...version.tags, diet: dietTags(version.ingredientLines, ingredientByRevisionId), practical: practicalTags(version.practical) };
  version.generation = { ...version.generation, pipelineVersion: 't4e-deterministic-repair-1' };
  version.inputDigest = await sha256Json({
    calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION,
    ingredientLines: version.ingredientLines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit }))
  });
  return { version: await finalizeVersion(version, ingredientByRevisionId, registry), candidateCount, replacementIds: chosen.replacementIds };
}
async function compileReplacement(candidate, ingredientByRevisionId, registry) {
  const lines = (candidate.ingredientLines || []).map(line => {
    const revision = ingredientByRevisionId.get(line.ingredientRevisionId);
    if (!revision) fail(`Replacement references unknown IngredientRevision ${line.ingredientRevisionId}`);
    const normalized = normalizeIngredientAmount(revision, Number(line.amountG), 'g');
    return { ingredientId: revision.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, amount: Number(line.amountG), unit: 'g', ...normalized, optional: false, notesKey: null };
  });
  const used = new Map(lines.map(line => [line.ingredientRevisionId, ingredientByRevisionId.get(line.ingredientRevisionId)]));
  const nutrition = calculateRecipeNutrition(lines, used);
  const allergenIds = deriveAllergens(lines, used);
  const digest = hashText(`t4e:${candidate.proposalRecipeId}`);
  const recipeId = `rec_t4e_${digest.slice(0, 20)}`;
  const recipeVersionId = `recver_t4e_${digest.slice(0, 24)}_v1`;
  const practical = {
    ...structuredClone(candidate.practical),
    finalWeightG: round1(lines.reduce((sum, line) => sum + Number(line.normalizedAmount || 0), 0)),
    finalVolumeMl: null,
    yieldNotes: 'T4-C fixed single-serving replacement; no workflow amount fitting.'
  };
  const tags = { ...structuredClone(candidate.tags), diet: dietTags(lines, ingredientByRevisionId), practical: practicalTags(practical) };
  const i18n = {
    it: { title: candidate.i18n.it.title, description: candidate.i18n.it.description || '', instructions: candidate.method.it },
    en: { title: candidate.i18n.en.title, description: candidate.i18n.en.description || '', instructions: candidate.method.en }
  };
  const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
  let version = {
    schemaVersion: 1, recipeVersionId, recipeId, versionNumber: 1, supersedesVersionId: null, origin: 'base', catalogVersion: '1.3.0-dev-t4e', i18n,
    servingCount: 1, mealArchetypes: [candidate.mealArchetype], ingredientLines: lines, calculatedNutrition: nutrition, practical, tags, allergenIds,
    searchTokens: [], calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '',
    generation: { jobId: candidate.replacementJobId, candidateId: candidate.proposalRecipeId, pipelineVersion: 't4c-chat-authored-replacement-1', sourceLocale: 'it', generatedAt: FIXED_AT },
    quality: { status: 'validated', reviewNotes: candidate.culinaryReview?.notes || 'T4-C approved.' }, createdAt: FIXED_AT
  };
  version = await finalizeVersion(version, ingredientByRevisionId, registry);
  const family = { schemaVersion: 1, recipeId, origin: 'base', currentVersionId: recipeVersionId, status: 'active', createdAt: FIXED_AT, updatedAt: FIXED_AT };
  if (registry) registry.assert('recipe', family);
  return { version, family };
}
function duplicateGroups(map) {
  return [...map.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, count: rows.length, excess: rows.length - 1, recipeVersionIds: rows.map(row => row.recipeVersionId), titlesIt: rows.map(row => row.i18n?.it?.title), meals: rows.map(row => row.mealArchetypes || []) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function simulateT4EFinalCorpus({ root = process.cwd(), baseline, registry = null } = {}) {
  if (!baseline) fail('T4-E simulation requires a loaded baseline');
  const active = path.join(root, 'data-proposals', 'active');
  const [ingredientProposal, recipeSemantic, reworkPlan, rolePools, generationBatch] = await Promise.all([
    readJson(path.join(active, 'ingredient-semantic-consolidation-round1', 'ingredient-semantic-proposal.json')),
    readJson(path.join(active, 'recipe-semantic-consolidation-round1', 'recipe-semantic-proposal.json')),
    readJson(path.join(active, 'recipe-rework-planning-round1', 'recipe-rework-plan.json')),
    readJson(path.join(active, 'culinary-generation-policy-v2', 'role-pools-v2.json')),
    readJson(path.join(active, 'recipe-generation-replacements-round1', 'recipe-proposals.json'))
  ]);

  const semanticIngredientRevisions = structuredClone(baseline.ingredientRevisions);
  const semanticIngredientById = new Map(semanticIngredientRevisions.map(row => [row.ingredientRevisionId, row]));
  for (const change of ingredientProposal.ingredientChanges || []) {
    const revision = semanticIngredientById.get(change.ingredientRevisionId);
    if (!revision || revision.contentHash !== change.expectedContentHash) fail(`T4-E stale ingredient semantic change ${change.ingredientRevisionId}`);
    revision.productTaxonomy = { categoryId: change.proposed.categoryId, subcategoryId: change.proposed.subcategoryId, conceptId: change.proposed.conceptId };
    revision.contentHash = await sha256Json({ ...revision, contentHash: '' });
  }
  if (registry) for (const revision of semanticIngredientRevisions) registry.assert('ingredientRevision', revision);

  const baseById = new Map(baseline.recipeVersions.map(row => [row.recipeVersionId, row]));
  const semanticById = new Map((recipeSemantic.recipeReviews || []).map(row => [row.recipeVersionId, row]));
  const reworkById = new Map((reworkPlan.reworkPlans || []).map(row => [row.recipeVersionId, row]));
  const roleById = new Map((rolePools.roles || []).map(row => [row.roleId, row]));
  const baselineSets = new Map();
  for (const recipe of baseline.recipeVersions) {
    const key = ingredientSetKey(recipe.ingredientLines);
    if (!baselineSets.has(key)) baselineSets.set(key, []);
    baselineSets.get(key).push(recipe.recipeVersionId);
  }

  const finalVersions = [];
  const finalFamilies = [];
  const baselineFamilyById = new Map((baseline.recipeFamilies || []).map(row => [row.recipeId, row]));
  const sourceCounts = { KEEP_RENAME: 0, REWORK_LOCAL_REPAIR: 0, REWORK_ARCHETYPE_CONVERSION: 0, T4C_REPLACEMENT: 0 };
  const repairReplay = [];
  const presentationReviewIds = [];
  for (const recipe of baseline.recipeVersions) {
    const semantic = semanticById.get(recipe.recipeVersionId);
    if (!semantic) fail(`T4-E missing semantic decision ${recipe.recipeVersionId}`);
    if (semantic.decision === 'RETIRE' || semantic.decision === 'CONSOLIDATE_DUPLICATE') continue;
    if (semantic.decision === 'KEEP_RENAME') {
      const version = await finalizeVersion(applyPresentation(recipe, semantic), semanticIngredientById, registry);
      finalVersions.push(version); sourceCounts.KEEP_RENAME += 1;
      const family = structuredClone(baselineFamilyById.get(version.recipeId)); family.currentVersionId = version.recipeVersionId; family.updatedAt = FIXED_AT;
      if (registry) registry.assert('recipe', family); finalFamilies.push(family);
      continue;
    }
    const rework = reworkById.get(recipe.recipeVersionId);
    if (!rework) fail(`T4-E missing rework plan ${recipe.recipeVersionId}`);
    if (rework.actionClass === 'REBUILD_REPLACEMENT') continue;
    const repaired = await repairVersion({ base: recipe, row: rework, semanticRow: semantic, roleById, ingredientByRevisionId: semanticIngredientById, baselineSets, registry });
    finalVersions.push(repaired.version);
    if (rework.actionClass === 'CONVERT_ARCHETYPE') sourceCounts.REWORK_ARCHETYPE_CONVERSION += 1;
    else sourceCounts.REWORK_LOCAL_REPAIR += 1;
    if (rework.actionClass !== 'PATCH_METHOD_ONLY') presentationReviewIds.push(repaired.version.recipeVersionId);
    repairReplay.push({ recipeVersionId: recipe.recipeVersionId, actionClass: rework.actionClass, declaredCandidateCount: Number(rework.strictRepairCandidateCount || 0), replayCandidateCount: repaired.candidateCount, candidateCountMatches: Number(rework.strictRepairCandidateCount || 0) === repaired.candidateCount, replacementIngredientRevisionIds: repaired.replacementIds });
    const family = structuredClone(baselineFamilyById.get(repaired.version.recipeId)); family.currentVersionId = repaired.version.recipeVersionId; family.updatedAt = FIXED_AT;
    if (registry) registry.assert('recipe', family); finalFamilies.push(family);
  }
  for (const candidate of generationBatch.recipes || []) {
    const compiled = await compileReplacement(candidate, semanticIngredientById, registry);
    finalVersions.push(compiled.version); finalFamilies.push(compiled.family); sourceCounts.T4C_REPLACEMENT += 1;
  }
  finalVersions.sort((a, b) => a.recipeVersionId.localeCompare(b.recipeVersionId));
  finalFamilies.sort((a, b) => a.recipeId.localeCompare(b.recipeId));

  const baselineJobCounts = new Map();
  const finalJobCounts = new Map();
  for (const row of baseline.recipeVersions) baselineJobCounts.set(row.generation?.jobId, (baselineJobCounts.get(row.generation?.jobId) || 0) + 1);
  for (const row of finalVersions) finalJobCounts.set(row.generation?.jobId, (finalJobCounts.get(row.generation?.jobId) || 0) + 1);
  const energyBands = [...baselineJobCounts.keys()].sort().map(jobId => ({ jobId, baseline: baselineJobCounts.get(jobId) || 0, simulated: finalJobCounts.get(jobId) || 0, exact: (baselineJobCounts.get(jobId) || 0) === (finalJobCounts.get(jobId) || 0) }));

  const signatureMap = new Map();
  const ingredientSetMap = new Map();
  const titleMap = new Map();
  const semanticMap = new Map();
  for (const recipe of finalVersions) {
    const signature = exactRecipeSignature(recipe); if (!signatureMap.has(signature)) signatureMap.set(signature, []); signatureMap.get(signature).push(recipe);
    const set = ingredientSetKey(recipe.ingredientLines); if (!ingredientSetMap.has(set)) ingredientSetMap.set(set, []); ingredientSetMap.get(set).push(recipe);
    const title = normalizeTitle(recipe.i18n?.it?.title); if (!titleMap.has(title)) titleMap.set(title, []); titleMap.get(title).push(recipe);
    const conceptSet = productConceptSetKey(recipe, semanticIngredientById);
    for (const meal of recipe.mealArchetypes || []) { const key = `${meal}::${conceptSet}`; if (!semanticMap.has(key)) semanticMap.set(key, []); semanticMap.get(key).push(recipe); }
  }
  const exactSignatureDuplicates = duplicateGroups(signatureMap);
  const exactIngredientSetDuplicates = duplicateGroups(ingredientSetMap);
  const titleDuplicateGroups = duplicateGroups(titleMap);
  const semanticConceptDuplicateGroups = duplicateGroups(semanticMap);

  const nearDuplicatePairs = [];
  for (let i = 0; i < finalVersions.length; i += 1) {
    const a = finalVersions[i]; const aSet = recipeIngredientSet(a);
    for (let j = i + 1; j < finalVersions.length; j += 1) {
      const b = finalVersions[j];
      if (!(a.mealArchetypes || []).some(meal => (b.mealArchetypes || []).includes(meal))) continue;
      const similarity = jaccard(aSet, recipeIngredientSet(b));
      if (similarity >= 0.82 && exactRecipeSignature(a) !== exactRecipeSignature(b)) nearDuplicatePairs.push({ a: a.recipeVersionId, b: b.recipeVersionId, similarity: round1(similarity * 100) / 100, titleA: a.i18n?.it?.title, titleB: b.i18n?.it?.title });
    }
  }

  const dietCounts = { vegetarian: 0, vegan: 0, pescatarian: 0 };
  const practicalCounts = { quick: 0, noCook: 0, cold: 0 };
  for (const recipe of finalVersions) {
    if ((recipe.tags?.diet || []).includes('diet_vegetarian')) dietCounts.vegetarian += 1;
    if ((recipe.tags?.diet || []).includes('diet_vegan')) dietCounts.vegan += 1;
    if ((recipe.tags?.diet || []).includes('diet_pescatarian')) dietCounts.pescatarian += 1;
    if ((recipe.tags?.practical || []).includes('practical_quick')) practicalCounts.quick += 1;
    if ((recipe.tags?.practical || []).includes('practical_no_cook')) practicalCounts.noCook += 1;
    if ((recipe.tags?.practical || []).includes('practical_cold_suitable')) practicalCounts.cold += 1;
  }

  const repairCountDrift = repairReplay.filter(row => !row.candidateCountMatches);
  const semanticDuplicateExcess = semanticConceptDuplicateGroups.reduce((sum, row) => sum + row.excess, 0);
  const titleDuplicateExcess = titleDuplicateGroups.reduce((sum, row) => sum + row.excess, 0);
  const technicalPass = finalVersions.length === baseline.recipeVersions.length
    && energyBands.length === 30 && energyBands.every(row => row.exact)
    && exactSignatureDuplicates.length === 0 && nearDuplicatePairs.length === 0;
  const semanticPass = semanticConceptDuplicateGroups.length === 0 && titleDuplicateGroups.length === 0 && exactIngredientSetDuplicates.length === 0 && presentationReviewIds.length === 0;

  return {
    finalRecipeVersions: finalVersions,
    finalRecipeFamilies: finalFamilies,
    semanticIngredientRevisions,
    report: {
      schemaVersion: 1,
      simulatedAt: FIXED_AT,
      finalRecipeCount: finalVersions.length,
      finalRecipeFamilyCount: finalFamilies.length,
      sourceCounts,
      energyBands,
      dietCounts,
      practicalCounts,
      repairReplay: { total: repairReplay.length, countDrift: repairCountDrift.length, rows: repairReplay },
      duplicates: {
        exactRecipeSignatureGroups: exactSignatureDuplicates,
        nearDuplicatePairs,
        exactIngredientSetGroups: exactIngredientSetDuplicates,
        semanticConceptGroups: semanticConceptDuplicateGroups,
        semanticConceptExcess: semanticDuplicateExcess,
        titleGroups: titleDuplicateGroups,
        titleExcess: titleDuplicateExcess
      },
      editorial: { presentationReviewCount: presentationReviewIds.length, presentationReviewRecipeVersionIds: presentationReviewIds },
      promotionPreflight: {
        technicalPass,
        semanticPass,
        promotionEligible: technicalPass && semanticPass,
        additionalReplacementNeed: semanticDuplicateExcess,
        blockers: [
          ...(semanticConceptDuplicateGroups.length ? [`semantic_concept_duplicate_groups=${semanticConceptDuplicateGroups.length}`] : []),
          ...(titleDuplicateGroups.length ? [`duplicate_title_groups=${titleDuplicateGroups.length}`] : []),
          ...(exactIngredientSetDuplicates.length ? [`exact_ingredient_set_groups=${exactIngredientSetDuplicates.length}`] : []),
          ...(presentationReviewIds.length ? [`presentation_review=${presentationReviewIds.length}`] : [])
        ],
        warnings: repairCountDrift.length ? [`repair_candidate_count_drift=${repairCountDrift.length}`] : []
      }
    }
  };
}
