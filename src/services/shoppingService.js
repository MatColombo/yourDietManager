import { extensionDefaults, deductPantry, estimateShoppingCost, validateBatchLinks } from '../domain/productExtensions.js';
import { sha256Json } from '../lib/crypto.js';
import { ingredientPresentation } from '../domain/ingredientPresentation.js';
import { ReferenceDataIndex } from './referenceDataService.js';
import { convertIngredientQuantity } from '../domain/ingredientConversion.js';
import { repositories } from '../repositories/repositoryHub.js';
import { addCivilDays } from '../planner/planMath.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function nowIso(value) { return value || new Date().toISOString(); }
function numeric(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function assertCivilRange(startCivilDate, endCivilDate) {
  if (![startCivilDate, endCivilDate].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d)) throw new Error('Shopping range requires civil dates');
  if (endCivilDate < startCivilDate) throw new Error('Shopping range end must not precede start');
}
function assertMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.1 || n > 20) throw new Error('Shopping people multiplier must be between 0.1 and 20');
  return n;
}
function unique(values) { return [...new Set(values)]; }
function deterministicItemId(ingredientId, unit, state) { return `derived:${ingredientId}:${unit}:${state || 'unknown'}`; }
function manualId() { return `manual:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`; }
function labelForRevision(revision, locale = 'it') { return revision?.i18n?.[locale]?.name || revision?.i18n?.en?.name || revision?.i18n?.it?.name || revision?.ingredientId || 'Ingredient'; }
function recipeTitle(recipe, locale = 'it') { return recipe?.i18n?.[locale]?.title || recipe?.i18n?.en?.title || recipe?.i18n?.it?.title || recipe?.recipeId || 'Recipe'; }

async function loadPlanChain(repo) {
  const activeId = await repo.getMeta('activePlanInstanceId');
  if (!activeId) return [];
  const rows = []; const seen = new Set(); let currentId = activeId;
  while (currentId && !seen.has(currentId) && rows.length < 64) {
    seen.add(currentId);
    const plan = await repo.get('planInstances', currentId);
    if (!plan) break;
    rows.push(plan); currentId = plan.previousPlanInstanceId;
  }
  return rows.reverse();
}

async function contributingOccurrences(startCivilDate, endCivilDate, repo) {
  const chain = await loadPlanChain(repo);
  if (!chain.length) return { chain, occurrences: [] };
  const planIds = new Set(chain.map(plan => plan.planInstanceId));
  // CalendarDay is indexed by diet date, while shopping is defined by civil consumption date.
  // dayOffset is max 2 in the contract, so include the two preceding diet dates.
  const days = await repo.getAllByIndex('calendarDays', 'date', { kind: 'bound', lower: addCivilDays(startCivilDate, -2), upper: endCivilDate });
  const occurrences = []; const externalOccurrences = [];
  for (const day of days.filter(item => planIds.has(item.planInstanceId))) {
    for (const slot of day.mealSlots || []) {
      if (slot.civilDate < startCivilDate || slot.civilDate > endCivilDate) continue;
      if (slot.mode !== 'planned') { if (slot.mode === 'external') externalOccurrences.push(slot.mealOccurrenceId); continue; }
      occurrences.push({ sourceDay: day, slot });
    }
  }
  occurrences.sort((a, b) => a.slot.civilDate.localeCompare(b.slot.civilDate) || a.slot.time.localeCompare(b.slot.time) || a.slot.mealOccurrenceId.localeCompare(b.slot.mealOccurrenceId));
  return { chain, occurrences, externalOccurrences };
}

async function sourcePlanUpdatedAt(repo, chain) {
  const globalTimestamp = await repo.getMeta('planUpdatedAt');
  if (globalTimestamp) return globalTimestamp;
  const timestamps = chain.map(plan => plan.updatedAt).filter(Boolean).sort();
  return timestamps.at(-1) || new Date(0).toISOString();
}

