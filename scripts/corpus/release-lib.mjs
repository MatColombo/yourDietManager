import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CALCULATION_ALGORITHM_VERSION, calculateRecipeNutrition, deriveAllergens } from '../../src/domain/nutritionCore.js';
import { sha256Json, sha256Text } from '../../src/lib/crypto.js';
import { evaluateReleaseGates, scanCorpus } from '../../src/corpus/corpusScanner.js';
import { assertReferenceData, assertSemanticReferences, referenceDataDigest } from '../../src/services/referenceDataService.js';

function chunk(values, size) { const out=[]; for(let i=0;i<values.length;i+=size) out.push(values.slice(i,i+size)); return out; }
function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function idKey(part) { return ({ taxonomies:'taxonomyId', taxonomyTerms:'termId', ingredientFamilies:'ingredientId', ingredientRevisions:'ingredientRevisionId', recipeFamilies:'recipeId', recipeVersions:'recipeVersionId' })[part]; }
function partDir(part) { if (part === 'taxonomies' || part === 'taxonomyTerms') return 'reference-data'; return part.startsWith('ingredient') ? 'ingredients' : 'recipes'; }
function partStem(part) { return ({ taxonomies:'taxonomies', taxonomyTerms:'taxonomy-terms', ingredientFamilies:'ingredient-families', ingredientRevisions:'ingredient-revisions', recipeFamilies:'recipe-families', recipeVersions:'recipe-versions' })[part]; }

export async function validateReleaseData({ policy, catalogVersion, taxonomies = [], taxonomyTerms = [], ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, registry, requiredLocales = ['it','en'], requireCuratedIngredients = false }) {
  const issues=[];
  let referenceIndex = null;
  try { referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry); } catch (error) { issues.push({ code:'reference_data_invalid', detail:error.message }); }
  const revisionById=new Map(ingredientRevisions.map(r=>[r.ingredientRevisionId,r])); const ingredientIds=new Set(ingredientFamilies.map(r=>r.ingredientId)); const recipeIds=new Set(recipeFamilies.map(r=>r.recipeId)); const versionIds=new Set(recipeVersions.map(r=>r.recipeVersionId));
  for(const record of ingredientFamilies) { try{registry?.assert('ingredient',record);}catch(error){issues.push({code:'ingredient_schema',id:record.ingredientId,detail:error.message});} if(!revisionById.has(record.currentRevisionId)) issues.push({code:'missing_current_revision',id:record.ingredientId}); }
  for(const revision of ingredientRevisions) {
    try{registry?.assert('ingredientRevision',revision);}catch(error){issues.push({code:'ingredient_revision_schema',id:revision.ingredientRevisionId,detail:error.message});}
    if(!revision.source?.label || !revision.source?.type) issues.push({code:'missing_ingredient_source',id:revision.ingredientRevisionId});
    if(requireCuratedIngredients && (revision.quality?.status !== 'curated' || revision.quality?.confidence !== 'high')) issues.push({code:'ingredient_not_curated_high_confidence',id:revision.ingredientRevisionId});
    for(const key of ['energyKcal','proteinG','carbsG','fatG','fiberG']) if(!Number.isFinite(revision.nutrition?.[key]) || revision.nutrition[key] < 0) issues.push({code:'invalid_ingredient_nutrition',id:revision.ingredientRevisionId,field:key});
    const expected = await sha256Json({ ...revision, contentHash:'' }); if(revision.contentHash !== expected) issues.push({code:'ingredient_content_hash_mismatch',id:revision.ingredientRevisionId});
  }
  for(const family of recipeFamilies) { try{registry?.assert('recipe',family);}catch(error){issues.push({code:'recipe_schema',id:family.recipeId,detail:error.message});} if(!versionIds.has(family.currentVersionId)) issues.push({code:'missing_current_recipe_version',id:family.recipeId}); }
  for(const version of recipeVersions) {
    try{registry?.assert('recipeVersion',version);}catch(error){issues.push({code:'recipe_version_schema',id:version.recipeVersionId,detail:error.message});}
    if(!recipeIds.has(version.recipeId)) issues.push({code:'missing_recipe_family',id:version.recipeVersionId});
    const byId=new Map(); for(const line of version.ingredientLines||[]) { const rev=revisionById.get(line.ingredientRevisionId); if(!ingredientIds.has(line.ingredientId)||!rev||rev.ingredientId!==line.ingredientId) issues.push({code:'unknown_ingredient_reference',id:version.recipeVersionId,ingredientId:line.ingredientId}); else byId.set(rev.ingredientRevisionId,rev); }
    if(byId.size === (version.ingredientLines||[]).length) {
      try { const nutrition=calculateRecipeNutrition(version.ingredientLines,byId); if(JSON.stringify(nutrition)!==JSON.stringify(version.calculatedNutrition)) issues.push({code:'nutrition_mismatch',id:version.recipeVersionId}); const allergens=deriveAllergens(version.ingredientLines,byId); if(JSON.stringify(allergens)!==JSON.stringify([...(version.allergenIds||[])].sort())) issues.push({code:'allergen_mismatch',id:version.recipeVersionId}); } catch(error){issues.push({code:'nutrition_recalc_error',id:version.recipeVersionId,detail:error.message});}
      const inputDigest=await sha256Json({ calculationAlgorithmVersion:version.calculationAlgorithmVersion, ingredientLines:(version.ingredientLines||[]).map(line=>({ingredientRevisionId:line.ingredientRevisionId,normalizedAmount:line.normalizedAmount,normalizedUnit:line.normalizedUnit})) }); if(inputDigest!==version.inputDigest) issues.push({code:'input_digest_mismatch',id:version.recipeVersionId});
    }
    for(const locale of requiredLocales) if(!version.i18n?.[locale]?.title?.trim() || !version.i18n?.[locale]?.instructions?.length) issues.push({code:'missing_locale',id:version.recipeVersionId,locale});
    const contentHash=await sha256Json({ ...version, contentHash:'' }); if(contentHash!==version.contentHash) issues.push({code:'recipe_content_hash_mismatch',id:version.recipeVersionId});
  }
  if (referenceIndex) {
    try { assertSemanticReferences({ index: referenceIndex, ingredientRevisions, recipeVersions, ingredientIds: ingredientFamilies.map(item => item.ingredientId) }); }
    catch (error) { issues.push({ code:'semantic_reference_invalid', detail:error.message }); }
  }
  const snapshot=await scanCorpus({policy,catalogVersion,ingredientFamilies,ingredientRevisions,recipeFamilies,recipeVersions,requiredLocales,registry}); const gates=evaluateReleaseGates(snapshot,policy);
  return { valid:issues.length===0 && gates.passed, issues, snapshot, releaseGates:gates };
}

