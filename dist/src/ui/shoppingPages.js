import { controlledDetails } from './uiState.js';
import { getShoppingSettings, saveShoppingSettings, orderedShoppingItems, shoppingText } from '../services/shoppingService.js';
import { createIngredientPicker } from './guidedControls.js';
import { ingredientPresentation } from '../domain/ingredientPresentation.js';
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
function shoppingCalculationKey(state, ui, planUpdatedAt) {
  return [state.i18n.locale, ui.start, ui.end, Number(ui.multiplier), planUpdatedAt || 'no-plan'].join('|');
}

function statusBox() { const node = element('div', { 'aria-live': 'polite' }); return { node, ok(message) { node.className = 'validation-box'; node.textContent = message; }, error(error) { node.className = 'validation-box validation-box--error'; node.textContent = error?.message || String(error); } }; }

function shoppingListView(state, result) {
  const wrap = element('section', { className: 'shopping-section', 'data-testid': 'shopping-calculated' });
  wrap.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.calculated.title') }), element('p', { className: 'muted', text: t(state, 'shopping.calculated.meta', { meals: result.occurrenceCount, people: result.peopleMultiplier }) })]) ]));
  const it=state.i18n.locale==='it';
  wrap.append(element('a',{href:'/organize/pantry','data-route':'',className:'button button--secondary',text:it?'Dispensa, lotti e prezzi':'Pantry, batches and prices'}));
  if(result.batchConsumptionCount)wrap.append(element('p',{text:it?`${result.batchConsumptionCount} consumi da lotti. Gli ingredienti si acquistano alla data di produzione.`:`${result.batchConsumptionCount} batch consumptions. Ingredients are purchased on the production date.`}));
  if(result.pantryUsage?.length)wrap.append(element('p',{text:it?'Dispensa selezionata già sottratta. Aggiorna tu lo stock dopo il consumo.':'Selected pantry already deducted. Update your stock after consumption.'}));
  if(result.coveredItems?.length)wrap.append(element('p',{text:(it?'Coperti dalla dispensa: ':'Covered by pantry: ')+result.coveredItems.map(i=>`${i.label} · ${i.variant} (${quantity(i.pantryDeducted)} ${i.unit})`).join(', ')}));
  if(result.cost){const cost=result.cost,money=n=>new Intl.NumberFormat(state.i18n.locale,{style:'currency',currency:cost.currency}).format(n);wrap.append(element('h3',{text:cost.total===null?(it?`Costo parziale noto: ${money(cost.knownSubtotal)}; ${cost.missing} prezzi mancanti`:`Known partial cost: ${money(cost.knownSubtotal)}; ${cost.missing} missing prices`):(it?`Costo stimato: ${money(cost.total)}`:`Estimated cost: ${money(cost.total)}`)}));if(cost.budget!==null)wrap.append(element('p',{text:`Budget ${money(cost.budget)} · ${it?({within:'entro il budget',over:'oltre il budget',unknown:'confronto incompleto'})[cost.budgetStatus]:cost.budgetStatus}`}));}
  if (!result.items.length) { wrap.append(element('div', { className: 'empty-state', text: t(state, 'shopping.empty') })); return wrap; }
  const list = element('div', { className: 'shopping-list' });
  let previousGroup = null;
  for (const item of orderedShoppingItems(result.items, state.shoppingUi.settings?.departmentOrder)) {
    const group = `${item.department}:${item.conceptId}`;
    if (group !== previousGroup) { list.append(element('h3',{text:`${departmentLabel(state,item.department)} · ${item.label}`})); previousGroup = group; }
    const price=result.cost?.lines.find(p=>p.itemId===item.itemId);const detail=price?.cost!==null&&price?.cost!==undefined?`${new Intl.NumberFormat(state.i18n.locale,{style:'currency',currency:result.cost.currency}).format(price.cost)} · ${price.observedOn} · ${price.sourceRef}${price.stale?(it?' · Prezzo da aggiornare':' · Price needs updating'):''}`:(it?'Prezzo sconosciuto':'Price unknown');
    list.append(element('article', {className:'shopping-item'},[element('div',{},[element('strong',{text:item.variant || item.label}),element('small',{text:detail}),item.pantryDeducted?element('small',{text:(it?'Già sottratti: ':'Already deducted: ')+quantity(item.pantryDeducted)+' '+item.unit}):null]),element('span',{className:'shopping-quantity',text:`${quantity(item.quantity)} ${item.unit}`})]));
  }
  wrap.append(list); return wrap;
}

