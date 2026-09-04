import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { ingredientSourcePlan, assertIngredientCurationPolicy, assessIngredientCurationBatch, buildPilotWaveReport } from '../src/corpus/ingredientCuration.js';
import { assessProductionReadiness, planPilotIntake } from '../src/corpus/productionCorpus.js';
import { readJson } from '../scripts/corpus/io-lib.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function fixture() {
  const registry = new SchemaRegistry(async file => readJson(path.join(root, 'schemas', file))); await registry.loadAll();
  const [contract, corpusPolicy, curationPolicy, corpus] = await Promise.all([
    readJson(path.join(root, 'corpus/contracts/v1-production.json')),
    readJson(path.join(root, 'corpus/policies/v1-default.json')),
    readJson(path.join(root, 'corpus/curation/v1-ingredient-curation-policy.json')),
    readJson(path.join(root, 'corpus/staging/phase4-smoke-base-bundle.json'))
  ]);
  const intake = await planPilotIntake({
    contract,
    referenceDataVersion: corpus.manifest.referenceDataVersion,
    referenceDataDigest: corpus.manifest.referenceDataDigest,
    seed: 'test-4pb-development-baseline',
    createdAt: '2026-09-04T14:00:00Z',
    registry
  });
  const proposals = [];
  return { registry, contract, corpusPolicy, curationPolicy, corpus, intake, proposals };
}

test('4P-B freezes a two-source curation policy because Foundation published inventory is below the 400 ingredient minimum', async () => {
  const { registry, contract, curationPolicy } = await fixture();
  assertIngredientCurationPolicy(curationPolicy, contract, registry);
  const plan = ingredientSourcePlan(curationPolicy, contract);
  assert.equal(plan.primaryPublishedCount, 394);
  assert.equal(plan.contractMinimum, 400);
  assert.equal(plan.minimumSupplementalFromPublishedCount, 6);
  assert.equal(curationPolicy.sourceRules.automaticFuzzyMerge, false);
  assert.ok(curationPolicy.sourceRules.forbiddenDatasets.includes('Branded'));
});

test('USDA curation import produces a source-digested review batch whose heuristics cannot materialize without explicit checks', async () => {
  const { registry, contract, curationPolicy, corpus } = await fixture();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ydm-4pb-import-'));
  const sourceFile = path.join(temp, 'foundation.json'); const batchFile = path.join(temp, 'batch.json');
  const food = { fdcId: 777001, description: 'Beans, black, cooked', foodCategory: { description: 'Legumes and Legume Products' }, foodNutrients: [
    { nutrient: { id: 2048, name: 'Metabolizable Energy (Atwater Specific Factor)', unitName: 'kcal' }, amount: 118 },
    { nutrient: { id: 2047, name: 'Metabolizable Energy (Atwater General Factor)', unitName: 'kcal' }, amount: 132 },
    { nutrient: { id: 1003, name: 'Protein' }, amount: 8.9 }, { nutrient: { id: 1005, name: 'Carbohydrate, by difference' }, amount: 23.7 },
    { nutrient: { id: 1004, name: 'Total lipid (fat)' }, amount: 0.5 }, { nutrient: { id: 1079, name: 'Fiber, total dietary' }, amount: 8.7 }
  ]};
  food.foodNutrients.unshift(null);
  await writeFile(sourceFile, `${JSON.stringify({ FoundationFoods: [null, { description: 'Malformed record without FDC id', foodNutrients: [] }, food] }, null, 2)}\n`);
  await execFileAsync(process.execPath, ['scripts/corpus/import-usda-foundation.mjs', sourceFile, batchFile], { cwd: root });
  const batch = await readJson(batchFile); registry.assert('ingredientCurationBatch', batch);
  assert.equal(batch.records[0].review.decision, 'pending'); assert.equal(batch.records[0].review.approved, false);
  assert.ok(batch.source.inputDigest.length >= 16); assert.equal(batch.source.sourceId, 'usda-foundation-2026-04');
  assert.equal(batch.inputFoodCount, 3);
  assert.equal(batch.completeRequiredNutrientCount, 1);
  assert.equal(batch.records[0].nutrition.energyKcal, 132);
  assert.equal(batch.records[0].nutrition.energyBasis, 'atwater_general');
  assert.equal(batch.records[0].nutrition.energyNutrientId, '2047');
  assert.equal(batch.records[0].nutrition.energySourceUnit, 'kcal');
  assert.equal(batch.records[0].nutrition.energyOriginalValue, 132);
  assert.equal(batch.records[0].nutrition.energyConversion, 'none');
  assert.equal(batch.incompleteRequiredNutrientCount, 0);
  assert.equal(batch.structurallyInvalidFoodCount, 2);
  assert.deepEqual(batch.structurallyInvalidFoodExamples, [{ index: 0, reason: 'null_food_record' }, { index: 1, reason: 'missing_fdc_id' }]);
  const report = assessIngredientCurationBatch({ batch, policy: curationPolicy, contract, taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, generatedAt: '2026-09-04T14:10:00Z' });
  assert.equal(report.counts.pending, 1); assert.equal(report.counts.materializable, 0); assert.equal(report.readyForPilotFoundation, false);
  assert.equal(report.checks.find(item => item.id === 'source-structural-invalid-records')?.status, 'warning');
});


