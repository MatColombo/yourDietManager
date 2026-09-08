import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';

const root = process.cwd();
const readText = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await readText(file));
const [pkg, catalog, eligibility, buildEvidence, review, releaseEvidence, freeze, it, en, worker, offline, localData, appUi, pagesWorkflow, candidateWorkflow] = await Promise.all([
  readJson('package.json'),
  loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/v1-release/recipe-eligibility.json'),
  readJson('corpus/production/v1-release/build-evidence.json'),
  readJson('corpus/production/v1-release/stratified-review.json'),
  readJson('corpus/production/v1-release/release-candidate-evidence.json'),
  readJson('corpus/production/v1-release/freeze-contract.json'),
  readJson('public/data/locales/it.json'), readJson('public/data/locales/en.json'),
  readText('public/service-worker.js'), readText('src/services/offlineCatalog.js'),
  readText('src/services/localDataService.js'), readText('src/ui/app.js'),
  readText('.github/workflows/pages.yml'), readText('.github/workflows/v1-release-candidate.yml')
]);

const checks = [];
const failures = [];
const check = (id, pass, detail) => {
  const row = { id, pass: Boolean(pass), detail };
  checks.push(row);
  if (!row.pass) failures.push(row);
};

const activeIngredients = catalog.ingredientFamilies.filter(item => item.status === 'active');
const activeRecipes = catalog.recipeFamilies.filter(item => item.status === 'active');
const currentRecipeIds = new Set(activeRecipes.map(item => item.currentVersionId));
const currentIngredientIds = new Set(activeIngredients.map(item => item.currentRevisionId));
const core = catalog.manifest.packs.find(pack => pack.packId === 'core');
const roleEntries = Object.entries(eligibility.roles || {});
const allowedIngredientIds = new Set(roleEntries.flatMap(([, role]) => role.ingredientIds || []));
const roleByIngredient = new Map();
for (const [roleId, role] of roleEntries) {
  for (const ingredientId of role.ingredientIds || []) {
    if (!roleByIngredient.has(ingredientId)) roleByIngredient.set(ingredientId, []);
    roleByIngredient.get(ingredientId).push({ roleId, max: Number(role.portionG?.max || eligibility.releaseRules?.maxIngredientAmountG || 300) });
  }
}
const ingredientByRevision = new Map(catalog.ingredientRevisions.map(item => [item.ingredientRevisionId, item]));
const recipeLineIssues = [];
for (const recipe of catalog.recipeVersions) {
  for (const line of recipe.ingredientLines || []) {
    const ingredientId = line.ingredientId || ingredientByRevision.get(line.ingredientRevisionId)?.ingredientId;
    const roles = roleByIngredient.get(ingredientId) || [];
    const maxForIngredient = Math.max(0, ...roles.map(item => item.max));
    if (!allowedIngredientIds.has(ingredientId)) recipeLineIssues.push(`${recipe.recipeVersionId}:${ingredientId}:not-eligible`);
    if (line.unit === 'g' && (Number(line.amount) > Number(eligibility.releaseRules?.maxIngredientAmountG || 300) || Number(line.amount) > maxForIngredient)) {
      recipeLineIssues.push(`${recipe.recipeVersionId}:${ingredientId}:${line.amount}g>max${maxForIngredient}`);
    }
  }
}
const localeKeysIt = Object.keys(it).sort();
const localeKeysEn = Object.keys(en).sort();
const localeParity = localeKeysIt.length === localeKeysEn.length && localeKeysIt.every((key, index) => key === localeKeysEn[index]);
const quality = releaseEvidence.quality || {};
const publication = catalog.manifest.publication || {};