export async function calculateShoppingList({ startCivilDate, endCivilDate, peopleMultiplier = null, locale = 'it', purchaseChoices = null, pantryEntryIds = null }, { repo = repositories } = {}) {
  assertCivilRange(startCivilDate, endCivilDate);
  const config = await repo.get('appConfigs', 'active');
  const multiplier = assertMultiplier(peopleMultiplier ?? config?.shoppingPeopleMultiplier ?? 1);
  const { chain, occurrences, externalOccurrences = [] } = await contributingOccurrences(startCivilDate, endCivilDate, repo);
  if (!chain.length) return { planInstanceId: null, range: { startCivilDate, endCivilDate }, peopleMultiplier: multiplier, sourcePlanUpdatedAt: null, items: [], occurrenceCount: 0 };

  const extensions={...extensionDefaults(),...await repo.getMeta('productExtensions:R8')};
  const batches=(await repo.getAll('productionBatches')).filter(b=>chain.some(p=>p.planInstanceId===b.planInstanceId));
  const batchMap=new Map(batches.map(b=>[b.batchId,b]));
  const allDays=batches.length?await repo.getAll('calendarDays'):[];
  const batchRecipes=await repo.getMany('recipeVersions',unique(batches.map(b=>b.recipeVersionId)));
  for(const batch of batches)validateBatchLinks(batch,allDays,new Map(batchRecipes.map(r=>[r.recipeVersionId,r])));
  let batchConsumptionCount=0; const consumptionMaterials=[]; const purchaseOccurrences=[];
  for(const occurrence of occurrences){const components=[];for(const [index,c] of occurrence.slot.recipeComponents.entries()){if(c.productionBatchId){const batch=batchMap.get(c.productionBatchId);if(!batch||!batch.assignments.some(a=>a.calendarDayId===occurrence.sourceDay.calendarDayId&&a.mealOccurrenceId===occurrence.slot.mealOccurrenceId&&a.componentIndex===index))throw new Error('Invalid batch shopping reference');batchConsumptionCount++;consumptionMaterials.push({batchId:batch.batchId,date:occurrence.slot.civilDate,mealOccurrenceId:occurrence.slot.mealOccurrenceId});}else components.push(c);}purchaseOccurrences.push({...occurrence,slot:{...occurrence.slot,recipeComponents:components}});}
  for(const batch of batches.filter(b=>b.productionDate>=startCivilDate&&b.productionDate<=endCivilDate))purchaseOccurrences.push({slot:{mealOccurrenceId:`production:${batch.batchId}`,civilDate:batch.productionDate,recipeComponents:[{recipeVersionId:batch.recipeVersionId,servings:batch.portionsProduced}]}});
  const recipeVersionIds = unique(purchaseOccurrences.flatMap(({ slot }) => (slot.recipeComponents || []).map(component => component.recipeVersionId)));
  const recipes = await repo.getMany('recipeVersions', recipeVersionIds);
  const recipeById = new Map(recipes.map(recipe => [recipe.recipeVersionId, recipe]));
  const missingRecipes = recipeVersionIds.filter(id => !recipeById.has(id));
  if (missingRecipes.length) throw new Error(`Historical RecipeVersion missing: ${missingRecipes.slice(0, 5).join(', ')}`);

  const revisionIds = unique(recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)));
  const revisions = await repo.getMany('ingredientRevisions', revisionIds);
  const revisionById = new Map(revisions.map(revision => [revision.ingredientRevisionId, revision]));
  const missingRevisions = revisionIds.filter(id => !revisionById.has(id));
  if (missingRevisions.length) throw new Error(`Historical IngredientRevision missing: ${missingRevisions.slice(0, 5).join(', ')}`);

  const settings = await getShoppingSettings({ repo });
  const choices = purchaseChoices ?? settings.purchaseChoices;
  const conversions = await repo.getAll('ingredientConversions');
  const index = new ReferenceDataIndex(await repo.getAll('taxonomies'), await repo.getAll('taxonomyTerms'));
  const aggregate = new Map(); const materials = [];
  const purchaseRevisions = new Map();
  for (const choice of choices) {
    const edge = conversions.find(e => e.conversionId === choice.conversionId && e.version === choice.version);
    if (!edge) throw new Error('Selected shopping conversion is missing; choose again');
    const family = await repo.get('ingredients', edge.toIngredientId);
    const revision = family && await repo.get('ingredientRevisions', family.currentRevisionId);
    if (!revision) throw new Error('Purchase form is unavailable');
    purchaseRevisions.set(edge.toIngredientId, revision);
  }
  for (const { slot } of purchaseOccurrences) {
    for (const component of slot.recipeComponents || []) {
      const recipe = recipeById.get(component.recipeVersionId);
      for (const line of recipe.ingredientLines || []) {
        let revision = revisionById.get(line.ingredientRevisionId);
        let ingredientId = line.ingredientId; let unit = line.normalizedUnit;
        let quantity = numeric(line.normalizedAmount) * numeric(component.servings, 1) * multiplier;
        if (!(quantity > 0)) throw new Error('Invalid historical shopping quantity');
        const choice = choices.find(c => c.fromIngredientId === ingredientId && c.fromUnit === unit);
        let conversion = null;
        if (choice) {
          const edge = conversions.find(e => e.conversionId === choice.conversionId && e.version === choice.version);
          const result = convertIngredientQuantity({amount: quantity, fromIngredientId: ingredientId, toIngredientId: edge.toIngredientId, fromUnit: unit, toUnit: edge.toUnit, purpose: edge.purpose, conversionId: edge.conversionId, version: edge.version}, conversions);
          if (result.status !== 'converted') throw new Error('Purchase conversion requires review');
          conversion = edge; quantity = result.amount; unit = edge.toUnit; ingredientId = edge.toIngredientId; revision = purchaseRevisions.get(ingredientId);
        }
        const presentation = ingredientPresentation(revision, index, locale);
        materials.push({ occurrence: slot.mealOccurrenceId, date: slot.civilDate, recipeVersionId: component.recipeVersionId, revisionId: line.ingredientRevisionId, amount: line.normalizedAmount, unit: line.normalizedUnit, servings: component.servings, optional: Boolean(line.optional), conversion });
        const state = revision?.basis?.state || 'unknown';
        const key = deterministicItemId(ingredientId, unit, state);

        const current = aggregate.get(key) || {
          itemId: key, kind: 'derived', label: presentation.name, variant: presentation.variant, conceptId: revision.productTaxonomy?.conceptId || ingredientId, department: revision.productTaxonomy?.categoryId || 'other', conversions: [], checked: false, quantity: 0, unit,
          ingredientId, sourceMealOccurrenceIds: [], notes: null,
          _state: state, _ingredientRevisionIds: [], _optionalOnly: true
        };
        current.quantity += quantity;
        if (conversion && !current.conversions.some(e => e.conversionId === conversion.conversionId && e.version === conversion.version)) current.conversions.push(conversion);
        current.sourceMealOccurrenceIds.push(slot.mealOccurrenceId);
        current._ingredientRevisionIds.push(line.ingredientRevisionId);
        current._optionalOnly = current._optionalOnly && Boolean(line.optional);
        aggregate.set(key, current);
      }
    }
  }

  let items = [...aggregate.values()].map(item => {
    item.quantity = Math.round(item.quantity * 1000) / 1000;
    item.sourceMealOccurrenceIds = unique(item.sourceMealOccurrenceIds).sort();
    item._ingredientRevisionIds = unique(item._ingredientRevisionIds).sort();
    return item;
  }).sort((a, b) => a.label.localeCompare(b.label, locale) || a.itemId.localeCompare(b.itemId));

  const selectedPantry=pantryEntryIds??extensions.pantryEntryIds;
  const currentFamilies=await repo.getAll('ingredients');const currentForms=await repo.getMany('ingredientRevisions',currentFamilies.map(f=>f.currentRevisionId));const stateByIngredient=new Map(currentForms.map(r=>[r.ingredientId,r.basis?.state]));
  const pantry=deductPantry(items,{entries:await repo.getAll('pantryEntries'),selectedIds:selectedPantry,endDate:endCivilDate,choices,conversions,stateByIngredient});items=pantry.items;
  const cost=estimateShoppingCost(items,await repo.getAll('ingredientPrices'),{currency:extensions.currency,asOf:startCivilDate,staleDays:extensions.priceStaleDays,budget:extensions.shoppingBudget});
  return {
    pantryUsage:pantry.usage, coveredItems:pantry.coveredItems, cost, batchConsumptionCount,
    planInstanceId: chain.at(-1).planInstanceId,
    range: { startCivilDate, endCivilDate }, peopleMultiplier: multiplier,
    sourcePlanUpdatedAt: await sourcePlanUpdatedAt(repo, chain), sourceInputDigest: await sha256Json({ startCivilDate, endCivilDate, multiplier, materials, consumptionMaterials, pantryUsage:pantry.usage, externalOccurrences: externalOccurrences.sort() }), items, occurrenceCount: occurrences.length, externalOccurrenceCount: externalOccurrences.length
  };
}

