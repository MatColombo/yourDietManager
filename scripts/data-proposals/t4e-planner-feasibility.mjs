import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { CatalogImporter } from '../../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../../src/services/configurationService.js';
import { createInitialPreview } from '../../src/services/effectivePlanService.js';
import { energyConstraintStatus } from '../../src/planner/planMath.js';
import { MemoryRepository, fileFetch, fileLoader } from '../../tests/helpers.mjs';

const ROOT = process.cwd();
const STAGING = path.join(ROOT, 'corpus/staging/data-proposals/corpus-simulation-round1');
const INGREDIENT_STAGING = path.join(ROOT, 'corpus/staging/data-proposals/ingredient-semantic-consolidation-round1');
const PROPOSAL_FILE = path.join(ROOT, 'data-proposals/active/corpus-simulation-round1/corpus-simulation-proposal.json');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

const [proposal, finalRecipes, finalFamilies, semanticIngredients, taxonomyTerms, preflight] = await Promise.all([
  readJson(PROPOSAL_FILE),
  readJson(path.join(STAGING, 'simulated-recipe-versions.json')),
  readJson(path.join(STAGING, 'simulated-recipe-families.json')),
  readJson(path.join(STAGING, 'simulated-ingredient-revisions.json')),
  readJson(path.join(INGREDIENT_STAGING, 'taxonomy-terms.json')),
  readJson(path.join(STAGING, 'promotion-preflight.json'))
]);

const repo = new MemoryRepository();
const registry = new SchemaRegistry(fileLoader(path.join(ROOT, 'schemas'))); await registry.loadAll();
await new CatalogImporter({ repo, registry, fetcher: fileFetch(ROOT), storage: null, serviceWorker: null }).bootstrap();
await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(ROOT), timeZoneResolver: () => 'Europe/Rome' });

await repo.clear('ingredientRevisions'); await repo.putMany('ingredientRevisions', semanticIngredients);
await repo.clear('taxonomyTerms'); await repo.putMany('taxonomyTerms', taxonomyTerms);
await repo.clear('recipeVersions'); await repo.putMany('recipeVersions', finalRecipes);
await repo.clear('recipes'); await repo.putMany('recipes', finalFamilies);
const activeCatalog = await repo.getMeta('activeCatalogVersion');
for (const pack of await repo.getAll('catalogPacks')) {
  if (pack.catalogVersion === activeCatalog && pack.packId === 'core') {
    pack.recipeVersionIds = finalRecipes.map(row => row.recipeVersionId);
    pack.status = 'installed';
    await repo.put('catalogPacks', pack);
  }
}

const tolerancePct = Number(proposal.expected.tightestPlannerTolerancePct);
const targets = proposal.expected.plannerEnergyTargetsKcal || [];
const rows = [];
const date = '2026-09-07';
for (const targetEnergyKcal of targets) {
  const bundle = await loadConfigurationBundle(repo);
  const profile = bundle.nutritionProfiles.find(row => row.id === bundle.appConfig.nutritionProfileId);
  profile.dailyEnergyKcal = targetEnergyKcal;
  profile.energyTolerancePct = tolerancePct;
  await saveConfigurationBundle(bundle, { repo, registry });
  const result = await createInitialPreview({
    horizon: { startDate: date, endDate: date },
    seed: `t4e-feasibility-${targetEnergyKcal}-${tolerancePct}`,
    createdAt: '2026-09-16T08:00:00.000Z',
    continuationPolicy: { mode: 'fixed', triggerDaysBeforeEnd: 1, extensionDays: 1 }
  }, { repo, registry });
  if (result.status !== 'success') {
    rows.push({ targetEnergyKcal, tolerancePct, status: 'failed', failure: result.failure || null });
    continue;
  }
  const day = result.calendarDays[0];
  const plannedEnergyKcal = Number(day.nutritionSummary.knownPlanned.energyKcal || 0);
  const externalEnergyKcal = Number(day.nutritionSummary.externalBudget?.energyKcal || 0);
  const status = energyConstraintStatus(plannedEnergyKcal, targetEnergyKcal, tolerancePct, externalEnergyKcal);
  rows.push({ targetEnergyKcal, tolerancePct, status: status.withinTolerance ? 'feasible' : 'outside_tolerance', plannedEnergyKcal, externalEnergyKcal, deviationKcal: Math.round((plannedEnergyKcal + externalEnergyKcal - targetEnergyKcal) * 10) / 10 });
  console.log(`T4-E planner ${targetEnergyKcal} kcal @ ${tolerancePct}%: ${rows.at(-1).status} (${plannedEnergyKcal} kcal planned)`);
}
const failed = rows.filter(row => row.status !== 'feasible');
const tightestCases = rows.length;
const impliedTolerances = [2, 5, 10].filter(value => value >= tolerancePct);
const report = {
  schemaVersion: 1,
  proposalId: proposal.proposalId,
  checkedAt: '2026-09-16T08:00:00.000Z',
  method: 'tightest_tolerance_monotonicity',
  tightestTolerancePct: tolerancePct,
  targets,
  tightestCases,
  tightestCasesPassed: tightestCases - failed.length,
  impliedTolerancesPct: impliedTolerances,
  impliedCases: tightestCases * impliedTolerances.length,
  impliedCasesPassed: failed.length ? null : tightestCases * impliedTolerances.length,
  monotonicityRationale: 'A plan inside the +/-2% hard energy interval is necessarily inside the wider +/-5% and +/-10% intervals for the same target.',
  rows,
  pass: failed.length === 0
};
await writeJson(path.join(STAGING, 'planner-feasibility.json'), report);
await writeJson(path.join(STAGING, 'promotion-gate.json'), {
  schemaVersion: 1,
  proposalId: proposal.proposalId,
  technicalCorpusPass: preflight.technicalPass === true,
  plannerFeasibilityPass: report.pass,
  semanticEditorialPass: preflight.semanticPass === true,
  promotionEligible: preflight.technicalPass === true && report.pass && preflight.semanticPass === true,
  blockers: preflight.blockers || [],
  warnings: preflight.warnings || [],
  additionalReplacementNeed: preflight.additionalReplacementNeed || 0
});
if (failed.length) throw new Error(`T4-E planner feasibility failed ${failed.length}/${rows.length} tightest-tolerance cases`);
console.log(`T4-E planner feasibility PASS: ${tightestCases}/${tightestCases} at ${tolerancePct}% => ${report.impliedCases}/${report.impliedCases} implied cases across ${impliedTolerances.join('/')}%`);
console.log(`T4-E promotion remains ${preflight.semanticPass ? 'eligible' : 'blocked by semantic/editorial preflight'}.`);
