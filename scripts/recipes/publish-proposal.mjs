import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { compareSemver } from '../../src/lib/semver.js';
import { CALCULATION_ALGORITHM_VERSION, calculateRecipeNutrition, deriveAllergens, normalizeIngredientAmount } from '../../src/domain/nutritionCore.js';
import { assertRecipeTitle } from '../../src/domain/recipePresentation.js';
import { exactRecipeSignature, jaccard, recipeIngredientSet, textTokens, unique } from '../../src/corpus/corpusMath.js';
import { sha256Json, sha256Text } from '../../src/lib/crypto.js';
import { readJson, loadLocalCatalog } from '../corpus/io-lib.mjs';
import { publishCatalogRelease } from '../corpus/release-lib.mjs';
import { simulateT4EFinalCorpus } from '../data-proposals/t4e-corpus-simulation.mjs';
import { assertReferenceData, assertSemanticReferences } from '../../src/services/referenceDataService.js';
import { validateProductFoodAssignment } from '../../src/domain/productFoodTaxonomy.js';

const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, 'public/data');
const RECIPE_PROPOSAL_DIR = process.env.YDM_RECIPE_PROPOSAL_DIR ? path.resolve(process.env.YDM_RECIPE_PROPOSAL_DIR) : path.join(ROOT, 'data-proposals/recipes');
const ACTIVE_PROPOSAL_DIR = path.join(ROOT, 'data-proposals/active');
const POLICY_DIR = path.join(ROOT, 'data-proposals/active/culinary-generation-policy-v2');
const OUTPUT = process.env.YDM_RECIPE_PUBLISH_OUTPUT ? path.resolve(process.env.YDM_RECIPE_PUBLISH_OUTPUT) : path.join(ROOT, 'corpus/staging/runtime/recipe-publish-e2e');
const mode = process.argv.includes('--publish') ? 'publish' : 'check';

const T4E_RECIPE_FAMILY_TERMS = {
  recipe_family_snack: { it: 'Snack', en: 'Snack' },
  recipe_family_savory_snack: { it: 'Snack salato', en: 'Savory snack' },
  recipe_family_grain_salad: { it: 'Insalata di cereali', en: 'Grain salad' },
  recipe_family_frittata: { it: 'Frittata', en: 'Frittata' },
  recipe_family_breakfast_bowl: { it: 'Bowl da colazione', en: 'Breakfast bowl' }
};
function t4eRecipeFamilyTerm(termId, labels) {
  const now = '2026-09-16T12:00:00.000Z';
  return {
    schemaVersion: 1, termId, taxonomyId: 'recipe_family', origin: 'base', parentTermId: null,
    i18n: { it: { label: labels.it, description: '' }, en: { label: labels.en, description: '' } },
    aliases: { it: [], en: [] }, legacyKeys: [termId.replace(/^recipe_family_/, '')], status: 'active', supersedesTermId: null,
    provenance: { sourceType: 'curated', sourceLabel: 'T4E E2E closure', reference: null, rationale: 'Recipe-family term required by reviewed T4E recipes.' },
    searchTokens: unique(textTokens(`${labels.it} ${labels.en} ${termId}`)).sort(), createdAt: now, updatedAt: now
  };
}
async function readShards(dir, prefix) {
  const names = (await readdir(dir)).filter(name => name.startsWith(prefix) && name.endsWith('.json')).sort();
  const rows = [];
  for (const name of names) rows.push(...await readJson(path.join(dir, name)));
  return rows;
}

