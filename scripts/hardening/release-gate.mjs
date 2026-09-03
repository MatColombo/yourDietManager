import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../../src/db/constants.js';

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'public/data/catalog-manifest.json'), 'utf8'));
const ingredientFiles = manifest.ingredientRevisions.shards.map(shard => path.join(root, 'public/data', shard.path));
const ingredientRevisions = (await Promise.all(ingredientFiles.map(async file => JSON.parse(await readFile(file, 'utf8'))))).flat();
const blockers = [];
const checks = [];
const check = (id, pass, detail, blocker = true) => { checks.push({ id, pass, detail }); if (!pass && blocker) blockers.push({ id, detail }); };

check('app-version-sync', pkg.version === APP_VERSION, `package=${pkg.version}, runtime=${APP_VERSION}`);
check('recipe-corpus-minimum', manifest.recipeVersions.count >= 3000, `recipeVersions=${manifest.recipeVersions.count}, required>=3000`);
check('production-pipeline', !/fixture|smoke|dev/i.test(manifest.pipelineVersion || ''), `pipelineVersion=${manifest.pipelineVersion}`);
const uncurated = ingredientRevisions.filter(record => record.origin === 'base' && (record.quality?.status !== 'curated' || record.quality?.confidence !== 'high'));
check('curated-high-confidence-ingredients', uncurated.length === 0, `uncuratedBaseIngredientRevisions=${uncurated.length}`);
check('catalog-not-dev-version', !/-dev\b/i.test(manifest.catalogVersion), `catalogVersion=${manifest.catalogVersion}`);

const report = { version: 1, generatedAt: new Date().toISOString(), candidateAppVersion: APP_VERSION, catalogVersion: manifest.catalogVersion, checks, releasable: blockers.length === 0, blockers };
await writeFile(path.join(root, 'reports/v1-release-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 release gate: ${report.releasable ? 'PASS' : 'BLOCKED'} (${checks.length - blockers.length}/${checks.length} blocking checks pass)`);
for (const blocker of blockers) console.log(`- ${blocker.id}: ${blocker.detail}`);
if (!report.releasable) process.exitCode = 2;
