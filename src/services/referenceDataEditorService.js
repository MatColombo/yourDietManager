import { repositories } from '../repositories/repositoryHub.js';
import { assertReferenceData } from './referenceDataService.js';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function unique(values) { return [...new Set((values || []).map(value => String(value).trim()).filter(Boolean))]; }
function searchTokens(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean).flatMap(value => normalize(value).split('_')).filter(Boolean))].sort();
}
function termPrefix(taxonomyId, parentTermId) {
  if (taxonomyId === 'food_category') return parentTermId ? 'food_subgroup' : 'food_group';
  return taxonomyId;
}
function makeTermId(taxonomyId, parentTermId, label, existingIds) {
  const base = `${termPrefix(taxonomyId, parentTermId)}_${normalize(label) || 'term'}`;
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export async function loadReferenceDataBundle(repo = repositories, registry = null) {
  const taxonomies = await repo.getAll('taxonomies');
  const taxonomyTerms = await repo.getAll('taxonomyTerms');
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  return { taxonomies, taxonomyTerms, index };
}

export async function saveUserTaxonomyTerm(input, { repo = repositories, registry = null, now = new Date().toISOString() } = {}) {
  const { taxonomies, taxonomyTerms } = await loadReferenceDataBundle(repo, registry);
  const index = assertReferenceData(taxonomies, taxonomyTerms, registry);
  const taxonomy = index.taxonomy(input.taxonomyId);
  if (!taxonomy) throw new Error(`Unknown taxonomy ${input.taxonomyId}`);
  if (!(taxonomy.extensibleBy || []).includes('user')) throw new Error(`Taxonomy ${input.taxonomyId} is not user-extensible`);

  const existing = input.termId ? index.term(input.termId) : null;
  if (existing && existing.origin !== 'user') throw new Error('Base reference-data terms are read-only');
  if (existing && existing.taxonomyId !== input.taxonomyId) throw new Error('A taxonomy term cannot move to another taxonomy');

  const labelIt = String(input.labelIt || '').trim();
  const labelEn = String(input.labelEn || '').trim();
  if (!labelIt || !labelEn) throw new Error('Italian and English labels are required');

  let parentTermId = input.parentTermId || null;
  if (!taxonomy.hierarchical) parentTermId = null;
  if (existing && existing.parentTermId !== parentTermId) throw new Error('The parent of an existing term cannot be changed');
  if (parentTermId) {
    const parent = index.assertTerm(parentTermId, input.taxonomyId);
    if (parent.parentTermId) throw new Error('V1 food-category hierarchy supports groups and one subgroup level only');
  }

  const aliases = { it: unique(input.aliasesIt), en: unique(input.aliasesEn) };
  const lookupValues = [labelIt, labelEn, ...aliases.it, ...aliases.en];
  for (const value of lookupValues) {
    const collisionId = index.resolveLegacy(input.taxonomyId, value);
    if (collisionId && collisionId !== existing?.termId) throw new Error(`Reference-data value "${value}" already resolves to ${collisionId}`);
  }

  const existingIds = new Set(taxonomyTerms.map(term => term.termId));
  const termId = existing?.termId || makeTermId(input.taxonomyId, parentTermId, labelEn || labelIt, existingIds);
  const term = {
    schemaVersion: 1,
    termId,
    taxonomyId: input.taxonomyId,
    origin: 'user',
    parentTermId,
    i18n: {
      it: { label: labelIt, ...(String(input.descriptionIt || '').trim() ? { description: String(input.descriptionIt).trim() } : {}) },
      en: { label: labelEn, ...(String(input.descriptionEn || '').trim() ? { description: String(input.descriptionEn).trim() } : {}) }
    },
    aliases,
    legacyKeys: existing?.legacyKeys || [],
    status: existing?.status || 'active',
    supersedesTermId: existing?.supersedesTermId || null,
    provenance: existing?.provenance || {
      sourceType: 'user', sourceLabel: 'yourDietManager reference-data configurator', reference: null,
      rationale: 'User-created canonical reference data.'
    },
    searchTokens: searchTokens(termId, labelIt, labelEn, aliases.it, aliases.en),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  registry?.assert('taxonomyTerm', term);
  const nextTerms = taxonomyTerms.map(item => item.termId === termId ? term : item);
  if (!existing) nextTerms.push(term);
  assertReferenceData(taxonomies, nextTerms, registry);
  await repo.put('taxonomyTerms', term);
  return term;
}
