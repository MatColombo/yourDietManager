import { element } from './dom.js';
import { addCivilDays } from '../planner/planMath.js';
import { civilDateInTimeZone } from '../services/effectivePlanService.js';
import { saveConfigurationBundle } from '../services/configurationService.js';
import {
  calculateShoppingList, createShoppingChecklist, listShoppingChecklists, shoppingChecklistStaleness,
  refreshShoppingChecklist, updateShoppingChecklistItem, addManualShoppingItem, removeShoppingChecklistItem,
  deleteShoppingChecklist, buildPreparationHorizon
} from '../services/shoppingService.js';

function t(state, key, vars = {}) { let value = state.i18n.t(key); for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, String(replacement)); return value; }
function field(label, control) { return element('label', { className: 'field' }, [element('span', { text: label }), control]); }
function quantity(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(Number(value || 0)); }
function dateLabel(state, date) { try { return new Intl.DateTimeFormat(state.i18n.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); } catch { return date; } }
function statusBox() { const node = element('div', { 'aria-live': 'polite' }); return { node, ok(message) { node.className = 'validation-box'; node.textContent = message; }, error(error) { node.className = 'validation-box validation-box--error'; node.textContent = error?.message || String(error); } }; }

function shoppingListView(state, result) {
  const wrap = element('section', { className: 'shopping-section' });
  wrap.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.calculated.title') }), element('p', { className: 'muted', text: t(state, 'shopping.calculated.meta', { meals: result.occurrenceCount, people: result.peopleMultiplier }) })]) ]));
  if (!result.items.length) { wrap.append(element('div', { className: 'empty-state', text: t(state, 'shopping.empty') })); return wrap; }
  const list = element('div', { className: 'shopping-list' });
  for (const item of result.items) list.append(element('article', { className: 'shopping-item' }, [
    element('div', {}, [element('strong', { text: item.label }), element('span', { className: 'muted', text: t(state, 'shopping.sources', { count: item.sourceMealOccurrenceIds.length }) })]),
    element('span', { className: 'shopping-quantity', text: `${quantity(item.quantity)} ${item.unit}` })
  ]));
  wrap.append(list); return wrap;
}

function checklistItems(state, checklist) {
  const list = element('div', { className: 'shopping-checklist-items' });
  for (const item of checklist.items) {
    const check = element('input', { type: 'checkbox', checked: item.checked, 'aria-label': item.label, onChange: async () => { await updateShoppingChecklistItem(checklist.checklistId, item.itemId, { checked: check.checked }, { repo: state.repo, registry: state.registry }); state.render(); } });
    const notes = element('input', { type: 'text', value: item.notes || '', placeholder: t(state, 'shopping.notes'), onChange: async () => { await updateShoppingChecklistItem(checklist.checklistId, item.itemId, { notes: notes.value }, { repo: state.repo, registry: state.registry }); } });
    const actions = [];
    if (item.kind === 'manual') actions.push(element('button', { className: 'button button--danger button--small', text: t(state, 'common.delete'), onClick: async () => { await removeShoppingChecklistItem(checklist.checklistId, item.itemId, { repo: state.repo, registry: state.registry }); state.render(); } }));
    list.append(element('article', { className: `checklist-item${item.checked ? ' checklist-item--checked' : ''}` }, [
      check,
      element('div', { className: 'checklist-item__body' }, [element('strong', { text: item.label }), element('span', { className: 'muted', text: item.quantity == null ? t(state, `shopping.kind.${item.kind}`) : `${quantity(item.quantity)} ${item.unit || ''}`.trim() }), notes]),
      ...actions
    ]));
  }
  return list;
}

