import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';

const root = process.cwd();
const readJson = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const [pkg, manifest, evidence, freeze] = await Promise.all([
  readJson('package.json'),
  readJson('public/data/catalog-manifest.json'),
  readJson('corpus/production/v1-release/release-candidate-evidence.json'),
  readJson('corpus/production/v1-release/freeze-contract.json')
]);

const checks = [];
const blockers = [];
const check = (id, pass, detail) => {
  const row = { id, pass: Boolean(pass), detail };
  checks.push(row);
  if (!row.pass) blockers.push(row);
};
const quality = evidence.quality || {};

check('stable-app-version', pkg.version === APP_VERSION && APP_VERSION === '1.0.0', `package=${pkg.version}, runtime=${APP_VERSION}`);
check('catalog-version', manifest.catalogVersion === '1.0.0' && evidence.catalogVersion === '1.0.0', `manifest=${manifest.catalogVersion}, evidence=${evidence.catalogVersion}`);
check('manual-acceptance', evidence.manualAcceptanceStatus === 'accepted' && freeze.manualAcceptance?.status === 'accepted' && freeze.manualAcceptance?.stablePromotionAllowed === true, `evidence=${evidence.manualAcceptanceStatus}, contract=${freeze.manualAcceptance?.status}`);
check('freeze-boundary-preserved', PRE_V1_DATA_EPOCH === 'v1-freeze-epoch-1' && freeze.persistence?.preV1DataEpoch === PRE_V1_DATA_EPOCH, PRE_V1_DATA_EPOCH);
check('schema-contract-preserved', DB_VERSION === 5 && CONTENT_SCHEMA_VERSION === 3 && BACKUP_FORMAT_VERSION === 1 && freeze.persistence?.dbVersion === DB_VERSION && freeze.persistence?.contentSchemaVersion === CONTENT_SCHEMA_VERSION && freeze.persistence?.backupFormatVersion === BACKUP_FORMAT_VERSION, `db=${DB_VERSION}, content=${CONTENT_SCHEMA_VERSION}, backup=${BACKUP_FORMAT_VERSION}`);
check('publication-release-eligible', manifest.publication?.channel === 'production_release' && manifest.publication?.releaseEligible === true && manifest.publication?.requiredHumanReview === false, `channel=${manifest.publication?.channel}, eligible=${manifest.publication?.releaseEligible}`);
check('data-contract', manifest.ingredientFamilies?.count === 600 && manifest.ingredientRevisions?.count === 600 && manifest.recipeFamilies?.count === 500 && manifest.recipeVersions?.count === 500, `ingredients=${manifest.ingredientFamilies?.count}/${manifest.ingredientRevisions?.count}, recipes=${manifest.recipeFamilies?.count}/${manifest.recipeVersions?.count}`);
check('quality-gate', ['schemaErrors','unknownIngredientReferences','nutritionErrors','allergenDerivationErrors','missingRequiredLocaleFields','exactDuplicateCount','nearDuplicateCount'].every(key => Number(quality[key] || 0) === 0) && quality.stratifiedReviewStatus === 'passed' && quality.stratifiedReviewSampleSize === 60, JSON.stringify(quality));
check('frozen-corpus-digest', Boolean(evidence.recipeDigest) && evidence.recipeDigest === freeze.recipeDigest, `evidence=${evidence.recipeDigest || 'missing'}, contract=${freeze.recipeDigest || 'missing'}`);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  candidateAppVersion: APP_VERSION,
  catalogVersion: manifest.catalogVersion,
  releasable: blockers.length === 0,
  checks,
  blockers
};
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-release-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 stable release gate: ${report.releasable ? 'PASS' : 'BLOCKED'} (${checks.length - blockers.length}/${checks.length})`);
for (const blocker of blockers) console.log(`- ${blocker.id}: ${blocker.detail}`);
if (!report.releasable) process.exitCode = 2;
