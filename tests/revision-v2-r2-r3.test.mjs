import test from 'node:test';
import assert from 'node:assert/strict';
import { countFrequencyWindow, evaluateFrequencies, frequencyHistoryDays, frequencyConflicts, FREQUENCY_PRIORITY } from '../src/domain/frequencyCounter.js';
import { blankFrequencyRule, preferenceEditingDraft, convertLegacyPreference } from '../src/domain/legacyRuleAdapter.js';
import { ingredientPresentation, foodSearchRank } from '../src/domain/ingredientPresentation.js';
import { recipeTextV2, recipeTitleFromIngredients, ingredientWeightG } from '../src/domain/recipePresentation.js';
import { generatePlanCore } from '../src/planner/planGenerator.js';
import { executePlanGeneration } from '../src/services/plannerExecution.js';
import { plannerFixture } from './revision-v2-fixture.mjs';
import { loadConfigurationBundle, activeRecords } from '../src/services/configurationService.js';
import { addCivilDays } from '../src/planner/planMath.js';
import { assessRecipeSafety } from '../src/domain/safetyPolicy.js';
import { syntheticSafetyEvidence } from './helpers.mjs';
const rule = (patch = {}) => ({ ...blankFrequencyRule('f', '2026-09-01'), window: { kind: 'rolling', days: 7 }, target: { type: 'ingredient', id: 'millet' }, minOccurrences: 1, targetOccurrences: 2.5, maxOccurrences: 3, ...patch });
const revision = { ingredientRevisionId: 'r', ingredientId: 'millet', productTaxonomy: { categoryId: 'grains', subcategoryId: 'whole', conceptId: 'millet' }, safetyEvidence: syntheticSafetyEvidence([]) };
const recipe = { recipeId: 'dish', recipeVersionId: 'v', ingredientLines: [{ ingredientId: 'millet', ingredientRevisionId: 'r' }] };
function context(dates, slots = {}) { return { calendarDays: dates.map(date => ({ date, calendarDayId: date, mealSlots: slots[date] || [] })), recipesByVersion: new Map([['v', recipe]]), revisionById: new Map([['r', revision]]) }; }
function meal(id, civilDate, extra = {}) { return { mealOccurrenceId: id, civilDate, mealClassId: 'lunch', mode: 'planned', recipeComponents: [{ recipeId: 'dish', recipeVersionId: 'v', servings: 1 }], ...extra }; }
const week = Array.from({ length: 7 }, (_, n) => addCivilDays('2026-09-01', n));
test('T26/T28/T29 R3 one occurrence per meal, inclusive rolling boundaries and independent day count', () => {
  const c = context(week, { '2026-09-01': [meal('a', '2026-09-01', { recipeComponents: Array(3).fill({ recipeId: 'dish', recipeVersionId: 'v', servings: 1 }) }), meal('b', '2026-09-01')], '2026-09-07': [meal('c', '2026-09-07')] });
  assert.equal(countFrequencyWindow(rule(), week.at(-1), c).count, 3);
  assert.equal(countFrequencyWindow(rule({ countUnit: 'day' }), week.at(-1), c).count, 2);
  assert.equal(countFrequencyWindow(rule(), '2026-09-08', c).count, 1);
});
test('T32/T33/T34 R3 carryover uses civil date; unknown external is separate; incomplete minimum stays pending', () => {
  const c = context(['2026-09-01'], { '2026-09-01': [meal('carry', '2026-09-02'), meal('ext', '2026-09-01', { mode: 'external', recipeComponents: [] })] });
  const x = countFrequencyWindow(rule(), '2026-09-01', c); assert.equal(x.count, 0); assert.equal(x.unknownExternalMeals, 1); assert.equal(x.state, 'pending'); assert.equal(x.firstEvaluableDate, '2026-09-07');
  assert.equal(countFrequencyWindow(rule(), '2026-09-02', c).count, 1);
});
test('T25/T27/T37 R3 maxima and never apply to prefixes; half ideals never create half meals', () => {
  const c = context(['2026-09-01'], { '2026-09-01': [meal('a', '2026-09-01')] });
  assert.equal(countFrequencyWindow(rule({ maxOccurrences: 0 }), '2026-09-01', c).state, 'violated');
  assert.equal(countFrequencyWindow(rule({ mode: 'never' }), '2026-09-01', c).state, 'violated');
  assert.deepEqual(FREQUENCY_PRIORITY, { low: 1, normal: 2, high: 4 }); assert.equal(frequencyHistoryDays({ schemaVersion: 2, rules: [rule({ window: { kind: 'rolling', days: 90 } })] }), 91);
});
test('T31 R3 edit revalidates future windows and remaining capacity', () => {
  const c = context(week); const profile = { schemaVersion: 2, rules: [rule()] };
  const result = evaluateFrequencies({ ...c, profile, changedCivilDates: ['2026-09-01'] }); assert.equal(result.violations.length, 1); assert.equal(result.violations[0].interval.endDate, '2026-09-07');
  const x = countFrequencyWindow(rule(), '2026-09-07', { ...c, potentialOccurrences: [meal('future', '2026-09-07')] }); assert.equal(x.minViolation, false); assert.equal(x.remainingReachable, 1);
});
test('T35/T36 R3 parent exclusion conflict respects scope', () => {
  const child = rule(); const never = rule({ id: 'never', mode: 'never', target: { type: 'foodGroup', id: 'g' } }); const groups = [{ id: 'g', status: 'active', members: [{ type: 'ingredient', id: 'millet' }] }];
  assert.equal(frequencyConflicts({ schemaVersion: 2, rules: [child, never] }, { foodGroups: groups }).length, 1);
  never.scope = { mealClassIds: ['breakfast'] }; child.scope = { mealClassIds: ['dinner'] }; assert.equal(frequencyConflicts({ schemaVersion: 2, rules: [child, never] }, { foodGroups: groups }).length, 0);
});
test('T39 R3 conversion is explicit and removes the exact legacy penalty', () => {
  const legacy = { schemaVersion: 1, id: 'p', rules: [{ id: 'f', targetType: 'ingredient', targetId: 'millet', level: 'rarely', autoExclude: false, frequency: { windowDays: 7, maxOccurrences: 2 } }] }; const saved = structuredClone(legacy); const draft = preferenceEditingDraft(legacy);
  assert.equal(draft.rules.length, 0); assert.deepEqual(legacy, saved); convertLegacyPreference(draft, 'f', rule()); assert.equal(draft.legacyRules.length, 0); assert.equal(draft.rules[0].targetOccurrences, 2.5);
});
test('T03/T05/T06 R3 dynamic group excludes forms, and incomplete evidence fails closed', () => {
  const profile = { schemaVersion: 2, rules: [{ id: 's', kind: 'allergy', target: { type: 'foodGroup', id: 'g' }, enabled: true, effectiveFrom: '2026-09-01' }] }; const foodGroups = [{ id: 'g', status: 'active', members: [{ type: 'productFood', id: 'grains' }] }];
  assert.equal(assessRecipeSafety(recipe, { allergyProfile: profile, revisionById: new Map([['r', revision]]), foodGroups }).status, 'incompatible'); foodGroups[0].members = [{ type: 'ingredient', id: 'other' }];
  assert.equal(assessRecipeSafety(recipe, { allergyProfile: profile, revisionById: new Map([['r', revision]]), foodGroups }).status, 'compatible');
  assert.equal(assessRecipeSafety(recipe, { allergyProfile: profile, revisionById: new Map(), foodGroups }).status, 'unknown');
});
test('T13/T15/T50/T52 R2 explicit form presentation, short truthful titles and no operational steps', () => {
  const i = { ...revision, basis: { state: 'dry' }, i18n: { it: { name: 'Miglio, come venduto' }, en: { name: 'Millet' } } }; const index = { term: id => id === 'millet' ? { i18n: { it: { label: 'Miglio' }, en: { label: 'Millet' } } } : null };
  assert.equal(ingredientPresentation(i, index).name, 'Miglio'); assert.equal(ingredientPresentation(i, index).weighing, 'peso a secco');
  const title = recipeTitleFromIngredients([i], index); assert.equal(title, 'Piatto con Miglio'); assert.deepEqual(recipeTextV2({ it: { title, instructions: ['obsolete'] } }).en, { title, description: '' });
  assert.equal(ingredientWeightG([{ normalizedUnit: 'g', normalizedAmount: 100 }, { normalizedUnit: 'ml', normalizedAmount: 10 }]), null);
  assert.equal(foodSearchRank('miglio', { names: ['Miglio'] }), 0); assert.equal(foodSearchRank('millet', { names: ['Miglio'], aliases: ['Millet'] }), 1);
});
async function solverInput(days = 2) {
  const { repo } = await plannerFixture(); const a = activeRecords(await loadConfigurationBundle(repo)); const recipes = await repo.getAll('recipeVersions'); const revisions = await repo.getAll('ingredientRevisions');
  const alt = recipes.find(r => r.recipeVersionId === 'rv_chicken2'); alt.ingredientLines[0].ingredientId = 'ing_other'; revisions.find(r => r.ingredientRevisionId === alt.ingredientLines[0].ingredientRevisionId).ingredientId = 'ing_other';
  return { nutritionProfile: a.nutritionProfile, allergyProfile: a.allergyProfile, foodPreferences: { schemaVersion: 2, id: 'prefs', rules: [rule({ effectiveFrom: '2026-09-01', window: { kind: 'rolling', days: 2 }, target: { type: 'ingredient', id: 'ing_chicken' }, minOccurrences: 1, targetOccurrences: 1, maxOccurrences: 1, scope: { mealClassIds: ['mc-dinner'] } })] }, mealClasses: a.mealClasses, dayClasses: a.dayClasses, cycle: { ...a.cycle, length: 1, days: [a.cycle.days[0]] }, recipes, ingredientRevisions: revisions, horizon: { startDate: '2026-09-01', endDate: addCivilDays('2026-09-01', days - 1) }, seed: 'frequency-fixture', catalogVersion: 'test', configSnapshotHash: 'test', createdAt: '2026-09-01T00:00:00.000Z', searchBudget: { maxMillis: 20000 } };
}
test('T24/T27/T31 R3 solver enforces min/max across days and keeps fixed servings', async () => {
  const input = await solverInput(7); const result = generatePlanCore(input); assert.equal(result.status, 'success', JSON.stringify(result.failure)); assert.equal(result.calendarDays.length, 7); assert.equal(result.diagnostics.frequencies.valid, true);
  const complete = result.diagnostics.frequencies.windows.filter(w => w.complete); assert.equal(complete.length, 6); assert.ok(complete.every(w => w.count === 1)); assert.ok(result.calendarDays.flatMap(d => d.mealSlots.flatMap(s => s.recipeComponents)).every(c => c.servings === 1));
});
test('T38 R3 bounded exhaustion is distinct from proof and cancellation', async () => {
  const input = await solverInput(); assert.equal(generatePlanCore({ ...input, searchBudget: { maxExpandedPlans: 0 } }).status, 'search_exhausted');
  const impossible = structuredClone(input); impossible.foodPreferences.rules[0].minOccurrences = 10; impossible.foodPreferences.rules[0].targetOccurrences = 10; impossible.foodPreferences.rules[0].maxOccurrences = 10; assert.equal(generatePlanCore(impossible).status, 'infeasible_proven');
  const controller = new AbortController(); controller.abort(); assert.equal((await executePlanGeneration(input, { signal: controller.signal })).status, 'cancelled');
});
test('T30/T38 R3 31/90 day horizons preserve complete rolling windows without fractional servings', async () => {
  for (const length of [31, 90]) { const input = await solverInput(length); const result = generatePlanCore(input); assert.equal(result.status, 'success', JSON.stringify(result.failure)); assert.equal(result.calendarDays.length, length); assert.ok(result.diagnostics.frequencies.windows.filter(w => w.complete).every(w => w.count === 1)); }
});
test('T07/T08 R3 current safety overlay annotates stored history without mutating frozen records', async () => {
  const { createInitialPreview, commitGeneratedPreview, loadEffectivePlanState } = await import('../src/services/effectivePlanService.js');
  const { repo, registry } = await plannerFixture(); const preview = await createInitialPreview({ horizon: { startDate: '2026-09-07', endDate: '2026-09-07' }, seed: 'overlay' }, { repo, registry }); await commitGeneratedPreview(preview, { repo, registry });
  const before = await repo.getAll('calendarDays'); const versions = await repo.getAll('recipeVersions');
  await repo.put('allergyIntoleranceProfiles', { schemaVersion: 2, id: 'allergy', rules: [{ id: 'new', kind: 'allergy', target: { type: 'ingredient', id: 'ing_chicken' }, enabled: true, notes: '', effectiveFrom: '2026-09-01' }] });
  const view = await loadEffectivePlanState('2026-09-07', { repo }); assert.ok(view.civilMeals.some(m => m.safetyOverlay.status === 'incompatible')); assert.deepEqual(await repo.getAll('calendarDays'), before); assert.deepEqual(await repo.getAll('recipeVersions'), versions);
});
test('T17 R2 title editing keeps exact nutrient arithmetic and rejects stale/invalid form input', async () => {
  const { calculateRecipeNutrition } = await import('../src/domain/nutritionCore.js');
  const r = { ...revision, basis: { amount: 100, unit: 'g' }, nutrition: { energyKcal: 370, proteinG: 10, carbsG: 70, fatG: 3, fiberG: 5 } }; const lines = [{ ingredientId: 'millet', ingredientRevisionId: 'r', normalizedUnit: 'g', normalizedAmount: 50 }];
  assert.deepEqual(calculateRecipeNutrition(lines, new Map([['r', r]])), { energyKcal: 185, proteinG: 5, carbsG: 35, fatG: 1.5, fiberG: 2.5 }); assert.throws(() => calculateRecipeNutrition([{ ...lines[0], ingredientId: 'different' }], new Map([['r', r]])), /mismatch/);
});
test('T17/T50/T73 R2 Italian-only authoring, variant nutrition, duplicate, ordinary export and import', async () => {
  const { seedReferenceData, MemoryRepository } = await import('./helpers.mjs'); const { saveIngredient, saveRecipe, duplicateRecipeToDraft } = await import('../src/services/personalCatalogService.js'); const { createCustomCatalogExport, importCustomCatalogExport } = await import('../src/services/customCatalogTransfer.js');
  const { repo, registry } = await plannerFixture(); await seedReferenceData(repo, process.cwd());
  const base = { nameIt: 'Miglio prova', productFoodId: 'product_concept_millet', basisUnit: 'g', state: 'cooked', energyKcal: 100, proteinG: 5, carbsG: 15, fatG: 2, fiberG: 1, foodGroup: 'food_group_grains', foodSubgroup: null, flavorProfile: 'flavor_neutral', mealArchetypes: ['lunch'], allergenIds: [] };
  const a = await saveIngredient(base, { repo, registry }); const b = await saveIngredient({ ...base, nameIt: 'Miglio altra forma', state: 'as_sold', energyKcal: 200 }, { repo, registry });
  const input = ingredient => ({ titleIt: 'Miglio semplice', mealArchetypes: ['lunch'], ingredientLines: [{ ingredientId: ingredient.family.ingredientId, ingredientRevisionId: ingredient.revision.ingredientRevisionId, amount: 50, unit: 'g' }], prepMinutes: 0, cookMinutes: 0 });
  const ra = await saveRecipe(input(a), { repo, registry }); const rb = await saveRecipe(input(b), { repo, registry }); assert.equal(ra.version.calculatedNutrition.energyKcal, 50); assert.equal(rb.version.calculatedNutrition.energyKcal, 100); assert.equal(ra.version.i18n.en.title, ra.version.i18n.it.title);
  const draft = await duplicateRecipeToDraft(ra.family.recipeId, { repo }); assert.equal('instructionsIt' in draft, false); const copy = await saveRecipe(draft, { repo, registry }); assert.equal(copy.version.calculatedNutrition.energyKcal, 50);
  const exported = await createCustomCatalogExport({ repo }); assert.equal(exported.formatVersion, 2); assert.equal(JSON.stringify(exported).includes('instructions'), false);
  const target = new MemoryRepository(); await seedReferenceData(target, process.cwd()); await importCustomCatalogExport(exported, { repo: target, registry }); assert.deepEqual(await target.get('recipeVersions', copy.version.recipeVersionId), copy.version);
});
test('T21 R3 retrieval filters current and hard-eligible recipes before the 500 limit', async () => {
  const { PlanCandidateService } = await import('../src/services/planCandidateService.js'); const { repo } = await plannerFixture();
  const r = (await repo.getAll('recipeVersions')).find(r => r.recipeVersionId === 'rv_chicken');
  for (let i = 0; i < 510; i++) { const next = { ...structuredClone(r), recipeId: `bulk${i}`, recipeVersionId: `bulk${i}`, origin: 'user', practical: { ...r.practical, portable: false } }; await repo.put('recipes', { recipeId: next.recipeId, currentVersionId: next.recipeVersionId, origin: 'user', status: 'active' }); await repo.put('recipeVersions', next); }
  const active = activeRecords(await loadConfigurationBundle(repo)); const dayClass = { ...active.dayClasses[0], capabilities: { ...active.dayClasses[0].capabilities, portabilityRequired: true } }; const mealClass = active.mealClasses.find(m => m.id === 'mc-dinner');
  const service = new PlanCandidateService({ repo }); const selected = await service.retrieve('dinner', { eligibilityContexts: [{ dayClass, mealClass, allergyProfile: active.allergyProfile, date: '2026-09-07' }] }); assert.ok(selected.some(r => r.recipeVersionId === 'rv_chicken')); assert.ok(selected.every(r => r.practical.portable)); assert.equal(service.lastDiagnostics.hardRejectionCounts['capability:portable'], 510); assert.equal(service.lastDiagnostics.truncated, false);
});
