import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';
import { readJson, writeJson } from './io-lib.mjs';
import { publishCatalogRelease } from './release-lib.mjs';

const canonical = process.argv.includes('--canonical');
const BUNDLE = 'corpus/production/v1-release-bundle.json';
const ELIGIBILITY = 'corpus/production/v1-release/recipe-eligibility.json';
const REVIEW = 'corpus/production/v1-release/stratified-review.json';
const BUILD_EVIDENCE = 'corpus/production/v1-release/build-evidence.json';
const OUTPUT = 'corpus/staging/runtime/v1-release-candidate';
const CATALOG_VERSION = '1.0.0';
const BUILT_AT = '2026-09-07T12:45:00.000Z';

const [bundle, eligibility, review, buildEvidence, scanPolicy] = await Promise.all([
  readJson(BUNDLE), readJson(ELIGIBILITY), readJson(REVIEW), readJson(BUILD_EVIDENCE), readJson('corpus/policies/v1-default.json')
]);
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const families = bundle.recipeFamilies.filter(item => item.status === 'active').sort((a,b) => a.recipeId.localeCompare(b.recipeId));
const versionIds = new Set(families.map(item => item.currentVersionId));
const versions = bundle.recipeVersions.filter(item => versionIds.has(item.recipeVersionId)).sort((a,b) => a.recipeVersionId.localeCompare(b.recipeVersionId));
const ingredientFamilies = bundle.ingredientFamilies.filter(item => item.status === 'active').sort((a,b) => a.ingredientId.localeCompare(b.ingredientId));
const revisionIds = new Set(ingredientFamilies.map(item => item.currentRevisionId));
for (const recipe of versions) for (const line of recipe.ingredientLines || []) revisionIds.add(line.ingredientRevisionId);
const ingredientRevisions = bundle.ingredientRevisions.filter(item => revisionIds.has(item.ingredientRevisionId)).sort((a,b) => a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));
if (families.length !== 500 || versions.length !== 500) throw new Error(`V1 publication requires 500/500 recipes, got ${families.length}/${versions.length}`);
if (ingredientFamilies.length !== 600 || ingredientRevisions.length !== 600) throw new Error(`V1 publication requires 600/600 ingredients, got ${ingredientFamilies.length}/${ingredientRevisions.length}`);
if (review.automatedStatus !== 'passed' || review.sampleSize !== 60 || review.strata.length !== 12) throw new Error('V1 publication requires passing stratified 60-recipe review evidence');

const scan = await scanCorpus({ policy:scanPolicy, catalogVersion:CATALOG_VERSION, recipeFamilies:families, recipeVersions:versions, ingredientFamilies, ingredientRevisions, requiredLocales:['it','en'], registry });
const quality = scan.quality;
const blocking = [];
for (const key of ['schemaErrors','unknownIngredientReferences','nutritionErrors','allergenDerivationErrors','missingRequiredLocaleFields']) if (quality[key] !== 0) blocking.push(`${key}=${quality[key]}`);
if (scan.similarity.exactDuplicateCount !== 0) blocking.push(`exactDuplicateCount=${scan.similarity.exactDuplicateCount}`);
if (scan.similarity.nearDuplicateCount !== 0) blocking.push(`nearDuplicateCount=${scan.similarity.nearDuplicateCount}`);
if (blocking.length) throw new Error(`V1 publication quality blockers: ${blocking.join(', ')}`);

