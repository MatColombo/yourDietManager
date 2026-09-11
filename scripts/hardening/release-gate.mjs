import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';
import { evaluateV1ReleaseState } from '../release/v1-release-state.mjs';

const root = process.cwd();
const [pkg, catalog, freeze, acceptance, phaseD, phaseF] = await Promise.all([
  readJson('package.json'),
  loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/v1-planner-release/freeze-contract.json'),
  readJson('corpus/production/v1-planner-release/manual-acceptance.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json')
]);
const runtime = {
  appVersion: APP_VERSION,
  dbVersion: DB_VERSION,
  contentSchemaVersion: CONTENT_SCHEMA_VERSION,
  backupFormatVersion: BACKUP_FORMAT_VERSION,
  preV1DataEpoch: PRE_V1_DATA_EPOCH
};
const evaluated = await evaluateV1ReleaseState({ pkg, catalog, freeze, acceptance, phaseD, phaseF, runtime });
const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  candidateAppVersion: freeze.appCandidateVersion,
  currentAppVersion: APP_VERSION,
  catalogVersion: catalog.manifest.catalogVersion,
  releasable: evaluated.releasable,
  checks: evaluated.checks,
  blockers: evaluated.blockers
};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v1-release-gate.json'),JSON.stringify(report,null,2)+'\n');
console.log(`V1 stable release gate: ${report.releasable?'PASS':'BLOCKED'} (${report.checks.length-report.blockers.length}/${report.checks.length})`);
for(const blocker of report.blockers) console.log(`- ${blocker.id}: ${blocker.detail}`);
if(!report.releasable) process.exitCode=2;
