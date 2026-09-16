import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { ReferenceDataIndex, assertReferenceData, referenceDataDigest } from '../../src/services/referenceDataService.js';
import { validateProductFoodAssignment } from '../../src/domain/productFoodTaxonomy.js';
import { calculateRecipeNutrition, deriveAllergens, normalizeIngredientAmount } from '../../src/domain/nutritionCore.js';
import { simulateT4EFinalCorpus } from './t4e-corpus-simulation.mjs';

const ROOT = process.cwd();
const ACTIVE_ROOT = path.resolve(ROOT, 'data-proposals/active');
const OUTPUT_ROOT = path.resolve(ROOT, 'corpus/staging/data-proposals');
const MATERIALIZED_AT = '2026-09-16T00:00:00.000Z';

function fail(message) { throw new Error(message); }
function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function searchTokens(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean).flatMap(value => normalize(value).split('_')).filter(Boolean))].sort();
}
function sha256Buffer(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
async function sha256File(file) { return sha256Buffer(await readFile(file)); }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }

async function readShards(dir, prefix) {
  const names = (await readdir(dir)).filter(name => name.startsWith(prefix) && name.endsWith('.json')).sort();
  const rows = [];
  for (const name of names) rows.push(...await readJson(path.join(dir, name)));
  return rows;
}

function corpusDigest(rows, idKey) {
  const text = [...rows].sort((a, b) => String(a[idKey]).localeCompare(String(b[idKey])))
    .map(item => `${item[idKey]}:${item.contentHash || ''}`).join('\n');
  return sha256Buffer(Buffer.from(text));
}

function sameTermDefinition(existing, candidate) {
  return existing.taxonomyId === candidate.taxonomyId
    && existing.parentTermId === candidate.parentTermId
    && existing.i18n?.it?.label === candidate.i18n?.it?.label
    && existing.i18n?.en?.label === candidate.i18n?.en?.label;
}

function canonicalTerm(proposed, proposal) {
  return {
    schemaVersion: 1,
    termId: proposed.termId,
    taxonomyId: proposed.taxonomyId,
    origin: 'base',
    parentTermId: proposed.parentTermId,
    i18n: structuredClone(proposed.i18n),
    aliases: structuredClone(proposed.aliases || { it: [], en: [] }),
    legacyKeys: [],
    status: 'active',
    supersedesTermId: null,
    provenance: {
      sourceType: 'curated',
      sourceLabel: `Chat semantic review ${proposal.proposalId}`,
      reference: null,
      rationale: 'One-shot development semantic consolidation; deterministic reconciliation only.'
    },
    searchTokens: searchTokens(proposed.termId, proposed.i18n?.it?.label, proposed.i18n?.en?.label, proposed.aliases?.it, proposed.aliases?.en),
    createdAt: MATERIALIZED_AT,
    updatedAt: MATERIALIZED_AT
  };
}

async function loadBaseline() {
  const dataDir = path.join(ROOT, 'public/data');
  const manifestFile = path.join(dataDir, 'catalog-manifest.json');
  const taxonomyFile = path.join(dataDir, 'reference-data/taxonomy-terms-0001.json');
  const [manifest, ingredientRevisions, ingredientFamilies, recipeVersions, recipeFamilies, taxonomies, taxonomyTerms] = await Promise.all([
    readJson(manifestFile),
    readShards(path.join(dataDir, 'ingredients'), 'ingredient-revisions-'),
    readShards(path.join(dataDir, 'ingredients'), 'ingredient-families-'),
    readShards(path.join(dataDir, 'recipes'), 'recipe-versions-'),
    readShards(path.join(dataDir, 'recipes'), 'recipe-families-'),
    readShards(path.join(dataDir, 'reference-data'), 'taxonomies-'),
    readShards(path.join(dataDir, 'reference-data'), 'taxonomy-terms-')
  ]);
  return {
    manifest, ingredientRevisions, ingredientFamilies, recipeVersions, recipeFamilies, taxonomies, taxonomyTerms,
    digests: {
      catalogManifestSha256: await sha256File(manifestFile),
      taxonomyTermsSha256: await sha256File(taxonomyFile),
      ingredientCorpusDigest: corpusDigest(ingredientRevisions, 'ingredientRevisionId'),
      recipeCorpusDigest: corpusDigest(recipeVersions, 'recipeVersionId')
    }
  };
}

function validateBaseline(proposal, baseline) {
  const expected = proposal.baseline || {};
  const actual = {
    catalogVersion: baseline.manifest.catalogVersion,
    ingredientCount: baseline.ingredientRevisions.length,
    recipeVersionCount: baseline.recipeVersions.length,
    ...baseline.digests
  };
  for (const key of ['catalogVersion', 'ingredientCount', 'recipeVersionCount', 'catalogManifestSha256', 'taxonomyTermsSha256', 'ingredientCorpusDigest', 'recipeCorpusDigest']) {
    if (expected[key] !== actual[key]) fail(`STALE baseline ${key}: expected=${expected[key]} actual=${actual[key]}`);
  }
  return actual;
}

