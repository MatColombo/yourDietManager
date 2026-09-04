import { sha256Text } from '../lib/crypto.js';
import { assertReferenceData, ReferenceDataIndex } from './referenceDataService.js';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function tokens(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean).flatMap(value => normalize(value).split('_')).filter(Boolean))].sort();
}

export async function createReferenceDataProposal({ taxonomyId, proposedTermId, parentTermId = null, i18n, aliases = { it: [], en: [] }, rationale, provenance, autoApprove = false, createdAt = new Date().toISOString() }, { taxonomies, taxonomyTerms, registry = null } = {}) {
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const taxonomy = index.taxonomy(taxonomyId);
  if (!taxonomy) throw new Error(`Unknown taxonomy ${taxonomyId}`);
  if (!(taxonomy.extensibleBy || []).includes('editorial_pipeline')) throw new Error(`Taxonomy ${taxonomyId} is not extensible by editorial_pipeline`);
  if (parentTermId) {
    const parent = index.assertTerm(parentTermId, taxonomyId);
    if (!taxonomy.hierarchical) throw new Error(`Taxonomy ${taxonomyId} is not hierarchical`);
    if (parent.status !== 'active') throw new Error(`Parent ${parentTermId} is not active`);
  }
  if (!i18n?.it?.label?.trim() || !i18n?.en?.label?.trim()) throw new Error('Reference-data proposals require IT and EN labels');
  if (!rationale?.trim()) throw new Error('Reference-data proposal rationale is required');
  if (provenance?.sourceType !== 'pipeline') throw new Error('Pipeline reference-data proposals require provenance.sourceType=pipeline');

  const candidates = new Set();
  const lookupValues = [proposedTermId, i18n.it.label, i18n.en.label, ...(aliases.it || []), ...(aliases.en || [])];
  for (const value of lookupValues) {
    const resolved = index.resolveLegacy(taxonomyId, value);
    if (resolved) candidates.add(resolved);
  }
  const collisionCandidateTermIds = [...candidates].sort();
  const status = collisionCandidateTermIds.length ? 'needs_review' : (autoApprove ? 'approved' : 'proposed');
  const proposalSeed = `${taxonomyId}\n${proposedTermId}\n${i18n.it.label}\n${i18n.en.label}\n${parentTermId || ''}`;
  const proposalId = `refprop_${(await sha256Text(proposalSeed)).slice(0, 20)}`;
  const proposal = {
    schemaVersion: 1,
    proposalId,
    taxonomyId,
    proposedTermId,
    parentTermId,
    i18n: {
      it: { label: i18n.it.label.trim(), ...(i18n.it.description != null ? { description: String(i18n.it.description) } : {}) },
      en: { label: i18n.en.label.trim(), ...(i18n.en.description != null ? { description: String(i18n.en.description) } : {}) }
    },
    aliases: { it: [...new Set(aliases.it || [])], en: [...new Set(aliases.en || [])] },
    rationale: rationale.trim(),
    provenance: { ...provenance, rationale: provenance.rationale || rationale.trim() },
    status,
    collisionCandidateTermIds,
    reviewNotes: null,
    materializedTermId: null,
    createdAt,
    reviewedAt: null
  };
  registry?.assert('referenceDataProposal', proposal);
  return proposal;
}

export function approveReferenceDataProposal(proposal, { reviewNotes = null, reviewedAt = new Date().toISOString(), registry = null } = {}) {
  if (!['proposed', 'needs_review'].includes(proposal.status)) throw new Error(`Proposal ${proposal.proposalId} cannot be approved from ${proposal.status}`);
  if (proposal.collisionCandidateTermIds?.length) throw new Error(`Proposal ${proposal.proposalId} has unresolved collision candidates`);
  const approved = { ...structuredClone(proposal), status: 'approved', reviewNotes, reviewedAt };
  registry?.assert('referenceDataProposal', approved);
  return approved;
}

export function rejectReferenceDataProposal(proposal, { reviewNotes, reviewedAt = new Date().toISOString(), registry = null } = {}) {
  if (!reviewNotes?.trim()) throw new Error('Rejected reference-data proposal requires review notes');
  const rejected = { ...structuredClone(proposal), status: 'rejected', reviewNotes: reviewNotes.trim(), reviewedAt };
  registry?.assert('referenceDataProposal', rejected);
  return rejected;
}

export function materializeReferenceDataProposal(proposal, { taxonomies, taxonomyTerms, registry = null, createdAt = new Date().toISOString() } = {}) {
  if (proposal.status !== 'approved') throw new Error(`Proposal ${proposal.proposalId} must be approved before materialization`);
  if (proposal.collisionCandidateTermIds?.length) throw new Error(`Proposal ${proposal.proposalId} has unresolved collision candidates`);
  const index = new ReferenceDataIndex(taxonomies, taxonomyTerms);
  const taxonomy = index.taxonomy(proposal.taxonomyId);
  if (!taxonomy || !(taxonomy.extensibleBy || []).includes('editorial_pipeline')) throw new Error(`Taxonomy ${proposal.taxonomyId} is not extensible by editorial_pipeline`);
  if (index.term(proposal.proposedTermId)) throw new Error(`Term ${proposal.proposedTermId} already exists`);
  if (proposal.parentTermId) index.assertTerm(proposal.parentTermId, proposal.taxonomyId);
  const term = {
    schemaVersion: 1,
    termId: proposal.proposedTermId,
    taxonomyId: proposal.taxonomyId,
    origin: 'base',
    parentTermId: proposal.parentTermId,
    i18n: structuredClone(proposal.i18n),
    aliases: structuredClone(proposal.aliases),
    legacyKeys: [],
    status: 'active',
    supersedesTermId: null,
    provenance: { ...structuredClone(proposal.provenance), rationale: proposal.rationale },
    searchTokens: tokens(proposal.proposedTermId, proposal.i18n.it.label, proposal.i18n.en.label, proposal.aliases.it, proposal.aliases.en),
    createdAt,
    updatedAt: createdAt
  };
  registry?.assert('taxonomyTerm', term);
  assertReferenceData(taxonomies, [...taxonomyTerms, term], registry);
  const materializedProposal = { ...structuredClone(proposal), status: 'materialized', materializedTermId: term.termId, reviewedAt: proposal.reviewedAt || createdAt };
  registry?.assert('referenceDataProposal', materializedProposal);
  return { term, proposal: materializedProposal };
}
