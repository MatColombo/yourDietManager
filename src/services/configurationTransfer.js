import { sha256Json } from '../lib/crypto.js';
import { repositories } from '../repositories/repositoryHub.js';
import { CONFIG_COLLECTIONS, assertConfigurationBundle, loadConfigurationBundle, saveConfigurationBundle } from './configurationService.js';

const FORMAT = 'yourDietManager-configuration';
const FORMAT_VERSION = 2;
const SUPPORTED_FORMAT_VERSIONS = new Set([1, 2]);

function clone(value) { return structuredClone(value); }

function structurePayload(bundle) {
  return {
    appConfigPatch: {
      measurementSystem: bundle.appConfig.measurementSystem,
      weekStart: bundle.appConfig.weekStart,
      themeProfileId: bundle.appConfig.themeProfileId,
      mealClassIds: clone(bundle.appConfig.mealClassIds),
      dayClassIds: clone(bundle.appConfig.dayClassIds),
      cycleId: bundle.appConfig.cycleId
    },
    themeProfiles: clone(bundle.themeProfiles),
    mealClasses: clone(bundle.mealClasses),
    dayClasses: clone(bundle.dayClasses),
    cycles: clone(bundle.cycles)
  };
}

function configurationPayload(bundle) {
  return {
    appConfig: clone(bundle.appConfig),
    ...Object.fromEntries(Object.keys(CONFIG_COLLECTIONS).map(collection => [collection, clone(bundle[collection] || [])]))
  };
}

export async function createConfigurationExport(bundle, { mode = 'full', repo = repositories } = {}) {
  if (!['structure', 'full'].includes(mode)) throw new Error(`Unsupported configuration export mode ${mode}`);
  const payload = mode === 'full'
    ? {
        configuration: configurationPayload(bundle),
        foodGroups: clone(await repo.getAll('foodGroups')),
        profileDeclaration: clone((await repo.getMeta('profileDeclaration:R4')) ?? null)
      }
    : structurePayload(bundle);
  const document = { format: FORMAT, formatVersion: FORMAT_VERSION, mode, createdAt: new Date().toISOString(), payload, sha256: null };
  document.sha256 = await sha256Json({ ...document, sha256: null });
  return document;
}

export async function validateConfigurationExport(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Configuration document is invalid');
  if (document.format !== FORMAT) throw new Error(`Unexpected configuration format ${document.format || 'unknown'}`);
  if (!SUPPORTED_FORMAT_VERSIONS.has(document.formatVersion)) throw new Error(`Unsupported configuration format version ${document.formatVersion}`);
  if (!['structure', 'full'].includes(document.mode)) throw new Error(`Unsupported configuration mode ${document.mode}`);
  if (!document.payload || typeof document.payload !== 'object' || Array.isArray(document.payload)) throw new Error('Configuration payload is invalid');
  if (document.formatVersion >= 2 && document.mode === 'full') {
    if (!document.payload.configuration || typeof document.payload.configuration !== 'object' || Array.isArray(document.payload.configuration)) throw new Error('Complete configuration payload is invalid');
    if (!Array.isArray(document.payload.foodGroups)) throw new Error('Complete configuration FoodGroups are invalid');
    if (document.payload.profileDeclaration !== null && (typeof document.payload.profileDeclaration !== 'object' || Array.isArray(document.payload.profileDeclaration))) throw new Error('Complete configuration profile declaration is invalid');
  }
  const expected = await sha256Json({ ...document, sha256: null });
  if (document.sha256 !== expected) throw new Error('Configuration checksum mismatch');
  return document;
}

function fullConfigurationFromDocument(validated) {
  return clone(validated.formatVersion >= 2 ? validated.payload.configuration : validated.payload);
}

export async function importConfigurationExport(document, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const validated = await validateConfigurationExport(document);
  let next;
  let foodGroups = null;
  let profileDeclaration;
  if (validated.mode === 'full') {
    next = fullConfigurationFromDocument(validated);
    if (validated.formatVersion >= 2) {
      foodGroups = clone(validated.payload.foodGroups);
      profileDeclaration = clone(validated.payload.profileDeclaration);
    }
  } else {
    const current = await loadConfigurationBundle(repo);
    const patch = validated.payload.appConfigPatch || {};
    next = {
      ...clone(current),
      appConfig: { ...clone(current.appConfig), ...clone(patch) },
      themeProfiles: clone(validated.payload.themeProfiles || []),
      mealClasses: clone(validated.payload.mealClasses || []),
      dayClasses: clone(validated.payload.dayClasses || []),
      cycles: clone(validated.payload.cycles || [])
    };
  }
  assertConfigurationBundle(next, registry);
  const meta = {
    configurationOnboardingComplete: true,
    phase2OnboardingDraft: null,
    ...(validated.mode === 'full' && validated.formatVersion >= 2 ? { 'profileDeclaration:R4': profileDeclaration ?? null } : {})
  };
  const saved = await saveConfigurationBundle(next, { repo, registry, meta, foodGroups });
  return saved;
}
