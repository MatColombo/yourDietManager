import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const [app, css, index, dom, itRaw, enRaw] = await Promise.all([
  read('src/ui/app.js'), read('src/styles.css'), read('index.html'), read('src/ui/dom.js'),
  read('public/data/locales/it.json'), read('public/data/locales/en.json')
]);
const it = JSON.parse(itRaw); const en = JSON.parse(enRaw);
const srcFiles = ['src/ui/app.js','src/ui/catalogPages.js','src/ui/configurationPages.js','src/ui/planPages.js','src/ui/shoppingPages.js','src/ui/dom.js'];
const srcText = (await Promise.all(srcFiles.map(read))).join('\n');
const checks = [
  ['html-lang', /<html lang="it">/.test(index)],
  ['skip-link', app.includes('skip-link') && app.includes("href: '#main-content'")],
  ['main-landmark', app.includes("id: 'main-content'")],
  ['route-focus', app.includes("heading.focus({ preventScroll: true })")],
  ['aria-current', app.includes("'aria-current': active ? 'page' : null")],
  ['navigation-label-i18n', app.includes("state.i18n.t('a11y.mainNavigation')")],
  ['progress-label', app.includes("a11y.catalogProgress")],
  ['focus-visible', css.includes(':focus-visible')],
  ['reduced-motion', css.includes('prefers-reduced-motion: reduce')],
  ['forced-colors', css.includes('forced-colors: active')],
  ['touch-target', /min-height:\s*44px/.test(css)],
  ['no-inner-html', !/\.innerHTML\s*=/.test(srcText)],
  ['safe-dom-text', dom.includes('node.textContent = value')],
  ['locale-parity', Object.keys(it).length === Object.keys(en).length && Object.keys(it).every(key => key in en)],
  ['a11y-keys-it', ['a11y.skipToContent','a11y.mainNavigation','a11y.catalogProgress'].every(key => key in it)],
  ['a11y-keys-en', ['a11y.skipToContent','a11y.mainNavigation','a11y.catalogProgress'].every(key => key in en)]
].map(([id, pass]) => ({ id, pass }));
const failures = checks.filter(item => !item.pass);
const report = { version: 1, generatedAt: new Date().toISOString(), checks, pass: failures.length === 0, failures: failures.map(item => item.id) };
await writeFile(path.join(root, 'reports/phase8-accessibility.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Accessibility source audit: ${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length) {
  console.error(`Failed: ${failures.map(item => item.id).join(', ')}`);
  process.exitCode = 1;
}
