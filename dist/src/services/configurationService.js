import { repositories } from '../repositories/repositoryHub.js';
import { DAY_ARCHETYPES, MEAL_RULE_TARGET_REGISTRY, NUTRIENT_KEYS } from '../domain/configurationRules.js';
import { loadReferenceDataIndex, assertSemanticReferences } from './referenceDataService.js';

export const CONFIG_COLLECTIONS = Object.freeze({
  nutritionProfiles: 'nutritionProfile',
  allergyIntoleranceProfiles: 'allergyIntoleranceProfile',
  foodPreferences: 'foodPreferences',
  themeProfiles: 'themeProfile',
  mealClasses: 'mealClass',
  dayClasses: 'dayClass',
  cycles: 'cycle'
});

export const CONFIG_STORES = Object.freeze(['appConfigs', ...Object.keys(CONFIG_COLLECTIONS)]);

function clone(value) { return structuredClone(value); }
function unique(values) { return new Set(values).size === values.length; }
function idSet(values) { return new Set(values.map(value => value.id)); }
function ordered(values) { return values.filter(value => value !== null && value !== undefined); }
function present(value) { return value !== null && value !== undefined; }

export async function loadConfigurationBundle(repo = repositories) {
  const bundle = { appConfig: await repo.get('appConfigs', 'active') };
  for (const collection of Object.keys(CONFIG_COLLECTIONS)) bundle[collection] = await repo.getAll(collection);
  return bundle;
}

