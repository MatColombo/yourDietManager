import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { processCandidateBatch } from '../../src/corpus/recipePipeline.js';
import { generateV1ReleaseCandidates } from '../../src/corpus/v1ReleaseRecipeGenerator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { readJson, writeJson } from './io-lib.mjs';

const SOURCE = 'corpus/production/current-working-bundle.json';
const ELIGIBILITY = 'corpus/production/v1-release/recipe-eligibility.json';
const OUTPUT = 'corpus/production/v1-release-bundle.json';
const CATALOG_VERSION = '1.0.0';
const GENERATED_AT = '2026-09-07T12:00:00.000Z';

const [source, eligibility, policy] = await Promise.all([
  readJson(SOURCE), readJson(ELIGIBILITY), readJson('corpus/policies/v1-default.json')
]);
const registry = new SchemaRegistry(async file => JSON.parse(await readFile(`schemas/${file}`, 'utf8')));
await registry.loadAll();

const activeIngredientFamilies = source.ingredientFamilies.filter(item => item.status === 'active').sort((a,b) => a.ingredientId.localeCompare(b.ingredientId));
const currentRevisionIds = new Set(activeIngredientFamilies.map(item => item.currentRevisionId));
const activeIngredientRevisions = source.ingredientRevisions.filter(item => currentRevisionIds.has(item.ingredientRevisionId)).sort((a,b) => a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));
if (activeIngredientFamilies.length !== 600 || activeIngredientRevisions.length !== 600) throw new Error(`V1 ingredient freeze requires 600/600 active families/revisions, got ${activeIngredientFamilies.length}/${activeIngredientRevisions.length}`);
const activeIds = new Set(activeIngredientFamilies.map(item => item.ingredientId));
for (const [role, config] of Object.entries(eligibility.roles)) for (const id of config.ingredientIds) if (!activeIds.has(id)) throw new Error(`Eligibility role ${role} references inactive ingredient ${id}`);

const allAllowed = [...new Set(Object.values(eligibility.roles).flatMap(role => role.ingredientIds))].sort();
const meals = ['breakfast','lunch','dinner','snack','mini_meal'];
const recipeFamilies = [];
const recipeVersions = [];
const diagnostics = {};
for (const meal of meals) {
  const target = eligibility.mealTargets[meal];
  const candidates = generateV1ReleaseCandidates({ meal, count: target.count, eligibility, corpus: source, multiplier: 18 });
  const job = {
    schemaVersion: 1,
    jobId: `v1-release-${meal}`,
    targetCatalogVersion: CATALOG_VERSION,
    seed: `v1-release-${meal}-2026-09-07`,
    pipelineVersion: 'v1-release-recipe-generator-1',
    sourceLocale: 'it',
    requiredLocales: ['it','en'],
    targetAcceptedCount: target.count,
    candidateCount: candidates.length,
    mealArchetypes: [meal],
    energyKcal: { min: target.energyKcal.min, max: target.energyKcal.max },
    proteinG: null,
    fiberG: null,
    maxTotalMinutes: null,
    coverageTargets: [],
    allowedIngredientIds: allAllowed,
    requiredTags: [], forbiddenTags: [], recipeFamilies: [], cuisineFocus: [], practicalityTargets: [],
    diversityTargets: { minDistinctPrimaryIngredients: 1, minDistinctIngredientIds: 1, maxPrimaryIngredientFrequency: target.count, maxIngredientPairFrequency: target.count }
  };
  const result = await processCandidateBatch({
    job, candidates, policy,
    ingredientFamilies: activeIngredientFamilies,
    ingredientRevisions: activeIngredientRevisions,
    existingRecipeVersions: recipeVersions,
    taxonomies: source.taxonomies || [], taxonomyTerms: source.taxonomyTerms || [], registry,
    generatedAt: GENERATED_AT
  });
  if (!result.targetMet || result.acceptedCount !== target.count) {
    const byCode = Object.fromEntries([...new Set(result.rejected.map(item => item.code))].map(code => [code, result.rejected.filter(item => item.code === code).length]));
    throw new Error(`V1 ${meal} accepted ${result.acceptedCount}/${target.count}; rejected=${JSON.stringify(byCode)}`);
  }
  recipeFamilies.push(...result.families);
  recipeVersions.push(...result.versions);
  diagnostics[meal] = { generatedCandidates: candidates.length, accepted: result.acceptedCount, rejected: result.rejectedCount, warnings: result.warnings.length, energyRange: { min: Math.min(...result.versions.map(v => v.calculatedNutrition.energyKcal)), max: Math.max(...result.versions.map(v => v.calculatedNutrition.energyKcal)) } };
}

recipeFamilies.sort((a,b) => a.recipeId.localeCompare(b.recipeId));
recipeVersions.sort((a,b) => a.recipeVersionId.localeCompare(b.recipeVersionId));
if (recipeFamilies.length !== 500 || recipeVersions.length !== 500) throw new Error(`V1 recipe freeze requires 500/500, got ${recipeFamilies.length}/${recipeVersions.length}`);
const recipeDigest = await sha256Json(recipeVersions.map(item => ({ recipeVersionId:item.recipeVersionId, contentHash:item.contentHash })));
const manifest = {
  schemaVersion: 1,
  catalogVersion: CATALOG_VERSION,
  referenceDataVersion: source.manifest?.referenceDataVersion || '1.0.0',
  referenceDataDigest: source.manifest?.referenceDataDigest || null,
  source: { type: 'v1-release-rebuild', sourceCatalogVersion: source.manifest?.catalogVersion || source.catalogVersion || null, eligibilityPolicy: `${eligibility.policyId}@${eligibility.policyVersion}` },
  counts: { ingredientFamilies:600, ingredientRevisions:600, recipeFamilies:500, recipeVersions:500 },
  recipeDigest,
  builtAt: GENERATED_AT
};
const bundle = {
  manifest,
  taxonomies: source.taxonomies || [], taxonomyTerms: source.taxonomyTerms || [],
  ingredientFamilies: activeIngredientFamilies, ingredientRevisions: activeIngredientRevisions,
  recipeFamilies, recipeVersions, catalogVersion: CATALOG_VERSION
};
await writeJson(OUTPUT, bundle);
await writeJson('corpus/production/v1-release/build-evidence.json', { schemaVersion:1, builtAt:GENERATED_AT, catalogVersion:CATALOG_VERSION, eligibilityPolicy:`${eligibility.policyId}@${eligibility.policyVersion}`, recipeDigest, counts:manifest.counts, diagnostics });
console.log(JSON.stringify({ output:OUTPUT, catalogVersion:CATALOG_VERSION, counts:manifest.counts, recipeDigest, diagnostics }, null, 2));
