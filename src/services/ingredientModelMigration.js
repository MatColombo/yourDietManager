import { migrateRecipePresentation } from './recipePresentationMigration.js';
import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json, canonicalJson } from '../lib/crypto.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { assertIngredientPath, isCuratedConcept } from '../domain/ingredientIdentity.js';
import { assertIngredientRevisionV2 } from '../domain/revisionV2Contracts.js';
import { legacySafetyEvidence } from '../domain/safetyCompatibility.js';
export const INGREDIENT_MIGRATION_VERSION = 'ingredient-model-r1-1';
const LABELS = {
  raw: ['Crudo', 'Raw'], cooked: ['Cotto', 'Cooked'], dry: ['Secco', 'Dry'], drained: ['Sgocciolato', 'Drained'],
  prepared: ['Preparato', 'Prepared'], ready_to_eat: ['Pronto al consumo', 'Ready to eat'],
  as_sold: ['Come venduto; consumo da verificare', 'As sold; readiness unverified'], unknown: ['Stato da verificare', 'State unverified']
};
// Only structural identity is approved by this migration, never food safety or
// an equivalence inferred from names. New imports are reconciled on every run.
export async function migrateIngredientModel({ repo = repositories, registry, onStep = null, batchSize = 100 } = {}) {
  if (!registry) throw new Error('Schema registry is required for ingredient migration');
  const index = await loadReferenceDataIndex(repo);
  const marker = await repo.getMeta('contentMigration:4');
  const activeManifest = await repo.getMeta('catalogManifest');
  const allowDevelopmentBaseRebase = activeManifest?.publication?.channel === 'development';
  const report = { status: 'running', version: INGREDIENT_MIGRATION_VERSION, attempts: (marker?.attempts || 0) + 1,
    startedAt: marker?.startedAt || new Date().toISOString(), checkpoint: null,
    migrated: [], unresolved: [], reconciliation: [], coverageExcluded: [] };
  const families = (await repo.getAll('ingredients')).sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
  let pending = { expected: [], puts: { ingredientRevisions: [], ingredientMappings: [], ingredients: [] } };
  const flush = async () => {
    if (!pending.expected.length) return;
    await repo.atomicMutate({ ...pending, metaSet: { 'contentMigration:4': structuredClone(report) } });
    pending = { expected: [], puts: { ingredientRevisions: [], ingredientMappings: [], ingredients: [] } };
    await onStep?.({ checkpoint: report.checkpoint, report: structuredClone(report) });
  };
  await repo.setMeta('contentMigration:4', report);
  try {
    for (const entry of families) {
      const family = await repo.get('ingredients', entry.ingredientId);
      const source = await repo.get('ingredientRevisions', family.currentRevisionId);
      report.checkpoint = family.ingredientId;
      if (!source) { report.unresolved.push({ ingredientId: family.ingredientId, reason: 'missing_current_revision' }); continue; }
      try { assertIngredientPath(source, index); }
      catch (error) { report.unresolved.push({ ingredientId: family.ingredientId, revisionId: source.ingredientRevisionId, reason: error.message }); continue; }
      if (!isCuratedConcept(source.productTaxonomy.conceptId)) report.coverageExcluded.push(family.ingredientId);
      if (source.schemaVersion === 2) { assertIngredientRevisionV2(source, { registry, index }); continue; }
      const revisionId = `${source.ingredientRevisionId}_v2_r1`;
      const existing = await repo.get('ingredientRevisions', revisionId);
      const labels = source.ingredientId === 'ing_fdc_167724' ? ['Soffiato', 'Puffed'] : LABELS[source.basis.state] || LABELS.unknown;
      const revised = { ...structuredClone(source), schemaVersion: 2, ingredientRevisionId: revisionId,
        revisionNumber: source.revisionNumber + 1,
        display: { it: { variantLabel: labels[0] }, en: { variantLabel: labels[1] } },
        safetyEvidence: legacySafetyEvidence(source), contentHash: '' };
      // Preserve source timestamp for a deterministic migration artifact. Its
      // installation timestamp is in the report, separate from source provenance.
      revised.contentHash = await sha256Json(revised);
      assertIngredientRevisionV2(revised, { registry, index });
      const local = family.origin === 'user' || source.origin === 'user';
      const revisionChanged = Boolean(existing && canonicalJson(existing) !== canonicalJson(revised));
      const canRebaseDerivedRevision = revisionChanged && allowDevelopmentBaseRebase && !local && existing.origin === 'base' && revised.origin === 'base';
      if (revisionChanged && !canRebaseDerivedRevision) throw new Error(`Immutable migration collision: ${revisionId}`);
      const mapping = { schemaVersion: 1, mappingId: `identity:${source.ingredientRevisionId}`, version: 1,
        sourceIngredientId: family.ingredientId, sourceRevisionId: source.ingredientRevisionId,
        targetIngredientId: family.ingredientId, targetRevisionId: revised.ingredientRevisionId,
        productTaxonomy: structuredClone(source.productTaxonomy), status: 'approved', kind: 'identity',
        reason: 'Preserve existing form and exact nutrient values; no merge or safety approval',
        sourceRef: `legacy:${source.ingredientRevisionId}`, approvedBy: INGREDIENT_MIGRATION_VERSION, approvedAt: source.createdAt };
      registry.assert('ingredientMapping', mapping);
      const priorMapping = await repo.get('ingredientMappings', [mapping.mappingId, mapping.version]);
      const mappingChanged = Boolean(priorMapping && canonicalJson(priorMapping) !== canonicalJson(mapping));
      const canRebaseDerivedMapping = mappingChanged && allowDevelopmentBaseRebase && !local && priorMapping.kind === 'identity' && priorMapping.approvedBy === INGREDIENT_MIGRATION_VERSION;
      if (mappingChanged && !canRebaseDerivedMapping) throw new Error(`Immutable mapping collision: ${mapping.mappingId}`);
      if (local) report.reconciliation.push({ ingredientId: family.ingredientId, currentRevisionId: source.ingredientRevisionId, proposedRevisionId: revisionId, status: 'awaiting_explicit_local_decision' });
      else report.migrated.push({ ingredientId: family.ingredientId, sourceRevisionId: source.ingredientRevisionId, targetRevisionId: revisionId });
      pending.expected.push({ store: 'ingredients', key: family.ingredientId, value: family }, { store: 'ingredientRevisions', key: revisionId, value: existing ?? null });
      if (!existing || canRebaseDerivedRevision) pending.puts.ingredientRevisions.push(revised);
      if (!priorMapping || canRebaseDerivedMapping) pending.puts.ingredientMappings.push(mapping);
      if (!local) pending.puts.ingredients.push({ ...family, currentRevisionId: revisionId });
      if (pending.expected.length >= batchSize * 2) await flush();
    }
    await flush();
    report.status = 'complete'; report.completedAt = new Date().toISOString(); report.checkpoint = 'complete';
    const allMappings = await repo.getAll('ingredientMappings');
    report.totalIdentityMappings = allMappings.filter(item => item.kind === 'identity').length;
    await repo.atomicPut({}, { 'contentMigration:4': report, contentSchemaVersion: 4 });
    await migrateRecipePresentation({ repo, registry });
    return report;
  } catch (error) {
    report.status = 'interrupted'; report.error = error.message;
    await repo.setMeta('contentMigration:4', report);
    throw error;
  }
}
