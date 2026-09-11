import { element } from './dom.js';
import { signalDraftChange } from './uiState.js';
import { MEAL_ARCHETYPES } from '../domain/catalogEnums.js';
import { RECIPE_TAG_TAXONOMY, TAXONOMY_IDS } from '../services/referenceDataService.js';

let controlSequence = 0;
function nextId(prefix = 'guided') { controlSequence += 1; return `${prefix}-${controlSequence}`; }
function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function labelFromI18n(i18n, locale, field = 'label') {
  return i18n?.[locale]?.[field] || i18n?.en?.[field] || i18n?.it?.[field] || '';
}

export function localizedTermLabel(index, termId, locale = 'it') {
  const term = index?.term?.(termId);
  return term ? labelFromI18n(term.i18n, locale) : termId || '';
}

export function taxonomyChoices(index, taxonomyId, locale = 'it', { parentTermId = undefined, rootsOnly = false, activeOnly = true } = {}) {
  const terms = index?.byTaxonomy?.get(taxonomyId) || [];
  return terms
    .filter(term => !activeOnly || term.status === 'active')
    .filter(term => rootsOnly ? !term.parentTermId : parentTermId === undefined ? true : term.parentTermId === parentTermId)
    .map(term => {
      const label = labelFromI18n(term.i18n, locale);
      const alt = labelFromI18n(term.i18n, locale === 'it' ? 'en' : 'it');
      const parent = term.parentTermId ? localizedTermLabel(index, term.parentTermId, locale) : '';
      const aliases = [...(term.aliases?.it || []), ...(term.aliases?.en || [])];
      return { id: term.termId, label, secondary: parent || alt, searchText: [label, alt, term.termId, parent, ...aliases, ...(term.legacyKeys || [])].join(' ') };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}


function productFoodLevel(index, term) {
  if (!term?.parentTermId) return 'category';
  const parent = index?.term?.(term.parentTermId);
  return parent?.parentTermId ? 'concept' : 'subcategory';
}

function productFoodPathTerms(index, termId) {
  const path = [];
  let term = index?.term?.(termId) || null;
  const seen = new Set();
  while (term && !seen.has(term.termId)) {
    seen.add(term.termId);
    path.unshift(term);
    term = term.parentTermId ? index?.term?.(term.parentTermId) || null : null;
  }
  return path;
}

export function productFoodPathLabel(index, termId, locale = 'it') {
  return productFoodPathTerms(index, termId).map(term => labelFromI18n(term.i18n, locale)).filter(Boolean).join(' › ');
}

function productFoodCoverage(ingredients, termId) {
  if (!termId) return 0;
  return (ingredients || []).reduce((count, item) => {
    const product = item?.revision?.productTaxonomy;
    return count + (product && [product.categoryId, product.subcategoryId, product.conceptId].includes(termId) ? 1 : 0);
  }, 0);
}

export function productFoodChoices(index, locale = 'it', { ingredients = [], levels = ['category', 'subcategory', 'concept'] } = {}) {
  const allowed = new Set(levels);
  return (index?.byTaxonomy?.get(TAXONOMY_IDS.productFood) || [])
    .filter(term => term.status === 'active')
    .map(term => ({ term, level: productFoodLevel(index, term) }))
    .filter(item => allowed.has(item.level))
    .map(({ term, level }) => {
      const path = productFoodPathTerms(index, term.termId);
      const labels = path.map(item => labelFromI18n(item.i18n, locale)).filter(Boolean);
      const alternate = path.map(item => labelFromI18n(item.i18n, locale === 'it' ? 'en' : 'it')).filter(Boolean);
      const aliases = [...(term.aliases?.it || []), ...(term.aliases?.en || [])];
      const coverage = productFoodCoverage(ingredients, term.termId);
      return {
        id: term.termId,
        label: labels.join(' › '),
        secondary: `${level}${ingredients.length ? ` · ${coverage}` : ''}`,
        searchText: [...labels, ...alternate, term.termId, ...aliases, ...(term.legacyKeys || [])].join(' '),
        data: { term, level, coverage, path: path.map(item => item.termId) }
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function createProductFoodPicker(state, index, {
  value = null, onChange = null, required = false, levels = ['category', 'subcategory', 'concept'],
  placeholder = null, showCoverage = true
} = {}) {
  const root = element('div', { className: 'product-food-picker', 'data-testid': 'product-food-picker' });
  const summary = element('small', { className: 'field__hint product-food-picker__summary', 'aria-live': 'polite' });
  const choices = productFoodChoices(index, state.i18n.locale, { ingredients: showCoverage ? (state.guidedIngredients || []) : [], levels })
    .map(choice => ({
      ...choice,
      secondary: `${state.i18n.t(`productFood.level.${choice.data?.level || 'concept'}`)}${showCoverage && Number.isFinite(choice.data?.coverage) ? ` · ${state.i18n.t('productFood.coverage').replace('{count}', String(choice.data.coverage))}` : ''}`
    }));
  const control = createAutocomplete({
    choices,
    value,
    required,
    placeholder: placeholder || state.i18n.t('productFood.search.placeholder'),
    invalidMessage: state.i18n.t('guided.reference.required'),
    emptyMessage: state.i18n.t('productFood.search.empty'),
    onChange: (id, choice) => {
      renderSummary(choice);
      onChange?.(id, choice);
    }
  });
  const renderSummary = choice => {
    const selected = choice || choices.find(item => item.id === control.getValue()) || null;
    if (!selected) { summary.textContent = state.i18n.t('productFood.search.help'); return; }
    const levelKey = `productFood.level.${selected.data?.level || 'concept'}`;
    const coverage = selected.data?.coverage;
    summary.textContent = `${state.i18n.t(levelKey)}${showCoverage && Number.isFinite(coverage) ? ` · ${state.i18n.t('productFood.coverage').replace('{count}', String(coverage))}` : ''}`;
  };
  root.append(control.node, summary);
  renderSummary();
  return {
    node: root,
    input: control.input,
    getValue: control.getValue,
    setValue: next => { control.setValue(next); renderSummary(); },
    validate: control.validate,
    getChoice: control.getChoice
  };
}

export function genericRecipeTagChoices(index, locale = 'it') {
  const choices = [];
  for (const taxonomyId of Object.values(RECIPE_TAG_TAXONOMY)) {
    const taxonomy = index?.taxonomy?.(taxonomyId);
    const taxonomyLabel = taxonomy ? labelFromI18n(taxonomy.i18n, locale) : taxonomyId;
    for (const choice of taxonomyChoices(index, taxonomyId, locale)) {
      choices.push({ ...choice, label: `${choice.label} · ${taxonomyLabel}`, searchText: `${choice.searchText} ${taxonomyLabel}`, taxonomyId });
    }
  }
  return choices.sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function ingredientChoices(items, locale = 'it', originLabels = {}) {
  return (items || []).map(item => {
    const revision = item.revision;
    const name = revision?.i18n?.[locale]?.name || revision?.i18n?.en?.name || revision?.i18n?.it?.name || item.family.ingredientId;
    const aliases = Object.values(revision?.i18n || {}).flatMap(value => value.aliases || []);
    const origin = item.family.origin;
    return { id: item.family.ingredientId, label: name, secondary: originLabels[origin] || origin || '', searchText: [name, ...aliases, item.family.ingredientId].join(' '), data: item };
  }).sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function unitsForIngredientRevision(revision) {
  if (!revision) return [];
  return unique([revision.basis?.unit, ...(revision.conversions || []).map(item => item.unit)]).map(id => ({ id, label: id }));
}

export function mealArchetypeDefault(values) {
  const clean = unique((values || []).filter(id => MEAL_ARCHETYPES.includes(id)));
  return clean.length ? clean : [...MEAL_ARCHETYPES];
}

function searchChoices(choices, query, limit = 12) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const scored = (choices || []).map(choice => {
    const haystack = normalize(`${choice.label || ''} ${choice.secondary || ''} ${choice.searchText || ''} ${choice.id || ''}`);
    if (tokens.some(token => !haystack.includes(token))) return null;
    const label = normalize(choice.label);
    const prefix = tokens.length && tokens.every(token => label.startsWith(token) || label.includes(` ${token}`));
    return { choice, score: prefix ? 0 : 1 };
  }).filter(Boolean);
  scored.sort((a, b) => a.score - b.score || a.choice.label.localeCompare(b.choice.label));
  return scored.slice(0, limit).map(item => item.choice);
}

export function createAutocomplete({ choices = [], value = null, onChange = null, placeholder = '', required = false, invalidMessage = 'Select a value from the suggestions.', emptyMessage = 'No matching values.', ariaLabel = null } = {}) {
  const root = element('div', { className: 'guided-autocomplete' });
  const inputId = nextId('guided-input'); const listId = nextId('guided-list');
  const input = element('input', { type: 'text', id: inputId, placeholder, autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) });
  const list = element('div', { id: listId, className: 'guided-suggestions', role: 'listbox', hidden: '' });
  const message = element('small', { className: 'field__error', 'aria-live': 'polite' });
  root.append(input, list, message);
  let allChoices = [...choices]; let selectedId = null; let visible = []; let active = -1;

  const byId = id => allChoices.find(choice => choice.id === id) || null;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); };
  const validate = () => {
    const valid = !required || Boolean(selectedId);
    input.setCustomValidity(valid ? '' : invalidMessage);
    message.textContent = valid ? '' : invalidMessage;
    root.classList.toggle('guided-control--invalid', !valid);
    return valid;
  };
  const choose = choice => {
    selectedId = choice?.id || null;
    input.value = choice?.label || '';
    onChange?.(selectedId, choice || null);
    signalDraftChange(root); validate(); close();
  };
  const render = () => {
    visible = searchChoices(allChoices, input.value);
    list.replaceChildren();
    if (!visible.length) {
      list.append(element('div', { className: 'guided-suggestion guided-suggestion--empty', text: emptyMessage }));
    } else {
      visible.forEach((choice, index) => {
        const optionId = `${listId}-option-${index}`;
        const button = element('button', { type: 'button', id: optionId, className: `guided-suggestion${index === active ? ' guided-suggestion--active' : ''}`, role: 'option', 'aria-selected': index === active ? 'true' : 'false' });
        button.append(element('span', { text: choice.label }));
        if (choice.secondary) button.append(element('small', { text: choice.secondary }));
        button.addEventListener('mousedown', event => { event.preventDefault(); choose(choice); });
        list.append(button);
      });
    }
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (active >= 0 && visible[active]) input.setAttribute('aria-activedescendant', `${listId}-option-${active}`); else input.removeAttribute('aria-activedescendant');
  };

  input.addEventListener('focus', render);
  input.addEventListener('input', () => {
    const current = byId(selectedId);
    if (!current || input.value !== current.label) { selectedId = null; onChange?.(null, null); }
    active = -1; validate(); render();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) render(); if (!visible.length) return;
      active = event.key === 'ArrowDown' ? Math.min(visible.length - 1, active + 1) : Math.max(0, active <= 0 ? visible.length - 1 : active - 1); render(); return;
    }
    if (event.key === 'Enter' && active >= 0 && visible[active]) { event.preventDefault(); choose(visible[active]); }
  });
  input.addEventListener('blur', () => setTimeout(() => { close(); validate(); }, 80));

  const setValue = nextIdValue => { const choice = byId(nextIdValue); selectedId = choice?.id || null; input.value = choice?.label || ''; validate(); };
  const setChoices = nextChoices => { allChoices = [...(nextChoices || [])]; const current = byId(selectedId); if (!current) { selectedId = null; input.value = ''; onChange?.(null, null); } else input.value = current.label; validate(); };
  setValue(value);
  return { node: root, input, getValue: () => selectedId, setValue, setChoices, validate, getChoice: () => byId(selectedId) };
}

export function createMultiSelectChips({ choices = [], values = [], onChange = null, placeholder = '', minItems = 0, invalidMessage = 'Select at least one value.', emptyMessage = 'No matching values.' } = {}) {
  const root = element('div', { className: 'guided-multi' });
  const chips = element('div', { className: 'guided-chips' });
  const selected = new Set((values || []).filter(id => choices.some(choice => choice.id === id)));
  const autocompleteHost = element('div');
  root.append(chips, autocompleteHost);
  let autocomplete;

  const emit = () => { onChange?.([...selected]); signalDraftChange(root); };
  const available = () => choices.filter(choice => !selected.has(choice.id));
  const validate = () => {
    const valid = selected.size >= minItems;
    autocomplete?.input?.setCustomValidity(valid ? '' : invalidMessage);
    root.classList.toggle('guided-control--invalid', !valid);
    return valid;
  };
  const renderChips = () => {
    chips.replaceChildren();
    for (const id of selected) {
      const choice = choices.find(item => item.id === id); if (!choice) continue;
      const chip = element('span', { className: 'guided-chip' }, [element('span', { text: choice.label }), element('button', { type: 'button', className: 'guided-chip__remove', 'aria-label': `Remove ${choice.label}`, text: '×', onClick: () => { selected.delete(id); render(); emit(); validate(); } })]);
      chips.append(chip);
    }
  };
  const render = () => {
    renderChips(); autocompleteHost.replaceChildren();
    autocomplete = createAutocomplete({ choices: available(), value: null, placeholder, required: false, emptyMessage, onChange: id => { if (!id) return; selected.add(id); render(); emit(); validate(); } });
    autocompleteHost.append(autocomplete.node); validate();
  };
  render();
  return { node: root, getValues: () => [...selected], setValues: next => { selected.clear(); for (const id of next || []) if (choices.some(choice => choice.id === id)) selected.add(id); render(); emit(); }, validate };
}

export function createTokenChips({ values = [], onChange = null, placeholder = '', addLabel = 'Add' } = {}) {
  const root = element('div', { className: 'guided-token-editor' });
  const chips = element('div', { className: 'guided-chips' });
  const row = element('div', { className: 'guided-token-editor__row' });
  const input = element('input', { type: 'text', placeholder });
  const add = element('button', { type: 'button', className: 'button button--secondary button--small', text: addLabel });
  row.append(input, add); root.append(chips, row);
  const selected = new Set((values || []).map(value => String(value).trim()).filter(Boolean));
  const emit = () => { onChange?.([...selected]); signalDraftChange(root); };
  const render = () => {
    chips.replaceChildren();
    for (const value of selected) chips.append(element('span', { className: 'guided-chip' }, [element('span', { text: value }), element('button', { type: 'button', className: 'guided-chip__remove', 'aria-label': `Remove ${value}`, text: '×', onClick: () => { selected.delete(value); render(); emit(); } })]));
  };
  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    selected.add(value); input.value = ''; render(); emit();
  };
  add.addEventListener('click', commit);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commit(); } });
  render();
  return { node: root, input, getValues: () => [...selected] };
}