test('USDA importer converts kJ-only Energy to kcal instead of relabeling the numeric value', async () => {
  const { registry } = await fixture();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ydm-4pb-kj-import-'));
  const sourceFile = path.join(temp, 'foundation.json'); const batchFile = path.join(temp, 'batch.json');
  const food = { fdcId: 746768, description: 'Test energy in kJ', foodCategory: { description: 'Cereal Grains and Pasta' }, foodNutrients: [
    { nutrient: { id: 1062, name: 'Energy', unitName: 'kJ' }, amount: 1500 },
    { nutrient: { id: 1003, name: 'Protein', unitName: 'g' }, amount: 10 },
    { nutrient: { id: 1005, name: 'Carbohydrate, by difference', unitName: 'g' }, amount: 60 },
    { nutrient: { id: 1004, name: 'Total lipid (fat)', unitName: 'g' }, amount: 8 },
    { nutrient: { id: 1079, name: 'Fiber, total dietary', unitName: 'g' }, amount: 5 }
  ]};
  await writeFile(sourceFile, `${JSON.stringify({ FoundationFoods: [food] }, null, 2)}
`);
  await execFileAsync(process.execPath, ['scripts/corpus/import-usda-foundation.mjs', sourceFile, batchFile], { cwd: root });
  const batch = await readJson(batchFile); registry.assert('ingredientCurationBatch', batch);
  const nutrition = batch.records[0].nutrition;
  assert.ok(Math.abs(nutrition.energyKcal - (1500 / 4.184)) < 1e-9);
  assert.equal(nutrition.energySourceUnit, 'kJ');
  assert.equal(nutrition.energyOriginalValue, 1500);
  assert.equal(nutrition.energyConversion, 'kj_to_kcal');
  assert.equal(nutrition.energyNutrientId, '1062');
});

test('approved curation record remains blocked unless every editorial review dimension is explicitly complete', async () => {
  const { registry, contract, curationPolicy, corpus } = await fixture();
  const batch = {
    schemaVersion: 1, batchId: 'test-curation-batch', policyId: curationPolicy.policyId, policyVersion: curationPolicy.policyVersion,
    source: { sourceId: 'usda-foundation-2026-04', provider: 'USDA FoodData Central', dataset: 'Foundation Foods', release: '2026-04', reference: 'https://fdc.nal.usda.gov/download-datasets/', archive: null, license: 'CC0 1.0 Universal', inputDigest: '1234567890abcdef', importedAt: '2026-09-04T14:00:00Z' },
    inputFoodCount: 1, completeRequiredNutrientCount: 1, incompleteRequiredNutrientCount: 0,
    records: [{ sourceRecordId: '1', description: 'Test beans, cooked', commonName: null, category: 'Legumes', nutrition: { energyKcal: 130, proteinG: 9, carbsG: 23, fatG: 0.5, fiberG: 8, sugarsG: null, saturatedFatG: null, sodiumMg: null }, suggested: { ingredientId: 'ing_fdc_1', nameEn: 'Test beans, cooked', nameIt: 'Fagioli test cotti', aliasesEn: [], aliasesIt: [], foodGroup: 'food_group_legumes', foodSubgroup: 'food_subgroup_beans', flavorProfile: 'flavor_savory', mealArchetypes: ['lunch','dinner'], state: 'cooked', allergenIds: [], conversions: [] }, review: { decision: 'approved', approved: true, checks: { italianLabel: true, taxonomy: true, state: true, allergens: true, culinarySuitability: false, duplicate: true, nutrition: true, source: true }, reviewer: 'editor', reviewedAt: '2026-09-04T14:00:00Z', notes: 'Test', duplicateOfIngredientId: null } }]
  };
  registry.assert('ingredientCurationBatch', batch);
  const report = assessIngredientCurationBatch({ batch, policy: curationPolicy, contract, taxonomies: corpus.taxonomies, taxonomyTerms: corpus.taxonomyTerms, registry, generatedAt: '2026-09-04T14:11:00Z' });
  assert.equal(report.counts.blockedApproved, 1); assert.equal(report.issueCounts.review_check_culinarySuitability_incomplete, 1); assert.equal(report.readyToMaterialize, false);
});