export async function publishCatalogRelease({ outputDir, catalogVersion, taxonomies = [], taxonomyTerms = [], referenceDataVersion = '1.0.0', ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions, builtAt = new Date().toISOString(), appMinVersion = '0.4.0', locales = ['it','en'], pipelineVersion = 'recipe-pipeline-1', shardSize = 250, packs = null, registry = null }) {
  await rm(outputDir,{recursive:true,force:true}); const dataDir=path.join(outputDir,'data'); await mkdir(dataDir,{recursive:true});
  const referenceIndex = assertReferenceData(taxonomies, taxonomyTerms, registry);
  assertSemanticReferences({ index: referenceIndex, ingredientRevisions, recipeVersions, ingredientIds: ingredientFamilies.map(item => item.ingredientId) });
  const refDigest = await referenceDataDigest(taxonomies, taxonomyTerms);
  const parts={ taxonomies, taxonomyTerms, ingredientFamilies, ingredientRevisions, recipeFamilies, recipeVersions }; const manifestParts={};
  for(const [part,records] of Object.entries(parts)) {
    const dir=path.join(dataDir,partDir(part)); await mkdir(dir,{recursive:true}); const shards=[]; const groups=chunk(records,shardSize);
    for(let index=0;index<groups.length;index+=1) { const recordsChunk=groups[index]; const name=`${partStem(part)}-${String(index+1).padStart(4,'0')}.json`; const rel=`${partDir(part)}/${name}`; const text=jsonText(recordsChunk); await writeFile(path.join(dataDir,rel),text); shards.push({path:rel,count:recordsChunk.length,sha256:await sha256Text(text),recordIds:recordsChunk.map(record=>record[idKey(part)])}); }
    manifestParts[part]={count:records.length,shards};
  }
  const allVersionIds=recipeVersions.map(record=>record.recipeVersionId); const derivedPacks=packs || [
    {packId:'core',labelKey:'catalog.pack.core.label',descriptionKey:'catalog.pack.core.description',required:true,estimatedBytes:Buffer.byteLength(jsonText(recipeVersions)),recipeVersionIds:allVersionIds},
    {packId:'quick',labelKey:'catalog.pack.quick.label',descriptionKey:'catalog.pack.quick.description',required:false,estimatedBytes:0,recipeVersionIds:recipeVersions.filter(v=>(v.practical.prepMinutes+v.practical.cookMinutes)<=20).map(v=>v.recipeVersionId)},
    {packId:'high_protein',labelKey:'catalog.pack.highProtein.label',descriptionKey:'catalog.pack.highProtein.description',required:false,estimatedBytes:0,recipeVersionIds:recipeVersions.filter(v=>v.calculatedNutrition.proteinG>=35).map(v=>v.recipeVersionId)},
    {packId:'vegetarian',labelKey:'catalog.pack.vegetarian.label',descriptionKey:'catalog.pack.vegetarian.description',required:false,estimatedBytes:0,recipeVersionIds:recipeVersions.filter(v=>(v.tags.diet||[]).includes('diet_vegetarian')).map(v=>v.recipeVersionId)}
  ];
  const manifest={schemaVersion:1,catalogVersion,builtAt,referenceDataVersion,referenceDataDigest:refDigest,appCompatibility:{minVersion:appMinVersion,maxVersion:null},locales,pipelineVersion,calculationAlgorithmVersion:CALCULATION_ALGORITHM_VERSION,...manifestParts,packs:derivedPacks}; registry?.assert('catalogManifest',manifest); await writeFile(path.join(dataDir,'catalog-manifest.json'),jsonText(manifest)); return manifest;
}
