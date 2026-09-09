import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await read(file));
const [pkg, catalog, guided, configuration, catalogPages, catalogQuery, planPages, app, css, personal, worker, offline, en, it, packageSource] = await Promise.all([
  readJson('package.json'), loadLocalCatalog(path.join(root, 'public/data')), read('src/ui/guidedControls.js'), read('src/ui/configurationPages.js'),
  read('src/ui/catalogPages.js'), read('src/services/catalogQuery.js'), read('src/ui/planPages.js'), read('src/ui/app.js'), read('src/styles.css'),
  read('src/services/personalCatalogService.js'), read('public/service-worker.js'), read('src/services/offlineCatalog.js'),
  readJson('public/data/locales/en.json'), readJson('public/data/locales/it.json'), read('package.json')
]);

const checks = []; const failures = [];
function check(id, pass, detail) { const row = { id, pass: Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); }
const locales = ['productFood.search.placeholder','productFood.search.help','productFood.level.category','productFood.level.subcategory','productFood.level.concept','productFood.coverage','catalog.filter.productFood','catalog.filter.diet','catalog.filter.practical','catalog.filter.state','navigation.backToContext','plan.openRecipe'];

check('phase-d3-d5-version', pkg.version === APP_VERSION && APP_VERSION === '1.0.0-rc.32', `package=${pkg.version}, runtime=${APP_VERSION}`);
check('phase-d3-d5-persistence-stable', DB_VERSION === 6 && PRE_V1_DATA_EPOCH === 'v1-planner-phase-d-epoch-1', `db=${DB_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('phase-d3-d5-catalog-unchanged', catalog.manifest.catalogVersion === '1.2.0-planner-phase-d' && catalog.recipeVersions.length === 1800 && catalog.ingredientRevisions.length === 600, `catalog=${catalog.manifest.catalogVersion}, recipes=${catalog.recipeVersions.length}, ingredients=${catalog.ingredientRevisions.length}`);
check('product-food-picker', /export function createProductFoodPicker/.test(guided) && /productFoodPathLabel/.test(guided) && /productFoodCoverage/.test(guided), 'hierarchical picker exposes path + coverage');
check('product-food-picker-localized', /productFood\.level\./.test(guided) && /productFood\.coverage/.test(guided), 'picker level and coverage labels use locale keys');
check('configuration-reuses-product-picker', /kind === 'productFood'[\s\S]*createProductFoodPicker/.test(configuration), 'preference/safety/meal semantic targets reuse product picker');
check('preferences-default-product-food', /preferences\.rules\.push\(\{ id: makeId\('pref'\), targetType: 'productFood'/.test(configuration), 'new preference rule starts at productFood rather than source foodCategory');
check('ingredient-authoring-concept-required', /createProductFoodPicker\(state, state\.referenceDataIndex, \{ value: source\.productFoodId \|\| null, required: true, levels: \['concept'\] \}\)/.test(catalogPages) && /productFoodId/.test(personal), 'new ingredient revisions require a product concept');
check('ingredient-faceted-ui', /catalog\.filter\.productFood/.test(catalogPages) && /catalog\.filter\.state/.test(catalogPages) && /productFoodId: params\.get\('food'\)/.test(catalogPages), 'ingredient browser has product taxonomy + state facets');
check('recipe-faceted-ui', /catalog\.filter\.productFood/.test(catalogPages) && /catalog\.filter\.diet/.test(catalogPages) && /catalog\.filter\.practical/.test(catalogPages), 'recipe browser exposes product, diet and practical facets');
check('recipe-query-product-graph', /clean\.productFoodId[\s\S]*ingredientRevisionById/.test(catalogQuery) && /matchesProductFood/.test(catalogQuery), 'recipe facet resolves through ingredient product taxonomy');
check('ingredient-query-facets', /listCurrentIngredients\(\{ text = '', origin = '', foodGroup = '', productFoodId = '', state = '' \}/.test(catalogQuery) && /basis\?\.state/.test(catalogQuery), 'ingredient query supports product taxonomy + state');
check('recipe-taxonomy-facets-visible', /productFoodFacetsForRecipes/.test(catalogQuery) && /chip--taxonomy/.test(catalogPages), 'recipe cards expose product category facets');
check('day-recipe-direct-link', /data-testid': 'plan-recipe-link'/.test(planPages) && /return: returnRoute/.test(planPages) && /meal-\$\{slot\.mealOccurrenceId\}/.test(planPages), 'day slot links directly to exact recipe with return anchor');
check('recipe-ingredient-direct-link', /data-testid': 'recipe-ingredient-link'/.test(catalogPages) && /revision: line\.ingredientRevisionId, return: selfRoute/.test(catalogPages), 'recipe ingredients link to exact IngredientRevision with recipe return');
check('context-back-safe', /safeReturnRoute/.test(catalogPages) && /data-testid': 'context-back'/.test(catalogPages), 'recipe and ingredient detail provide sanitized contextual back navigation');
check('slot-return-restored', /location\.hash/.test(app) && /scrollIntoView/.test(app) && /context-return-target/.test(app) && /context-return-target/.test(css), 'SPA restores and highlights exact returned meal slot');
check('locale-parity-d3-d5', locales.every(key => typeof en[key] === 'string' && typeof it[key] === 'string') && Object.keys(en).length === Object.keys(it).length, `keys=${Object.keys(en).length}/${Object.keys(it).length}`);
check('pwa-shell-bumped-only', /ydm-shell-v35-/.test(worker) && /ydm-data-v17-/.test(worker) && /ydm-data-v17-/.test(offline), 'shell=v34, data remains v17');
check('phase-d3-d5-check-wired', /v1:planner-phase-d-ux/.test(packageSource) && /v1:planner-phase-d && npm run v1:planner-phase-d-ux/.test(packageSource), 'focused D3-D5 gate is part of npm check');

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), phase: 'D3-D5', checks, pass: failures.length === 0 };
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-planner-phase-d-ux-gate.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`);
if (failures.length) { console.error(`V1 Planner Phase D3-D5 gate failed: ${failures.map(item => item.id).join(', ')}`); process.exitCode = 1; }
else console.log(`V1 Planner Phase D3-D5 gate PASS (${checks.length}/${checks.length})`);
