import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { readJson, writeJson } from '../corpus/io-lib.mjs';

const ROOT = process.cwd();
const OUT_DIR = 'corpus/production/v1-planner-release';
const FROZEN_AT = '2026-09-10T14:50:00.000Z';

function contentProjection(manifest) {
  const sections = ['taxonomies','taxonomyTerms','ingredientFamilies','ingredientRevisions','recipeFamilies','recipeVersions'];
  return {
    catalogVersion: manifest.catalogVersion,
    referenceDataVersion: manifest.referenceDataVersion,
    referenceDataDigest: manifest.referenceDataDigest,
    pipelineVersion: manifest.pipelineVersion,
    calculationAlgorithmVersion: manifest.calculationAlgorithmVersion,
    sections: Object.fromEntries(sections.map(key => [key, {
      count: manifest[key]?.count || 0,
      shards: (manifest[key]?.shards || []).map(shard => ({ path: shard.path, count: shard.count, sha256: shard.sha256 }))
    }])),
    packs: (manifest.packs || []).map(pack => ({
      packId: pack.packId,
      required: Boolean(pack.required),
      recipeVersionIds: pack.recipeVersionIds || []
    }))
  };
}

const [pkg, manifest, phaseDBuild, phaseDPublication, phaseFQuality, worker, offline] = await Promise.all([
  readJson('package.json'),
  readJson('public/data/catalog-manifest.json'),
  readJson('corpus/production/planner-phase-d/build-evidence.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),
  readFile(path.join(ROOT, 'public/service-worker.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/services/offlineCatalog.js'), 'utf8')
]);

if (pkg.version !== APP_VERSION || APP_VERSION !== '1.0.0-rc.34') throw new Error(`Phase G freeze requires app 1.0.0-rc.34, got package=${pkg.version}, runtime=${APP_VERSION}`);
if (manifest.catalogVersion !== '1.2.0-planner-phase-d') throw new Error(`Unexpected Phase G catalog ${manifest.catalogVersion}`);
if (manifest.ingredientFamilies?.count !== 600 || manifest.ingredientRevisions?.count !== 600 || manifest.recipeFamilies?.count !== 1800 || manifest.recipeVersions?.count !== 1800) throw new Error('Phase G freeze requires 600/600 ingredients and 1800/1800 recipes');
if (phaseDBuild.invariants?.recipeDigestAfter !== phaseDPublication.recipeDigest || phaseDBuild.invariants?.recipeDigestPreserved !== true) throw new Error('Phase G freeze requires preserved Phase D recipe digest');
if (phaseDPublication.productTaxonomy?.classifiedIngredientCount !== 600) throw new Error('Phase G freeze requires product taxonomy on all 600 ingredients');
if (phaseFQuality.acceptance?.hardEnergyStillMandatory !== true || phaseFQuality.acceptance?.servingScalingAllowed !== false) throw new Error('Phase G freeze requires Phase F hard-energy and fixed-serving invariants');
if (!/ydm-shell-v37-/.test(worker) || !/ydm-data-v17-/.test(worker) || !/ydm-data-v17-/.test(offline)) throw new Error('Phase G freeze requires shell v37 and data v17 cache parity');

const catalogContentDigest = await sha256Json(contentProjection(manifest));
const phaseFQualityDigest = await sha256Json(phaseFQuality);
const freeze = {
  schemaVersion: 1,
  contractId: 'yourdietmanager-v1-planner-phase-g-freeze',
  contractVersion: '1.0.0',
  status: 'release_candidate_frozen',
  frozenAt: FROZEN_AT,
  appCandidateVersion: APP_VERSION,
  catalogVersion: manifest.catalogVersion,
  persistence: {
    dbVersion: DB_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    preV1DataEpoch: PRE_V1_DATA_EPOCH
  },
  dataContract: {
    ingredientFamilies: 600,
    ingredientRevisions: 600,
    recipeFamilies: 1800,
    recipeVersions: 1800,
    coreRecipeVersions: manifest.packs?.find(pack => pack.packId === 'core')?.recipeVersionIds?.length || 0,
    productTaxonomyClassifiedIngredients: phaseDPublication.productTaxonomy?.classifiedIngredientCount || 0,
    productTaxonomyCategoryCount: phaseDPublication.productTaxonomy?.categoryCount || 0,
    productTaxonomyTermCount: phaseDPublication.productTaxonomy?.termCount || 0
  },
  plannerContract: {
    hardDailyEnergy: true,
    servingScalingAllowed: false,
    fixedServingCount: 1,
    softObjectivePolicyVersion: phaseFQuality.policyVersion,
    phaseFQualityEvidenceDigest: phaseFQualityDigest
  },
  publicationAtFreeze: {
    channel: manifest.publication?.channel || null,
    releaseEligible: manifest.publication?.releaseEligible ?? null,
    publicationId: manifest.publication?.publicationId || null
  },
  manualAcceptance: {
    required: true,
    source: 'phase-e-manual-acceptance',
    statusAtFreeze: 'pending',
    stablePromotionAllowedAtFreeze: false,
    note: 'Phase E may be treated as provisionally valid during development, but stable promotion requires an explicit final ACCEPT V1 record.'
  },
  digests: {
    recipeDigest: phaseDPublication.recipeDigest,
    referenceDataDigest: manifest.referenceDataDigest,
    catalogContentDigest,
    phaseFQualityDigest
  },
  promotionRules: [
    'Do not regenerate or serving-scale RecipeVersion content during stable promotion.',
    'Do not change DB v6, content schema v3, backup format v1 or pre-V1 epoch during stable promotion.',
    'Stable promotion requires an explicit accepted manual-acceptance record and a production_release manifest using the frozen content.',
    'Any blocker requiring catalog, schema, persistence or planner-policy changes invalidates this freeze and returns to release-candidate validation.'
  ]
};

const candidateEvidence = {
  schemaVersion: 1,
  phase: 'G',
  status: 'release_candidate',
  appCandidateVersion: APP_VERSION,
  catalogVersion: manifest.catalogVersion,
  frozenAt: FROZEN_AT,
  dataContract: freeze.dataContract,
  persistence: freeze.persistence,
  plannerContract: freeze.plannerContract,
  publicationAtFreeze: freeze.publicationAtFreeze,
  manualAcceptanceRequired: true,
  manualAcceptanceStatus: 'pending',
  digests: freeze.digests
};

await writeJson(`${OUT_DIR}/freeze-contract.json`, freeze);
await writeJson(`${OUT_DIR}/release-candidate-evidence.json`, candidateEvidence);
console.log(JSON.stringify({ status:'frozen', appVersion:APP_VERSION, catalogVersion:manifest.catalogVersion, dataContract:freeze.dataContract, digests:freeze.digests }, null, 2));
