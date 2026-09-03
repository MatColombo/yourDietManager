import { repositories } from '../repositories/repositoryHub.js';
import { assertConfigurationBundle, CONFIG_COLLECTIONS } from './configurationService.js';

export async function ensureBootstrapConfiguration({ repo = repositories, registry, fetcher = fetch } = {}) {
  const existing = await repo.get('appConfigs', 'active');
  if (existing) return existing;
  if (!registry) throw new Error('Schema registry is required');

  const response = await fetcher('/data/bootstrap/default-configuration.json');
  if (!response.ok) throw new Error(`Unable to load bootstrap configuration: HTTP ${response.status}`);
  const bundle = await response.json();
  registry.assert('appConfig', bundle.appConfig);
  for (const [store, schema] of Object.entries(CONFIG_COLLECTIONS)) for (const value of bundle[store] || []) registry.assert(schema, value);
  assertConfigurationBundle(bundle, registry);
  await repo.atomicReplace({
    appConfigs: [bundle.appConfig],
    nutritionProfiles: bundle.nutritionProfiles || [],
    allergyIntoleranceProfiles: bundle.allergyIntoleranceProfiles || [],
    foodPreferences: bundle.foodPreferences || [],
    themeProfiles: bundle.themeProfiles || [],
    mealClasses: bundle.mealClasses || [],
    dayClasses: bundle.dayClasses || [],
    cycles: bundle.cycles || []
  });
  await repo.setMeta('bootstrapConfigurationSource', 'default-configuration.json');
  return bundle.appConfig;
}