function fail(message) { throw new Error(`Recipe publish: ${message}`); }
function versionPath(version) { return `catalogs/${String(version).replace(/[^a-z0-9._-]+/gi, '-')}`; }
function normalizedTags(tags = {}) {
  const out = {};
  for (const key of ['families','cuisines','diet','flavor','practical','preparation']) {
    const values = unique(Array.isArray(tags[key]) ? tags[key] : []).sort();
    if (values.length) out[key] = values;
  }
  return out;
}
function sourceSearchTokens(recipe, revisions) {
  const values = [
    ...Object.values(recipe.i18n || {}).flatMap(text => [text.title, text.description, ...(text.instructions || [])]),
    ...revisions.flatMap(revision => Object.values(revision.i18n || {}).flatMap(text => [text.name, ...(text.aliases || [])])),
    ...Object.values(recipe.tags || {}).flatMap(value => Array.isArray(value) ? value : [])
  ];
  return unique(values.flatMap(textTokens)).sort();
}
function validateDietTags(tags, revisions, id) {
  const groups = new Set(revisions.map(revision => revision.taxonomy?.foodGroup));
  const diet = new Set(tags.diet || []);
  const meat = groups.has('food_group_meat') || groups.has('food_group_poultry');
  const fish = groups.has('food_group_fish_seafood');
  const animal = meat || fish || groups.has('food_group_eggs') || groups.has('food_group_dairy_milk_yogurt') || groups.has('food_group_cheese');
  if (diet.has('diet_vegan') && animal) fail(`${id}: vegan tag conflicts with animal ingredient`);
  if (diet.has('diet_vegetarian') && (meat || fish)) fail(`${id}: vegetarian tag conflicts with meat/fish`);
  if (diet.has('diet_pescatarian') && meat) fail(`${id}: pescatarian tag conflicts with meat/poultry`);
}
function roleFitsSlot(roleId, slot) { return slot.roleId === roleId || (slot.oneOfRoles || []).includes(roleId); }
function normalizeToken(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function semanticTokens(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean).flatMap(value => normalizeToken(value).split('_')).filter(Boolean))].sort();
}
function t4eProductTerm(raw) {
  const now = '2026-09-16T00:00:00.000Z';
  return {
    schemaVersion: 1,
    termId: raw.termId,
    taxonomyId: raw.taxonomyId,
    origin: 'base',
    parentTermId: raw.parentTermId,
    i18n: structuredClone(raw.i18n),
    aliases: structuredClone(raw.aliases || { it: [], en: [] }),
    legacyKeys: [],
    status: 'active',
    supersedesTermId: null,
    provenance: {
      sourceType: 'curated',
      sourceLabel: 'T4E ingredient semantic review',
      reference: null,
      rationale: 'One-shot semantic consolidation used by the development recipe catalog.'
    },
    searchTokens: semanticTokens(raw.termId, raw.i18n?.it?.label, raw.i18n?.en?.label, raw.aliases?.it, raw.aliases?.en),
    createdAt: now,
    updatedAt: now
  };
}
async function loadLegacyBaseline(currentManifest) {
  return {
    manifest: currentManifest,
    ingredientRevisions: await readShards(path.join(PUBLIC_DATA, 'ingredients'), 'ingredient-revisions-'),
    ingredientFamilies: await readShards(path.join(PUBLIC_DATA, 'ingredients'), 'ingredient-families-'),
    recipeVersions: await readShards(path.join(PUBLIC_DATA, 'recipes'), 'recipe-versions-'),
    recipeFamilies: await readShards(path.join(PUBLIC_DATA, 'recipes'), 'recipe-families-'),
    taxonomies: await readShards(path.join(PUBLIC_DATA, 'reference-data'), 'taxonomies-'),
    taxonomyTerms: await readShards(path.join(PUBLIC_DATA, 'reference-data'), 'taxonomy-terms-')
  };
}
async function loadT4ESeed(current, registry) {
  const baseline = await loadLegacyBaseline(current.manifest);
  if (baseline.ingredientRevisions.length !== 600 || baseline.recipeVersions.length !== 1800) {
    fail(`legacy development baseline must contain 600 ingredients and 1800 recipes; found ${baseline.ingredientRevisions.length}/${baseline.recipeVersions.length}`);
  }
  const simulated = await simulateT4EFinalCorpus({ root: ROOT, baseline, registry });
  if (!simulated.report?.promotionPreflight?.technicalPass) fail('T4-E source simulation is not technically valid');

  const termDoc = await readJson(path.join(ACTIVE_PROPOSAL_DIR, 'ingredient-semantic-consolidation-round1', 'proposed-product-terms.json'));
  const taxonomyTerms = structuredClone(baseline.taxonomyTerms);
  const termById = new Map(taxonomyTerms.map(term => [term.termId, term]));
  for (const raw of termDoc.terms || []) {
    const term = t4eProductTerm(raw);
    if (!termById.has(term.termId)) { taxonomyTerms.push(term); termById.set(term.termId, term); }
  }
  for (const [termId, labels] of Object.entries(T4E_RECIPE_FAMILY_TERMS)) {
    if (!termById.has(termId)) { const term = t4eRecipeFamilyTerm(termId, labels); taxonomyTerms.push(term); termById.set(termId, term); }
  }
  taxonomyTerms.sort((a,b)=>a.termId.localeCompare(b.termId));
  const index = assertReferenceData(baseline.taxonomies, taxonomyTerms, registry);

  const recipeVersions = structuredClone(simulated.finalRecipeVersions);
  for (const version of recipeVersions) {
    if ((version.tags?.families || []).includes('recipe_family_egg_plate')) {
      version.tags.families = unique(version.tags.families.map(id => id === 'recipe_family_egg_plate' ? 'recipe_family_egg_dish' : id)).sort();
      version.contentHash = await sha256Json({ ...version, contentHash: '' });
    }
  }
  for (const revision of simulated.semanticIngredientRevisions) validateProductFoodAssignment(index, revision);
  assertSemanticReferences({
    index,
    ingredientRevisions: simulated.semanticIngredientRevisions,
    recipeVersions,
    ingredientIds: baseline.ingredientFamilies.map(item => item.ingredientId)
  });
  return {
    manifest: current.manifest,
    taxonomies: baseline.taxonomies,
    taxonomyTerms,
    ingredientFamilies: baseline.ingredientFamilies,
    ingredientRevisions: simulated.semanticIngredientRevisions,
    recipeFamilies: simulated.finalRecipeFamilies,
    recipeVersions
  };
}

