import { CONTENT_SCHEMA_VERSION, DB_VERSION } from '../db/constants.js';
import { repositories } from '../repositories/repositoryHub.js';
import { sha256Json } from '../lib/crypto.js';
import { MEAL_ARCHETYPES } from '../domain/configurationRules.js';
import { assertReferenceData, assertSemanticReferences, migrateLegacySemanticRecords, referenceDataDigest } from './referenceDataService.js';

function now() { return new Date().toISOString(); }
function historyMetaKey(planInstanceId) { return `operationHistory:${planInstanceId}`; }

async function runMigration1(repo) {
  await repo.setMeta('contentMigration:1', { status: 'running', startedAt: now() });
  await repo.setMeta('contentMigration:1', { status: 'complete', completedAt: now() });
}

function visibleOperation(operation) { return !operation.metadata?.invalidatedAt; }

async function buildOperationHistoryPointers(repo) {
  const operations = await repo.getAll('operations');
  if (!operations.length) return;
  const groups = new Map();
  for (const operation of operations) {
    if (!operation.planInstanceId) continue;
    if (!groups.has(operation.planInstanceId)) groups.set(operation.planInstanceId, []);
    groups.get(operation.planInstanceId).push(operation);
  }
  const changed = [];
  for (const [planInstanceId, rows] of groups) {
    rows.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
    let previousActiveOperationId = null;
    let headOperationId = null;
    let maxSequence = 0;
    const redoable = [];
    for (const row of rows) {
      maxSequence = Math.max(maxSequence, Number(row.sequence || 0));
      if (!visibleOperation(row)) continue;
      const nextMetadata = { ...(row.metadata || {}) };
      if (!('previousActiveOperationId' in nextMetadata)) {
        nextMetadata.previousActiveOperationId = previousActiveOperationId;
        changed.push({ ...row, metadata: nextMetadata });
      }
      if (row.undoneAt) redoable.push(row);
      else {
        previousActiveOperationId = row.operationId;
        headOperationId = row.operationId;
      }
    }
    const redoStack = redoable.sort((a, b) => b.sequence - a.sequence).map(row => row.operationId);
    await repo.setMeta(historyMetaKey(planInstanceId), { version: 1, maxSequence, headOperationId, redoStack, migratedAt: now() });
  }
  if (changed.length) await repo.putMany('operations', changed, 250);
}

async function runMigration2(repo, options = {}) {
  const existingMarker = await repo.getMeta('contentMigration:2');
  const attempts = Number(existingMarker?.attempts || 0) + 1;
  await repo.setMeta('contentMigration:2', { status: 'running', startedAt: existingMarker?.startedAt || now(), resumedAt: now(), attempts, checkpoint: 'appConfig' });

  const config = await repo.get('appConfigs', 'active');
  if (config && (config.shoppingPeopleMultiplier === undefined || config.shoppingPeopleMultiplier === null)) {
    await repo.put('appConfigs', { ...config, shoppingPeopleMultiplier: 1 });
  }
  options.onStep?.('migration2:appConfig');

  await repo.setMeta('contentMigration:2', { status: 'running', startedAt: existingMarker?.startedAt || now(), resumedAt: now(), attempts, checkpoint: 'operationHistory' });
  await buildOperationHistoryPointers(repo);
  options.onStep?.('migration2:operationHistory');

  await repo.setMeta('contentMigration:2', { status: 'complete', completedAt: now(), attempts, checkpoint: 'complete' });
}



async function configurationBundle(repo) {
  return {
    appConfig: await repo.get('appConfigs', 'active'),
    nutritionProfiles: await repo.getAll('nutritionProfiles'),
    allergyIntoleranceProfiles: await repo.getAll('allergyIntoleranceProfiles'),
    foodPreferences: await repo.getAll('foodPreferences'),
    themeProfiles: await repo.getAll('themeProfiles'),
    mealClasses: await repo.getAll('mealClasses'),
    dayClasses: await repo.getAll('dayClasses'),
    cycles: await repo.getAll('cycles')
  };
}

function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }

