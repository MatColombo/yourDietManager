import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function report(payload) {
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const body = JSON.stringify({ suite: 'data-ux-hardening-pass-e', checkedAt: new Date().toISOString(), ...payload }, null, 2) + '\n';
  await Promise.all([
    writeFile(path.join(root, 'reports/pass-e-browser.json'), body),
    // Compatibility artifact retained for Pass D documentation/history.
    writeFile(path.join(root, 'reports/pass-d-browser.json'), body)
  ]);
}

function findChromium() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  for (const cmd of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const found = spawnSync('sh', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' }).stdout.trim();
    if (found) return found;
  }
  return null;
}

function mime(file) {
  const ext = path.extname(file);
  return ({ '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' })[ext] || 'application/octet-stream';
}

async function createStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let file = path.join(dist, relative || 'index.html');
      try { if (!(await stat(file)).isFile()) throw new Error('not-file'); }
      catch { file = path.join(dist, 'index.html'); }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' }); res.end(body);
    } catch (error) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(error)); }
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.events = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id); this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
        return;
      }
      if (message.method) for (const fn of this.events.get(message.method) || []) fn(message.params || {});
    });
  }
  async send(method, params = {}) {
    await this.ready; const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  once(method, maxMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${method}`)); }, maxMs);
      const fn = params => { cleanup(); resolve(params); };
      const cleanup = () => { clearTimeout(timer); const set = this.events.get(method); set?.delete(fn); };
      if (!this.events.has(method)) this.events.set(method, new Set()); this.events.get(method).add(fn);
    });
  }
  close() { this.ws.close(); }
}

async function waitForDevtools(port, maxMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) return response.json(); } catch {}
    await timeout(120);
  }
  throw new Error('Chromium DevTools endpoint did not start');
}

async function waitExpression(cdp, expression, maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.result?.value) return result.result.value;
    await timeout(120);
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

const required = process.env.YDM_BROWSER_REQUIRED === '1';
const chromium = findChromium();
if (!chromium) {
  console.log('Browser regression SKIPPED: Chromium not installed.');
  await report({ status: 'skipped', reason: 'chromium-not-installed' });
  process.exit(required ? 1 : 0);
}

const { server, origin } = await createStaticServer();
const profile = await mkdtemp(path.join(os.tmpdir(), 'ydm-browser-'));
const debugPort = 9300 + Math.floor(Math.random() * 400);
const browser = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = ''; browser.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });

try {
  await waitForDevtools(debugPort);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Unable to create browser target: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json(); const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.ready;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const browserErrors = [];
  if (!cdp.events.has('Runtime.exceptionThrown')) cdp.events.set('Runtime.exceptionThrown', new Set());
  cdp.events.get('Runtime.exceptionThrown').add(params => browserErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'runtime exception'));
  await cdp.send('Page.navigate', { url: `${origin}/recipes` });
  try { await waitExpression(cdp, `document.querySelectorAll('.recipe-card').length > 0`); } catch (error) {
    const diagnostic = await evaluate(cdp, `({href:location.href,title:document.title,body:document.body?.innerText?.slice(0,2000) || ''})`).catch(() => null);
    throw new Error(`${error.message}; browser=${JSON.stringify(diagnostic)}; exceptions=${browserErrors.join(' | ')}`);
  }

  // Critical regression: clicking a recipe card must open catalog detail, not fall through to Today/Create plan.
  await evaluate(cdp, `document.querySelector('.recipe-card').click(); true`);
  await waitExpression(cdp, `location.pathname.startsWith('/recipes/') && !!document.querySelector('[data-testid="recipe-detail"] h2')`);
  const recipeState = await evaluate(cdp, `({path: location.pathname, title: document.querySelector('[data-testid="recipe-detail"] h2')?.textContent || '', body: document.querySelector('[data-testid="recipe-detail"]')?.textContent || ''})`);
  if (!recipeState.path.startsWith('/recipes/') || !recipeState.title) throw new Error(`Recipe detail route failed: ${JSON.stringify(recipeState)}`);
  if (/crea un piano|create a plan/i.test(recipeState.body)) throw new Error('Recipe detail incorrectly rendered plan-creation content');

  // Every recipe, including bundled/base content, exposes Edit. The editor is route-independent from PlanInstance.
  await evaluate(cdp, `document.querySelector('[data-testid="recipe-detail"] a[href$="/edit"]').click(); true`);
  await waitExpression(cdp, `location.pathname.endsWith('/edit') && !!document.querySelector('[data-testid="recipe-editor"]')`);

  // Ingredient catalog exposes an independent detail route and an Edit action for bundled content.
  await cdp.send('Page.navigate', { url: `${origin}/configure/ingredients` });
  await waitExpression(cdp, `document.querySelectorAll('.ingredient-card').length > 0`);
  await evaluate(cdp, `document.querySelector('.ingredient-card a').click(); true`);
  await waitExpression(cdp, `location.pathname.startsWith('/configure/ingredients/') && !!document.querySelector('[data-testid="ingredient-detail"] h2')`);
  const ingredientState = await evaluate(cdp, `({path: location.pathname, title: document.querySelector('[data-testid="ingredient-detail"] h2')?.textContent || '', edit: !!document.querySelector('[data-testid="ingredient-detail"] a[href$="/edit"]')})`);
  if (!ingredientState.title || !ingredientState.edit) throw new Error(`Ingredient detail/edit regression: ${JSON.stringify(ingredientState)}`);

  // Pass E final acceptance: required numeric blanks are blocked before persistence.
  await cdp.send('Page.navigate', { url: `${origin}/configure/nutrition` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="nutrition-editor"] [data-testid="nutrition-daily-energy"]')`);
  const formParity = await evaluate(cdp, `(() => {
    const input = document.querySelector('[data-testid="nutrition-daily-energy"]');
    const save = document.querySelector('[data-testid="editor-save"]');
    const original = input.value;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const blockedWhenBlank = save.disabled && save.getAttribute('aria-disabled') === 'true';
    input.value = original;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { blockedWhenBlank, enabledWhenRestored: !save.disabled, original };
  })()`);
  if (!formParity.blockedWhenBlank || !formParity.enabledWhenRestored) throw new Error(`Form/schema parity regression: ${JSON.stringify(formParity)}`);
  await evaluate(cdp, `document.querySelector('[data-testid="editor-save"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('.toast-region .toast--success')`);
  const saveFeedback = await evaluate(cdp, `({path: location.pathname, text: document.querySelector('.toast-region .toast--success')?.textContent || ''})`);
  if (!saveFeedback.text) throw new Error(`Save feedback regression: ${JSON.stringify(saveFeedback)}`);

  // Pass E final acceptance: local rerenders preserve disclosure state and dirty navigation is guarded.
  await cdp.send('Page.navigate', { url: `${origin}/configure/meals` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="meal-class-editor"] details[data-ui-key^="meal-class:"]')`);
  const disclosureKey = await evaluate(cdp, `(() => {
    const details = document.querySelector('[data-testid="meal-class-editor"] details[data-ui-key^="meal-class:"]');
    if (!details.open) details.querySelector('summary').click();
    return details.getAttribute('data-ui-key');
  })()`);
  await evaluate(cdp, `document.querySelector('details[data-ui-key="${disclosureKey}"] [data-testid="meal-rule-add"]').click(); true`);
  const disclosureState = await waitExpression(cdp, `(() => {
    const details = document.querySelector('details[data-ui-key="${disclosureKey}"]');
    const save = document.querySelector('[data-testid="editor-save"]');
    return details && details.open && save && save.disabled ? {open: true, invalidBlocked: true} : null;
  })()`);
  const rejectedNavigation = await evaluate(cdp, `(() => {
    window.__ydmPassEConfirmCalls = 0;
    window.confirm = () => { window.__ydmPassEConfirmCalls += 1; return false; };
    document.querySelector('a[data-route][href$="/configure/days"]').click();
    return true;
  })()`);
  if (!rejectedNavigation) throw new Error('Dirty navigation rejection click did not execute');
  await waitExpression(cdp, `window.__ydmPassEConfirmCalls === 1 && location.pathname === '/configure/meals'`);
  await evaluate(cdp, `(() => {
    window.confirm = () => { window.__ydmPassEConfirmCalls += 1; return true; };
    document.querySelector('a[data-route][href$="/configure/days"]').click();
    return true;
  })()`);
  await waitExpression(cdp, `location.pathname === '/configure/days' && window.__ydmPassEConfirmCalls === 2`);

  const acceptance = {
    formSchemaParity: formParity,
    disclosureKey,
    disclosurePreserved: Boolean(disclosureState?.open),
    invalidDraftBlocked: Boolean(disclosureState?.invalidBlocked),
    dirtyNavigationGuarded: true,
    saveFeedbackVisible: true
  };
  console.log(`Browser regression PASS: recipe=${recipeState.path}, ingredient=${ingredientState.path}, passE=accepted`);
  await report({ status: 'passed', recipePath: recipeState.path, ingredientPath: ingredientState.path, acceptance });
  cdp.close();
} catch (error) {
  const blocked = /is blocked|organization.*allow/i.test(error.message || String(error));
  if (blocked) {
    console.log('Browser regression SKIPPED: local HTTP navigation is blocked by the execution environment policy.');
    await report({ status: 'skipped', reason: 'local-http-blocked-by-environment', detail: error.message || String(error) });
    if (required) process.exitCode = 1;
  } else {
    console.error(error.stack || error);
    if (stderr.trim()) console.error(`Chromium stderr:\n${stderr}`);
    await report({ status: 'failed', reason: error.message || String(error) });
    process.exitCode = 1;
  }
} finally {
  server.close(); browser.kill('SIGTERM'); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