async function loadPolicy() {
  const [pools, archetypes] = await Promise.all([
    readJson(path.join(POLICY_DIR, 'role-pools-v2.json')),
    readJson(path.join(POLICY_DIR, 'archetypes-v2.json'))
  ]);
  return {
    roleById: new Map((pools.roles || []).map(role => [role.roleId, role])),
    archetypeById: new Map((archetypes.archetypes || []).map(item => [item.archetypeId, item]))
  };
}

function extendPolicy(policy, proposal, revisionById) {
  for (const raw of proposal.culinaryRoles || []) {
    if (!raw?.roleId) fail('culinaryRoles entries require roleId');
    const role = structuredClone(raw);
    const min = Number(role.portionG?.min); const def = Number(role.portionG?.default); const max = Number(role.portionG?.max);
    if (!(min >= 0 && def >= min && max >= def)) fail(`${role.roleId}: invalid portionG range`);
    role.ingredientRevisionIds = unique(role.ingredientRevisionIds || []).sort();
    for (const id of role.ingredientRevisionIds) if (!revisionById.has(id)) fail(`${role.roleId}: unknown ingredientRevisionId ${id}`);
    const old = policy.roleById.get(role.roleId);
    if (old && JSON.stringify(old) !== JSON.stringify(role)) fail(`culinary role collision ${role.roleId}`);
    if (!old) policy.roleById.set(role.roleId, role);
  }
  for (const raw of proposal.culinaryArchetypes || []) {
    if (!raw?.archetypeId) fail('culinaryArchetypes entries require archetypeId');
    const archetype = structuredClone(raw);
    if (!Array.isArray(archetype.mealArchetypes) || !archetype.mealArchetypes.length) fail(`${archetype.archetypeId}: mealArchetypes required`);
    if (!Array.isArray(archetype.slots) || !archetype.slots.length) fail(`${archetype.archetypeId}: slots required`);
    for (const [index, slot] of archetype.slots.entries()) {
      const roleIds = unique([slot.roleId, ...(slot.oneOfRoles || [])].filter(Boolean));
      if (!roleIds.length) fail(`${archetype.archetypeId}: slot ${index} requires roleId or oneOfRoles`);
      for (const roleId of roleIds) if (!policy.roleById.has(roleId)) fail(`${archetype.archetypeId}: unknown role ${roleId}`);
      const min = Number(slot.minG ?? 0); const max = Number(slot.maxG ?? Infinity);
      if (!(min >= 0 && max >= min)) fail(`${archetype.archetypeId}: invalid slot range ${index}`);
    }
    const old = policy.archetypeById.get(archetype.archetypeId);
    if (old && JSON.stringify(old) !== JSON.stringify(archetype)) fail(`culinary archetype collision ${archetype.archetypeId}`);
    if (!old) policy.archetypeById.set(archetype.archetypeId, archetype);
  }
}