export function configurationDiagnostics(bundle, registry) {
  const errors = [];
  const warnings = [];
  const push = (path, message) => errors.push({ path, message });
  if (!bundle?.appConfig) return { valid: false, errors: [{ path: 'appConfig', message: 'missing active AppConfig' }], warnings };

  try { registry?.assert('appConfig', bundle.appConfig); } catch (error) { push('appConfig', error.message); }
  for (const [collection, schema] of Object.entries(CONFIG_COLLECTIONS)) {
    const records = bundle[collection] || [];
    if (!Array.isArray(records)) { push(collection, 'must be an array'); continue; }
    for (const [index, record] of records.entries()) {
      try { registry?.assert(schema, record); } catch (error) { push(`${collection}[${index}]`, error.message); }
    }
    const ids = records.map(record => record?.id).filter(Boolean);
    if (!unique(ids)) push(collection, 'duplicate record id');
  }

  const config = bundle.appConfig;
  const nutritionIds = idSet(bundle.nutritionProfiles || []);
  const allergyIds = idSet(bundle.allergyIntoleranceProfiles || []);
  const preferenceIds = idSet(bundle.foodPreferences || []);
  const themeIds = idSet(bundle.themeProfiles || []);
  const mealIds = idSet(bundle.mealClasses || []);
  const dayIds = idSet(bundle.dayClasses || []);
  const cycleIds = idSet(bundle.cycles || []);
  const activeMealIds = new Set(config.mealClassIds || []);
  const activeDayIds = new Set(config.dayClassIds || []);

  if (!nutritionIds.has(config.nutritionProfileId)) push('appConfig.nutritionProfileId', 'referenced NutritionProfile does not exist');
  if (!allergyIds.has(config.allergyIntoleranceProfileId)) push('appConfig.allergyIntoleranceProfileId', 'referenced AllergyIntoleranceProfile does not exist');
  if (!preferenceIds.has(config.foodPreferencesId)) push('appConfig.foodPreferencesId', 'referenced FoodPreferences does not exist');
  if (!themeIds.has(config.themeProfileId)) push('appConfig.themeProfileId', 'referenced ThemeProfile does not exist');
  if (!cycleIds.has(config.cycleId)) push('appConfig.cycleId', 'referenced Cycle does not exist');
  for (const id of config.mealClassIds || []) if (!mealIds.has(id)) push('appConfig.mealClassIds', `MealClass ${id} does not exist`);
  for (const id of config.dayClassIds || []) if (!dayIds.has(id)) push('appConfig.dayClassIds', `DayClass ${id} does not exist`);

  for (const profile of bundle.nutritionProfiles || []) {
    if (!(profile.dailyEnergyKcal > 0)) push(`nutritionProfiles.${profile.id}.dailyEnergyKcal`, 'daily energy must be greater than zero');
    for (const key of NUTRIENT_KEYS) {
      const nutrient = profile.nutrients?.[key];
      if (!nutrient) continue;
      if (!nutrient.enabled) {
        if (nutrient.min !== null || nutrient.target !== null || nutrient.max !== null || nutrient.weight !== 0) {
          push(`nutritionProfiles.${profile.id}.nutrients.${key}`, 'disabled nutrient must have null min/target/max and weight 0');
        }
        continue;
      }
      const [min, target, max] = [nutrient.min, nutrient.target, nutrient.max];
      if (!present(min) && !present(target) && !present(max)) push(`nutritionProfiles.${profile.id}.nutrients.${key}`, 'enabled nutrient requires at least one min, target or max');
      if (present(min) && present(target) && min > target) push(`nutritionProfiles.${profile.id}.nutrients.${key}`, 'min must be <= target');
      if (present(target) && present(max) && target > max) push(`nutritionProfiles.${profile.id}.nutrients.${key}`, 'target must be <= max');
      if (present(min) && present(max) && min > max) push(`nutritionProfiles.${profile.id}.nutrients.${key}`, 'min must be <= max');
    }
    for (const [archetype, modifier] of Object.entries(profile.dayArchetypeModifiers || {})) {
      if (!DAY_ARCHETYPES.includes(archetype)) push(`nutritionProfiles.${profile.id}.dayArchetypeModifiers.${archetype}`, 'unknown day archetype');
      if (modifier?.mode === 'percent' && Number(modifier.value) <= -100) push(`nutritionProfiles.${profile.id}.dayArchetypeModifiers.${archetype}`, 'percent modifier must be greater than -100');
      const resolved = modifier?.mode === 'percent' ? profile.dailyEnergyKcal * (1 + Number(modifier.value) / 100) : profile.dailyEnergyKcal + Number(modifier?.value || 0);
      if (!(resolved > 0)) push(`nutritionProfiles.${profile.id}.dayArchetypeModifiers.${archetype}`, 'resolved daily energy target must remain greater than zero');
    }
  }

  for (const meal of bundle.mealClasses || []) {
    const share = meal.energyShare;
    if (share && !(share.min <= share.target && share.target <= share.max)) push(`mealClasses.${meal.id}.energyShare`, 'energy share must satisfy min <= target <= max');
    for (const [index, rule] of (meal.rules || []).entries()) {
      if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') {
        const registryTargets = MEAL_RULE_TARGET_REGISTRY[rule.ruleType];
        if (!(rule.target in registryTargets)) push(`mealClasses.${meal.id}.rules[${index}].target`, `unsupported ${rule.ruleType} target`);
        if (!present(rule.operator) || !present(rule.value)) push(`mealClasses.${meal.id}.rules[${index}]`, 'quantitative rule requires operator and value');
      } else if (present(rule.operator) || present(rule.value)) {
        push(`mealClasses.${meal.id}.rules[${index}]`, 'categorical rule cannot carry operator/value');
      }
    }
  }

  for (const day of bundle.dayClasses || []) {
    if (day.dayArchetype !== 'free' && (day.mealSlots || []).length === 0) push(`dayClasses.${day.id}.mealSlots`, 'non-free DayClass requires at least one meal slot');
    const slotIds = (day.mealSlots || []).map(slot => slot.id);
    if (!unique(slotIds)) push(`dayClasses.${day.id}.mealSlots`, 'slot ids must be unique within the DayClass');
    for (const slot of day.mealSlots || []) {
      if (!mealIds.has(slot.mealClassId)) push(`dayClasses.${day.id}.mealSlots.${slot.id}.mealClassId`, `MealClass ${slot.mealClassId} does not exist`);
      else if (!activeMealIds.has(slot.mealClassId)) push(`dayClasses.${day.id}.mealSlots.${slot.id}.mealClassId`, `MealClass ${slot.mealClassId} is not active in AppConfig`);
      if (slot.energyBudgetKcal != null && slot.energyShare != null) push(`dayClasses.${day.id}.mealSlots.${slot.id}`, 'set either energyBudgetKcal or energyShare, not both');
      if (slot.mode === 'planned' && slot.proteinMinG != null) push(`dayClasses.${day.id}.mealSlots.${slot.id}.proteinMinG`, 'proteinMinG is external-meal guidance only and must be null for planned slots');
      if (slot.mode === 'planned' && slot.estimatedNutritionPolicy != null) push(`dayClasses.${day.id}.mealSlots.${slot.id}.estimatedNutritionPolicy`, 'estimatedNutritionPolicy is valid only for external slots');
      if (slot.mode === 'external' && slot.estimatedNutritionPolicy !== 'unknown' && slot.energyBudgetKcal == null && slot.energyShare == null) push(`dayClasses.${day.id}.mealSlots.${slot.id}`, 'budgeted external slot requires energyBudgetKcal or energyShare');
    }
    const groups = new Map();
    for (const slot of day.mealSlots || []) {
      const key = `${slot.dayOffset}|${slot.time}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    }
    for (const [key, slots] of groups) if (slots.length > 1 && slots.some(slot => slot.parallel !== true)) push(`dayClasses.${day.id}.mealSlots`, `overlap ${key} requires parallel=true on every overlapping slot`);
  }

  for (const cycle of bundle.cycles || []) {
    if (cycle.length !== (cycle.days || []).length) push(`cycles.${cycle.id}`, 'length must equal number of cycle days');
    const sequence = (cycle.days || []).map(day => day.cycleDay);
    for (let index = 0; index < cycle.length; index += 1) if (sequence[index] !== index + 1) push(`cycles.${cycle.id}.days`, 'cycleDay must be the ordered sequence 1..N without gaps');
    for (const day of cycle.days || []) {
      if (!dayIds.has(day.dayClassId)) push(`cycles.${cycle.id}.days.${day.cycleDay}.dayClassId`, `DayClass ${day.dayClassId} does not exist`);
      else if (!activeDayIds.has(day.dayClassId)) push(`cycles.${cycle.id}.days.${day.cycleDay}.dayClassId`, `DayClass ${day.dayClassId} is not active in AppConfig`);
    }
  }

  const activeCycle = (bundle.cycles || []).find(cycle => cycle.id === config.cycleId);
  if (activeCycle && activeCycle.length > 21) warnings.push({ path: `cycles.${activeCycle.id}`, message: 'Long cycles are valid but may be slower to edit manually.' });
  return { valid: errors.length === 0, errors, warnings };
}

export function assertConfigurationBundle(bundle, registry) {
  const result = configurationDiagnostics(bundle, registry);
  if (!result.valid) throw new Error(`Configuration validation failed: ${result.errors.slice(0, 10).map(item => `${item.path}: ${item.message}`).join('; ')}`);
  return result;
}

export async function saveConfigurationBundle(bundle, { repo = repositories, registry } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const clean = clone(bundle);
  assertConfigurationBundle(clean, registry);
  const referenceIndex = await loadReferenceDataIndex(repo);
  assertSemanticReferences({ index: referenceIndex, configuration: clean, ingredientIds: (await repo.getAll('ingredients')).map(item => item.ingredientId) });
  await repo.atomicReplace({
    appConfigs: [clean.appConfig],
    nutritionProfiles: clean.nutritionProfiles || [],
    allergyIntoleranceProfiles: clean.allergyIntoleranceProfiles || [],
    foodPreferences: clean.foodPreferences || [],
    themeProfiles: clean.themeProfiles || [],
    mealClasses: clean.mealClasses || [],
    dayClasses: clean.dayClasses || [],
    cycles: clean.cycles || []
  });
  await repo.setMeta('configurationUpdatedAt', new Date().toISOString());
  return clean;
}

export function replaceConfigurationRecord(bundle, collection, record) {
  if (!(collection in CONFIG_COLLECTIONS)) throw new Error(`Unknown configuration collection ${collection}`);
  const next = clone(bundle);
  const records = next[collection] || [];
  const index = records.findIndex(item => item.id === record.id);
  if (index >= 0) records[index] = clone(record); else records.push(clone(record));
  next[collection] = records;
  return next;
}

export function removeConfigurationRecord(bundle, collection, id) {
  if (!(collection in CONFIG_COLLECTIONS)) throw new Error(`Unknown configuration collection ${collection}`);
  const next = clone(bundle);
  next[collection] = (next[collection] || []).filter(item => item.id !== id);
  return next;
}

export async function getOnboardingDraft({ repo = repositories } = {}) {
  return (await repo.getMeta('phase2OnboardingDraft')) || null;
}

export async function saveOnboardingDraft(bundle, step, { repo = repositories } = {}) {
  const draft = { version: 1, step, savedAt: new Date().toISOString(), bundle: clone(bundle) };
  await repo.setMeta('phase2OnboardingDraft', draft);
  return draft;
}

export async function completeOnboarding(bundle, { repo = repositories, registry } = {}) {
  const saved = await saveConfigurationBundle(bundle, { repo, registry });
  await repo.setMeta('phase2OnboardingDraft', null);
  await repo.setMeta('configurationOnboardingComplete', true);
  await repo.setMeta('configurationOnboardingCompletedAt', new Date().toISOString());
  return saved;
}

export async function onboardingIsComplete({ repo = repositories } = {}) {
  return Boolean(await repo.getMeta('configurationOnboardingComplete'));
}

export function activeRecords(bundle) {
  const config = bundle.appConfig;
  return {
    nutritionProfile: (bundle.nutritionProfiles || []).find(item => item.id === config.nutritionProfileId),
    allergyProfile: (bundle.allergyIntoleranceProfiles || []).find(item => item.id === config.allergyIntoleranceProfileId),
    foodPreferences: (bundle.foodPreferences || []).find(item => item.id === config.foodPreferencesId),
    themeProfile: (bundle.themeProfiles || []).find(item => item.id === config.themeProfileId),
    mealClasses: (bundle.mealClasses || []).filter(item => config.mealClassIds.includes(item.id)),
    dayClasses: (bundle.dayClasses || []).filter(item => config.dayClassIds.includes(item.id)),
    cycle: (bundle.cycles || []).find(item => item.id === config.cycleId)
  };
}

export function normalizeCycle(cycle, fallbackDayClassId) {
  const next = clone(cycle);
  next.length = Math.max(1, Math.min(31, Number(next.length) || 1));
  const existing = new Map((next.days || []).map(day => [day.cycleDay, day.dayClassId]));
  next.days = Array.from({ length: next.length }, (_, index) => ({ cycleDay: index + 1, dayClassId: existing.get(index + 1) || fallbackDayClassId }));
  return next;
}

export function summarizeConfiguration(bundle, registry) {
  const active = activeRecords(bundle);
  const diagnostics = configurationDiagnostics(bundle, registry);
  return {
    valid: diagnostics.valid,
    errors: diagnostics.errors,
    warnings: diagnostics.warnings,
    dailyEnergyKcal: active.nutritionProfile?.dailyEnergyKcal ?? null,
    hardRuleCount: active.allergyProfile?.rules?.filter(rule => rule.enabled).length || 0,
    preferenceCount: active.foodPreferences?.rules?.length || 0,
    mealClassCount: active.mealClasses.length,
    dayClassCount: active.dayClasses.length,
    cycleLength: active.cycle?.length || 0,
    cycleArchetypes: ordered(active.cycle?.days?.map(day => active.dayClasses.find(item => item.id === day.dayClassId)?.dayArchetype) || [])
  };
}
