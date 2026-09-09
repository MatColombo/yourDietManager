import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../../src/db/constants.js';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const [pkgText, planUi, shoppingUi, history, offline, worker, browser, tests, pagesWorkflow] = await Promise.all([
  read('package.json'), read('src/ui/planPages.js'), read('src/ui/shoppingPages.js'), read('src/services/operationHistoryService.js'),
  read('src/services/offlineCatalog.js'), read('public/service-worker.js'), read('scripts/hardening/browser-regression.mjs'),
  read('tests/v1-step2.test.mjs'), read('.github/workflows/pages.yml')
]);
const pkg = JSON.parse(pkgText);
const checks = [];
const failures = [];
const check = (id, pass, detail) => { const row = { id, pass: Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); };

check('app-version-sync', pkg.version === APP_VERSION && /^1\.0\.0-rc\.\d+$/.test(pkg.version), `package=${pkg.version}, runtime=${APP_VERSION}`);
check('plan-recipe-route', planUi.includes('new URLSearchParams({ version: recipe.recipeVersionId, return: returnRoute })') && planUi.includes('href: `/recipes/${encodeURIComponent(recipe.recipeId)}?${query}`') && !planUi.includes('/recipes/?id='), 'plan recipe links use /recipes/:recipeId with exact version and contextual return');
check('plan-recipe-metrics-scope', /function recipePills\(state, recipe\)/.test(planUi) && /recipePills\(state, item\.recipe\)/.test(planUi), 'translation state is explicitly passed to recipe metrics');
check('plan-ui-acceptance-hooks', ['plan-generate','plan-confirm','plan-manage-today','plan-replace','adherence-save','rebalance-confirm','plan-undo','plan-redo'].every(id => planUi.includes(`'data-testid': '${id}'`)), 'vertical plan actions expose stable acceptance hooks');
check('undo-staleness-clock', (history.match(/mutation\.metaSet\.planUpdatedAt/g) || []).length >= 2, 'undo and redo advance planUpdatedAt');
check('shopping-recalculation-key', shoppingUi.includes("await state.repo.getMeta('planUpdatedAt')") && shoppingUi.includes('ui.calculationKey !== calculationKey'), 'shopping view invalidates derived calculation when effective plan changes');
check('shopping-ui-acceptance-hooks', ['shopping-calculate','shopping-save-checklist','shopping-check-item','shopping-page'].every(id => shoppingUi.includes(`'data-testid': '${id}'`)), 'shopping/checklist flow exposes stable acceptance hooks');
check('offline-cache-parity', /ydm-data-v17-/.test(offline) && /ydm-data-v17-/.test(worker), 'direct offline cache and service worker share data cache v17');
check('shell-cache-bumped', /ydm-shell-v35-/.test(worker), 'planner-validation shell assets invalidate prior cached JS');
const scenarios = ['Step2 A', 'Step2 B', 'Step2 C', 'Step2 D', 'Step2 E', 'Step2 F'];
check('six-engine-scenarios', scenarios.every(label => tests.includes(label)), scenarios.join(', '));
check('browser-vertical-flow', browser.includes('V1 Step 2 vertical product acceptance') && browser.includes('shoppingChecklistPersisted') && browser.includes('reloadPreservedPlan'), 'real Chromium gate covers create/replace/adherence/rebalance/undo-redo/shopping/reload');
check('browser-required-on-pages', /YDM_BROWSER_REQUIRED:\s*'1'/.test(pagesWorkflow) && /npm run check/.test(pagesWorkflow), 'Pages deployment blocks on required browser acceptance');

const report = {
  suite: 'v1-step2-vertical-product-engine-acceptance',
  checkedAt: new Date().toISOString(),
  status: failures.length ? 'failed' : 'passed',
  checks,
  failures
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-step2-gate.json'), JSON.stringify(report, null, 2) + '\n');
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`);
if (failures.length) {
  console.error(`V1 Step 2 gate failed: ${failures.map(item => item.id).join(', ')}`);
  process.exitCode = 1;
} else console.log(`V1 Step 2 gate PASS (${checks.length}/${checks.length})`);
