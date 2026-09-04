import { element } from './dom.js';
import {
  ALLERGEN_IDS, ALLERGY_KINDS, ALLERGY_TARGET_TYPES, DAY_ARCHETYPES, FOOD_PREFERENCE_LEVELS,
  FOOD_PREFERENCE_TARGET_TYPES, MEAL_ARCHETYPES, MEAL_RULE_TARGET_REGISTRY, NUTRIENT_KEYS,
  NUTRITION_PRESETS, NUMERIC_OPERATORS, RULE_STRENGTHS, RULE_TYPES, makeId
} from '../domain/configurationRules.js';
import {
  activeRecords, completeOnboarding, configurationDiagnostics, getOnboardingDraft, normalizeCycle,
  onboardingIsComplete, saveConfigurationBundle, saveOnboardingDraft, summarizeConfiguration
} from '../services/configurationService.js';
import { applyTheme } from '../theme/themeEngine.js';
import { createConfigurationExport, importConfigurationExport } from '../services/configurationTransfer.js';
import { TAXONOMY_IDS, semanticReferenceDiagnostics } from '../services/referenceDataService.js';
import { createAutocomplete, genericRecipeTagChoices, ingredientChoices, taxonomyChoices } from './guidedControls.js';
import { controlledDetails, signalDraftChange } from './uiState.js';

function clone(value) { return structuredClone(value); }
function n(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function nullableNumber(value) { return value === '' ? null : n(value, null); }
function requiredNumber(value) { return value === '' ? null : n(value, null); }
function optionText(state, prefix, value) { return state.i18n.t(`${prefix}.${value}`); }

function routeLink(state, href, key, className = 'button button--secondary') {
  return element('a', { href, 'data-route': '', className, text: state.i18n.t(key) });
}

function page(state, eyebrow, titleKey, descriptionKey, { wide = false } = {}) {
  const section = element('section', { className: `page-card config-page${wide ? ' page-card--wide' : ''}` });
  section.append(
    element('p', { className: 'eyebrow', text: eyebrow }),
    element('h1', { text: state.i18n.t(titleKey) }),
    element('p', { className: 'lead', text: state.i18n.t(descriptionKey) })
  );
  return section;
}

function subheading(state, key, bodyKey = null) {
  const header = element('div', { className: 'section-heading' });
  header.append(element('h2', { text: state.i18n.t(key) }));
  if (bodyKey) header.append(element('p', { className: 'muted', text: state.i18n.t(bodyKey) }));
  return header;
}

function field(state, labelKey, control, hintKey = null) {
  const wrapper = element('label', { className: 'field' });
  wrapper.append(element('span', { text: state.i18n.t(labelKey) }), control);
  if (hintKey) wrapper.append(element('small', { className: 'field__hint', text: state.i18n.t(hintKey) }));
  return wrapper;
}

function textInput(value = '', onInput = null, attrs = {}) {
  return element('input', { type: 'text', value: value ?? '', ...(onInput ? { onInput: event => onInput(event.target.value) } : {}), ...attrs });
}

function numberInput(value, onInput, attrs = {}) {
  return element('input', { type: 'number', value: value ?? '', onInput: event => onInput(event.target.value), ...attrs });
}

function checkbox(checked, onChange, label) {
  const input = element('input', { type: 'checkbox', checked, onChange: event => onChange(event.target.checked) });
  return element('label', { className: 'check-field' }, [input, element('span', { text: label })]);
}

function selectInput(state, values, value, prefix, onChange, { rawLabels = null } = {}) {
  const select = element('select', { onChange: event => onChange(event.target.value) });
  for (const entry of values) select.append(element('option', { value: entry, text: rawLabels?.[entry] ?? optionText(state, prefix, entry) }));
  select.value = value;
  return select;
}

function actionButton(state, key, onClick, className = 'button') {
  return element('button', { type: 'button', className, text: state.i18n.t(key), onClick });
}

function semanticTargetControl(state, kind, value, onChange) {
  let choices = [];
  if (kind === 'ingredient') choices = ingredientChoices(state.guidedIngredients || [], state.i18n.locale, {
    base: state.i18n.t('catalog.origin.base'), user: state.i18n.t('catalog.origin.user')
  });
  else if (kind === 'foodCategory') choices = taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.foodCategory, state.i18n.locale);
  else if (kind === 'cuisine') choices = taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.cuisine, state.i18n.locale);
  else if (kind === 'flavor') choices = taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.flavorProfile, state.i18n.locale);
  else if (kind === 'recipeTag' || kind === 'tag') choices = genericRecipeTagChoices(state.referenceDataIndex, state.i18n.locale);
  return createAutocomplete({
    choices, value: value || null, required: true, placeholder: state.i18n.t('guided.reference.search'),
    invalidMessage: state.i18n.t('guided.reference.required'), onChange: id => onChange(id || '')
  });
}

function statusBox(state) {
  const node = element('div', { className: 'inline-status', 'aria-live': 'polite' });
  return {
    node,
    ok(messageKey = 'config.saved') { node.className = 'validation-box'; node.textContent = state.i18n.t(messageKey); },
    error(error) { node.className = 'validation-box validation-box--error'; node.textContent = error?.message || String(error); },
    clear() { node.className = 'inline-status'; node.textContent = ''; }
  };
}

function configurationUiDiagnostics(state, draft, filter = null) {
  const structural = configurationDiagnostics(draft, state.registry);
  const errors = [...structural.errors];
  if (state.referenceDataIndex) {
    const semantic = semanticReferenceDiagnostics({
      index: state.referenceDataIndex,
      configuration: draft,
      ingredientIds: (state.guidedIngredients || []).map(item => item.family?.ingredientId).filter(Boolean)
    });
    for (const raw of semantic.errors) {
      const split = raw.indexOf(': ');
      errors.push({ path: split >= 0 ? raw.slice(0, split) : 'semantic', message: split >= 0 ? raw.slice(split + 2) : raw });
    }
  }
  const scoped = filter ? errors.filter(item => filter(item.path)) : errors;
  return { valid: scoped.length === 0, errors: scoped, warnings: structural.warnings };
}

