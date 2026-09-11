import { sha256Json } from '../../src/lib/crypto.js';
import { MANUAL_ACCEPTANCE_CASES, normalizeManualAcceptanceSession, summarizeManualAcceptance } from '../../src/services/manualAcceptanceService.js';
import { catalogContentProjection, evaluateV1ReleaseState } from './v1-release-state.mjs';

export const STABLE_VERSION = '1.0.0';
export const ACCEPT_V1_TOKEN = 'ACCEPT V1';
export const PROMOTION_ALLOWED_PATHS = Object.freeze([
  'package.json',
  'src/db/constants.js',
  'public/data/catalog-manifest.json',
  'corpus/production/v1-planner-release/manual-acceptance.json',
  'corpus/production/v1-planner-release/stable-release-evidence.json'
]);

export function validateAcceptanceReport(report, { freeze, decision }) {
  if (decision !== ACCEPT_V1_TOKEN) throw new Error(`Stable promotion requires exact decision token: ${ACCEPT_V1_TOKEN}`);
  if (!report || report.schemaVersion !== 1) throw new Error('Manual acceptance report schemaVersion=1 is required');
  if (report.appVersion !== freeze.appCandidateVersion) throw new Error(`Acceptance report appVersion must match frozen candidate ${freeze.appCandidateVersion}`);
  if (report.catalogVersion !== freeze.catalogVersion) throw new Error(`Acceptance report catalogVersion must match frozen catalog ${freeze.catalogVersion}`);

  const session = normalizeManualAcceptanceSession(report, { appVersion:report.appVersion, catalogVersion:report.catalogVersion });
  const summary = summarizeManualAcceptance(session);
  if (!summary.eligible || summary.requiredPending !== 0 || summary.p0 !== 0 || summary.p1 !== 0) {
    throw new Error(`Manual acceptance is not eligible: requiredPending=${summary.requiredPending}, P0=${summary.p0}, P1=${summary.p1}`);
  }
  for (const item of MANUAL_ACCEPTANCE_CASES) {
    if (item.required && session.cases[item.id]?.status !== 'pass') throw new Error(`Required manual acceptance case is not PASS: ${item.id}`);
  }
  return { session, summary };
}

export function buildStablePublication({ manifest, freeze }) {
  const current = manifest.publication || {};
  return {
    channel: 'production_release',
    publicationId: `v1-stable-1800-${freeze.digests.recipeDigest.slice(0,12)}`,
    sourceCorpusDigest: current.sourceCorpusDigest,
    sourceSnapshotId: current.sourceSnapshotId,
    requiredHumanReview: false,
    reviewRecipeCount: 0,
    reviewPolicyVersion: 'v1-final-manual-acceptance-phase-h',
    releaseEligible: true
  };
}

export async function buildStableProjection({ pkg, constantsText, catalog, freeze, currentAcceptance, candidateEvidence, phaseD, phaseF, acceptanceReport, decision, acceptedAt = new Date().toISOString(), runtime }) {
  const { summary } = validateAcceptanceReport(acceptanceReport, { freeze, decision });

  const currentContentDigest = await sha256Json(catalogContentProjection(catalog.manifest));
  if (currentContentDigest !== freeze.digests.catalogContentDigest) throw new Error('Catalog content drifted after Phase G freeze');
  if (catalog.manifest.referenceDataDigest !== freeze.digests.referenceDataDigest) throw new Error('Reference-data digest drifted after Phase G freeze');
  if (phaseD.recipeDigest !== freeze.digests.recipeDigest) throw new Error('Recipe digest drifted after Phase G freeze');
  if (pkg.version !== freeze.appCandidateVersion || runtime.appVersion !== freeze.appCandidateVersion) throw new Error(`Promotion must start from frozen candidate ${freeze.appCandidateVersion}`);
  if (currentAcceptance.status !== 'pending' || currentAcceptance.stablePromotionAllowed !== false) throw new Error('Promotion must start from pending fail-closed acceptance state');

  const stablePackage = { ...pkg, version:STABLE_VERSION };
  const stableConstantsText = constantsText.replace(
    /export const APP_VERSION = '[^']+';/,
    `export const APP_VERSION = '${STABLE_VERSION}';`
  );
  if (stableConstantsText === constantsText || !stableConstantsText.includes(`APP_VERSION = '${STABLE_VERSION}'`)) throw new Error('Unable to project stable APP_VERSION');

  const stableManifest = structuredClone(catalog.manifest);
  stableManifest.publication = buildStablePublication({ manifest:catalog.manifest, freeze });
  const reportDigest = await sha256Json(acceptanceReport);
  const stableAcceptance = {
    schemaVersion: 2,
    source: 'phase-h-final-release-handoff',
    status: 'accepted',
    stablePromotionAllowed: true,
    acceptedAt,
    acceptedCandidateVersion: freeze.appCandidateVersion,
    acceptedAppVersion: STABLE_VERSION,
    acceptedCatalogVersion: freeze.catalogVersion,
    decision: ACCEPT_V1_TOKEN,
    decisionReportDigest: reportDigest,
    decisionNote: acceptanceReport.decisionNote || 'Final V1 manual acceptance recorded for metadata-only stable promotion.',
    summary: {
      requiredCases: MANUAL_ACCEPTANCE_CASES.filter(item => item.required).length,
      passedRequiredCases: MANUAL_ACCEPTANCE_CASES.filter(item => item.required).length,
      p0: summary.p0,
      p1: summary.p1,
      p2: summary.p2
    }
  };

  const projectedCatalog = { ...catalog, manifest:stableManifest };
  const stableRuntime = { ...runtime, appVersion:STABLE_VERSION };
  const gate = await evaluateV1ReleaseState({
    pkg:stablePackage,
    catalog:projectedCatalog,
    freeze,
    acceptance:stableAcceptance,
    phaseD,
    phaseF,
    runtime:stableRuntime
  });
  if (!gate.releasable) throw new Error(`Projected stable release gate is blocked: ${gate.blockers.map(row => row.id).join(', ')}`);

  const stableEvidence = {
    schemaVersion: 1,
    phase: 'H',
    status: 'stable_release_projected',
    acceptedAt,
    appCandidateVersion: freeze.appCandidateVersion,
    appStableVersion: STABLE_VERSION,
    catalogVersion: freeze.catalogVersion,
    phaseGFreezeContractId: freeze.contractId,
    decisionReportDigest: reportDigest,
    frozenDigests: structuredClone(freeze.digests),
    publication: structuredClone(stableManifest.publication),
    promotion: {
      metadataOnly: true,
      allowedPaths: [...PROMOTION_ALLOWED_PATHS],
      forbiddenChanges: ['recipe content','ingredient content','catalog shards','DB/schema/backup versions','pre-V1 epoch','planner policy','data cache']
    },
    projectedReleaseGate: { releasable:true, checks:gate.checks }
  };

  return { stablePackage, stableConstantsText, stableManifest, stableAcceptance, stableEvidence, gate };
}
