import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../src/db/constants.js';
import { loadLocalCatalog } from '../scripts/corpus/io-lib.mjs';
import { sha256Json } from '../src/lib/crypto.js';
import { MANUAL_ACCEPTANCE_CASES } from '../src/services/manualAcceptanceService.js';
import { catalogContentProjection } from '../scripts/release/v1-release-state.mjs';
import { ACCEPT_V1_TOKEN, buildStableProjection, PROMOTION_ALLOWED_PATHS } from '../scripts/release/v1-stable-promotion-lib.mjs';

const root=process.cwd();
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const text=file=>readFile(path.join(root,file),'utf8');

function acceptedSyntheticReport(freeze){
  return {
    schemaVersion:1,
    appVersion:freeze.appCandidateVersion,
    catalogVersion:freeze.catalogVersion,
    decision:'pending',
    decisionNote:'Synthetic test report; not user acceptance.',
    cases:Object.fromEntries(MANUAL_ACCEPTANCE_CASES.map(item=>[item.id,{status:'pass',severity:null,notes:'test',evidence:'phase-h-test'}]))
  };
}

test('Phase H — handoff closes development while preserving the Phase G frozen content', async()=>{
  const [handoff,freeze,catalog]=await Promise.all([
    json('corpus/production/v1-planner-release/phase-h-handoff.json'),
    json('corpus/production/v1-planner-release/freeze-contract.json'),
    loadLocalCatalog(path.join(root,'public/data'))
  ]);
  assert.equal(handoff.phase,'H');
  assert.equal(handoff.status,'development_tranche_complete');
  assert.equal(handoff.appCandidateVersion,freeze.appCandidateVersion);
  assert.equal(handoff.stableTargetVersion,'1.0.0');
  assert.equal(handoff.phaseGFreeze.digest,await sha256Json(freeze));
  assert.equal(await sha256Json(catalogContentProjection(catalog.manifest)),freeze.digests.catalogContentDigest);
  assert.deepEqual(handoff.promotionContract.allowedPaths,PROMOTION_ALLOWED_PATHS);
  assert.equal(handoff.simulatedPromotion.recordsUserAcceptance,false);
});

test('Phase H — stable promotion requires exact ACCEPT V1 and a fully passing manual report', async()=>{
  const [pkg,catalog,freeze,currentAcceptance,candidateEvidence,phaseD,phaseF,constantsText]=await Promise.all([
    json('package.json'),loadLocalCatalog(path.join(root,'public/data')),json('corpus/production/v1-planner-release/freeze-contract.json'),json('corpus/production/v1-planner-release/manual-acceptance.json'),json('corpus/production/v1-planner-release/release-candidate-evidence.json'),json('corpus/production/planner-phase-d/publication-evidence.json'),json('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),text('src/db/constants.js')
  ]);
  if(APP_VERSION==='1.0.0') return; // promotion itself is tested by the release gate once applied.
  const runtime={appVersion:APP_VERSION,dbVersion:DB_VERSION,contentSchemaVersion:CONTENT_SCHEMA_VERSION,backupFormatVersion:BACKUP_FORMAT_VERSION,preV1DataEpoch:PRE_V1_DATA_EPOCH};
  const report=acceptedSyntheticReport(freeze);
  await assert.rejects(()=>buildStableProjection({pkg,constantsText,catalog,freeze,currentAcceptance,candidateEvidence,phaseD,phaseF,acceptanceReport:report,decision:'yes',runtime}),/ACCEPT V1/);
  report.cases['energy-800'].status='pending';
  await assert.rejects(()=>buildStableProjection({pkg,constantsText,catalog,freeze,currentAcceptance,candidateEvidence,phaseD,phaseF,acceptanceReport:report,decision:ACCEPT_V1_TOKEN,runtime}),/not eligible|not PASS/);
});

test('Phase H — a synthetic accepted projection passes the stable gate without changing frozen catalog content', async()=>{
  if(APP_VERSION==='1.0.0') return;
  const [pkg,catalog,freeze,currentAcceptance,candidateEvidence,phaseD,phaseF,constantsText]=await Promise.all([
    json('package.json'),loadLocalCatalog(path.join(root,'public/data')),json('corpus/production/v1-planner-release/freeze-contract.json'),json('corpus/production/v1-planner-release/manual-acceptance.json'),json('corpus/production/v1-planner-release/release-candidate-evidence.json'),json('corpus/production/planner-phase-d/publication-evidence.json'),json('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),text('src/db/constants.js')
  ]);
  const runtime={appVersion:APP_VERSION,dbVersion:DB_VERSION,contentSchemaVersion:CONTENT_SCHEMA_VERSION,backupFormatVersion:BACKUP_FORMAT_VERSION,preV1DataEpoch:PRE_V1_DATA_EPOCH};
  const projection=await buildStableProjection({pkg,constantsText,catalog,freeze,currentAcceptance,candidateEvidence,phaseD,phaseF,acceptanceReport:acceptedSyntheticReport(freeze),decision:ACCEPT_V1_TOKEN,acceptedAt:'2026-09-10T15:10:00.000Z',runtime});
  assert.equal(projection.gate.releasable,true);
  assert.equal(projection.stablePackage.version,'1.0.0');
  assert.equal(projection.stableManifest.publication.channel,'production_release');
  assert.equal(projection.stableManifest.publication.releaseEligible,true);
  assert.equal(await sha256Json(catalogContentProjection(projection.stableManifest)),freeze.digests.catalogContentDigest);
  assert.equal(projection.stableAcceptance.acceptedCandidateVersion,freeze.appCandidateVersion);
  assert.equal(projection.stableEvidence.promotion.metadataOnly,true);
});

test('Phase H — promotion CLI is dry-run by default and does not embed an acceptance decision', async()=>{
  const script=await text('scripts/release/promote-v1-stable.mjs');
  assert.match(script,/--report/);
  assert.match(script,/--decision/);
  assert.match(script,/--apply/);
  assert.match(script,/Dry-run only/);
  assert.doesNotMatch(script,/decision:\s*'ACCEPT V1'/);
});