function diagnosticList(state, draft, filter = null) {
  const result = configurationUiDiagnostics(state, draft, filter);
  if (!result.errors.length) return element('div', { className: 'validation-box', text: state.i18n.t('config.validation.ok') });
  const box = element('div', { className: 'validation-box validation-box--error' });
  box.append(element('strong', { text: state.i18n.t('config.validation.fix') }));
  const list = element('ul');
  for (const item of result.errors.slice(0, 12)) list.append(element('li', { text: `${item.path}: ${item.message}` }));
  box.append(list);
  return box;
}

async function persist(state, draft, status) {
  try {
    const saved = await saveConfigurationBundle(draft, { repo: state.repo, registry: state.registry });
    state.configuration = saved;
    state.config = saved.appConfig;
    const active = activeRecords(saved);
    state.theme = active.themeProfile;
    if (state.theme) applyTheme(state.theme);
    state.i18n.setLocale(saved.appConfig.locale);
    document.documentElement.lang = state.i18n.locale;
    localStorage.setItem('ydm:locale-bootstrap', state.i18n.locale);
    state.markSaved?.();
    status.ok();
    state.notify?.('success', state.i18n.t('config.saved'));
    state.render({ force: true });
    return true;
  } catch (error) {
    status.error(error);
    state.notify?.('error', `${state.i18n.t('config.saveFailed')}: ${error?.message || error}`);
    return false;
  }
}

function editorActions(state, draft, status, filter) {
  const actions = element('div', { className: 'editor-footer' });
  const diagnostics = element('div', { className: 'editor-footer__diagnostics' });
  const save = actionButton(state, 'common.save', () => persist(state, draft, status));
  actions.setAttribute('data-testid', 'editor-actions');
  save.setAttribute('data-testid', 'editor-save');
  const refresh = () => {
    const result = configurationUiDiagnostics(state, draft, filter);
    diagnostics.replaceChildren(diagnosticList(state, draft, filter));
    save.disabled = !result.valid;
    save.setAttribute('aria-disabled', save.disabled ? 'true' : 'false');
  };
  actions.append(diagnostics, save, status.node);
  return { node: actions, refresh };
}

function mountEditorActions(section, state, draft, status, filter) {
  const actions = editorActions(state, draft, status, filter);
  section.addEventListener('input', actions.refresh);
  section.addEventListener('change', actions.refresh);
  section.addEventListener('ydm:draft-change', actions.refresh);
  section.append(actions.node);
  actions.refresh();
  return actions;
}

