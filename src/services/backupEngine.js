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
  const document = {
    format: 'yourDietManager-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dbSchemaVersion: DB_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    catalog: { catalogVersion: (await repo.getMeta('activeCatalogVersion')) || 'none' },
    createdAt: new Date().toISOString(),
    payload: {
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
      recipeHumanReviews: await repo.getAll('recipeHumanReviews')
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
  registry.assert('backup', document);
  if (document.dbSchemaVersion > DB_VERSION) throw new Error(`Backup requires DB schema ${document.dbSchemaVersion}`);
  if (document.contentSchemaVersion > CONTENT_SCHEMA_VERSION) throw new Error(`Backup requires content schema ${document.contentSchemaVersion}`);
  if (document.sha256) {
    const expected = await sha256Json({ ...document, sha256: null });
    if (expected !== document.sha256) throw new Error('Backup checksum mismatch');
  }
  const active = (await repo.getMeta('activeCatalogVersion')) || 'none';
  if (document.catalog.catalogVersion !== active) throw new Error(`Backup catalog ${document.catalog.catalogVersion} does not match active catalog ${active}`);
  const payload = document.payload;
  validateConfiguration(registry, payload.configuration);
  const mapping = {
    customTaxonomies: 'taxonomy', customTaxonomyTerms: 'taxonomyTerm', customIngredients: 'ingredient', customIngredientRevisions: 'ingredientRevision', customRecipes: 'recipe', customRecipeVersions: 'recipeVersion',
    plans: 'planInstance', calendarDays: 'calendarDay', generationRuns: 'generationRun', operations: 'operation', shoppingChecklists: 'shoppingChecklist', recipeHumanReviews: 'recipeHumanReview'
  };
  for (const [key, schema] of Object.entries(mapping)) for (const record of (['customTaxonomies','customTaxonomyTerms','recipeHumanReviews'].includes(key) ? optionalArray(payload, key) : array(payload, key))) registry.assert(schema, record);
  return document;
}

export async function importBackup(document, { repo = repositories, registry } = {}) {
  const backup = await validateBackup(document, { repo, registry });
  const preImportBackup = await createBackup({ repo, registry });
  const payload = backup.payload;
  const config = payload.configuration;
  const baseTaxonomies = (await repo.getAll('taxonomies')).filter(record => record.origin !== 'user');
  const baseTaxonomyTerms = (await repo.getAll('taxonomyTerms')).filter(record => record.origin !== 'user');
  const baseIngredients = (await repo.getAll('ingredients')).filter(record => record.origin !== 'user');
  const baseIngredientRevisions = (await repo.getAll('ingredientRevisions')).filter(record => record.origin !== 'user');
  const baseRecipes = (await repo.getAll('recipes')).filter(record => record.origin !== 'user');
  const baseRecipeVersions = (await repo.getAll('recipeVersions')).filter(record => record.origin !== 'user');
  await repo.atomicReplace({
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
    ingredientRevisions: [...baseIngredientRevisions, ...array(payload, 'customIngredientRevisions')],
    recipes: [...baseRecipes, ...array(payload, 'customRecipes')],
    recipeVersions: [...baseRecipeVersions, ...array(payload, 'customRecipeVersions')],
    planInstances: array(payload, 'plans'),
    calendarDays: array(payload, 'calendarDays'),
    generationRuns: array(payload, 'generationRuns'),
    operations: array(payload, 'operations'),
    shoppingChecklists: array(payload, 'shoppingChecklists'),
    recipeHumanReviews: optionalArray(payload, 'recipeHumanReviews')
  });
  await repo.setMeta('lastBackupImportAt', new Date().toISOString());
  return { preImportBackup };
}
