import { sha256Json } from '../../src/lib/crypto.js';
import { MEAL_ARCHETYPES } from '../../src/domain/configurationRules.js';
import { assertReferenceData, TAXONOMY_IDS } from '../../src/services/referenceDataService.js';
import { readJson, writeJson } from './io-lib.mjs';

const input = process.argv[2];
const outDir = process.argv[3] || 'corpus/staging/ingredients-reviewed';
const catalogVersion = process.argv[4] || '1.0.0';
if (!input) {
  console.error('Usage: node scripts/corpus/materialize-usda-reviewed.mjs <review.json> [outDir] [catalogVersion]');
  process.exit(2);
}

const doc = await readJson(input);
const taxonomies = await readJson('public/data/reference-data/taxonomies-0001.json');
const taxonomyTerms = await readJson('public/data/reference-data/taxonomy-terms-0001.json');
const referenceIndex = assertReferenceData(taxonomies, taxonomyTerms);
const families = [];
const revisions = [];
const createdAt = new Date().toISOString();

for (const row of doc.records || []) {
  if (!row.review?.approved) continue;
  if (!row.suggested?.nameIt?.trim()) throw new Error(`Approved ${row.sourceRecordId} is missing nameIt`);
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
    schemaVersion: 1,
    ingredientRevisionId,
    ingredientId,
    revisionNumber: 1,
    origin: 'base',
    catalogVersion,
    i18n: {
      it: { name: row.suggested.nameIt.trim(), aliases: row.suggested.aliasesIt || [] },
      en: { name: row.suggested.nameEn.trim(), aliases: row.suggested.aliasesEn || [] }
    },
    basis: { amount: 100, unit: 'g', state: row.suggested.state || 'unknown' },
    nutrition: {
      energyKcal: row.nutrition.energyKcal,
      proteinG: row.nutrition.proteinG,
      carbsG: row.nutrition.carbsG,
      fatG: row.nutrition.fatG,
      fiberG: row.nutrition.fiberG,
      ...Object.fromEntries(Object.entries({ sugarsG: row.nutrition.sugarsG, saturatedFatG: row.nutrition.saturatedFatG, sodiumMg: row.nutrition.sodiumMg }).filter(([, value]) => value != null))
    },
    taxonomy: { foodGroup, foodSubgroup, flavorProfile, mealArchetypes },
    allergenIds: row.suggested.allergenIds || [],
    conversions: row.suggested.conversions || [],
    source: {
      type: 'imported',
      label: `USDA FoodData Central Foundation Foods ${doc.source.release}`,
      reference: doc.source.reference,
      sourceRecordId: row.sourceRecordId,
      checkedAt: createdAt,
      licenseNote: doc.source.license
    },
    quality: { status: 'curated', confidence: 'high', notes: row.review.notes || null },
    contentHash: '',
    createdAt
  };
  revision.contentHash = await sha256Json({ ...revision, contentHash: '' });
  revisions.push(revision);
  families.push({ schemaVersion: 1, ingredientId, origin: 'base', currentRevisionId: ingredientRevisionId, status: 'active', createdAt, updatedAt: createdAt });
}

await writeJson(`${outDir}/ingredient-families.json`, families);
await writeJson(`${outDir}/ingredient-revisions.json`, revisions);
console.log(`Materialized ${revisions.length} reviewed ingredients.`);