check('candidate-app-version', pkg.version === APP_VERSION && APP_VERSION === '1.0.0-rc.27', `package=${pkg.version}, runtime=${APP_VERSION}`);
check('catalog-frozen-1.0.0', catalog.manifest.catalogVersion === '1.0.0' && releaseEvidence.catalogVersion === '1.0.0', `manifest=${catalog.manifest.catalogVersion}, evidence=${releaseEvidence.catalogVersion}`);
check('persistence-freeze', DB_VERSION === 5 && CONTENT_SCHEMA_VERSION === 3 && BACKUP_FORMAT_VERSION === 1 && PRE_V1_DATA_EPOCH === 'v1-freeze-epoch-1', `db=${DB_VERSION}, content=${CONTENT_SCHEMA_VERSION}, backup=${BACKUP_FORMAT_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('freeze-contract-sync', freeze.appCandidateVersion === APP_VERSION && freeze.catalogVersion === '1.0.0' && freeze.persistence?.dbVersion === DB_VERSION && freeze.persistence?.contentSchemaVersion === CONTENT_SCHEMA_VERSION && freeze.persistence?.backupFormatVersion === BACKUP_FORMAT_VERSION && freeze.persistence?.preV1DataEpoch === PRE_V1_DATA_EPOCH, `${freeze.contractId}@${freeze.contractVersion}`);
check('manual-acceptance-pending', freeze.manualAcceptance?.required === true && freeze.manualAcceptance?.status === 'pending' && freeze.manualAcceptance?.stablePromotionAllowed === false && releaseEvidence.manualAcceptanceStatus === 'pending', 'stable promotion remains blocked until final manual test');
check('production-release-publication', publication.channel === 'production_release' && publication.releaseEligible === true && publication.requiredHumanReview === false && publication.reviewRecipeCount === 60, `channel=${publication.channel}, eligible=${publication.releaseEligible}, review=${publication.reviewRecipeCount}`);
check('publication-evidence-sync', publication.publicationId === releaseEvidence.publication?.publicationId && publication.sourceCorpusDigest === releaseEvidence.publication?.sourceCorpusDigest && publication.sourceSnapshotId === releaseEvidence.publication?.sourceSnapshotId, publication.publicationId || 'missing');
check('corpus-contract-600-600-500-500', activeIngredients.length === 600 && catalog.ingredientRevisions.length === 600 && activeRecipes.length === 500 && catalog.recipeVersions.length === 500, `ingredients=${activeIngredients.length}/${catalog.ingredientRevisions.length}, recipes=${activeRecipes.length}/${catalog.recipeVersions.length}`);
check('current-pointers-complete', currentIngredientIds.size === 600 && currentRecipeIds.size === 500, `ingredientCurrent=${currentIngredientIds.size}, recipeCurrent=${currentRecipeIds.size}`);
check('core-pack-full', core?.required === true && core.recipeVersionIds?.length === 500 && currentRecipeIds.size === 500 && [...currentRecipeIds].every(id => core.recipeVersionIds.includes(id)), `core=${core?.recipeVersionIds?.length || 0}`);
check('explicit-culinary-eligibility', eligibility.releaseRules?.requireExplicitCulinaryRole === true && eligibility.releaseRules?.allowTaxonomyOnlyEligibility === false && allowedIngredientIds.size > 0, `roles=${roleEntries.length}, allowedIngredients=${allowedIngredientIds.size}`);
check('all-recipe-lines-eligible-and-bounded', recipeLineIssues.length === 0, recipeLineIssues.slice(0, 8).join(', ') || 'all lines resolve to explicit culinary roles and portion bounds');
check('release-quality-zero-blockers', ['schemaErrors','unknownIngredientReferences','nutritionErrors','allergenDerivationErrors','missingRequiredLocaleFields','exactDuplicateCount','nearDuplicateCount'].every(key => Number(quality[key] || 0) === 0), JSON.stringify(quality));
check('stratified-review-passed', review.automatedStatus === 'passed' && review.sampleSize === 60 && review.strata?.length === 12 && review.automatedIssues?.length === 0 && quality.stratifiedReviewStatus === 'passed', `status=${review.automatedStatus}, sample=${review.sampleSize}, strata=${review.strata?.length}, issues=${review.automatedIssues?.length}`);
check('recipe-digest-frozen', Boolean(buildEvidence.recipeDigest) && buildEvidence.recipeDigest === releaseEvidence.recipeDigest, releaseEvidence.recipeDigest || 'missing');
check('locale-key-parity', localeParity, `it=${localeKeysIt.length}, en=${localeKeysEn.length}`);
check('backup-delete-local-data', /repo\.resetAll\(\)/.test(localData) && /backup-delete-local-data/.test(appUi) && /deleteAllLocalData/.test(appUi), 'backup page exposes destructive local-data deletion backed by repository reset');
check('pwa-cache-parity', /ydm-shell-v30-/.test(worker) && /ydm-data-v15-/.test(worker) && /ydm-data-v15-/.test(offline), 'shell=v30, data=v15');
check('pages-browser-required', /YDM_BROWSER_REQUIRED:\s*'1'/.test(pagesWorkflow) && /npm run check/.test(pagesWorkflow), 'GitHub Pages deploy blocks on browser-required full check');
check('release-candidate-workflow', /corpus:build-v1-release/.test(candidateWorkflow) && /corpus:review-v1-release/.test(candidateWorkflow) && /catalog:publish-v1-release/.test(candidateWorkflow) && /git diff --exit-code/.test(candidateWorkflow) && /v1:step3-gate/.test(candidateWorkflow), 'manual workflow reproduces frozen corpus and verifies no generated drift');
check('legacy-corpus-writers-retired', ['production-review-500.yml','controlled-scale-500.yml','production-corpus.yml'].every(name => !existsSync(path.join(root, '.github/workflows', name))), 'pre-freeze corpus writer workflows are retired; Git history remains the archive');
check('candidate-not-stable-release', pkg.version !== '1.0.0' && releaseEvidence.status === 'release_candidate', `app=${pkg.version}, evidence=${releaseEvidence.status}`);

const report = {
  schemaVersion: 1,
  suite: 'v1-step3-release-candidate-freeze',
  checkedAt: new Date().toISOString(),
  status: failures.length ? 'failed' : 'passed',
  candidateAppVersion: APP_VERSION,
  catalogVersion: catalog.manifest.catalogVersion,
  checks,
  failures
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-step3-gate.json'), JSON.stringify(report, null, 2) + '\n');
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`);
if (failures.length) {
  console.error(`V1 Step 3 gate failed: ${failures.map(item => item.id).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`V1 Step 3 gate PASS (${checks.length}/${checks.length})`);
}
