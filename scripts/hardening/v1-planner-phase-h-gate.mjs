import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';
import { evaluateV1ReleaseState } from '../release/v1-release-state.mjs';
import { ACCEPT_V1_TOKEN, PROMOTION_ALLOWED_PATHS, STABLE_VERSION } from '../release/v1-stable-promotion-lib.mjs';

const root = process.cwd();
const readText = file => readFile(path.join(root, file), 'utf8');
const checks=[]; const failures=[];
const check=(id,pass,detail)=>{const row={id,pass:Boolean(pass),detail};checks.push(row);if(!row.pass)failures.push(row);};
const [pkg,catalog,freeze,acceptance,handoff,phaseD,phaseF,promotionScript,workflow] = await Promise.all([
  readJson('package.json'),
  loadLocalCatalog(path.join(root,'public/data')),
  readJson('corpus/production/v1-planner-release/freeze-contract.json'),
  readJson('corpus/production/v1-planner-release/manual-acceptance.json'),
  readJson('corpus/production/v1-planner-release/phase-h-handoff.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),
  readText('scripts/release/promote-v1-stable.mjs'),
  readText('.github/workflows/v1-release-candidate.yml')
]);
const runtime={appVersion:APP_VERSION,dbVersion:DB_VERSION,contentSchemaVersion:CONTENT_SCHEMA_VERSION,backupFormatVersion:BACKUP_FORMAT_VERSION,preV1DataEpoch:PRE_V1_DATA_EPOCH};
const gate=await evaluateV1ReleaseState({pkg,catalog,freeze,acceptance,phaseD,phaseF,runtime});
const blockerIds=gate.blockers.map(row=>row.id).sort();
const expectedBlockers=['manual-acceptance','production-release-publication','stable-app-version'].sort();
const phaseGFreezeDigest=await sha256Json(freeze);
const isCandidate=APP_VERSION===freeze.appCandidateVersion;
const isStable=APP_VERSION===STABLE_VERSION;

check('phase-h-version-boundary',pkg.version===APP_VERSION&&(isCandidate||isStable),`package=${pkg.version}, runtime=${APP_VERSION}, frozenCandidate=${freeze.appCandidateVersion}`);
check('phase-h-handoff-state',handoff.phase==='H'&&handoff.status==='development_tranche_complete'&&handoff.appCandidateVersion===freeze.appCandidateVersion&&handoff.stableTargetVersion===STABLE_VERSION,`${handoff.status} ${handoff.appCandidateVersion}->${handoff.stableTargetVersion}`);
check('phase-h-freeze-chain',handoff.phaseGFreeze?.contractId===freeze.contractId&&handoff.phaseGFreeze?.digest===phaseGFreezeDigest&&handoff.phaseGFreeze?.frozenDigests?.catalogContentDigest===freeze.digests.catalogContentDigest,phaseGFreezeDigest);
check('phase-h-promotion-contract',handoff.promotionContract?.exactDecisionToken===ACCEPT_V1_TOKEN&&handoff.promotionContract?.acceptanceReportRequired===true&&handoff.promotionContract?.metadataOnly===true&&JSON.stringify(handoff.promotionContract?.allowedPaths)===JSON.stringify(PROMOTION_ALLOWED_PATHS),handoff.promotionContract?.command||'missing');
check('phase-h-promotion-script-fail-closed',promotionScript.includes('--decision')&&promotionScript.includes(ACCEPT_V1_TOKEN)&&promotionScript.includes('--report')&&promotionScript.includes('--apply')&&promotionScript.includes('Dry-run only'), 'explicit token + report + apply required');
check('phase-h-simulation-only',handoff.simulatedPromotion?.syntheticOnly===true&&handoff.simulatedPromotion?.recordsUserAcceptance===false&&handoff.simulatedPromotion?.projectedReleaseGatePass===true,JSON.stringify(handoff.simulatedPromotion));
check('phase-h-frozen-runtime',DB_VERSION===6&&CONTENT_SCHEMA_VERSION===3&&BACKUP_FORMAT_VERSION===1&&PRE_V1_DATA_EPOCH==='v1-planner-phase-d-epoch-1',`db=${DB_VERSION}, content=${CONTENT_SCHEMA_VERSION}, backup=${BACKUP_FORMAT_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('phase-h-release-boundary',isCandidate ? JSON.stringify(blockerIds)===JSON.stringify(expectedBlockers) : gate.releasable, isCandidate?`blocked=${blockerIds.join(',')}`:`stableGate=${gate.releasable}`);
check('phase-h-stable-publication-transition',isCandidate ? (catalog.manifest.publication?.channel==='development'&&catalog.manifest.publication?.releaseEligible===false&&acceptance.status==='pending') : (catalog.manifest.publication?.channel==='production_release'&&catalog.manifest.publication?.releaseEligible===true&&acceptance.status==='accepted'),`channel=${catalog.manifest.publication?.channel}, acceptance=${acceptance.status}`);
check('phase-h-workflow',/V1 Planner Phase H/.test(workflow)&&/v1:planner-phase-h-handoff/.test(workflow)&&/v1:planner-phase-h/.test(workflow),'CI rebuilds/drift-checks H handoff and runs H gate');

const report={schemaVersion:1,suite:'v1-planner-phase-h-final-release-handoff',checkedAt:new Date().toISOString(),status:failures.length?'failed':'passed',appVersion:APP_VERSION,catalogVersion:catalog.manifest.catalogVersion,releaseState:isStable?'stable':'candidate',checks,failures};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/v1-planner-phase-h-gate.json'),JSON.stringify(report,null,2)+'\n');
console.log(`V1 Planner Phase H gate: ${failures.length?'FAIL':'PASS'} (${checks.length-failures.length}/${checks.length})`);
for(const row of failures) console.log(`- ${row.id}: ${row.detail}`);
if(failures.length) process.exitCode=1;
