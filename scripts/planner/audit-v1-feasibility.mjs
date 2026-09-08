import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { CatalogImporter } from '../../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../../src/services/configurationService.js';
import { createInitialPreview } from '../../src/services/effectivePlanService.js';
import { energyConstraintStatus } from '../../src/planner/planMath.js';
import { MemoryRepository, fileLoader, fileFetch } from '../../tests/helpers.mjs';

const root = process.cwd();
const targets = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600];
const tolerances = [2, 5, 10];
const date = '2026-09-07';
const requireAllFeasible = process.argv.includes('--require-all-feasible');

const repo = new MemoryRepository();
const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
await registry.loadAll();
await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });

const rows = [];
let invalidOutcomes = 0;
for (const tolerancePct of tolerances) {
  for (const targetKcal of targets) {
    const bundle = await loadConfigurationBundle(repo);
    const profile = bundle.nutritionProfiles.find(item => item.id === bundle.appConfig.nutritionProfileId);
    profile.dailyEnergyKcal = targetKcal;
    profile.energyTolerancePct = tolerancePct;
    await saveConfigurationBundle(bundle, { repo, registry });
    const result = await createInitialPreview({
      horizon: { startDate: date, endDate: date },
      seed: `phase-a-feasibility-${targetKcal}-${tolerancePct}`,
      createdAt: '2026-09-07T08:00:00.000Z',
      continuationPolicy: { mode: 'fixed', triggerDaysBeforeEnd: 1, extensionDays: 1 }
    }, { repo, registry });

    if (result.status === 'success') {
      const day = result.calendarDays[0];
      const planned = day.nutritionSummary.knownPlanned.energyKcal;
      const external = day.nutritionSummary.externalBudget?.energyKcal || 0;
      const status = energyConstraintStatus(planned, targetKcal, tolerancePct, external);
      if (!status.withinTolerance) invalidOutcomes += 1;
      rows.push({
        targetKcal, tolerancePct, status: 'feasible',
        plannedEnergyKcal: planned, budgetedTotalKcal: status.budgetedTotalKcal,
        allowedMinKcal: status.dailyMinKcal, allowedMaxKcal: status.dailyMaxKcal,
        deviationKcal: status.deviationKcal, recipeComponents: day.mealSlots.reduce((n, slot) => n + (slot.recipeComponents?.length || 0), 0)
      });
    } else {
      if (result.failure?.code !== 'no_feasible_plan' || result.failure?.constraintId !== 'daily_energy_tolerance') invalidOutcomes += 1;
      rows.push({
        targetKcal, tolerancePct, status: 'not_found',
        failureCode: result.failure?.code || null, reason: result.failure?.reason || null,
        proof: result.failure?.search?.proof || null,
        allowedMinKcal: result.failure?.energy?.dailyMinKcal ?? null,
        allowedMaxKcal: result.failure?.energy?.dailyMaxKcal ?? null,
        nearestPlannedEnergyKcal: result.failure?.nearestPlannedEnergyKcal ?? null,
        nearestDistanceKcal: result.failure?.nearestDistanceKcal ?? null,
        search: result.failure?.search || null
      });
    }
  }
}

const summary = tolerances.map(tolerancePct => {
  const subset = rows.filter(row => row.tolerancePct === tolerancePct);
  const feasible = subset.filter(row => row.status === 'feasible');
  return {
    tolerancePct,
    feasibleTargets: feasible.map(row => row.targetKcal),
    notFoundTargets: subset.filter(row => row.status !== 'feasible').map(row => row.targetKcal),
    feasibleCount: feasible.length,
    totalTargets: subset.length
  };
});
const catalogRecipeCount = await repo.count('recipeVersions');
if (requireAllFeasible && rows.some(row => row.status !== 'feasible')) invalidOutcomes += rows.filter(row => row.status !== 'feasible').length;
const report = {
  schemaVersion: 1,
  audit: 'v1-planner-feasibility-baseline',
  generatedAt: new Date().toISOString(),
  targetRangeKcal: [Math.min(...targets), Math.max(...targets)],
  targets, tolerances, dayClass: 'bootstrap-active', catalogRecipeCount, requireAllFeasible,
  interpretation: `not_found means no hard-valid plan was found within the bounded search over the current ${catalogRecipeCount}-recipe corpus; it is not a mathematical proof of global infeasibility`,
  invalidOutcomes,
  summary,
  rows
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-planner-feasibility-baseline.json'), JSON.stringify(report, null, 2) + '\n');

for (const item of summary) console.log(`Tolerance +/-${item.tolerancePct}%: feasible ${item.feasibleTargets.join(', ') || 'none'} kcal; not found ${item.notFoundTargets.join(', ') || 'none'} kcal`);
if (invalidOutcomes) {
  console.error(`Planner feasibility audit FAILED: ${invalidOutcomes} invalid outcome(s)`);
  process.exitCode = 1;
} else {
  console.log(`Planner feasibility audit PASS: ${rows.length} cases classified over ${catalogRecipeCount} recipes${requireAllFeasible ? '; all targets feasible as required' : ''}.`);
}
