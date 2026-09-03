import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader } from './helpers.mjs';
import {
  calculateShoppingList, createShoppingChecklist, shoppingChecklistStaleness, updateShoppingChecklistItem,
  addManualShoppingItem, refreshShoppingChecklist, removeShoppingChecklistItem, buildPreparationHorizon
} from '../src/services/shoppingService.js';

const root = process.cwd();

function recipe(id, ingredientLines, practical = {}) {
  return {
    recipeVersionId: id, recipeId: `family_${id}`,
    ingredientLines,
    practical: { prepMinutes: 10, cookMinutes: 20, mealPrepSuitable: true, fridgeRequired: true, freezerSuitable: false, reheatingRequired: false, coldSuitable: true, ...practical },
    i18n: { it: { title: `IT ${id}`, instructions: ['step'] }, en: { title: `EN ${id}`, instructions: ['step'] } }
  };
}
function revision(id, ingredientId, name, state = 'raw') {
  return { ingredientRevisionId: id, ingredientId, basis: { state }, i18n: { it: { name }, en: { name: `${name} EN` } } };
}
async function fixture() {
  const repo = new MemoryRepository(); const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  await repo.put('appConfigs', { shoppingPeopleMultiplier: 2 });
  const plan1 = { planInstanceId: 'plan_1', previousPlanInstanceId: null, updatedAt: '2026-09-03T10:00:00Z' };
  const plan2 = { planInstanceId: 'plan_2', previousPlanInstanceId: 'plan_1', updatedAt: '2026-09-03T11:00:00Z' };
  await repo.putMany('planInstances', [plan1, plan2]); await repo.setMeta('activePlanInstanceId', 'plan_2'); await repo.setMeta('planUpdatedAt', plan2.updatedAt);
  await repo.putMany('ingredientRevisions', [
    revision('rev_rice_raw', 'ing_rice', 'Riso', 'raw'), revision('rev_rice_cooked', 'ing_rice', 'Riso cotto', 'cooked'), revision('rev_oil', 'ing_oil', 'Olio', 'as_sold')
  ]);
  await repo.put('recipeVersions', recipe('rv_old', [
    { ingredientId: 'ing_rice', ingredientRevisionId: 'rev_rice_raw', normalizedAmount: 100, normalizedUnit: 'g', optional: false },
    { ingredientId: 'ing_oil', ingredientRevisionId: 'rev_oil', normalizedAmount: 10, normalizedUnit: 'g', optional: false }
  ]));
  await repo.put('recipeVersions', recipe('rv_new', [
    { ingredientId: 'ing_rice', ingredientRevisionId: 'rev_rice_cooked', normalizedAmount: 150, normalizedUnit: 'g', optional: false }
  ], { prepMinutes: 5, cookMinutes: 5, mealPrepSuitable: false }));
  await repo.putMany('calendarDays', [
    { calendarDayId: 'day_1', planInstanceId: 'plan_1', date: '2026-09-07', mealSlots: [
      { mealOccurrenceId: 'occ_old', civilDate: '2026-09-08', time: '02:00', dayOffset: 1, mode: 'planned', mealClassId: 'mc_night', recipeComponents: [{ recipeVersionId: 'rv_old', servings: 1 }] }
    ] },
    { calendarDayId: 'day_2', planInstanceId: 'plan_2', date: '2026-09-08', mealSlots: [
      { mealOccurrenceId: 'occ_external', civilDate: '2026-09-08', time: '13:00', dayOffset: 0, mode: 'external', mealClassId: 'mc_lunch', recipeComponents: [] },
      { mealOccurrenceId: 'occ_new', civilDate: '2026-09-08', time: '20:00', dayOffset: 0, mode: 'planned', mealClassId: 'mc_dinner', recipeComponents: [{ recipeVersionId: 'rv_new', servings: 1 }] }
    ] }
  ]);
  return { repo, registry };
}

test('shopping uses civil consumption date, includes carry-over, excludes external slots, and resolves historical versions', async () => {
  const { repo } = await fixture();
  const result = await calculateShoppingList({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo });
  assert.equal(result.occurrenceCount, 2);
  assert.equal(result.items.length, 3);
  assert.equal(result.items.find(item => item.itemId.includes(':raw')).quantity, 100);
  assert.equal(result.items.find(item => item.itemId.includes(':cooked')).quantity, 150);
  assert.ok(result.items.every(item => !item.sourceMealOccurrenceIds.includes('occ_external')));
});

