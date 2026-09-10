import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const expectedCatalogManifest = JSON.parse(await readFile(path.join(dist, 'data', 'catalog-manifest.json'), 'utf8'));
const expectedRecipeCount = Number(expectedCatalogManifest.recipeVersions?.count || expectedCatalogManifest.recipeFamilies?.count || 0);
const expectedCatalogVersion = expectedCatalogManifest.catalogVersion;
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function report(payload) {
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const body = JSON.stringify({ suite: 'data-ux-hardening-pass-e', checkedAt: new Date().toISOString(), ...payload }, null, 2) + '\n';
  await Promise.all([
    writeFile(path.join(root, 'reports/pass-e-browser.json'), body),
    writeFile(path.join(root, 'reports/v1-step2-browser.json'), body),
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
      if (relative === '__seed') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><body>seed</body></html>');
        return;
      }
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
  let browserDetail = '';
  try {
    const detail = await cdp.send('Runtime.evaluate', {
      expression: `({href:location.href,title:document.title,body:(document.body?.innerText || '').slice(0,500)})`,
      returnByValue: true
    });
    if (!detail.exceptionDetails && detail.result?.value) browserDetail = `; browser=${JSON.stringify(detail.result.value)}`;
  } catch {}
  throw new Error(`Browser condition timed out: ${expression}${browserDetail}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw evaluationError(result.exceptionDetails, expression);
  return result.result?.value;
}

async function clickWhenReady(cdp, selector, maxMs = 15000) {
  const encoded = JSON.stringify(selector);
  return waitExpression(cdp, `(() => {
    const node = document.querySelector(${encoded});
    if (!node) return false;
    node.click();
    return true;
  })()`, maxMs);
}

async function waitStableExpression(cdp, expression, { maxMs = 15000, stableMs = 1200 } = {}) {
  const started = Date.now();
  let stableSince = null;
  let stableValue = null;
  while (Date.now() - started < maxMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw evaluationError(result.exceptionDetails, expression);
    const value = result.result?.value;
    if (value) {
      if (stableSince === null) stableSince = Date.now();
      stableValue = value;
      if (Date.now() - stableSince >= stableMs) return stableValue;
    } else {
      stableSince = null;
      stableValue = null;
    }
    await timeout(120);
  }
  throw new Error(`Browser condition did not remain stable for ${stableMs} ms: ${expression}`);
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
  const browserConsoleErrors = [];
  if (!cdp.events.has('Runtime.exceptionThrown')) cdp.events.set('Runtime.exceptionThrown', new Set());
  cdp.events.get('Runtime.exceptionThrown').add(params => browserErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'runtime exception'));
  if (!cdp.events.has('Runtime.consoleAPICalled')) cdp.events.set('Runtime.consoleAPICalled', new Set());
  cdp.events.get('Runtime.consoleAPICalled').add(params => {
    if (params.type === 'error') browserConsoleErrors.push((params.args || []).map(arg => arg.value || arg.description || '').join(' '));
  });

  // Step 1 acceptance starts from a deliberately stale pre-V1 browser state.
  await cdp.send('Page.navigate', { url: `${origin}/__seed` });
  await waitExpression(cdp, `location.pathname === '/__seed' && document.readyState === 'complete'`);
  const seeded = await evaluate(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    await repositories.setMeta('preV1DataEpoch', 'legacy-rc-epoch');
    await repositories.setMeta('activeCatalogVersion', '0.3.0-dev');
    await repositories.put('ingredientRevisions', { ingredientRevisionId:'ingrev_salmon_raw_v2', ingredientId:'ing_salmon', origin:'base', contentHash:'legacy-browser-hash' });
    localStorage.setItem('ydm:legacy-pre-v1', '1');
    const cache = await caches.open('ydm-data-v12-root');
    await cache.put('/data/legacy-pre-v1.json', new Response('{}', { headers:{ 'content-type':'application/json' } }));
    return true;
  })()`);
  if (!seeded) throw new Error('Unable to seed stale pre-V1 browser state');

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

  const recipeCatalogState = await waitStableExpression(cdp, `(() => {
    const heading = document.querySelector('.results-heading strong')?.textContent || '';
    const recipeCards = document.querySelectorAll('.recipe-card').length;
    const catalogComplete = !!document.querySelector('.catalog-panel .status-dot--complete');
    const recipeCount = Number.parseInt(heading.trim(), 10);
    return catalogComplete && recipeCount === ${expectedRecipeCount} && recipeCards > 0 ? { heading, recipeCards, recipeCount } : null;
  })()`, { maxMs: 15000, stableMs: 1200 });
  if (recipeCatalogState.recipeCount !== expectedRecipeCount) throw new Error(`Planner catalog expected ${expectedRecipeCount} recipes, got state: ${JSON.stringify(recipeCatalogState)}`);

  const resetState = await evaluate(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const { PRE_V1_DATA_EPOCH } = await import('/src/db/constants.js');
    const oldRevision = await repositories.get('ingredientRevisions', 'ingrev_salmon_raw_v2');
    const epoch = await repositories.getMeta('preV1DataEpoch');
    const activeCatalogVersion = await repositories.getMeta('activeCatalogVersion');
    const cacheNames = await caches.keys();
    return { epoch, expectedEpoch:PRE_V1_DATA_EPOCH, oldRevision:oldRevision || null, activeCatalogVersion, legacyLocalStorage:localStorage.getItem('ydm:legacy-pre-v1'), legacyCache:cacheNames.includes('ydm-data-v12-root') };
  })()`);
  if (resetState.epoch !== resetState.expectedEpoch || resetState.oldRevision || resetState.legacyLocalStorage || resetState.legacyCache || resetState.activeCatalogVersion !== expectedCatalogVersion) {
    throw new Error(`Pre-V1 destructive reset regression: ${JSON.stringify(resetState)}`);
  }

  // Critical regression: clicking a recipe card must open catalog detail, not fall through to Today/Create plan.
  await waitExpression(cdp, `(() => {
    const card = document.querySelector('.recipe-card');
    if (!card) return false;
    card.click();
    return true;
  })()`);
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

  // Phase D3-D4 acceptance: taxonomy facets must operate on the real catalog.
  await cdp.send('Page.navigate', { url: `${origin}/configure/ingredients?food=product_category_dairy` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid=\"product-food-picker\"]') && document.querySelectorAll('.ingredient-card').length === 19`, 20000);
  const dairyFacetCount = await evaluate(cdp, `document.querySelectorAll('.ingredient-catalog-list .ingredient-card').length`);
  if (dairyFacetCount !== 19) throw new Error(`Phase D4 Dairy ingredient facet regression: ${dairyFacetCount}`);
  await cdp.send('Page.navigate', { url: `${origin}/recipes?food=product_concept_noodles` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid=\"product-food-picker\"]') && document.querySelectorAll('.recipe-card').length > 0`, 30000);
  const noodleFacetCount = await waitExpression(cdp, `(() => {
    const text = document.querySelector('.catalog-results .results-heading strong')?.textContent || '';
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : 0;
  })()`, 30000);
  if (noodleFacetCount !== 327) throw new Error(`Phase D4 Noodles recipe facet regression: ${noodleFacetCount}`);

  // Phase C acceptance: the manual planner lab must run a non-persistent 7-day diagnostic case in real Chromium.
  await cdp.send('Page.navigate', { url: `${origin}/manual-acceptance` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="manual-acceptance-page"]') && !!document.querySelector('[data-testid="manual-acceptance-summary"]')`, 20000);
  const phaseEManualAcceptance = await evaluate(cdp, `({ cases: document.querySelectorAll('[data-testid^="manual-acceptance-case-"]').length, eligibility: document.querySelector('[data-testid="manual-acceptance-eligibility"]')?.textContent || '' })`);
  if (Number(phaseEManualAcceptance.cases) !== 18) throw new Error(`Phase E manual acceptance expected 18 cases, got ${phaseEManualAcceptance.cases}`);

  await cdp.send('Page.navigate', { url: `${origin}/planner-validation` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="planner-validation-controls"]') && !!document.querySelector('[data-testid="planner-validation-run"]')`, 20000);
  await evaluate(cdp, `document.querySelector('[data-testid="planner-validation-run"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="planner-validation-result"]')`, 60000);
  const phaseCManualLab = await evaluate(cdp, `({
    failure: document.querySelector('[data-testid="planner-validation-failure"]')?.textContent || '',
    resultStatus: document.querySelector('[data-testid="planner-validation-result"] .section-heading .status-chip')?.textContent || '',
    dayCount: document.querySelectorAll('[data-testid="planner-validation-result"] .validation-day-card').length,
    hardFailures: [...document.querySelectorAll('[data-testid="planner-validation-result"] .validation-day-card .status-chip')].filter(node => /HARD FAIL/i.test(node.textContent || '')).length
  })`);
  if (phaseCManualLab.failure || phaseCManualLab.resultStatus !== 'SUCCESS' || phaseCManualLab.dayCount !== 7 || phaseCManualLab.hardFailures) throw new Error(`Phase C manual planner lab regression: ${JSON.stringify(phaseCManualLab)}`);

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

  // V1 Step 2 vertical product acceptance: real UI over real IndexedDB/catalog.
  await cdp.send('Page.navigate', { url: `${origin}/` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="plan-create"] [data-testid="plan-generate"]')`, 30000);
  await evaluate(cdp, `(() => {
    const days = document.querySelector('[data-testid="plan-days"]');
    const seed = document.querySelector('[data-testid="plan-seed"]');
    days.value = '7'; days.dispatchEvent(new Event('input', { bubbles:true }));
    seed.value = 'v1-step2-browser'; seed.dispatchEvent(new Event('input', { bubbles:true }));
    document.querySelector('[data-testid="plan-generate"]').click();
    return true;
  })()`);
  await waitExpression(cdp, `document.querySelectorAll('[data-testid="plan-generation-preview"] .plan-preview-day').length === 7 && !!document.querySelector('[data-testid="plan-confirm"]')`, 30000);
  await evaluate(cdp, `document.querySelector('[data-testid="plan-confirm"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="plan-manage-today"]') && document.querySelectorAll('[data-testid="plan-meal-card"]').length === 4`, 30000);
  const planCreated = await evaluate(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const planId = await repositories.getMeta('activePlanInstanceId');
    const plan = await repositories.get('planInstances', planId);
    const days = await repositories.getAllByIndex('calendarDays', 'planInstanceId', {kind:'only', value:planId});
    return {planId, startDate:plan?.startDate, endDate:plan?.endDate, dayCount:days.length};
  })()`);
  if (!planCreated.planId || planCreated.dayCount !== 7) throw new Error(`Step2 plan creation regression: ${JSON.stringify(planCreated)}`);

  // Phase D5 acceptance: Day -> Recipe -> exact IngredientRevision -> Recipe -> exact Day slot.
  const planRecipeHref = await evaluate(cdp, `document.querySelector('[data-testid=\"plan-recipe-link\"]')?.getAttribute('href') || ''`);
  const decodedPlanRecipeHref = decodeURIComponent(planRecipeHref);
  if (!planRecipeHref.includes('return=') || !decodedPlanRecipeHref.includes('/calendar/day?date=') || !decodedPlanRecipeHref.includes('#meal-')) throw new Error(`Phase D5 plan recipe context regression: ${planRecipeHref}`);
  await clickWhenReady(cdp, '[data-testid=\"plan-recipe-link\"]', 20000);
  await waitExpression(cdp, `location.pathname.startsWith('/recipes/') && !!document.querySelector('[data-testid=\"recipe-detail\"] [data-testid=\"recipe-ingredient-link\"]')`, 20000);
  const planRecipePath = await evaluate(cdp, `location.pathname`);
  if (planRecipePath === '/recipes/' || planRecipePath === '/recipes') throw new Error(`Plan recipe route regression: ${planRecipePath}`);
  const recipeContext = await evaluate(cdp, `({ back: document.querySelector('[data-testid=\"context-back\"]')?.getAttribute('href') || '', ingredient: document.querySelector('[data-testid=\"recipe-ingredient-link\"]')?.getAttribute('href') || '' })`);
  if (!recipeContext.back.includes('/calendar/day?date=') || !recipeContext.back.includes('#meal-') || !recipeContext.ingredient.includes('revision=') || !recipeContext.ingredient.includes('return=')) throw new Error(`Phase D5 recipe context regression: ${JSON.stringify(recipeContext)}`);
  await clickWhenReady(cdp, '[data-testid=\"recipe-ingredient-link\"]', 20000);
  await waitExpression(cdp, `location.pathname.startsWith('/configure/ingredients/') && !!document.querySelector('[data-testid=\"ingredient-detail\"] [data-testid=\"context-back\"]')`, 20000);
  await clickWhenReady(cdp, '[data-testid=\"context-back\"]', 20000);
  await waitExpression(cdp, `location.pathname.startsWith('/recipes/') && !!document.querySelector('[data-testid=\"recipe-detail\"] [data-testid=\"context-back\"]')`, 20000);
  await clickWhenReady(cdp, '[data-testid=\"context-back\"]', 20000);
  await waitExpression(cdp, `location.pathname === '/calendar/day' && location.hash.startsWith('#meal-') && !!document.querySelector(location.hash + '.context-return-target')`, 20000);
  await cdp.send('Page.navigate', { url: `${origin}/` });

  // Manage day -> replace -> adherence -> rebalance. The today page body is rendered
  // asynchronously and may replace the DOM between a separate wait and click. Query
  // and click atomically inside the retry loop so CI cannot race that re-render.
  await clickWhenReady(cdp, '[data-testid="plan-manage-today"]', 20000);
  await waitExpression(cdp, `location.pathname === '/calendar/day' && !!document.querySelector('[data-testid="plan-replace"]')`, 20000);
  const originalOccurrence = await evaluate(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const date = new URLSearchParams(location.search).get('date');
    const rows = await repositories.getAllByIndex('calendarDays', 'date', {kind:'only', value:date});
    const day = rows.find(Boolean); const slot = day.mealSlots.find(item => item.mode === 'planned');
    return {calendarDayId:day.calendarDayId, occurrenceId:slot.mealOccurrenceId, recipeVersionId:slot.recipeComponents[0].recipeVersionId};
  })()`);
  await evaluate(cdp, `document.querySelector('[data-testid="plan-replace"]').click(); true`);
  await waitExpression(cdp, `document.querySelectorAll('[data-testid="replacement-preview"] [data-testid="replacement-confirm"]').length > 0`, 20000);
  await evaluate(cdp, `document.querySelector('[data-testid="replacement-confirm"]').click(); true`);
  const replaced = await waitExpression(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const day = await repositories.get('calendarDays', '${originalOccurrence.calendarDayId}');
    const slot = day?.mealSlots?.find(item => item.mealOccurrenceId === '${originalOccurrence.occurrenceId}');
    const id = slot?.recipeComponents?.[0]?.recipeVersionId;
    return id && id !== '${originalOccurrence.recipeVersionId}' ? id : '';
  })()`, 20000);

  await waitExpression(cdp, `!!document.querySelector('[data-testid="adherence-editor"] [data-testid="adherence-status"]')`);
  await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="adherence-editor"] [data-testid="adherence-status"]');
    select.value = 'followed'; select.dispatchEvent(new Event('change', { bubbles:true }));
    document.querySelector('[data-testid="adherence-editor"] [data-testid="adherence-save"]').click();
    return true;
  })()`);
  await waitExpression(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const day = await repositories.get('calendarDays', '${originalOccurrence.calendarDayId}');
    return day?.mealSlots?.find(item => item.mealOccurrenceId === '${originalOccurrence.occurrenceId}')?.adherenceStatus === 'followed';
  })()`, 15000);

  await waitExpression(cdp, `!!document.querySelector('[data-testid="rebalance-day-preview"]')`);
  await evaluate(cdp, `document.querySelector('[data-testid="rebalance-day-preview"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="rebalance-preview-card"] [data-testid="rebalance-confirm"]')`, 20000);
  const regenerationSummary = await evaluate(cdp, `(() => { const node=document.querySelector('[data-testid="rebalance-summary"]'); return node ? { changed:Number(node.dataset.changed||0), unchanged:Number(node.dataset.unchanged||0), total:Number(node.dataset.total||0) } : null; })()`);
  if (!regenerationSummary || regenerationSummary.changed < 1 || regenerationSummary.total < 1) throw new Error(`Regeneration did not produce a visible alternative summary: ${JSON.stringify(regenerationSummary)}`);
  await evaluate(cdp, `document.querySelector('[data-testid="rebalance-confirm"]').click(); true`);
  await waitExpression(cdp, `!document.querySelector('[data-testid="rebalance-preview-card"]')`, 20000);

  // Undo + redo latest plan mutation through the visible history page.
  await cdp.send('Page.navigate', { url: `${origin}/history` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="plan-undo"]:not([disabled])')`);
  await evaluate(cdp, `document.querySelector('[data-testid="plan-undo"]:not([disabled])').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="plan-redo"]:not([disabled])')`);
  await evaluate(cdp, `document.querySelector('[data-testid="plan-redo"]:not([disabled])').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="plan-undo"]:not([disabled])')`);

  // Shopping derives from the effective plan, checklist state persists across a full reload.
  await cdp.send('Page.navigate', { url: `${origin}/shopping` });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="shopping-page"]') && document.querySelectorAll('[data-testid="shopping-calculated"] .shopping-item').length > 0`, 30000);
  await evaluate(cdp, `document.querySelector('[data-testid="shopping-calculate"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="shopping-save-checklist"]:not([disabled])')`);
  await evaluate(cdp, `document.querySelector('[data-testid="shopping-save-checklist"]').click(); true`);
  await waitExpression(cdp, `!!document.querySelector('[data-testid="shopping-checklist"] [data-testid="shopping-check-item"]')`, 20000);
  await evaluate(cdp, `document.querySelector('[data-testid="shopping-check-item"]').click(); true`);
  const persistedBeforeReload = await waitExpression(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const rows = await repositories.getAll('shoppingChecklists');
    const checklist = rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const item = checklist?.items?.find(row => row.checked);
    return checklist && item ? {checklistId:checklist.checklistId, itemId:item.itemId, planId:checklist.planInstanceId} : null;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitExpression(cdp, `!!document.querySelector('[data-testid="shopping-checklist"] [data-testid="shopping-check-item"]')`, 30000);
  const persistedAfterReload = await evaluate(cdp, `(async () => {
    const { repositories } = await import('/src/repositories/repositoryHub.js');
    const checklist = await repositories.get('shoppingChecklists', '${persistedBeforeReload.checklistId}');
    const activePlanId = await repositories.getMeta('activePlanInstanceId');
    return {activePlanId, checked:checklist?.items?.some(item => item.itemId === '${persistedBeforeReload.itemId}' && item.checked) || false};
  })()`);
  if (!persistedAfterReload.checked || persistedAfterReload.activePlanId !== persistedBeforeReload.planId) throw new Error(`Step2 reload persistence regression: ${JSON.stringify({persistedBeforeReload,persistedAfterReload})}`);
  if (browserErrors.length || browserConsoleErrors.length) throw new Error(`Step2 browser errors: ${[...browserErrors, ...browserConsoleErrors].join(' | ')}`);

  const step2 = {
    planCreated,
    planRecipePath,
    replacementChangedRecipe: Boolean(replaced),
    adherenceSaved: true,
    rebalanceCommitted: true,
    undoRedo: true,
    shoppingChecklistPersisted: persistedAfterReload.checked,
    reloadPreservedPlan: persistedAfterReload.activePlanId === persistedBeforeReload.planId,
    runtimeErrors: 0
  };

  const acceptance = {
    formSchemaParity: formParity,
    disclosureKey,
    disclosurePreserved: Boolean(disclosureState?.open),
    invalidDraftBlocked: Boolean(disclosureState?.invalidBlocked),
    dirtyNavigationGuarded: true,
    saveFeedbackVisible: true,
    phaseCManualLab,
    step2
  };
  console.log(`Browser regression PASS: recipe=${recipeState.path}, ingredient=${ingredientState.path}, passE=accepted, phaseC=accepted, step2=accepted`);
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