function downloadConfigurationDocument(fileDocument) {
  const blob = new Blob([JSON.stringify(fileDocument, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = element('a', { href: url, download: `yourDietManager-configuration-${fileDocument.mode}-${fileDocument.createdAt.slice(0, 10)}.json` });
  document.body?.append?.(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export function configurationIndexPage(state) {
  const section = page(state, 'PHASE 2', 'page.configure.title', 'page.configure.description', { wide: true });
  const summary = summarizeConfiguration(state.configuration, state.registry);
  const grid = element('div', { className: 'summary-grid' });
  const stats = [
    ['config.summary.energy', summary.dailyEnergyKcal ? `${summary.dailyEnergyKcal} kcal` : '—'],
    ['config.summary.hardRules', summary.hardRuleCount],
    ['config.summary.mealClasses', summary.mealClassCount],
    ['config.summary.dayClasses', summary.dayClassCount],
    ['config.summary.cycle', summary.cycleLength]
  ];
  for (const [key, value] of stats) grid.append(element('div', { className: 'metric' }, [element('span', { text: state.i18n.t(key) }), element('strong', { text: value })]));
  section.append(grid);

  const links = [
    ['/configure/nutrition', 'config.card.nutrition.title', 'config.card.nutrition.body'],
    ['/configure/safety', 'config.card.safety.title', 'config.card.safety.body'],
    ['/configure/preferences', 'config.card.preferences.title', 'config.card.preferences.body'],
    ['/configure/meals', 'config.card.meals.title', 'config.card.meals.body'],
    ['/configure/days', 'config.card.days.title', 'config.card.days.body'],
    ['/configure/cycle', 'config.card.cycle.title', 'config.card.cycle.body'],
    ['/configure/ingredients', 'config.card.ingredients.title', 'config.card.ingredients.body'],
    ['/configure/reference-data', 'config.card.referenceData.title', 'config.card.referenceData.body']
  ];
  const cards = element('div', { className: 'config-grid' });
  for (const [href, title, body] of links) {
    cards.append(element('a', { href, 'data-route': '', className: 'config-card' }, [
      element('strong', { text: state.i18n.t(title) }), element('span', { text: state.i18n.t(body) })
    ]));
  }
  section.append(subheading(state, 'config.sections'), cards);
  section.append(summary.valid ? element('div', { className: 'validation-box', text: state.i18n.t('config.validation.ok') }) : diagnosticList(state, state.configuration));

  section.append(element('div', { className: 'validation-box', text: state.i18n.t('onboarding.disabled.configNotice') }));

  const transferStatus = element('div', { 'aria-live': 'polite' });
  const importInput = element('input', { type: 'file', accept: 'application/json,.json', className: 'visually-hidden' });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]; if (!file) return;
    try {
      const saved = await importConfigurationExport(JSON.parse(await file.text()), { repo: state.repo, registry: state.registry });
      state.configuration = saved; state.config = saved.appConfig; state.theme = activeRecords(saved).themeProfile;
      applyTheme(state.theme); state.i18n.setLocale(saved.appConfig.locale); document.documentElement.lang = state.i18n.locale;
      localStorage.setItem('ydm:locale-bootstrap', state.i18n.locale); state.onboardingComplete = true; state.onboardingDraft = null;
      transferStatus.className = 'validation-box'; transferStatus.textContent = state.i18n.t('config.transfer.imported'); state.notify?.('success', state.i18n.t('config.transfer.imported')); state.render({ force: true });
    } catch (error) { transferStatus.className = 'validation-box validation-box--error'; transferStatus.textContent = error.message || String(error); }
    finally { importInput.value = ''; }
  });
  const transfer = element('div', { className: 'transfer-panel' });
  transfer.append(subheading(state, 'config.transfer.title', 'config.transfer.body'), element('div', { className: 'button-row' }, [
    actionButton(state, 'config.transfer.exportStructure', async () => downloadConfigurationDocument(await createConfigurationExport(state.configuration, { mode: 'structure' })), 'button button--secondary'),
    actionButton(state, 'config.transfer.exportFull', async () => downloadConfigurationDocument(await createConfigurationExport(state.configuration, { mode: 'full' })), 'button button--secondary'),
    actionButton(state, 'config.transfer.import', () => importInput.click())
  ]), importInput, transferStatus);
  section.append(transfer);
  return section;
}

function nutritionForm(state, profile, { compact = false } = {}) {
  const body = element('div', { className: 'editor-stack' });
  const top = element('div', { className: 'form-grid form-grid--3' });
  top.append(
    field(state, 'nutrition.dailyEnergy', numberInput(profile.dailyEnergyKcal, value => { profile.dailyEnergyKcal = requiredNumber(value); profile.preset = 'custom'; }, { min: 1, step: 10, 'data-testid': 'nutrition-daily-energy' })),
    field(state, 'nutrition.tolerance', numberInput(profile.energyTolerancePct, value => { profile.energyTolerancePct = requiredNumber(value); profile.preset = 'custom'; }, { min: 0, max: 30, step: 1 })),
    field(state, 'nutrition.preset', selectInput(state, NUTRITION_PRESETS, profile.preset, 'nutrition.preset', value => { profile.preset = value; }))
  );
  body.append(top);
  if (compact) return body;

  body.append(subheading(state, 'nutrition.nutrients', 'nutrition.nutrients.body'));
  const nutrientTable = element('div', { className: 'data-table data-table--nutrients' });
  nutrientTable.append(element('div', { className: 'data-table__head' }, ['nutrition.nutrient', 'common.enabled', 'nutrition.min', 'nutrition.target', 'nutrition.max', 'nutrition.weight'].map(key => element('span', { text: state.i18n.t(key) }))));
  for (const key of NUTRIENT_KEYS) {
    const nutrient = profile.nutrients[key];
    const row = element('div', { className: 'data-table__row' });
    const enabled = element('input', { type: 'checkbox', checked: nutrient.enabled });
    const min = numberInput(nutrient.min, value => { nutrient.min = nullableNumber(value); profile.preset = 'custom'; }, { min: 0, step: 1 });
    const target = numberInput(nutrient.target, value => { nutrient.target = nullableNumber(value); profile.preset = 'custom'; }, { min: 0, step: 1 });
    const max = numberInput(nutrient.max, value => { nutrient.max = nullableNumber(value); profile.preset = 'custom'; }, { min: 0, step: 1 });
    const weight = numberInput(nutrient.weight, value => { nutrient.weight = requiredNumber(value); profile.preset = 'custom'; }, { min: 0, step: 0.1 });
    const sync = checked => {
      nutrient.enabled = checked;
      for (const control of [min, target, max, weight]) control.disabled = !checked;
      if (!checked) { nutrient.min = null; nutrient.target = null; nutrient.max = null; nutrient.weight = 0; min.value = ''; target.value = ''; max.value = ''; weight.value = '0'; }
      else if (nutrient.weight === 0) { nutrient.weight = 1; weight.value = '1'; }
      profile.preset = 'custom';
    };
    enabled.addEventListener('change', event => sync(event.target.checked));
    sync(nutrient.enabled);
    row.append(element('strong', { text: state.i18n.t(`nutrition.${key}`) }), enabled, min, target, max, weight);
    nutrientTable.append(row);
  }
  body.append(nutrientTable);

  body.append(subheading(state, 'nutrition.modifiers', 'nutrition.modifiers.body'));
  const modifiers = element('div', { className: 'modifier-grid' });
  for (const archetype of DAY_ARCHETYPES) {
    const existing = profile.dayArchetypeModifiers[archetype];
    const card = element('div', { className: 'compact-card' });
    const enabled = element('input', { type: 'checkbox', checked: Boolean(existing) });
    const mode = selectInput(state, ['kcal', 'percent'], existing?.mode || 'percent', 'nutrition.modifierMode', value => {
      if (profile.dayArchetypeModifiers[archetype]) profile.dayArchetypeModifiers[archetype].mode = value;
    });
    const value = numberInput(existing?.value ?? 0, raw => {
      if (profile.dayArchetypeModifiers[archetype]) profile.dayArchetypeModifiers[archetype].value = requiredNumber(raw);
    }, { min: -1000, max: 1000, step: 1 });
    const sync = checked => {
      if (checked && !profile.dayArchetypeModifiers[archetype]) profile.dayArchetypeModifiers[archetype] = { mode: mode.value || 'percent', value: requiredNumber(value.value) };
      if (!checked) delete profile.dayArchetypeModifiers[archetype];
      mode.disabled = !checked; value.disabled = !checked;
    };
    enabled.addEventListener('change', event => sync(event.target.checked)); sync(Boolean(existing));
    card.append(element('div', { className: 'compact-card__title' }, [enabled, element('strong', { text: optionText(state, 'dayArchetype', archetype) })]), mode, value);
    modifiers.append(card);
  }
  body.append(modifiers);
  return body;
}

export function nutritionPage(state) {
  const draft = clone(state.configuration);
  const profile = activeRecords(draft).nutritionProfile;
  const section = page(state, 'NUTRITION', 'nutrition.page.title', 'nutrition.page.body', { wide: true });
  section.setAttribute('data-testid', 'nutrition-editor');
  const status = statusBox(state);
  section.append(nutritionForm(state, profile));
  mountEditorActions(section, state, draft, status, path => path.startsWith('nutritionProfiles'));
  return section;
}

function allergyRulesEditor(state, profile, rerender, { compact = false } = {}) {
  const container = element('div', { className: 'rule-list' });
  for (const rule of profile.rules) {
    const row = element('div', { className: 'rule-card' });
    const kind = selectInput(state, ALLERGY_KINDS, rule.kind, 'allergy.kind', value => { rule.kind = value; });
    const targetType = selectInput(state, ALLERGY_TARGET_TYPES, rule.targetType, 'allergy.targetType', value => {
      rule.targetType = value;
      rule.targetId = value === 'allergen' ? ALLERGEN_IDS[0] : '';
      signalDraftChange(container); rerender();
    });
    const target = rule.targetType === 'allergen'
      ? selectInput(state, ALLERGEN_IDS, rule.targetId, 'allergen', value => { rule.targetId = value; })
      : semanticTargetControl(state, rule.targetType, rule.targetId, value => { rule.targetId = value; }).node;
    const label = textInput(rule.label || '', value => { rule.label = value; }, { placeholder: state.i18n.t('allergy.label.placeholder') });
    const enabled = checkbox(rule.enabled, value => { rule.enabled = value; }, state.i18n.t('common.enabled'));
    row.append(kind, targetType, target, label, enabled);
    if (!compact) row.append(textInput(rule.notes || '', value => { rule.notes = value; }, { placeholder: state.i18n.t('allergy.notes.placeholder') }));
    row.append(actionButton(state, 'common.remove', () => { profile.rules = profile.rules.filter(item => item.id !== rule.id); signalDraftChange(container); rerender(); }, 'button button--danger button--small'));
    container.append(row);
  }
  container.append(actionButton(state, 'allergy.add', () => {
    profile.rules.push({ schemaVersion: undefined, id: makeId('safety'), kind: 'allergy', targetType: 'allergen', targetId: 'gluten_cereals', label: '', enabled: true, notes: '' });
    delete profile.rules.at(-1).schemaVersion;
    signalDraftChange(container); rerender();
  }, 'button button--secondary'));
  return container;
}

export function safetyPage(state) {
  const draft = clone(state.configuration); const profile = activeRecords(draft).allergyProfile;
  const section = page(state, 'HARD CONSTRAINTS', 'allergy.page.title', 'allergy.page.body', { wide: true });
  const status = statusBox(state); const editor = element('div');
  const render = () => { editor.replaceChildren(allergyRulesEditor(state, profile, render)); };
  render();
  section.append(element('div', { className: 'safety-banner', text: state.i18n.t('allergy.safetyNotice') }), editor);
  mountEditorActions(section, state, draft, status, path => path.startsWith('allergyIntoleranceProfile') || path.startsWith('allergyIntoleranceProfiles'));
  return section;
}

function preferenceRulesEditor(state, preferences, rerender, { compact = false } = {}) {
  const container = element('div', { className: 'rule-list' });
  for (const rule of preferences.rules) {
    const row = element('div', { className: 'rule-card' });
    const targetType = selectInput(state, FOOD_PREFERENCE_TARGET_TYPES, rule.targetType, 'preference.targetType', value => { rule.targetType = value; rule.targetId = ''; signalDraftChange(container); rerender(); });
    const target = semanticTargetControl(state, rule.targetType, rule.targetId, value => { rule.targetId = value; });
    row.append(
      targetType,
      target.node,
      selectInput(state, FOOD_PREFERENCE_LEVELS, rule.level, 'preference.level', value => { rule.level = value; }),
      checkbox(rule.autoExclude, value => { rule.autoExclude = value; }, state.i18n.t('preference.autoExclude'))
    );
    if (!compact) {
      const hasFrequency = Boolean(rule.frequency);
      const freqToggle = element('input', { type: 'checkbox', checked: hasFrequency });
      const max = numberInput(rule.frequency?.maxOccurrences ?? 2, value => { if (rule.frequency) { const parsed = requiredNumber(value); rule.frequency.maxOccurrences = parsed === null ? null : Math.max(0, Math.round(parsed)); } }, { min: 0, step: 1 });
      const days = numberInput(rule.frequency?.windowDays ?? 7, value => { if (rule.frequency) { const parsed = requiredNumber(value); rule.frequency.windowDays = parsed === null ? null : Math.max(1, Math.min(31, Math.round(parsed))); } }, { min: 1, max: 31, step: 1 });
      const sync = checked => { rule.frequency = checked ? (rule.frequency || { maxOccurrences: 2, windowDays: 7 }) : null; max.disabled = !checked; days.disabled = !checked; };
      freqToggle.addEventListener('change', event => sync(event.target.checked)); sync(hasFrequency);
      row.append(
        element('label', { className: 'check-field' }, [freqToggle, element('span', { text: state.i18n.t('preference.frequency') })]),
        field(state, 'preference.frequency.maxOccurrences', max),
        field(state, 'preference.frequency.windowDays', days)
      );
    }
    row.append(actionButton(state, 'common.remove', () => { preferences.rules = preferences.rules.filter(item => item.id !== rule.id); signalDraftChange(container); rerender(); }, 'button button--danger button--small'));
    container.append(row);
  }
  container.append(actionButton(state, 'preference.add', () => {
    preferences.rules.push({ id: makeId('pref'), targetType: 'foodCategory', targetId: '', level: 'normal', autoExclude: false, frequency: null }); signalDraftChange(container); rerender();
  }, 'button button--secondary'));
  return container;
}

export function preferencesPage(state) {
  const draft = clone(state.configuration); const preferences = activeRecords(draft).foodPreferences;
  const section = page(state, 'SOFT CONSTRAINTS', 'preference.page.title', 'preference.page.body', { wide: true });
  const status = statusBox(state); const editor = element('div');
  const render = () => editor.replaceChildren(preferenceRulesEditor(state, preferences, render)); render();
  section.append(editor);
  mountEditorActions(section, state, draft, status, path => path.startsWith('foodPreferences'));
  return section;
}

function energyShareEditor(state, meal) {
  if (!meal.energyShare) meal.energyShare = { target: 0.25, min: 0.15, max: 0.35 };
  return element('div', { className: 'form-grid form-grid--3' }, [
    field(state, 'nutrition.min', numberInput(meal.energyShare.min, value => { meal.energyShare.min = requiredNumber(value); }, { min: 0, max: 1, step: 0.01 })),
    field(state, 'nutrition.target', numberInput(meal.energyShare.target, value => { meal.energyShare.target = requiredNumber(value); }, { min: 0, max: 1, step: 0.01 })),
    field(state, 'nutrition.max', numberInput(meal.energyShare.max, value => { meal.energyShare.max = requiredNumber(value); }, { min: 0, max: 1, step: 0.01 }))
  ]);
}

function mealRuleEditor(state, meal, rerender) {
  const list = element('div', { className: 'rule-list' });
  for (const rule of meal.rules) {
    const row = element('div', { className: 'rule-card rule-card--meal' });
    const type = selectInput(state, RULE_TYPES, rule.ruleType, 'meal.ruleType', value => {
      rule.ruleType = value;
      if (value === 'nutrition' || value === 'practical') {
        rule.target = Object.keys(MEAL_RULE_TARGET_REGISTRY[value])[0]; rule.operator = 'lte'; rule.value = 0;
      } else { delete rule.operator; delete rule.value; rule.target = ''; }
      signalDraftChange(list); rerender();
    });
    let target;
    if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') {
      const values = Object.keys(MEAL_RULE_TARGET_REGISTRY[rule.ruleType]);
      if (!values.includes(rule.target)) rule.target = values[0];
      target = selectInput(state, values, rule.target, 'meal.target', value => { rule.target = value; });
    } else target = semanticTargetControl(state, rule.ruleType, rule.target, value => { rule.target = value; }).node;
    row.append(type, target, selectInput(state, RULE_STRENGTHS, rule.strength, 'meal.strength', value => { rule.strength = value; }));
    if (rule.ruleType === 'nutrition' || rule.ruleType === 'practical') {
      row.append(selectInput(state, NUMERIC_OPERATORS, rule.operator, 'meal.operator', value => { rule.operator = value; }), numberInput(rule.value, value => { rule.value = requiredNumber(value); }, { step: 1 }));
    }
    row.append(actionButton(state, 'common.remove', () => { meal.rules = meal.rules.filter(item => item !== rule); signalDraftChange(list); rerender(); }, 'button button--danger button--small'));
    list.append(row);
  }
  const addRule = actionButton(state, 'meal.rule.add', () => { meal.rules.push({ ruleType: 'tag', target: '', strength: 'neutral' }); signalDraftChange(list); rerender(); }, 'button button--secondary button--small');
  addRule.setAttribute('data-testid', 'meal-rule-add');
  list.append(addRule);
  return list;
}

export function mealClassesPage(state) {
  const draft = clone(state.configuration); const section = page(state, 'MEAL CLASS', 'meal.page.title', 'meal.page.body', { wide: true });
  section.setAttribute('data-testid', 'meal-class-editor');
  const status = statusBox(state); const editor = element('div');
  const render = () => {
    editor.replaceChildren();
    for (const meal of draft.mealClasses) {
      const usage = draft.dayClasses.reduce((count, day) => count + day.mealSlots.filter(slot => slot.mealClassId === meal.id).length, 0);
      const details = controlledDetails(state, `meal-class:${meal.id}`, { className: 'entity-editor', defaultOpen: draft.mealClasses.length <= 4 });
      details.append(element('summary', {}, [element('strong', { text: meal.name }), element('span', { className: 'entity-badge', text: `${meal.abbreviation} · ${optionText(state, 'mealArchetype', meal.mealArchetype)}` })]));
      const body = element('div', { className: 'entity-editor__body' });
      const basic = element('div', { className: 'form-grid form-grid--3' });
      basic.append(
        field(state, 'common.name', textInput(meal.name, value => { meal.name = value; })),
        field(state, 'common.abbreviation', textInput(meal.abbreviation, value => { meal.abbreviation = value.slice(0, 2); }, { maxlength: 2 })),
        field(state, 'meal.archetype', selectInput(state, MEAL_ARCHETYPES, meal.mealArchetype, 'mealArchetype', value => { meal.mealArchetype = value; }))
      );
      body.append(basic, subheading(state, 'meal.energyShare'), energyShareEditor(state, meal), subheading(state, 'meal.rules'), mealRuleEditor(state, meal, render));
      const remove = actionButton(state, 'common.delete', () => {
        draft.mealClasses = draft.mealClasses.filter(item => item.id !== meal.id);
        draft.appConfig.mealClassIds = draft.appConfig.mealClassIds.filter(id => id !== meal.id); signalDraftChange(editor); render();
      }, 'button button--danger');
      remove.disabled = usage > 0;
      body.append(element('div', { className: 'entity-actions' }, [element('span', { className: 'muted', text: usage ? `${usage} ${state.i18n.t('meal.references')}` : state.i18n.t('common.notReferenced') }), remove]));
      details.append(body); editor.append(details);
    }
    editor.append(actionButton(state, 'meal.add', () => {
      const id = makeId('mc');
      draft.mealClasses.push({ schemaVersion: 1, id, name: state.i18n.t('meal.newName'), abbreviation: 'NP', mealArchetype: 'snack', energyShare: { target: 0.15, min: 0.08, max: 0.22 }, rules: [] });
      draft.appConfig.mealClassIds.push(id); state.ui.expanded[`meal-class:${id}`] = true; signalDraftChange(editor); render();
    }, 'button button--secondary'));
  };
  render();
  section.append(editor);
  mountEditorActions(section, state, draft, status, path => path.startsWith('mealClass') || path.includes('mealClassIds'));
  return section;
}

function capabilitiesEditor(state, capabilities) {
  const grid = element('div', { className: 'form-grid form-grid--3' });
  grid.append(
    field(state, 'day.fridge', selectInput(state, ['yes', 'no', 'unknown'], capabilities.fridge, 'common.tristate', value => { capabilities.fridge = value; })),
    field(state, 'day.reheating', selectInput(state, ['yes', 'no', 'unknown'], capabilities.reheating, 'common.tristate', value => { capabilities.reheating = value; })),
    field(state, 'day.maxPrepMinutes', numberInput(capabilities.maxPrepMinutes, value => { capabilities.maxPrepMinutes = nullableNumber(value); }, { min: 0, step: 5 }))
  );
  grid.append(
    checkbox(capabilities.cooking, value => { capabilities.cooking = value; }, state.i18n.t('day.cooking')),
    checkbox(capabilities.complexSnack, value => { capabilities.complexSnack = value; }, state.i18n.t('day.complexSnack')),
    checkbox(capabilities.portabilityRequired, value => { capabilities.portabilityRequired = value; }, state.i18n.t('day.portability'))
  );
  return grid;
}

function workWindowsEditor(state, day, rerender) {
  const list = element('div', { className: 'rule-list' });
  day.workWindows.forEach((window, index) => {
    const row = element('div', { className: 'rule-card' });
    row.append(
      element('input', { type: 'time', value: window.start, onInput: event => { window.start = event.target.value; } }),
      element('input', { type: 'time', value: window.end, onInput: event => { window.end = event.target.value; } }),
      numberInput(window.endDayOffset, value => { { const parsed = requiredNumber(value); window.endDayOffset = parsed === null ? null : Math.max(0, Math.min(2, Math.round(parsed))); } }, { min: 0, max: 2, step: 1 }),
      actionButton(state, 'common.remove', () => { day.workWindows.splice(index, 1); signalDraftChange(list); rerender(); }, 'button button--danger button--small')
    ); list.append(row);
  });
  if (day.workWindows.length < 2) list.append(actionButton(state, 'day.workWindow.add', () => { day.workWindows.push({ start: '09:00', end: '17:00', endDayOffset: 0 }); signalDraftChange(list); rerender(); }, 'button button--secondary button--small'));
  return list;
}

function mealSlotsEditor(state, draft, day, rerender) {
  const list = element('div', { className: 'slot-list' });
  day.mealSlots.forEach((slot, index) => {
    const row = element('div', { className: 'slot-card' });
    const first = element('div', { className: 'form-grid form-grid--4' });
    const mealSelect = element('select', { onChange: event => { slot.mealClassId = event.target.value; } });
    for (const meal of draft.mealClasses) mealSelect.append(element('option', { value: meal.id, text: `${meal.abbreviation} — ${meal.name}` })); mealSelect.value = slot.mealClassId;
    first.append(
      field(state, 'day.slot.mealClass', mealSelect),
      field(state, 'day.slot.time', element('input', { type: 'time', value: slot.time, onInput: event => { slot.time = event.target.value; } })),
      field(state, 'day.slot.dayOffset', numberInput(slot.dayOffset, value => { { const parsed = requiredNumber(value); slot.dayOffset = parsed === null ? null : Math.max(0, Math.min(2, Math.round(parsed))); } }, { min: 0, max: 2, step: 1 })),
      field(state, 'day.slot.mode', selectInput(state, ['planned', 'external'], slot.mode, 'day.slot.mode', value => {
        slot.mode = value;
        if (value === 'external') slot.estimatedNutritionPolicy ||= 'budget_only'; else delete slot.estimatedNutritionPolicy;
        signalDraftChange(list); rerender();
      }))
    );
    row.append(first);
    const second = element('div', { className: 'form-grid form-grid--4' });
    second.append(
      field(state, 'day.slot.energyShare', numberInput(slot.energyShare, value => { slot.energyShare = nullableNumber(value); }, { min: 0, max: 1, step: 0.01 })),
      field(state, 'day.slot.energyBudget', numberInput(slot.energyBudgetKcal, value => { slot.energyBudgetKcal = nullableNumber(value); }, { min: 0, step: 10 })),
      field(state, 'day.slot.proteinMin', numberInput(slot.proteinMinG, value => { slot.proteinMinG = nullableNumber(value); }, { min: 0, step: 1 })),
      checkbox(slot.parallel === true, value => { slot.parallel = value; }, state.i18n.t('day.slot.parallel'))
    );
    row.append(second);
    if (slot.mode === 'external') {
      row.append(field(state, 'day.slot.estimatePolicy', selectInput(state, ['unknown', 'budget_only', 'user_estimate'], slot.estimatedNutritionPolicy || 'budget_only', 'day.estimatePolicy', value => { slot.estimatedNutritionPolicy = value; })));
    }
    row.append(element('div', { className: 'entity-actions' }, [
      element('div', { className: 'button-row' }, [
        actionButton(state, 'common.up', () => { if (index > 0) [day.mealSlots[index - 1], day.mealSlots[index]] = [day.mealSlots[index], day.mealSlots[index - 1]]; signalDraftChange(list); rerender(); }, 'button button--secondary button--small'),
        actionButton(state, 'common.down', () => { if (index < day.mealSlots.length - 1) [day.mealSlots[index + 1], day.mealSlots[index]] = [day.mealSlots[index], day.mealSlots[index + 1]]; signalDraftChange(list); rerender(); }, 'button button--secondary button--small')
      ]),
      (() => { const button = actionButton(state, 'common.remove', () => { day.mealSlots.splice(index, 1); signalDraftChange(list); rerender(); }, 'button button--danger button--small'); button.disabled = day.dayArchetype !== 'free' && day.mealSlots.length <= 1; return button; })()
    ]));
    list.append(row);
  });
  if (day.mealSlots.length < 31) list.append(actionButton(state, 'day.slot.add', () => {
    day.mealSlots.push({ id: makeId('slot'), mealClassId: draft.mealClasses[0]?.id || '', time: '12:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }); signalDraftChange(list); rerender();
  }, 'button button--secondary'));
  return list;
}

export function dayClassesPage(state) {
  const draft = clone(state.configuration); const section = page(state, 'DAY CLASS', 'day.page.title', 'day.page.body', { wide: true });
  const status = statusBox(state); const editor = element('div');
  const render = () => {
    editor.replaceChildren();
    for (const day of draft.dayClasses) {
      const cycleRefs = draft.cycles.reduce((count, cycle) => count + cycle.days.filter(entry => entry.dayClassId === day.id).length, 0);
      const details = controlledDetails(state, `day-class:${day.id}`, { className: 'entity-editor', defaultOpen: false });
      details.append(element('summary', {}, [element('span', { className: 'day-swatch', style: `background:${day.color}` }), element('strong', { text: day.name }), element('span', { className: 'entity-badge', text: `${day.abbreviation} · ${optionText(state, 'dayArchetype', day.dayArchetype)}` })]));
      const body = element('div', { className: 'entity-editor__body' });
      const basic = element('div', { className: 'form-grid form-grid--4' });
      basic.append(
        field(state, 'common.name', textInput(day.name, value => { day.name = value; })),
        field(state, 'common.abbreviation', textInput(day.abbreviation, value => { day.abbreviation = value.slice(0, 2); }, { maxlength: 2 })),
        field(state, 'day.archetype', selectInput(state, DAY_ARCHETYPES, day.dayArchetype, 'dayArchetype', value => { day.dayArchetype = value; if (value !== 'free' && day.mealSlots.length === 0) day.mealSlots.push({ id: makeId('slot'), mealClassId: draft.mealClasses[0]?.id || '', time: '12:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }); signalDraftChange(editor); render(); })),
        field(state, 'common.color', element('input', { type: 'color', value: day.color, onInput: event => { day.color = event.target.value; } }))
      );
      body.append(basic, subheading(state, 'day.workWindows'), workWindowsEditor(state, day, render), subheading(state, 'day.capabilities'), capabilitiesEditor(state, day.capabilities), subheading(state, 'day.mealSlots'), mealSlotsEditor(state, draft, day, render));
      const remove = actionButton(state, 'common.delete', () => {
        draft.dayClasses = draft.dayClasses.filter(item => item.id !== day.id); draft.appConfig.dayClassIds = draft.appConfig.dayClassIds.filter(id => id !== day.id); signalDraftChange(editor); render();
      }, 'button button--danger'); remove.disabled = cycleRefs > 0;
      body.append(element('div', { className: 'entity-actions' }, [element('span', { className: 'muted', text: cycleRefs ? `${cycleRefs} ${state.i18n.t('day.cycleReferences')}` : state.i18n.t('common.notReferenced') }), remove]));
      details.append(body); editor.append(details);
    }
    editor.append(actionButton(state, 'day.add', () => {
      const id = makeId('dc');
      draft.dayClasses.push({ schemaVersion: 1, id, name: state.i18n.t('day.newName'), abbreviation: 'NG', color: '#4A8F55', dayArchetype: 'day', workWindows: [], capabilities: { fridge: 'unknown', reheating: 'unknown', cooking: false, complexSnack: false, portabilityRequired: false, maxPrepMinutes: null }, mealSlots: [{ id: makeId('slot'), mealClassId: draft.mealClasses[0]?.id || '', time: '12:00', dayOffset: 0, mode: 'planned', energyBudgetKcal: null, energyShare: null, guidanceKeys: [], parallel: false, proteinMinG: null }] });
      draft.appConfig.dayClassIds.push(id); state.ui.expanded[`day-class:${id}`] = true; signalDraftChange(editor); render();
    }, 'button button--secondary'));
  };
  render(); section.append(editor); mountEditorActions(section, state, draft, status, path => path.startsWith('dayClass') || path.includes('dayClassIds')); return section;
}

function cycleForm(state, draft, cycle) {
  const body = element('div', { className: 'editor-stack' });
  const header = element('div', { className: 'form-grid form-grid--2' });
  const grid = element('div', { className: 'cycle-grid' });
  const renderDays = () => {
    grid.replaceChildren();
    for (const entry of cycle.days) {
      const select = element('select', { onChange: event => { entry.dayClassId = event.target.value; } });
      for (const day of draft.dayClasses) select.append(element('option', { value: day.id, text: `${day.abbreviation} — ${day.name}` }));
      select.value = entry.dayClassId;
      grid.append(element('label', { className: 'cycle-day' }, [element('span', { text: `${state.i18n.t('cycle.day')} ${entry.cycleDay}` }), select]));
    }
  };
  const length = numberInput(cycle.length, value => {
    const parsed = requiredNumber(value);
    if (parsed === null) { cycle.length = null; return; }
    cycle.length = Math.max(1, Math.min(31, Math.round(parsed)));
    const normalized = normalizeCycle(cycle, draft.dayClasses[0]?.id || '');
    cycle.days = normalized.days;
    renderDays();
  }, { min: 1, max: 31, step: 1 });
  header.append(field(state, 'common.name', textInput(cycle.name, value => { cycle.name = value; })), field(state, 'cycle.length', length));
  body.append(header, grid); renderDays(); return body;
}

export function cyclePage(state) {
  const draft = clone(state.configuration); const cycle = activeRecords(draft).cycle;
  const section = page(state, 'CYCLE 1–31', 'cycle.page.title', 'cycle.page.body', { wide: true }); const status = statusBox(state);
  section.append(cycleForm(state, draft, cycle)); mountEditorActions(section, state, draft, status, path => path.startsWith('cycle') || path.includes('cycleId')); return section;
}

function onboardingNav(state, step, total, previous, next, finish = false) {
  const row = element('div', { className: 'wizard-nav' });
  row.append(element('span', { className: 'wizard-progress-text', text: `${state.i18n.t('onboarding.step')} ${step}/${total}` }));
  const buttons = element('div', { className: 'button-row' });
  if (previous) buttons.append(actionButton(state, 'common.back', previous, 'button button--secondary'));
  buttons.append(actionButton(state, finish ? 'onboarding.complete' : 'common.continue', next));
  row.append(buttons); return row;
}

function onboardingQuickMeals(state, draft) {
  const box = element('div', { className: 'quick-list' });
  for (const meal of draft.mealClasses) {
    box.append(element('div', { className: 'quick-row' }, [
      textInput(meal.name, value => { meal.name = value; }),
      textInput(meal.abbreviation, value => { meal.abbreviation = value.slice(0, 2); }, { maxlength: 2 }),
      selectInput(state, MEAL_ARCHETYPES, meal.mealArchetype, 'mealArchetype', value => { meal.mealArchetype = value; })
    ]));
  }
  return box;
}

function onboardingQuickDays(state, draft) {
  const box = element('div', { className: 'quick-list' });
  for (const day of draft.dayClasses) {
    box.append(element('div', { className: 'quick-row quick-row--day' }, [
      element('input', { type: 'color', value: day.color, onInput: event => { day.color = event.target.value; } }),
      textInput(day.name, value => { day.name = value; }),
      textInput(day.abbreviation, value => { day.abbreviation = value.slice(0, 2); }, { maxlength: 2 }),
      selectInput(state, DAY_ARCHETYPES, day.dayArchetype, 'dayArchetype', value => { day.dayArchetype = value; })
    ]));
  }
  return box;
}

export function onboardingPage(state) {
  const existing = state.onboardingDraft;
  const model = existing ? clone(existing) : { version: 1, step: 1, savedAt: null, bundle: clone(state.configuration) };
  state.onboardingDraft = model;
  const total = 8;
  const section = page(state, 'ONBOARDING', 'onboarding.title', 'onboarding.body', { wide: true });
  const host = element('div', { className: 'wizard' }); section.append(host);

  const saveStep = async nextStep => {
    model.step = Math.max(1, Math.min(total, nextStep));
    model.savedAt = new Date().toISOString();
    await saveOnboardingDraft(model.bundle, model.step, { repo: state.repo });
    state.onboardingDraft = clone(model); renderStep();
  };

  const renderStep = () => {
    host.replaceChildren(); const step = model.step; const draft = model.bundle; const active = activeRecords(draft);
    host.append(element('div', { className: 'wizard-track' }, Array.from({ length: total }, (_, index) => element('span', { className: index + 1 <= step ? 'wizard-track__done' : '' }))));
    host.append(element('h2', { text: state.i18n.t(`onboarding.step${step}.title`) }), element('p', { className: 'muted', text: state.i18n.t(`onboarding.step${step}.body`) }));

    if (step === 1) {
      const grid = element('div', { className: 'form-grid form-grid--2' });
      grid.append(
        field(state, 'nav.language', selectInput(state, ['it', 'en'], draft.appConfig.locale, 'language', value => { draft.appConfig.locale = value; })),
        field(state, 'config.measurementSystem', selectInput(state, ['metric', 'imperial', 'mixed'], draft.appConfig.measurementSystem, 'measurement', value => { draft.appConfig.measurementSystem = value; })),
        field(state, 'config.weekStart', selectInput(state, ['monday', 'sunday', 'saturday'], draft.appConfig.weekStart, 'weekStart', value => { draft.appConfig.weekStart = value; })),
        field(state, 'config.timeZone', textInput(draft.appConfig.timeZone, value => { draft.appConfig.timeZone = value.trim(); }))
      );
      grid.append(field(state, 'theme.mode.label', selectInput(state, ['system', 'light', 'dark'], active.themeProfile.mode, 'theme.mode', value => { active.themeProfile.mode = value; })), field(state, 'theme.density.label', selectInput(state, ['compact', 'comfortable'], active.themeProfile.density, 'theme.density', value => { active.themeProfile.density = value; })));
      host.append(grid);
    }
    if (step === 2) host.append(nutritionForm(state, active.nutritionProfile, { compact: true }), element('p', { className: 'muted', text: state.i18n.t('onboarding.nutritionAdvanced') }));
    if (step === 3) { const box = element('div'); const rerender = () => { box.replaceChildren(allergyRulesEditor(state, active.allergyProfile, rerender, { compact: true })); }; rerender(); host.append(box); }
    if (step === 4) { const box = element('div'); const rerender = () => { box.replaceChildren(preferenceRulesEditor(state, active.foodPreferences, rerender, { compact: true })); }; rerender(); host.append(box); }
    if (step === 5) host.append(onboardingQuickMeals(state, draft), element('p', { className: 'muted', text: state.i18n.t('onboarding.mealAdvanced') }));
    if (step === 6) host.append(onboardingQuickDays(state, draft), element('p', { className: 'muted', text: state.i18n.t('onboarding.dayAdvanced') }));
    if (step === 7) host.append(cycleForm(state, draft, active.cycle));
    if (step === 8) {
      const summary = summarizeConfiguration(draft, state.registry);
      host.append(element('div', { className: 'summary-grid' }, [
        element('div', { className: 'metric' }, [element('span', { text: state.i18n.t('config.summary.energy') }), element('strong', { text: `${summary.dailyEnergyKcal || '—'} kcal` })]),
        element('div', { className: 'metric' }, [element('span', { text: state.i18n.t('config.summary.hardRules') }), element('strong', { text: summary.hardRuleCount })]),
        element('div', { className: 'metric' }, [element('span', { text: state.i18n.t('config.summary.cycle') }), element('strong', { text: summary.cycleLength })])
      ]), diagnosticList(state, draft));
      const catalogReady = Boolean(state.catalogVersion);
      host.append(element('div', { className: `validation-box${catalogReady ? '' : ' validation-box--warning'}`, text: state.i18n.t(catalogReady ? 'onboarding.catalogReady' : 'onboarding.catalogPending') }));
    }

    const finish = step === total;
    host.append(onboardingNav(state, step, total, step > 1 ? () => saveStep(step - 1) : null, async () => {
      if (!finish) { await saveStep(step + 1); return; }
      try {
        const saved = await completeOnboarding(draft, { repo: state.repo, registry: state.registry });
        state.configuration = saved; state.config = saved.appConfig; state.onboardingComplete = true; state.onboardingDraft = null;
        const latest = activeRecords(saved); state.theme = latest.themeProfile; applyTheme(state.theme); state.i18n.setLocale(saved.appConfig.locale); document.documentElement.lang = state.i18n.locale;
        state.markSaved?.(); state.navigate('/configure', { force: true });
      } catch (error) { host.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })); }
    }, finish));
  };
  renderStep(); return section;
}

export async function refreshOnboardingState(state) {
  state.onboardingComplete = await onboardingIsComplete({ repo: state.repo });
  state.onboardingDraft = await getOnboardingDraft({ repo: state.repo });
}
