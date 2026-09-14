import { element } from './dom.js';
import { createIngredientPicker, createAutocomplete, taxonomyChoices, genericRecipeTagChoices } from './guidedControls.js';
import { blankFrequencyRule, convertLegacyPreference } from '../domain/legacyRuleAdapter.js';
import { ALLERGEN_IDS, makeId } from '../domain/configurationRules.js';
import { civilDateInTimeZone } from '../services/effectivePlanService.js';
import { signalDraftChange, controlledDetails } from './uiState.js';
const say = (s, it, en) => s.i18n.locale === 'it' ? it : en;
const field = (label, control) => element('label', { className: 'field' }, [element('span', { text: label }), control]);
const button = (label, action) => element('button', { type: 'button', className: 'button button--secondary button--small', text: label, onClick: action });
function select(options, value, action) { const node = element('select', { onChange: e => action(e.target.value) }); for (const [id, label] of options) node.append(element('option', { value: id, text: label })); node.value = value; return node; }
export function ruleTargetPicker(state, target, changed) {
  if (['productFood', 'ingredient'].includes(target.type)) return createIngredientPicker(state, state.referenceDataIndex, { mode: target.type === 'ingredient' ? 'variant' : 'concept', value: target.id, required: true, onChange: id => { target.id = id || ''; changed(); } }).node;
  let choices;
  if (target.type === 'foodGroup') choices = (state.foodGroups || []).filter(g => g.status === 'active').map(g => ({ id: g.id, label: g.name }));
  else if (target.type === 'allergen') choices = ALLERGEN_IDS.map(id => ({ id, label: state.i18n.t(`allergen.${id}`) }));
  else if (target.type === 'recipeTag') choices = genericRecipeTagChoices(state.referenceDataIndex, state.i18n.locale);
  else choices = taxonomyChoices(state.referenceDataIndex, { cuisine: 'cuisine', flavor: 'flavor_profile' }[target.type], state.i18n.locale);
  return createAutocomplete({ choices, value: target.id, required: true, placeholder: say(state, 'Cerca e seleziona', 'Search and select'), invalidMessage: say(state, 'Seleziona una voce', 'Select an entry'), onChange: id => { target.id = id || ''; changed(); } }).node;
}
export function rulesV2Editor(state, profile, rerender, { safety = false } = {}) {
  const root = element('div', { className: 'rule-list' }); const changed = () => signalDraftChange(root); const redraw = () => { changed(); rerender(); };
  const today = () => civilDateInTimeZone(state.config.timeZone);
  root.append(element('p', { className: 'muted', text: safety ? say(state, 'Le esclusioni sono vincoli obbligatori. Dati incompleti e possibili tracce non sono considerati compatibili. Il piano non certifica il prodotto acquistato: controlla la sua etichetta.', 'Exclusions are mandatory. Incomplete data and possible traces are not treated as compatible. The plan does not certify a purchased product: check its label.') : say(state, 'Scegli quante presenze desideri in una finestra mobile di giorni. Minimo e massimo sono obbligatori; ideale orienta la scelta. Un pasto conta una sola volta, anche con più componenti. I pasti esterni non classificati restano sconosciuti.', 'Choose occurrences within a rolling window of days. Minimum and maximum are mandatory; ideal guides selection. A meal counts once, including multiple components. Unclassified external meals remain unknown.') }));
  const types = safety ? ['productFood', 'foodGroup', 'ingredient', 'allergen'] : ['productFood', 'foodGroup', 'ingredient', 'recipeTag', 'cuisine', 'flavor'];
  const labels = { productFood: ['Alimento o famiglia', 'Food or family'], foodGroup: ['Gruppo personalizzato', 'Custom group'], ingredient: ['Forma specifica (avanzato)', 'Specific form (advanced)'], allergen: ['Allergene', 'Allergen'], recipeTag: ['Tipo di ricetta', 'Recipe type'], cuisine: ['Cucina', 'Cuisine'], flavor: ['Gusto', 'Flavor'] };
  for (const rule of profile.rules) {
    const row = element('fieldset', { className: 'rule-card rule-card--v2' });
    row.append(element('legend', { text: say(state, safety ? 'Esclusione' : 'Frequenza', safety ? 'Exclusion' : 'Frequency') }));
    row.append(field(say(state, 'Attiva', 'Enabled'), element('input', { type: 'checkbox', checked: rule.enabled, onChange: e => { rule.enabled = e.target.checked; changed(); } })));
    row.append(field(say(state, 'Cosa', 'Target'), select(types.map(id => [id, say(state, ...labels[id])]), rule.target.type, value => { rule.target = { type: value, id: '' }; redraw(); })), ruleTargetPicker(state, rule.target, changed));
    if (safety) {
      row.append(field(say(state, 'Tipo', 'Kind'), select([['allergy', say(state, 'Allergia', 'Allergy')], ['intolerance', say(state, 'Intolleranza', 'Intolerance')], ['coeliac', say(state, 'Celiachia', 'Coeliac')]], rule.kind, value => { rule.kind = value; changed(); })));
      row.append(field(say(state, 'Note', 'Notes'), element('textarea', { value: rule.notes, onInput: e => { rule.notes = e.target.value; } })));
    } else {
      row.append(field(say(state, 'Regola', 'Rule'), select([['none', say(state, 'Nessuna preferenza', 'No preference')], ['frequency', say(state, 'Frequenza', 'Frequency')], ['never', say(state, 'Mai', 'Never')]], rule.mode, value => { rule.mode = value; redraw(); })));
      const number = (label, value, action, attrs) => field(label, element('input', { type: 'number', value: value ?? '', min: 0, onInput: e => { action(e.target.value === '' ? null : Number(e.target.value)); changed(); }, ...attrs }));
      row.append(number(say(state, 'Ogni quanti giorni', 'Window in days'), rule.window.days, v => { rule.window.days = v; }, { min: 1, max: 90, step: 1, required: true }));
      if (rule.mode === 'frequency') row.append(number(say(state, 'Minimo (vuoto = nessuno)', 'Minimum (blank = none)'), rule.minOccurrences, v => { rule.minOccurrences = v; }, { step: 1 }), number(say(state, 'Ideale (anche 2,5)', 'Ideal (including 2.5)'), rule.targetOccurrences, v => { rule.targetOccurrences = v; }, { step: 0.5 }), number(say(state, 'Massimo (vuoto = nessuno)', 'Maximum (blank = none)'), rule.maxOccurrences, v => { rule.maxOccurrences = v; }, { step: 1 }));
      if (rule.mode === 'never') row.append(element('p', { text: say(state, 'Zero presenze. I valori precedenti restano conservati se cambi modalità.', 'Zero occurrences. Previous values are retained if you change mode.') }));
      const scope = element('fieldset', {}, [element('legend', { text: say(state, 'Pasti inclusi (nessuna selezione = tutti)', 'Included meals (no selection = all)') })]);
      for (const meal of state.configuration.mealClasses.filter(m => state.config.mealClassIds.includes(m.id))) scope.append(field(meal.name, element('input', { type: 'checkbox', checked: rule.scope.mealClassIds.includes(meal.id), onChange: e => { rule.scope.mealClassIds = e.target.checked ? [...rule.scope.mealClassIds, meal.id] : rule.scope.mealClassIds.filter(id => id !== meal.id); changed(); } })));
      row.append(scope);
      const advanced = controlledDetails(state, `frequency:${rule.id}:advanced`, { children: [element('summary', { text: say(state, 'Conteggio e priorità', 'Counting and priority') })] });
      advanced.append(field(say(state, 'Conta', 'Count'), select([['meal', say(state, 'Pasti', 'Meals')], ['day', say(state, 'Giorni', 'Days')]], rule.countUnit, v => { rule.countUnit = v; changed(); })), field(say(state, 'Priorità dell’ideale', 'Ideal priority'), select([['low', say(state, 'Bassa', 'Low')], ['normal', say(state, 'Normale', 'Normal')], ['high', say(state, 'Alta', 'High')]], rule.priority, v => { rule.priority = v; changed(); })));
      row.append(advanced);
    }
    row.append(field(say(state, 'Valida dal', 'Effective from'), element('input', { type: 'date', required: true, value: rule.effectiveFrom, onChange: e => { rule.effectiveFrom = e.target.value; changed(); } })));
    row.append(button(state.i18n.t('common.remove'), () => { profile.rules = profile.rules.filter(r => r.id !== rule.id); redraw(); })); root.append(row);
  }
  for (const old of profile.legacyRules || []) {
    const label = state.referenceDataIndex?.term(old.targetId)?.i18n?.[state.i18n.locale]?.label || old.label || old.targetId;
    const row = element('div', { className: 'rule-card' }, [element('strong', { text: label }), element('p', { text: say(state, 'Regola precedente conservata. La conversione richiede una scelta esplicita e Salva.', 'Previous rule retained. Conversion requires an explicit choice and Save.') })]);
    row.append(button(say(state, 'Converti in bozza', 'Convert to draft'), () => {
      if (safety) { profile.legacyRules = profile.legacyRules.filter(r => r.id !== old.id); profile.rules.push({ id: old.id, kind: old.kind === 'coeliac' ? 'coeliac' : old.kind, target: { type: old.targetType, id: old.targetId }, enabled: old.enabled, notes: old.notes || '', effectiveFrom: today() }); }
      else { const next = blankFrequencyRule(old.id, today()); if (types.includes(old.targetType)) next.target = { type: old.targetType, id: old.targetId }; convertLegacyPreference(profile, old.id, next); } redraw();
    }), button(state.i18n.t('common.remove'), () => { profile.legacyRules = profile.legacyRules.filter(r => r.id !== old.id); redraw(); })); root.append(row);
  }
  root.append(button(say(state, 'Aggiungi regola', 'Add rule'), () => { profile.rules.push(safety ? { id: makeId('safety'), kind: 'allergy', target: { type: 'productFood', id: '' }, enabled: true, notes: '', effectiveFrom: today() } : blankFrequencyRule(makeId('frequency'), today())); redraw(); }));
  return root;
}
