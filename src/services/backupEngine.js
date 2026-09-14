import { EXTENSION_STORES } from '../domain/productExtensions.js';
import { snapshotRepository, snapshotReader, portableMetaKey, validatePortable, applyPortable, MAX_BACKUP_BYTES } from './portableBackup.js';
import { assertFoodPreferencesV2, assertSafetyProfileV2 } from '../domain/revisionV2Contracts.js';
import { ReferenceDataIndex } from './referenceDataService.js';
import { canonicalJson } from '../lib/crypto.js';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION } from '../db/constants.js';
import { sha256Json } from '../lib/crypto.js';
import { repositories } from '../repositories/repositoryHub.js';
import { assertConfigurationBundle } from './configurationService.js';

function userOnly(records) { return records.filter(record => record.origin === 'user'); }
function array(payload, key) {
  const value = payload[key];
  if (!Array.isArray(value)) throw new Error(`Backup payload ${key} must be an array`);
  return value;
}
function optionalArray(payload, key) { const value = payload[key]; return value === undefined ? [] : array(payload, key); }

async function configurationPayload(repo) {
  return {
    appConfig: (await repo.get('appConfigs', 'active')) || null,
    nutritionProfiles: await repo.getAll('nutritionProfiles'),
    allergyIntoleranceProfiles: await repo.getAll('allergyIntoleranceProfiles'),
    foodPreferences: await repo.getAll('foodPreferences'),
    themeProfiles: await repo.getAll('themeProfiles'),
    mealClasses: await repo.getAll('mealClasses'),
    dayClasses: await repo.getAll('dayClasses'),
    cycles: await repo.getAll('cycles')
  };
}

export async function createBackup({ repo = repositories, registry } = {}) {
  const snapshot = await snapshotRepository(repo);
  repo = snapshotReader(snapshot);
  const document = {
    format: 'yourDietManager-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dbSchemaVersion: DB_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    catalog: { catalogVersion: (await repo.getMeta('activeCatalogVersion')) || 'none' },
    createdAt: new Date().toISOString(),
    payload: {
      portableSnapshot: { ...snapshot, meta: snapshot.meta.filter(row => portableMetaKey(row.key)).map(({key,value}) => ({key,value})).sort((a,b)=>a.key.localeCompare(b.key)) },
      configuration: await configurationPayload(repo),
      customTaxonomies: userOnly(await repo.getAll('taxonomies')),
      customTaxonomyTerms: userOnly(await repo.getAll('taxonomyTerms')),
      customIngredients: userOnly(await repo.getAll('ingredients')),
      customIngredientRevisions: userOnly(await repo.getAll('ingredientRevisions')),
      customRecipes: userOnly(await repo.getAll('recipes')),
      customRecipeVersions: userOnly(await repo.getAll('recipeVersions')),
      plans: await repo.getAll('planInstances'),
      calendarDays: await repo.getAll('calendarDays'),
      generationRuns: await repo.getAll('generationRuns'),
      operations: await repo.getAll('operations'),
      shoppingChecklists: await repo.getAll('shoppingChecklists'),
      recipeHumanReviews: await repo.getAll('recipeHumanReviews'),
      foodGroups: await repo.getAll('foodGroups'), ingredientMappings: await repo.getAll('ingredientMappings'), ingredientConversions: await repo.getAll('ingredientConversions'),
      migratedIngredientRevisions: (await repo.getAll('ingredientRevisions')).filter(record => record.origin === 'base' && record.schemaVersion === 2),
      revisionV2State: { ingredientMigration: await repo.getMeta('contentMigration:4') || null, configurationDraft: await repo.getMeta('revisionV2:configurationDraft') || null }
    },
    sha256: null
  };
  document.sha256 = await sha256Json({ ...document, sha256: null });
  registry?.assert('backup', document);
  return document;
}

function validateConfiguration(registry, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Backup configuration payload is invalid');
  if (config.appConfig) registry.assert('appConfig', config.appConfig);
  const mapping = {
    nutritionProfiles: 'nutritionProfile', allergyIntoleranceProfiles: 'allergyIntoleranceProfile', foodPreferences: 'foodPreferences',
    themeProfiles: 'themeProfile', mealClasses: 'mealClass', dayClasses: 'dayClass', cycles: 'cycle'
  };
  for (const [key, schema] of Object.entries(mapping)) for (const record of config[key] || []) registry.assert(schema, record);
  if (config.appConfig) assertConfigurationBundle(config, registry);
}

