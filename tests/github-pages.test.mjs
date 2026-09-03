import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeBasePath, prefixAppPath, stripAppPath, cacheScopeKey } from '../src/lib/appBase.js';

const root = process.cwd();

test('GitHub Pages base path helpers support project sites and root sites', () => {
  assert.equal(normalizeBasePath('/yourDietManager/'), '/yourDietManager');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(prefixAppPath('/recipes?q=rice', '/yourDietManager'), '/yourDietManager/recipes?q=rice');
  assert.equal(prefixAppPath('/', '/yourDietManager'), '/yourDietManager/');
  assert.equal(prefixAppPath('/recipes', ''), '/recipes');
  assert.equal(stripAppPath('/yourDietManager/calendar/day', '/yourDietManager'), '/calendar/day');
  assert.equal(stripAppPath('/yourDietManager/', '/yourDietManager'), '/');
  assert.equal(cacheScopeKey('/yourDietManager'), 'yourDietManager');
});

test('GitHub Pages deployment sources avoid root-absolute entry assets and include Pages Actions workflow', async () => {
  const [index, manifestRaw, workflow, sw] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'public/manifest.webmanifest'), 'utf8'),
    readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8'),
    readFile(path.join(root, 'public/service-worker.js'), 'utf8')
  ]);
  const manifest = JSON.parse(manifestRaw);
  assert.match(index, /<base href="\/" \/>/);
  assert.doesNotMatch(index, /src="\//);
  assert.doesNotMatch(index, /<(?:link|a)\b[^>]*href="\//);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /steps\.pages\.outputs\.base_path/);
  assert.match(sw, /const BASE_URL = new URL\('\.\/'/);
  assert.doesNotMatch(sw, /['"]\/data\//);
  assert.doesNotMatch(sw, /['"]\/schemas\//);
});