test('shopping multiplier scales quantities linearly without mutating the plan', async () => {
  const { repo } = await fixture(); const before = await repo.get('calendarDays', 'day_2');
  const one = await calculateShoppingList({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo });
  const two = await calculateShoppingList({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 2.5 }, { repo });
  const byId = new Map(two.items.map(item => [item.itemId, item]));
  for (const item of one.items) assert.equal(byId.get(item.itemId).quantity, item.quantity * 2.5);
  assert.deepEqual(await repo.get('calendarDays', 'day_2'), before);
});

test('aggregation keeps incompatible ingredient states separate even for the same ingredient family', async () => {
  const { repo } = await fixture();
  const result = await calculateShoppingList({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo });
  const rice = result.items.filter(item => item.ingredientId === 'ing_rice');
  assert.equal(rice.length, 2); assert.deepEqual(rice.map(item => item.quantity).sort((a, b) => a - b), [100, 150]);
});

test('persistent checklist tracks staleness and preserves derived user state plus manual items across refresh', async () => {
  const { repo, registry } = await fixture();
  let checklist = await createShoppingChecklist({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo, registry, checklistId: 'shop_1', createdAt: '2026-09-03T12:00:00Z' });
  const derived = checklist.items[0];
  checklist = await updateShoppingChecklistItem('shop_1', derived.itemId, { checked: true, notes: 'gia in dispensa' }, { repo, registry, updatedAt: '2026-09-03T12:01:00Z' });
  checklist = await addManualShoppingItem('shop_1', { label: 'Sacchetti freezer', quantity: 1, unit: 'box', notes: 'piccoli', itemId: 'manual_bags' }, { repo, registry, updatedAt: '2026-09-03T12:02:00Z' });
  await repo.setMeta('planUpdatedAt', '2026-09-03T13:00:00Z');
  assert.equal((await shoppingChecklistStaleness(checklist, { repo })).stale, true);
  const recipe = await repo.get('recipeVersions', 'rv_new'); recipe.ingredientLines[0].normalizedAmount = 200; await repo.put('recipeVersions', recipe);
  const refreshed = await refreshShoppingChecklist('shop_1', { repo, registry, updatedAt: '2026-09-03T13:01:00Z' });
  const kept = refreshed.items.find(item => item.itemId === derived.itemId); assert.equal(kept.checked, true); assert.equal(kept.notes, 'gia in dispensa');
  assert.ok(refreshed.items.some(item => item.itemId === 'manual_bags' && item.kind === 'manual'));
  assert.equal((await shoppingChecklistStaleness(refreshed, { repo })).stale, false);
});

test('derived quantities are read-only while manual items can be removed', async () => {
  const { repo, registry } = await fixture(); const checklist = await createShoppingChecklist({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', peopleMultiplier: 1 }, { repo, registry, checklistId: 'shop_2' });
  await assert.rejects(() => updateShoppingChecklistItem('shop_2', checklist.items[0].itemId, { quantity: 999 }, { repo, registry }), /read-only/);
  await addManualShoppingItem('shop_2', { label: 'Carta cucina', itemId: 'manual_paper' }, { repo, registry });
  const next = await removeShoppingChecklistItem('shop_2', 'manual_paper', { repo, registry }); assert.ok(!next.items.some(item => item.itemId === 'manual_paper'));
  await assert.rejects(() => removeShoppingChecklistItem('shop_2', checklist.items[0].itemId, { repo, registry }), /Derived/);
});

test('preparation horizon follows civil dates, excludes external meals, and exposes frozen recipe practical metadata', async () => {
  const { repo } = await fixture(); const prep = await buildPreparationHorizon({ startCivilDate: '2026-09-08', endCivilDate: '2026-09-08', locale: 'it' }, { repo });
  assert.equal(prep.entries.length, 2); assert.deepEqual(prep.entries.map(item => item.time), ['02:00', '20:00']);
  assert.equal(prep.summary.prepMinutes, 15); assert.equal(prep.summary.cookMinutes, 25); assert.equal(prep.summary.mealPrepSuitableCount, 1);
  assert.ok(prep.entries.some(item => item.recipeVersionId === 'rv_old' && item.title === 'IT rv_old'));
});