export function createMealArchetypePicker(state, values = [], { onChange = null } = {}) {
  const root = element('div', { className: 'guided-archetypes' });
  const controls = new Map(); const message = element('small', { className: 'field__error', 'aria-live': 'polite' });
  let selected = new Set(mealArchetypeDefault(values));
  const validate = () => { const valid = selected.size > 0; message.textContent = valid ? '' : state.i18n.t('guided.mealArchetype.required'); root.classList.toggle('guided-control--invalid', !valid); return valid; };
  const emit = () => { onChange?.([...selected]); signalDraftChange(root); };
  for (const id of MEAL_ARCHETYPES) {
    const input = element('input', { type: 'checkbox', checked: selected.has(id) });
    input.addEventListener('change', () => { if (input.checked) selected.add(id); else selected.delete(id); validate(); emit(); });
    controls.set(id, input); root.append(element('label', { className: 'check-field' }, [input, element('span', { text: state.i18n.t(`mealArchetype.${id}`) })]));
  }
  root.append(message); validate();
  return { node: root, getValues: () => [...selected], validate, selectAll: () => { selected = new Set(MEAL_ARCHETYPES); for (const [id, input] of controls) input.checked = selected.has(id); validate(); emit(); } };
}

export function createEnumSelect(state, values, value, prefix, onChange = null) {
  const select = element('select');
  for (const id of values) select.append(element('option', { value: id, text: state.i18n.t(`${prefix}.${id}`) }));
  select.value = value;
  select.addEventListener('change', () => { onChange?.(select.value); signalDraftChange(select); });
  return select;
}