export async function validateBackup(document, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 64 MiB');
  registry.assert('backup', document);
  if (document.dbSchemaVersion > DB_VERSION) throw new Error(`Backup requires DB schema ${document.dbSchemaVersion}`);
  if (document.contentSchemaVersion > CONTENT_SCHEMA_VERSION) throw new Error(`Backup requires content schema ${document.contentSchemaVersion}`);
  if (document.sha256) {
    const expected = await sha256Json({ ...document, sha256: null });
    if (expected !== document.sha256) throw new Error('Backup checksum mismatch');
  }
  if (document.formatVersion >= 3) { if (!document.sha256) throw new Error('Portable backup checksum required'); await validatePortable(document, registry); return document; }
  const active = (await repo.getMeta('activeCatalogVersion')) || 'none';
  if (document.catalog.catalogVersion !== active) throw new Error(`Backup catalog ${document.catalog.catalogVersion} does not match active catalog ${active}`);
  const payload = document.payload;
  validateConfiguration(registry, payload.configuration);
  const mapping = {
    customTaxonomies: 'taxonomy', customTaxonomyTerms: 'taxonomyTerm', customIngredients: 'ingredient', customIngredientRevisions: 'ingredientRevision', customRecipes: 'recipe', customRecipeVersions: 'recipeVersion',
    plans: 'planInstance', calendarDays: 'calendarDay', generationRuns: 'generationRun', operations: 'operation', shoppingChecklists: 'shoppingChecklist', recipeHumanReviews: 'recipeHumanReview'
  };
  for (const [key, schema] of Object.entries(mapping)) for (const record of (['customTaxonomies','customTaxonomyTerms','recipeHumanReviews'].includes(key) ? optionalArray(payload, key) : array(payload, key))) registry.assert(schema, record);
  if (document.formatVersion === 2) {
    for (const [key, schema] of Object.entries({ foodGroups: 'foodGroup', ingredientMappings: 'ingredientMapping', ingredientConversions: 'ingredientConversion', migratedIngredientRevisions: 'ingredientRevision' })) for (const record of array(payload, key)) registry.assert(schema, record);
    const knownIngredients = new Set([...(await repo.getAll('ingredients')), ...payload.customIngredients].map(item => item.ingredientId));
    const knownTerms = new Set([...(await repo.getAll('taxonomyTerms')), ...optionalArray(payload, 'customTaxonomyTerms')].filter(item => item.taxonomyId === 'product_food').map(item => item.termId));
    for (const group of payload.foodGroups) for (const member of group.members) {
      if (!(member.type === 'ingredient' ? knownIngredients : knownTerms).has(member.id)) throw new Error(`Backup FoodGroup has unresolved member ${member.id}`);
    }
    for (const edge of payload.ingredientConversions) {
      if (!knownIngredients.has(edge.fromIngredientId) || !knownIngredients.has(edge.toIngredientId)) throw new Error('Backup conversion has unresolved form');
      if (edge.purpose === 'unit' && edge.fromIngredientId !== edge.toIngredientId) throw new Error('Backup unit conversion changes form');
    }
    for (const record of [...payload.migratedIngredientRevisions, ...payload.customIngredientRevisions]) {
      const existing = await repo.get('ingredientRevisions', record.ingredientRevisionId);
      if (existing && canonicalJson(existing) !== canonicalJson(record)) throw new Error(`Immutable revision collision in backup: ${record.ingredientRevisionId}`);
      if (record.schemaVersion === 2 && record.contentHash !== await sha256Json({ ...record, contentHash: '' })) throw new Error(`Ingredient content checksum mismatch: ${record.ingredientRevisionId}`);
    }
    const draft = payload.revisionV2State?.configurationDraft;
    if (draft?.foodPreferences) registry.assert('food-preferences-v2.schema.json', draft.foodPreferences);
    if (draft?.safetyProfile) registry.assert('allergy-intolerance-profile-v2.schema.json', draft.safetyProfile);
  }
  const latestGroups = new Map(); for (const group of payload.foodGroups || []) if (!latestGroups.has(group.id) || latestGroups.get(group.id).version < group.version) latestGroups.set(group.id, group);
  const ctx = { registry, index: new ReferenceDataIndex([...(await repo.getAll('taxonomies')), ...optionalArray(payload, 'customTaxonomies')], [...(await repo.getAll('taxonomyTerms')), ...optionalArray(payload, 'customTaxonomyTerms')]), ingredients: [...(await repo.getAll('ingredients')), ...payload.customIngredients], foodGroups: [...latestGroups.values()], mealClasses: payload.configuration.mealClasses };
  for (const p of payload.configuration.foodPreferences || []) if (p.schemaVersion === 2) assertFoodPreferencesV2(p, ctx);
  for (const p of payload.configuration.allergyIntoleranceProfiles || []) if (p.schemaVersion === 2) assertSafetyProfileV2(p, ctx);
  return document;
}

