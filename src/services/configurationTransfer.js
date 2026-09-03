import { sha256Json } from '../lib/crypto.js';
import { repositories } from '../repositories/repositoryHub.js';
import { assertConfigurationBundle, loadConfigurationBundle, saveConfigurationBundle } from './configurationService.js';

const FORMAT = 'yourDietManager-configuration';
const FORMAT_VERSION = 1;

function clone(value) { return structuredClone(value); }

export async function createConfigurationExport(bundle, { mode = 'structure' } = {}) {
  if (!['structure', 'full'].includes(mode)) throw new Error(`Unsupported configuration export mode ${mode}`);
  const payload = mode === 'full' ? clone(bundle) : {
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
  const document = { format: FORMAT, formatVersion: FORMAT_VERSION, mode, createdAt: new Date().toISOString(), payload, sha256: null };
  document.sha256 = await sha256Json({ ...document, sha256: null });
  return document;
}

export async function validateConfigurationExport(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Configuration document is invalid');
  if (document.format !== FORMAT) throw new Error(`Unexpected configuration format ${document.format || 'unknown'}`);
  if (document.formatVersion !== FORMAT_VERSION) throw new Error(`Unsupported configuration format version ${document.formatVersion}`);
  if (!['structure', 'full'].includes(document.mode)) throw new Error(`Unsupported configuration mode ${document.mode}`);
  if (!document.payload || typeof document.payload !== 'object' || Array.isArray(document.payload)) throw new Error('Configuration payload is invalid');
  const expected = await sha256Json({ ...document, sha256: null });
  if (document.sha256 !== expected) throw new Error('Configuration checksum mismatch');
  return document;
}

export async function importConfigurationExport(document, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const validated = await validateConfigurationExport(document);
  let next;
  if (validated.mode === 'full') {
    next = clone(validated.payload);
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
  const saved = await saveConfigurationBundle(next, { repo, registry });
  await repo.setMeta('configurationOnboardingComplete', true);
  await repo.setMeta('phase2OnboardingDraft', null);
  return saved;
}