export function createHierarchicalFoodCategorySelector(state, index, { foodGroup = null, foodSubgroup = null, onChange = null } = {}) {
  const root = element('div', { className: 'hierarchical-selector' });
  const groupHost = element('div'); const subgroupHost = element('div'); root.append(groupHost, subgroupHost);
  let groupControl; let subgroupControl; let groupId = foodGroup; let subgroupId = foodSubgroup;
  const renderSubgroup = () => {
    subgroupHost.replaceChildren();
    const choices = groupId ? taxonomyChoices(index, 'food_category', state.i18n.locale, { parentTermId: groupId }) : [];
    if (subgroupId && !choices.some(choice => choice.id === subgroupId)) subgroupId = null;
    subgroupControl = createAutocomplete({ choices, value: subgroupId, required: false, placeholder: state.i18n.t('guided.foodSubgroup.placeholder'), onChange: id => { subgroupId = id; onChange?.({ foodGroup: groupId, foodSubgroup: subgroupId }); } });
    subgroupControl.input.disabled = !groupId;
    subgroupHost.append(element('label', { className: 'field guided-field' }, [element('span', { text: state.i18n.t('catalog.foodSubgroup') }), subgroupControl.node]));
  };
  groupControl = createAutocomplete({ choices: taxonomyChoices(index, 'food_category', state.i18n.locale, { rootsOnly: true }), value: groupId, required: true, placeholder: state.i18n.t('guided.foodGroup.placeholder'), invalidMessage: state.i18n.t('guided.reference.required'), onChange: id => { groupId = id; subgroupId = null; renderSubgroup(); onChange?.({ foodGroup: groupId, foodSubgroup: subgroupId }); } });
  groupHost.append(element('label', { className: 'field guided-field' }, [element('span', { text: state.i18n.t('catalog.foodGroup') }), groupControl.node])); renderSubgroup();
  return { node: root, getValue: () => ({ foodGroup: groupId, foodSubgroup: subgroupId }), validate: () => groupControl.validate() && (!subgroupControl || subgroupControl.validate()) };
}