function checklistItems(state, checklist) {
  const list = element('div', { className: 'shopping-checklist-items' });
  for (const item of orderedShoppingItems(checklist.items, state.shoppingUi.settings?.departmentOrder)) {
    const check = element('input', { type: 'checkbox', checked: item.checked, 'data-testid': 'shopping-check-item', 'aria-label': item.label, onChange: async () => { await updateShoppingChecklistItem(checklist.checklistId, item.itemId, { checked: check.checked }, { repo: state.repo, registry: state.registry }); state.render(); } });
    const notes = element('input', { type: 'text', 'aria-label': `${t(state, 'shopping.notes')} — ${item.label}`, value: item.notes || '', placeholder: t(state, 'shopping.notes'), onChange: async () => { await updateShoppingChecklistItem(checklist.checklistId, item.itemId, { notes: notes.value }, { repo: state.repo, registry: state.registry }); } });
    const actions = [];
    if (item.kind === 'manual') actions.push(element('button', { className: 'button button--danger button--small', text: t(state, 'common.delete'), onClick: async () => { await removeShoppingChecklistItem(checklist.checklistId, item.itemId, { repo: state.repo, registry: state.registry }); state.render(); } }));
    list.append(element('article', { className: `checklist-item${item.checked ? ' checklist-item--checked' : ''}` }, [
      check,
      element('div', { className: 'checklist-item__body' }, [element('strong', { text: `${item.label}${item.variant ? ' · '+item.variant : ''}` }), element('span', { className: 'muted', text: item.quantity == null ? t(state, `shopping.kind.${item.kind}`) : `${quantity(item.quantity)} ${item.unit || ''}`.trim() }), notes]),
      item.quantityChanged ? element('strong',{text:state.i18n.locale==='it'?'Quantità cambiata da verificare':'Changed quantity: check again'}) : null, ...actions
    ]));
  }
  return list;
}

async function checklistCard(state, checklist) {
  const stale = await shoppingChecklistStaleness(checklist, { repo: state.repo });
  const card = element('section', { className: 'shopping-section shopping-checklist', 'data-testid': 'shopping-checklist' });
  const headActions = element('div', { className: 'button-row' });
  if (stale.stale) headActions.append(element('button', { className: 'button button--small', 'data-testid': 'shopping-refresh', text: t(state, 'shopping.refresh'), onClick: async () => { await refreshShoppingChecklist(checklist.checklistId, { repo: state.repo, registry: state.registry, locale: state.i18n.locale }); state.render(); } }));
  headActions.append(element('button', { className: 'button button--danger button--small', text: t(state, 'shopping.deleteChecklist'), onClick: async () => { if (!confirm(t(state, 'shopping.deleteConfirm'))) return; await deleteShoppingChecklist(checklist.checklistId, { repo: state.repo }); state.shoppingUi.selectedChecklistId = null; state.render(); } }));
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.checklist.title') }), element('p', { className: 'muted', text: `${dateLabel(state, checklist.range.startCivilDate)} → ${dateLabel(state, checklist.range.endCivilDate)} · ×${checklist.peopleMultiplier}` })]), headActions]));
  if (stale.stale) card.append(element('div', { className: 'validation-box validation-box--warning', 'data-testid': 'shopping-stale', text: t(state, 'shopping.stale') }));
  card.append(exportActions(state,checklist), checklistItems(state, checklist));
  const draft = state.shoppingUi.manualDraft ||= {};
  const label = element('input', { type: 'text', value:draft.label||'', onInput:event=>{draft.label=event.target.value;}, 'aria-label':t(state,'shopping.manual.label'), placeholder: t(state, 'shopping.manual.label') });
  const amount = element('input', { type: 'number', value:draft.quantity||'', onInput:event=>{draft.quantity=event.target.value;}, 'aria-label':t(state,'shopping.manual.quantity'), min: 0.001, step: 0.1, placeholder: t(state, 'shopping.manual.quantity') });
  const unit = element('input', { type: 'text', value:draft.unit||'', onInput:event=>{draft.unit=event.target.value;}, 'aria-label':t(state,'shopping.manual.unit'), placeholder: t(state, 'shopping.manual.unit') });
  card.append(element('div', { className: 'manual-item-form' }, [label, amount, unit, element('button', { className: 'button button--secondary button--small', text: t(state, 'shopping.manual.add'), onClick: async () => { await addManualShoppingItem(checklist.checklistId, { label: label.value, quantity: amount.value, unit: unit.value }, { repo: state.repo, registry: state.registry }); state.shoppingUi.manualDraft = {}; state.render(); } })]));
  return card;
}

