import { repositories } from '../repositories/repositoryHub.js';
import { EXTENSION_STORES, extensionDefaults, assertExtensionSettings, assertCivilDate, validateBatchLinks } from '../domain/productExtensions.js';
import { previewContext, previewReadSet, sealPreview, withValidatedPreview, validatePlannedDays } from './planPreviewGuard.js';
import { commitOperation, mutationSnapshot } from './operationHistoryService.js';
import { activeRecords, loadConfigurationBundle } from './configurationService.js';
import { addCivilDays, daysBetween } from '../planner/planMath.js';
import { availableCurrentRecipeIds } from './catalogAvailability.js';
async function foodConcept(repo,id){const term=await repo.get('taxonomyTerms',id),parent=term?.parentTermId&&await repo.get('taxonomyTerms',term.parentTermId);return term?.status==='active'&&term.taxonomyId==='product_food'&&parent?.parentTermId?term:null;}
const id=prefix=>`${prefix}:${crypto.randomUUID()}`,now=()=>new Date().toISOString();
export async function loadProductExtensions(repo=repositories) { const rows=Object.fromEntries(await Promise.all(EXTENSION_STORES.map(async s=>[s,await repo.getAll(s)])));return {...rows,favorites:rows.recipeFavorites,settings:{...extensionDefaults(),...await repo.getMeta('productExtensions:R8')}}; }
export async function saveExtensionSettings(settings,{repo=repositories}={}) {
  const value=assertExtensionSettings({...extensionDefaults(),...settings});
  if(value.seasonalityProfileId&&!await repo.get('seasonalityProfiles',value.seasonalityProfileId))throw new Error('Area stagionale non disponibile / Seasonal area unavailable');
  for(const entryId of value.pantryEntryIds)if(!await repo.get('pantryEntries',entryId))throw new Error('Voce dispensa non disponibile / Pantry entry unavailable');
  const before=await repo.get('meta','productExtensions:R8');const refs=[...(value.seasonalityProfileId?[{store:'seasonalityProfiles',key:value.seasonalityProfileId,value:await repo.get('seasonalityProfiles',value.seasonalityProfileId)}]:[]),...await Promise.all(value.pantryEntryIds.map(async key=>({store:'pantryEntries',key,value:await repo.get('pantryEntries',key)})))];if(refs.some(r=>!r.value))throw new Error('Selection changed; reload');await repo.atomicMutate({metaSet:{'productExtensions:R8':value},expected:[{store:'meta',key:'productExtensions:R8',value:before},...refs]});return value;
}
export async function setRecipeFavorite(recipeId,selected,{repo=repositories,registry}={}) {
  if(!await repo.get('recipes',recipeId))throw new Error('Ricetta non disponibile / Recipe unavailable');
  const before=await repo.get('recipeFavorites',recipeId);const record={schemaVersion:1,recipeId,createdAt:before?.createdAt||now()};registry.assert('recipeFavorite',record);
  await repo.atomicMutate({puts:selected?{recipeFavorites:[record]}:{},deletes:selected?{}:{recipeFavorites:[recipeId]},expected:[{store:'recipeFavorites',key:recipeId,value:before}]});return selected;
}
export async function setMealLocked({calendarDayId,mealOccurrenceId,locked},{repo=repositories,registry}={}) {
  const before=await repo.get('calendarDays',calendarDayId);if(!before)throw new Error('Giorno non disponibile / Day unavailable');const next=structuredClone(before),slot=next.mealSlots.find(s=>s.mealOccurrenceId===mealOccurrenceId);if(!slot||slot.mode!=='planned')throw new Error('Pasto pianificato richiesto / Planned meal required');
  const readSet=await previewReadSet(repo);if(locked)await validatePlannedDays([before],repo,{replacePlanInstanceId:before.planInstanceId});
  slot.locked=Boolean(locked);next.updatedAt=now();registry.assert('calendarDay',next);
  return commitOperation({planInstanceId:before.planInstanceId,kind:'meal_lock',before:mutationSnapshot({puts:{calendarDays:[before]}}),after:mutationSnapshot({puts:{calendarDays:[next]}}),metadata:{locked:Boolean(locked),mealOccurrenceId}},{repo,registry,beforeCommit:async()=>readSet});
}
export async function saveMenu({menuId=null,name,planInstanceId,startDate,endDate},{repo=repositories,registry}={}) {
  assertCivilDate(startDate);assertCivilDate(endDate);const length=daysBetween(startDate,endDate)+1;if(length<1||length>31)throw new Error('Il menu richiede da 1 a 31 giorni / Menu requires 1–31 days');
  const allDays=await repo.getAll('calendarDays');const rows=allDays.filter(d=>d.planInstanceId===planInstanceId&&d.date>=startDate&&d.date<=endDate).sort((a,b)=>a.date.localeCompare(b.date));if(rows.length!==length)throw new Error('Periodo del menu incompleto / Incomplete menu period');
  const before=menuId?await repo.get('savedMenus',menuId):null;const menu={schemaVersion:1,menuId:menuId||id('menu'),name:String(name||'').trim(),days:rows.map(day=>{const counts={};return {offset:daysBetween(startDate,day.date),slots:day.mealSlots.filter(s=>s.mode==='planned').map(slot=>({mealClassId:slot.mealClassId,ordinal:counts[slot.mealClassId]=(counts[slot.mealClassId]??-1)+1,components:slot.recipeComponents.map(c=>({recipeId:c.recipeId,recipeVersionId:c.recipeVersionId,servings:1}))}))};}),createdAt:before?.createdAt||now(),updatedAt:now()};
  registry.assert('savedMenu',menu);await repo.atomicMutate({puts:{savedMenus:[menu]},expected:[{store:'savedMenus',key:menu.menuId,value:before}],expectedStores:[{store:'calendarDays',values:allDays}]});return menu;
}
async function recalculate(days,repo) { const {recomputeDayNutrition,deriveDayStatus}=await import('./effectivePlanService.js');const {nutritionProfile}=activeRecords(await loadConfigurationBundle(repo));for(const day of days){day.nutritionSummary=await recomputeDayNutrition(day,nutritionProfile,repo);day.status=deriveDayStatus(day.mealSlots);}return days; }
export async function createMenuPreview({menuId,planInstanceId,startDate},{repo=repositories,registry}={}) {
  const hash=await previewContext(repo);assertCivilDate(startDate);const menu=await repo.get('savedMenus',menuId);if(!menu)throw new Error('Menu non disponibile / Menu unavailable');registry.assert('savedMenu',menu);
  const available=new Set(await availableCurrentRecipeIds(repo));const days=await repo.getAll('calendarDays');const next=[];
  for(const model of menu.days){const date=addCivilDays(startDate,model.offset),source=days.find(d=>d.planInstanceId===planInstanceId&&d.date===date);if(!source)throw new Error('Crea prima il piano nelle date destinazione / Create the destination plan first');const day=structuredClone(source);
    for(const assignment of model.slots){const slot=day.mealSlots.filter(s=>s.mode==='planned'&&s.mealClassId===assignment.mealClassId)[assignment.ordinal];if(!slot||slot.mode!=='planned')throw new Error('Il menu non corrisponde ai pasti destinazione / Menu does not match destination slots');if(slot.locked||slot.recipeComponents.some(c=>c.productionBatchId))throw new Error('Sblocca il pasto o scollega il lotto / Unlock meal or detach batch first');for(const c of assignment.components)if(!available.has(c.recipeVersionId))throw new Error('Il menu contiene una versione non corrente: salvalo nuovamente / Menu version is no longer current: save it again');slot.recipeComponents=structuredClone(assignment.components);slot.adherenceStatus='not_recorded';slot.adherenceNotes=null;slot.externalEstimate=null;}
    day.updatedAt=now();next.push(day);
  }
  await recalculate(next,repo);for(const day of next)registry.assert('calendarDay',day);const validation=await validatePlannedDays(next,repo,{replacePlanInstanceId:planInstanceId});
  return sealPreview({status:'success',operationKind:'menu_apply',planInstanceId,calendarDays:next,menuId,menuName:menu.name,diagnostics:{frequencies:validation.frequencies}},hash,repo,'menu');
}
export async function commitMenuPreview(preview,{repo=repositories,registry}={}) {
  return withValidatedPreview(preview,{repo,kind:'menu'},async recheck=>{await validatePlannedDays(preview.calendarDays,repo,{replacePlanInstanceId:preview.planInstanceId});const before=await repo.getMany('calendarDays',preview.calendarDays.map(d=>d.calendarDayId));return commitOperation({planInstanceId:preview.planInstanceId,kind:'menu_apply',before:mutationSnapshot({puts:{calendarDays:before}}),after:mutationSnapshot({puts:{calendarDays:preview.calendarDays}}),metadata:{menuId:preview.menuId}},{repo,registry,beforeCommit:recheck});});
}
export async function savePantryEntry(draft,{repo=repositories,registry}={}) {
  const row={schemaVersion:1,entryId:draft.entryId||id('pantry'),conceptId:draft.conceptId,ingredientId:draft.ingredientId||null,available:Boolean(draft.available),quantity:draft.quantity===null||draft.quantity===''||draft.quantity===undefined?null:Number(draft.quantity),unit:draft.unit||null,expiresOn:draft.expiresOn||null,updatedAt:now()};
  registry.assert('pantryEntry',row);const term=await foodConcept(repo,row.conceptId);if(!term)throw new Error('Seleziona un alimento generico valido / Select a valid food concept');
  if(row.ingredientId){const family=await repo.get('ingredients',row.ingredientId),revision=family&&await repo.get('ingredientRevisions',family.currentRevisionId);if(!revision||revision.productTaxonomy?.conceptId!==row.conceptId)throw new Error('Forma e alimento non corrispondono / Form does not match food');}
  if(row.quantity!==null&&(!row.ingredientId||!row.unit))throw new Error('Quantità nota: scegli forma e unità / Known quantity requires form and unit');
  if(row.quantity===null)row.unit=null;if(row.expiresOn)assertCivilDate(row.expiresOn);
  const all=await repo.getAll('pantryEntries');if(all.some(p=>p.entryId!==row.entryId&&(row.ingredientId?p.ingredientId===row.ingredientId:!p.ingredientId&&p.conceptId===row.conceptId)))throw new Error('Alimento già in dispensa: modifica la voce esistente / Edit the existing pantry entry');
  await repo.atomicMutate({puts:{pantryEntries:[row]},expectedStores:[{store:'pantryEntries',values:all}]});return row;
}
export async function saveSeasonalityProfile(draft,{repo=repositories,registry}={}) {
  const row={schemaVersion:1,profileId:draft.profileId||id('area'),name:String(draft.name||'').trim(),entries:structuredClone(draft.entries||[]),updatedAt:now()};registry.assert('seasonalityProfile',row);const seen=new Set();for(const entry of row.entries){if(seen.has(entry.conceptId)||!entry.sourceRef.trim())throw new Error('Voce stagionale duplicata o senza fonte / Duplicate seasonal entry or missing source');seen.add(entry.conceptId);const term=await foodConcept(repo,entry.conceptId);if(!term)throw new Error('Alimento stagionale non disponibile / Seasonal food unavailable');assertCivilDate(entry.reviewedAt);}
  const before=await repo.get('seasonalityProfiles',row.profileId);await repo.atomicMutate({puts:{seasonalityProfiles:[row]},expected:[{store:'seasonalityProfiles',key:row.profileId,value:before}]});return row;
}
export async function saveIngredientPrice(draft,{repo=repositories,registry}={}) {
  const row={schemaVersion:1,priceId:draft.priceId||id('price'),ingredientId:draft.ingredientId,price:Number(draft.price),quantity:Number(draft.quantity),unit:draft.unit,currency:draft.currency,observedOn:draft.observedOn,sourceRef:String(draft.sourceRef||'').trim(),updatedAt:now()};if(draft.price===''||draft.quantity==='')throw new Error('Prezzo e quantità obbligatori / Price and quantity required');registry.assert('ingredientPrice',row);assertCivilDate(row.observedOn);if(!row.sourceRef||!await repo.get('ingredients',row.ingredientId))throw new Error('Forma e fonte del prezzo richieste / Price form and source required');const before=await repo.get('ingredientPrices',row.priceId);await repo.atomicMutate({puts:{ingredientPrices:[row]},expected:[{store:'ingredientPrices',key:row.priceId,value:before}]});return row;
}
export async function deleteExtensionRecord(store,key,{repo=repositories}={}) {
  if(!['savedMenus','pantryEntries','seasonalityProfiles','ingredientPrices'].includes(store))throw new Error('Unsupported deletion');
  const before=await repo.get(store,key),meta=await repo.get('meta','productExtensions:R8');const settings={...extensionDefaults(),...meta?.value};if(store==='pantryEntries')settings.pantryEntryIds=settings.pantryEntryIds.filter(id=>id!==key);if(store==='seasonalityProfiles'&&settings.seasonalityProfileId===key)settings.seasonalityProfileId=null;
  await repo.atomicMutate({deletes:{[store]:[key]},metaSet:{'productExtensions:R8':settings},expected:[{store,key,value:before},{store:'meta',key:'productExtensions:R8',value:meta}]});
}
export async function createBatchPreview(draft,{repo=repositories,registry}={}) {
  const hash=await previewContext(repo);if(!draft.assignments?.length)throw new Error('Seleziona almeno un consumo / Select at least one consumption');const all=await repo.getAll('calendarDays');const next=new Map();const batch={schemaVersion:1,batchId:id('batch'),planInstanceId:draft.planInstanceId,recipeVersionId:draft.recipeVersionId,portionsProduced:Number(draft.portionsProduced),productionDate:draft.productionDate,storage:draft.storage||{status:'unverified',useByDate:null,sourceRef:null},assignments:[],createdAt:now(),updatedAt:now()};
  for(const a of draft.assignments||[]){const source=all.find(d=>d.calendarDayId===a.calendarDayId);if(!source||source.planInstanceId!==batch.planInstanceId)throw new Error('Giorno del lotto non disponibile / Batch day unavailable');const day=next.get(source.calendarDayId)||structuredClone(source),slot=day.mealSlots.find(s=>s.mealOccurrenceId===a.mealOccurrenceId),component=slot?.recipeComponents[a.componentIndex];if(!component||component.recipeVersionId!==batch.recipeVersionId||slot.mode!=='planned'||slot.locked||component.productionBatchId)throw new Error('Pasto incompatibile, bloccato o già assegnato / Meal incompatible, locked or already allocated');component.productionBatchId=batch.batchId;batch.assignments.push({calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,componentIndex:a.componentIndex,civilDate:slot.civilDate});day.updatedAt=now();next.set(day.calendarDayId,day);}
  registry.assert('productionBatch',batch);const recipe=await repo.get('recipeVersions',batch.recipeVersionId);validateBatchLinks(batch,[...next.values()],new Map(recipe?[[recipe.recipeVersionId,recipe]]:[]));
  if(!await repo.get('planInstances',batch.planInstanceId))throw new Error('Piano del lotto non disponibile / Batch plan unavailable');
  const days=[...next.values()];for(const day of days)registry.assert('calendarDay',day);await validatePlannedDays(days,repo,{replacePlanInstanceId:batch.planInstanceId,additionalBatches:[batch]});
  return sealPreview({status:'success',operationKind:'batch_create',planInstanceId:batch.planInstanceId,calendarDays:days,batch},hash,repo,'batch');
}
export async function commitBatchPreview(preview,{repo=repositories,registry}={}) {
  return withValidatedPreview(preview,{repo,kind:'batch'},async recheck=>{await validatePlannedDays(preview.calendarDays,repo,{replacePlanInstanceId:preview.planInstanceId,additionalBatches:[preview.batch]});const before=await repo.getMany('calendarDays',preview.calendarDays.map(d=>d.calendarDayId));return commitOperation({planInstanceId:preview.planInstanceId,kind:'batch_create',before:mutationSnapshot({puts:{calendarDays:before},deletes:{productionBatches:[preview.batch.batchId]}}),after:mutationSnapshot({puts:{calendarDays:preview.calendarDays,productionBatches:[preview.batch]}}),metadata:{batchId:preview.batch.batchId}},{repo,registry,beforeCommit:recheck});});
}
export async function deleteProductionBatch(batchId,{repo=repositories,registry}={}) {
  const batch=await repo.get('productionBatches',batchId);if(!batch)throw new Error('Lotto non disponibile / Batch unavailable');const guard=await previewReadSet(repo);const before=await repo.getMany('calendarDays',[...new Set(batch.assignments.map(a=>a.calendarDayId))]);const next=structuredClone(before);for(const day of next)for(const slot of day.mealSlots)for(const c of slot.recipeComponents)if(c.productionBatchId===batchId)delete c.productionBatchId;
  return commitOperation({planInstanceId:batch.planInstanceId,kind:'batch_delete',before:mutationSnapshot({puts:{calendarDays:before,productionBatches:[batch]}}),after:mutationSnapshot({puts:{calendarDays:next},deletes:{productionBatches:[batchId]}}),metadata:{batchId}},{repo,registry,beforeCommit:async()=>guard});
}
