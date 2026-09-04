import { repositories } from '../repositories/repositoryHub.js';
import { assetPath } from '../lib/appBase.js';
import { assertConfigurationBundle, CONFIG_COLLECTIONS } from './configurationService.js';
import { loadReferenceDataIndex, assertSemanticReferences } from './referenceDataService.js';

export const STANDARD_BOOTSTRAP_VERSION = 'standard-v1';

async function loadBootstrapBundle({ fetcher, registry, timeZoneResolver }) {
  const response = await fetcher(assetPath('/data/bootstrap/default-configuration.json'));
  if (!response.ok) throw new Error(`Unable to load bootstrap configuration: HTTP ${response.status}`);
  const bundle = await response.json();
  const localTimeZone = timeZoneResolver?.();
  if (localTimeZone) bundle.appConfig.timeZone = localTimeZone;
  registry.assert('appConfig', bundle.appConfig);
  for (const [store, schema] of Object.entries(CONFIG_COLLECTIONS)) for (const value of bundle[store] || []) registry.assert(schema, value);
  assertConfigurationBundle(bundle, registry);
  return bundle;
}

async function activateBootstrapBundle(bundle, { repo, registry }) {
  const referenceIndex = await loadReferenceDataIndex(repo);
  assertSemanticReferences({ index: referenceIndex, configuration: bundle, ingredientIds: (await repo.getAll('ingredients')).map(item => item.ingredientId) });
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
  await repo.setMeta('bootstrapConfigurationVersion', STANDARD_BOOTSTRAP_VERSION);
  return bundle.appConfig;
}

export async function ensureBootstrapConfiguration({
  repo = repositories,
  registry,
  fetcher = fetch,
  timeZoneResolver = () => globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || null
} = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const existing = await repo.get('appConfigs', 'active');
  if (existing) {
    const [source, version, updatedAt] = await Promise.all([
      repo.getMeta('bootstrapConfigurationSource'), repo.getMeta('bootstrapConfigurationVersion'), repo.getMeta('configurationUpdatedAt')
    ]);
    // Upgrade only an untouched legacy bootstrap. Any explicit user save/import wins.
    if (source === 'default-configuration.json' && version !== STANDARD_BOOTSTRAP_VERSION && !updatedAt) {
      const bundle = await loadBootstrapBundle({ fetcher, registry, timeZoneResolver });
      await repo.setMeta('phase2OnboardingDraft', null);
      return activateBootstrapBundle(bundle, { repo, registry });
    }
    return existing;
  }

  const bundle = await loadBootstrapBundle({ fetcher, registry, timeZoneResolver });
  return activateBootstrapBundle(bundle, { repo, registry });
}