const sourceCorpusDigest = await sha256Json({ recipeDigest:buildEvidence.recipeDigest, eligibilityPolicy:`${eligibility.policyId}@${eligibility.policyVersion}`, counts:buildEvidence.counts });
const sourceSnapshotId = `v1-release-${buildEvidence.recipeDigest.slice(0,16)}`;
const publication = {
  channel:'production_release',
  publicationId:`v1-release-500-${buildEvidence.recipeDigest.slice(0,12)}`,
  sourceCorpusDigest,
  sourceSnapshotId,
  requiredHumanReview:false,
  reviewRecipeCount:60,
  reviewPolicyVersion:'v1-stratified-semantic-review-1',
  releaseEligible:true
};
registry.assert('catalogPublication', publication);
const bytes = Buffer.byteLength(JSON.stringify([ingredientFamilies, ingredientRevisions, families, versions]));
const packs = [
  { packId:'core', labelKey:'catalog.pack.core.label', descriptionKey:'catalog.pack.core.description', required:true, estimatedBytes:bytes, recipeVersionIds:versions.map(item=>item.recipeVersionId) },
  { packId:'quick', labelKey:'catalog.pack.quick.label', descriptionKey:'catalog.pack.quick.description', required:false, estimatedBytes:0, recipeVersionIds:versions.filter(v => Number(v.practical.prepMinutes||0)+Number(v.practical.cookMinutes||0)<=20).map(v=>v.recipeVersionId) },
  { packId:'high_protein', labelKey:'catalog.pack.highProtein.label', descriptionKey:'catalog.pack.highProtein.description', required:false, estimatedBytes:0, recipeVersionIds:versions.filter(v => Number(v.calculatedNutrition.proteinG||0)>=35).map(v=>v.recipeVersionId) },
  { packId:'vegetarian', labelKey:'catalog.pack.vegetarian.label', descriptionKey:'catalog.pack.vegetarian.description', required:false, estimatedBytes:0, recipeVersionIds:versions.filter(v => (v.tags.diet||[]).includes('diet_vegetarian')).map(v=>v.recipeVersionId) }
];
const releaseDir = path.join(OUTPUT, 'release');
await rm(releaseDir, { recursive:true, force:true });
const manifest = await publishCatalogRelease({
  outputDir:releaseDir, catalogVersion:CATALOG_VERSION,
  taxonomies:bundle.taxonomies || [], taxonomyTerms:bundle.taxonomyTerms || [], referenceDataVersion:bundle.manifest.referenceDataVersion || '1.0.0',
  ingredientFamilies, ingredientRevisions, recipeFamilies:families, recipeVersions:versions,
  builtAt:BUILT_AT, appMinVersion:'1.0.0-rc.27', locales:['it','en'], pipelineVersion:'v1-release-recipe-generator-1', publication, packs, registry
});
const evidence = {
  schemaVersion:1, status:'release_candidate', manualAcceptanceRequired:true, manualAcceptanceStatus:'pending',
  catalogVersion:CATALOG_VERSION, appCandidateVersion:'1.0.0-rc.27', builtAt:BUILT_AT, publication,
  dataContract:{ ingredientFamilies:600, ingredientRevisions:600, recipeFamilies:500, recipeVersions:500, eligibilityPolicy:`${eligibility.policyId}@${eligibility.policyVersion}` },
  quality:{ ...quality, exactDuplicateCount:scan.similarity.exactDuplicateCount, nearDuplicateCount:scan.similarity.nearDuplicateCount, stratifiedReviewSampleSize:review.sampleSize, stratifiedReviewStatus:review.automatedStatus },
  recipeDigest:buildEvidence.recipeDigest
};
await writeJson('corpus/production/v1-release/release-candidate-evidence.json', evidence);
if (canonical) {
  const generated = path.join(releaseDir, 'data'); const target='public/data';
  await mkdir(target,{recursive:true});
  for (const name of ['ingredients','recipes','reference-data']) { await rm(path.join(target,name),{recursive:true,force:true}); await cp(path.join(generated,name),path.join(target,name),{recursive:true}); }
  await cp(path.join(generated,'catalog-manifest.json'),path.join(target,'catalog-manifest.json'));
}
console.log(JSON.stringify({ canonical, catalogVersion:manifest.catalogVersion, publication, counts:{ingredients:ingredientFamilies.length,revisions:ingredientRevisions.length,recipes:families.length,versions:versions.length}, quality:evidence.quality, packs:Object.fromEntries(packs.map(p=>[p.packId,p.recipeVersionIds.length])), evidence:'corpus/production/v1-release/release-candidate-evidence.json' },null,2));