async function reconcileIngredientProposal(proposalDir, baseline, registry, { materialize = false } = {}) {
  const proposalFile = path.join(proposalDir, 'ingredient-semantic-proposal.json');
  const termsFile = path.join(proposalDir, 'proposed-product-terms.json');
  const [proposal, proposedTermsDoc] = await Promise.all([readJson(proposalFile), readJson(termsFile)]);
  if (proposal.proposalType !== 'ingredient_semantic_consolidation') fail(`Unsupported proposalType ${proposal.proposalType}`);
  const baselineActual = validateBaseline(proposal, baseline);
  const proposedTerms = proposedTermsDoc.terms || [];
  const proposedById = new Map(proposedTerms.map(item => [item.termId, item]));
  if (proposedById.size !== proposedTerms.length) fail('Duplicate proposed taxonomy term IDs');
  const declaredTermIds = new Set(proposal.newProductTerms || []);
  for (const id of declaredTermIds) if (!proposedById.has(id)) fail(`Proposal references missing proposed term ${id}`);
  for (const id of proposedById.keys()) if (!declaredTermIds.has(id)) fail(`Proposed term ${id} is not declared by proposal.newProductTerms`);

  const taxonomyTerms = structuredClone(baseline.taxonomyTerms);
  const existingById = new Map(taxonomyTerms.map(item => [item.termId, item]));
  const labels = new Map();
  for (const item of taxonomyTerms.filter(item => item.taxonomyId === 'product_food')) {
    for (const label of [item.i18n?.it?.label, item.i18n?.en?.label]) {
      const key = normalize(label); if (!key) continue;
      if (!labels.has(key)) labels.set(key, new Set()); labels.get(key).add(item.termId);
    }
  }
  const addedTerms = [];
  const reusedTerms = [];
  for (const raw of proposedTerms) {
    if (raw.taxonomyId !== 'product_food') fail(`Only product_food terms are allowed: ${raw.termId}`);
    const parent = existingById.get(raw.parentTermId);
    if (!parent || parent.taxonomyId !== 'product_food' || !raw.parentTermId?.startsWith('product_subcategory_')) fail(`Invalid parentTermId ${raw.parentTermId} for ${raw.termId}`);
    const candidate = canonicalTerm(raw, proposal);
    const existing = existingById.get(candidate.termId);
    if (existing) {
      if (!sameTermDefinition(existing, candidate)) fail(`CONFLICT taxonomy term ${candidate.termId}`);
      reusedTerms.push(candidate.termId); continue;
    }
    for (const label of [candidate.i18n.it.label, candidate.i18n.en.label]) {
      const collisions = labels.get(normalize(label));
      if (collisions?.size) fail(`CONFLICT label ${label} for ${candidate.termId}: ${[...collisions].join(',')}`);
    }
    registry.assert('taxonomyTerm', candidate);
    taxonomyTerms.push(candidate); existingById.set(candidate.termId, candidate); addedTerms.push(candidate.termId);
    for (const label of [candidate.i18n.it.label, candidate.i18n.en.label]) labels.set(normalize(label), new Set([candidate.termId]));
  }
  taxonomyTerms.sort((a, b) => a.termId.localeCompare(b.termId));
  assertReferenceData(baseline.taxonomies, taxonomyTerms, registry);
  const index = new ReferenceDataIndex(baseline.taxonomies, taxonomyTerms);

  const revisions = structuredClone(baseline.ingredientRevisions);
  const byRevisionId = new Map(revisions.map((item, i) => [item.ingredientRevisionId, { item, i }]));
  const applied = [];
  const changedRevisionIds = new Set();
  for (const change of proposal.ingredientChanges || []) {
    if (changedRevisionIds.has(change.ingredientRevisionId)) fail(`Duplicate ingredient change ${change.ingredientRevisionId}`);
    changedRevisionIds.add(change.ingredientRevisionId);
    const found = byRevisionId.get(change.ingredientRevisionId);
    if (!found) fail(`MISSING ingredientRevisionId ${change.ingredientRevisionId}`);
    const current = found.item;
    if (current.ingredientId !== change.ingredientId) fail(`CONFLICT ingredientId for ${change.ingredientRevisionId}`);
    if (current.contentHash !== change.expectedContentHash) fail(`STALE ingredient ${change.ingredientRevisionId}: contentHash mismatch`);
    if (!change.proposed?.conceptId || !change.proposed?.subcategoryId) fail(`Missing proposed taxonomy for ${change.ingredientRevisionId}`);
    const subcategory = index.term(change.proposed.subcategoryId);
    const concept = index.term(change.proposed.conceptId);
    if (!subcategory || !concept) fail(`Unknown proposed taxonomy term on ${change.ingredientRevisionId}`);
    if (concept.parentTermId !== subcategory.termId) fail(`Concept/subcategory mismatch on ${change.ingredientRevisionId}`);
    const categoryId = subcategory.parentTermId;
    if (change.proposed.categoryId && change.proposed.categoryId !== categoryId) fail(`Category derivation mismatch on ${change.ingredientRevisionId}`);
    const next = structuredClone(current);
    next.productTaxonomy = { categoryId, subcategoryId: subcategory.termId, conceptId: concept.termId };
    next.contentHash = '';
    const currentInvariantDigest = await sha256Json({ ...current, productTaxonomy: null, contentHash: '' });
    const nextInvariantDigest = await sha256Json({ ...next, productTaxonomy: null, contentHash: '' });
    if (currentInvariantDigest !== nextInvariantDigest) fail(`ILLEGAL mutation outside productTaxonomy/contentHash on ${change.ingredientRevisionId}`);
    next.contentHash = await sha256Json(next);
    registry.assert('ingredientRevision', next);
    validateProductFoodAssignment(index, next);
    revisions[found.i] = next;
    applied.push({
      ingredientRevisionId: next.ingredientRevisionId,
      ingredientId: next.ingredientId,
      from: current.productTaxonomy,
      to: next.productTaxonomy,
      oldContentHash: current.contentHash,
      newContentHash: next.contentHash,
      priority: change.priority,
      decision: change.decision
    });
  }
  revisions.sort((a, b) => a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));
  const resultDigest = corpusDigest(revisions, 'ingredientRevisionId');
  const refDigest = await referenceDataDigest(baseline.taxonomies, taxonomyTerms);
  const report = {
    schemaVersion: 1,
    proposalId: proposal.proposalId,
    status: 'reconciled',
    mode: materialize ? 'materialize' : 'check',
    baseline: baselineActual,
    result: {
      ingredientChangesApplied: applied.length,
      taxonomyTermsAdded: addedTerms.length,
      taxonomyTermsReused: reusedTerms.length,
      ingredientCount: revisions.length,
      productFoodTermCount: taxonomyTerms.filter(item => item.taxonomyId === 'product_food').length,
      ingredientCorpusDigest: resultDigest,
      referenceDataDigest: refDigest
    },
    invariants: {
      fuzzyMatchingUsed: false,
      recipeVersionsMutated: false,
      nutritionMutated: false,
      sourceProvenanceMutated: false,
      unresolved: 0
    },
    applied
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, proposal.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'taxonomy-terms.json'), taxonomyTerms),
      writeJson(path.join(dir, 'ingredient-revisions.json'), revisions),
      writeJson(path.join(dir, 'materialization.json'), {
        schemaVersion: 1, proposalId: proposal.proposalId, baseline: baselineActual, result: report.result,
        promotionState: 'staging_only', generatedAt: MATERIALIZED_AT
      })
    ]);
  }
  return report;
}


