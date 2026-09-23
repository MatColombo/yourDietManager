import { element } from './dom.js';
import { createIngredientPicker, createAutocomplete, taxonomyChoices, genericRecipeTagChoices } from './guidedControls.js';
import { blankFrequencyRule, convertLegacyPreference } from '../domain/legacyRuleAdapter.js';
import { ALLERGEN_IDS, makeId } from '../domain/configurationRules.js';
import { civilDateInTimeZone } from '../services/effectivePlanService.js';
import { signalDraftChange, controlledDetails } from './uiState.js';
import { DEFAULT_PLANNER_POLICY, VARIETY_MODES } from '../planner/varietyPolicy.js';

const say = (s, it, en) => s.i18n.locale === 'it' ? it : en;
const field = (label, control) => element('label', { className: 'field' }, [element('span', { text: label }), control]);
const button = (label, action) => element('button', { type: 'button', className: 'button button--secondary button--small', text: label, onClick: action });
function select(options, value, action) { const node = element('select', { onChange: e => action(e.target.value) }); for (const [id, label] of options) node.append(element('option', { value: id, text: label })); node.value = value; return node; }

function targetLabel(state, target) {
  if (!target?.id) return say(state, 'Nuova regola', 'New rule');
  if (target.type === 'foodGroup') return state.foodGroups?.find(item => item.id === target.id)?.name || target.id;
  if (target.type === 'ingredient') {
    const item = state.ingredientProjection?.items?.find(row => row.family.ingredientId === target.id);
    return item?.revision?.i18n?.[state.i18n.locale]?.name || item?.revision?.i18n?.it?.name || target.id;
  }
  if (target.type === 'allergen') return state.i18n.t(`allergen.${target.id}`);
  const term = state.referenceDataIndex?.term(target.id);
  return term?.i18n?.[state.i18n.locale]?.label || term?.i18n?.it?.label || target.id;
}

function plannerPolicyEditor(state, profile, changed) {
  profile.plannerPolicy = { ...DEFAULT_PLANNER_POLICY, ...(profile.plannerPolicy || {}) };
  const descriptions = {
    [VARIETY_MODES.maximum]: say(state, 'Evita la stessa ricetta per 14 giorni quando esistono alternative e penalizza fortemente ingredienti/famiglie appena usati.', 'Avoids the same recipe for 14 days when alternatives exist and strongly penalizes recently used ingredients/families.'),
    [VARIETY_MODES.perishables]: say(state, 'Evita ripetizioni immediate, ma favorisce ricette diverse che riutilizzano ingredienti freschi entro pochi giorni per ridurre gli sprechi.', 'Avoids immediate repeats, but favors different recipes that reuse fresh ingredients within a few days to reduce waste.'),
    [VARIETY_MODES.none]: say(state, 'Disattiva i vincoli automatici di varietà. Restano attive nutrizione, allergie e le regole di frequenza impostate qui sotto.', 'Disables automatic variety constraints. Nutrition, allergies, and explicit frequency rules remain active.')
  };
  const mode = select([
    [VARIETY_MODES.maximum, say(state, 'Massima varietà', 'Maximum variety')],
    [VARIETY_MODES.perishables, say(state, 'Vicinanza ingredienti deperibili', 'Perishable ingredient proximity')],
    [VARIETY_MODES.none, say(state, 'Nessun vincolo di varietà', 'No variety constraint')]
  ], profile.plannerPolicy.varietyMode, value => { profile.plannerPolicy.varietyMode = value; changed(); hint.textContent = descriptions[value]; });
  const hint = element('p', { className: 'muted preference-strategy__hint', text: descriptions[profile.plannerPolicy.varietyMode] });
  return element('section', { className: 'preference-strategy', 'data-testid': 'planner-variety-policy' }, [
    element('div', { className: 'preference-strategy__head' }, [
      element('div', {}, [element('strong', { text: say(state, 'Strategia del planner', 'Planner strategy') }), element('small', { text: say(state, 'Una sola scelta globale; le regole alimento-specifiche restano separate.', 'One global choice; food-specific rules remain separate.') })]),
      field(say(state, 'Varietà', 'Variety'), mode)
    ]),
    hint
  ]);
}

export function ruleTargetPicker(state, target, changed) {
  if (['productFood', 'ingredient'].includes(target.type)) return createIngredientPicker(state, state.referenceDataIndex, { mode: target.type === 'ingredient' ? 'variant' : 'concept', value: target.id, required: true, onChange: id => { target.id = id || ''; changed(); } }).node;
  let choices;
  if (target.type === 'foodGroup') choices = (state.foodGroups || []).filter(g => g.status === 'active').map(g => ({ id: g.id, label: g.name }));
  else if (target.type === 'allergen') choices = ALLERGEN_IDS.map(id => ({ id, label: state.i18n.t(`allergen.${id}`) }));
  else if (target.type === 'recipeTag') choices = genericRecipeTagChoices(state.referenceDataIndex, state.i18n.locale);
  else choices = taxonomyChoices(state.referenceDataIndex, { cuisine: 'cuisine', flavor: 'flavor_profile' }[target.type], state.i18n.locale);
  return createAutocomplete({ choices, value: target.id, required: true, placeholder: say(state, 'Cerca e seleziona', 'Search and select'), invalidMessage: say(state, 'Seleziona una voce', 'Select an entry'), onChange: id => { target.id = id || ''; changed(); } }).node;
}