async function runMigration3(repo, options = {}) {
  const existingMarker = await repo.getMeta('contentMigration:3');
  const attempts = Number(existingMarker?.attempts || 0) + 1;
  const startedAt = existingMarker?.startedAt || now();
  await repo.setMeta('contentMigration:3', { status: 'running', startedAt, resumedAt: now(), attempts, checkpoint: 'referenceData' });

  let taxonomies = await repo.getAll('taxonomies');
  let taxonomyTerms = await repo.getAll('taxonomyTerms');
  if ((!taxonomies.length || !taxonomyTerms.length) && options.referenceDataLoader) {
    const bundled = await options.referenceDataLoader();
    taxonomies = bundled.taxonomies || [];
    taxonomyTerms = bundled.taxonomyTerms || [];
  }

  const ingredientFamilies = await repo.getAll('ingredients');
  const allIngredientRevisions = await repo.getAll('ingredientRevisions');
  const recipeFamilies = await repo.getAll('recipes');
  const allRecipeVersions = await repo.getAll('recipeVersions');
  const config = await configurationBundle(repo);
  const hasSemanticData = ingredientFamilies.length || recipeFamilies.length || config.appConfig;

  if ((!taxonomies.length || !taxonomyTerms.length) && hasSemanticData) {
    await repo.setMeta('contentMigration:3', { status: 'blocked', startedAt, attempts, blockedAt: now(), reason: 'reference_data_unavailable' });
    throw new Error('Reference-data migration requires the bundled taxonomy registry');
  }
  if (!taxonomies.length && !taxonomyTerms.length) {
    await repo.setMeta('contentMigration:3', { status: 'complete', startedAt, completedAt: now(), attempts, checkpoint: 'complete', migratedIngredientRevisions: 0, migratedRecipeVersions: 0, unresolved: [] });
    return;
  }

  const index = assertReferenceData(taxonomies, taxonomyTerms, options.registry || null);
  const revisionById = new Map(allIngredientRevisions.map(record => [record.ingredientRevisionId, record]));
  const versionById = new Map(allRecipeVersions.map(record => [record.recipeVersionId, record]));
  const currentVersions = recipeFamilies.map(family => versionById.get(family.currentVersionId)).filter(Boolean);
  const revisionIds = new Set(ingredientFamilies.map(family => family.currentRevisionId));
  for (const version of currentVersions) for (const line of version.ingredientLines || []) revisionIds.add(line.ingredientRevisionId);
  const revisionsToInspect = [...revisionIds].map(id => revisionById.get(id)).filter(Boolean);

  const firstPass = migrateLegacySemanticRecords({ index, ingredientRevisions: revisionsToInspect, recipeVersions: currentVersions, configuration: config.appConfig ? config : null });
  if (firstPass.unresolved.length) {
    await repo.setMeta('contentMigration:3', { status: 'blocked', startedAt, attempts, blockedAt: now(), reason: 'unresolved_legacy_values', unresolved: firstPass.unresolved.slice(0, 100) });
    throw new Error(`Reference-data migration has ${firstPass.unresolved.length} unresolved semantic value(s): ${firstPass.unresolved.slice(0, 5).map(item => `${item.path}=${item.value}`).join(', ')}`);
  }

  const timestamp = now();
  const migratedRevisionByOldId = new Map();
  const newRevisions = [];
  for (let i = 0; i < revisionsToInspect.length; i += 1) {
    const old = revisionsToInspect[i]; const migrated = firstPass.ingredientRevisions[i];
    if (!changed(old.taxonomy, migrated.taxonomy)) continue;
    const nextNumber = Number(old.revisionNumber || 0) + 1;
    const nextId = `${old.ingredientId}_r${nextNumber}_refdata_v1`;
    const next = { ...migrated, ingredientRevisionId: nextId, revisionNumber: nextNumber, createdAt: timestamp, contentHash: '' };
    next.contentHash = await sha256Json({ ...next, contentHash: '' });
    options.registry?.assert('ingredientRevision', next);
    migratedRevisionByOldId.set(old.ingredientRevisionId, next);
    newRevisions.push(next);
  }
  const nextIngredientFamilies = ingredientFamilies.map(family => {
    const replacement = migratedRevisionByOldId.get(family.currentRevisionId);
    return replacement ? { ...family, currentRevisionId: replacement.ingredientRevisionId, updatedAt: timestamp } : family;
  });

  const migratedCurrentById = new Map(firstPass.recipeVersions.map(record => [record.recipeVersionId, record]));
  const newVersions = [];
  const replacementVersionByOldId = new Map();
  for (const old of currentVersions) {
    const migrated = migratedCurrentById.get(old.recipeVersionId) || structuredClone(old);
    const lines = (migrated.ingredientLines || []).map(line => {
      const replacement = migratedRevisionByOldId.get(line.ingredientRevisionId);
      return replacement ? { ...line, ingredientRevisionId: replacement.ingredientRevisionId } : line;
    });
    const needsNew = changed(old.tags || {}, migrated.tags || {}) || changed(old.ingredientLines || [], lines) || !old.mealArchetypes?.length;
    if (!needsNew) continue;
    const nextNumber = Number(old.versionNumber || 0) + 1;
    const nextId = `${old.recipeId}_v${nextNumber}_refdata_v1`;
    const next = { ...migrated, recipeVersionId: nextId, versionNumber: nextNumber, supersedesVersionId: old.recipeVersionId, ingredientLines: lines, mealArchetypes: migrated.mealArchetypes?.length ? migrated.mealArchetypes : [...MEAL_ARCHETYPES], createdAt: timestamp, inputDigest: '', contentHash: '' };
    next.inputDigest = await sha256Json({ calculationAlgorithmVersion: next.calculationAlgorithmVersion, ingredientLines: lines.map(line => ({ ingredientRevisionId: line.ingredientRevisionId, normalizedAmount: line.normalizedAmount, normalizedUnit: line.normalizedUnit })) });
    next.contentHash = await sha256Json({ ...next, contentHash: '' });
    options.registry?.assert('recipeVersion', next);
    replacementVersionByOldId.set(old.recipeVersionId, next);
    newVersions.push(next);
  }
  const nextRecipeFamilies = recipeFamilies.map(family => {
    const replacement = replacementVersionByOldId.get(family.currentVersionId);
    return replacement ? { ...family, currentVersionId: replacement.recipeVersionId, updatedAt: timestamp } : family;
  });

  const migratedConfig = firstPass.configuration || config;
  // Resolve by actual current IDs after pointer updates.
  const allRevisionEffective = new Map([...allIngredientRevisions, ...newRevisions].map(record => [record.ingredientRevisionId, record]));
  const allVersionEffective = new Map([...allRecipeVersions, ...newVersions].map(record => [record.recipeVersionId, record]));
  const currentRevisionsEffective = nextIngredientFamilies.map(family => allRevisionEffective.get(family.currentRevisionId)).filter(Boolean);
  const currentVersionsEffective = nextRecipeFamilies.map(family => allVersionEffective.get(family.currentVersionId)).filter(Boolean);
  assertSemanticReferences({ index, ingredientRevisions: currentRevisionsEffective, recipeVersions: currentVersionsEffective, configuration: migratedConfig.appConfig ? migratedConfig : null, ingredientIds: nextIngredientFamilies.map(item => item.ingredientId) });

  const puts = { taxonomies, taxonomyTerms };
  if (newRevisions.length) puts.ingredientRevisions = newRevisions;
  if (newVersions.length) puts.recipeVersions = newVersions;
  if (nextIngredientFamilies.some((item, i) => item !== ingredientFamilies[i])) puts.ingredients = nextIngredientFamilies;
  if (nextRecipeFamilies.some((item, i) => item !== recipeFamilies[i])) puts.recipes = nextRecipeFamilies;
  if (migratedConfig.appConfig) {
    puts.appConfigs = [migratedConfig.appConfig];
    for (const key of ['nutritionProfiles','allergyIntoleranceProfiles','foodPreferences','themeProfiles','mealClasses','dayClasses','cycles']) puts[key] = migratedConfig[key] || [];
  }
  const digest = await referenceDataDigest(taxonomies, taxonomyTerms);
  const mappingSummary = firstPass.mappings.reduce((summary, item) => { summary[item.status] = (summary[item.status] || 0) + 1; return summary; }, { resolved_exact: 0, resolved_alias: 0, resolved_manual: 0, unresolved: 0 });
  await repo.atomicPut(puts, {
    referenceDataVersion: '1.0.0', referenceDataDigest: digest,
    'contentMigration:3': { status: 'complete', startedAt, completedAt: now(), attempts, checkpoint: 'complete', migratedIngredientRevisions: newRevisions.length, migratedRecipeVersions: newVersions.length, mappingSummary, mappingSample: firstPass.mappings.slice(0, 200), unresolved: [] }
  });
  options.onStep?.('migration3:referenceData');
}

export async function runMigrations(repo = repositories, options = {}) {
  let current = (await repo.getMeta('contentSchemaVersion')) || 0;
  if (current < 1) {
    await runMigration1(repo);
    await repo.setMeta('contentSchemaVersion', 1);
    current = 1;
  }
  if (current < 2) {
    await runMigration2(repo, options);
    await repo.setMeta('contentSchemaVersion', 2);
    current = 2;
  }
  if (current < 3) {
    await runMigration3(repo, options);
    await repo.setMeta('contentSchemaVersion', 3);
    current = 3;
  }
  await repo.setMeta('dbVersion', DB_VERSION);
  await repo.setMeta('contentSchemaVersion', CONTENT_SCHEMA_VERSION);
  return { dbVersion: DB_VERSION, contentSchemaVersion: CONTENT_SCHEMA_VERSION };
}
