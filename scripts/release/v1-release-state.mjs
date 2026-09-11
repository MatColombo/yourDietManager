import { sha256Json } from '../../src/lib/crypto.js';

export function catalogContentProjection(manifest) {
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

export async function evaluateV1ReleaseState({ pkg, catalog, freeze, acceptance, phaseD, phaseF, runtime }) {
  const checks = [];
  const blockers = [];
  const check = (id, pass, detail) => {
    const row = { id, pass:Boolean(pass), detail };
    checks.push(row);
    if (!row.pass) blockers.push(row);
  };

  const activeIngredients = catalog.ingredientFamilies.filter(item => item.status === 'active');
  const activeRecipes = catalog.recipeFamilies.filter(item => item.status === 'active');
  const core = catalog.manifest.packs.find(pack => pack.packId === 'core');
  const contentDigest = await sha256Json(catalogContentProjection(catalog.manifest));
  const phaseFDigest = await sha256Json(phaseF);

  check('stable-app-version', pkg.version === runtime.appVersion && runtime.appVersion === '1.0.0', `package=${pkg.version}, runtime=${runtime.appVersion}`);
  check('phase-g-freeze', freeze.status === 'release_candidate_frozen' && freeze.catalogVersion === catalog.manifest.catalogVersion, `${freeze.contractId}@${freeze.contractVersion}`);
  check(
    'manual-acceptance',
    acceptance.status === 'accepted' &&
      acceptance.stablePromotionAllowed === true &&
      acceptance.acceptedAppVersion === '1.0.0' &&
      acceptance.acceptedCatalogVersion === freeze.catalogVersion &&
      (!acceptance.acceptedCandidateVersion || acceptance.acceptedCandidateVersion === freeze.appCandidateVersion),
    `status=${acceptance.status}, allowed=${acceptance.stablePromotionAllowed}`
  );
  check('production-release-publication', catalog.manifest.publication?.channel === 'production_release' && catalog.manifest.publication?.releaseEligible === true && catalog.manifest.publication?.requiredHumanReview === false, `channel=${catalog.manifest.publication?.channel}, eligible=${catalog.manifest.publication?.releaseEligible}`);
  check('frozen-persistence', runtime.dbVersion === 6 && runtime.contentSchemaVersion === 3 && runtime.backupFormatVersion === 1 && runtime.preV1DataEpoch === 'v1-planner-phase-d-epoch-1' && freeze.persistence?.dbVersion === runtime.dbVersion && freeze.persistence?.contentSchemaVersion === runtime.contentSchemaVersion && freeze.persistence?.backupFormatVersion === runtime.backupFormatVersion && freeze.persistence?.preV1DataEpoch === runtime.preV1DataEpoch, `db=${runtime.dbVersion}, content=${runtime.contentSchemaVersion}, backup=${runtime.backupFormatVersion}, epoch=${runtime.preV1DataEpoch}`);
  check('data-contract-600-1800', activeIngredients.length === 600 && catalog.ingredientRevisions.length === 600 && activeRecipes.length === 1800 && catalog.recipeVersions.length === 1800 && core?.recipeVersionIds?.length === 1800, `ingredients=${activeIngredients.length}/${catalog.ingredientRevisions.length}, recipes=${activeRecipes.length}/${catalog.recipeVersions.length}, core=${core?.recipeVersionIds?.length || 0}`);
  check('frozen-recipe-digest', freeze.digests?.recipeDigest === phaseD.recipeDigest, `freeze=${freeze.digests?.recipeDigest}, current=${phaseD.recipeDigest}`);
  check('frozen-catalog-content', freeze.digests?.catalogContentDigest === contentDigest && freeze.digests?.referenceDataDigest === catalog.manifest.referenceDataDigest, `content=${contentDigest}`);
  check('frozen-planner-policy', freeze.plannerContract?.softObjectivePolicyVersion === phaseF.policyVersion && freeze.plannerContract?.phaseFQualityEvidenceDigest === phaseFDigest && freeze.plannerContract?.hardDailyEnergy === true && freeze.plannerContract?.servingScalingAllowed === false, `policy=${phaseF.policyVersion}`);
  check('product-taxonomy-freeze', freeze.dataContract?.productTaxonomyClassifiedIngredients === 600 && freeze.dataContract?.productTaxonomyCategoryCount === 18 && freeze.dataContract?.productTaxonomyTermCount === 203, `classified=${freeze.dataContract?.productTaxonomyClassifiedIngredients}, categories=${freeze.dataContract?.productTaxonomyCategoryCount}, terms=${freeze.dataContract?.productTaxonomyTermCount}`);

  return { releasable:blockers.length === 0, checks, blockers, contentDigest, phaseFDigest };
}