function preferenceRuleEditor(state, profile, rule, types, labels, changed, redraw) {
  const details = element('details', { className: 'preference-rule' });
  const summary = element('summary', { className: 'preference-rule__summary' }, [
    element('span', { className: 'preference-rule__target', text: targetLabel(state, rule.target) }),
    element('span', { className: 'preference-rule__mode', text: rule.mode === 'never' ? say(state, 'Mai', 'Never') : rule.mode === 'frequency' ? say(state, 'Frequenza', 'Frequency') : say(state, 'Nessuna preferenza', 'No preference') })
  ]);
  const body = element('div', { className: 'preference-rule__body' });
  body.append(
    field(say(state, 'Alimento / criterio', 'Food / criterion'), select(types.map(id => [id, say(state, ...labels[id])]), rule.target.type, value => { rule.target = { type: value, id: '' }; redraw(); })),
    ruleTargetPicker(state, rule.target, changed),
    field(say(state, 'Regola', 'Rule'), select([['none', say(state, 'Nessuna preferenza', 'No preference')], ['frequency', say(state, 'Frequenza', 'Frequency')], ['never', say(state, 'Mai', 'Never')]], rule.mode, value => { rule.mode = value; redraw(); }))
  );
  const number = (label, value, action, attrs) => field(label, element('input', { type: 'number', value: value ?? '', min: 0, onInput: e => { action(e.target.value === '' ? null : Number(e.target.value)); changed(); }, ...attrs }));
  if (rule.mode !== 'none') body.append(number(say(state, 'Finestra (giorni)', 'Window (days)'), rule.window.days, v => { rule.window.days = v; }, { min: 1, max: 90, step: 1, required: true }));
  if (rule.mode === 'frequency') body.append(
    number(say(state, 'Minimo', 'Minimum'), rule.minOccurrences, v => { rule.minOccurrences = v; }, { step: 1 }),
    number(say(state, 'Ideale', 'Ideal'), rule.targetOccurrences, v => { rule.targetOccurrences = v; }, { step: 0.5 }),
    number(say(state, 'Massimo', 'Maximum'), rule.maxOccurrences, v => { rule.maxOccurrences = v; }, { step: 1 })
  );
  if (rule.mode === 'never') body.append(element('p', { className: 'muted preference-rule__wide', text: say(state, 'Zero presenze nella finestra selezionata.', 'Zero occurrences in the selected window.') }));
  const advanced = controlledDetails(state, `frequency:${rule.id}:advanced`, { children: [element('summary', { text: say(state, 'Ambito e opzioni avanzate', 'Scope and advanced options') })] });
  const scope = element('fieldset', { className: 'preference-meal-scope' }, [element('legend', { text: say(state, 'Pasti inclusi (nessuna selezione = tutti)', 'Included meals (no selection = all)') })]);
  for (const meal of state.configuration.mealClasses.filter(m => state.config.mealClassIds.includes(m.id))) scope.append(element('label', { className: 'check-field' }, [element('input', { type: 'checkbox', checked: rule.scope.mealClassIds.includes(meal.id), onChange: e => { rule.scope.mealClassIds = e.target.checked ? [...rule.scope.mealClassIds, meal.id] : rule.scope.mealClassIds.filter(id => id !== meal.id); changed(); } }), element('span', { text: meal.name })]));
  advanced.append(scope, element('div', { className: 'form-grid form-grid--3' }, [
    field(say(state, 'Conta', 'Count'), select([['meal', say(state, 'Pasti', 'Meals')], ['day', say(state, 'Giorni', 'Days')]], rule.countUnit, v => { rule.countUnit = v; changed(); })),
    field(say(state, 'Priorità', 'Priority'), select([['low', say(state, 'Bassa', 'Low')], ['normal', say(state, 'Normale', 'Normal')], ['high', say(state, 'Alta', 'High')]], rule.priority, v => { rule.priority = v; changed(); })),
    field(say(state, 'Valida dal', 'Effective from'), element('input', { type: 'date', required: true, value: rule.effectiveFrom, onChange: e => { rule.effectiveFrom = e.target.value; changed(); } }))
  ]));
  body.append(advanced, element('div', { className: 'preference-rule__actions' }, [
    field(say(state, 'Attiva', 'Enabled'), element('input', { type: 'checkbox', checked: rule.enabled, onChange: e => { rule.enabled = e.target.checked; changed(); } })),
    button(state.i18n.t('common.remove'), () => { profile.rules = profile.rules.filter(r => r.id !== rule.id); redraw(); })
  ]));
  details.append(summary, body);
  return details;
}

