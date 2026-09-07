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
  const candidates = explicit
    ? [explicit]
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (!probe.error && probe.status === 0) {
      return { path: candidate, version: (probe.stdout || probe.stderr || '').trim() || 'unknown' };
    }
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

async function waitForDevtools(profile, browserState, maxMs = 30000) {
  const started = Date.now();
  const activePortFile = path.join(profile, 'DevToolsActivePort');
  let lastDetail = '';

  while (Date.now() - started < maxMs) {
    if (browserState.error) throw new Error(`Chromium failed to spawn: ${browserState.error.message}`);
    if (browserState.exit) {
      const { code, signal } = browserState.exit;
      throw new Error(`Chromium exited before DevTools was ready (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    }

    let port = null;
    try {
      const active = await readFile(activePortFile, 'utf8');
      const firstLine = active.split(/\r?\n/, 1)[0]?.trim();
      if (/^\d+$/.test(firstLine || '')) port = Number(firstLine);
    } catch (error) {
      if (error?.code !== 'ENOENT') lastDetail = error.message || String(error);
    }

    if (!port) {
      const match = browserState.stderr.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (match) port = Number(match[1]);
    }

    if (port) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) return { port, version: await response.json() };
        lastDetail = `HTTP ${response.status} from DevTools version endpoint`;
      } catch (error) {
        lastDetail = error.message || String(error);
      }
    }
    await timeout(120);
  }

  const suffix = lastDetail ? `; last detail: ${lastDetail}` : '';
  throw new Error(`Chromium DevTools endpoint did not start within ${maxMs} ms${suffix}`);
}

function evaluationError(exceptionDetails, expression) {
  const exception = exceptionDetails?.exception;
  const description = exception?.description || exception?.value || exceptionDetails?.text || 'Browser evaluation failed';
  const line = Number.isInteger(exceptionDetails?.lineNumber) ? ` line=${exceptionDetails.lineNumber + 1}` : '';
  const column = Number.isInteger(exceptionDetails?.columnNumber) ? ` column=${exceptionDetails.columnNumber + 1}` : '';
  const source = String(expression || '').replace(/\s+/g, ' ').trim().slice(0, 260);
  return new Error(`${description}${line}${column}; expression=${source}`);
}

async function waitExpression(cdp, expression, maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw evaluationError(result.exceptionDetails, expression);
    if (result.result?.value) return result.result.value;
    await timeout(120);
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw evaluationError(result.exceptionDetails, expression);
  return result.result?.value;
}

const required = process.env.YDM_BROWSER_REQUIRED === '1';
const browserChoice = findChromium();
if (!browserChoice) {
  console.log('Browser regression SKIPPED: Chromium/Chrome not installed or not executable.');
  await report({ status: 'skipped', reason: 'chromium-not-installed' });
  process.exit(required ? 1 : 0);
}

const { server, origin } = await createStaticServer();
const profile = await mkdtemp(path.join(os.tmpdir(), 'ydm-browser-'));
const browserState = { error: null, exit: null, stderr: '' };
const browser = spawn(browserChoice.path, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
browser.once('error', error => { browserState.error = error; });
browser.once('exit', (code, signal) => { browserState.exit = { code, signal }; });
browser.stderr.on('data', chunk => {
  browserState.stderr += chunk.toString();
  if (browserState.stderr.length > 12000) browserState.stderr = browserState.stderr.slice(-12000);
});

try {
  const devtools = await waitForDevtools(profile, browserState);
  const debugPort = devtools.port;
  console.log(`Browser regression using ${browserChoice.version} (${browserChoice.path}), DevTools port ${debugPort}`);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Unable to create browser target: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json(); const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.ready;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const browserErrors = [];
  if (!cdp.events.has('Runtime.exceptionThrown')) cdp.events.set('Runtime.exceptionThrown', new Set());
  cdp.events.get('Runtime.exceptionThrown').add(params => browserErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'runtime exception'));
  await cdp.send('Page.navigate', { url: `${origin}/recipes` });
  const recipeBootstrapExpression = `(() => {
    if (document.querySelectorAll('.recipe-card').length > 0) return 'ready';
    if (document.querySelector('.catalog-panel .error-text')) return 'error';
    return '';
  })()`;
  try {
    const bootstrapState = await waitExpression(cdp, recipeBootstrapExpression, 60000);
    if (bootstrapState === 'error') {
      const detail = await evaluate(cdp, `document.querySelector('.catalog-panel .error-text')?.textContent || 'Catalog bootstrap failed'`);
      throw new Error(`Catalog bootstrap failed: ${detail}`);
    }
  } catch (error) {
    const diagnostic = await evaluate(cdp, `({
      href:location.href,
      title:document.title,
      catalogStatus:document.querySelector('.catalog-panel')?.innerText?.slice(0,1200) || '',
      recipeCards:document.querySelectorAll('.recipe-card').length,
      body:document.body?.innerText?.slice(0,2000) || ''
    })`).catch(() => null);
    throw new Error(`${error.message}; browser=${JSON.stringify(diagnostic)}; exceptions=${browserErrors.join(' | ')}`);
  }

  // Critical regression: clicking a recipe card must open catalog detail, not fall through to Today/Create plan.
  await evaluate(cdp, `document.querySelector('.recipe-card').click(); true`);
  await waitExpression(cdp, `location.pathname.startsWith('/recipes/') && !!document.querySelector('[data-testid="recipe-detail"] h2')`);
  const recipeState = await evaluate(cdp, `({path: location.pathname, title: document.querySelector('[data-testid="recipe-detail"] h2')?.textContent || '', body: document.querySelector('[data-testid="recipe-detail"]')?.textContent || ''})`);
  if (!recipeState.path.startsWith('/recipes/') || !recipeState.title) throw new Error(`Recipe detail route failed: ${JSON.stringify(recipeState)}`);
  if (/crea un piano|create a plan/i.test(recipeState.body)) throw new Error('Recipe detail incorrectly rendered plan-creation content');

  // Normal catalog detail exposes Edit. A frozen production-review version intentionally suppresses
  // the visible Edit action so the reviewer evaluates the exact frozen version. The editor route
  // remains route-independent from PlanInstance and, if saved, promotes the family to a user-owned version.
  const recipeControls = await evaluate(cdp, `({
    reviewPanel: !!document.querySelector('[data-testid="human-review-panel"]'),
    editHref: document.querySelector('[data-testid="recipe-detail"] a[href$="/edit"]')?.getAttribute('href') || '',
    reviewDashboard: !!document.querySelector('[data-testid="recipe-detail"] a[href="/recipes/review"]')
  })`);
  if (recipeControls.reviewPanel) {
    if (recipeControls.editHref || !recipeControls.reviewDashboard) throw new Error(`Production review detail controls regression: ${JSON.stringify(recipeControls)}`);
    await cdp.send('Page.navigate', { url: `${origin}${recipeState.path}/edit` });
  } else {
    if (!recipeControls.editHref) throw new Error(`Recipe detail missing Edit action: ${JSON.stringify(recipeControls)}`);
    await evaluate(cdp, `document.querySelector('[data-testid="recipe-detail"] a[href$="/edit"]').click(); true`);
  }
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
  // Use links that are actually present in the rendered UI. From /configure/meals the shell exposes
  // /configure; the /configure/days card exists only after reaching the configuration index.
  const rejectedNavigation = await evaluate(cdp, `(() => {
    window.__ydmPassEConfirmCalls = 0;
    window.confirm = () => { window.__ydmPassEConfirmCalls += 1; return false; };
    const link = document.querySelector('a[data-route][href$="/configure"]');
    if (!link) throw new Error('Expected Configure navigation link is missing');
    link.click();
    return true;
  })()`);
  if (!rejectedNavigation) throw new Error('Dirty navigation rejection click did not execute');
  await waitExpression(cdp, `window.__ydmPassEConfirmCalls === 1 && location.pathname === '/configure/meals'`);
  await evaluate(cdp, `(() => {
    window.confirm = () => { window.__ydmPassEConfirmCalls += 1; return true; };
    const link = document.querySelector('a[data-route][href$="/configure"]');
    if (!link) throw new Error('Expected Configure navigation link is missing');
    link.click();
    return true;
  })()`);
  await waitExpression(cdp, `location.pathname === '/configure' && window.__ydmPassEConfirmCalls === 2`);
  await waitExpression(cdp, `!!document.querySelector('a.config-card[data-route][href$="/configure/days"]')`);
  await evaluate(cdp, `(() => {
    const link = document.querySelector('a.config-card[data-route][href$="/configure/days"]');
    if (!link) throw new Error('Expected Day classes configuration card is missing');
    link.click();
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
  await report({ status: 'passed', browserPath: browserChoice.path, browserVersion: browserChoice.version, recipePath: recipeState.path, ingredientPath: ingredientState.path, acceptance });
  cdp.close();
} catch (error) {
  const blocked = /is blocked|organization.*allow/i.test(error.message || String(error));
  if (blocked) {
    console.log('Browser regression SKIPPED: local HTTP navigation is blocked by the execution environment policy.');
    await report({ status: 'skipped', reason: 'local-http-blocked-by-environment', detail: error.message || String(error), browserPath: browserChoice.path, browserVersion: browserChoice.version });
    if (required) process.exitCode = 1;
  } else {
    console.error(error.stack || error);
    if (browserState.stderr.trim()) console.error(`Chromium stderr:\n${browserState.stderr}`);
    await report({ status: 'failed', reason: error.message || String(error), browserPath: browserChoice.path, browserVersion: browserChoice.version, chromiumStderr: browserState.stderr.slice(-4000) });
    process.exitCode = 1;
  }
} finally {
  server.close(); browser.kill('SIGTERM'); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