async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function reconcileRecipeProposal(proposalDir, baseline, { materialize = false } = {}) {
  const proposalFile = path.join(proposalDir, 'recipe-semantic-proposal.json');
  const reviewFile = path.join(proposalDir, 'recipe-semantic-review.json');
  const proposal = await readJson(proposalFile);
  const review = await readJson(reviewFile);
  if (proposal.proposalType !== 'recipe_semantic_consolidation') fail(`Unsupported proposalType ${proposal.proposalType}`);
  const baselineActual = validateBaseline(proposal, baseline);
  const ingredientProposalFile = path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'ingredient-semantic-proposal.json');
  const termsProposalFile = path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'proposed-product-terms.json');
  if (!await exists(ingredientProposalFile) || !await exists(termsProposalFile)) fail('Recipe semantic proposal requires ingredient semantic proposal round1');
  const ingredientProposalSha256 = await sha256File(ingredientProposalFile);
  const proposedTermsSha256 = await sha256File(termsProposalFile);
  if (proposal.baseline?.ingredientSemanticProposalSha256 !== ingredientProposalSha256) fail('STALE recipe proposal: ingredient semantic proposal digest mismatch');
  if (proposal.baseline?.proposedProductTermsSha256 !== proposedTermsSha256) fail('STALE recipe proposal: proposed product terms digest mismatch');

  const recipeById = new Map(baseline.recipeVersions.map(item => [item.recipeVersionId, item]));
  const rows = proposal.recipeReviews || [];
  if (rows.length !== baseline.recipeVersions.length) fail(`Recipe review cardinality mismatch: ${rows.length}/${baseline.recipeVersions.length}`);
  const seen = new Set();
  const allowedDecisions = new Set(['KEEP_RENAME', 'REWORK', 'RETIRE', 'CONSOLIDATE_DUPLICATE']);
  const decisions = { KEEP_RENAME: [], REWORK: [], RETIRE: [], CONSOLIDATE_DUPLICATE: [] };
  for (const row of rows) {
    if (!row?.recipeVersionId || seen.has(row.recipeVersionId)) fail(`Duplicate/missing recipeVersionId ${row?.recipeVersionId}`);
    seen.add(row.recipeVersionId);
    const current = recipeById.get(row.recipeVersionId);
    if (!current) fail(`MISSING recipeVersionId ${row.recipeVersionId}`);
    if (current.recipeId !== row.recipeId) fail(`CONFLICT recipeId for ${row.recipeVersionId}`);
    if (current.contentHash !== row.expectedContentHash) fail(`STALE recipe ${row.recipeVersionId}: contentHash mismatch`);
    if (!allowedDecisions.has(row.decision)) fail(`Unsupported recipe decision ${row.decision} on ${row.recipeVersionId}`);
    const titleIt = String(row.proposedPresentation?.titleIt || '').trim();
    const titleEn = String(row.proposedPresentation?.titleEn || '').trim();
    if (!titleIt || !titleEn) fail(`Missing proposed presentation title on ${row.recipeVersionId}`);
    if (/planner validation|validazione del planner/i.test(`${titleIt} ${titleEn}`)) fail(`Planner validation copy leaked into proposed title ${row.recipeVersionId}`);
    if (/[—]/.test(titleIt) || /\([^)]{18,}\)/.test(titleIt)) fail(`Source-like technical title remains on ${row.recipeVersionId}`);
    if (row.decision === 'CONSOLIDATE_DUPLICATE') {
      if (!row.duplicateOf || row.duplicateOf === row.recipeVersionId) fail(`Invalid duplicateOf on ${row.recipeVersionId}`);
      const target = recipeById.get(row.duplicateOf);
      if (!target) fail(`Missing duplicate target ${row.duplicateOf}`);
    } else if (row.duplicateOf) fail(`duplicateOf is only allowed for CONSOLIDATE_DUPLICATE on ${row.recipeVersionId}`);
    decisions[row.decision].push({
      recipeVersionId: row.recipeVersionId,
      recipeId: row.recipeId,
      decision: row.decision,
      priority: row.priority,
      duplicateOf: row.duplicateOf || null,
      reasons: structuredClone(row.reasons || []),
      proposedPresentation: structuredClone(row.proposedPresentation)
    });
  }
  if (seen.size !== recipeById.size) fail(`Unreviewed recipe versions remain: ${recipeById.size - seen.size}`);
  for (const row of decisions.CONSOLIDATE_DUPLICATE) {
    const targetReview = rows.find(item => item.recipeVersionId === row.duplicateOf);
    if (!targetReview || targetReview.decision === 'CONSOLIDATE_DUPLICATE' || targetReview.decision === 'RETIRE') fail(`Invalid duplicate canonical target ${row.duplicateOf}`);
  }
  const actualCounts = Object.fromEntries(Object.entries(decisions).map(([key, value]) => [key, value.length]));
  const expectedCounts = proposal.summary?.counts || {};
  for (const key of allowedDecisions) if (Number(expectedCounts[key] || 0) !== actualCounts[key]) fail(`Recipe summary count mismatch ${key}: expected=${expectedCounts[key] || 0} actual=${actualCounts[key]}`);
  if (review.proposalId !== proposal.proposalId || review.recipes?.length !== rows.length) fail('Recipe review document does not match proposal');

  const report = {
    schemaVersion: 1,
    proposalId: proposal.proposalId,
    status: 'reconciled',
    mode: materialize ? 'materialize' : 'check',
    baseline: baselineActual,
    result: {
      recipeVersionsReviewed: rows.length,
      counts: actualCounts,
      stagingKeepCount: actualCounts.KEEP_RENAME,
      stagingNeedsReworkCount: actualCounts.REWORK,
      stagingRetireCount: actualCounts.RETIRE,
      stagingDuplicateCount: actualCounts.CONSOLIDATE_DUPLICATE
    },
    invariants: {
      fuzzyMatchingUsed: false,
      canonicalRecipeVersionsMutated: false,
      nutritionMutated: false,
      ingredientLinesMutated: false,
      canonicalCatalogMutated: false,
      unresolved: 0
    }
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, proposal.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'keep-rename.json'), decisions.KEEP_RENAME),
      writeJson(path.join(dir, 'needs-rework.json'), decisions.REWORK),
      writeJson(path.join(dir, 'retire.json'), decisions.RETIRE),
      writeJson(path.join(dir, 'consolidate-duplicates.json'), decisions.CONSOLIDATE_DUPLICATE),
      writeJson(path.join(dir, 'materialization.json'), {
        schemaVersion: 1, proposalId: proposal.proposalId, baseline: baselineActual, result: report.result,
        promotionState: 'staging_review_only', canonicalCatalogMutated: false, generatedAt: MATERIALIZED_AT
      })
    ]);
  }
  return report;
}


