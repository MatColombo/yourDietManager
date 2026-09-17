import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { compileSourceBatches, CLEAN_CATALOG_EPOCH } from '../src/catalog/cleanCatalogCompiler.js';
import { installCompiledCatalog, validateCompiledCatalog } from '../src/services/cleanCatalogLoader.js';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader } from './helpers.mjs';

const root = path.resolve('.');
async function registry() { const r = new SchemaRegistry(fileLoader(path.join(root,'schemas'))); await r.loadAll(); return r; }

function fixtureBatch({ recipeRevision = 1, title = 'Pasta con zucchine', ingredientRevision = 1 } = {}) {
  return {
    schemaVersion:1, batchId:`fixture_${recipeRevision}_${ingredientRevision}`, records:[
      { kind:'taxonomy_term', id:'tax_category_vegetables', revision:1, status:'active', taxonomyType:'ingredient_category', parentId:null, labels:{it:'Verdure',en:'Vegetables'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_category_grains_starches', revision:1, status:'active', taxonomyType:'ingredient_category', parentId:null, labels:{it:'Cereali',en:'Grains'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_product_zucchini', revision:1, status:'active', taxonomyType:'product', parentId:'tax_category_vegetables', labels:{it:'Zucchina',en:'Zucchini'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_product_pasta', revision:1, status:'active', taxonomyType:'product', parentId:'tax_category_grains_starches', labels:{it:'Pasta',en:'Pasta'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_archetype_pasta_dish', revision:1, status:'active', taxonomyType:'recipe_archetype', parentId:null, labels:{it:'Piatto di pasta',en:'Pasta dish'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_cuisine_italian', revision:1, status:'active', taxonomyType:'cuisine', parentId:null, labels:{it:'Italiana',en:'Italian'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_meal_lunch', revision:1, status:'active', taxonomyType:'meal_type', parentId:null, labels:{it:'Pranzo',en:'Lunch'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_diet_vegan', revision:1, status:'active', taxonomyType:'diet_tag', parentId:null, labels:{it:'Vegana',en:'Vegan'}, aliases:{it:[],en:[]} },
      { kind:'taxonomy_term', id:'tax_practical_quick', revision:1, status:'active', taxonomyType:'practical_tag', parentId:null, labels:{it:'Veloce',en:'Quick'}, aliases:{it:[],en:[]} },
      { kind:'ingredient', id:'ing_zucchini_raw', revision:ingredientRevision, status:'active', productId:'tax_product_zucchini', categoryId:'tax_category_vegetables', state:{physical:'raw',preservation:'fresh',drained:false}, display:{it:'Zucchina cruda',en:'Raw zucchini'}, culinaryRoles:[], nutritionPer100g:{energyKcal:17,proteinG:1.2,carbohydrateG:3.1,fatG:0.3,fiberG:1}, allergens:[], dietFlags:{vegetarian:true,vegan:true}, source:{provider:'USDA_FDC',sourceId:'169291',description:'Zucchini, raw',retrievedOrVerifiedDate:'2026-09-17'} },
      { kind:'ingredient', id:'ing_pasta_dry', revision:1, status:'active', productId:'tax_product_pasta', categoryId:'tax_category_grains_starches', state:{physical:'dry',preservation:'dry',drained:false}, display:{it:'Pasta secca',en:'Dry pasta'}, culinaryRoles:[], nutritionPer100g:{energyKcal:371,proteinG:13,carbohydrateG:74.7,fatG:1.5,fiberG:3.2}, allergens:['gluten_cereals'], dietFlags:{vegetarian:true,vegan:true}, source:{provider:'USDA_FDC',sourceId:'168927',description:'Pasta, dry',retrievedOrVerifiedDate:'2026-09-17'} },
      { kind:'recipe', id:'recipe_pasta_zucchini', revision:recipeRevision, status:'active', title:{it:title,en:'Pasta with zucchini'}, description:{it:'Pasta semplice con zucchine.',en:'Simple pasta with zucchini.'}, cuisineIds:['tax_cuisine_italian'], mealTypeIds:['tax_meal_lunch'], archetypeId:'tax_archetype_pasta_dish', servings:1, ingredients:[{ingredientId:'ing_pasta_dry',grams:80},{ingredientId:'ing_zucchini_raw',grams:180}], prepMinutes:10, cookMinutes:20, practicalTagIds:['tax_practical_quick'], dietTagIds:['tax_diet_vegan'], steps:{it:['Cuoci la pasta.','Salta le zucchine.'],en:['Cook the pasta.','Saute the zucchini.']} }
    ]
  };
}

test('clean catalog compiler resolves authored source into runtime records and derived nutrition', async () => {
  const r = await registry();
  const catalog = await compileSourceBatches([{ filename:'fixture.json', batch:fixtureBatch() }], { registry:r });
  validateCompiledCatalog(catalog, r);
  assert.equal(catalog.ingredients.length,2);
  assert.equal(catalog.recipes.length,1);
  assert.equal(catalog.recipeVersions[0].ingredientLines[0].ingredientRevisionId,'ing_pasta_dry_r1');
  assert.ok(catalog.recipeVersions[0].calculatedNutrition.energyKcal > 300);
  assert.deepEqual(catalog.recipeVersions[0].allergenIds,['gluten_cereals']);
  assert.equal(catalog.catalogPacks[0].status,'installed');
});

test('highest revision wins and same revision conflict is rejected', async () => {
  const r = await registry();
  const first = fixtureBatch();
  const second = fixtureBatch({ recipeRevision:2, title:'Pasta alle zucchine' });
  second.batchId = 'fixture_revision_2';
  second.records = second.records.filter(row => row.kind === 'recipe');
  const catalog = await compileSourceBatches([{filename:'a.json',batch:first},{filename:'b.json',batch:second}],{registry:r});
  assert.equal(catalog.recipeVersions[0].versionNumber,2);
  assert.equal(catalog.recipeVersions[0].i18n.it.title,'Pasta alle zucchine');
  const conflict = structuredClone(second); conflict.batchId='fixture_conflict'; conflict.records[0].title.it='Titolo incompatibile';
  await assert.rejects(()=>compileSourceBatches([{filename:'a.json',batch:first},{filename:'b.json',batch:second},{filename:'c.json',batch:conflict}],{registry:r}),/conflicting definitions/);
});

test('clean catalog loader performs one-time lobotomy then replaces catalog while preserving configuration', async () => {
  const r = await registry();
  const repo = new MemoryRepository();
  await repo.put('ingredients',{schemaVersion:1,ingredientId:'legacy',origin:'base',currentRevisionId:'legacy_r1',status:'active',createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z'});
  await repo.put('appConfigs',{schemaVersion:1,locale:'it'});
  await repo.setMeta('dataEpoch','legacy');
  const first = await compileSourceBatches([{filename:'fixture.json',batch:fixtureBatch()}],{registry:r});
  const fetcher = async()=>new Response(JSON.stringify(first),{status:200,headers:{'content-type':'application/json'}});
  const installed = await installCompiledCatalog({repo,registry:r,fetcher});
  assert.equal(installed.reset,true);
  assert.equal(await repo.getMeta('dataEpoch'),CLEAN_CATALOG_EPOCH);
  assert.equal(await repo.get('ingredients','legacy'),undefined);
  assert.equal(await repo.get('appConfigs','active'),undefined);
  assert.equal((await repo.getAll('recipes')).length,1);

  await repo.put('appConfigs',{schemaVersion:1,locale:'it'});
  await repo.put('planInstances',{planInstanceId:'plan-old'});
  const updatedBatch = fixtureBatch({ recipeRevision:2, title:'Pasta alle zucchine' });
  const second = await compileSourceBatches([{filename:'fixture.json',batch:updatedBatch}],{registry:r});
  const result = await installCompiledCatalog({repo,registry:r,fetcher:async()=>new Response(JSON.stringify(second),{status:200})});
  assert.equal(result.reset,false);
  assert.equal(result.updated,true);
  assert.equal((await repo.get('appConfigs','active')).locale,'it');
  assert.equal((await repo.getAll('planInstances')).length,0);
  assert.equal((await repo.getAll('recipes')).length,1);
  assert.equal((await repo.getAll('recipeVersions'))[0].versionNumber,2);
});

test('repository foundation source compiles without legacy catalog artifacts', async () => {
  const r = await registry();
  const batch = JSON.parse(await readFile(path.join(root,'catalog-source','000-foundation.json'),'utf8'));
  const catalog = await compileSourceBatches([{filename:'000-foundation.json',batch}],{registry:r});
  assert.equal(catalog.ingredients.length,0);
  assert.equal(catalog.recipes.length,0);
  assert.ok(catalog.taxonomyTerms.some(term=>term.termId==='recipe_family_pasta_dish'));
});
