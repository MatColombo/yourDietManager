import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { APP_VERSION, BACKUP_FORMAT_VERSION, CONTENT_SCHEMA_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { loadLocalCatalog, readJson } from '../corpus/io-lib.mjs';

const root = process.cwd();
const readText = file => readFile(path.join(root, file), 'utf8');
const checks = [];
const failures = [];
const check = (id, pass, detail) => { const row = { id, pass:Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); };

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
      shards: (manifest[key]?.shards || []).map(shard => ({ path:shard.path, count:shard.count, sha256:shard.sha256 }))
    }])),
    packs: (manifest.packs || []).map(pack => ({ packId:pack.packId, required:Boolean(pack.required), recipeVersionIds:pack.recipeVersionIds || [] }))
  };
}

const [pkg, catalog, freeze, acceptance, candidate, phaseD, phaseF, worker, offline, workflow, releaseGate, releaseState] = await Promise.all([
  readJson('package.json'),
  loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/v1-planner-release/freeze-contract.json'),
  readJson('corpus/production/v1-planner-release/manual-acceptance.json'),
  readJson('corpus/production/v1-planner-release/release-candidate-evidence.json'),
  readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  readJson('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json'),
  readText('public/service-worker.js'), readText('src/services/offlineCatalog.js'),
  readText('.github/workflows/v1-release-candidate.yml'), readText('scripts/hardening/release-gate.mjs'), readText('scripts/release/v1-release-state.mjs')
]);

const contentDigest = await sha256Json(contentProjection(catalog.manifest));
const phaseFDigest = await sha256Json(phaseF);
const activeIngredients = catalog.ingredientFamilies.filter(item => item.status === 'active');
const activeRecipes = catalog.recipeFamilies.filter(item => item.status === 'active');
const core = catalog.manifest.packs.find(pack => pack.packId === 'core');
const stress2600 = phaseF.after.find(row => row.targetKcal === 2600);
const isCandidate = APP_VERSION === freeze.appCandidateVersion;
const isStable = APP_VERSION === '1.0.0';

check('phase-g-version', pkg.version === APP_VERSION && freeze.appCandidateVersion === '1.0.0-rc.34' && (isCandidate || isStable), `package=${pkg.version}, runtime=${APP_VERSION}, frozenCandidate=${freeze.appCandidateVersion}`);
check('phase-g-catalog-shape', catalog.manifest.catalogVersion === '1.2.0-planner-phase-d' && activeIngredients.length === 600 && catalog.ingredientRevisions.length === 600 && activeRecipes.length === 1800 && catalog.recipeVersions.length === 1800, `catalog=${catalog.manifest.catalogVersion}, ingredients=${activeIngredients.length}/${catalog.ingredientRevisions.length}, recipes=${activeRecipes.length}/${catalog.recipeVersions.length}`);
check('phase-g-core-full', core?.required === true && core.recipeVersionIds?.length === 1800, `core=${core?.recipeVersionIds?.length || 0}`);
check('phase-g-persistence-frozen', DB_VERSION === 6 && CONTENT_SCHEMA_VERSION === 3 && BACKUP_FORMAT_VERSION === 1 && PRE_V1_DATA_EPOCH === 'v1-planner-phase-d-epoch-1' && freeze.persistence?.dbVersion === DB_VERSION && freeze.persistence?.preV1DataEpoch === PRE_V1_DATA_EPOCH, `db=${DB_VERSION}, content=${CONTENT_SCHEMA_VERSION}, backup=${BACKUP_FORMAT_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('phase-g-recipe-digest', freeze.digests?.recipeDigest === phaseD.recipeDigest && candidate.digests?.recipeDigest === phaseD.recipeDigest, phaseD.recipeDigest);
check('phase-g-catalog-content-digest', freeze.digests?.catalogContentDigest === contentDigest && candidate.digests?.catalogContentDigest === contentDigest, contentDigest);
check('phase-g-reference-data', freeze.digests?.referenceDataDigest === catalog.manifest.referenceDataDigest && freeze.dataContract?.productTaxonomyClassifiedIngredients === 600 && freeze.dataContract?.productTaxonomyCategoryCount === 18 && freeze.dataContract?.productTaxonomyTermCount === 203, `ref=${catalog.manifest.referenceDataDigest}, categories=${freeze.dataContract?.productTaxonomyCategoryCount}, terms=${freeze.dataContract?.productTaxonomyTermCount}`);
check('phase-g-phase-f-policy', freeze.plannerContract?.softObjectivePolicyVersion === phaseF.policyVersion && freeze.plannerContract?.phaseFQualityEvidenceDigest === phaseFDigest && freeze.plannerContract?.hardDailyEnergy === true && freeze.plannerContract?.servingScalingAllowed === false, `policy=${freeze.plannerContract?.softObjectivePolicyVersion}`);
check('phase-g-quality-floor', stress2600?.uniqueRecipeRate >= 0.70 && stress2600?.exactRepeatPairsWithin3Days === 0 && phaseF.acceptance?.hardEnergyStillMandatory === true && phaseF.acceptance?.servingScalingAllowed === false, JSON.stringify(stress2600));
check('phase-g-publication-transition', isCandidate ? (catalog.manifest.publication?.channel === 'development' && catalog.manifest.publication?.releaseEligible === false) : (catalog.manifest.publication?.channel === 'production_release' && catalog.manifest.publication?.releaseEligible === true), `channel=${catalog.manifest.publication?.channel}, eligible=${catalog.manifest.publication?.releaseEligible}`);
check('phase-g-manual-transition', freeze.manualAcceptance?.required === true && freeze.manualAcceptance?.stablePromotionAllowedAtFreeze === false && (isCandidate ? (acceptance.status === 'pending' && acceptance.stablePromotionAllowed === false) : (acceptance.status === 'accepted' && acceptance.stablePromotionAllowed === true)), `acceptance=${acceptance.status}, allowed=${acceptance.stablePromotionAllowed}`);
check('phase-g-pwa-cache', /ydm-shell-v37-/.test(worker) && /ydm-data-v17-/.test(worker) && /ydm-data-v17-/.test(offline), 'shell=v37, data=v17');
check('phase-g-workflow', /V1 Planner Phase H/.test(workflow) && /v1:planner-phase-g-freeze/.test(workflow) && /v1:planner-phase-g/.test(workflow), 'Phase H workflow preserves G rebuild/freeze verification');
check('phase-g-stable-gate-aligned', /v1-planner-release\/freeze-contract\.json/.test(releaseGate) && /manual-acceptance\.json/.test(releaseGate) && /production_release/.test(releaseState) && /1800/.test(releaseState), 'stable release gate targets Phase G freeze and 1800-recipe contract');

const report = { schemaVersion:2, suite:'v1-planner-phase-g-release-candidate-consolidation', checkedAt:new Date().toISOString(), status:failures.length?'failed':'passed', appVersion:APP_VERSION, frozenCandidateVersion:freeze.appCandidateVersion, catalogVersion:catalog.manifest.catalogVersion, checks, failures };
await mkdir(path.join(root, 'reports'), { recursive:true });
await writeFile(path.join(root, 'reports/v1-planner-phase-g-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 Planner Phase G gate: ${failures.length ? 'FAIL' : 'PASS'} (${checks.length - failures.length}/${checks.length})`);
for (const row of failures) console.log(`- ${row.id}: ${row.detail}`);
if (failures.length) process.exitCode = 1;