function prepView(state, prep) {
  const section = element('section', { className: 'shopping-section' });
  section.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'shopping.prep.title') }), element('p', { className: 'muted', text: t(state, 'shopping.prep.summary', { prep: prep.summary.prepMinutes, cook: prep.summary.cookMinutes, count: prep.summary.recipeCount }) })]) ]));
  if(prep.summary.unknownTimeCount)section.append(element('p',{text:state.i18n.locale==='it'?'I tempi indicati sono parziali: i tempi per i lotti non sono verificati.':'Times are partial: batch preparation times are unverified.'}));
  if (!prep.entries.length) { section.append(element('div', { className: 'empty-state', text: t(state, 'shopping.prep.empty') })); return section; }
  const list = element('div', { className: 'prep-horizon-list' });
  for (const entry of prep.entries) {
    const badges = [entry.mealPrepSuitable ? t(state, 'shopping.prep.batchable') : null, entry.fridgeRequired ? t(state, 'shopping.prep.fridge') : null, entry.reheatingRequired ? t(state, 'shopping.prep.reheat') : null].filter(Boolean);
    list.append(element('article', { className: 'prep-horizon-item' }, [
      element('div', {}, [element('strong', { text: entry.title }), element('span', { className: 'muted', text: `${dateLabel(state, entry.civilDate)} · ${entry.time}` }), badges.length ? element('span', { className: 'muted', text: badges.join(' · ') }) : null]),
      element('span', { className: 'shopping-quantity', text:entry.batchId?`${entry.portionsProduced} ${state.i18n.locale==='it'?'porzioni · tempi da verificare':'portions · times unverified'}${entry.storageStatus==='unverified'?(state.i18n.locale==='it'?' · conservabilità non verificata':' · storage life unverified'):''}`:t(state, 'shopping.prep.minutes', { prep: entry.prepMinutes, cook: entry.cookMinutes }) })
    ]));
  }
  section.append(list); return section;
}

