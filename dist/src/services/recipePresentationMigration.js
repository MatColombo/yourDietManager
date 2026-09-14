import { migrateFoodPresentation } from './foodPresentationMigration.js';
import { sha256Json, canonicalJson } from '../lib/crypto.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { RECIPE_PRESENTATION_VERSION, recipeTitleFromIngredients, recipeTextV2 } from '../domain/recipePresentation.js';

// No published records, nutrition, recipe lines or local current pointers change.
export async function migrateRecipePresentation({ repo, registry, onStep = null, batchSize = 100 }) {
  await migrateFoodPresentation({ repo, registry });
  const index = await loadReferenceDataIndex(repo);
  const families = (await repo.getAll('recipes')).sort((a, b) => a.recipeId.localeCompare(b.recipeId));
  const revisions = new Map((await repo.getAll('ingredientRevisions')).map(row => [row.ingredientRevisionId, row]));
  const prior = await repo.getMeta('recipePresentation:R2');
  const report = { version: RECIPE_PRESENTATION_VERSION, status: 'running', migrated: [], reconciliation: [], unresolved: [], titles: [] };
  let pending = { puts: { recipes: [], recipeVersions: [] }, expected: [] };
  async function flush() {
    if (!pending.expected.length) return;
    await repo.atomicMutate({ ...pending, metaSet: { 'recipePresentation:R2': structuredClone(report) } });
    pending = { puts: { recipes: [], recipeVersions: [] }, expected: [] };
    await onStep?.(structuredClone(report));
  }
  try {
    for (const entry of families) {
      const family = await repo.get('recipes', entry.recipeId); const source = await repo.get('recipeVersions', family.currentVersionId);
      if (!source) { report.unresolved.push({ recipeId: family.recipeId, reason: 'missing_current_version' }); continue; }
      if (source.schemaVersion === 2) { const old = prior?.migrated?.find(r => r.to === source.recipeVersionId); if (old) report.migrated.push(old); const title = prior?.titles?.find(r => r.recipeVersionId === source.recipeVersionId); if (title) report.titles.push(title); continue; }
      const used = source.ingredientLines.map(line => revisions.get(line.ingredientRevisionId));
      if (used.some(row => !row)) { report.unresolved.push({ recipeId: family.recipeId, reason: 'missing_ingredient_revision' }); continue; }
      if (used.some(row => !index.term(row.productTaxonomy?.conceptId))) { report.unresolved.push({ recipeId: family.recipeId, reason: 'missing_canonical_concept' }); continue; }
      const recipeVersionId = `${source.recipeVersionId}_v2_r2`;
      const version = { ...structuredClone(source), schemaVersion: 2, recipeVersionId, versionNumber: source.versionNumber + 1, supersedesVersionId: source.recipeVersionId,
        i18n: recipeTextV2({ it: { description: '' }, en: { description: '' } }, { titleIt: recipeTitleFromIngredients(used, index, 'it'), titleEn: recipeTitleFromIngredients(used, index, 'en') }),
        practical: { ...structuredClone(source.practical), finalWeightG: null, finalVolumeMl: null, yieldNotes: null },
        practicalEvidence: { status: 'unverified', sourceRef: `legacy:${source.recipeVersionId}` },
        generation: { ...structuredClone(source.generation), pipelineVersion: RECIPE_PRESENTATION_VERSION },
        searchTokens: [...new Set(used.flatMap(row => [index.term(row.productTaxonomy?.conceptId)?.i18n?.it?.label, index.term(row.productTaxonomy?.conceptId)?.i18n?.en?.label]).filter(Boolean).join(' ').toLowerCase().split(/\s+/).filter(Boolean))], contentHash: '' };
      version.contentHash = await sha256Json(version); registry.assert('recipeVersion', version);
      const existing = await repo.get('recipeVersions', recipeVersionId);
      if (existing && canonicalJson(existing) !== canonicalJson(version)) throw new Error(`Immutable recipe migration collision: ${recipeVersionId}`);
      if (family.origin === 'user' || source.origin === 'user') {
        report.reconciliation.push({ recipeId: family.recipeId, currentVersionId: source.recipeVersionId, status: 'convert_on_explicit_edit', proposedTitle: version.i18n.it.title });
        continue;
      }
      pending.expected.push({ store: 'recipes', key: family.recipeId, value: family }, { store: 'recipeVersions', key: recipeVersionId, value: existing ?? null });
      if (!existing) pending.puts.recipeVersions.push(version);
      pending.puts.recipes.push({ ...family, currentVersionId: recipeVersionId });
      report.migrated.push({ recipeId: family.recipeId, from: source.recipeVersionId, to: recipeVersionId });
      report.titles.push({ recipeVersionId, it: version.i18n.it.title, en: version.i18n.en.title, editorialReview: 'pending_R5' });
      if (pending.expected.length >= batchSize * 2) await flush();
    }
    await flush(); report.status = 'complete'; await repo.setMeta('recipePresentation:R2', report); return report;
  } catch (error) { report.status = 'interrupted'; report.error = error.message; await repo.setMeta('recipePresentation:R2', report); throw error; }
}
