import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';
import { ACCEPT_V1_TOKEN, buildStableProjection, PROMOTION_ALLOWED_PATHS } from './v1-stable-promotion-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const valueOf = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const apply = args.includes('--apply');
const reportPath = valueOf('--report');
const decision = valueOf('--decision');
if (!reportPath) throw new Error('Usage: npm run v1:promote-stable -- --report <manual-acceptance-report.json> --decision "ACCEPT V1" [--apply]');
if (decision !== ACCEPT_V1_TOKEN) throw new Error(`Stable promotion requires --decision "${ACCEPT_V1_TOKEN}"`);

const readText = file => readFile(path.join(root, file), 'utf8');
const [pkg, constantsText, catalog, freeze, currentAcceptance, candidateEvidence, phaseD, phaseF, acceptanceReport] = await Promise.all([
  readJson('package.json'),
  readText('src/db/constants.js'),
  loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/v1-planner-release/freeze-contract.json'),
  readJson('corpus/production/v1-planner-release/manual-acceptance.json'),
  readJson('corpus/production/v1-planner-release/release-candidate-evidence.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),
  JSON.parse(await readFile(path.resolve(root, reportPath), 'utf8'))
]);

const runtime = { appVersion:APP_VERSION, dbVersion:DB_VERSION, contentSchemaVersion:CONTENT_SCHEMA_VERSION, backupFormatVersion:BACKUP_FORMAT_VERSION, preV1DataEpoch:PRE_V1_DATA_EPOCH };
const projection = await buildStableProjection({ pkg, constantsText, catalog, freeze, currentAcceptance, candidateEvidence, phaseD, phaseF, acceptanceReport, decision, runtime });
const summary = {
  mode: apply ? 'apply' : 'dry-run',
  decision,
  fromAppVersion: APP_VERSION,
  toAppVersion: projection.stablePackage.version,
  catalogVersion: projection.stableManifest.catalogVersion,
  publication: projection.stableManifest.publication,
  allowedPaths: PROMOTION_ALLOWED_PATHS,
  projectedReleaseGate: 'PASS'
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  console.log('Dry-run only: no files changed. Add --apply only after final ACCEPT V1 is intentional.');
  process.exit(0);
}

const writes = new Map([
  ['package.json', JSON.stringify(projection.stablePackage, null, 2) + '\n'],
  ['src/db/constants.js', projection.stableConstantsText],
  ['public/data/catalog-manifest.json', JSON.stringify(projection.stableManifest, null, 2) + '\n'],
  ['corpus/production/v1-planner-release/manual-acceptance.json', JSON.stringify(projection.stableAcceptance, null, 2) + '\n'],
  ['corpus/production/v1-planner-release/stable-release-evidence.json', JSON.stringify(projection.stableEvidence, null, 2) + '\n']
]);

for (const [relative, content] of writes) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive:true });
  const temp = `${target}.phase-h-${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, target);
}

console.log(JSON.stringify(summary, null, 2));
console.log('Stable metadata promotion applied. Run npm run check and npm run release:gate before tagging v1.0.0.');
