import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PLANNER_SOFT_OBJECTIVE_POLICY, slotOptionSoftContribution } from '../src/planner/qualityPolicy.js';
import { plannerQualityMetrics } from '../src/planner/qualityMetrics.js';
import { varietyScore } from '../src/planner/softScoring.js';

const root = process.cwd();

function recipe(id, primary = `ingredient-${id}`, family = 'family-a') {
  return {
    recipeId: id,
    recipeVersionId: `${id}-v1`,
    ingredientLines: [{ ingredientId: primary, ingredientRevisionId: `${primary}-v1`, optional: false }],
    tags: { families: [family], cuisines: ['cuisine-x'] }
  };
}

test('Phase F — slot option keeps nutrition as a tie-break while applying preference and variety at full strength', () => {
  const contribution = slotOptionSoftContribution({ components: { nutrition: 20, preference: -2, variety: 12, regeneration: 100 } });
  assert.equal(PLANNER_SOFT_OBJECTIVE_POLICY.slotOption.perRecipeNutritionTieBreakWeight, 0.15);
  assert.deepEqual(contribution.components, { nutritionTieBreak: 3, preference: -2, variety: 12, regeneration: 100 });
  assert.equal(contribution.total, 113);
});

test('Phase F — short-window exact recipe repetition is strongly penalized but remains soft', () => {
  const candidate = recipe('recipe-a');
  const score = varietyScore(candidate, {
    history: [{ date: '2026-09-08', recipe: candidate }],
    date: '2026-09-09',
    revisionById: new Map(),
    foodPreferences: { rules: [] }
  });
  assert.ok(score.score >= PLANNER_SOFT_OBJECTIVE_POLICY.varietyWindows[0].recipe);
  assert.match(score.reasons.join('|'), /variety:/);
});

test('Phase F — quality metrics expose uniqueness and rolling repetition windows', () => {
  const a = recipe('recipe-a', 'ingredient-a', 'family-a');
  const b = recipe('recipe-b', 'ingredient-b', 'family-b');
  const byId = new Map([[a.recipeVersionId, a], [b.recipeVersionId, b]]);
  const day = (date, id, occurrence) => ({
    date,
    mealSlots: [{ mode: 'planned', time: '12:00', mealOccurrenceId: occurrence, recipeComponents: [{ recipeVersionId: id, servings: 1 }] }],
    nutritionSummary: { knownPlanned: { proteinG: 80, fiberG: 30 } }
  });
  const metrics = plannerQualityMetrics([
    day('2026-09-01', a.recipeVersionId, 'm1'),
    day('2026-09-03', a.recipeVersionId, 'm2'),
    day('2026-09-09', b.recipeVersionId, 'm3')
  ], byId);
  assert.equal(metrics.recipeComponentCount, 3);
  assert.equal(metrics.uniqueRecipeCount, 2);
  assert.equal(metrics.uniqueRecipeRate, 0.667);
  assert.equal(metrics.exactRepeatPairsWithin3Days, 1);
  assert.equal(metrics.exactRepeatPairsWithin7Days, 1);
  assert.equal(metrics.averageDailyProteinG, 80);
});

test('Phase F — Planner Lab surfaces quality metrics and raw export contains them', async () => {
  const [page, service, worker] = await Promise.all([
    readFile(path.join(root, 'src/ui/plannerValidationPage.js'), 'utf8'),
    readFile(path.join(root, 'src/services/plannerValidationService.js'), 'utf8'),
    readFile(path.join(root, 'public/service-worker.js'), 'utf8')
  ]);
  assert.match(service, /plannerQualityMetrics/);
  assert.match(page, /uniqueRecipeRate/);
  assert.match(page, /exactRepeatPairsWithin3Days/);
  assert.match(page, /quality: result\.quality/);
  assert.match(worker, /src\/planner\/qualityPolicy\.js/);
  assert.match(worker, /src\/planner\/qualityMetrics\.js/);
});
