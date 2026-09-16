import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';

function run(...args) {
  const result = spawnSync(process.execPath, ['scripts/data-proposals/reconcile.mjs', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('semantic proposals reconcile deterministically against the exact R8 baseline', () => {
  const out = run('--check');
  assert.match(out, /ingredient-semantic-consolidation-round1/);
  assert.match(out, /changes=274/);
  assert.match(out, /termsAdded=188/);
  assert.match(out, /culinary-generation-policy-v2/);
  assert.match(out, /roles=32/);
  assert.match(out, /archetypes=20/);
  assert.match(out, /recipe-rework-planning-round1/);
  assert.match(out, /recipe-generation-replacements-round1/);
  assert.match(out, /candidates=212/);
  assert.match(out, /accepted=212/);
  assert.match(out, /jobs=24/);
  assert.match(out, /strict=506/);
  assert.match(out, /convert=46/);
  assert.match(out, /rebuild=11/);
  assert.match(out, /replacements=212/);
  assert.match(out, /recipe-semantic-consolidation-round1/);
  assert.match(out, /reviewed=1800/);
  assert.match(out, /keep=1036/);
  assert.match(out, /rework=563/);
  assert.match(out, /retire=105/);
  assert.match(out, /duplicates=96/);
  assert.match(out, /corpus-simulation-round1/);
  assert.match(out, /final=1800/);
  assert.match(out, /semanticDupGroups=27/);
  assert.match(out, /titleDupGroups=67/);
  assert.match(out, /promotion=blocked/);
  assert.match(out, /Data proposal reconciliation PASS \(6\/6\)/);
});

test('ingredient semantic materialization is staging-only and preserves corpus cardinality', async () => {
  await rm('corpus/staging/data-proposals', { recursive: true, force: true });
  run('--materialize');
  const report = JSON.parse(await readFile('corpus/staging/data-proposals/ingredient-semantic-consolidation-round1/reconciliation-report.json', 'utf8'));
  assert.equal(report.status, 'reconciled');
  assert.equal(report.result.ingredientChangesApplied, 274);
  assert.equal(report.result.taxonomyTermsAdded, 188);
  assert.equal(report.result.ingredientCount, 600);
  assert.equal(report.result.productFoodTermCount, 391);
  assert.equal(report.invariants.fuzzyMatchingUsed, false);
  assert.equal(report.invariants.recipeVersionsMutated, false);
  assert.equal(report.invariants.nutritionMutated, false);
  assert.equal(report.invariants.sourceProvenanceMutated, false);
});

test('recipe semantic review covers all 1800 versions and materializes decisions without mutating the canonical corpus', async () => {
  await rm('corpus/staging/data-proposals', { recursive: true, force: true });
  run('--materialize');
  const dir = 'corpus/staging/data-proposals/recipe-semantic-consolidation-round1';
  const report = JSON.parse(await readFile(`${dir}/reconciliation-report.json`, 'utf8'));
  const keep = JSON.parse(await readFile(`${dir}/keep-rename.json`, 'utf8'));
  const rework = JSON.parse(await readFile(`${dir}/needs-rework.json`, 'utf8'));
  const retire = JSON.parse(await readFile(`${dir}/retire.json`, 'utf8'));
  const duplicates = JSON.parse(await readFile(`${dir}/consolidate-duplicates.json`, 'utf8'));
  assert.equal(report.status, 'reconciled');
  assert.equal(report.result.recipeVersionsReviewed, 1800);
  assert.deepEqual(report.result.counts, { KEEP_RENAME: 1036, REWORK: 563, RETIRE: 105, CONSOLIDATE_DUPLICATE: 96 });
  assert.equal(keep.length, 1036);
  assert.equal(rework.length, 563);
  assert.equal(retire.length, 105);
  assert.equal(duplicates.length, 96);
  assert.equal(keep.length + rework.length + retire.length + duplicates.length, 1800);
  assert.equal(report.invariants.fuzzyMatchingUsed, false);
  assert.equal(report.invariants.canonicalRecipeVersionsMutated, false);
  assert.equal(report.invariants.nutritionMutated, false);
  assert.equal(report.invariants.ingredientLinesMutated, false);
  assert.equal(report.invariants.canonicalCatalogMutated, false);
  assert.ok(keep.every(row => row.proposedPresentation?.titleIt && row.proposedPresentation?.titleEn));
});


test('T4-B culinary policy separates semantic roles and blocks the Phase B failure modes', async () => {
  const policy = JSON.parse(await readFile('data-proposals/active/culinary-generation-policy-v2/culinary-generation-policy.json', 'utf8'));
  const pools = JSON.parse(await readFile('data-proposals/active/culinary-generation-policy-v2/role-pools-v2.json', 'utf8'));
  const archetypes = JSON.parse(await readFile('data-proposals/active/culinary-generation-policy-v2/archetypes-v2.json', 'utf8'));
  const byRole = new Map(pools.roles.map(row => [row.roleId, row]));
  assert.equal(pools.roles.length, 32);
  assert.equal(archetypes.archetypes.length, 20);
  assert.equal(pools.summary.emptyRoles.length, 0);
  assert.equal(byRole.get('oil_cooking_heat').ingredientRevisionIds.length, 2);
  assert.equal(byRole.get('yogurt_cultured').ingredientRevisionIds.length, 2);
  assert.equal(byRole.get('milk_liquid').ingredientRevisionIds.length, 1);
  assert.equal(byRole.get('cultured_milk_liquid').ingredientRevisionIds.length, 1);
  assert.equal(byRole.get('grain_dry_cook').ingredientRevisionIds.length, 21);
  assert.equal(byRole.get('fruit_ready_whole').ingredientRevisionIds.length, 40);
  assert.equal(byRole.get('vegetable_main_raw').ingredientRevisionIds.length, 25);
  assert.equal(byRole.get('nuts_seeds_neutral').ingredientRevisionIds.length, 18);
  assert.equal(policy.globalRules.workflowMayFuzzyMatchIngredients, false);
  assert.equal(policy.globalRules.workflowMayEnergyFitAmounts, false);
  assert.equal(policy.globalRules.requireExplicitCulinaryArchetype, true);
  assert.ok(archetypes.archetypes.some(row => row.archetypeId === 'fruit_dairy_smoothie'));
  assert.ok(archetypes.archetypes.some(row => row.archetypeId === 'tomato_pasta_bowl'));
});

test('T4-A classifies all REWORK recipes and yields a deterministic 212-recipe replacement target', async () => {
  await rm('corpus/staging/data-proposals', { recursive: true, force: true });
  run('--materialize');
  const dir = 'corpus/staging/data-proposals/recipe-rework-planning-round1';
  const report = JSON.parse(await readFile(`${dir}/reconciliation-report.json`, 'utf8'));
  const strict = JSON.parse(await readFile(`${dir}/strict-repair.json`, 'utf8'));
  const converted = JSON.parse(await readFile(`${dir}/archetype-conversion.json`, 'utf8'));
  const rebuild = JSON.parse(await readFile(`${dir}/rebuild-replacement.json`, 'utf8'));
  const gap = JSON.parse(await readFile(`${dir}/gap-matrix.json`, 'utf8'));
  assert.equal(report.result.reworkCount, 563);
  assert.equal(report.result.strictLocalRepairCount, 506);
  assert.equal(report.result.archetypeConversionCount, 46);
  assert.equal(report.result.rebuildReplacementCount, 11);
  assert.equal(report.result.replacementTarget, 212);
  assert.equal(strict.length, 506);
  assert.equal(converted.length, 46);
  assert.equal(rebuild.length, 11);
  assert.equal(gap.totals.retainedExisting, 1588);
  assert.equal(gap.totals.replacementTarget, 212);
  assert.equal(gap.totals.restoredCorpusTarget, 1800);
  assert.equal(gap.bands.reduce((sum, row) => sum + row.replacementTargetToRestoreOriginalQuota, 0), 212);
  assert.ok(strict.every(row => row.strictRepairCandidateCount > 0));
  assert.ok(converted.every(row => row.conversionArchetypeId === 'fruit_dairy_smoothie'));
  assert.ok(rebuild.every(row => row.strictRepairCandidateCount === 0));
  assert.equal(report.invariants.automaticAmountFittingUsed, false);
  assert.equal(report.invariants.canonicalCatalogMutated, false);
});


test('T4-C/D static replacement proposal restores all 212 gaps without workflow fitting', async () => {
  await rm('corpus/staging/data-proposals', { recursive: true, force: true });
  run('--materialize');
  const sourceDir = 'data-proposals/active/recipe-generation-replacements-round1';
  const stageDir = 'corpus/staging/data-proposals/recipe-generation-replacements-round1';
  const proposal = JSON.parse(await readFile(`${sourceDir}/recipe-generation-proposal.json`, 'utf8'));
  const authored = JSON.parse(await readFile(`${sourceDir}/recipe-proposals.json`, 'utf8'));
  const report = JSON.parse(await readFile(`${stageDir}/reconciliation-report.json`, 'utf8'));
  const compiled = JSON.parse(await readFile(`${stageDir}/compiled-recipe-proposals.json`, 'utf8'));
  const replacement = JSON.parse(await readFile(`${stageDir}/replacement-matrix.json`, 'utf8'));
  assert.equal(proposal.proposalType, 'recipe_generation_batch');
  assert.equal(proposal.intent.targetAcceptedRecipes, 212);
  assert.equal(proposal.intent.netExpansion, 0);
  assert.equal(authored.recipes.length, 212);
  assert.ok(authored.recipes.every(row => !('calculatedNutrition' in row) && !('allergenIds' in row)));
  assert.ok(authored.recipes.every(row => row.culinaryArchetypeId && row.ingredientLines.every(line => line.roleId && line.ingredientRevisionId && line.amountG > 0)));
  assert.ok(authored.recipes.every(row => !/altra verdura|altra frutta|come venduto|as sold|ing_fdc_/i.test(`${row.i18n.it.title} ${row.i18n.en.title}`)));
  assert.equal(report.result.candidateCount, 212);
  assert.equal(report.result.derivedAcceptedCount, 212);
  assert.equal(report.result.gapJobs, 24);
  assert.equal(report.result.distinctIngredientIds, 93);
  assert.deepEqual(report.result.mealCounts, { breakfast: 77, dinner: 11, lunch: 4, mini_meal: 27, snack: 93 });
  assert.equal(compiled.length, 212);
  assert.ok(compiled.every(row => row.calculatedNutrition?.energyKcal >= row.targetEnergyKcal.min && row.calculatedNutrition?.energyKcal <= row.targetEnergyKcal.max));
  assert.ok(compiled.every(row => Array.isArray(row.allergenIds)));
  assert.equal(Object.values(replacement.jobs).reduce((sum, count) => sum + count, 0), 212);
  assert.equal(report.invariants.fuzzyMatchingUsed, false);
  assert.equal(report.invariants.automaticAmountFittingUsed, false);
  assert.equal(report.invariants.authoredNutritionUsed, false);
  assert.equal(report.invariants.authoredAllergensUsed, false);
  assert.equal(report.invariants.exactGapMatrixRestored, true);
  assert.equal(report.invariants.canonicalCatalogMutated, false);
});


test('T4-E composes the full staging corpus and fail-closes canonical promotion on residual semantic issues', async () => {
  await rm('corpus/staging/data-proposals', { recursive: true, force: true });
  run('--materialize');
  const dir = 'corpus/staging/data-proposals/corpus-simulation-round1';
  const report = JSON.parse(await readFile(`${dir}/reconciliation-report.json`, 'utf8'));
  const coverage = JSON.parse(await readFile(`${dir}/coverage-report.json`, 'utf8'));
  const duplicates = JSON.parse(await readFile(`${dir}/duplicate-report.json`, 'utf8'));
  const repairs = JSON.parse(await readFile(`${dir}/repair-replay-report.json`, 'utf8'));
  const preflight = JSON.parse(await readFile(`${dir}/promotion-preflight.json`, 'utf8'));
  const recipes = JSON.parse(await readFile(`${dir}/simulated-recipe-versions.json`, 'utf8'));
  assert.equal(report.result.finalRecipeCount, 1800);
  assert.deepEqual(report.result.sourceCounts, { KEEP_RENAME: 1036, REWORK_LOCAL_REPAIR: 506, REWORK_ARCHETYPE_CONVERSION: 46, T4C_REPLACEMENT: 212 });
  assert.equal(coverage.energyBands.length, 30);
  assert.ok(coverage.energyBands.every(row => row.exact));
  assert.equal(duplicates.exactRecipeSignatureGroups.length, 0);
  assert.equal(duplicates.nearDuplicatePairs.length, 0);
  assert.equal(duplicates.exactIngredientSetGroups.length, 1);
  assert.equal(duplicates.semanticConceptGroups.length, 27);
  assert.equal(duplicates.semanticConceptExcess, 30);
  assert.equal(duplicates.titleGroups.length, 67);
  assert.equal(duplicates.titleExcess, 76);
  assert.equal(repairs.total, 552);
  assert.equal(repairs.countDrift, 1);
  assert.equal(report.result.presentationReviewCount, 531);
  assert.equal(preflight.technicalPass, true);
  assert.equal(preflight.semanticPass, false);
  assert.equal(preflight.promotionEligible, false);
  assert.equal(preflight.additionalReplacementNeed, 30);
  assert.equal(recipes.length, 1800);
  assert.equal(report.invariants.automaticAmountFittingUsed, false);
  assert.equal(report.invariants.fuzzyMatchingUsed, false);
  assert.equal(report.invariants.canonicalCatalogMutated, false);
});
