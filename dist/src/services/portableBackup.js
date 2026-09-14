import { EXTENSION_STORES, validateBatchLinks, assertExtensionSettings, extensionDefaults, assertCivilDate } from '../domain/productExtensions.js';
import { STORE_DEFINITIONS } from '../db/constants.js';
import { canonicalJson, sha256Json } from '../lib/crypto.js';
import { assertConfigurationBundle } from './configurationService.js';
import { ReferenceDataIndex } from './referenceDataService.js';
import { assertFoodPreferencesV2, assertSafetyProfileV2 } from '../domain/revisionV2Contracts.js';
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const portableMetaKey = key => /^(lastSuccessfulGenerationRunId|activePlanInstanceId|activeCatalogVersion|catalogManifest(?::.*)?|referenceDataVersion|referenceDataDigest|contentSchemaVersion|dbVersion|contentMigration:[1-5]|preV1DataEpoch|dataEpoch|bootstrapConfigurationSource|bootstrapConfigurationVersion|configurationUpdatedAt|planUpdatedAt|recipePresentation:R2|foodPresentation:R2|phase2OnboardingDraft|configurationOnboardingComplete|configurationOnboardingCompletedAt|profileDeclaration:R4|revisionV2:configurationDraft|shoppingSettings:R6|productExtensions:R8|operationHistory:.*|planCommand:.*|approvedMealCompositions)$/.test(key);
export const recordKey = (store, row) => store === 'appConfigs' ? 'active' : Array.isArray(STORE_DEFINITIONS[store].keyPath) ? STORE_DEFINITIONS[store].keyPath.map(k => row[k]) : row[STORE_DEFINITIONS[store].keyPath];
export async function snapshotRepository(repo) {
  if (repo.snapshot) return repo.snapshot(Object.keys(STORE_DEFINITIONS));
  return Object.fromEntries(await Promise.all(Object.keys(STORE_DEFINITIONS).map(async s => [s, await repo.getAll(s)])));
}
export function snapshotReader(snapshot) {
  return {getAll: async store => structuredClone(snapshot[store] || []), get: async (store,key) => structuredClone((snapshot[store]||[]).find(r=>canonicalJson(recordKey(store,r))===canonicalJson(key))), getMeta: async key => structuredClone(snapshot.meta.find(r=>r.key===key)?.value)};
}
export function parseBackupText(text) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 64 MiB');
  return JSON.parse(text);
}
const schemas = {recipeFavorites:'recipeFavorite',savedMenus:'savedMenu',pantryEntries:'pantryEntry',productionBatches:'productionBatch',seasonalityProfiles:'seasonalityProfile',ingredientPrices:'ingredientPrice',appConfigs:'appConfig',nutritionProfiles:'nutritionProfile',allergyIntoleranceProfiles:'allergyIntoleranceProfile',foodPreferences:'foodPreferences',themeProfiles:'themeProfile',mealClasses:'mealClass',dayClasses:'dayClass',cycles:'cycle',taxonomies:'taxonomy',taxonomyTerms:'taxonomyTerm',ingredients:'ingredient',ingredientRevisions:'ingredientRevision',recipes:'recipe',recipeVersions:'recipeVersion',planInstances:'planInstance',calendarDays:'calendarDay',generationRuns:'generationRun',operations:'operation',shoppingChecklists:'shoppingChecklist',recipeHumanReviews:'recipeHumanReview',catalogPacks:'catalogPack',foodGroups:'foodGroup',ingredientMappings:'ingredientMapping',ingredientConversions:'ingredientConversion'};
export async function validatePortable(document, registry) {
  const original = document.payload.portableSnapshot;
  if(document.formatVersion===3&&EXTENSION_STORES.some(s=>Object.hasOwn(original||{},s)))throw new Error('Backup 3 cannot carry R8 stores');
  const data = document.formatVersion===3 && original ? {...original,...Object.fromEntries(EXTENSION_STORES.map(s=>[s,[]]))} : original;
  if (!data || Object.keys(data).length !== Object.keys(STORE_DEFINITIONS).length) throw new Error('Incomplete portable snapshot');
  const maps = {};
  for (const store of Object.keys(STORE_DEFINITIONS)) {
    if (!Array.isArray(data[store])) throw new Error(`Missing backup store ${store}`);
    maps[store] = new Map();
    for (const row of data[store]) {
      if (store !== 'meta') registry.assert(schemas[store], row);
      else if (!row || !portableMetaKey(row.key) || !Object.hasOwn(row,'value')) throw new Error('Unsupported backup metadata');
      const key = recordKey(store,row); const encoded = canonicalJson(key);
      if (key == null || maps[store].has(encoded)) throw new Error(`Duplicate/invalid backup key in ${store}`);
      maps[store].set(encoded,row);
    }
  }
  const has = (s,id) => maps[s].has(canonicalJson(id));
  const requireRef = (s,id) => {if (id != null && !has(s,id)) throw new Error(`Orphan backup reference ${s}: ${id}`);};
  for (const f of data.ingredients) {requireRef('ingredientRevisions',f.currentRevisionId); if(maps.ingredientRevisions.get(canonicalJson(f.currentRevisionId))?.ingredientId!==f.ingredientId)throw new Error('Ingredient pointer family mismatch');}
  for (const f of data.recipes) {requireRef('recipeVersions',f.currentVersionId); if(maps.recipeVersions.get(canonicalJson(f.currentVersionId))?.recipeId!==f.recipeId)throw new Error('Recipe pointer family mismatch');}
  for (const r of data.ingredientRevisions) {
    requireRef('ingredients',r.ingredientId);
    if(r.schemaVersion===2 && r.contentHash !== await sha256Json({...r,contentHash:''}))throw new Error('Ingredient content checksum mismatch');
  }
  for (const r of data.recipeVersions) {
    requireRef('recipes',r.recipeId);
    if(r.schemaVersion===2 && r.contentHash !== await sha256Json({...r,contentHash:''}))throw new Error('Recipe content checksum mismatch');
    for(const l of r.ingredientLines){requireRef('ingredientRevisions',l.ingredientRevisionId);requireRef('ingredients',l.ingredientId);if(maps.ingredientRevisions.get(canonicalJson(l.ingredientRevisionId))?.ingredientId!==l.ingredientId)throw new Error('Recipe ingredient family mismatch');}
  }
  // Validate frozen references also inside undo/redo snapshots; deleted days/plans may live only in history.
  function frozenRefs(value, depth=0) {
    if(depth>80)throw new Error('Backup nesting too deep');
    if(!value || typeof value!=='object')return;
    for(const [key,v] of Object.entries(value)) {
      if(['__proto__','constructor','prototype'].includes(key))throw new Error('Unsafe imported property');
      if(['recipeVersionId','ingredientRevisionId','sourceRevisionId','targetRevisionId'].includes(key) && typeof v==='string') requireRef(key==='recipeVersionId'?'recipeVersions':'ingredientRevisions',v);
      if(['categoryId','subcategoryId','conceptId'].includes(key) && typeof v==='string' && v.startsWith('product_'))requireRef('taxonomyTerms',v);
      frozenRefs(v,depth+1);
    }
  }
  for(const op of data.operations) for(const snapshot of [op.before,op.after]) {
    for(const key of Object.keys(snapshot))if(!['puts','deletes','metaSet','metaDelete'].includes(key))throw new Error('Unsupported operation snapshot');
    for(const [store,rows] of Object.entries(snapshot.puts||{})) { if(!['calendarDays','planInstances','generationRuns','productionBatches'].includes(store))throw new Error('Unsafe history store');for(const row of rows)registry.assert(schemas[store],row); }
    for(const store of Object.keys(snapshot.deletes||{}))if(!['calendarDays','planInstances','generationRuns','productionBatches'].includes(store))throw new Error('Unsafe history deletion');
    for(const key of [...Object.keys(snapshot.metaSet||{}),...(snapshot.metaDelete||[])])if(!['activePlanInstanceId','lastSuccessfulGenerationRunId','planUpdatedAt'].includes(key))throw new Error('Unsafe history metadata');
  }
  frozenRefs(data);
  for(const term of data.taxonomyTerms){requireRef('taxonomies',term.taxonomyId);requireRef('taxonomyTerms',term.parentTermId);const seen=new Set([term.termId]);let parent=term.parentTermId;while(parent){if(seen.has(parent))throw new Error('Taxonomy cycle');seen.add(parent);parent=maps.taxonomyTerms.get(canonicalJson(parent))?.parentTermId;}}
  for(const pack of data.catalogPacks) if(pack.status==='installed') for(const id of pack.recipeVersionIds)requireRef('recipeVersions',id);
  for(const row of data.meta) if(row.key==='catalogManifest'||row.key.startsWith('catalogManifest:'))registry.assert('catalogManifest',row.value);
  for(const day of data.calendarDays)requireRef('planInstances',day.planInstanceId);
  for(const plan of data.planInstances)requireRef('planInstances',plan.previousPlanInstanceId);
  for(const c of data.shoppingChecklists)requireRef('planInstances',c.planInstanceId);
  for(const e of data.ingredientConversions){requireRef('ingredients',e.fromIngredientId);requireRef('ingredients',e.toIngredientId);if(e.purpose==='unit'&&e.fromIngredientId!==e.toIngredientId)throw new Error('Unit conversion changes form');}
  for(const m of data.ingredientMappings){requireRef('ingredients',m.sourceIngredientId);if(m.status==='approved')requireRef('ingredients',m.targetIngredientId);}
  for(const g of data.foodGroups)for(const member of g.members)requireRef(member.type==='ingredient'?'ingredients':'taxonomyTerms',member.id);
  const config = document.payload.configuration;
  const configStores={appConfigs:config.appConfig?[config.appConfig]:[],...Object.fromEntries(['nutritionProfiles','allergyIntoleranceProfiles','foodPreferences','themeProfiles','mealClasses','dayClasses','cycles'].map(k=>[k,config[k]||[]]))};
  for(const [s,rows] of Object.entries(configStores))if(canonicalJson(rows)!==canonicalJson(data[s]))throw new Error('Conflicting backup configuration');
  if(config.appConfig)assertConfigurationBundle(config,registry);
  const latest=new Map();for(const g of data.foodGroups)if(!latest.has(g.id)||latest.get(g.id).version<g.version)latest.set(g.id,g);
  const ctx={registry,index:new ReferenceDataIndex(data.taxonomies,data.taxonomyTerms),ingredients:data.ingredients,foodGroups:[...latest.values()],mealClasses:data.mealClasses};
  for(const p of data.foodPreferences)if(p.schemaVersion===2)assertFoodPreferencesV2(p,ctx);
  for(const p of data.allergyIntoleranceProfiles)if(p.schemaVersion===2)assertSafetyProfileV2(p,ctx);
  const staged = data.meta.find(row=>row.key==='revisionV2:configurationDraft')?.value;
  if(staged?.foodPreferences)registry.assert('food-preferences-v2.schema.json',staged.foodPreferences);
  if(staged?.safetyProfile)registry.assert('allergy-intolerance-profile-v2.schema.json',staged.safetyProfile);
  const shopping = data.meta.find(row=>row.key==='shoppingSettings:R6')?.value;
  if(shopping) {
    if(!Array.isArray(shopping.departmentOrder)||shopping.departmentOrder.some(id=>typeof id!=='string')||new Set(shopping.departmentOrder).size!==shopping.departmentOrder.length||!Array.isArray(shopping.purchaseChoices))throw new Error('Invalid shopping settings');
    const seen=new Set();for(const choice of shopping.purchaseChoices){const edge=data.ingredientConversions.find(e=>e.conversionId===choice.conversionId&&e.version===choice.version&&e.fromIngredientId===choice.fromIngredientId&&e.fromUnit===choice.fromUnit);const key=`${choice.fromIngredientId}:${choice.fromUnit}`;if(seen.has(key)||!edge||edge.reviewStatus!=='reviewed'||!edge.sourceRef.trim())throw new Error('Unresolved shopping preference');seen.add(key);}
  }
  for(const f of data.recipeFavorites)requireRef('recipes',f.recipeId);
  for(const menu of data.savedMenus){const offsets=new Set();for(const day of menu.days){if(offsets.has(day.offset))throw new Error('Duplicate menu date');offsets.add(day.offset);const keys=new Set();for(const slot of day.slots){const key=`${slot.mealClassId}:${slot.ordinal}`;if(keys.has(key))throw new Error('Duplicate menu slot');keys.add(key);for(const c of slot.components){requireRef('recipeVersions',c.recipeVersionId);if(maps.recipeVersions.get(canonicalJson(c.recipeVersionId)).recipeId!==c.recipeId)throw new Error('Menu recipe family mismatch');}}}}
  const conceptRef=id=>{requireRef('taxonomyTerms',id);const term=maps.taxonomyTerms.get(canonicalJson(id)),parent=maps.taxonomyTerms.get(canonicalJson(term.parentTermId));if(term.taxonomyId!=='product_food'||!parent?.parentTermId)throw new Error('Food concept required');};
  const pantryKeys=new Set();for(const entry of data.pantryEntries){conceptRef(entry.conceptId);requireRef('ingredients',entry.ingredientId);if(entry.expiresOn)assertCivilDate(entry.expiresOn);if(entry.ingredientId){const family=maps.ingredients.get(canonicalJson(entry.ingredientId)),form=maps.ingredientRevisions.get(canonicalJson(family.currentRevisionId));if(form.productTaxonomy?.conceptId!==entry.conceptId)throw new Error('Pantry form concept mismatch');}if(entry.quantity!==null&&(!entry.ingredientId||!entry.unit))throw new Error('Unknown pantry form cannot have quantity');if(entry.quantity===null&&entry.unit!==null)throw new Error('Unknown pantry amount cannot have unit');const key=entry.ingredientId||entry.conceptId;if(pantryKeys.has(key))throw new Error('Duplicate pantry food');pantryKeys.add(key);}
  for(const area of data.seasonalityProfiles){const seen=new Set();for(const entry of area.entries){conceptRef(entry.conceptId);if(seen.has(entry.conceptId)||!entry.sourceRef.trim())throw new Error('Invalid seasonal source');seen.add(entry.conceptId);assertCivilDate(entry.reviewedAt);}}
  for(const price of data.ingredientPrices){requireRef('ingredients',price.ingredientId);if(!price.sourceRef.trim())throw new Error('Missing price source');assertCivilDate(price.observedOn);}
  const byVersion=new Map(data.recipeVersions.map(r=>[r.recipeVersionId,r]));for(const batch of data.productionBatches){requireRef('planInstances',batch.planInstanceId);validateBatchLinks(batch,data.calendarDays,byVersion);}
  for(const day of data.calendarDays)for(const slot of day.mealSlots)for(const [componentIndex,c] of slot.recipeComponents.entries())if(c.productionBatchId&&!data.productionBatches.some(b=>b.batchId===c.productionBatchId&&b.assignments.some(a=>a.calendarDayId===day.calendarDayId&&a.mealOccurrenceId===slot.mealOccurrenceId&&a.componentIndex===componentIndex)))throw new Error('Orphan batch component');
  const historyBatches=new Map([...data.productionBatches,...data.operations.flatMap(op=>[op.before,op.after].flatMap(s=>s.puts?.productionBatches||[]))].map(b=>[b.batchId,b]));
  for(const op of data.operations)for(const snapshot of [op.before,op.after]){const historicalDays=[...new Map([...data.calendarDays,...(snapshot.puts?.calendarDays||[])].map(d=>[d.calendarDayId,d])).values()].filter(d=>!snapshot.deletes?.calendarDays?.includes(d.calendarDayId));for(const batch of snapshot.puts?.productionBatches||[])validateBatchLinks(batch,historicalDays,byVersion);for(const day of snapshot.puts?.calendarDays||[])for(const slot of day.mealSlots)for(const [componentIndex,c] of slot.recipeComponents.entries())if(c.productionBatchId){const b=historyBatches.get(c.productionBatchId);if(!b||b.recipeVersionId!==c.recipeVersionId||!b.assignments.some(a=>a.calendarDayId===day.calendarDayId&&a.mealOccurrenceId===slot.mealOccurrenceId&&a.componentIndex===componentIndex&&a.civilDate===slot.civilDate))throw new Error('Orphan historical batch allocation');}}
  const settings=assertExtensionSettings({...extensionDefaults(),...data.meta.find(r=>r.key==='productExtensions:R8')?.value});requireRef('seasonalityProfiles',settings.seasonalityProfileId);for(const id of settings.pantryEntryIds)requireRef('pantryEntries',id);
  const meta=new Map(data.meta.map(r=>[r.key,r.value]));
  requireRef('planInstances',meta.get('activePlanInstanceId'));
  if((meta.get('activeCatalogVersion')||'none')!==document.catalog.catalogVersion)throw new Error('Conflicting backup catalog');
  for(const [key,value] of meta){if(key.startsWith('operationHistory:')){requireRef('operations',value?.headOperationId);for(const id of value?.redoStack||[])requireRef('operations',id);}}
  return data;
}
export async function applyPortable(document, {repo,registry,preImportBackup,beforeSnapshot}) {
  const before = beforeSnapshot || await snapshotRepository(repo);
  const data = await validatePortable(document,registry);
  for(const store of ['ingredientRevisions','recipeVersions']){
    const existing = new Map(before[store].map(r=>[canonicalJson(recordKey(store,r)),r]));
    for(const r of data[store]){const old=existing.get(canonicalJson(recordKey(store,r)));if(old&&canonicalJson(old)!==canonicalJson(r))throw new Error('Immutable revision collision in backup');}
  }
  const metaSet=Object.fromEntries(data.meta.map(r=>[r.key,r.value]));metaSet.lastBackupImportAt=new Date().toISOString();metaSet.backupRecovery=preImportBackup;
  const puts=Object.fromEntries(Object.entries(data).filter(([s])=>s!=='meta'));
  const newKeys=Object.fromEntries(Object.entries(data).filter(([s])=>s!=='meta').map(([s,rows])=>[s,new Set(rows.map(r=>canonicalJson(recordKey(s,r))))]));
  const deletes=Object.fromEntries(Object.entries(before).filter(([s])=>s!=='meta').map(([s,rows])=>[s,rows.filter(r=>!newKeys[s].has(canonicalJson(recordKey(s,r)))).map(r=>recordKey(s,r))]));
  await repo.atomicMutate({puts,deletes,metaSet,metaDelete:before.meta.filter(r=>portableMetaKey(r.key)&&!Object.hasOwn(metaSet,r.key)).map(r=>r.key),expectedStores:Object.entries(before).map(([store,values])=>({store,values}))});
  return {preImportBackup};
}