async function reconcileCulinaryPolicy(proposalDir, baseline, { materialize = false } = {}) {
  const policyFile = path.join(proposalDir, 'culinary-generation-policy.json');
  const poolsFile = path.join(proposalDir, 'role-pools-v2.json');
  const archetypesFile = path.join(proposalDir, 'archetypes-v2.json');
  const [policy, poolsDoc, archetypesDoc] = await Promise.all([readJson(policyFile), readJson(poolsFile), readJson(archetypesFile)]);
  if (policy.proposalType !== 'culinary_generation_policy') fail(`Unsupported proposalType ${policy.proposalType}`);
  const baselineActual = validateBaseline(policy, baseline);
  const ingredientProposalFile = path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'ingredient-semantic-proposal.json');
  if (!await exists(ingredientProposalFile)) fail('Culinary policy requires ingredient semantic proposal round1');
  if (policy.baseline?.ingredientSemanticProposalSha256 !== await sha256File(ingredientProposalFile)) fail('STALE culinary policy: ingredient semantic proposal digest mismatch');
  if (policy.files?.rolePoolsSha256 !== await sha256File(poolsFile)) fail('STALE culinary policy: role-pools digest mismatch');
  if (policy.files?.archetypesSha256 !== await sha256File(archetypesFile)) fail('STALE culinary policy: archetypes digest mismatch');

  const revisionById = new Map(baseline.ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  const roles = poolsDoc.roles || [];
  const roleById = new Map();
  for (const role of roles) {
    if (!role?.roleId || roleById.has(role.roleId)) fail(`Duplicate/missing culinary role ${role?.roleId}`);
    roleById.set(role.roleId, role);
    if (!Number.isFinite(Number(role.portionG?.min)) || !Number.isFinite(Number(role.portionG?.max)) || Number(role.portionG.min) > Number(role.portionG.max)) fail(`Invalid portion bounds on ${role.roleId}`);
    const ids = role.ingredientRevisionIds || [];
    if (!ids.length) fail(`Empty culinary role ${role.roleId}`);
    if (new Set(ids).size !== ids.length) fail(`Duplicate ingredient revision in culinary role ${role.roleId}`);
    for (const id of ids) if (!revisionById.has(id)) fail(`Unknown IngredientRevision ${id} in culinary role ${role.roleId}`);
  }
  const sourceName = id => String(revisionById.get(id)?.i18n?.en?.name || '');
  const conceptId = id => revisionById.get(id)?.productTaxonomy?.conceptId;
  const heatOil = roleById.get('oil_cooking_heat');
  if (!heatOil || heatOil.ingredientRevisionIds.some(id => /flaxseed/i.test(sourceName(id)))) fail('oil_cooking_heat contains flaxseed oil');
  const wholeFruit = roleById.get('fruit_ready_whole');
  if (!wholeFruit || wholeFruit.ingredientRevisionIds.some(id => /^(Lemons|Limes),/i.test(sourceName(id)) || /rind only/i.test(sourceName(id)))) fail('fruit_ready_whole contains culinary-acid/rind records');
  const mainCook = roleById.get('vegetable_main_cook');
  if (!mainCook || mainCook.ingredientRevisionIds.some(id => conceptId(id) === 'product_concept_tomato_paste' || /jalapeno|serrano/i.test(sourceName(id)))) fail('vegetable_main_cook contains concentrated tomato/hot pepper');
  const dryGrain = roleById.get('grain_dry_cook');
  if (!dryGrain || dryGrain.ingredientRevisionIds.some(id => /millet, puffed|self-rising/i.test(sourceName(id)))) fail('grain_dry_cook contains ready/self-rising products');
  const savoryNuts = roleById.get('nuts_seeds_neutral');
  if (!savoryNuts || savoryNuts.ingredientRevisionIds.some(id => /sweetened|honey roasted/i.test(sourceName(id)))) fail('nuts_seeds_neutral contains sweet variants');
  const yogurt = roleById.get('yogurt_cultured');
  if (!yogurt || yogurt.ingredientRevisionIds.some(id => !/^Yogurt,/i.test(sourceName(id)))) fail('yogurt_cultured contains non-yogurt records');

  const archetypes = archetypesDoc.archetypes || [];
  const archetypeIds = new Set();
  for (const archetype of archetypes) {
    if (!archetype?.archetypeId || archetypeIds.has(archetype.archetypeId)) fail(`Duplicate/missing culinary archetype ${archetype?.archetypeId}`);
    archetypeIds.add(archetype.archetypeId);
    if (!(archetype.mealArchetypes || []).length || !(archetype.slots || []).length) fail(`Incomplete culinary archetype ${archetype.archetypeId}`);
    const refs = [];
    for (const slot of archetype.slots) {
      if (slot.roleId) refs.push(slot.roleId);
      for (const id of slot.oneOfRoles || []) refs.push(id);
      if (!slot.roleId && !(slot.oneOfRoles || []).length) fail(`Archetype slot without role ${archetype.archetypeId}`);
      if (Number(slot.minG || 0) > Number(slot.maxG || 0)) fail(`Invalid slot bounds ${archetype.archetypeId}`);
    }
    for (const id of refs) if (!roleById.has(id)) fail(`Unknown culinary role ${id} in archetype ${archetype.archetypeId}`);
    if (archetype.method?.type === 'heated' && refs.includes('oil_finishing') && !refs.includes('oil_cooking_heat')) fail(`Heated archetype relies on finishing oil ${archetype.archetypeId}`);
  }
  if (poolsDoc.summary?.emptyRoles?.length) fail(`Culinary policy declares empty roles: ${poolsDoc.summary.emptyRoles.join(',')}`);
  const report = {
    schemaVersion: 1, proposalId: policy.proposalId, status: 'reconciled', mode: materialize ? 'materialize' : 'check', baseline: baselineActual,
    result: { roleCount: roles.length, archetypeCount: archetypes.length, roleAssignments: roles.reduce((sum, role) => sum + role.ingredientRevisionIds.length, 0), emptyRoles: 0 },
    invariants: { fuzzyMatchingUsed: false, autonomousGenerationUsed: false, canonicalCatalogMutated: false, explicitRolePools: true, explicitArchetypes: true, unresolved: 0 }
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, policy.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'role-pools.json'), poolsDoc),
      writeJson(path.join(dir, 'archetypes.json'), archetypesDoc),
      writeJson(path.join(dir, 'materialization.json'), { schemaVersion: 1, proposalId: policy.proposalId, result: report.result, promotionState: 'staging_policy_only', canonicalCatalogMutated: false, generatedAt: MATERIALIZED_AT })
    ]);
  }
  return report;
}

