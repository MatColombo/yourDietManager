import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const text = file => readFile(file, 'utf8');

test('Phase G — release-candidate freeze binds rc.34 to the 600/1800 planner baseline without mutating recipe content', async () => {
  const [pkg, manifest, freeze, phaseD, phaseF] = await Promise.all([
    json('package.json'), json('public/data/catalog-manifest.json'),
    json('corpus/production/v1-planner-release/freeze-contract.json'),
    json('corpus/production/planner-phase-d/publication-evidence.json'),
    json('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json')
  ]);
  assert.equal(freeze.appCandidateVersion, '1.0.0-rc.34');
  assert.ok([freeze.appCandidateVersion, '1.0.0'].includes(pkg.version));
  assert.equal(freeze.catalogVersion, '1.2.0-planner-phase-d');
  assert.equal(freeze.dataContract.ingredientFamilies, 600);
  assert.equal(freeze.dataContract.ingredientRevisions, 600);
  assert.equal(freeze.dataContract.recipeFamilies, 1800);
  assert.equal(freeze.dataContract.recipeVersions, 1800);
  assert.equal(freeze.dataContract.coreRecipeVersions, 1800);
  assert.equal(freeze.digests.recipeDigest, phaseD.recipeDigest);
  assert.equal(freeze.digests.referenceDataDigest, manifest.referenceDataDigest);
  assert.equal(freeze.plannerContract.softObjectivePolicyVersion, phaseF.policyVersion);
  assert.equal(freeze.plannerContract.hardDailyEnergy, true);
  assert.equal(freeze.plannerContract.servingScalingAllowed, false);
});

test('Phase G — product taxonomy and Phase F quality evidence are part of the freeze contract', async () => {
  const [freeze, phaseD, phaseF] = await Promise.all([
    json('corpus/production/v1-planner-release/freeze-contract.json'),
    json('corpus/production/planner-phase-d/publication-evidence.json'),
    json('V1_PLANNER_PHASE_F_QUALITY_EVIDENCE.json')
  ]);
  assert.equal(freeze.dataContract.productTaxonomyClassifiedIngredients, 600);
  assert.equal(freeze.dataContract.productTaxonomyCategoryCount, 18);
  assert.equal(freeze.dataContract.productTaxonomyTermCount, 203);
  assert.equal(phaseD.productTaxonomy.noodleVariantCount, 11);
  assert.equal(phaseD.productTaxonomy.dairyIngredientCount, 19);
  assert.equal(phaseF.acceptance.hardEnergyStillMandatory, true);
  assert.equal(phaseF.acceptance.servingScalingAllowed, false);
  const stress2600 = phaseF.after.find(row => row.targetKcal === 2600);
  assert.ok(stress2600.uniqueRecipeRate >= 0.70);
  assert.equal(stress2600.exactRepeatPairsWithin3Days, 0);
});

test('Phase G — freeze records the fail-closed boundary even after a later metadata-only stable promotion', async () => {
  const [freeze, acceptance, manifest, releaseGate, releaseState, pkg] = await Promise.all([
    json('corpus/production/v1-planner-release/freeze-contract.json'),
    json('corpus/production/v1-planner-release/manual-acceptance.json'),
    json('public/data/catalog-manifest.json'),
    text('scripts/hardening/release-gate.mjs'),
    text('scripts/release/v1-release-state.mjs'),
    json('package.json')
  ]);
  assert.equal(freeze.status, 'release_candidate_frozen');
  assert.equal(freeze.manualAcceptance.required, true);
  assert.equal(freeze.manualAcceptance.statusAtFreeze, 'pending');
  assert.equal(freeze.manualAcceptance.stablePromotionAllowedAtFreeze, false);
  if (pkg.version === freeze.appCandidateVersion) {
    assert.equal(acceptance.status, 'pending');
    assert.equal(acceptance.stablePromotionAllowed, false);
    assert.equal(manifest.publication.channel, 'development');
    assert.equal(manifest.publication.releaseEligible, false);
  } else {
    assert.equal(pkg.version, '1.0.0');
    assert.equal(acceptance.status, 'accepted');
    assert.equal(acceptance.stablePromotionAllowed, true);
    assert.equal(manifest.publication.channel, 'production_release');
    assert.equal(manifest.publication.releaseEligible, true);
  }
  assert.match(releaseGate, /v1-planner-release\/freeze-contract\.json/);
  assert.match(releaseGate, /manual-acceptance\.json/);
  assert.match(releaseState, /production_release/);
  assert.match(releaseState, /1800/);
});

test('Phase G — PWA shell/data cache and pre-V1 epoch stay frozen through stable metadata promotion', async () => {
  const [sw, offline, epoch, constants] = await Promise.all([
    text('public/service-worker.js'), text('src/services/offlineCatalog.js'),
    text('src/services/preV1DataEpoch.js'), text('src/db/constants.js')
  ]);
  assert.match(sw, /ydm-shell-v37-/);
  assert.match(sw, /ydm-data-v17-/);
  assert.match(offline, /ydm-data-v17-/);
  assert.match(epoch, /ydm-shell-v37-/);
  assert.match(epoch, /ydm-data-v17-/);
  assert.match(constants, /PRE_V1_DATA_EPOCH = 'v1-planner-phase-d-epoch-1'/);
});