async function applyProposal(corpus, proposal, catalogVersion, registry, policy) {
  if (!proposal) return { ...corpus, proposalRecipeIds: [], proposalIngredientIds: [] };
  if (proposal.schemaVersion !== 1) fail('catalog-proposal schemaVersion must be 1');
  if (!proposal.proposalId) fail('catalog-proposal requires proposalId');
  if (!proposal.generatedAt || Number.isNaN(Date.parse(proposal.generatedAt))) fail('catalog-proposal requires generatedAt date-time');

  const taxonomyTerms = [...corpus.taxonomyTerms];
  const termById = new Map(taxonomyTerms.map(term => [term.termId, term]));
  for (const term of proposal.taxonomyTerms || []) {
    registry.assert('taxonomyTerm', term);
    const old = termById.get(term.termId);
    if (old && JSON.stringify(old) !== JSON.stringify(term)) fail(`taxonomy term collision ${term.termId}`);
    if (!old) { taxonomyTerms.push(term); termById.set(term.termId, term); }
  }

  taxonomyTerms.sort((a,b)=>a.termId.localeCompare(b.termId));
  const referenceIndex = assertReferenceData(corpus.taxonomies, taxonomyTerms, registry);

  const ingredientFamilies = [...corpus.ingredientFamilies];
  const ingredientRevisions = [...corpus.ingredientRevisions];
  const familyById = new Map(ingredientFamilies.map(item => [item.ingredientId, item]));
  const revisionById = new Map(ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  extendPolicy(policy, proposal, revisionById);
  const { roleById, archetypeById } = policy;
  const proposedIngredientByAlias = new Map();
  const proposedRoles = new Map();
  const proposalIngredientIds = [];

  for (const item of proposal.ingredients || []) {
    if (!item.proposalIngredientId) fail('new ingredient requires proposalIngredientId');
    const semanticKey = `${proposal.proposalId}\n${item.proposalIngredientId}\n${item.i18n?.en?.name || item.i18n?.it?.name || ''}\n${item.basis?.state || ''}\n${item.source?.sourceRecordId || ''}`;
    const digest = await sha256Text(semanticKey);
    const ingredientId = item.ingredientId || `ing_ai_${digest.slice(0,20)}`;
    const ingredientRevisionId = item.ingredientRevisionId || `${ingredientId}_r1`;
    if (familyById.has(ingredientId) || revisionById.has(ingredientRevisionId)) fail(`new ingredient ID collision ${ingredientId}`);
    if (!item.source?.label || (!item.source?.reference && !item.source?.sourceRecordId)) fail(`${item.proposalIngredientId}: source label plus reference/sourceRecordId are required; nutrition must be source-backed`);
    if (!item.productTaxonomy?.categoryId || !item.productTaxonomy?.conceptId) fail(`${item.proposalIngredientId}: complete productTaxonomy is required`);
    const now = proposal.generatedAt;
    if (!item.display?.it?.variantLabel || !item.display?.en?.variantLabel) fail(`${item.proposalIngredientId}: bilingual display.variantLabel is required`);
    if (!item.safetyEvidence) fail(`${item.proposalIngredientId}: safetyEvidence is required`);
    if (!Array.isArray(item.culinaryRoleIds) || !item.culinaryRoleIds.length) fail(`${item.proposalIngredientId}: culinaryRoleIds is required`);
    for (const roleId of item.culinaryRoleIds) if (!roleById.has(roleId)) fail(`${item.proposalIngredientId}: unknown culinaryRoleId ${roleId}`);
    if (item.safetyEvidence.assessmentStatus !== 'reviewed' || item.safetyEvidence.compositionCompleteness !== 'complete') fail(`${item.proposalIngredientId}: new ingredients require reviewed, complete safetyEvidence`);
    const declaredAllergens = [...new Set(item.allergenIds || [])].sort();
    const reviewedAllergens = [...new Set(item.safetyEvidence.containsAllergenIds || [])].sort();
    if (JSON.stringify(declaredAllergens) !== JSON.stringify(reviewedAllergens)) fail(`${item.proposalIngredientId}: allergenIds must equal safetyEvidence.containsAllergenIds`);
    const revision = {
      schemaVersion: 2,
      ingredientRevisionId,
      ingredientId,
      revisionNumber: 1,
      origin: 'base',
      catalogVersion,
      i18n: item.i18n,
      basis: item.basis,
      nutrition: item.nutrition,
      taxonomy: item.taxonomy,
      allergenIds: item.allergenIds || [],
      conversions: item.conversions || [],
      source: item.source,
      quality: item.quality || { status: 'validated', confidence: 'medium', notes: 'Chat-authored ingredient proposal with explicit provenance.' },
      contentHash: '',
      createdAt: now,
      productTaxonomy: item.productTaxonomy,
      display: item.display,
      safetyEvidence: item.safetyEvidence
    };
    revision.contentHash = await sha256Json({ ...revision, contentHash: '' });
    const family = { schemaVersion: 1, ingredientId, origin: 'base', currentRevisionId: ingredientRevisionId, status: 'active', createdAt: now, updatedAt: now };
    registry.assert('ingredientRevision', revision); registry.assert('ingredient', family);
    validateProductFoodAssignment(referenceIndex, revision);
    ingredientFamilies.push(family); ingredientRevisions.push(revision);
    familyById.set(ingredientId, family); revisionById.set(ingredientRevisionId, revision);
    proposedIngredientByAlias.set(item.proposalIngredientId, revision);
    proposedRoles.set(ingredientRevisionId, new Set(item.culinaryRoleIds || []));
    for (const roleId of item.culinaryRoleIds || []) {
      const role = roleById.get(roleId);
      role.ingredientRevisionIds = unique([...(role.ingredientRevisionIds || []), ingredientRevisionId]).sort();
    }
    proposalIngredientIds.push(ingredientId);
  }

  const recipeFamilies = [...corpus.recipeFamilies];
  const recipeVersions = [...corpus.recipeVersions];
  const existingSignatures = new Set(recipeVersions.map(exactRecipeSignature));
  const existingItTitles = new Set(recipeVersions.map(version => String(version.i18n?.it?.title || '').trim().toLowerCase()).filter(Boolean));
  const existingEnTitles = new Set(recipeVersions.map(version => String(version.i18n?.en?.title || '').trim().toLowerCase()).filter(Boolean));
  const proposalRecipeIds = [];

  for (const item of proposal.recipes || []) {
    if (!item.proposalRecipeId) fail('recipe requires proposalRecipeId');
    const meals = unique(item.mealArchetypes || (item.mealArchetype ? [item.mealArchetype] : []));
    if (!meals.length) fail(`${item.proposalRecipeId}: mealArchetypes required`);
    const archetype = archetypeById.get(item.culinaryArchetypeId);
    if (!archetype) fail(`${item.proposalRecipeId}: unknown culinaryArchetypeId ${item.culinaryArchetypeId}`);
    if (!meals.some(meal => (archetype.mealArchetypes || []).includes(meal))) fail(`${item.proposalRecipeId}: archetype/meal mismatch`);
    const titleIt = assertRecipeTitle(item.i18n?.it?.title);
    const titleEn = assertRecipeTitle(item.i18n?.en?.title);
    if (existingItTitles.has(titleIt.toLowerCase()) || existingEnTitles.has(titleEn.toLowerCase())) fail(`${item.proposalRecipeId}: duplicate title`);
    const instructionsIt = item.i18n?.it?.instructions || item.method?.it || [];
    const instructionsEn = item.i18n?.en?.instructions || item.method?.en || [];
    if (!instructionsIt.length || !instructionsEn.length) fail(`${item.proposalRecipeId}: bilingual instructions required`);

    const usedSlots = new Set(); const lines = []; const usedRevisions = [];
    for (const line of item.ingredientLines || []) {
      const revision = line.proposalIngredientId ? proposedIngredientByAlias.get(line.proposalIngredientId) : revisionById.get(line.ingredientRevisionId);
      if (!revision) fail(`${item.proposalRecipeId}: unknown ingredient ${line.ingredientRevisionId || line.proposalIngredientId}`);
      const role = roleById.get(line.roleId);
      if (!role) fail(`${item.proposalRecipeId}: unknown role ${line.roleId}`);
      const isProposed = proposedRoles.has(revision.ingredientRevisionId);
      const roleAllowed = isProposed ? proposedRoles.get(revision.ingredientRevisionId).has(line.roleId) : (role.ingredientRevisionIds || []).includes(revision.ingredientRevisionId);
      if (!roleAllowed) fail(`${item.proposalRecipeId}: role membership mismatch ${line.roleId}/${revision.ingredientRevisionId}`);
      const amount = Number(line.amountG);
      if (!(amount > 0)) fail(`${item.proposalRecipeId}: invalid amount`);
      const slotIndex = (archetype.slots || []).findIndex((slot, index) => !usedSlots.has(index) && roleFitsSlot(line.roleId, slot) && amount >= Number(slot.minG || 0) && amount <= Number(slot.maxG || Infinity));
      if (slotIndex < 0) fail(`${item.proposalRecipeId}: no compatible slot for ${line.roleId} ${amount}g`);
      usedSlots.add(slotIndex);
      const normalized = normalizeIngredientAmount(revision, amount, 'g');
      lines.push({ ingredientId: revision.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, amount, unit: 'g', ...normalized, optional: false, notesKey: null });
      usedRevisions.push(revision);
    }
    if (!lines.length) fail(`${item.proposalRecipeId}: at least one ingredient is required`);
    if (new Set(lines.map(line => line.ingredientRevisionId)).size !== lines.length) fail(`${item.proposalRecipeId}: duplicate ingredient line`);
    for (let index = 0; index < (archetype.slots || []).length; index += 1) if (!archetype.slots[index].optional && !usedSlots.has(index)) fail(`${item.proposalRecipeId}: missing required archetype slot ${index}`);

    const revisionMap = new Map(usedRevisions.map(revision => [revision.ingredientRevisionId, revision]));
    const nutrition = calculateRecipeNutrition(lines, revisionMap);
    const allergenIds = deriveAllergens(lines, revisionMap);
    const tags = normalizedTags(item.tags || {});
    validateDietTags(tags, usedRevisions, item.proposalRecipeId);
    const practical = {
      prepMinutes: Math.max(0, Math.round(Number(item.practical?.prepMinutes || 0))),
      cookMinutes: Math.max(0, Math.round(Number(item.practical?.cookMinutes || 0))),
      reheatingRequired: Boolean(item.practical?.reheatingRequired),
      coldSuitable: Boolean(item.practical?.coldSuitable),
      portable: Boolean(item.practical?.portable),
      fridgeRequired: Boolean(item.practical?.fridgeRequired),
      freezerSuitable: Boolean(item.practical?.freezerSuitable),
      mealPrepSuitable: Boolean(item.practical?.mealPrepSuitable),
      finalWeightG: lines.every(line => line.normalizedUnit === 'g') ? Math.round(lines.reduce((sum, line) => sum + line.normalizedAmount, 0) * 100) / 100 : null,
      finalVolumeMl: null,
      yieldNotes: item.practical?.yieldNotes || 'One fixed standard serving.'
    };
    const identity = await sha256Text(`${proposal.proposalId}\n${item.proposalRecipeId}\n${lines.map(line => `${line.ingredientRevisionId}:${line.normalizedAmount}`).sort().join('|')}`);
    const recipeId = item.recipeId || `rec_ai_${identity.slice(0,20)}`;
    const recipeVersionId = item.recipeVersionId || `recver_ai_${identity.slice(0,24)}_v1`;
    if (recipeFamilies.some(family => family.recipeId === recipeId) || recipeVersions.some(version => version.recipeVersionId === recipeVersionId)) fail(`${item.proposalRecipeId}: recipe ID collision`);
    const inputDigest = await sha256Json({ calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
    const version = {
      schemaVersion: 1, recipeVersionId, recipeId, versionNumber: 1, supersedesVersionId: null, origin: 'base', catalogVersion,
      i18n: {
        it: { title: titleIt, description: item.i18n?.it?.description || '', instructions: instructionsIt },
        en: { title: titleEn, description: item.i18n?.en?.description || '', instructions: instructionsEn }
      },
      servingCount: 1, mealArchetypes: meals, ingredientLines: lines, calculatedNutrition: nutrition, practical, tags, allergenIds, searchTokens: [],
      calculationAlgorithmVersion: CALCULATION_ALGORITHM_VERSION, inputDigest, contentHash: '',
      generation: { jobId: proposal.proposalId, candidateId: item.proposalRecipeId, pipelineVersion: 'chat-recipe-proposal-1', sourceLocale: 'it', generatedAt: proposal.generatedAt },
      quality: { status: 'validated', reviewNotes: item.culinaryReview?.notes || 'Chat-authored recipe proposal validated by deterministic publisher.' },
      createdAt: proposal.generatedAt
    };
    version.searchTokens = sourceSearchTokens(version, usedRevisions);
    const signature = exactRecipeSignature(version);
    if (existingSignatures.has(signature)) fail(`${item.proposalRecipeId}: exact recipe signature duplicate`);
    const proposedSet = recipeIngredientSet(version);
    for (const existing of recipeVersions) {
      if (!(existing.mealArchetypes || []).some(meal => meals.includes(meal))) continue;
      if (jaccard(proposedSet, recipeIngredientSet(existing)) >= 0.82) fail(`${item.proposalRecipeId}: near-duplicate ingredient set with ${existing.recipeVersionId}`);
    }
    version.contentHash = await sha256Json({ ...version, contentHash: '' });
    const family = { schemaVersion: 1, recipeId, origin: 'base', currentVersionId: recipeVersionId, status: 'active', createdAt: proposal.generatedAt, updatedAt: proposal.generatedAt };
    registry.assert('recipeVersion', version); registry.assert('recipe', family);
    recipeVersions.push(version); recipeFamilies.push(family); existingSignatures.add(signature); existingItTitles.add(titleIt.toLowerCase()); existingEnTitles.add(titleEn.toLowerCase()); proposalRecipeIds.push(recipeId);
  }

  const next = { ...corpus, taxonomyTerms, ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, proposalRecipeIds, proposalIngredientIds };
  assertSemanticReferences({ index: referenceIndex, ingredientRevisions, recipeVersions, ingredientIds: ingredientFamilies.map(item => item.ingredientId) });
  return next;
}

async function normalizeCatalogVersion(records, catalogVersion) {
  const ingredientRevisions = [];
  for (const revision of records.ingredientRevisions) {
    const next = { ...structuredClone(revision), catalogVersion, contentHash: '' };
    next.contentHash = await sha256Json({ ...next, contentHash: '' }); ingredientRevisions.push(next);
  }
  const recipeVersions = [];
  for (const version of records.recipeVersions) {
    const next = { ...structuredClone(version), catalogVersion, contentHash: '' };
    next.contentHash = await sha256Json({ ...next, contentHash: '' }); recipeVersions.push(next);
  }
  return { ...records, ingredientRevisions, recipeVersions };
}

async function main() {
  const registry = new SchemaRegistry(async file => JSON.parse(await readFile(path.join(ROOT, 'schemas', file), 'utf8'))); await registry.loadAll();
  const current = await loadLocalCatalog(PUBLIC_DATA);
  const proposalFiles = (await readdir(RECIPE_PROPOSAL_DIR, { withFileTypes: true }).catch(() => []))
    .filter(item => item.isFile() && item.name.endsWith('.json') && !item.name.endsWith('.example.json'))
    .map(item => path.join(RECIPE_PROPOSAL_DIR, item.name)).sort();
  const proposals = [];
  const proposalIds = new Set();
  for (const file of proposalFiles) {
    const proposal = await readJson(file);
    if (!proposal?.proposalId || proposalIds.has(proposal.proposalId)) fail(`duplicate/missing proposalId in ${path.basename(file)}`);
    proposalIds.add(proposal.proposalId); proposals.push({ file, proposal });
  }

  const base = await loadT4ESeed(current, registry);
  const policy = await loadPolicy();
  const catalogVersion = proposals.length ? `1.3.${proposals.length}-dev.recipes` : '1.3.0-dev.t4e';
  if (compareSemver(current.manifest.catalogVersion, catalogVersion) > 0) fail(`current catalog ${current.manifest.catalogVersion} is newer than deterministic proposal build ${catalogVersion}; proposals must be append-only`);
  let next = base; const applied = [];
  for (const { file, proposal } of proposals) {
    const appliedNext = await applyProposal(next, proposal, catalogVersion, registry, policy);
    applied.push({ file: path.relative(ROOT, file), proposalId: proposal.proposalId, addedIngredients: appliedNext.proposalIngredientIds.length, addedRecipes: appliedNext.proposalRecipeIds.length });
    next = appliedNext;
  }
  next = await normalizeCatalogVersion(next, catalogVersion);

  const sourceCorpusDigest = await sha256Json({
    proposals: applied.map(item => item.proposalId),
    ingredients: next.ingredientRevisions.map(item => [item.ingredientRevisionId, item.contentHash]).sort(),
    recipes: next.recipeVersions.map(item => [item.recipeVersionId, item.contentHash]).sort()
  });
  const publication = {
    channel: 'development', publicationId: `dev-${catalogVersion.replace(/[^a-z0-9]+/gi,'-')}`,
    sourceCorpusDigest, sourceSnapshotId: proposals.length ? `recipe-proposals-${sourceCorpusDigest.slice(0,16)}` : 't4e-corpus-simulation-round1',
    requiredHumanReview: false, reviewRecipeCount: 0, reviewPolicyVersion: 'development-chat-authoring-1', releaseEligible: false
  };
  registry.assert('catalogPublication', publication);
  const releaseDir = path.join(OUTPUT, 'release');
  const builtAt = proposals.length ? proposals[proposals.length - 1].proposal.generatedAt : '2026-09-16T12:00:00.000Z';
  const manifest = await publishCatalogRelease({
    outputDir: releaseDir, catalogVersion, taxonomies: next.taxonomies, taxonomyTerms: next.taxonomyTerms,
    referenceDataVersion: `dev-${catalogVersion}`, ingredientFamilies: next.ingredientFamilies.sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId)),
    ingredientRevisions: next.ingredientRevisions.sort((a,b)=>a.ingredientRevisionId.localeCompare(b.ingredientRevisionId)),
    recipeFamilies: next.recipeFamilies.sort((a,b)=>a.recipeId.localeCompare(b.recipeId)), recipeVersions: next.recipeVersions.sort((a,b)=>a.recipeVersionId.localeCompare(b.recipeVersionId)),
    builtAt, appMinVersion: '1.1.0-dev.r8', locales: ['it','en'], pipelineVersion: 'chat-recipe-proposal-1', publication,
    shardPathPrefix: versionPath(catalogVersion), registry
  });

  const summary = {
    mode, catalogVersion: manifest.catalogVersion,
    counts: { ingredients: next.ingredientFamilies.length, ingredientRevisions: next.ingredientRevisions.length, recipes: next.recipeFamilies.length, recipeVersions: next.recipeVersions.length },
    proposals: applied,
    shardPathPrefix: versionPath(catalogVersion)
  };
  if (mode === 'publish') {
    const generated = path.join(releaseDir, 'data');
    await rm(path.join(PUBLIC_DATA, 'catalogs'), { recursive: true, force: true });
    await cp(path.join(generated, 'catalogs'), path.join(PUBLIC_DATA, 'catalogs'), { recursive: true });
    await cp(path.join(generated, 'catalog-manifest.json'), path.join(PUBLIC_DATA, 'catalog-manifest.json'));
  }
  console.log(JSON.stringify(summary, null, 2));
}

await main();