async function reconcileReworkPlan(proposalDir, baseline, { materialize = false } = {}) {
  const planFile = path.join(proposalDir, 'recipe-rework-plan.json');
  const gapFile = path.join(proposalDir, 'gap-matrix.json');
  const [plan, gap] = await Promise.all([readJson(planFile), readJson(gapFile)]);
  if (plan.proposalType !== 'recipe_rework_plan') fail(`Unsupported proposalType ${plan.proposalType}`);
  const baselineActual = validateBaseline(plan, baseline);
  const semanticProposalFile = path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-proposal.json');
  const semanticReviewFile = path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-review.json');
  const policyFile = path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'culinary-generation-policy.json');
  for (const file of [semanticProposalFile, semanticReviewFile, policyFile]) if (!await exists(file)) fail(`Recipe rework plan dependency missing: ${file}`);
  if (plan.baseline?.recipeSemanticProposalSha256 !== await sha256File(semanticProposalFile)) fail('STALE rework plan: recipe semantic proposal digest mismatch');
  if (plan.baseline?.recipeSemanticReviewSha256 !== await sha256File(semanticReviewFile)) fail('STALE rework plan: recipe semantic review digest mismatch');
  if (plan.baseline?.culinaryGenerationPolicySha256 !== await sha256File(policyFile)) fail('STALE rework plan: culinary policy digest mismatch');

  const semanticProposal = await readJson(semanticProposalFile);
  const semanticById = new Map((semanticProposal.recipeReviews || []).map(item => [item.recipeVersionId, item]));
  const recipeById = new Map(baseline.recipeVersions.map(item => [item.recipeVersionId, item]));
  const policy = await readJson(policyFile);
  const archetypes = await readJson(path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', policy.archetypesFile));
  const archetypeIds = new Set((archetypes.archetypes || []).map(item => item.archetypeId));
  const allowedActions = new Set(['PATCH_INGREDIENT_SINGLE','PATCH_MULTI_INGREDIENT','PATCH_METHOD_ONLY','PATCH_INGREDIENT_AND_METHOD','CONVERT_ARCHETYPE','REBUILD_REPLACEMENT']);
  const rows = plan.reworkPlans || [];
  const expectedRework = [...semanticById.values()].filter(item => item.decision === 'REWORK');
  if (rows.length !== expectedRework.length) fail(`Rework plan cardinality mismatch ${rows.length}/${expectedRework.length}`);
  const seen = new Set(); const buckets = Object.fromEntries([...allowedActions].map(key => [key, []]));
  for (const row of rows) {
    if (!row?.recipeVersionId || seen.has(row.recipeVersionId)) fail(`Duplicate/missing rework recipeVersionId ${row?.recipeVersionId}`);
    seen.add(row.recipeVersionId);
    const semantic = semanticById.get(row.recipeVersionId); const current = recipeById.get(row.recipeVersionId);
    if (!semantic || semantic.decision !== 'REWORK') fail(`Rework plan references non-REWORK recipe ${row.recipeVersionId}`);
    if (!current || current.contentHash !== row.expectedContentHash || semantic.expectedContentHash !== row.expectedContentHash) fail(`STALE rework recipe ${row.recipeVersionId}`);
    if (!allowedActions.has(row.actionClass)) fail(`Unsupported rework action ${row.actionClass}`);
    if (row.actionClass === 'REBUILD_REPLACEMENT' && Number(row.strictRepairCandidateCount || 0) !== 0) fail(`Rebuild has strict candidates ${row.recipeVersionId}`);
    if (row.actionClass.startsWith('PATCH_') && Number(row.strictRepairCandidateCount || 0) < 1) fail(`Patch has no strict candidate ${row.recipeVersionId}`);
    if (row.actionClass === 'CONVERT_ARCHETYPE') {
      if (Number(row.strictRepairCandidateCount || 0) !== 0) fail(`Archetype conversion unexpectedly has strict candidates ${row.recipeVersionId}`);
      if (!archetypeIds.has(row.conversionArchetypeId)) fail(`Unknown conversion archetype ${row.conversionArchetypeId}`);
    }
    buckets[row.actionClass].push(row);
  }
  if (seen.size !== expectedRework.length) fail(`Unplanned REWORK recipes remain: ${expectedRework.length - seen.size}`);
  const actionCounts = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  for (const [key, value] of Object.entries(plan.summary?.actionCounts || {})) if (Number(value) !== Number(actionCounts[key] || 0)) fail(`Rework action summary mismatch ${key}`);
  const rebuildRows = buckets.REBUILD_REPLACEMENT;
  if (Number(plan.summary?.rebuildReplacementCount) !== rebuildRows.length) fail('Rework rebuild count mismatch');

  const sourceCoverage = await readJson(path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'coverage-impact.json'));
  const rebuildByJob = new Map(); for (const row of rebuildRows) rebuildByJob.set(row.energyBandJobId, (rebuildByJob.get(row.energyBandJobId) || 0) + 1);
  const gapByJob = new Map((gap.bands || []).map(item => [item.jobId, item]));
  let replacementTarget = 0;
  for (const band of sourceCoverage.bands || []) {
    const row = gapByJob.get(band.jobId); if (!row) fail(`Gap matrix missing ${band.jobId}`);
    const rebuildCount = rebuildByJob.get(band.jobId) || 0;
    const expected = Number(band.RETIRE) + Number(band.CONSOLIDATE_DUPLICATE) + rebuildCount;
    if (Number(row.rebuildFromRework) !== rebuildCount || Number(row.replacementTargetToRestoreOriginalQuota) !== expected) fail(`Gap matrix mismatch ${band.jobId}`);
    replacementTarget += expected;
  }
  if (Number(gap.totals?.replacementTarget) !== replacementTarget || Number(plan.summary?.replacementNeed?.totalAcceptedNewRecipesToRestoreOriginalQuota) !== replacementTarget) fail('Replacement target mismatch');
  const report = {
    schemaVersion: 1, proposalId: plan.proposalId, status: 'reconciled', mode: materialize ? 'materialize' : 'check', baseline: baselineActual,
    result: { reworkCount: rows.length, actionCounts, strictLocalRepairCount: plan.summary.strictLocalRepairCount, archetypeConversionCount: plan.summary.archetypeConversionCount, rebuildReplacementCount: rebuildRows.length, replacementTarget },
    invariants: { fuzzyMatchingUsed: false, automaticAmountFittingUsed: false, canonicalCatalogMutated: false, rebuildsAutoGenerated: false, unresolved: 0 }
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, plan.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'strict-repair.json'), rows.filter(item => item.actionClass.startsWith('PATCH_'))),
      writeJson(path.join(dir, 'archetype-conversion.json'), buckets.CONVERT_ARCHETYPE),
      writeJson(path.join(dir, 'rebuild-replacement.json'), rebuildRows),
      writeJson(path.join(dir, 'gap-matrix.json'), gap),
      writeJson(path.join(dir, 'materialization.json'), { schemaVersion: 1, proposalId: plan.proposalId, result: report.result, promotionState: 'staging_plan_only', canonicalCatalogMutated: false, generatedAt: MATERIALIZED_AT })
    ]);
  }
  return report;
}

function replacementJob(jobId) {
  const match = String(jobId || '').match(/^phase-b-(breakfast|lunch|dinner|snack|mini_meal)-kcal-(\d+)-(\d+)$/);
  if (!match) fail(`Invalid replacement job ID ${jobId}`);
  return { mealArchetype: match[1], minKcal: Number(match[2]), maxKcal: Number(match[3]) };
}
function ingredientSetKey(ids) { return [...new Set(ids)].sort().join('|'); }
function roleFitsSlot(roleId, slot) { return slot?.roleId === roleId || (slot?.oneOfRoles || []).includes(roleId); }