async function checklistCard(state, checklist) {
  const stale = await shoppingChecklistStaleness(checklist, { repo: state.repo });
  const card = element('section', { className: 'shopping-section shopping-checklist' });
  const headActions = element('div', { className: 'button-row' });
  if (stale.stale) headActions.append(element('button', { className: 'button button--small', text: t(state, 'shopping.refresh'), onClick: async () => { await refreshShoppingChecklist(checklist.checklistId, { repo: state.repo, registry: state.registry, locale: state.i18n.locale }); state.render(); } }));
  headActions.append(element('button', { className: 'button button--danger button--small', text: t(state, 'shopping.deleteChecklist'), onClick: async () => { if (!confirm(t(state, 'shopping.deleteConfirm'))) return; await deleteShoppingChecklist(checklist.checklistId, { repo: state.repo }); state.shoppingUi.selectedChecklistId = null; state.render(); } }));
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.checklist.title') }), element('p', { className: 'muted', text: `${dateLabel(state, checklist.range.startCivilDate)} → ${dateLabel(state, checklist.range.endCivilDate)} · ×${checklist.peopleMultiplier}` })]), headActions]));
  if (stale.stale) card.append(element('div', { className: 'validation-box validation-box--warning', text: t(state, 'shopping.stale') }));
  card.append(checklistItems(state, checklist));
  const label = element('input', { type: 'text', placeholder: t(state, 'shopping.manual.label') });
  const amount = element('input', { type: 'number', min: 0.001, step: 0.1, placeholder: t(state, 'shopping.manual.quantity') });
  const unit = element('input', { type: 'text', placeholder: t(state, 'shopping.manual.unit') });
  card.append(element('div', { className: 'manual-item-form' }, [label, amount, unit, element('button', { className: 'button button--secondary button--small', text: t(state, 'shopping.manual.add'), onClick: async () => { await addManualShoppingItem(checklist.checklistId, { label: label.value, quantity: amount.value, unit: unit.value }, { repo: state.repo, registry: state.registry }); state.render(); } })]));
  return card;
}

function prepView(state, prep) {
  const section = element('section', { className: 'shopping-section' });
  section.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.prep.title') }), element('p', { className: 'muted', text: t(state, 'shopping.prep.summary', { prep: prep.summary.prepMinutes, cook: prep.summary.cookMinutes, count: prep.summary.recipeCount }) })]) ]));
  if (!prep.entries.length) { section.append(element('div', { className: 'empty-state', text: t(state, 'shopping.prep.empty') })); return section; }
  const list = element('div', { className: 'prep-horizon-list' });
  for (const entry of prep.entries) {
    const badges = [entry.mealPrepSuitable ? t(state, 'shopping.prep.batchable') : null, entry.fridgeRequired ? t(state, 'shopping.prep.fridge') : null, entry.reheatingRequired ? t(state, 'shopping.prep.reheat') : null].filter(Boolean);
    list.append(element('article', { className: 'prep-horizon-item' }, [
      element('div', {}, [element('strong', { text: entry.title }), element('span', { className: 'muted', text: `${dateLabel(state, entry.civilDate)} · ${entry.time}` }), badges.length ? element('span', { className: 'muted', text: badges.join(' · ') }) : null]),
      element('span', { className: 'shopping-quantity', text: t(state, 'shopping.prep.minutes', { prep: entry.prepMinutes, cook: entry.cookMinutes }) })
    ]));
  }
  section.append(list); return section;
}