function checklistItem(item) {
  return {
    itemId: item.itemId, kind: item.kind, label: item.label, checked: Boolean(item.checked), quantity: item.quantity ?? null,
    unit: item.unit ?? null, ingredientId: item.ingredientId ?? null, sourceMealOccurrenceIds: unique(item.sourceMealOccurrenceIds || []), notes: item.notes ?? null, variant: item.variant || '', conceptId: item.conceptId || null, department: item.department || 'other', quantityChanged: Boolean(item.quantityChanged), conversions: item.conversions || [], pantryDeducted: item.pantryDeducted || 0
  };
}

export async function createShoppingChecklist(options, { repo = repositories, registry, checklistId = null, createdAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const calculated = await calculateShoppingList(options, { repo });
  if (!calculated.planInstanceId) throw new Error('No active plan available for shopping');
  const timestamp = nowIso(createdAt);
  const checklist = {
    schemaVersion: 1,
    checklistId: checklistId || `shopping:${globalThis.crypto?.randomUUID?.() || timestamp.replace(/[^0-9]/g, '')}`,
    planInstanceId: calculated.planInstanceId,
    range: calculated.range,
    peopleMultiplier: calculated.peopleMultiplier,
    sourcePlanUpdatedAt: calculated.sourcePlanUpdatedAt, sourceInputDigest: calculated.sourceInputDigest, externalOccurrenceCount: calculated.externalOccurrenceCount, batchConsumptionCount:calculated.batchConsumptionCount||0, pantryEntryCount:new Set((calculated.pantryUsage||[]).map(u=>u.entryId)).size,
    items: calculated.items.map(checklistItem),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  registry.assert('shoppingChecklist', checklist);
  await repo.put('shoppingChecklists', checklist);
  return checklist;
}

export async function listShoppingChecklists({ repo = repositories } = {}) {
  const rows = await repo.getAll('shoppingChecklists');
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.checklistId.localeCompare(b.checklistId));
}

export async function getShoppingChecklist(checklistId, { repo = repositories } = {}) { return repo.get('shoppingChecklists', checklistId); }

export async function shoppingChecklistStaleness(checklist, { repo = repositories } = {}) {
  if (!checklist) return { stale: false, currentPlanUpdatedAt: null };
  const current = await calculateShoppingList({ ...checklist.range, peopleMultiplier: checklist.peopleMultiplier }, { repo });
  return { stale: !checklist.sourceInputDigest || current.sourceInputDigest !== checklist.sourceInputDigest, currentInputDigest: current.sourceInputDigest, currentPlanUpdatedAt: current.sourcePlanUpdatedAt };
}

export async function refreshShoppingChecklist(checklistId, { repo = repositories, registry, updatedAt = null, locale = 'it' } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const existing = await repo.get('shoppingChecklists', checklistId); if (!existing) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const calculated = await calculateShoppingList({ startCivilDate: existing.range.startCivilDate, endCivilDate: existing.range.endCivilDate, peopleMultiplier: existing.peopleMultiplier, locale }, { repo });
  if (!calculated.planInstanceId) throw new Error('No active plan available for shopping refresh');
  const priorDerived = new Map(existing.items.filter(item => item.kind === 'derived').map(item => [item.itemId, item]));
  const derived = calculated.items.map(raw => {
    const previous = priorDerived.get(raw.itemId);
    return checklistItem({ ...raw, checked: Boolean(previous?.checked && raw.quantity <= previous.quantity), quantityChanged: Boolean(previous?.quantityChanged || (previous?.checked && raw.quantity > previous.quantity)), notes: previous?.notes ?? null });
  });
  const manual = existing.items.filter(item => item.kind === 'manual').map(checklistItem);
  const next = {
    ...clone(existing), planInstanceId: calculated.planInstanceId, sourcePlanUpdatedAt: calculated.sourcePlanUpdatedAt, sourceInputDigest: calculated.sourceInputDigest, externalOccurrenceCount: calculated.externalOccurrenceCount, batchConsumptionCount:calculated.batchConsumptionCount||0, pantryEntryCount:new Set((calculated.pantryUsage||[]).map(u=>u.entryId)).size,
    items: [...derived, ...manual], updatedAt: nowIso(updatedAt)
  };
  registry.assert('shoppingChecklist', next);
  await repo.atomicMutate({ puts: { shoppingChecklists: [next] }, expected: [{store:'shoppingChecklists',key:checklistId,value:typeof existing !== 'undefined' ? existing : checklist}] });
  return next;
}

export async function updateShoppingChecklistItem(checklistId, itemId, patch, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const next = clone(checklist); const item = next.items.find(row => row.itemId === itemId); if (!item) throw new Error(`Shopping item ${itemId} not found`);
  if ('checked' in patch) { item.checked = Boolean(patch.checked); if (item.checked) item.quantityChanged = false; }
  if ('notes' in patch) item.notes = patch.notes == null || String(patch.notes).trim() === '' ? null : String(patch.notes).trim();
  if (item.kind === 'manual') {
    if ('label' in patch) { const label = String(patch.label || '').trim(); if (!label) throw new Error('Manual shopping item label is required'); item.label = label; }
    if ('quantity' in patch) { const q = patch.quantity == null || patch.quantity === '' ? null : Number(patch.quantity); if (q != null && (!(q > 0) || !Number.isFinite(q))) throw new Error('Manual quantity must be positive'); item.quantity = q; }
    if ('unit' in patch) item.unit = patch.unit == null || String(patch.unit).trim() === '' ? null : String(patch.unit).trim();
  } else if ('label' in patch || 'quantity' in patch || 'unit' in patch || 'ingredientId' in patch) throw new Error('Derived shopping quantities are read-only; refresh them from the plan');
  next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.atomicMutate({ puts: { shoppingChecklists: [next] }, expected: [{store:'shoppingChecklists',key:checklistId,value:typeof existing !== 'undefined' ? existing : checklist}] }); return next;
}

export async function addManualShoppingItem(checklistId, { label, quantity = null, unit = null, notes = null, itemId = null } = {}, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const text = String(label || '').trim(); if (!text) throw new Error('Manual shopping item label is required');
  const q = quantity == null || quantity === '' ? null : Number(quantity); if (q != null && (!(q > 0) || !Number.isFinite(q))) throw new Error('Manual quantity must be positive');
  const next = clone(checklist); next.items.push({ itemId: itemId || manualId(), kind: 'manual', label: text, checked: false, quantity: q, unit: unit == null || String(unit).trim() === '' ? null : String(unit).trim(), ingredientId: null, sourceMealOccurrenceIds: [], notes: notes == null || String(notes).trim() === '' ? null : String(notes).trim() });
  next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.atomicMutate({ puts: { shoppingChecklists: [next] }, expected: [{store:'shoppingChecklists',key:checklistId,value:typeof existing !== 'undefined' ? existing : checklist}] }); return next;
}

export async function removeShoppingChecklistItem(checklistId, itemId, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const item = checklist.items.find(row => row.itemId === itemId); if (!item) throw new Error(`Shopping item ${itemId} not found`);
  if (item.kind !== 'manual') throw new Error('Derived shopping items can only be removed by changing or refreshing the plan');
  const next = clone(checklist); next.items = next.items.filter(row => row.itemId !== itemId); next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.atomicMutate({ puts: { shoppingChecklists: [next] }, expected: [{store:'shoppingChecklists',key:checklistId,value:typeof existing !== 'undefined' ? existing : checklist}] }); return next;
}

export async function deleteShoppingChecklist(checklistId, { repo = repositories } = {}) { await repo.delete('shoppingChecklists', checklistId); }

export async function buildPreparationHorizon({ startCivilDate, endCivilDate, locale = 'it' }, { repo = repositories } = {}) {
  assertCivilRange(startCivilDate, endCivilDate);
  const { chain, occurrences } = await contributingOccurrences(startCivilDate, endCivilDate, repo);
  if (!chain.length) return { range: { startCivilDate, endCivilDate }, entries: [], summary: { mealOccurrences: 0, recipeCount: 0, prepMinutes: 0, cookMinutes: 0, mealPrepSuitableCount: 0 } };
  const batches=(await repo.getAll('productionBatches')).filter(b=>chain.some(p=>p.planInstanceId===b.planInstanceId));
  const batchRecipes=await repo.getMany('recipeVersions',batches.map(b=>b.recipeVersionId));const allDays=batches.length?await repo.getAll('calendarDays'):[];for(const batch of batches)validateBatchLinks(batch,allDays,new Map(batchRecipes.map(r=>[r.recipeVersionId,r])));
  const preparations=occurrences.map(o=>({...o,slot:{...o.slot,recipeComponents:o.slot.recipeComponents.filter(c=>!c.productionBatchId)}}));
  for(const batch of batches.filter(b=>b.productionDate>=startCivilDate&&b.productionDate<=endCivilDate))preparations.push({batch,slot:{mealOccurrenceId:`production:${batch.batchId}`,civilDate:batch.productionDate,time:'',mealClassId:null,recipeComponents:[{recipeVersionId:batch.recipeVersionId}]}});
  const ids = unique(preparations.flatMap(({slot})=>slot.recipeComponents.map(c=>c.recipeVersionId)));
  const recipes = await repo.getMany('recipeVersions', ids); const byId = new Map(recipes.map(recipe => [recipe.recipeVersionId, recipe]));
  const entries = [];
  for (const { slot, batch } of preparations) {
    for (const component of slot.recipeComponents || []) {
      const recipe = byId.get(component.recipeVersionId); if (!recipe) throw new Error(`Historical RecipeVersion missing: ${component.recipeVersionId}`);
      const practical = recipe.practical || {};
      entries.push({
        mealOccurrenceId: slot.mealOccurrenceId, civilDate: slot.civilDate, time: slot.time, mealClassId: slot.mealClassId,
        recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, title: recipeTitle(recipe, locale),
        batchId:batch?.batchId||null,portionsProduced:batch?.portionsProduced||1,storageStatus:batch?.storage.status||null,
        prepMinutes: batch?null:numeric(practical.prepMinutes), cookMinutes: batch?null:numeric(practical.cookMinutes), totalMinutes:batch?null:numeric(practical.prepMinutes)+numeric(practical.cookMinutes),
        mealPrepSuitable: Boolean(practical.mealPrepSuitable), fridgeRequired: Boolean(practical.fridgeRequired), freezerSuitable: Boolean(practical.freezerSuitable),
        reheatingRequired: Boolean(practical.reheatingRequired), coldSuitable: Boolean(practical.coldSuitable)
      });
    }
  }
  entries.sort((a, b) => a.civilDate.localeCompare(b.civilDate) || a.time.localeCompare(b.time) || a.recipeVersionId.localeCompare(b.recipeVersionId));
  return {
    range: { startCivilDate, endCivilDate }, entries,
    summary: {
      mealOccurrences: unique(entries.map(item => item.mealOccurrenceId)).length,
      recipeCount: entries.length, unknownTimeCount:entries.filter(e=>e.totalMinutes===null).length,
      prepMinutes: entries.reduce((sum, item) => sum + item.prepMinutes, 0),
      cookMinutes: entries.reduce((sum, item) => sum + item.cookMinutes, 0),
      mealPrepSuitableCount: entries.filter(item => item.mealPrepSuitable).length
    }
  };
}

export async function getShoppingSettings({ repo = repositories } = {}) {
  return { departmentOrder: [], purchaseChoices: [], ...(await repo.getMeta('shoppingSettings:R6') || {}) };
}
export async function saveShoppingSettings(settings, { repo = repositories } = {}) {
  if (!Array.isArray(settings.departmentOrder) || new Set(settings.departmentOrder).size !== settings.departmentOrder.length || settings.departmentOrder.some(x => typeof x !== 'string')) throw new Error('Invalid department order');
  if (!Array.isArray(settings.purchaseChoices)) throw new Error('Invalid purchase choices');
  const edges = await repo.getAll('ingredientConversions'); const seen = new Set();
  for (const choice of settings.purchaseChoices) {
    const key = `${choice.fromIngredientId}:${choice.fromUnit}`;
    const edge = edges.find(e => e.conversionId === choice.conversionId && e.version === choice.version && e.fromIngredientId === choice.fromIngredientId && e.fromUnit === choice.fromUnit);
    if (seen.has(key) || !edge || edge.reviewStatus !== 'reviewed' || !edge.sourceRef?.trim() || !(edge.factor > 0)) throw new Error('Select one reviewed directional conversion per form/unit');
    seen.add(key);
  }
  const value = {departmentOrder: [...settings.departmentOrder], purchaseChoices: settings.purchaseChoices.map(c => ({fromIngredientId:c.fromIngredientId,fromUnit:c.fromUnit,conversionId:c.conversionId,version:c.version}))};
  await repo.setMeta('shoppingSettings:R6', value); return value;
}
export function orderedShoppingItems(items, departmentOrder = []) {
  const rank = id => departmentOrder.includes(id) ? departmentOrder.indexOf(id) : departmentOrder.length;
  return [...items].sort((a,b) => rank(a.department)-rank(b.department) || (a.department || 'other').localeCompare(b.department || 'other') || (a.label || '').localeCompare(b.label || '') || a.itemId.localeCompare(b.itemId));
}
export function shoppingText(list, { departmentOrder = [], locale = 'it', departmentLabels = {} } = {}) {
  const it = locale === 'it';
  const lines = [`${it ? 'Spesa' : 'Shopping'}: ${list.range.startCivilDate} → ${list.range.endCivilDate} · ×${list.peopleMultiplier}`, it ? 'I pasti esterni ignoti non contribuiscono agli acquisti calcolati.' : 'Unknown external meals do not contribute to calculated purchases.', it ? 'Le aggiunte manuali appartengono a questa checklist e al suo periodo.' : 'Manual additions belong to this checklist and its period.'];
  let department;
  for (const item of orderedShoppingItems(list.items, departmentOrder)) {
    if (department !== (item.department || 'other')) { department = item.department || 'other'; lines.push('', departmentLabels[department] || (department === 'other' ? (it ? 'Altro' : 'Other') : department)); }
    lines.push(`${item.checked ? '[x]' : '[ ]'} ${item.label}${item.variant ? ' · '+item.variant : ''}: ${item.quantity ?? ''} ${item.unit || ''}${item.kind === 'manual' ? (it ? ' (manuale)' : ' (manual)') : ''}${item.quantityChanged ? (it ? ' — Quantità cambiata da verificare' : ' — Changed quantity: check again') : ''}${item.pantryDeducted ? (it?' — già sottratti dalla dispensa: ':' — pantry already deducted: ')+item.pantryDeducted+' '+item.unit : ''}${item.notes ? ' — '+item.notes : ''}`);
  }
  if(list.batchConsumptionCount)lines.push('', locale==='it'?`Consumi da lotti: ${list.batchConsumptionCount}. Acquisti conteggiati nella data di produzione.`:`Batch consumptions: ${list.batchConsumptionCount}. Purchases counted on production dates.`);
  if(list.pantryUsage?.length||list.pantryEntryCount)lines.push('',locale==='it'?'Quantità note selezionate in dispensa già sottratte; lo stock non è consumato automaticamente.':'Selected known pantry quantities deducted; stock is not consumed automatically.');
  return lines.join('\n');
}