async function reconcileRecipeGenerationProposal(proposalDir, baseline, { materialize = false } = {}) {
  const proposalFile = path.join(proposalDir, 'recipe-generation-proposal.json');
  const proposal = await readJson(proposalFile);
  if (proposal.proposalType !== 'recipe_generation_batch') fail(`Unsupported proposalType ${proposal.proposalType}`);
  const baselineActual = validateBaseline(proposal, baseline);
  const batchFile = path.join(proposalDir, proposal.batchFile || 'recipe-proposals.json');
  const batch = await readJson(batchFile);
  const dependencyFiles = {
    ingredientSemanticProposalSha256: path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'ingredient-semantic-proposal.json'),
    proposedProductTermsSha256: path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'proposed-product-terms.json'),
    recipeSemanticProposalSha256: path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-proposal.json'),
    recipeSemanticReviewSha256: path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-review.json'),
    culinaryGenerationPolicySha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'culinary-generation-policy.json'),
    rolePoolsSha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'role-pools-v2.json'),
    archetypesSha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'archetypes-v2.json'),
    recipeReworkPlanSha256: path.join(ACTIVE_ROOT, 'recipe-rework-planning-round1', 'recipe-rework-plan.json'),
    gapMatrixSha256: path.join(ACTIVE_ROOT, 'recipe-rework-planning-round1', 'gap-matrix.json')
  };
  for (const [key, file] of Object.entries(dependencyFiles)) {
    if (!await exists(file)) fail(`Recipe generation dependency missing: ${file}`);
    if (proposal.baseline?.[key] !== await sha256File(file)) fail(`STALE recipe generation proposal: ${key} mismatch`);
  }
  const [policy, poolsDoc, archetypesDoc, gap] = await Promise.all([
    readJson(dependencyFiles.culinaryGenerationPolicySha256), readJson(dependencyFiles.rolePoolsSha256), readJson(dependencyFiles.archetypesSha256), readJson(dependencyFiles.gapMatrixSha256)
  ]);
  if (proposal.policyId !== policy.proposalId || batch.batchId !== proposal.proposalId) fail('Recipe generation policy/batch identity mismatch');
  if (proposal.rules?.workflowMayAlterAmounts !== false || proposal.rules?.workflowMayFuzzyMatchIngredients !== false) fail('Recipe generation proposal must prohibit amount fitting and fuzzy matching');
  const recipes = batch.recipes || [];
  if (recipes.length !== Number(proposal.intent?.targetAcceptedRecipes || 0) || recipes.length !== Number(proposal.summary?.candidateCount || 0)) fail(`Recipe generation cardinality mismatch ${recipes.length}`);
  if (Number(proposal.intent?.netExpansion || 0) !== 0) fail('T4-C replacement batch must not request net expansion');

  const roleById = new Map((poolsDoc.roles || []).map(row => [row.roleId, row]));
  const archetypeById = new Map((archetypesDoc.archetypes || []).map(row => [row.archetypeId, row]));
  const revisionById = new Map(baseline.ingredientRevisions.map(row => [row.ingredientRevisionId, row]));
  const familyById = new Map((baseline.ingredientFamilies || []).map(row => [row.ingredientId, row]));
  const gapByJob = new Map((gap.bands || []).map(row => [row.jobId, row]));
  const baselineIngredientSets = new Set(baseline.recipeVersions.map(row => ingredientSetKey((row.ingredientLines || []).map(line => line.ingredientId))));
  const seenIds = new Set(); const seenTitlesIt = new Set(); const seenTitlesEn = new Set(); const seenIngredientSets = new Set();
  const byJob = new Map(); const byMeal = new Map(); const byArchetype = new Map(); const usedIngredients = new Set();
  const compiled = []; let minEnergy = Infinity; let maxEnergy = -Infinity;
  for (const candidate of recipes) {
    const id = String(candidate.proposalRecipeId || '');
    if (!id || seenIds.has(id)) fail(`Duplicate/missing proposalRecipeId ${id}`);
    seenIds.add(id);
    const job = replacementJob(candidate.replacementJobId);
    const gapRow = gapByJob.get(candidate.replacementJobId);
    if (!gapRow || Number(gapRow.replacementTargetToRestoreOriginalQuota || 0) <= 0) fail(`Recipe proposal targets non-gap job ${candidate.replacementJobId}`);
    if (candidate.mealArchetype !== job.mealArchetype) fail(`Meal/job mismatch ${id}`);
    if (Number(candidate.targetEnergyKcal?.min) !== job.minKcal || Number(candidate.targetEnergyKcal?.max) !== job.maxKcal) fail(`Energy target/job mismatch ${id}`);
    const archetype = archetypeById.get(candidate.culinaryArchetypeId);
    if (!archetype || !(archetype.mealArchetypes || []).includes(candidate.mealArchetype)) fail(`Invalid culinary archetype on ${id}`);
    const titleIt = String(candidate.i18n?.it?.title || '').trim(); const titleEn = String(candidate.i18n?.en?.title || '').trim();
    if (titleIt.length < 5 || titleIt.length > 70 || titleEn.length < 5 || titleEn.length > 70) fail(`Invalid title length on ${id}`);
    if (/[()]/.test(`${titleIt}${titleEn}`) || /come venduto|as sold|ing_fdc_|planner validation|validazione del planner/i.test(`${titleIt} ${titleEn}`)) fail(`Source-like title on ${id}`);
    if (seenTitlesIt.has(titleIt) || seenTitlesEn.has(titleEn)) fail(`Duplicate generated title on ${id}`);
    seenTitlesIt.add(titleIt); seenTitlesEn.add(titleEn);
    if (!(candidate.method?.it || []).length || !(candidate.method?.en || []).length) fail(`Missing bilingual method on ${id}`);
    if (candidate.calculatedNutrition || candidate.allergenIds) fail(`Authored proposal must not provide derived nutrition/allergens on ${id}`);
    const authoredLines = candidate.ingredientLines || [];
    if (!authoredLines.length || new Set(authoredLines.map(line => line.ingredientRevisionId)).size !== authoredLines.length) fail(`Invalid ingredient lines on ${id}`);
    const usedSlots = new Set(); const normalizedLines = []; const usedRevisionMap = new Map();
    for (const line of authoredLines) {
      const revision = revisionById.get(line.ingredientRevisionId); const role = roleById.get(line.roleId);
      if (!revision) fail(`Unknown IngredientRevision ${line.ingredientRevisionId} on ${id}`);
      if (!role || !(role.ingredientRevisionIds || []).includes(line.ingredientRevisionId)) fail(`Role membership mismatch ${line.roleId}/${line.ingredientRevisionId} on ${id}`);
      const amount = Number(line.amountG);
      if (!(amount > 0)) fail(`Invalid authored amount on ${id}`);
      const slotIndex = (archetype.slots || []).findIndex((slot, index) => !usedSlots.has(index) && roleFitsSlot(line.roleId, slot) && amount >= Number(slot.minG || 0) && amount <= Number(slot.maxG || Infinity));
      if (slotIndex < 0) fail(`No compatible archetype slot for ${line.roleId} on ${id}`);
      usedSlots.add(slotIndex);
      const family = familyById.get(revision.ingredientId);
      if (!family || family.currentRevisionId !== revision.ingredientRevisionId) fail(`Recipe proposal must use current IngredientRevision ${line.ingredientRevisionId}`);
      const normalized = normalizeIngredientAmount(revision, amount, 'g');
      normalizedLines.push({ ingredientId: revision.ingredientId, ingredientRevisionId: revision.ingredientRevisionId, amount, unit: 'g', ...normalized, optional: false, notesKey: null, roleId: line.roleId });
      usedRevisionMap.set(revision.ingredientRevisionId, revision); usedIngredients.add(revision.ingredientId);
    }
    for (let index = 0; index < (archetype.slots || []).length; index += 1) if (!archetype.slots[index].optional && !usedSlots.has(index)) fail(`Missing required archetype slot ${index} on ${id}`);
    const setKey = ingredientSetKey(normalizedLines.map(line => line.ingredientId));
    if (baselineIngredientSets.has(setKey)) fail(`Exact ingredient-set duplicate with baseline on ${id}`);
    if (seenIngredientSets.has(setKey)) fail(`Exact ingredient-set duplicate inside proposal on ${id}`);
    seenIngredientSets.add(setKey);
    const nutrition = calculateRecipeNutrition(normalizedLines, usedRevisionMap);
    const allergenIds = deriveAllergens(normalizedLines, usedRevisionMap);
    if (nutrition.energyKcal < job.minKcal || nutrition.energyKcal > job.maxKcal) fail(`Derived energy outside target on ${id}: ${nutrition.energyKcal}`);
    minEnergy = Math.min(minEnergy, nutrition.energyKcal); maxEnergy = Math.max(maxEnergy, nutrition.energyKcal);
    byJob.set(candidate.replacementJobId, (byJob.get(candidate.replacementJobId) || 0) + 1);
    byMeal.set(candidate.mealArchetype, (byMeal.get(candidate.mealArchetype) || 0) + 1);
    byArchetype.set(candidate.culinaryArchetypeId, (byArchetype.get(candidate.culinaryArchetypeId) || 0) + 1);
    compiled.push({ ...structuredClone(candidate), normalizedIngredientLines: normalizedLines, calculatedNutrition: nutrition, allergenIds });
  }
  for (const row of gap.bands || []) {
    const actual = byJob.get(row.jobId) || 0; const expected = Number(row.replacementTargetToRestoreOriginalQuota || 0);
    if (actual !== expected) fail(`Replacement gap mismatch ${row.jobId}: expected=${expected} actual=${actual}`);
  }
  const proposalByJob = proposal.summary?.byReplacementJob || {};
  for (const [jobId, count] of byJob) if (Number(proposalByJob[jobId] || 0) !== count) fail(`Proposal summary job mismatch ${jobId}`);
  const totalGap = (gap.bands || []).reduce((sum, row) => sum + Number(row.replacementTargetToRestoreOriginalQuota || 0), 0);
  if (totalGap !== recipes.length) fail(`Gap total ${totalGap} does not match generated recipe count ${recipes.length}`);
  const report = {
    schemaVersion: 1, proposalId: proposal.proposalId, status: 'reconciled', mode: materialize ? 'materialize' : 'check', baseline: baselineActual,
    result: { candidateCount: recipes.length, derivedAcceptedCount: compiled.length, gapJobs: byJob.size, mealCounts: Object.fromEntries([...byMeal].sort()), archetypeCounts: Object.fromEntries([...byArchetype].sort()), distinctIngredientIds: usedIngredients.size, minEnergyKcal: Math.round(minEnergy * 10) / 10, maxEnergyKcal: Math.round(maxEnergy * 10) / 10 },
    invariants: { fuzzyMatchingUsed: false, automaticAmountFittingUsed: false, authoredNutritionUsed: false, authoredAllergensUsed: false, exactGapMatrixRestored: true, canonicalCatalogMutated: false, unresolved: 0 }
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, proposal.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'compiled-recipe-proposals.json'), compiled),
      writeJson(path.join(dir, 'replacement-matrix.json'), { schemaVersion: 1, proposalId: proposal.proposalId, jobs: Object.fromEntries([...byJob].sort()) }),
      writeJson(path.join(dir, 'materialization.json'), { schemaVersion: 1, proposalId: proposal.proposalId, result: report.result, promotionState: 'staging_generation_only', canonicalCatalogMutated: false, generatedAt: MATERIALIZED_AT })
    ]);
  }
  return report;
}