async function shoppingBody(state, section) {
  state.shoppingUi ||= {};
  const ui = state.shoppingUi; const today = civilDateInTimeZone(state.config.timeZone);
  ui.start ||= today; ui.end ||= addCivilDays(today, 6); ui.multiplier ??= state.config.shoppingPeopleMultiplier; ui.prepDays ??= 2;
  if (!ui.calculated || ui.locale !== state.i18n.locale) { ui.locale = state.i18n.locale; ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo }); }
  const checklists = await listShoppingChecklists({ repo: state.repo });
  const selected = checklists.find(item => item.checklistId === ui.selectedChecklistId) || checklists[0] || null;
  const prep = await buildPreparationHorizon({ startCivilDate: today, endCivilDate: addCivilDays(today, ui.prepDays - 1), locale: state.i18n.locale }, { repo: state.repo });
  section.replaceChildren(); section.append(element('p', { className: 'eyebrow', text: 'SHOPPING' }), element('h1', { text: t(state, 'page.shopping.title') }), element('p', { className: 'lead', text: t(state, 'page.shopping.body') }));

  const start = element('input', { type: 'date', value: ui.start }); const end = element('input', { type: 'date', value: ui.end }); const multiplier = element('input', { type: 'number', min: 0.1, max: 20, step: 0.1, value: ui.multiplier }); const status = statusBox();
  const controls = element('section', { className: 'shopping-section' }, [element('h2', { text: t(state, 'shopping.range.title') }), element('div', { className: 'form-grid form-grid--3' }, [field(t(state, 'shopping.start'), start), field(t(state, 'shopping.end'), end), field(t(state, 'shopping.multiplier'), multiplier)])]);
  const quick = element('div', { className: 'button-row' });
  for (const [key, startDelta, endDelta] of [['today', 0, 0], ['tomorrow', 1, 1], ['48h', 0, 1], ['5d', 0, 4], ['7d', 0, 6]]) quick.append(element('button', { className: 'button button--secondary button--small', text: t(state, `shopping.quick.${key}`), onClick: () => { start.value = addCivilDays(today, startDelta); end.value = addCivilDays(today, endDelta); } }));
  const calculate = element('button', { className: 'button', text: t(state, 'shopping.calculate'), onClick: async () => { try { ui.start = start.value; ui.end = end.value; ui.multiplier = Number(multiplier.value); ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo }); status.ok(t(state, 'shopping.calculated.ok')); state.render(); } catch (error) { status.error(error); } } });
  const saveMultiplier = element('button', { className: 'button button--secondary', text: t(state, 'shopping.saveMultiplier'), onClick: async () => { try { const bundle = structuredClone(state.configuration); bundle.appConfig.shoppingPeopleMultiplier = Number(multiplier.value); const saved = await saveConfigurationBundle(bundle, { repo: state.repo, registry: state.registry }); state.configuration = saved; state.config = saved.appConfig; ui.multiplier = saved.appConfig.shoppingPeopleMultiplier; status.ok(t(state, 'shopping.multiplierSaved')); } catch (error) { status.error(error); } } });
  const saveChecklist = element('button', { className: 'button button--secondary', disabled: !ui.calculated?.planInstanceId, text: t(state, 'shopping.saveChecklist'), onClick: async () => { try { ui.start = start.value; ui.end = end.value; ui.multiplier = Number(multiplier.value); ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo }); const created = await createShoppingChecklist({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo, registry: state.registry }); ui.selectedChecklistId = created.checklistId; state.render(); } catch (error) { status.error(error); } } });
  controls.append(quick, element('div', { className: 'button-row' }, [calculate, saveMultiplier, saveChecklist]), status.node); section.append(controls, shoppingListView(state, ui.calculated));

  if (checklists.length) {
    const picker = element('select', { onChange: () => { ui.selectedChecklistId = picker.value; state.render(); } }); for (const item of checklists) picker.append(element('option', { value: item.checklistId, text: `${item.range.startCivilDate} → ${item.range.endCivilDate}` })); picker.value = selected.checklistId;
    section.append(element('section', { className: 'shopping-section shopping-checklist-picker' }, [field(t(state, 'shopping.saved'), picker)]), await checklistCard(state, selected));
  }

  const prepDays = element('select', { onChange: () => { ui.prepDays = Number(prepDays.value); state.render(); } }); for (const value of [1, 2, 3, 5, 7]) prepDays.append(element('option', { value, text: t(state, 'shopping.prep.days', { days: value }) })); prepDays.value = String(ui.prepDays);
  section.append(element('section', { className: 'shopping-section shopping-prep-controls' }, [field(t(state, 'shopping.prep.horizon'), prepDays)]), prepView(state, prep));
}

export function shoppingPage(state) {
  const section = element('section', { className: 'page-card page-card--wide shopping-page' }, [element('p', { className: 'eyebrow', text: 'SHOPPING' }), element('h1', { text: t(state, 'page.shopping.title') }), element('p', { className: 'lead', text: t(state, 'common.loading') })]);
  void shoppingBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section;
}
