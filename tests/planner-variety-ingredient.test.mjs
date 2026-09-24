import test from 'node:test';
import assert from 'node:assert/strict';
import { varietyScore } from '../src/planner/softScoring.js';

function recipe(id, ingredients) {
  return { recipeId: id, recipeVersionId: `v_${id}`, ingredientLines: ingredients.map((ingredientId, index) => ({ ingredientId, ingredientRevisionId: `rev_${ingredientId}`, optional: index > 0 })), tags: { families: [`family_${id}`], cuisines: ['it'] } };
}

test('maximum variety penalizes repeated non-primary ingredients across nearby days', () => {
  const eggBreakfast = recipe('egg-breakfast', ['bread', 'egg']);
  const eggSnack = recipe('egg-snack', ['lettuce', 'egg']);
  const fruitSnack = recipe('fruit-snack', ['lettuce', 'pear']);
  const context = { history: [{ date: '2026-09-24', recipe: eggBreakfast }], date: '2026-09-25', revisionById: new Map(), foodPreferences: { schemaVersion: 2, plannerPolicy: { varietyMode: 'maximum_variety' }, rules: [], legacyRules: [] } };
  const repeated = varietyScore(eggSnack, context).score;
  const distinct = varietyScore(fruitSnack, context).score;
  assert.ok(repeated > distinct, `expected repeated ingredient penalty ${repeated} > ${distinct}`);
});
