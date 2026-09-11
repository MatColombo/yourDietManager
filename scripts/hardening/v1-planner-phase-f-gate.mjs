import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { APP_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { PLANNER_SOFT_OBJECTIVE_POLICY } from '../../src/planner/qualityPolicy.js';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { CatalogImporter } from '../../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../../src/services/configurationBootstrap.js';
import { runPlannerValidationCase } from '../../src/services/plannerValidationService.js';
import { MemoryRepository, fileFetch, fileLoader } from '../../tests/helpers.mjs';

const root = process.cwd();
const checks = [];
const failures = [];
const check = (id, pass, detail) => { const row = { id, pass: Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); };
const read = relative => readFile(path.join(root, relative), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const manifest = JSON.parse(await read('public/data/catalog-manifest.json'));
const worker = await read('public/service-worker.js');
const beam = await read('src/planner/beamSolver.js');
const validationPage = await read('src/ui/plannerValidationPage.js');
const workflow = await read('.github/workflows/v1-release-candidate.yml');

check('phase-f-version', pkg.version === APP_VERSION && ['1.0.0-rc.34','1.0.0'].includes(APP_VERSION), `package=${pkg.version}, runtime=${APP_VERSION}`);
check('phase-f-persistence-stable', DB_VERSION === 6 && PRE_V1_DATA_EPOCH === 'v1-planner-phase-d-epoch-1', `db=${DB_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('phase-f-catalog-stable', manifest.catalogVersion === '1.2.0-planner-phase-d' && manifest.recipeVersions?.count === 1800, `catalog=${manifest.catalogVersion}, recipes=${manifest.recipeVersions?.count}`);
check('phase-f-policy-version', PLANNER_SOFT_OBJECTIVE_POLICY.version === 'phase-f-soft-objective-1', PLANNER_SOFT_OBJECTIVE_POLICY.version);
check('phase-f-short-repeat-weight', PLANNER_SOFT_OBJECTIVE_POLICY.varietyWindows[0].recipe >= 20 && PLANNER_SOFT_OBJECTIVE_POLICY.varietyWindows[1].recipe >= 10, JSON.stringify(PLANNER_SOFT_OBJECTIVE_POLICY.varietyWindows));
check('phase-f-soft-not-attenuated', /slotOptionSoftContribution/.test(beam) && !/score\.total\s*\|\|\s*0\)\s*\*\s*0\.15/.test(beam), 'slot options preserve full preference/variety contribution');
check('phase-f-quality-visible', /uniqueRecipeRate/.test(validationPage) && /exactRepeatPairsWithin3Days/.test(validationPage), 'Planner Lab exposes quality metrics');
check('phase-f-shell', /ydm-shell-v37-/.test(worker) && /ydm-data-v17-/.test(worker) && worker.includes('src/planner/qualityPolicy.js') && worker.includes('src/planner/qualityMetrics.js'), 'shell=v37, data=v17, Phase F modules precached');
check('phase-f-workflow', /v1:planner-phase-f/.test(workflow), 'manual release-candidate workflow runs Phase F');

const repo = new MemoryRepository();
const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas')));
await registry.loadAll();
await new CatalogImporter({ repo, registry, fetcher: fileFetch(root), storage: null, serviceWorker: null }).bootstrap();
await ensureBootstrapConfiguration({ repo, registry, fetcher: fileFetch(root), timeZoneResolver: () => 'Europe/Rome' });

const quality = await runPlannerValidationCase({ targetKcal: 2600, tolerancePct: 2, days: 14, startDate: '2026-09-14', seed: 'phase-f-quality-gate', profileId: 'current', createdAt: '2026-09-10T10:00:00.000Z' }, { repo, registry });
check('phase-f-2600-feasible', quality.actualOutcome === 'success' && quality.energy.allWithinTolerance && quality.servingsFixed, quality.failure ? JSON.stringify(quality.failure) : JSON.stringify(quality.energy));
check('phase-f-2600-uniqueness', Number(quality.quality?.uniqueRecipeRate || 0) >= 0.70, JSON.stringify(quality.quality));
check('phase-f-2600-no-short-repeat', quality.quality?.exactRepeatPairsWithin3Days === 0, JSON.stringify(quality.quality));

const baseOptions = { targetKcal: 2000, tolerancePct: 2, days: 7, startDate: '2026-09-14', seed: 'phase-f-soft-gate', createdAt: '2026-09-10T10:00:00.000Z' };
const [current, protein, preferVegan, avoidVegan, frequencyVegan] = await Promise.all([
  runPlannerValidationCase({ ...baseOptions, profileId: 'current' }, { repo, registry }),
  runPlannerValidationCase({ ...baseOptions, profileId: 'soft_high_protein' }, { repo, registry }),
  runPlannerValidationCase({ ...baseOptions, profileId: 'soft_vegan_preference' }, { repo, registry }),
  runPlannerValidationCase({ ...baseOptions, profileId: 'soft_meal_avoid_vegan' }, { repo, registry }),
  runPlannerValidationCase({ ...baseOptions, profileId: 'soft_frequency_vegan' }, { repo, registry })
]);
const allSoft = [current, protein, preferVegan, avoidVegan, frequencyVegan];
check('phase-f-soft-feasible', allSoft.every(result => result.actualOutcome === 'success' && result.energy.allWithinTolerance), allSoft.map(result => result.actualOutcome).join(','));
check('phase-f-high-protein-direction', Number(protein.quality?.averageDailyProteinG || 0) >= Number(current.quality?.averageDailyProteinG || 0) + 15, `current=${current.quality?.averageDailyProteinG}, high=${protein.quality?.averageDailyProteinG}`);
check('phase-f-high-protein-variety-floor', Number(protein.quality?.uniqueRecipeRate || 0) >= 0.70, JSON.stringify(protein.quality));

async function veganOccurrences(result) {
  const ids = result.preview.calendarDays.flatMap(day => (day.mealSlots || []).flatMap(slot => (slot.recipeComponents || []).map(component => component.recipeVersionId)));
  const versions = await repo.getMany('recipeVersions', [...new Set(ids)]);
  const byId = new Map(versions.map(recipe => [recipe.recipeVersionId, recipe]));
  return ids.filter(id => (byId.get(id)?.tags?.diet || []).includes('diet_vegan')).length;
}
const vegan = {
  current: await veganOccurrences(current),
  prefer: await veganOccurrences(preferVegan),
  avoid: await veganOccurrences(avoidVegan),
  frequency: await veganOccurrences(frequencyVegan)
};
check('phase-f-preference-direction', vegan.prefer > vegan.current && vegan.avoid < vegan.current && vegan.frequency < vegan.current, JSON.stringify(vegan));

const report = {
  schemaVersion: 1,
  suite: 'v1-planner-phase-f-quality-tuning',
  checkedAt: new Date().toISOString(),
  status: failures.length ? 'failed' : 'passed',
  checks,
  failures,
  metrics: { quality2600: quality.quality, soft2000: { current: current.quality, highProtein: protein.quality, vegan } }
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-planner-phase-f-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 Planner Phase F gate: ${failures.length ? 'FAIL' : 'PASS'} (${checks.length - failures.length}/${checks.length})`);
for (const failure of failures) console.log(`- ${failure.id}: ${failure.detail}`);
if (failures.length) process.exitCode = 1;
