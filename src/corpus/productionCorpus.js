import { sha256Json, sha256Text } from '../lib/crypto.js';
import { assertReferenceData, referenceDataDigest, TAXONOMY_IDS } from '../services/referenceDataService.js';

const RESOLVED_REQUEST_STATES = new Set(['reused', 'materialized', 'resolved']);
const REQUIRED_LIFECYCLE_STATES = ['discovered', 'needs_reference_review', 'needs_ingredient_review', 'ready_for_generation', 'generated', 'accepted', 'rejected'];

function clone(value) { return structuredClone(value); }
function unique(values) { return [...new Set(values)]; }
function normalizeLookup(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function check(id, pass, detail, statusWhenFalse = 'blocked') { return { id, status: pass ? 'pass' : statusWhenFalse, detail }; }
function increment(object, key) { object[key] = (object[key] || 0) + 1; }
function activeCurrentRecipeCount(recipeFamilies = [], recipeVersions = []) {
  const versions = new Set(recipeVersions.map(item => item.recipeVersionId));
  return recipeFamilies.filter(item => item.status === 'active' && versions.has(item.currentVersionId)).length;
}
function activeIngredientEntries(ingredientFamilies = [], ingredientRevisions = []) {
  const byId = new Map(ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  return ingredientFamilies.filter(item => item.status === 'active').map(family => ({ family, revision: byId.get(family.currentRevisionId) || null }));
}

export async function productionContractDigest(contract) { return sha256Json(contract); }

export function productionContractDiagnostics(contract, policy) {
  const errors = [];
  if (!contract || !policy) return { valid: false, errors: ['Production contract and corpus policy are required'] };
  if (contract.policyId !== policy.policyId) errors.push(`contract policyId ${contract.policyId} does not match ${policy.policyId}`);
  if (contract.policyVersion !== policy.policyVersion) errors.push(`contract policyVersion ${contract.policyVersion} does not match ${policy.policyVersion}`);
  const target = contract.productionTarget || {};
  if (target.minRecipes !== policy.targetCorpus?.min) errors.push(`contract minRecipes ${target.minRecipes} does not match policy ${policy.targetCorpus?.min}`);
  if (target.targetRecipes !== policy.targetCorpus?.target) errors.push(`contract targetRecipes ${target.targetRecipes} does not match policy ${policy.targetCorpus?.target}`);
  if (target.maxRecipes !== policy.targetCorpus?.max) errors.push(`contract maxRecipes ${target.maxRecipes} does not match policy ${policy.targetCorpus?.max}`);
  if (!(target.minRecipes <= target.targetRecipes && target.targetRecipes <= target.maxRecipes)) errors.push('productionTarget must satisfy min <= target <= max');
  const pilot = contract.pilot || {};
  const stratumTotal = (pilot.strata || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (stratumTotal !== pilot.targetCandidates) errors.push(`pilot strata total ${stratumTotal} does not match targetCandidates ${pilot.targetCandidates}`);
  if (!(pilot.minCandidates <= pilot.targetCandidates && pilot.targetCandidates <= pilot.maxCandidates)) errors.push('pilot must satisfy minCandidates <= targetCandidates <= maxCandidates');
  if (pilot.waveSize > pilot.targetCandidates) errors.push('pilot waveSize cannot exceed targetCandidates');
  const lifecycle = new Set(contract.candidateLifecycle?.states || []);
  for (const state of REQUIRED_LIFECYCLE_STATES) if (!lifecycle.has(state)) errors.push(`candidateLifecycle is missing ${state}`);
  if (!contract.requiredLocales?.includes('it') || !contract.requiredLocales?.includes('en')) errors.push('production contract must require both it and en locales');
  return { valid: errors.length === 0, errors };
}

export function assertProductionContract(contract, policy, registry = null) {
  registry?.assert('productionCorpusContract', contract);
  const result = productionContractDiagnostics(contract, policy);
  if (!result.valid) throw new Error(`Production corpus contract validation failed: ${result.errors.join('; ')}`);
  return contract;
}

export function productionIngredientIssues({ family, revision, contract, referenceIndex = null, registry = null }) {
  const issues = [];
  if (!family) return ['missing_family'];
  if (!revision) return ['missing_current_revision'];
  try { registry?.assert('ingredient', family); } catch { issues.push('ingredient_schema'); }
  try { registry?.assert('ingredientRevision', revision); } catch { issues.push('ingredient_revision_schema'); }
  if (revision.ingredientId !== family.ingredientId) issues.push('current_revision_family_mismatch');
  if (revision.quality?.status !== contract.ingredientReadiness.qualityStatus) issues.push('quality_not_curated');
  if (revision.quality?.confidence !== contract.ingredientReadiness.confidence) issues.push('confidence_not_high');
  if (contract.ingredientReadiness.requireSourceLabel && !revision.source?.label?.trim()) issues.push('missing_source_label');
  if (!revision.source?.type) issues.push('missing_source_type');
  for (const field of contract.ingredientReadiness.requiredNutritionFields || []) {
    if (!Number.isFinite(revision.nutrition?.[field]) || revision.nutrition[field] < 0) issues.push(`invalid_nutrition_${field}`);
  }
  if (referenceIndex) {
    try { referenceIndex.assertTerm(revision.taxonomy?.foodGroup, TAXONOMY_IDS.foodCategory); } catch { issues.push('invalid_food_group'); }
    if (revision.taxonomy?.foodSubgroup) {
      try {
        const subgroup = referenceIndex.assertTerm(revision.taxonomy.foodSubgroup, TAXONOMY_IDS.foodCategory);
        if (subgroup.parentTermId !== revision.taxonomy.foodGroup) issues.push('invalid_food_subgroup_parent');
      } catch { issues.push('invalid_food_subgroup'); }
    }
    try { referenceIndex.assertTerm(revision.taxonomy?.flavorProfile, TAXONOMY_IDS.flavorProfile); } catch { issues.push('invalid_flavor_profile'); }
  }
  return unique(issues);
}

export async function assessProductionReadiness({ contract, policy, corpus, registry = null, generatedAt = null }) {
  const checks = [];
  const contractResult = productionContractDiagnostics(contract, policy);
  checks.push(check('contract-policy-sync', contractResult.valid, contractResult.valid ? `${contract.contractId}@${contract.contractVersion} matches ${policy.policyId}@${policy.policyVersion}` : contractResult.errors.join('; ')));

  let referenceIndex = null;
  let actualDigest = null;
  let referenceValid = false;
  try {
    referenceIndex = assertReferenceData(corpus.taxonomies || [], corpus.taxonomyTerms || [], registry);
    actualDigest = await referenceDataDigest(corpus.taxonomies || [], corpus.taxonomyTerms || []);
    referenceValid = true;
  } catch (error) {
    checks.push(check('reference-data-valid', false, error.message));
  }
  if (referenceValid) checks.push(check('reference-data-valid', true, `taxonomies=${(corpus.taxonomies || []).length}, terms=${(corpus.taxonomyTerms || []).length}`));
  const manifestDigest = corpus.manifest?.referenceDataDigest || null;
  const digestMatches = Boolean(actualDigest && manifestDigest && actualDigest === manifestDigest);
  checks.push(check('reference-data-digest', digestMatches, `manifest=${manifestDigest || 'missing'}, actual=${actualDigest || 'invalid'}`));

  const entries = activeIngredientEntries(corpus.ingredientFamilies || [], corpus.ingredientRevisions || []);
  const blockedByReason = {};
  let readyIngredients = 0;
  for (const entry of entries) {
    const issues = productionIngredientIssues({ ...entry, contract, referenceIndex, registry });
    if (issues.length) for (const issue of issues) increment(blockedByReason, issue);
    else readyIngredients += 1;
  }
  const blockedIngredients = entries.length - readyIngredients;
  const minIngredients = contract.ingredientReadiness.minActiveIngredients;
  checks.push(check('ingredient-production-quality', blockedIngredients === 0, `ready=${readyIngredients}, blocked=${blockedIngredients}`));
  checks.push(check('ingredient-production-count', readyIngredients >= minIngredients, `ready=${readyIngredients}, required>=${minIngredients}`));

  const activeRecipes = activeCurrentRecipeCount(corpus.recipeFamilies || [], corpus.recipeVersions || []);
  checks.push(check('recipe-production-count', activeRecipes >= contract.productionTarget.minRecipes, `active=${activeRecipes}, required>=${contract.productionTarget.minRecipes}`));

  const manifestProduction = corpus.manifest?.productionCorpus || null;
  const expectedContractDigest = await productionContractDigest(contract);
  const manifestContractMatches = Boolean(
    manifestProduction &&
    manifestProduction.contractId === contract.contractId &&
    manifestProduction.contractVersion === contract.contractVersion &&
    manifestProduction.contractDigest === expectedContractDigest &&
    manifestProduction.policyId === policy.policyId &&
    manifestProduction.policyVersion === policy.policyVersion
  );
  checks.push(check('production-manifest-contract', manifestContractMatches, manifestProduction ? `manifest=${manifestProduction.contractId}@${manifestProduction.contractVersion}` : 'productionCorpus metadata missing'));

  const blockers = checks.filter(item => item.status === 'blocked').map(item => `${item.id}: ${item.detail}`);
  const pilotCheckIds = new Set(['contract-policy-sync', 'reference-data-valid', 'reference-data-digest', 'ingredient-production-quality', 'ingredient-production-count']);
  const pilotBlockers = checks.filter(item => item.status === 'blocked' && pilotCheckIds.has(item.id)).map(item => `${item.id}: ${item.detail}`);
  const readyForPilot = contractResult.valid && referenceValid && digestMatches && blockedIngredients === 0 && readyIngredients >= minIngredients;
  const readyForProduction = readyForPilot && activeRecipes >= contract.productionTarget.minRecipes && manifestContractMatches;
  const report = {
    schemaVersion: 1,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    catalogVersion: corpus.manifest?.catalogVersion || corpus.catalogVersion || 'unknown',
    generatedAt: generatedAt || new Date().toISOString(),
    checks,
    referenceData: {
      valid: referenceValid,
      manifestDigest,
      actualDigest,
      taxonomyCount: (corpus.taxonomies || []).length,
      termCount: (corpus.taxonomyTerms || []).length
    },
    ingredients: {
      activeFamilies: entries.length,
      productionReadyFamilies: readyIngredients,
      blockedFamilies: blockedIngredients,
      blockedByReason
    },
    recipes: {
      activeRecipes,
      requiredMinimum: contract.productionTarget.minRecipes,
      target: contract.productionTarget.targetRecipes
    },
    readyForPilot,
    readyForProduction,
    pilotBlockers,
    blockers
  };
  registry?.assert('productionCorpusReadinessReport', report);
  return report;
}

export async function planPilotIntake({ contract, referenceDataVersion, referenceDataDigest, seed = 'phase4-production-pilot-v1', createdAt = null, registry = null }) {
  registry?.assert('productionCorpusContract', contract);
  if (!referenceDataVersion || !referenceDataDigest) throw new Error('Pilot intake requires frozen referenceDataVersion and referenceDataDigest');
  const timestamp = createdAt || new Date().toISOString();
  const intakeHash = await sha256Text(`${contract.contractId}\n${contract.contractVersion}\n${seed}\n${referenceDataVersion}\n${referenceDataDigest}`);
  const records = [];
  for (const stratum of contract.pilot.strata) {
    for (let index = 1; index <= stratum.count; index += 1) {
      const candidateId = `pilot-${stratum.stratumId}-${String(index).padStart(3, '0')}`;
      records.push({
        candidateId,
        stratumId: stratum.stratumId,
        state: 'discovered',
        referenceScanStatus: 'pending',
        concept: { mealArchetypes: [...stratum.mealArchetypes], focus: [...stratum.focus], rationale: stratum.rationale },
        referenceRequests: [],
        jobId: null,
        generatedAt: null,
        outcome: null,
        audit: [{ at: timestamp, action: 'pilot_slot_created', detail: `Created from production contract stratum ${stratum.stratumId}` }]
      });
    }
  }
  if (records.length !== contract.pilot.targetCandidates) throw new Error(`Pilot plan produced ${records.length} records, expected ${contract.pilot.targetCandidates}`);
  const intake = {
    schemaVersion: 1,
    intakeId: `pilot-${intakeHash.slice(0, 20)}`,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    seed,
    referenceDataVersion,
    referenceDataDigest,
    targetCandidateCount: records.length,
    records,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  registry?.assert('productionCorpusIntake', intake);
  return intake;
}

function matchingTermIds(index, request) {
  if (!request.taxonomyId) return [];
  return unique([
    request.resolvedId,
    request.proposedTermId,
    request.labels?.it,
    request.labels?.en
  ].filter(Boolean).map(value => index.resolveLegacy(request.taxonomyId, value)).filter(Boolean));
}

export async function proposeReferenceDataForRequest({ request, taxonomies, taxonomyTerms, existingProposals = [], registry = null, createdAt = null }) {
  if (request.kind !== 'taxonomy_term') throw new Error('ReferenceDataProposal can only be created for taxonomy_term requests');
  if (!request.taxonomyId) throw new Error(`Reference request ${request.requestId} is missing taxonomyId`);
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const taxonomy = index.taxonomy(request.taxonomyId);
  if (!taxonomy || taxonomy.status !== 'active') throw new Error(`Unknown or inactive taxonomy ${request.taxonomyId}`);
  const matches = matchingTermIds(index, request);
  if (matches.length === 1) return { action: 'reuse', termId: matches[0], proposal: null };
  if (!taxonomy.extensibleBy?.includes('editorial_pipeline')) throw new Error(`Taxonomy ${request.taxonomyId} is closed to editorial_pipeline expansion`);
  if (!request.proposedTermId) throw new Error(`Reference request ${request.requestId} needs proposedTermId before proposal creation`);
  if (taxonomy.hierarchical && request.parentTermId) {
    const parent = index.assertTerm(request.parentTermId, request.taxonomyId);
    if (parent.status !== 'active') throw new Error(`Parent ${request.parentTermId} is not active`);
  }
  if (!taxonomy.hierarchical && request.parentTermId) throw new Error(`Non-hierarchical taxonomy ${request.taxonomyId} cannot use parentTermId`);
  const timestamp = createdAt || new Date().toISOString();
  const proposalHash = await sha256Text(`${request.taxonomyId}\n${request.proposedTermId}\n${request.labels.it}\n${request.labels.en}`);
  const proposalId = request.proposalId || `rdp-${proposalHash.slice(0, 20)}`;
  const existing = existingProposals.find(item => item.proposalId === proposalId);
  if (existing) return { action: existing.status === 'materialized' ? 'materialized' : 'proposal_exists', termId: existing.materializedTermId || null, proposal: clone(existing) };
  const collisionCandidateTermIds = matches;
  const proposal = {
    schemaVersion: 1,
    proposalId,
    taxonomyId: request.taxonomyId,
    proposedTermId: request.proposedTermId,
    parentTermId: request.parentTermId || null,
    i18n: {
      it: { label: request.labels.it, description: '' },
      en: { label: request.labels.en, description: '' }
    },
    aliases: { it: [], en: [] },
    rationale: request.rationale,
    provenance: {
      sourceType: 'pipeline',
      sourceLabel: 'Phase 4 production corpus intake',
      reference: request.requestId,
      rationale: request.rationale
    },
    status: collisionCandidateTermIds.length ? 'needs_review' : 'proposed',
    collisionCandidateTermIds,
    reviewNotes: null,
    materializedTermId: null,
    createdAt: timestamp,
    reviewedAt: null
  };
  registry?.assert('referenceDataProposal', proposal);
  return { action: proposal.status, termId: null, proposal };
}

function searchTokensForTerm(proposal) {
  return unique([
    proposal.proposedTermId,
    proposal.i18n.it.label,
    proposal.i18n.en.label,
    ...(proposal.aliases?.it || []),
    ...(proposal.aliases?.en || [])
  ].map(normalizeLookup).filter(Boolean)).sort();
}

export async function materializeApprovedReferenceDataProposal({ proposal, taxonomies, taxonomyTerms, registry = null, materializedAt = null }) {
  registry?.assert('referenceDataProposal', proposal);
  if (proposal.status !== 'approved') throw new Error(`Proposal ${proposal.proposalId} must be approved before materialization`);
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const taxonomy = index.taxonomy(proposal.taxonomyId);
  if (!taxonomy?.extensibleBy?.includes('editorial_pipeline')) throw new Error(`Taxonomy ${proposal.taxonomyId} is not extensible by editorial_pipeline`);
  if (index.term(proposal.proposedTermId)) throw new Error(`Taxonomy term ${proposal.proposedTermId} already exists`);
  if (proposal.parentTermId) index.assertTerm(proposal.parentTermId, proposal.taxonomyId);
  const timestamp = materializedAt || new Date().toISOString();
  const term = {
    schemaVersion: 1,
    termId: proposal.proposedTermId,
    taxonomyId: proposal.taxonomyId,
    origin: 'base',
    parentTermId: proposal.parentTermId,
    i18n: clone(proposal.i18n),
    aliases: clone(proposal.aliases),
    legacyKeys: [],
    status: 'active',
    supersedesTermId: null,
    provenance: clone(proposal.provenance),
    searchTokens: searchTokensForTerm(proposal),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  registry?.assert('taxonomyTerm', term);
  assertReferenceData(taxonomies, [...taxonomyTerms, term], registry);
  const updatedProposal = { ...clone(proposal), status: 'materialized', materializedTermId: term.termId, reviewedAt: proposal.reviewedAt || timestamp };
  registry?.assert('referenceDataProposal', updatedProposal);
  return {
    term,
    proposal: updatedProposal,
    referenceDataDigest: await referenceDataDigest(taxonomies, [...taxonomyTerms, term])
  };
}

function ingredientLookup(ingredientFamilies, ingredientRevisions) {
  const revisionById = new Map(ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
  const entries = ingredientFamilies.filter(item => item.status === 'active').map(family => ({ family, revision: revisionById.get(family.currentRevisionId) || null })).filter(item => item.revision);
  const lookup = new Map();
  for (const entry of entries) {
    for (const value of [entry.family.ingredientId, entry.revision.i18n?.it?.name, entry.revision.i18n?.en?.name, ...(entry.revision.i18n?.it?.aliases || []), ...(entry.revision.i18n?.en?.aliases || [])].filter(Boolean)) {
      const key = normalizeLookup(value);
      if (!lookup.has(key)) lookup.set(key, new Set());
      lookup.get(key).add(entry.family.ingredientId);
    }
  }
  return { entries, lookup };
}

function resolveIngredientRequest(request, ingredientFamilies, ingredientRevisions, contract, referenceIndex, registry) {
  const { entries, lookup } = ingredientLookup(ingredientFamilies, ingredientRevisions);
  let candidateIds = [];
  if (request.resolvedId) candidateIds = [request.resolvedId];
  else {
    const matches = new Set();
    for (const value of [request.labels?.it, request.labels?.en].filter(Boolean)) for (const id of lookup.get(normalizeLookup(value)) || []) matches.add(id);
    candidateIds = [...matches];
  }
  if (candidateIds.length !== 1) return { resolved: false, resolvedId: candidateIds.length === 1 ? candidateIds[0] : null, reason: candidateIds.length > 1 ? 'ambiguous_ingredient' : 'ingredient_missing' };
  const entry = entries.find(item => item.family.ingredientId === candidateIds[0]);
  if (!entry) return { resolved: false, resolvedId: candidateIds[0], reason: 'ingredient_missing' };
  const issues = productionIngredientIssues({ ...entry, contract, referenceIndex, registry });
  return issues.length ? { resolved: false, resolvedId: candidateIds[0], reason: `ingredient_not_production_ready:${issues.join(',')}` } : { resolved: true, resolvedId: candidateIds[0], reason: null };
}

export async function resolveProductionIntake({ intake, contract, taxonomies, taxonomyTerms, ingredientFamilies, ingredientRevisions, proposals = [], registry = null, resolvedAt = null }) {
  registry?.assert('productionCorpusIntake', intake);
  registry?.assert('productionCorpusContract', contract);
  if (intake.contractId !== contract.contractId || intake.contractVersion !== contract.contractVersion) throw new Error('Pilot intake contract does not match active production contract');
  const referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const output = clone(intake);
  const proposalList = clone(proposals);
  const timestamp = resolvedAt || new Date().toISOString();
  const summary = { discovered: 0, needsReferenceReview: 0, needsIngredientReview: 0, readyForGeneration: 0, rejected: 0, proposalsCreated: 0, termsReused: 0, ingredientReferencesResolved: 0 };

  for (const record of output.records) {
    if (record.state === 'accepted' || record.state === 'rejected' || record.state === 'generated') continue;
    if (record.referenceScanStatus !== 'complete') {
      record.state = 'discovered';
      summary.discovered += 1;
      continue;
    }
    let referenceBlocked = false;
    let ingredientBlocked = false;
    let rejected = false;
    for (const request of record.referenceRequests) {
      if (request.status === 'rejected') { rejected = true; continue; }
      if (request.kind === 'taxonomy_term') {
        if (request.resolvedId) {
          try {
            referenceIndex.assertTerm(request.resolvedId, request.taxonomyId);
            request.status = 'resolved';
            continue;
          } catch {}
        }
        if (request.proposalId) {
          const proposal = proposalList.find(item => item.proposalId === request.proposalId);
          if (proposal?.status === 'materialized' && proposal.materializedTermId) {
            referenceIndex.assertTerm(proposal.materializedTermId, request.taxonomyId);
            request.status = 'materialized';
            request.resolvedId = proposal.materializedTermId;
            continue;
          }
          if (proposal) {
            request.status = proposal.status;
            referenceBlocked = true;
            continue;
          }
        }
        const outcome = await proposeReferenceDataForRequest({ request, taxonomies, taxonomyTerms, existingProposals: proposalList, registry, createdAt: timestamp });
        if (outcome.action === 'reuse') {
          request.status = 'reused';
          request.resolvedId = outcome.termId;
          summary.termsReused += 1;
        } else {
          if (outcome.proposal && !proposalList.some(item => item.proposalId === outcome.proposal.proposalId)) {
            proposalList.push(outcome.proposal);
            summary.proposalsCreated += 1;
          }
          request.proposalId = outcome.proposal?.proposalId || request.proposalId;
          request.status = outcome.proposal?.status || request.status;
          referenceBlocked = true;
        }
      } else if (request.kind === 'ingredient') {
        const outcome = resolveIngredientRequest(request, ingredientFamilies, ingredientRevisions, contract, referenceIndex, registry);
        request.resolvedId = outcome.resolvedId;
        request.notes = outcome.reason;
        if (outcome.resolved) {
          request.status = 'resolved';
          summary.ingredientReferencesResolved += 1;
        } else {
          request.status = 'unresolved';
          ingredientBlocked = true;
        }
      }
    }
    if (rejected) { record.state = 'rejected'; summary.rejected += 1; }
    else if (referenceBlocked) { record.state = 'needs_reference_review'; summary.needsReferenceReview += 1; }
    else if (ingredientBlocked) { record.state = 'needs_ingredient_review'; summary.needsIngredientReview += 1; }
    else {
      record.state = 'ready_for_generation';
      summary.readyForGeneration += 1;
    }
    record.audit.push({ at: timestamp, action: 'reference_resolution', detail: `State resolved to ${record.state}` });
  }
  output.updatedAt = timestamp;
  registry?.assert('productionCorpusIntake', output);
  return { intake: output, proposals: proposalList, summary };
}

export function validateReadyIntakeForJob({ intake, contract, job, candidates, registry = null }) {
  registry?.assert('productionCorpusIntake', intake);
  registry?.assert('productionCorpusContract', contract);
  if (intake.contractId !== contract.contractId || intake.contractVersion !== contract.contractVersion) throw new Error('Production intake contract mismatch');
  if (job.referenceDataVersion !== intake.referenceDataVersion || job.referenceDataDigest !== intake.referenceDataDigest) throw new Error('Production intake reference-data snapshot does not match RecipeGenerationJob');
  if (job.pipelineVersion !== contract.pipelineVersion) throw new Error(`Production job must use pipelineVersion ${contract.pipelineVersion}`);
  const byId = new Map(intake.records.map(record => [record.candidateId, record]));
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) throw new Error(`Duplicate production candidateId ${candidate.candidateId}`);
    seen.add(candidate.candidateId);
    const record = byId.get(candidate.candidateId);
    if (!record) throw new Error(`Candidate ${candidate.candidateId} is missing from production intake ${intake.intakeId}`);
    if (record.state !== 'ready_for_generation') throw new Error(`Candidate ${candidate.candidateId} intake state is ${record.state}, expected ready_for_generation`);
    if (record.referenceScanStatus !== 'complete') throw new Error(`Candidate ${candidate.candidateId} has not completed reference scan`);
    const unresolved = record.referenceRequests.filter(request => !RESOLVED_REQUEST_STATES.has(request.status) || !request.resolvedId);
    if (unresolved.length) throw new Error(`Candidate ${candidate.candidateId} has ${unresolved.length} unresolved reference requests`);
    if (record.jobId && record.jobId !== job.jobId) throw new Error(`Candidate ${candidate.candidateId} is already bound to job ${record.jobId}`);
  }
  return candidates.map(candidate => byId.get(candidate.candidateId));
}

export function markProductionBatchOutcomes({ intake, job, result, processedAt = null, registry = null }) {
  const output = clone(intake);
  const timestamp = processedAt || new Date().toISOString();
  const acceptedByCandidate = new Map();
  for (const version of result.versions || []) {
    const candidateId = version.generation?.candidateId || null;
    if (candidateId) acceptedByCandidate.set(candidateId, version.recipeVersionId);
  }
  const rejectedByCandidate = new Map((result.rejected || []).filter(item => item.candidateId).map(item => [item.candidateId, item]));
  for (const record of output.records) {
    if (acceptedByCandidate.has(record.candidateId)) {
      record.state = 'accepted'; record.jobId = job.jobId; record.generatedAt = timestamp;
      record.outcome = { status: 'accepted', code: null, recipeVersionId: acceptedByCandidate.get(record.candidateId), processedAt: timestamp };
      record.audit.push({ at: timestamp, action: 'production_candidate_accepted', detail: `Accepted by ${job.jobId}` });
    } else if (rejectedByCandidate.has(record.candidateId)) {
      const rejection = rejectedByCandidate.get(record.candidateId);
      record.state = 'rejected'; record.jobId = job.jobId; record.generatedAt = timestamp;
      record.outcome = { status: 'rejected', code: rejection.code || 'rejected', recipeVersionId: null, processedAt: timestamp };
      record.audit.push({ at: timestamp, action: 'production_candidate_rejected', detail: `${job.jobId}: ${rejection.code || 'rejected'}` });
    }
  }
  output.updatedAt = timestamp;
  registry?.assert('productionCorpusIntake', output);
  return output;
}