test('pilot wave 1 stays blocked until production ingredient readiness passes and wave 2 cannot bypass wave 1 closure', async () => {
  const { registry, contract, corpusPolicy, curationPolicy, corpus, intake, proposals } = await fixture();
  const readiness = await assessProductionReadiness({ contract, policy: corpusPolicy, corpus, registry, generatedAt: '2026-09-04T14:12:00Z' });
  const wave1 = buildPilotWaveReport({ intake, waveNumber: 1, waveSize: 20, proposals, productionReadiness: readiness, curationPolicy, registry, generatedAt: '2026-09-04T14:12:00Z' });
  assert.equal(wave1.gate, 'blocked'); assert.equal(wave1.metrics.records, 20); assert.ok(wave1.blockers.some(item => item.includes('ingredient-production-count')));
  const fakeReady = { ...readiness, readyForPilot: true, blockers: [] };
  const wave2 = buildPilotWaveReport({ intake, waveNumber: 2, waveSize: 20, proposals, productionReadiness: fakeReady, curationPolicy, registry, generatedAt: '2026-09-04T14:13:00Z' });
  assert.equal(wave2.gate, 'blocked'); assert.ok(wave2.blockers.includes('previous-wave-1-not-closed'));
});

test('pilot readiness ignores final 3000-recipe and production-manifest blockers once ingredient/reference readiness is green', async () => {
  const { registry, curationPolicy, intake, proposals } = await fixture();
  const productionReadiness = {
    readyForPilot: true,
    readyForProduction: false,
    pilotBlockers: [],
    blockers: ['recipe-production-count: active=3, required>=3000', 'production-manifest-contract: productionCorpus metadata missing'],
    checks: []
  };
  const wave1 = buildPilotWaveReport({ intake, waveNumber: 1, waveSize: 20, proposals, productionReadiness, curationPolicy, registry, generatedAt: '2026-09-04T14:14:00Z' });
  assert.equal(wave1.state, 'ready');
  assert.equal(wave1.gate, 'review_required');
  assert.deepEqual(wave1.blockers, []);
});

test('SR Legacy supplemental importer is source-bound and remains review-only', async () => {
  const { registry } = await fixture();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ydm-4pb-sr-import-'));
  const sourceFile = path.join(temp, 'sr.json'); const batchFile = path.join(temp, 'batch.json');
  const food = { fdcId: 167536, description: 'Rice, white, long-grain, regular, cooked', foodCategory: { description: 'Cereal Grains and Pasta' }, foodNutrients: [
    { nutrient: { id: 1008, name: 'Energy' }, amount: 130 },
    { nutrient: { id: 1003, name: 'Protein' }, amount: 2.69 }, { nutrient: { id: 1005, name: 'Carbohydrate, by difference' }, amount: 28.17 },
    { nutrient: { id: 1004, name: 'Total lipid (fat)' }, amount: 0.28 }, { nutrient: { id: 1079, name: 'Fiber, total dietary' }, amount: 0.4 }
  ]};
  await writeFile(sourceFile, `${JSON.stringify({ SRLegacyFoods: [food] }, null, 2)}\n`);
  await execFileAsync(process.execPath, ['scripts/corpus/import-usda-sr-legacy.mjs', sourceFile, batchFile], { cwd: root });
  const batch = await readJson(batchFile); registry.assert('ingredientCurationBatch', batch);
  assert.equal(batch.source.sourceId, 'usda-sr-legacy-2018-04');
  assert.equal(batch.source.dataset, 'SR Legacy');
  assert.equal(batch.records[0].review.decision, 'pending');
  assert.equal(batch.records[0].review.approved, false);
  assert.ok(batch.source.inputDigest.length >= 16);
});

test('legacy fixture retirement is an explicit schema-governed map, never an implicit replacement', async () => {
  const { registry } = await fixture();
  const retirement = await readJson(path.join(root, 'corpus/curation/v1-legacy-fixture-retirement.json'));
  registry.assert('ingredientRetirementMap', retirement);
  for (const row of retirement.retirements) {
    assert.ok(row.ingredientId);
    assert.ok(row.replacementIngredientId);
    assert.ok(row.rationale);
    assert.ok(row.approvedBy);
    assert.ok(row.approvedAt);
  }
  const empty = { ...retirement, retirements: [] };
  assert.doesNotThrow(() => registry.assert('ingredientRetirementMap', empty));
  const invalid = { ...retirement, retirements: [{ ingredientId: 'ing_salmon', replacementIngredientId: '', rationale: 'implicit', approvedBy: 'editor', approvedAt: '2026-09-04T14:30:00Z' }] };
  assert.throws(() => registry.assert('ingredientRetirementMap', invalid), /schema validation failed/);
});


test('4P-B governance is mirrored in the normative spec and project Skill', async () => {
  const [spec, skill] = await Promise.all([
    readFile(path.join(root, 'specs/INGREDIENT_CURATION_PILOT_SPEC.md'), 'utf8'),
    readFile(path.join(root, 'skills/yourdietmanager-builder/SKILL.md'), 'utf8')
  ]);
  for (const text of [spec, skill]) {
    assert.match(text, /Foundation/);
    assert.match(text, /SR Legacy/);
    assert.match(text, /curated\/high/);
    assert.match(text, /20/);
  }
  assert.match(spec, /ingredient-curation-v1@1\.0\.0/);
  assert.match(skill, /Never fuzzy-merge|Never fuzzy source merges|do not use Branded or fuzzy source merges/i);
});
