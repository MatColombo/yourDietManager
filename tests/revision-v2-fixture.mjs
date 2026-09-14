import path from 'node:path';
import theme from '../examples/theme-profile.example.json' with { type: 'json' };
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader, syntheticSafetyEvidence } from './helpers.mjs';
const root = process.cwd();
function revision(id, ingredientId, foodGroup, allergens = []) { return { ingredientRevisionId: id, ingredientId, taxonomy: { foodGroup, foodSubgroup: foodGroup }, allergenIds: allergens, safetyEvidence: syntheticSafetyEvidence(allergens), basis: { state: 'cooked' }, source: { reference: 'synthetic-fixture' } }; }
function recipe(id, archetype, energy, protein, { ingredient, revisionId, allergens = [], family = 'simple' } = {}) {
  return { recipeVersionId: `rv_${id}`, recipeId: `r_${id}`, mealArchetypes: [archetype], calculatedNutrition: { energyKcal: energy, proteinG: protein, carbsG: energy / 10, fatG: energy / 40, fiberG: 5 }, practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: false, mealPrepSuitable: true }, tags: { families: [family], cuisines: ['test'], diet: [], flavor: ['savory'], practical: ['portable'] }, allergenIds: allergens, ingredientLines: [{ ingredientId: ingredient, ingredientRevisionId: revisionId, amount: 100, unit: 'g', normalizedAmount: 100, normalizedUnit: 'g', optional: false, notesKey: null }], quality: { status: 'validated' }, origin: 'base', i18n: { it: { title: id }, en: { title: id } } };
}