export async function importBackup(document, { repo = repositories, registry } = {}) {
  const backup = await validateBackup(document, { repo, registry });
  const beforeSnapshot = await snapshotRepository(repo);
  const preImportBackup = await createBackup({ repo: { ...snapshotReader(beforeSnapshot), snapshot: async () => structuredClone(beforeSnapshot) }, registry });
  if (backup.formatVersion >= 3) return applyPortable(backup, {repo,registry,preImportBackup,beforeSnapshot});
  const payload = backup.payload;
  const config = payload.configuration;
  const baseTaxonomies = (await repo.getAll('taxonomies')).filter(record => record.origin !== 'user');
  const baseTaxonomyTerms = (await repo.getAll('taxonomyTerms')).filter(record => record.origin !== 'user');
  const baseIngredients = (await repo.getAll('ingredients')).filter(record => record.origin !== 'user');
  const baseIngredientRevisions = (await repo.getAll('ingredientRevisions')).filter(record => record.origin !== 'user');
  const baseRecipes = (await repo.getAll('recipes')).filter(record => record.origin !== 'user');
  const baseRecipeVersions = (await repo.getAll('recipeVersions')).filter(record => record.origin !== 'user');
  const data = {
    appConfigs: config.appConfig ? [config.appConfig] : [],
    nutritionProfiles: config.nutritionProfiles || [],
    allergyIntoleranceProfiles: config.allergyIntoleranceProfiles || [],
    foodPreferences: config.foodPreferences || [],
    themeProfiles: config.themeProfiles || [],
    mealClasses: config.mealClasses || [],
    dayClasses: config.dayClasses || [],
    cycles: config.cycles || [],
    taxonomies: [...baseTaxonomies, ...optionalArray(payload, 'customTaxonomies')],
    taxonomyTerms: [...baseTaxonomyTerms, ...optionalArray(payload, 'customTaxonomyTerms')],
    ingredients: [...baseIngredients, ...array(payload, 'customIngredients')],
    ingredientRevisions: [...baseIngredientRevisions, ...optionalArray(payload, 'migratedIngredientRevisions'), ...array(payload, 'customIngredientRevisions')],
    recipes: [...baseRecipes, ...array(payload, 'customRecipes')],
    recipeVersions: [...baseRecipeVersions, ...array(payload, 'customRecipeVersions')],
    planInstances: array(payload, 'plans'),
    calendarDays: array(payload, 'calendarDays'),
    generationRuns: array(payload, 'generationRuns'),
    operations: array(payload, 'operations'),
    shoppingChecklists: array(payload, 'shoppingChecklists'),
    recipeHumanReviews: optionalArray(payload, 'recipeHumanReviews'),
    foodGroups: optionalArray(payload, 'foodGroups'), ingredientMappings: optionalArray(payload, 'ingredientMappings'), ingredientConversions: optionalArray(payload, 'ingredientConversions')
  };
  // Legacy reader needs the matching installed catalog, then uses the same guarded boundary.
  for (const store of ['ingredients','ingredientRevisions','recipes','recipeVersions','taxonomies','taxonomyTerms']) { const field={ingredients:'ingredientId',ingredientRevisions:'ingredientRevisionId',recipes:'recipeId',recipeVersions:'recipeVersionId',taxonomies:'taxonomyId',taxonomyTerms:'termId'}[store]; data[store]=[...new Map(data[store].map(row=>[row[field],row])).values()]; }
  const portable = structuredClone(preImportBackup);
  portable.payload.configuration = config;
  portable.payload.portableSnapshot = {...portable.payload.portableSnapshot,...data,...Object.fromEntries(EXTENSION_STORES.map(s=>[s,[]]))};
  const meta = new Map(portable.payload.portableSnapshot.meta.map(row=>[row.key,row.value]));
  meta.delete('productExtensions:R8');
  meta.set('contentMigration:4',payload.revisionV2State?.ingredientMigration || null); meta.set('revisionV2:configurationDraft',payload.revisionV2State?.configurationDraft || null);
  const plans = [...data.planInstances].sort((a,b)=>(a.updatedAt||'').localeCompare(b.updatedAt||''));
  if (!plans.some(p=>p.planInstanceId===meta.get('activePlanInstanceId'))) meta.set('activePlanInstanceId',plans.at(-1)?.planInstanceId||null);
  for(const key of [...meta.keys()])if(key.startsWith('operationHistory:') || key.startsWith('planCommand:'))meta.delete(key);
  portable.payload.portableSnapshot.meta=[...meta].map(([key,value])=>({key,value}));
  portable.sha256=await sha256Json({...portable,sha256:null});
  return applyPortable(portable,{repo,registry,preImportBackup,beforeSnapshot});
}