async function shoppingBody(state, section) {
  state.shoppingUi ||= {};
  const ui = state.shoppingUi; ui.settings = await getShoppingSettings({repo:state.repo}); const today = civilDateInTimeZone(state.config.timeZone);
  ui.start ||= today; ui.end ||= addCivilDays(today, 6); ui.multiplier ??= state.config.shoppingPeopleMultiplier; ui.prepDays ??= 2;
  const planUpdatedAt = await state.repo.getMeta('planUpdatedAt');
  const calculationKey = shoppingCalculationKey(state, ui, planUpdatedAt);
  { // Recompute authoritative shopping projection; timestamps are not material identity.
    ui.locale = state.i18n.locale;
    ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo });
    ui.calculationKey = calculationKey;
  }
  const checklists = await listShoppingChecklists({ repo: state.repo });
  const selected = checklists.find(item => item.checklistId === ui.selectedChecklistId) || checklists[0] || null;
  const prep = await buildPreparationHorizon({ startCivilDate: today, endCivilDate: addCivilDays(today, ui.prepDays - 1), locale: state.i18n.locale }, { repo: state.repo });
  section.replaceChildren(); section.append(element('p', { className: 'eyebrow', text: 'SHOPPING' }), element('h1', { text: t(state, 'page.shopping.title') }), element('p', { className: 'lead', text: t(state, 'page.shopping.body') }));

  const start = element('input', { type: 'date', value: ui.start, 'data-testid': 'shopping-start' }); const end = element('input', { type: 'date', value: ui.end, 'data-testid': 'shopping-end' }); const multiplier = element('input', { type: 'number', min: 0.1, max: 20, step: 0.1, value: ui.multiplier, 'data-testid': 'shopping-multiplier' }); const status = statusBox();
  const controls = element('section', { className: 'shopping-section' }, [element('h2', { text: t(state, 'shopping.range.title') }), element('div', { className: 'form-grid form-grid--3' }, [field(t(state, 'shopping.start'), start), field(t(state, 'shopping.end'), end), field(t(state, 'shopping.multiplier'), multiplier)])]);
  const quick = element('div', { className: 'button-row' });
  for (const [key, startDelta, endDelta] of [['today', 0, 0], ['tomorrow', 1, 1], ['48h', 0, 1], ['5d', 0, 4], ['7d', 0, 6]]) quick.append(element('button', { className: 'button button--secondary button--small', text: t(state, `shopping.quick.${key}`), onClick: () => { start.value = addCivilDays(today, startDelta); end.value = addCivilDays(today, endDelta); } }));
  const calculate = element('button', { className: 'button', 'data-testid': 'shopping-calculate', text: t(state, 'shopping.calculate'), onClick: async () => { try { ui.start = start.value; ui.end = end.value; ui.multiplier = Number(multiplier.value); ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo }); ui.calculationKey = shoppingCalculationKey(state, ui, await state.repo.getMeta('planUpdatedAt')); status.ok(t(state, 'shopping.calculated.ok')); state.render(); } catch (error) { status.error(error); } } });
  const saveMultiplier = element('button', { className: 'button button--secondary', text: t(state, 'shopping.saveMultiplier'), onClick: async () => { try { const bundle = structuredClone(state.configuration); bundle.appConfig.shoppingPeopleMultiplier = Number(multiplier.value); const saved = await saveConfigurationBundle(bundle, { repo: state.repo, registry: state.registry }); state.configuration = saved; state.config = saved.appConfig; ui.multiplier = saved.appConfig.shoppingPeopleMultiplier; status.ok(t(state, 'shopping.multiplierSaved')); } catch (error) { status.error(error); } } });
  const saveChecklist = element('button', { className: 'button button--secondary', 'data-testid': 'shopping-save-checklist', disabled: !ui.calculated?.planInstanceId, text: t(state, 'shopping.saveChecklist'), onClick: async () => { try { ui.start = start.value; ui.end = end.value; ui.multiplier = Number(multiplier.value); ui.calculated = await calculateShoppingList({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo }); ui.calculationKey = shoppingCalculationKey(state, ui, await state.repo.getMeta('planUpdatedAt')); const created = await createShoppingChecklist({ startCivilDate: ui.start, endCivilDate: ui.end, peopleMultiplier: ui.multiplier, locale: state.i18n.locale }, { repo: state.repo, registry: state.registry }); ui.selectedChecklistId = created.checklistId; state.render(); } catch (error) { status.error(error); } } });
  controls.append(quick, element('div', { className: 'button-row' }, [calculate, saveMultiplier, saveChecklist]), status.node); section.append(controls, await purchaseSettingsView(state, ui.calculated), exportActions(state, ui.calculated), shoppingListView(state, ui.calculated));

  if (checklists.length) {
    const picker = element('select', { onChange: () => { ui.selectedChecklistId = picker.value; state.render(); } }); for (const item of checklists) picker.append(element('option', { value: item.checklistId, text: `${item.range.startCivilDate} → ${item.range.endCivilDate}` })); picker.value = selected.checklistId;
    section.append(element('section', { className: 'shopping-section shopping-checklist-picker' }, [field(t(state, 'shopping.saved'), picker)]), await checklistCard(state, selected));
  }

  const prepDays = element('select', { onChange: () => { ui.prepDays = Number(prepDays.value); state.render(); } }); for (const value of [1, 2, 3, 5, 7]) prepDays.append(element('option', { value, text: t(state, 'shopping.prep.days', { days: value }) })); prepDays.value = String(ui.prepDays);
  section.append(element('section', { className: 'shopping-section shopping-prep-controls' }, [field(t(state, 'shopping.prep.horizon'), prepDays)]), prepView(state, prep));
}

export function shoppingPage(state) {
  const section = element('section', { className: 'page-card page-card--wide shopping-page', 'data-testid': 'shopping-page' }, [element('p', { className: 'eyebrow', text: 'SHOPPING' }), element('h1', { text: t(state, 'page.shopping.title') }), element('p', { className: 'lead', text: t(state, 'common.loading') })]);
  void shoppingBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section;
}

