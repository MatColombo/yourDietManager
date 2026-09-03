import { repositories } from '../repositories/repositoryHub.js';
import { addCivilDays } from '../planner/planMath.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function nowIso(value) { return value || new Date().toISOString(); }
function numeric(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function assertCivilRange(startCivilDate, endCivilDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startCivilDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endCivilDate || '')) throw new Error('Shopping range requires civil dates');
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
  const occurrences = [];
  for (const day of days.filter(item => planIds.has(item.planInstanceId))) {
    for (const slot of day.mealSlots || []) {
      if (slot.mode !== 'planned' || slot.civilDate < startCivilDate || slot.civilDate > endCivilDate) continue;
      occurrences.push({ sourceDay: day, slot });
    }
  }
  occurrences.sort((a, b) => a.slot.civilDate.localeCompare(b.slot.civilDate) || a.slot.time.localeCompare(b.slot.time) || a.slot.mealOccurrenceId.localeCompare(b.slot.mealOccurrenceId));
  return { chain, occurrences };
}

async function sourcePlanUpdatedAt(repo, chain) {
  const globalTimestamp = await repo.getMeta('planUpdatedAt');
  if (globalTimestamp) return globalTimestamp;
  const timestamps = chain.map(plan => plan.updatedAt).filter(Boolean).sort();
  return timestamps.at(-1) || new Date(0).toISOString();
}

export async function calculateShoppingList({ startCivilDate, endCivilDate, peopleMultiplier = null, locale = 'it' }, { repo = repositories } = {}) {
  assertCivilRange(startCivilDate, endCivilDate);
  const config = await repo.get('appConfigs', 'active');
  const multiplier = assertMultiplier(peopleMultiplier ?? config?.shoppingPeopleMultiplier ?? 1);
  const { chain, occurrences } = await contributingOccurrences(startCivilDate, endCivilDate, repo);
  if (!chain.length) return { planInstanceId: null, range: { startCivilDate, endCivilDate }, peopleMultiplier: multiplier, sourcePlanUpdatedAt: null, items: [], occurrenceCount: 0 };

  const recipeVersionIds = unique(occurrences.flatMap(({ slot }) => (slot.recipeComponents || []).map(component => component.recipeVersionId)));
  const recipes = await repo.getMany('recipeVersions', recipeVersionIds);
  const recipeById = new Map(recipes.map(recipe => [recipe.recipeVersionId, recipe]));
  const missingRecipes = recipeVersionIds.filter(id => !recipeById.has(id));
  if (missingRecipes.length) throw new Error(`Historical RecipeVersion missing: ${missingRecipes.slice(0, 5).join(', ')}`);

  const revisionIds = unique(recipes.flatMap(recipe => (recipe.ingredientLines || []).map(line => line.ingredientRevisionId)));
  const revisions = await repo.getMany('ingredientRevisions', revisionIds);
  const revisionById = new Map(revisions.map(revision => [revision.ingredientRevisionId, revision]));
  const missingRevisions = revisionIds.filter(id => !revisionById.has(id));
  if (missingRevisions.length) throw new Error(`Historical IngredientRevision missing: ${missingRevisions.slice(0, 5).join(', ')}`);

  const aggregate = new Map();
  for (const { slot } of occurrences) {
    for (const component of slot.recipeComponents || []) {
      const recipe = recipeById.get(component.recipeVersionId);
      for (const line of recipe.ingredientLines || []) {
        const revision = revisionById.get(line.ingredientRevisionId);
        const unit = line.normalizedUnit;
        const state = revision?.basis?.state || 'unknown';
        const key = deterministicItemId(line.ingredientId, unit, state);
        const quantity = numeric(line.normalizedAmount) * numeric(component.servings, 1) * multiplier;
        if (!(quantity > 0)) continue;
        const current = aggregate.get(key) || {
          itemId: key, kind: 'derived', label: labelForRevision(revision, locale), checked: false, quantity: 0, unit,
          ingredientId: line.ingredientId, sourceMealOccurrenceIds: [], notes: null,
          _state: state, _ingredientRevisionIds: [], _optionalOnly: true
        };
        current.quantity += quantity;
        current.sourceMealOccurrenceIds.push(slot.mealOccurrenceId);
        current._ingredientRevisionIds.push(line.ingredientRevisionId);
        current._optionalOnly = current._optionalOnly && Boolean(line.optional);
        aggregate.set(key, current);
      }
    }
  }

  const items = [...aggregate.values()].map(item => {
    item.quantity = Math.round(item.quantity * 1000) / 1000;
    item.sourceMealOccurrenceIds = unique(item.sourceMealOccurrenceIds).sort();
    item._ingredientRevisionIds = unique(item._ingredientRevisionIds).sort();
    return item;
  }).sort((a, b) => a.label.localeCompare(b.label, locale) || a.itemId.localeCompare(b.itemId));

  return {
    planInstanceId: chain.at(-1).planInstanceId,
    range: { startCivilDate, endCivilDate }, peopleMultiplier: multiplier,
    sourcePlanUpdatedAt: await sourcePlanUpdatedAt(repo, chain), items, occurrenceCount: occurrences.length
  };
}