async function reconcileCorpusSimulation(proposalDir, baseline, registry, { materialize = false } = {}) {
  const proposalFile = path.join(proposalDir, 'corpus-simulation-proposal.json');
  const proposal = await readJson(proposalFile);
  if (proposal.proposalType !== 'corpus_simulation') fail(`Unsupported proposalType ${proposal.proposalType}`);
  const baselineActual = validateBaseline(proposal, baseline);
  const dependencyFiles = {
    ingredientSemanticProposalSha256: path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'ingredient-semantic-proposal.json'),
    proposedProductTermsSha256: path.join(ACTIVE_ROOT, 'ingredient-semantic-consolidation-round1', 'proposed-product-terms.json'),
    recipeSemanticProposalSha256: path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-proposal.json'),
    recipeSemanticReviewSha256: path.join(ACTIVE_ROOT, 'recipe-semantic-consolidation-round1', 'recipe-semantic-review.json'),
    culinaryGenerationPolicySha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'culinary-generation-policy.json'),
    rolePoolsSha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'role-pools-v2.json'),
    archetypesSha256: path.join(ACTIVE_ROOT, 'culinary-generation-policy-v2', 'archetypes-v2.json'),
    recipeReworkPlanSha256: path.join(ACTIVE_ROOT, 'recipe-rework-planning-round1', 'recipe-rework-plan.json'),
    gapMatrixSha256: path.join(ACTIVE_ROOT, 'recipe-rework-planning-round1', 'gap-matrix.json'),
    recipeGenerationProposalSha256: path.join(ACTIVE_ROOT, 'recipe-generation-replacements-round1', 'recipe-generation-proposal.json'),
    recipeProposalsSha256: path.join(ACTIVE_ROOT, 'recipe-generation-replacements-round1', 'recipe-proposals.json')
  };
  for (const [key, file] of Object.entries(dependencyFiles)) {
    if (!await exists(file)) fail(`T4-E dependency missing: ${file}`);
    if (proposal.baseline?.[key] !== await sha256File(file)) fail(`STALE T4-E proposal: ${key} mismatch`);
  }
  if (proposal.promotionPolicy?.canonicalCatalogMutationAllowed !== false) fail('T4-E must remain staging-only');
  const simulation = await simulateT4EFinalCorpus({ root: ROOT, baseline, registry });
  const sim = simulation.report;
  if (sim.finalRecipeCount !== Number(proposal.expected?.finalRecipeCount)) fail(`T4-E final recipe count mismatch ${sim.finalRecipeCount}`);
  if (sim.energyBands.length !== Number(proposal.expected?.phaseBEnergyBandJobs) || !sim.energyBands.every(row => row.exact)) fail('T4-E did not restore the complete Phase B quota matrix');
  for (const [key, expected] of Object.entries(proposal.expected?.sourceCounts || {})) if (Number(sim.sourceCounts[key] || 0) !== Number(expected)) fail(`T4-E source count mismatch ${key}`);
  if (sim.duplicates.exactRecipeSignatureGroups.length) fail(`T4-E exact recipe signature duplicates=${sim.duplicates.exactRecipeSignatureGroups.length}`);
  if (sim.duplicates.nearDuplicatePairs.length) fail(`T4-E same-meal near duplicates=${sim.duplicates.nearDuplicatePairs.length}`);
  if (!sim.promotionPreflight.technicalPass) fail('T4-E technical preflight failed');

  const report = {
    schemaVersion: 1,
    proposalId: proposal.proposalId,
    status: 'reconciled',
    mode: materialize ? 'materialize' : 'check',
    baseline: baselineActual,
    result: {
      finalRecipeCount: sim.finalRecipeCount,
      sourceCounts: sim.sourceCounts,
      phaseBEnergyBandJobs: sim.energyBands.length,
      exactPhaseBQuotas: sim.energyBands.every(row => row.exact),
      exactRecipeSignatureDuplicateGroups: sim.duplicates.exactRecipeSignatureGroups.length,
      sameMealNearDuplicatePairs: sim.duplicates.nearDuplicatePairs.length,
      exactIngredientSetDuplicateGroups: sim.duplicates.exactIngredientSetGroups.length,
      semanticConceptDuplicateGroups: sim.duplicates.semanticConceptGroups.length,
      semanticConceptDuplicateExcess: sim.duplicates.semanticConceptExcess,
      duplicateTitleGroups: sim.duplicates.titleGroups.length,
      duplicateTitleExcess: sim.duplicates.titleExcess,
      presentationReviewCount: sim.editorial.presentationReviewCount,
      repairCandidateCountDrift: sim.repairReplay.countDrift,
      dietCounts: sim.dietCounts,
      practicalCounts: sim.practicalCounts,
      promotionEligible: sim.promotionPreflight.promotionEligible,
      additionalReplacementNeed: sim.promotionPreflight.additionalReplacementNeed
    },
    invariants: {
      automaticAmountFittingUsed: false,
      fuzzyMatchingUsed: false,
      authoredNutritionTrusted: false,
      canonicalCatalogMutated: false,
      technicalPreflightPassed: sim.promotionPreflight.technicalPass
    },
    promotionPreflight: sim.promotionPreflight
  };
  if (materialize) {
    const dir = path.join(OUTPUT_ROOT, proposal.proposalId);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    await Promise.all([
      writeJson(path.join(dir, 'reconciliation-report.json'), report),
      writeJson(path.join(dir, 'simulated-recipe-versions.json'), simulation.finalRecipeVersions),
      writeJson(path.join(dir, 'simulated-recipe-families.json'), simulation.finalRecipeFamilies),
      writeJson(path.join(dir, 'simulated-ingredient-revisions.json'), simulation.semanticIngredientRevisions),
      writeJson(path.join(dir, 'coverage-report.json'), { schemaVersion: 1, proposalId: proposal.proposalId, energyBands: sim.energyBands, dietCounts: sim.dietCounts, practicalCounts: sim.practicalCounts }),
      writeJson(path.join(dir, 'duplicate-report.json'), { schemaVersion: 1, proposalId: proposal.proposalId, ...sim.duplicates }),
      writeJson(path.join(dir, 'repair-replay-report.json'), { schemaVersion: 1, proposalId: proposal.proposalId, ...sim.repairReplay }),
      writeJson(path.join(dir, 'promotion-preflight.json'), { schemaVersion: 1, proposalId: proposal.proposalId, ...sim.promotionPreflight }),
      writeJson(path.join(dir, 'post-simulation-adjustments.json'), {
        schemaVersion: 1,
        proposalId: proposal.proposalId,
        additionalReplacementNeed: sim.promotionPreflight.additionalReplacementNeed,
        semanticConceptDuplicateGroups: sim.duplicates.semanticConceptGroups.length,
        titleCollisionGroups: sim.duplicates.titleGroups.length,
        exactIngredientSetGroups: sim.duplicates.exactIngredientSetGroups.length,
        presentationReviewCount: sim.editorial.presentationReviewCount,
        recommendation: 'Resolve semantic duplicate excess first, then refresh presentation for repaired/conversion recipes before canonical promotion.'
      }),
      writeJson(path.join(dir, 'materialization.json'), { schemaVersion: 1, proposalId: proposal.proposalId, result: report.result, promotionState: report.result.promotionEligible ? 'staging_ready_for_promotion' : 'staging_blocked', canonicalCatalogMutated: false, generatedAt: MATERIALIZED_AT })
    ]);
  }
  return report;
}

