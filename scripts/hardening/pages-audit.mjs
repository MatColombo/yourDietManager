import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const rawBase = process.argv[3] || '';
const base = !rawBase || rawBase === '/' ? '' : `/${String(rawBase).replace(/^\/+|\/+$/g, '')}`;
const failures = [];

async function mustFile(relative) {
  try { if (!(await stat(path.join(dist, relative))).isFile()) failures.push(`${relative}: not a file`); }
  catch { failures.push(`${relative}: missing`); }
}

for (const file of ['index.html', '404.html', '.nojekyll', 'manifest.webmanifest', 'service-worker.js', 'src/lib/appBase.js', 'src/main.js']) await mustFile(file);

const [index, fallback, manifestRaw, sw, configurationBootstrap] = await Promise.all([
  readFile(path.join(dist, 'index.html'), 'utf8'),
  readFile(path.join(dist, '404.html'), 'utf8'),
  readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'),
  readFile(path.join(dist, 'service-worker.js'), 'utf8'),
  readFile(path.join(dist, 'src/services/configurationBootstrap.js'), 'utf8')
]);
const manifest = JSON.parse(manifestRaw);

if (/src="\//.test(index)) failures.push('index.html contains a root-absolute script source');
for (const match of index.matchAll(/<(?:link|a)\b[^>]*href="\/[^"]*/g)) failures.push(`index.html contains root-absolute href: ${match[0]}`);
const expectedBaseHref = `${base || ''}/`;
if (!index.includes(`<base href="${expectedBaseHref}" />`)) failures.push(`index.html base href mismatch: expected ${expectedBaseHref}`);
if (manifest.start_url !== './') failures.push(`manifest start_url must be ./, got ${manifest.start_url}`);
if (manifest.scope !== './') failures.push(`manifest scope must be ./, got ${manifest.scope}`);
if (!fallback.includes(`var base = ${JSON.stringify(base)};`)) failures.push(`404.html base path mismatch: expected ${base || '/'}`);
if (!fallback.includes('__ydm_route')) failures.push('404.html does not preserve SPA route');
if (!sw.includes("const BASE_URL = new URL('./', self.location.href);")) failures.push('service worker does not derive its deployment base dynamically');
if (/['"]\/data\//.test(sw) || /['"]\/schemas\//.test(sw)) failures.push('service worker still contains root-absolute data/schema paths');
if (/fetcher\(['"]\/data\/bootstrap\//.test(configurationBootstrap)) failures.push('configuration bootstrap still contains a root-absolute fetch');
if (!configurationBootstrap.includes("assetPath('/data/bootstrap/default-configuration.json')")) failures.push('configuration bootstrap does not resolve through assetPath');

if (failures.length) {
  console.error('GitHub Pages artifact audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`GitHub Pages artifact audit passed for ${base || '/'} (${dist}).`);
