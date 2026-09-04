import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../../src/db/constants.js';

const root = process.cwd();
const read = async relative => readFile(path.join(root, relative), 'utf8');
const readJson = async relative => JSON.parse(await read(relative));
const checks = [];
const failures = [];
const check = (id, pass, detail) => {
  const row = { id, pass: Boolean(pass), detail };
  checks.push(row);
  if (!row.pass) failures.push(row);
};

const pkg = await readJson('package.json');
const revision = await read('DATA_UX_HARDENING_REVISION.md');
const roadmap = await read('specs/ROADMAP_V1.md');
const strategy = await read('specs/TEST_STRATEGY.md');
const skill = await read('skills/yourdietmanager-builder/SKILL.md');
const skillQuality = await read('skills/yourdietmanager-builder/references/quality-gates.md');
const workflow = await read('.github/workflows/pages.yml');
const browserSource = await read('scripts/hardening/browser-regression.mjs');

check('app-version-sync', pkg.version === APP_VERSION, `package=${pkg.version}, runtime=${APP_VERSION}`);
check('revision-pass-e-documented', /Pass E[\s\S]*Final Acceptance/i.test(revision), 'DATA_UX_HARDENING_REVISION.md declares Pass E Final Acceptance');
check('roadmap-pass-e-documented', /Pass E[\s\S]*acceptance/i.test(roadmap), 'ROADMAP_V1.md contains Pass E acceptance closure');
check('test-strategy-pass-e-documented', /Pass E/i.test(strategy) && /(dirty|navigation)/i.test(strategy) && /(save|feedback)/i.test(strategy) && /(schema|form)/i.test(strategy), 'TEST_STRATEGY.md assigns editor interaction acceptance to Pass E');
check('skill-pass-e-invariant', /final acceptance|Pass E/i.test(skill), 'project Skill contains the final-acceptance invariant');
check('skill-quality-pass-e', /Pass E[\s\S]*browser/i.test(skillQuality), 'Skill quality gates contain Pass E browser acceptance');
check('browser-covers-form-schema', browserSource.includes('nutrition-daily-energy') && browserSource.includes('blockedWhenBlank'), 'browser harness checks required numeric blank -> Save disabled');
check('browser-covers-disclosure', browserSource.includes('disclosurePreserved') && browserSource.includes('meal-rule-add'), 'browser harness checks disclosure preservation after local rerender');
check('browser-covers-dirty-navigation', browserSource.includes('__ydmPassEConfirmCalls') && browserSource.includes('dirtyNavigationGuarded'), 'browser harness checks reject/accept dirty navigation');
check('browser-covers-save-feedback', browserSource.includes(".toast-region .toast--success") && browserSource.includes('saveFeedbackVisible'), 'browser harness checks persistent success feedback');
check('ci-browser-required', /YDM_BROWSER_REQUIRED:\s*['\"]1['\"]/i.test(workflow), 'GitHub Pages verification requires a real browser pass');

const checkScript = pkg.scripts?.check || '';
const browserPos = checkScript.indexOf('hardening:browser');
const closurePos = checkScript.indexOf('hardening:revision');
check('closure-in-main-check', browserPos >= 0 && closurePos > browserPos, `check order browser=${browserPos}, closure=${closurePos}`);

let browserReport = null;
try { browserReport = await readJson('reports/pass-e-browser.json'); } catch {}
const required = process.env.YDM_BROWSER_REQUIRED === '1';
const acceptedSkipReasons = new Set(['chromium-not-installed', 'local-http-blocked-by-environment']);
const browserOkay = browserReport?.status === 'passed' || (!required && browserReport?.status === 'skipped' && acceptedSkipReasons.has(browserReport?.reason));
check('browser-run-status', browserOkay, browserReport ? `status=${browserReport.status}, reason=${browserReport.reason || 'none'}, required=${required}` : 'missing reports/pass-e-browser.json');

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  candidateAppVersion: APP_VERSION,
  requiredBrowser: required,
  browserStatus: browserReport?.status || 'missing',
  checks,
  passed: failures.length === 0,
  failures
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/pass-e-closure.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Pass E revision closure: ${report.passed ? 'PASS' : 'FAIL'} (${checks.length - failures.length}/${checks.length})`);
for (const failure of failures) console.log(`- ${failure.id}: ${failure.detail}`);
if (!report.passed) process.exitCode = 1;
