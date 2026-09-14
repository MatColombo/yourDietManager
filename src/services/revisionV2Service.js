import { repositories } from '../repositories/repositoryHub.js';
import { loadReferenceDataIndex } from './referenceDataService.js';
import { assertFoodGroup, assertIngredientMapping } from '../domain/ingredientIdentity.js';
import { assertIngredientConversion } from '../domain/ingredientConversion.js';
import { assertFoodPreferencesV2, assertSafetyProfileV2 } from '../domain/revisionV2Contracts.js';
import { canonicalJson } from '../lib/crypto.js';

async function context(repo, registry) {
  return { registry, index: await loadReferenceDataIndex(repo), ingredients: await repo.getAll('ingredients'),
    revisions: await repo.getAll('ingredientRevisions'), foodGroups: await currentFoodGroups({ repo }),
    mappings: await repo.getAll('ingredientMappings'), mealClasses: await repo.getAll('mealClasses') };
}
async function appendVersion(store, idKey, record, repo) {
  const versions = (await repo.getAll(store)).filter(item => item[idKey] === record[idKey]);
  const existing = versions.find(item => item.version === record.version);
  if (existing && canonicalJson(existing) === canonicalJson(record)) return record;
  if (existing || record.version !== Math.max(0, ...versions.map(item => item.version)) + 1) throw new Error('Immutable revision: append the next version');
  await repo.atomicMutate({ puts: { [store]: [structuredClone(record)] }, expected: [{ store, key: [record[idKey], record.version], value: null }] });
  return record;
}
export async function currentFoodGroups({ repo = repositories } = {}) {
  const latest = new Map();
  for (const group of await repo.getAll('foodGroups')) if (!latest.has(group.id) || latest.get(group.id).version < group.version) latest.set(group.id, group);
  return [...latest.values()];
}
export async function saveFoodGroup(record, { repo = repositories, registry } = {}) {
  assertFoodGroup(record, await context(repo, registry));
  return appendVersion('foodGroups', 'id', record, repo);
}
export async function saveIngredientConversion(record, { repo = repositories, registry } = {}) {
  assertIngredientConversion(record, await context(repo, registry));
  return appendVersion('ingredientConversions', 'conversionId', record, repo);
}
export async function saveIngredientMapping(record, { repo = repositories, registry } = {}) {
  assertIngredientMapping(record, await context(repo, registry));
  return appendVersion('ingredientMappings', 'mappingId', record, repo);
}
// R1 stages strict V2 contracts; the R3 solver is required before activation.
// Legacy configuration remains byte-for-byte unchanged.
export async function stageConfigurationV2({ foodPreferences, safetyProfile }, { repo = repositories, registry } = {}) {
  const ctx = await context(repo, registry);
  if (foodPreferences) assertFoodPreferencesV2(foodPreferences, ctx);
  if (safetyProfile) assertSafetyProfileV2(safetyProfile, ctx);
  const draft = { schemaVersion: 1, status: 'awaiting_R3_activation', foodPreferences: foodPreferences || null, safetyProfile: safetyProfile || null };
  await repo.setMeta('revisionV2:configurationDraft', draft);
  return draft;
}
export async function readConfigurationV2Draft({ repo = repositories } = {}) {
  return (await repo.getMeta('revisionV2:configurationDraft')) || null;
}

// R6 consumes these references to build a self-contained backup. R1 keeps the
// same-catalog backup contract and persists all newly introduced records.
export function ingredientReferenceClosure({ recipes = [], ingredients = [], mappings = [] }) {
  return [...new Set([
    ...recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)),
    ...ingredients.map(ingredient => ingredient.currentRevisionId),
    ...mappings.flatMap(mapping => [mapping.sourceRevisionId, mapping.targetRevisionId])
  ].filter(Boolean))].sort();
}