export async function plannerFixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  const mealClasses = [
    { schemaVersion: 1, id: 'mc-breakfast', name: 'Breakfast', abbreviation: 'BR', mealArchetype: 'breakfast', energyShare: { target: 0.22, min: 0.15, max: 0.3 }, rules: [] },
    { schemaVersion: 1, id: 'mc-dinner', name: 'Dinner', abbreviation: 'DI', mealArchetype: 'dinner', energyShare: { target: 0.35, min: 0.2, max: 0.5 }, rules: [] },
    { schemaVersion: 1, id: 'mc-night', name: 'Night', abbreviation: 'NI', mealArchetype: 'night_meal', energyShare: { target: 0.25, min: 0.15, max: 0.35 }, rules: [] },
    { schemaVersion: 1, id: 'mc-lunch', name: 'Lunch', abbreviation: 'LU', mealArchetype: 'lunch', energyShare: { target: 0.28, min: 0.2, max: 0.4 }, rules: [] }
  ];
  const capabilities = { fridge: 'yes', reheating: 'yes', cooking: true, complexSnack: true, portabilityRequired: false, maxPrepMinutes: 60 };
  const dayClasses = [
    { schemaVersion: 1, id: 'dc-day', name: 'Day', abbreviation: 'DA', color: '#446644', dayArchetype: 'day', workWindows: [], capabilities, mealSlots: [
      { id: 'breakfast', mealClassId: 'mc-breakfast', time: '08:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 400, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'lunch', mealClassId: 'mc-lunch', time: '13:00', dayOffset: 0, mode: 'external', energyBudgetKcal: 500, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: 25, estimatedNutritionPolicy: 'budget_only' },
      { id: 'dinner', mealClassId: 'mc-dinner', time: '20:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] },
    { schemaVersion: 1, id: 'dc-night', name: 'Night', abbreviation: 'NT', color: '#333366', dayArchetype: 'night', workWindows: [], capabilities, mealSlots: [
      { id: 'pre', mealClassId: 'mc-dinner', time: '19:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: 700, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null },
      { id: 'night', mealClassId: 'mc-night', time: '02:00', dayOffset: 1, mode: 'planned', energyBudgetKcal: 500, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }
    ] }
  ];
  const nutrition = { schemaVersion: 1, id: 'nutrition', dailyEnergyKcal: 1600, energyTolerancePct: 10, preset: 'balanced', nutrients: { proteinG: { enabled: true, min: 70, target: 100, max: null, weight: 1.5 }, carbsG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fatG: { enabled: false, min: null, target: null, max: null, weight: 0 }, fiberG: { enabled: false, min: null, target: null, max: null, weight: 0 } }, dayArchetypeModifiers: {} };
  const allergy = { schemaVersion: 1, id: 'allergy', rules: [{ id: 'fish', kind: 'allergy', targetType: 'allergen', targetId: 'fish', label: 'Fish', enabled: true, notes: '' }] };
  const prefs = { schemaVersion: 1, id: 'prefs', rules: [] };
  const cycle = { schemaVersion: 1, id: 'cycle', name: 'Cycle', length: 2, days: [{ cycleDay: 1, dayClassId: 'dc-day' }, { cycleDay: 2, dayClassId: 'dc-night' }] };
  const appConfig = { schemaVersion: 1, locale: 'it', timeZone: 'Europe/Rome', nutritionProfileId: 'nutrition', allergyIntoleranceProfileId: 'allergy', foodPreferencesId: 'prefs', themeProfileId: theme.id, mealClassIds: mealClasses.map(item => item.id), dayClassIds: dayClasses.map(item => item.id), cycleId: 'cycle', shoppingPeopleMultiplier: 1, measurementSystem: 'metric', weekStart: 'monday' };
  await repo.put('appConfigs', appConfig); await repo.putMany('nutritionProfiles', [nutrition]); await repo.putMany('allergyIntoleranceProfiles', [allergy]); await repo.putMany('foodPreferences', [prefs]); await repo.putMany('themeProfiles', [theme]); await repo.putMany('mealClasses', mealClasses); await repo.putMany('dayClasses', dayClasses); await repo.putMany('cycles', [cycle]);
  const revisions = [revision('rev_oats', 'ing_oats', 'grains'), revision('rev_chicken', 'ing_chicken', 'meat'), revision('rev_fish', 'ing_fish', 'fish_seafood', ['fish']), revision('rev_night', 'ing_night', 'grains')];
  const recipes = [recipe('oats', 'breakfast', 400, 20, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'porridge' }), recipe('oats2', 'breakfast', 390, 21, { ingredient: 'ing_oats', revisionId: 'rev_oats', family: 'toast' }), recipe('chicken', 'dinner', 700, 60, { ingredient: 'ing_chicken', revisionId: 'rev_chicken', family: 'plate' }), recipe('chicken2', 'dinner', 680, 58, { ingredient: 'ing_chicken', revisionId: 'rev_chicken', family: 'bowl' }), recipe('fish', 'dinner', 700, 55, { ingredient: 'ing_fish', revisionId: 'rev_fish', allergens: ['fish'], family: 'plate' }), recipe('night', 'night_meal', 500, 30, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'bowl' }), recipe('night2', 'night_meal', 480, 28, { ingredient: 'ing_night', revisionId: 'rev_night', family: 'plate' })];
  // R3: make each synthetic frozen revision agree with its declared recipe nutrition.
  for (const rec of recipes) {
    const line = rec.ingredientLines[0]; const original = revisions.find(r => r.ingredientRevisionId === line.ingredientRevisionId);
    const revision = { ...structuredClone(original), ingredientRevisionId: `${original.ingredientRevisionId}_${rec.recipeId}`, basis: { ...original.basis, amount: 100, unit: 'g' }, nutrition: { ...rec.calculatedNutrition } };
    revisions.push(revision); line.ingredientRevisionId = revision.ingredientRevisionId;
  }
  await repo.putMany('ingredientRevisions', revisions); for (const rec of recipes) { await repo.put('recipes', { recipeId: rec.recipeId, currentVersionId: rec.recipeVersionId, origin: 'base', status: 'active' }); await repo.put('recipeVersions', rec); }
  await repo.setMeta('activeCatalogVersion', 'test-1'); await repo.put('catalogPacks', { catalogVersion: 'test-1', packId: 'core', status: 'installed', recipeVersionIds: recipes.map(item => item.recipeVersionId) });
  return { repo, registry };
}
