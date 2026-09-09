import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { ReferenceDataIndex, referenceDataDigest } from '../../src/services/referenceDataService.js';
import {
  PRODUCT_FOOD_TAXONOMY_ID, productFoodReferenceTaxonomy, productFoodReferenceTerms,
  classifyProductFood, validateProductFoodAssignment
} from '../../src/domain/productFoodTaxonomy.js';
import { readJson, writeJson } from './io-lib.mjs';

const SOURCE='corpus/production/planner-phase-b/bundle.json';
const OUTPUT_DIR='corpus/production/planner-phase-d';
const OUTPUT=`${OUTPUT_DIR}/bundle.json`;
const EVIDENCE=`${OUTPUT_DIR}/build-evidence.json`;
const CATALOG_VERSION='1.2.0-planner-phase-d';
const GENERATED_AT='2026-09-08T14:00:00.000Z';
const REFERENCE_DATA_VERSION='1.1.0-product-food';

const source=await readJson(SOURCE);
const registry=new SchemaRegistry(async file=>JSON.parse(await readFile(path.join('schemas',file),'utf8'))); await registry.loadAll();
if(source.recipeVersions.length!==1800||source.ingredientRevisions.length!==600) throw new Error('Phase D requires the Phase B 600/1800 baseline');

const taxonomy=productFoodReferenceTaxonomy({createdAt:GENERATED_AT});
const productTerms=productFoodReferenceTerms({createdAt:GENERATED_AT});
const taxonomies=[...(source.taxonomies||[]).filter(item=>item.taxonomyId!==PRODUCT_FOOD_TAXONOMY_ID),taxonomy].sort((a,b)=>a.taxonomyId.localeCompare(b.taxonomyId));
const taxonomyTerms=[...(source.taxonomyTerms||[]).filter(item=>item.taxonomyId!==PRODUCT_FOOD_TAXONOMY_ID),...productTerms].sort((a,b)=>a.termId.localeCompare(b.termId));
for(const item of taxonomies) registry.assert('taxonomy',item);
for(const item of taxonomyTerms) registry.assert('taxonomyTerm',item);
const index=new ReferenceDataIndex(taxonomies,taxonomyTerms);

const ingredientRevisions=[];
const categoryCounts={}; const subcategoryCounts={}; const conceptCounts={};
for(const sourceRevision of source.ingredientRevisions){
  const revision=structuredClone(sourceRevision);
  revision.catalogVersion=CATALOG_VERSION;
  revision.productTaxonomy=classifyProductFood(sourceRevision);
  revision.contentHash='';
  revision.contentHash=await sha256Json(revision);
  registry.assert('ingredientRevision',revision);
  validateProductFoodAssignment(index,revision);
  ingredientRevisions.push(revision);
  categoryCounts[revision.productTaxonomy.categoryId]=(categoryCounts[revision.productTaxonomy.categoryId]||0)+1;
  subcategoryCounts[revision.productTaxonomy.subcategoryId]=(subcategoryCounts[revision.productTaxonomy.subcategoryId]||0)+1;
  conceptCounts[revision.productTaxonomy.conceptId]=(conceptCounts[revision.productTaxonomy.conceptId]||0)+1;
}
ingredientRevisions.sort((a,b)=>a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));

const beforeRecipeDigest=await sha256Json(source.recipeVersions.map(item=>({recipeVersionId:item.recipeVersionId,contentHash:item.contentHash})));
const recipeVersions=structuredClone(source.recipeVersions).sort((a,b)=>a.recipeVersionId.localeCompare(b.recipeVersionId));
const afterRecipeDigest=await sha256Json(recipeVersions.map(item=>({recipeVersionId:item.recipeVersionId,contentHash:item.contentHash})));
if(beforeRecipeDigest!==afterRecipeDigest) throw new Error('Phase D must not modify RecipeVersion identity/content');
for(const recipe of recipeVersions){
  if(recipe.servingCount!==1) throw new Error(`Recipe ${recipe.recipeVersionId} is not fixed at servingCount=1`);
  for(const line of recipe.ingredientLines||[]) if(!Number.isFinite(line.normalizedAmount)||line.normalizedAmount<=0) throw new Error(`Invalid fixed quantity in ${recipe.recipeVersionId}`);
}
const noodles=ingredientRevisions.filter(item=>item.productTaxonomy.conceptId==='product_concept_noodles');
const dairy=ingredientRevisions.filter(item=>item.productTaxonomy.categoryId==='product_category_dairy');
if(noodles.length<10) throw new Error(`Expected >=10 noodle technical variants grouped under product_concept_noodles, got ${noodles.length}`);
if(dairy.length<10) throw new Error(`Expected explicit Dairy/Latticini coverage, got ${dairy.length}`);
const falseDairy=dairy.filter(item=>/tofu yogurt|imitation milk|milk substitute|cream substitute|mashed.*potato|salad dressing|margarine/i.test(item.i18n?.en?.name||''));
if(falseDairy.length) throw new Error(`Known non-dairy product false positives: ${falseDairy.map(item=>item.i18n.en.name).join('; ')}`);

const refDigest=await referenceDataDigest(taxonomies,taxonomyTerms);
const bundle={
  manifest:{
    schemaVersion:1,catalogVersion:CATALOG_VERSION,referenceDataVersion:REFERENCE_DATA_VERSION,referenceDataDigest:refDigest,
    source:{type:'planner-phase-d-taxonomy-enrichment',baseCatalogVersion:source.manifest?.catalogVersion||'1.1.0-planner-phase-b',recipeMutation:false,servingScalingAllowed:false},
    counts:{ingredientFamilies:source.ingredientFamilies.length,ingredientRevisions:ingredientRevisions.length,recipeFamilies:source.recipeFamilies.length,recipeVersions:recipeVersions.length},
    recipeDigest:afterRecipeDigest,builtAt:GENERATED_AT
  },
  taxonomies,taxonomyTerms,
  ingredientFamilies:structuredClone(source.ingredientFamilies).sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId)),
  ingredientRevisions,
  recipeFamilies:structuredClone(source.recipeFamilies).sort((a,b)=>a.recipeId.localeCompare(b.recipeId)),
  recipeVersions,
  catalogVersion:CATALOG_VERSION
};
await writeJson(OUTPUT,bundle);
await writeJson(EVIDENCE,{
  schemaVersion:1,status:'planner_validation_taxonomy',builtAt:GENERATED_AT,catalogVersion:CATALOG_VERSION,referenceDataVersion:REFERENCE_DATA_VERSION,
  productTaxonomy:{taxonomyId:PRODUCT_FOOD_TAXONOMY_ID,categoryCount:productTerms.filter(x=>x.parentTermId===null).length,termCount:productTerms.length,classifiedIngredientCount:ingredientRevisions.length,categoryCounts,subcategoryCounts,conceptCounts,noodleVariantCount:noodles.length,dairyIngredientCount:dairy.length,knownFalseDairyCount:falseDairy.length},
  invariants:{recipeMutation:false,recipeDigestBefore:beforeRecipeDigest,recipeDigestAfter:afterRecipeDigest,recipeDigestPreserved:beforeRecipeDigest===afterRecipeDigest,servingScalingAllowed:false,fixedServingCount:1}
});
console.log(JSON.stringify({output:OUTPUT,catalogVersion:CATALOG_VERSION,classifiedIngredients:ingredientRevisions.length,noodleVariants:noodles.length,dairy:dairy.length,recipeDigest:afterRecipeDigest,referenceDataDigest:refDigest},null,2));