export function rulesV2Editor(state, profile, rerender, { safety = false } = {}) {
  const root = element('div', { className: 'rule-list' }); const changed = () => signalDraftChange(root); const redraw = () => { changed(); rerender(); };
  const today = () => civilDateInTimeZone(state.config.timeZone);
  const types = safety ? ['productFood', 'foodGroup', 'ingredient', 'allergen'] : ['productFood', 'foodGroup', 'ingredient', 'recipeTag', 'cuisine', 'flavor'];
  const labels = { productFood: ['Alimento o famiglia', 'Food or family'], foodGroup: ['Gruppo personalizzato', 'Custom group'], ingredient: ['Forma specifica (avanzato)', 'Specific form (advanced)'], allergen: ['Allergene', 'Allergen'], recipeTag: ['Tipo di ricetta', 'Recipe type'], cuisine: ['Cucina', 'Cuisine'], flavor: ['Gusto', 'Flavor'] };

  if (!safety) {
    root.append(plannerPolicyEditor(state, profile, changed));
    root.append(element('p', { className: 'muted preference-rules-intro', text: say(state, 'Regole specifiche facoltative. Usa “Alimento o famiglia” per applicare una regola a tutte le forme dello stesso alimento; “Forma specifica” serve solo per eccezioni tecniche.', 'Optional specific rules. Use “Food or family” to apply a rule to all forms of the same food; “Specific form” is only for technical exceptions.') }));
    for (const rule of profile.rules) root.append(preferenceRuleEditor(state, profile, rule, types, labels, changed, redraw));
  } else {
    root.append(element('p', { className: 'muted', text: say(state, 'Le esclusioni sono vincoli obbligatori. Dati incompleti e possibili tracce non sono considerati compatibili. Il piano non certifica il prodotto acquistato: controlla la sua etichetta.', 'Exclusions are mandatory. Incomplete data and possible traces are not treated as compatible. The plan does not certify a purchased product: check its label.') }));
    for (const rule of profile.rules) {
      const row = element('fieldset', { className: 'rule-card rule-card--v2' });
      row.append(element('legend', { text: say(state, 'Esclusione', 'Exclusion') }));
      row.append(field(say(state, 'Attiva', 'Enabled'), element('input', { type: 'checkbox', checked: rule.enabled, onChange: e => { rule.enabled = e.target.checked; changed(); } })));
      row.append(field(say(state, 'Cosa', 'Target'), select(types.map(id => [id, say(state, ...labels[id])]), rule.target.type, value => { rule.target = { type: value, id: '' }; redraw(); })), ruleTargetPicker(state, rule.target, changed));
      row.append(field(say(state, 'Tipo', 'Kind'), select([['allergy', say(state, 'Allergia', 'Allergy')], ['intolerance', say(state, 'Intolleranza', 'Intolerance')], ['coeliac', say(state, 'Celiachia', 'Coeliac')]], rule.kind, value => { rule.kind = value; changed(); })));
      row.append(field(say(state, 'Note', 'Notes'), element('textarea', { value: rule.notes, onInput: e => { rule.notes = e.target.value; } })));
      row.append(field(say(state, 'Valida dal', 'Effective from'), element('input', { type: 'date', required: true, value: rule.effectiveFrom, onChange: e => { rule.effectiveFrom = e.target.value; changed(); } })));
      row.append(button(state.i18n.t('common.remove'), () => { profile.rules = profile.rules.filter(r => r.id !== rule.id); redraw(); })); root.append(row);
    }
  }

  for (const old of profile.legacyRules || []) {
    const label = state.referenceDataIndex?.term(old.targetId)?.i18n?.[state.i18n.locale]?.label || old.label || old.targetId;
    const row = element('div', { className: 'rule-card' }, [element('strong', { text: label }), element('p', { text: say(state, 'Regola precedente conservata. La conversione richiede una scelta esplicita e Salva.', 'Previous rule retained. Conversion requires an explicit choice and Save.') })]);
    row.append(button(say(state, 'Converti in bozza', 'Convert to draft'), () => {
      if (safety) { profile.legacyRules = profile.legacyRules.filter(r => r.id !== old.id); profile.rules.push({ id: old.id, kind: old.kind === 'coeliac' ? 'coeliac' : old.kind, target: { type: old.targetType, id: old.targetId }, enabled: old.enabled, notes: old.notes || '', effectiveFrom: today() }); }
      else { const next = blankFrequencyRule(old.id, today()); if (types.includes(old.targetType)) next.target = { type: old.targetType, id: old.targetId }; convertLegacyPreference(profile, old.id, next); } redraw();
    }), button(state.i18n.t('common.remove'), () => { profile.legacyRules = profile.legacyRules.filter(r => r.id !== old.id); redraw(); })); root.append(row);
  }
  root.append(button(say(state, safety ? 'Aggiungi esclusione' : 'Aggiungi regola specifica', safety ? 'Add exclusion' : 'Add specific rule'), () => { profile.rules.push(safety ? { id: makeId('safety'), kind: 'allergy', target: { type: 'productFood', id: '' }, enabled: true, notes: '', effectiveFrom: today() } : blankFrequencyRule(makeId('frequency'), today())); redraw(); }));
  return root;
}