async function main() {
  const materialize = process.argv.includes('--materialize');
  const check = process.argv.includes('--check') || !materialize;
  const proposalArg = process.argv.find(arg => arg.startsWith('--proposal-dir='));
  const proposalDirs = proposalArg
    ? [path.resolve(ROOT, proposalArg.slice('--proposal-dir='.length))]
    : (await readdir(ACTIVE_ROOT, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => path.join(ACTIVE_ROOT, item.name)).sort();
  if (!proposalDirs.length) { console.log('Data proposal reconciliation: no active proposals.'); return; }
  const baseline = await loadBaseline();
  const registry = new SchemaRegistry(async file => JSON.parse(await readFile(path.join(ROOT, 'schemas', file), 'utf8'))); await registry.loadAll();
  const reports = [];
  for (const dir of proposalDirs) {
    if (await exists(path.join(dir, 'ingredient-semantic-proposal.json'))) reports.push(await reconcileIngredientProposal(dir, baseline, registry, { materialize }));
    else if (await exists(path.join(dir, 'recipe-semantic-proposal.json'))) reports.push(await reconcileRecipeProposal(dir, baseline, { materialize }));
    else if (await exists(path.join(dir, 'culinary-generation-policy.json'))) reports.push(await reconcileCulinaryPolicy(dir, baseline, { materialize }));
    else if (await exists(path.join(dir, 'recipe-rework-plan.json'))) reports.push(await reconcileReworkPlan(dir, baseline, { materialize }));
    else if (await exists(path.join(dir, 'recipe-generation-proposal.json'))) reports.push(await reconcileRecipeGenerationProposal(dir, baseline, { materialize }));
    else if (await exists(path.join(dir, 'corpus-simulation-proposal.json'))) reports.push(await reconcileCorpusSimulation(dir, baseline, registry, { materialize }));
    else fail(`No supported proposal document found in ${dir}`);
  }
  for (const report of reports) {
    if (report.result.ingredientChangesApplied !== undefined) console.log(`PASS ${report.proposalId}: changes=${report.result.ingredientChangesApplied}, termsAdded=${report.result.taxonomyTermsAdded}, productTerms=${report.result.productFoodTermCount}, mode=${report.mode}`);
    else if (report.result.recipeVersionsReviewed !== undefined) console.log(`PASS ${report.proposalId}: reviewed=${report.result.recipeVersionsReviewed}, keep=${report.result.counts.KEEP_RENAME}, rework=${report.result.counts.REWORK}, retire=${report.result.counts.RETIRE}, duplicates=${report.result.counts.CONSOLIDATE_DUPLICATE}, mode=${report.mode}`);
    else if (report.result.roleCount !== undefined) console.log(`PASS ${report.proposalId}: roles=${report.result.roleCount}, archetypes=${report.result.archetypeCount}, assignments=${report.result.roleAssignments}, mode=${report.mode}`);
    else if (report.result.derivedAcceptedCount !== undefined) console.log(`PASS ${report.proposalId}: candidates=${report.result.candidateCount}, accepted=${report.result.derivedAcceptedCount}, jobs=${report.result.gapJobs}, ingredients=${report.result.distinctIngredientIds}, mode=${report.mode}`);
    else if (report.result.finalRecipeCount !== undefined) console.log(`PASS ${report.proposalId}: final=${report.result.finalRecipeCount}, bands=${report.result.phaseBEnergyBandJobs}, semanticDupGroups=${report.result.semanticConceptDuplicateGroups}, titleDupGroups=${report.result.duplicateTitleGroups}, promotion=${report.result.promotionEligible ? 'eligible' : 'blocked'}, mode=${report.mode}`);
    else console.log(`PASS ${report.proposalId}: rework=${report.result.reworkCount}, strict=${report.result.strictLocalRepairCount}, convert=${report.result.archetypeConversionCount}, rebuild=${report.result.rebuildReplacementCount}, replacements=${report.result.replacementTarget}, mode=${report.mode}`);
  }
  if (check) console.log(`Data proposal reconciliation PASS (${reports.length}/${reports.length})`);
}

await main();
