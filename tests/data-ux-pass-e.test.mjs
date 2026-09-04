import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../src/db/constants.js';

const root = process.cwd();
const text = relative => readFile(path.join(root, relative), 'utf8');

test('Pass E browser harness covers the final editor interaction acceptance surface', async () => {
  const browser = await text('scripts/hardening/browser-regression.mjs');
  const configUi = await text('src/ui/configurationPages.js');
  assert.match(configUi, /data-testid': 'nutrition-daily-energy'/);
  assert.match(configUi, /data-testid', 'editor-save'/);
  assert.match(configUi, /data-testid', 'meal-rule-add'/);
  assert.match(configUi, /\['\/configure\/days', 'config\.card\.days\.title'/);
  const appUi = await text('src/ui/app.js');
  assert.match(appUi, /SECONDARY = \[\['\/configure', 'nav\.configure'/);
  assert.match(browser, /blockedWhenBlank/);
  assert.match(browser, /disclosurePreserved/);
  assert.match(browser, /__ydmPassEConfirmCalls/);
  assert.match(browser, /saveFeedbackVisible/);
  assert.match(browser, /pass-e-browser\.json/);
  assert.match(browser, /pass-d-browser\.json/);
  assert.match(browser, /--remote-debugging-port=0/);
  assert.match(browser, /DevToolsActivePort/);
  assert.match(browser, /maxMs = 30000/);
  assert.match(browser, /evaluationError\(exceptionDetails, expression\)/);
  assert.match(browser, /a\[data-route\]\[href\$=\"\/configure\"\]/);
  assert.match(browser, /a\.config-card\[data-route\]\[href\$=\"\/configure\/days\"\]/);
  assert.doesNotMatch(browser, /a\[data-route\]\[href\$=\"\/configure\/days\"\]/);
});

test('Pass E closure gate runs after the browser gate and CI requires a real browser pass', async () => {
  const pkg = JSON.parse(await text('package.json'));
  const workflow = await text('.github/workflows/pages.yml');
  const closure = await text('scripts/hardening/revision-closure.mjs');
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(pkg.version, '1.0.0-rc.9');
  assert.ok(pkg.scripts.check.indexOf('hardening:browser') < pkg.scripts.check.indexOf('hardening:revision'));
  assert.match(workflow, /YDM_BROWSER_REQUIRED:\s*'1'/);
  assert.match(workflow, /CHROMIUM_PATH=\$browser/);
  assert.ok(workflow.indexOf('command -v google-chrome') < workflow.indexOf('command -v chromium'));
  assert.match(closure, /required.*browser/i);
  assert.match(closure, /browser-run-status/);
  assert.match(closure, /pass-e-closure\.json/);
});

test('Pass E is reflected in the revision, specs and reusable project Skill', async () => {
  const revision = await text('DATA_UX_HARDENING_REVISION.md');
  const roadmap = await text('specs/ROADMAP_V1.md');
  const strategy = await text('specs/TEST_STRATEGY.md');
  const skill = await text('skills/yourdietmanager-builder/SKILL.md');
  const quality = await text('skills/yourdietmanager-builder/references/quality-gates.md');
  assert.match(revision, /Pass E — Final Acceptance & Revision Closure/);
  assert.match(roadmap, /Pass E — Final acceptance and revision closure/);
  assert.match(strategy, /Pass E — final interaction acceptance and revision closure/);
  assert.match(skill, /Pass E final acceptance/);
  assert.match(quality, /Final acceptance \/ Pass E/);
});