function departmentLabel(state,id) { const term=state.referenceDataIndex?.term?.(id); return term?.i18n?.[state.i18n.locale]?.label || term?.i18n?.it?.label || (state.i18n.locale==='it'?'Altro':'Other'); }
function exportActions(state,list) {
  const it=state.i18n.locale==='it'; const labels=Object.fromEntries(list.items.map(i=>[i.department,departmentLabel(state,i.department)]));
  const text=shoppingText(list,{locale:state.i18n.locale,departmentOrder:state.shoppingUi.settings?.departmentOrder,departmentLabels:labels});
  const download=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=element('a',{href:url,download:`spesa-${list.range.startCivilDate}-${list.range.endCivilDate}.txt`});document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);};
  const preview=()=>{const dialog=element('dialog',{className:'shopping-print-dialog','aria-label':it?'Anteprima di stampa':'Print preview'});const close=()=>dialog.close();dialog.append(element('pre',{className:'shopping-print-content',text}),element('div',{className:'button-row'},[element('button',{className:'button',text:it?'Stampa':'Print',onClick:()=>window.print()}),element('button',{className:'button button--secondary',text:it?'Chiudi':'Close',onClick:close})]));dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();};
  return element('div',{className:'button-row'},[element('button',{className:'button button--secondary',text:it?'Esporta testo':'Export text',onClick:download}),element('button',{className:'button button--secondary',text:it?'Anteprima di stampa':'Print preview',onClick:preview})]);
}
async function purchaseSettingsView(state,calculated) {
  const it=state.i18n.locale==='it', settings=state.shoppingUi.settings;
  const wrap=controlledDetails(state,'shopping-purchase-settings',{children:[element('summary',{text:it?'Reparti e forme di acquisto':'Departments and purchase forms'})]});
  const status=statusBox();
  const departments=[...new Set([...settings.departmentOrder,...calculated.items.map(i=>i.department)])];
  for(let i=0;i<departments.length;i++) { const id=departments[i];wrap.append(element('div',{className:'button-row'},[element('span',{text:departmentLabel(state,id)}),element('button',{className:'button button--small',disabled:i===0,text:it?'Sposta su':'Move up',onClick:async()=>{try{[departments[i-1],departments[i]]=[departments[i],departments[i-1]];await saveShoppingSettings({...settings,departmentOrder:departments},{repo:state.repo});state.render();}catch(e){status.error(e);}}})])); }
  const edges=(await state.repo.getAll('ingredientConversions')).filter(e=>e.reviewStatus==='reviewed'&&e.sourceRef?.trim());
  const select=element('select',{'aria-label':it?'Conversione verificata':'Reviewed conversion'}), preview=element('p'); let selectedForm=null;
  const families=await state.repo.getAll('ingredients');const revisions=new Map((await state.repo.getMany('ingredientRevisions',families.map(f=>f.currentRevisionId))).map(r=>[r.ingredientRevisionId,r]));const formItems=families.map(f=>({family:f,revision:revisions.get(f.currentRevisionId)})).filter(i=>i.revision);
  function options(id){selectedForm=id;select.replaceChildren(element('option',{value:'',text:it?'Nessuna conversione':'No conversion'}));for(const edge of edges.filter(e=>e.fromIngredientId===id)){const target=formItems.find(i=>i.family.ingredientId===edge.toIngredientId);const label=ingredientPresentation(target?.revision,state.referenceDataIndex,state.i18n.locale);select.append(element('option',{value:JSON.stringify([edge.conversionId,edge.version]),text:`${label.name} · ${label.variant} · ×${edge.factor} (${edge.fromUnit} → ${edge.toUnit})`}));}preview.textContent='';}
  const picker=createIngredientPicker(state,state.referenceDataIndex,{mode:'variant',items:formItems,onChange:options});
  select.addEventListener('change',()=>{const edge=edges.find(e=>JSON.stringify([e.conversionId,e.version])===select.value);const q=calculated.items.filter(i=>i.ingredientId===selectedForm&&i.unit===edge?.fromUnit).reduce((n,i)=>n+i.quantity,0);preview.textContent=edge?`${q||100} ${edge.fromUnit} × ${edge.factor} = ${(q||100)*edge.factor} ${edge.toUnit} · ${it?'Fonte':'Source'}: ${edge.sourceRef}${q?'':(it?' (esempio su 100 unità)':' (100-unit example)')}`:'';});
  wrap.append(element('p',{text:it?'Le forme restano separate senza una conversione verificata scelta da te. Le quantità del piano non cambiano.':'Forms remain separate without your selected reviewed conversion. Plan quantities stay fixed.'}),picker.node,select,preview,element('button',{className:'button',text:it?'Salva forma di acquisto':'Save purchase form',onClick:async()=>{try{if(!selectedForm)throw new Error(it?'Scegli un alimento e una forma':'Choose a food and form');const edge=edges.find(e=>JSON.stringify([e.conversionId,e.version])===select.value);const choices=settings.purchaseChoices.filter(c=>c.fromIngredientId!==selectedForm);if(edge)choices.push({fromIngredientId:edge.fromIngredientId,fromUnit:edge.fromUnit,conversionId:edge.conversionId,version:edge.version});await saveShoppingSettings({...settings,purchaseChoices:choices},{repo:state.repo});state.render();}catch(e){status.error(e);}}}),status.node);
  return wrap;
}
