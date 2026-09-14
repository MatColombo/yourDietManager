import { FOOD_PRESENTATION_CORRECTIONS } from '../domain/foodPresentationCorrections.js';
import { sha256Json, canonicalJson } from '../lib/crypto.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { assertIngredientRevisionV2 } from '../domain/revisionV2Contracts.js';
export async function migrateFoodPresentation({ repo, registry }) {
  for (const [id, correction] of Object.entries(FOOD_PRESENTATION_CORRECTIONS)) {
    const family = await repo.get('ingredients', id); if (!family || family.origin === 'user') continue;
    const source = await repo.get('ingredientRevisions', family.currentRevisionId);
    if (!source || source.schemaVersion !== 2 || source.origin === 'user' || source.productTaxonomy.conceptId === correction.conceptId) continue;
    if (source.i18n.en.name.toLowerCase() !== correction.descriptor.toLowerCase()) continue;
    const term = { schemaVersion: 1, termId: correction.conceptId, taxonomyId: 'product_food', origin: 'base', parentTermId: correction.subcategoryId,
      i18n: { it: { label: correction.it }, en: { label: correction.en } }, aliases: { it: correction.aliasesIt, en: correction.aliasesEn }, legacyKeys: [], status: 'active', supersedesTermId: null,
      provenance: { sourceType: 'migration', sourceLabel: 'R2 explicit source identity correction', reference: source.source.reference || id, rationale: correction.descriptor },
      searchTokens: [...new Set([correction.it, correction.en, ...correction.aliasesIt, ...correction.aliasesEn].join(' ').toLowerCase().split(/\s+/))], createdAt: source.createdAt, updatedAt: source.createdAt };
    registry.assert('taxonomyTerm', term); const existingTerm = await repo.get('taxonomyTerms', term.termId);
    if (existingTerm && canonicalJson(existingTerm) !== canonicalJson(term)) throw new Error('Food presentation term collision');
    if (!existingTerm) await repo.put('taxonomyTerms', term);
    const revision = { ...structuredClone(source), ingredientRevisionId: `${source.ingredientRevisionId}_r2_identity`, revisionNumber: source.revisionNumber + 1,
      productTaxonomy: { categoryId: correction.categoryId, subcategoryId: correction.subcategoryId, conceptId: correction.conceptId }, contentHash: '' };
    revision.contentHash = await sha256Json(revision); assertIngredientRevisionV2(revision, { registry, index: await loadReferenceDataIndex(repo) });
    const mapping = { schemaVersion: 1, mappingId: `r2-identity:${source.ingredientRevisionId}`, version: 1, sourceIngredientId: id, sourceRevisionId: source.ingredientRevisionId, targetIngredientId: id, targetRevisionId: revision.ingredientRevisionId, productTaxonomy: revision.productTaxonomy, status: 'approved', kind: 'identity', reason: `Source-bound presentation correction: ${correction.descriptor}; nutrients and safety evidence unchanged`, sourceRef: source.source.reference || id, approvedBy: 'r2-source-identity-migration', approvedAt: source.createdAt };
    registry.assert('ingredientMapping', mapping);
    await repo.atomicMutate({ puts: { ingredients: [{ ...family, currentRevisionId: revision.ingredientRevisionId }], ingredientRevisions: [revision], ingredientMappings: [mapping] }, expected: [{ store: 'ingredients', key: id, value: family }, { store: 'ingredientRevisions', key: revision.ingredientRevisionId, value: null }] });
  }
}
