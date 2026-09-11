import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { MANUAL_ACCEPTANCE_CASES } from '../../src/services/manualAcceptanceService.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';
import { evaluateV1ReleaseState } from './v1-release-state.mjs';
import { ACCEPT_V1_TOKEN, buildStableProjection, PROMOTION_ALLOWED_PATHS, STABLE_VERSION } from './v1-stable-promotion-lib.mjs';

const root = process.cwd();
const FINALIZED_AT = '2026-09-10T15:10:00.000Z';
const [pkg, catalog, freeze, acceptance, candidateEvidence, phaseD, phaseF] = await Promise.all([
  readJson('package.json'),
  loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/v1-planner-release/freeze-contract.json'),
  readJson('corpus/production/v1-planner-release/manual-acceptance.json'),
  readJson('corpus/production/v1-planner-release/release-candidate-evidence.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json')
]);
const constantsText = await (await import('node:fs/promises')).readFile(path.join(root, 'src/db/constants.js'), 'utf8');
const runtime = { appVersion:APP_VERSION, dbVersion:DB_VERSION, contentSchemaVersion:CONTENT_SCHEMA_VERSION, backupFormatVersion:BACKUP_FORMAT_VERSION, preV1DataEpoch:PRE_V1_DATA_EPOCH };
const currentGate = await evaluateV1ReleaseState({ pkg, catalog, freeze, acceptance, phaseD, phaseF, runtime });
const blockerIds = currentGate.blockers.map(row => row.id).sort();
const expectedBlockers = ['manual-acceptance','production-release-publication','stable-app-version'].sort();
if (JSON.stringify(blockerIds) !== JSON.stringify(expectedBlockers)) throw new Error(`Phase H requires exactly the intentional pre-stable blockers, got: ${blockerIds.join(', ')}`);
if (APP_VERSION !== freeze.appCandidateVersion || pkg.version !== freeze.appCandidateVersion) throw new Error(`Phase H handoff must remain on frozen candidate ${freeze.appCandidateVersion}`);

const syntheticReport = {
  schemaVersion:1,
  appVersion:freeze.appCandidateVersion,
  catalogVersion:freeze.catalogVersion,
  decision:'pending',
  decisionNote:'Synthetic Phase H promotion-path validation only; this is not user acceptance.',
  cases:Object.fromEntries(MANUAL_ACCEPTANCE_CASES.map(item => [item.id,{status:'pass',severity:null,notes:'synthetic gate check',evidence:'phase-h-simulation'}]))
};
const projection = await buildStableProjection({
  pkg, constantsText, catalog, freeze, currentAcceptance:acceptance, candidateEvidence, phaseD, phaseF,
  acceptanceReport:syntheticReport, decision:ACCEPT_V1_TOKEN, acceptedAt:FINALIZED_AT, runtime
});
if (!projection.gate.releasable) throw new Error('Phase H stable projection must pass the stable release gate');

const handoff = {
  schemaVersion:1,
  phase:'H',
  status:'development_tranche_complete',
  finalizedAt:FINALIZED_AT,
  appCandidateVersion:freeze.appCandidateVersion,
  stableTargetVersion:STABLE_VERSION,
  catalogVersion:freeze.catalogVersion,
  phaseGFreeze:{
    contractId:freeze.contractId,
    contractVersion:freeze.contractVersion,
    digest:await sha256Json(freeze),
    frozenDigests:freeze.digests
  },
  currentReleaseBoundary:{
    releasable:false,
    blockerIds,
    acceptanceStatus:acceptance.status,
    publicationChannel:catalog.manifest.publication?.channel,
    releaseEligible:catalog.manifest.publication?.releaseEligible === true
  },
  promotionContract:{
    command:'npm run v1:promote-stable -- --report <manual-acceptance-report.json> --decision "ACCEPT V1" --apply',
    exactDecisionToken:ACCEPT_V1_TOKEN,
    acceptanceReportRequired:true,
    requiredManualCases:MANUAL_ACCEPTANCE_CASES.filter(item => item.required).length,
    metadataOnly:true,
    allowedPaths:[...PROMOTION_ALLOWED_PATHS],
    stableVerification:['npm run check','npm run release:gate'],
    forbiddenChanges:['catalog shards','recipe or ingredient content','DB/schema/backup versions','pre-V1 epoch','planner policy','data cache']
  },
  simulatedPromotion:{
    syntheticOnly:true,
    recordsUserAcceptance:false,
    projectedReleaseGatePass:projection.gate.releasable,
    projectedPublicationChannel:projection.stableManifest.publication.channel,
    projectedStableVersion:projection.stablePackage.version
  }
};
await writeFile(path.join(root, 'corpus/production/v1-planner-release/phase-h-handoff.json'), JSON.stringify(handoff, null, 2) + '\n');
console.log(JSON.stringify({ status:handoff.status, appCandidateVersion:handoff.appCandidateVersion, stableTargetVersion:handoff.stableTargetVersion, blockerIds, simulatedStableGate:'PASS' }, null, 2));
