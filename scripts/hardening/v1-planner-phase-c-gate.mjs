import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { MAX_PLANNER_CANDIDATES_PER_ARCHETYPE } from '../../src/services/planCandidateService.js';
import { PLANNER_VALIDATION_PROFILES, PLANNER_VALIDATION_TARGETS, PLANNER_VALIDATION_TOLERANCES } from '../../src/planner/validationProfiles.js';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await read(file));
const [pkg, manifest, candidateService, generationService, effectivePlanService, validationService, validationProfiles, generator, page, app, worker, offline, browser, pagesWorkflow, en, it] = await Promise.all([
  readJson('package.json'), readJson('public/data/catalog-manifest.json'), read('src/services/planCandidateService.js'),
  read('src/services/planGenerationService.js'), read('src/services/effectivePlanService.js'), read('src/services/plannerValidationService.js'), read('src/planner/validationProfiles.js'),
  read('src/planner/planGenerator.js'), read('src/ui/plannerValidationPage.js'), read('src/ui/app.js'), read('public/service-worker.js'),
  read('src/services/offlineCatalog.js'), read('scripts/hardening/browser-regression.mjs'), read('.github/workflows/pages.yml'),
  readJson('public/data/locales/en.json'), readJson('public/data/locales/it.json')
]);

const checks = []; const failures = [];
function check(id, pass, detail) { const row = { id, pass: Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); }
const profileIds = new Set(PLANNER_VALIDATION_PROFILES.map(item => item.id));
const requiredProfiles = ['current','hard_practical','hard_numeric_forbid','hard_categorical_forbid','hard_autoexclude','hard_intolerance_legumes','soft_high_protein','soft_high_fiber','soft_vegan_preference','soft_meal_avoid_vegan','soft_frequency_vegan','impossible_all_forbidden','external_unknown'];
const enKeys = Object.keys(en).sort(); const itKeys = Object.keys(it).sort();

