import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { generatePlanCore } from '../../src/planner/planGenerator.js';
import { addCivilDays } from '../../src/planner/planMath.js';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const configPath = arg('config');
if (!configPath) throw new Error('Usage: node scripts/planner/benchmark-r9.mjs --config=/path/config.json [--days=7] [--runs=3] [--start=YYYY-MM-DD]');
const days = Math.max(1, Number(arg('days', 7)) || 7);
const runs = Math.max(1, Number(arg('runs', 3)) || 3);
const document = JSON.parse(await readFile(configPath, 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../../public/data/catalog.json', import.meta.url), 'utf8'));
const configuration = document.payload?.configuration || document.payload;
const app = configuration.appConfig;
const nutritionProfile = configuration.nutritionProfiles.find(item => item.id === app.nutritionProfileId);
const allergyProfile = configuration.allergyIntoleranceProfiles.find(item => item.id === app.allergyIntoleranceProfileId);
const foodPreferences = configuration.foodPreferences.find(item => item.id === app.foodPreferencesId);
const mealClasses = configuration.mealClasses.filter(item => app.mealClassIds.includes(item.id));
const dayClasses = configuration.dayClasses.filter(item => app.dayClassIds.includes(item.id));
const cycle = configuration.cycles.find(item => item.id === app.cycleId);
const foodGroups = document.payload?.foodGroups || catalog.foodGroups || [];
const startDate = arg('start', document.createdAt?.slice(0, 10) || '2026-09-29');
const endDate = addCivilDays(startDate, days - 1);
const archetypes = [...new Set(mealClasses.map(item => item.mealArchetype))];
const candidateSets = Object.fromEntries(archetypes.map(archetype => [archetype, catalog.recipeVersions
  .filter(recipe => recipe.mealArchetypes?.includes(archetype) && ['validated', 'curated'].includes(recipe.quality?.status))
  .sort((a, b) => a.recipeVersionId.localeCompare(b.recipeVersionId)).slice(0, 500)]));
const recipes = [...new Map(Object.values(candidateSets).flat().map(recipe => [recipe.recipeVersionId, recipe])).values()];
const revisionIds = new Set(recipes.flatMap(recipe => recipe.ingredientLines.map(line => line.ingredientRevisionId)));
const ingredientRevisions = catalog.ingredientRevisions.filter(row => revisionIds.has(row.ingredientRevisionId));
const common = {
  nutritionProfile, allergyProfile, foodPreferences, mealClasses, dayClasses, cycle,
  recipes, candidateSets, ingredientRevisions, ingredients: catalog.ingredients, taxonomyTerms: catalog.taxonomyTerms, foodGroups,
  horizon: { startDate, endDate }, startCycleDay: 1, seed: 'r9-benchmark', catalogVersion: catalog.manifest.catalogVersion,
  configSnapshotHash: 'r9-benchmark', configSnapshot: {}, createdAt: `${startDate}T08:00:00.000Z`, previousCalendarDays: [],
  candidateLimit: 18, beamWidth: 24, slotOptionLimit: 18, planBeamWidth: 6, alternativesPerDay: 6,
  retrievalTruncated: Object.values(candidateSets).some(items => items.length === 500)
};

const results = [];
for (let index = 0; index < runs; index += 1) {
  const started = performance.now();
  const result = generatePlanCore(common);
  const elapsedMs = performance.now() - started;
  results.push({ run: index + 1, elapsedMs: Math.round(elapsedMs * 100) / 100, status: result.status, failureCode: result.failure?.code || null,
    generatedDayCount: result.calendarDays?.length || result.failure?.generatedDayCount || result.diagnostics?.generatedDayCount || 0,
    telemetry: result.diagnostics?.search?.telemetry || result.diagnostics?.telemetry || null });
}
const times = results.map(item => item.elapsedMs).sort((a, b) => a - b);
console.log(JSON.stringify({ benchmark: 'planner-r9', horizon: { startDate, endDate, days }, recipes: recipes.length,
  candidateCounts: Object.fromEntries(Object.entries(candidateSets).map(([key, value]) => [key, value.length])), runs: results,
  summary: { minMs: times[0], medianMs: times[Math.floor(times.length / 2)], maxMs: times.at(-1) } }, null, 2));
