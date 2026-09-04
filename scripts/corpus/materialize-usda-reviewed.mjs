import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { MEAL_ARCHETYPES } from '../../src/domain/configurationRules.js';
import { assertReferenceData, TAXONOMY_IDS } from '../../src/services/referenceDataService.js';
import { assertIngredientCurationPolicy, ingredientCurationRecordIssues } from '../../src/corpus/ingredientCuration.js';
import { readJson, writeJson } from './io-lib.mjs';

const input = process.argv[2];
const outDir = process.argv[3] || 'corpus/staging/ingredients-reviewed';
const catalogVersion = process.argv[4] || '1.0.0';
const policyFile = process.argv[5] || 'corpus/curation/v1-ingredient-curation-policy.json';
const contractFile = process.argv[6] || 'corpus/contracts/v1-production.json';
if (!input) {
  console.error('Usage: node scripts/corpus/materialize-usda-reviewed.mjs <review.json> [outDir] [catalogVersion] [curation-policy] [production-contract]');
  process.exit(2);
}

const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [doc, policy, contract, taxonomies, taxonomyTerms] = await Promise.all([
  readJson(input), readJson(policyFile), readJson(contractFile), readJson('public/data/reference-data/taxonomies-0001.json'), readJson('public/data/reference-data/taxonomy-terms-0001.json')
]);
assertIngredientCurationPolicy(policy, contract, registry);
registry.assert('ingredientCurationBatch', doc);
if (doc.policyId !== policy.policyId || doc.policyVersion !== policy.policyVersion) throw new Error(`Curation batch ${doc.batchId} is not bound to ${policy.policyId}@${policy.policyVersion}`);
const referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry);
const families = [];
const revisions = [];
const createdAt = new Date().toISOString();

for (const row of doc.records || []) {
  if (row.review?.decision !== 'approved' || row.review?.approved !== true) continue;
  const issues = ingredientCurationRecordIssues(row, { policy, referenceIndex });
  if (issues.length) throw new Error(`Approved ${row.sourceRecordId} fails curation gate: ${issues.join(', ')}`);
  const ingredientId = row.suggested.ingredientId;
  const ingredientRevisionId = `${ingredientId}_r1`;
  const foodGroup = row.suggested.foodGroup;
  const foodSubgroup = row.suggested.foodSubgroup || null;
  const flavorProfile = row.suggested.flavorProfile || 'flavor_neutral';
  const mealArchetypes = [...new Set(row.suggested.mealArchetypes?.length ? row.suggested.mealArchetypes : MEAL_ARCHETYPES)];

  referenceIndex.assertTerm(foodGroup, TAXONOMY_IDS.foodCategory);
  if (foodSubgroup) {
    const subgroup = referenceIndex.assertTerm(foodSubgroup, TAXONOMY_IDS.foodCategory);
    if (subgroup.parentTermId !== foodGroup) throw new Error(`Approved ${row.sourceRecordId} has subgroup ${foodSubgroup} outside group ${foodGroup}`);
  }
  referenceIndex.assertTerm(flavorProfile, TAXONOMY_IDS.flavorProfile);
  if (!mealArchetypes.length || mealArchetypes.some(value => !MEAL_ARCHETYPES.includes(value))) throw new Error(`Approved ${row.sourceRecordId} has invalid MealArchetype selection`);

  const revision = {
    schemaVersion: 1, ingredientRevisionId, ingredientId, revisionNumber: 1, origin: 'base', catalogVersion,
    i18n: { it: { name: row.suggested.nameIt.trim(), aliases: row.suggested.aliasesIt || [] }, en: { name: row.suggested.nameEn.trim(), aliases: row.suggested.aliasesEn || [] } },
    basis: { amount: 100, unit: 'g', state: row.suggested.state },
    nutrition: { energyKcal: row.nutrition.energyKcal, proteinG: row.nutrition.proteinG, carbsG: row.nutrition.carbsG, fatG: row.nutrition.fatG, fiberG: row.nutrition.fiberG, ...Object.fromEntries(Object.entries({ sugarsG: row.nutrition.sugarsG, saturatedFatG: row.nutrition.saturatedFatG, sodiumMg: row.nutrition.sodiumMg }).filter(([, value]) => value != null)) },
    taxonomy: { foodGroup, foodSubgroup, flavorProfile, mealArchetypes },
    allergenIds: row.suggested.allergenIds || [], conversions: row.suggested.conversions || [],
    source: { type: 'imported', label: `${doc.source.provider} ${doc.source.dataset} ${doc.source.release}`, reference: doc.source.reference, sourceRecordId: row.sourceRecordId, checkedAt: row.review.reviewedAt || createdAt, licenseNote: `${doc.source.license}; source batch ${doc.batchId}; input digest ${doc.source.inputDigest}` },
    quality: { status: 'curated', confidence: 'high', notes: row.review.notes || null }, contentHash: '', createdAt
  };
  revision.contentHash = await sha256Json({ ...revision, contentHash: '' });
  const family = { schemaVersion: 1, ingredientId, origin: 'base', currentRevisionId: ingredientRevisionId, status: 'active', createdAt, updatedAt: createdAt };
  registry.assert('ingredient', family); registry.assert('ingredientRevision', revision);
  revisions.push(revision); families.push(family);
}

await writeJson(`${outDir}/ingredient-families.json`, families);
await writeJson(`${outDir}/ingredient-revisions.json`, revisions);
await writeJson(`${outDir}/materialization-manifest.json`, { schemaVersion: 1, batchId: doc.batchId, sourceId: doc.source.sourceId, sourceInputDigest: doc.source.inputDigest, policyId: policy.policyId, policyVersion: policy.policyVersion, catalogVersion, materializedAt: createdAt, ingredientCount: revisions.length, ingredientIds: families.map(item => item.ingredientId) });
console.log(`Materialized ${revisions.length} explicitly reviewed ingredients.`);