function checklistItem(item) {
  return {
    itemId: item.itemId, kind: item.kind, label: item.label, checked: Boolean(item.checked), quantity: item.quantity ?? null,
    unit: item.unit ?? null, ingredientId: item.ingredientId ?? null, sourceMealOccurrenceIds: unique(item.sourceMealOccurrenceIds || []), notes: item.notes ?? null
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
    sourcePlanUpdatedAt: calculated.sourcePlanUpdatedAt,
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
  const current = await repo.getMeta('planUpdatedAt');
  const plan = await repo.get('planInstances', checklist.planInstanceId);
  const currentPlanUpdatedAt = current || plan?.updatedAt || null;
  return { stale: Boolean(currentPlanUpdatedAt && currentPlanUpdatedAt > checklist.sourcePlanUpdatedAt), currentPlanUpdatedAt };
}

export async function refreshShoppingChecklist(checklistId, { repo = repositories, registry, updatedAt = null, locale = 'it' } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const existing = await repo.get('shoppingChecklists', checklistId); if (!existing) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const calculated = await calculateShoppingList({ startCivilDate: existing.range.startCivilDate, endCivilDate: existing.range.endCivilDate, peopleMultiplier: existing.peopleMultiplier, locale }, { repo });
  if (!calculated.planInstanceId) throw new Error('No active plan available for shopping refresh');
  const priorDerived = new Map(existing.items.filter(item => item.kind === 'derived').map(item => [item.itemId, item]));
  const derived = calculated.items.map(raw => {
    const previous = priorDerived.get(raw.itemId);
    return checklistItem({ ...raw, checked: previous?.checked || false, notes: previous?.notes ?? null });
  });
  const manual = existing.items.filter(item => item.kind === 'manual').map(checklistItem);
  const next = {
    ...clone(existing), planInstanceId: calculated.planInstanceId, sourcePlanUpdatedAt: calculated.sourcePlanUpdatedAt,
    items: [...derived, ...manual], updatedAt: nowIso(updatedAt)
  };
  registry.assert('shoppingChecklist', next);
  await repo.put('shoppingChecklists', next);
  return next;
}

export async function updateShoppingChecklistItem(checklistId, itemId, patch, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const next = clone(checklist); const item = next.items.find(row => row.itemId === itemId); if (!item) throw new Error(`Shopping item ${itemId} not found`);
  if ('checked' in patch) item.checked = Boolean(patch.checked);
  if ('notes' in patch) item.notes = patch.notes == null || String(patch.notes).trim() === '' ? null : String(patch.notes).trim();
  if (item.kind === 'manual') {
    if ('label' in patch) { const label = String(patch.label || '').trim(); if (!label) throw new Error('Manual shopping item label is required'); item.label = label; }
    if ('quantity' in patch) { const q = patch.quantity == null || patch.quantity === '' ? null : Number(patch.quantity); if (q != null && (!(q > 0) || !Number.isFinite(q))) throw new Error('Manual quantity must be positive'); item.quantity = q; }
    if ('unit' in patch) item.unit = patch.unit == null || String(patch.unit).trim() === '' ? null : String(patch.unit).trim();
  } else if ('label' in patch || 'quantity' in patch || 'unit' in patch || 'ingredientId' in patch) throw new Error('Derived shopping quantities are read-only; refresh them from the plan');
  next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.put('shoppingChecklists', next); return next;
}

export async function addManualShoppingItem(checklistId, { label, quantity = null, unit = null, notes = null, itemId = null } = {}, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const text = String(label || '').trim(); if (!text) throw new Error('Manual shopping item label is required');
  const q = quantity == null || quantity === '' ? null : Number(quantity); if (q != null && (!(q > 0) || !Number.isFinite(q))) throw new Error('Manual quantity must be positive');
  const next = clone(checklist); next.items.push({ itemId: itemId || manualId(), kind: 'manual', label: text, checked: false, quantity: q, unit: unit == null || String(unit).trim() === '' ? null : String(unit).trim(), ingredientId: null, sourceMealOccurrenceIds: [], notes: notes == null || String(notes).trim() === '' ? null : String(notes).trim() });
  next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.put('shoppingChecklists', next); return next;
}

export async function removeShoppingChecklistItem(checklistId, itemId, { repo = repositories, registry, updatedAt = null } = {}) {
  if (!registry) throw new Error('Schema registry is required');
  const checklist = await repo.get('shoppingChecklists', checklistId); if (!checklist) throw new Error(`ShoppingChecklist ${checklistId} not found`);
  const item = checklist.items.find(row => row.itemId === itemId); if (!item) throw new Error(`Shopping item ${itemId} not found`);
  if (item.kind !== 'manual') throw new Error('Derived shopping items can only be removed by changing or refreshing the plan');
  const next = clone(checklist); next.items = next.items.filter(row => row.itemId !== itemId); next.updatedAt = nowIso(updatedAt); registry.assert('shoppingChecklist', next); await repo.put('shoppingChecklists', next); return next;
}

export async function deleteShoppingChecklist(checklistId, { repo = repositories } = {}) { await repo.delete('shoppingChecklists', checklistId); }

export async function buildPreparationHorizon({ startCivilDate, endCivilDate, locale = 'it' }, { repo = repositories } = {}) {
  assertCivilRange(startCivilDate, endCivilDate);
  const { chain, occurrences } = await contributingOccurrences(startCivilDate, endCivilDate, repo);
  if (!chain.length) return { range: { startCivilDate, endCivilDate }, entries: [], summary: { mealOccurrences: 0, recipeCount: 0, prepMinutes: 0, cookMinutes: 0, mealPrepSuitableCount: 0 } };
  const ids = unique(occurrences.flatMap(({ slot }) => slot.recipeComponents.map(component => component.recipeVersionId)));
  const recipes = await repo.getMany('recipeVersions', ids); const byId = new Map(recipes.map(recipe => [recipe.recipeVersionId, recipe]));
  const entries = [];
  for (const { slot } of occurrences) {
    for (const component of slot.recipeComponents || []) {
      const recipe = byId.get(component.recipeVersionId); if (!recipe) throw new Error(`Historical RecipeVersion missing: ${component.recipeVersionId}`);
      const practical = recipe.practical || {};
      entries.push({
        mealOccurrenceId: slot.mealOccurrenceId, civilDate: slot.civilDate, time: slot.time, mealClassId: slot.mealClassId,
        recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, title: recipeTitle(recipe, locale),
        prepMinutes: numeric(practical.prepMinutes), cookMinutes: numeric(practical.cookMinutes), totalMinutes: numeric(practical.prepMinutes) + numeric(practical.cookMinutes),
        mealPrepSuitable: Boolean(practical.mealPrepSuitable), fridgeRequired: Boolean(practical.fridgeRequired), freezerSuitable: Boolean(practical.freezerSuitable),
        reheatingRequired: Boolean(practical.reheatingRequired), coldSuitable: Boolean(practical.coldSuitable), instructions: clone(recipe.i18n?.[locale]?.instructions || recipe.i18n?.en?.instructions || recipe.i18n?.it?.instructions || [])
      });
    }
  }
  entries.sort((a, b) => a.civilDate.localeCompare(b.civilDate) || a.time.localeCompare(b.time) || a.recipeVersionId.localeCompare(b.recipeVersionId));
  return {
    range: { startCivilDate, endCivilDate }, entries,
    summary: {
      mealOccurrences: unique(entries.map(item => item.mealOccurrenceId)).length,
      recipeCount: entries.length,
      prepMinutes: entries.reduce((sum, item) => sum + item.prepMinutes, 0),
      cookMinutes: entries.reduce((sum, item) => sum + item.cookMinutes, 0),
      mealPrepSuitableCount: entries.filter(item => item.mealPrepSuitable).length
    }
  };
}