check('phase-c-app-version', pkg.version === APP_VERSION && APP_VERSION === '1.0.0-rc.29', `package=${pkg.version}, runtime=${APP_VERSION}`);
check('phase-b-catalog-preserved', manifest.catalogVersion === '1.1.0-planner-phase-b' && manifest.recipeVersions?.count === 1800, `catalog=${manifest.catalogVersion}, recipes=${manifest.recipeVersions?.count}`);
check('phase-b-epoch-preserved', PRE_V1_DATA_EPOCH === 'v1-planner-phase-b-epoch-1', PRE_V1_DATA_EPOCH);
check('full-archetype-retrieval', MAX_PLANNER_CANDIDATES_PER_ARCHETYPE === 500 && /MAX_PLANNER_CANDIDATES_PER_ARCHETYPE\s*=\s*500/.test(candidateService), `limit=${MAX_PLANNER_CANDIDATES_PER_ARCHETYPE}`);
check('replacement-full-retrieval', /MAX_PLANNER_CANDIDATES_PER_ARCHETYPE/.test(effectivePlanService) && /service\.retrieve\(context\.mealClass\.mealArchetype, \{ limit: MAX_PLANNER_CANDIDATES_PER_ARCHETYPE \}\)/.test(effectivePlanService) && !/excludeAllergens/.test(effectivePlanService), 'replacement uses the same full bounded candidate space and canonical hard filter');
check('allergen-visible-to-hard-filter', /query\.retrieve\(archetype, \{ limit \}\)/.test(generationService) && !/allergen|allergy/i.test(generationService.slice(generationService.indexOf('async function boundedCandidates'), generationService.indexOf('async function historicalDaysBefore'))), 'candidate retrieval does not pre-remove allergy/allergen matches');
check('temporary-configuration-overlay', /configurationOverride\s*\?\s*structuredClone/.test(generationService) && /configurationOverride:\s*bundle/.test(validationService), 'manual validation uses a cloned configuration override');
check('validation-history-isolated', /ignorePlanHistory === true \? \[\]/.test(generationService) && /ignorePlanHistory:\s*true/.test(validationService), 'manual stress cases are isolated from any active plan history');
check('validation-never-commits', !/commitPlanPreview|atomicPut\(|activePlanInstanceId/.test(validationService) && !/commitPlanPreview|atomicPut\(/.test(page), 'Phase C lab cannot persist/confirm a validation plan');
check('stress-envelope-800-2600', JSON.stringify(PLANNER_VALIDATION_TARGETS) === JSON.stringify([800,1000,1200,1400,1600,1800,2000,2200,2400,2600]) && JSON.stringify(PLANNER_VALIDATION_TOLERANCES) === JSON.stringify([2,5,10]), `targets=${PLANNER_VALIDATION_TARGETS.join(',')}; tolerances=${PLANNER_VALIDATION_TOLERANCES.join(',')}`);
check('constraint-profile-matrix', requiredProfiles.every(id => profileIds.has(id)), `profiles=${[...profileIds].join(',')}`);
check('hard-safety-profile-coverage', /hard_intolerance_legumes/.test(validationProfiles) && /kind:\s*'intolerance'/.test(validationProfiles) && /targetType:\s*'foodCategory'/.test(validationProfiles), 'manual lab covers both allergen and intolerance safety paths');
check('negative-profiles-classified', /impossible_all_forbidden/.test(validationProfiles) && /external_unknown/.test(validationProfiles) && PLANNER_VALIDATION_PROFILES.filter(item => item.category === 'negative').every(item => item.expected === 'failed'), 'deliberately impossible cases have expected=failed');
check('soft-profile-coverage', /strength:\s*'avoid'/.test(validationProfiles) && /frequency:\s*\{\s*maxOccurrences:\s*1,\s*windowDays:\s*3\s*\}/.test(validationProfiles) && /soft_high_protein/.test(validationProfiles) && /soft_high_fiber/.test(validationProfiles), 'protein/fiber targets, MealClass avoid, FoodPreferences and frequency soft semantics have stress presets');
check('slot-pipeline-diagnostics', ['sourceCandidateCount','acceptedCandidateCount','candidateFrontierCount','optionCount','hardRejectionCounts','topSoftCandidates','sourceEnergyRange','optionEnergyRange'].every(token => generator.includes(token)), 'source -> hard accepted -> frontier -> option diagnostics are emitted per slot');
check('selected-soft-rank-diagnostics', /softRank/.test(generator) && /frontierRank/.test(generator) && /scoreComponents/.test(generator), 'selected meals expose rank and score components');
check('candidate-retrieval-diagnostics', /candidateRetrieval\s*=/.test(generationService) && /limitPerArchetype/.test(generationService) && /totalUniqueRecipes/.test(generationService), 'generation diagnostics expose retrieval limit/counts');
check('determinism-and-sweep-services', /runPlannerDeterminismCheck/.test(validationService) && /runPlannerEnergySweep/.test(validationService) && /sha256Json/.test(validationService), 'manual lab supports same-seed determinism and 30-case energy sweep');
check('fixed-serving-verification', /component\.servings === 1/.test(validationService), 'manual result explicitly checks fixed servings');
check('manual-route-and-actions', app.includes("'/planner-validation'") && ['planner-validation-run','planner-validation-determinism','planner-validation-sweep','planner-validation-result'].every(id => page.includes(id)), 'navigation route and manual actions are present');
check('diagnostic-export-and-config-links', /downloadJson/.test(page) && /\/configure\/nutrition/.test(page) && /\/configure\/safety/.test(page) && /\/configure\/preferences/.test(page) && /\/configure\/meals/.test(page) && /\/configure\/days/.test(page), 'operator can export diagnostics and jump to constraint configuration');
check('locale-parity', JSON.stringify(enKeys) === JSON.stringify(itKeys) && enKeys.length >= 760, `en=${enKeys.length}, it=${itKeys.length}`);
check('pwa-phase-c-shell', /ydm-shell-v32-/.test(worker) && /ydm-data-v16-/.test(worker) && /ydm-data-v16-/.test(offline) && ['src/services/plannerValidationService.js','src/planner/validationProfiles.js','src/ui/plannerValidationPage.js'].every(file => worker.includes(file)), 'shell=v32, data=v16, Phase C modules precached');
check('browser-phase-c-smoke', /planner-validation/.test(browser) && /planner-validation-run/.test(browser) && /phaseCManualLab/.test(browser), 'real Chromium gate opens and runs the manual validation lab');
check('browser-required-on-pages', /YDM_BROWSER_REQUIRED:\s*'1'/.test(pagesWorkflow) && /npm run check/.test(pagesWorkflow), 'Pages remains blocked on required Chromium acceptance');

const report = { schemaVersion: 1, suite: 'v1-planner-phase-c-manual-validation-lab', checkedAt: new Date().toISOString(), status: failures.length ? 'failed' : 'passed', checks, failures, metrics: { appVersion: APP_VERSION, catalogVersion: manifest.catalogVersion, recipeCount: manifest.recipeVersions?.count, candidateRetrievalLimit: MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, stressProfiles: PLANNER_VALIDATION_PROFILES.length, targets: [...PLANNER_VALIDATION_TARGETS], tolerances: [...PLANNER_VALIDATION_TOLERANCES] } };
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-planner-phase-c-gate.json'), JSON.stringify(report, null, 2) + '\n');
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`);
if (failures.length) { console.error(`V1 Planner Phase C gate failed: ${failures.map(item => item.id).join(', ')}`); process.exitCode = 1; }
else console.log(`V1 Planner Phase C gate PASS (${checks.length}/${checks.length})`);
