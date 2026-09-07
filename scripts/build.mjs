import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SCHEMA_FILES } from '../src/lib/schemaValidator.js';

const root = process.cwd();
const dist = path.join(root, 'dist');

for (const file of SCHEMA_FILES) {
  const [canonical, published] = await Promise.all([
    readFile(path.join(root, 'schemas', file), 'utf8'),
    readFile(path.join(root, 'public', 'schemas', file), 'utf8')
  ]);
  if (canonical !== published) throw new Error(`Build failed: public schema mirror drift for ${file}`);
}

function normalizeBasePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

function pages404(basePath) {
  const base = JSON.stringify(normalizeBasePath(basePath));
  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>yourDietManager</title></head>
<body>
<script>
(function () {
  var base = ${base};
  var path = location.pathname;
  if (base && (path === base || path.indexOf(base + '/') === 0)) path = path.slice(base.length);
  if (!path || path.charAt(0) !== '/') path = '/' + (path || '');
  var route = path + location.search + location.hash;
  location.replace((base || '') + '/?__ydm_route=' + encodeURIComponent(route));
}());
</script>
<noscript>This application requires JavaScript.</noscript>
</body>
</html>`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const basePath = normalizeBasePath(process.env.YDM_BASE_PATH || '');
const baseHref = `${basePath || ''}/`;
const sourceIndex = await readFile(path.join(root, 'index.html'), 'utf8');
if (!sourceIndex.includes('<base href="/" />')) throw new Error('Build failed: index.html base placeholder is missing');
await writeFile(path.join(dist, 'index.html'), sourceIndex.replace('<base href="/" />', `<base href="${baseHref}" />`));
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await writeFile(path.join(dist, '404.html'), pages404(basePath));
await writeFile(path.join(dist, '.nojekyll'), '');
const info = await stat(path.join(dist, 'index.html'));
if (!info.isFile()) throw new Error('Build failed: dist/index.html missing');
console.log(`Built static PWA in dist/ for base path ${basePath || '/'}`);
