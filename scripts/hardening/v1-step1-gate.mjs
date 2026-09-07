import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { APP_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';
import { validateCatalogReferences } from '../../src/services/catalogDataSource.js';

const root = process.cwd();
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const catalog = await loadLocalCatalog(path.join(root, 'public/data'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const failures = [];
const checks = [];
const check = (id, pass, detail) => { const row = { id, pass:Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); };

try { validateCatalogReferences({ ...catalog, packs:catalog.manifest.packs }, registry); check('catalog-references', true, 'all family/version/revision and semantic references resolve'); }
catch (error) { check('catalog-references', false, error.message); }

const activeIngredients = catalog.ingredientFamilies.filter(item => item.status === 'active');
const activeRecipes = catalog.recipeFamilies.filter(item => item.status === 'active');
const revisionIds = new Set(catalog.ingredientRevisions.map(item => item.ingredientRevisionId));
const reachableRevisionIds = new Set(activeIngredients.map(item => item.currentRevisionId));
for (const version of catalog.recipeVersions) for (const line of version.ingredientLines || []) reachableRevisionIds.add(line.ingredientRevisionId);
const orphanRevisionIds = [...revisionIds].filter(id => !reachableRevisionIds.has(id));
const currentVersionIds = new Set(activeRecipes.map(item => item.currentVersionId));
const core = catalog.manifest.packs.find(pack => pack.packId === 'core');
const coreIds = new Set(core?.recipeVersionIds || []);
const optionalPackLeaks = catalog.manifest.packs.filter(pack => !pack.required).flatMap(pack => (pack.recipeVersionIds || []).filter(id => !coreIds.has(id)).map(id => `${pack.packId}:${id}`));

check('app-version-sync', pkg.version === APP_VERSION, `package=${pkg.version}, runtime=${APP_VERSION}`);
check('pre-v1-epoch-defined', /^v1-(?:candidate|freeze)-epoch-\d+$/.test(PRE_V1_DATA_EPOCH), PRE_V1_DATA_EPOCH);
check('ingredient-families', activeIngredients.length === 600 && catalog.ingredientFamilies.length === 600, `active=${activeIngredients.length}, total=${catalog.ingredientFamilies.length}`);
check('ingredient-revisions', catalog.ingredientRevisions.length === 600, `count=${catalog.ingredientRevisions.length}`);
check('no-orphan-revisions', orphanRevisionIds.length === 0, orphanRevisionIds.join(', ') || 'none');
check('recipe-families', activeRecipes.length === 500 && catalog.recipeFamilies.length === 500, `active=${activeRecipes.length}, total=${catalog.recipeFamilies.length}`);
check('recipe-versions', catalog.recipeVersions.length === 500, `count=${catalog.recipeVersions.length}`);
check('core-required', core?.required === true, `required=${core?.required}`);
check('core-is-full-corpus', coreIds.size === 500 && currentVersionIds.size === 500 && [...currentVersionIds].every(id => coreIds.has(id)), `core=${coreIds.size}, current=${currentVersionIds.size}`);
check('optional-packs-are-subsets', optionalPackLeaks.length === 0, optionalPackLeaks.slice(0, 10).join(', ') || 'all optional pack IDs are in core');
check('human-review-not-blocking', catalog.manifest.publication?.requiredHumanReview === false && catalog.manifest.publication?.releaseEligible === true, `channel=${catalog.manifest.publication?.channel}, required=${catalog.manifest.publication?.requiredHumanReview}, releaseEligible=${catalog.manifest.publication?.releaseEligible}`);
check('catalog-v1-line', /^1\.0\.(?:0|1)(?:-|$)/.test(catalog.manifest.catalogVersion), catalog.manifest.catalogVersion);
check('legacy-fixtures-retired', !['ingrev_salmon_raw_v2','ingrev_rice_cooked_v2','ingrev_zucchini_raw_v2','ingrev_olive_oil_v2'].some(id => revisionIds.has(id)), 'legacy v2 fixture revisions absent');

const report = { version:1, generatedAt:new Date().toISOString(), step:'V1 Step 1 - Pre-V1 Reset + Data/Catalog Closure', passed:failures.length===0, checks, failures };
await mkdir(path.join(root, 'reports'), { recursive:true });
await writeFile(path.join(root, 'reports/v1-step1-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 Step 1 gate: ${report.passed ? 'PASS' : 'FAIL'} (${checks.length - failures.length}/${checks.length})`);
for (const failure of failures) console.log(`- ${failure.id}: ${failure.detail}`);
if (!report.passed) process.exitCode = 1;
