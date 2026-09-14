import { canonicalJson } from '../lib/crypto.js';
import { convertIngredientQuantity } from './ingredientConversion.js';
export const EXTENSION_STORES = ['recipeFavorites','savedMenus','pantryEntries','productionBatches','seasonalityProfiles','ingredientPrices'];
export const extensionDefaults = () => ({ favoriteWeight:0, seasonalityProfileId:null, seasonalityWeight:0, pantryEntryIds:[], currency:'EUR', priceStaleDays:30, shoppingBudget:null });
export function assertCivilDate(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Data non valida / Invalid date');return value; }
export function assertExtensionSettings(settings) {
  for(const key of ['favoriteWeight','seasonalityWeight']) if(!Number.isFinite(settings[key])||settings[key]<0||settings[key]>5)throw new Error('Invalid soft weight');
  if(!Array.isArray(settings.pantryEntryIds)||new Set(settings.pantryEntryIds).size!==settings.pantryEntryIds.length||settings.pantryEntryIds.some(id=>typeof id!=='string'))throw new Error('Invalid pantry selection');
  if(!['EUR','USD','GBP'].includes(settings.currency)||!Number.isInteger(settings.priceStaleDays)||settings.priceStaleDays<1||settings.priceStaleDays>365)throw new Error('Invalid price settings');
  if(settings.shoppingBudget!==null&&(!Number.isFinite(settings.shoppingBudget)||settings.shoppingBudget<=0))throw new Error('Invalid shopping budget');
  if(settings.seasonalityProfileId!==null&&typeof settings.seasonalityProfileId!=='string')throw new Error('Invalid seasonal area');
  if(Object.keys(settings).some(key=>!Object.hasOwn(extensionDefaults(),key)))throw new Error('Unknown extension setting');
  return settings;
}
export function extensionPreferenceScore(recipe,{extensions=null,date,revisionById}) {
  if(!extensions)return {score:0,reasons:[]};const settings=extensions.settings||extensionDefaults();let score=0;const reasons=[];
  if(settings.favoriteWeight>0&&extensions.favorites?.some(f=>f.recipeId===recipe.recipeId)){score-=settings.favoriteWeight;reasons.push('favorite');}
  const profile=extensions.seasonalityProfiles?.find(p=>p.profileId===settings.seasonalityProfileId);
  if(profile&&settings.seasonalityWeight>0){const month=Number(date?.slice(5,7));const concepts=new Set(recipe.ingredientLines.map(l=>revisionById.get(l.ingredientRevisionId)?.productTaxonomy?.conceptId).filter(Boolean));const entries=profile.entries.filter(e=>concepts.has(e.conceptId)&&e.sourceRef?.trim()&&e.reviewedAt<=date);if(entries.length){const matches=entries.filter(e=>e.months.includes(month)).length;score-=settings.seasonalityWeight*matches/entries.length;if(matches)reasons.push(`seasonality:${profile.profileId}:${month}`);}}
  return {score,reasons};
}
export function assertPreservedSlots(beforeDays,afterDays) {
  for(const before of beforeDays){const after=afterDays.find(day=>day.date===before.date);if(!after)continue;
    for(const slot of before.mealSlots.filter(s=>s.locked||s.recipeComponents?.some(c=>c.productionBatchId))){const next=after.mealSlots.find(s=>s.mealOccurrenceId===slot.mealOccurrenceId);if(!next||next.mode!==slot.mode||canonicalJson(next.recipeComponents)!==canonicalJson(slot.recipeComponents))throw Object.assign(new Error('Pasto bloccato o assegnato a un lotto: sblocca o rimuovi l’assegnazione prima di modificarlo.'),{code:'locked_meal'});}
  }
}
export function validateBatchLinks(batch,calendarDays,recipesByVersion) {
  const recipe=recipesByVersion.get(batch.recipeVersionId);if(!recipe)throw new Error('Batch recipe version missing');
  assertCivilDate(batch.productionDate);if(batch.assignments.length>batch.portionsProduced)throw new Error('Batch over-allocated');
  if(batch.storage.status==='documented'&&(!batch.storage.useByDate||!batch.storage.sourceRef?.trim()))throw new Error('Documented storage needs date and source');
  if(batch.storage.status==='unverified'&&(batch.storage.useByDate!==null||batch.storage.sourceRef!==null))throw new Error('Unverified storage cannot assert a shelf life');
  if(batch.storage.useByDate)assertCivilDate(batch.storage.useByDate);if(batch.storage.useByDate&&batch.storage.useByDate<batch.productionDate)throw new Error('Storage date precedes production');
  const seen=new Set();
  for(const a of batch.assignments){const key=`${a.calendarDayId}:${a.mealOccurrenceId}:${a.componentIndex}`;if(seen.has(key))throw new Error('Duplicate batch allocation');seen.add(key);const day=calendarDays.find(d=>d.calendarDayId===a.calendarDayId),slot=day?.mealSlots.find(s=>s.mealOccurrenceId===a.mealOccurrenceId),component=slot?.recipeComponents[a.componentIndex];if(day?.planInstanceId!==batch.planInstanceId||slot?.mode!=='planned'||component?.productionBatchId!==batch.batchId||component.recipeVersionId!==batch.recipeVersionId||component.servings!==1||slot.civilDate!==a.civilDate)throw new Error('Batch allocation does not match the frozen meal');if(a.civilDate<batch.productionDate||batch.storage.useByDate&&a.civilDate>batch.storage.useByDate)throw new Error('Batch consumption outside documented dates');}
  return batch;
}
export function deductPantry(items,{entries=[],selectedIds=[],endDate,choices=[],conversions=[],stateByIngredient=new Map()}) {
  const next=structuredClone(items);const usage=[];
  for(const id of [...new Set(selectedIds)].sort()){const entry=entries.find(e=>e.entryId===id);if(!entry?.available||entry.quantity===null||!entry.ingredientId||entry.expiresOn&&entry.expiresOn<endDate)continue;
    let ingredientId=entry.ingredientId,unit=entry.unit,amount=entry.quantity;
    const choice=choices.find(c=>c.fromIngredientId===ingredientId&&c.fromUnit===unit);
    if(choice){const edge=conversions.find(c=>c.conversionId===choice.conversionId&&c.version===choice.version);if(!edge)continue;const converted=convertIngredientQuantity({amount,fromIngredientId:ingredientId,toIngredientId:edge.toIngredientId,fromUnit:unit,toUnit:edge.toUnit,purpose:edge.purpose,conversionId:edge.conversionId,version:edge.version},conversions);if(converted.status!=='converted')continue;ingredientId=edge.toIngredientId;unit=edge.toUnit;amount=converted.amount;}
    // Only the current matching form state is eligible; ambiguity never causes a deduction.
    const candidates=next.filter(i=>i.ingredientId===ingredientId&&i.unit===unit);const state=stateByIngredient.get(ingredientId);if(!state&&new Set(candidates.map(i=>i._state)).size>1)continue;
    for(const item of candidates.filter(i=>!state||i._state===state)){const used=Math.min(amount,item.quantity);if(used<=0)continue;item.quantity=Math.round((item.quantity-used)*1000)/1000;item.pantryDeducted=(item.pantryDeducted||0)+used;amount-=used;usage.push({entryId:id,itemId:item.itemId,amount:used,unit});if(amount<=0)break;}
  }
  return {items:next.filter(i=>i.quantity>0),coveredItems:next.filter(i=>i.quantity===0),usage};
}
export function estimateShoppingCost(items,prices,{currency='EUR',asOf,staleDays=30,budget=null}={}) {
  assertCivilDate(asOf);const lines=[];let knownSubtotal=0;
  for(const item of items){const price=prices.filter(p=>p.ingredientId===item.ingredientId&&p.unit===item.unit&&p.currency===currency&&p.observedOn<=asOf).sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||b.updatedAt.localeCompare(a.updatedAt)||a.priceId.localeCompare(b.priceId))[0];const known=Boolean(price&&Number.isFinite(item.quantity));const cost=known?item.quantity/price.quantity*price.price:null;if(cost!==null)knownSubtotal+=cost;lines.push({itemId:item.itemId,cost,priceId:price?.priceId||null,observedOn:price?.observedOn||null,sourceRef:price?.sourceRef||null,stale:Boolean(price&&(Date.parse(asOf)-Date.parse(price.observedOn))/86400000>staleDays)});}
  const missing=lines.filter(l=>l.cost===null).length;const total=missing?null:Math.round(knownSubtotal*100)/100;
  return {currency,knownSubtotal:Math.round(knownSubtotal*100)/100,total,missing,lines,budget,budgetStatus:budget===null?'not_set':total===null?'unknown':total>budget?'over':'within'};
}
