import { EXTENSION_STORES } from '../domain/productExtensions.js';
import { assertPlanPolicy } from './planPolicyValidation.js';
import { sha256Json } from '../lib/crypto.js';
import { loadConfigurationBundle, activeRecords } from './configurationService.js';
import { hardFilterRecipe } from '../planner/hardFilter.js';
import { CATALOG_QUARANTINE } from '../domain/catalogQuarantine.js';

// Session previews expire on reload; R4 commits compare the sealed read set in IndexedDB.
const sessions = new WeakMap();
function session(repo) {
  if (!sessions.has(repo)) sessions.set(repo, { previews: new Map(), queue: Promise.resolve() });
  return sessions.get(repo);
}
const CONTEXT_STORES = [...EXTENSION_STORES, 'appConfigs', 'nutritionProfiles', 'allergyIntoleranceProfiles', 'foodPreferences',
  'mealClasses', 'dayClasses', 'cycles', 'planInstances', 'calendarDays', 'ingredients', 'ingredientRevisions',
  'recipes', 'recipeVersions', 'catalogPacks', 'taxonomies', 'taxonomyTerms', 'foodGroups', 'ingredientMappings'];

export async function previewReadSet(repo) {
  const expectedStores = await Promise.all(CONTEXT_STORES.map(async store => ({ store, values: await repo.getAll(store) })));
  const expected = await Promise.all(['activePlanInstanceId', 'activeCatalogVersion', 'contentMigration:4', 'approvedMealCompositions', 'productExtensions:R8'].map(async key => ({ store: 'meta', key, value: await repo.get('meta', key) })));
  return { expectedStores, expected };
}

export async function previewContext(repo) {
  const values = await Promise.all(CONTEXT_STORES.map(async store => [store, await repo.getAll(store)]));
  return sha256Json({ records: Object.fromEntries(values),
    compositions: await repo.getMeta('approvedMealCompositions') || [], extensions: await repo.getMeta('productExtensions:R8') || null,
    activePlan: await repo.getMeta('activePlanInstanceId') || null,
    catalog: await repo.getMeta('activeCatalogVersion') || null, unresolved: (await repo.getMeta('contentMigration:4'))?.unresolved || [], quarantinePolicy: CATALOG_QUARANTINE.policyVersion });
}
function payload(preview) {
  const { previewId, recipeLabels, ...rest } = preview;
  return rest;
}
export async function sealPreview(preview, contextHash, repo, kind) {
  if (preview.status !== 'success') return preview;
  if (await previewContext(repo) !== contextHash) throw stalePreview();
  const readSet = await previewReadSet(repo);
  if (await previewContext(repo) !== contextHash) throw stalePreview();
  const previewId = globalThis.crypto.randomUUID();
  const entries = session(repo).previews;
  entries.set(previewId, { kind, contextHash, readSet, payloadHash: await sha256Json(payload(preview)), preview: structuredClone(preview), committed: false });
  while (entries.size > 32) entries.delete(entries.keys().next().value);
  return { ...preview, previewId };
}
export function stalePreview() {
  const error = new Error('Anteprima non più valida: configurazione, catalogo o piano sono cambiati. Genera una nuova anteprima.');
  error.code = 'stale_preview'; return error;
}
export async function validatePlannedDays(days, repo, options = {}) {
  return assertPlanPolicy(days, repo, options);
}

export async function withValidatedPreview(preview, { repo, kind, choice = null }, action) {
  const state = session(repo);
  const run = async () => {
    const sealed = state.previews.get(preview?.previewId);
    if (!sealed || sealed.kind !== kind || await sha256Json(payload(preview)) !== sealed.payloadHash) throw stalePreview();
    // A repeated command is rejected, also after undo; it never silently reapplies.
    if (sealed.committed) { const error = new Error('Questa anteprima è già stata confermata.'); error.code = 'preview_already_committed'; throw error; }
    if (await previewContext(repo) !== sealed.contextHash) throw stalePreview();
    if (kind === 'replacement' && !sealed.preview.candidates.some(item => (item.choiceId || item.recipe.recipeVersionId) === choice)) throw stalePreview();
    const result = await action(async () => {
      if (await previewContext(repo) !== sealed.contextHash) throw stalePreview();
      return { ...sealed.readSet, commandId: preview.previewId };
    });
    sealed.committed = true;
    return result;
  };
  const result = state.queue.then(run, run);
  state.queue = result.catch(() => {});
  return result;
}

export function replacementPreviewById(repo, previewId) {
  const sealed = session(repo).previews.get(previewId);
  if (!sealed || sealed.kind !== 'replacement') throw stalePreview();
  return { ...structuredClone(sealed.preview), previewId };
}
