import { setMealLocked } from '../services/productExtensionService.js';
import { profileStatus } from './profileStatus.js';
import { createProductFoodPicker } from './guidedControls.js';
import { frequencySummary, currentFrequencySummary } from './frequencySummary.js';
import { element } from './dom.js';
import { addCivilDays, energyConstraintStatus } from '../planner/planMath.js';
import { calculateMealEnergyKcal } from '../domain/nutritionCore.js';
import { listPlanIngredientUsage, createPlanIngredientSubstitutionPreview, applyPlanIngredientSubstitutionPreview } from '../services/planIngredientSubstitutionService.js';
import { createGenerationTuningPreview, listGenerationTuningTargets, generationTuningOverlayFromPreview } from '../services/generationTuningService.js';
import { createCalendarStructurePreview, commitCalendarStructurePreview, loadCivilMealsForDate } from '../services/calendarPlanEditorService.js';
import {
  civilDateInTimeZone, loadEffectivePlanState, loadCalendarRange, createInitialPreview, createExtensionPreview, commitGeneratedPreview,
  createReplacementPreview, commitReplacement, createGenerationReplacementPreview, applyGenerationReplacementPreview, updateAdherence, createRebalancePreview, commitRebalancePreview,
  recentPlanOperations, undoPlanOperation, redoPlanOperation, planHistoryState
} from '../services/effectivePlanService.js';

function t(state, key, vars = {}) { let value = state.i18n.t(key); for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, String(replacement)); return value; }
function page(state, titleKey, leadKey, eyebrow = 'PLAN') { return element('section', { className: 'page-card page-card--wide plan-page' }, [element('p', { className: 'eyebrow', text: eyebrow }), element('h1', { text: t(state, titleKey) }), element('p', { className: 'lead', text: t(state, leadKey) })]); }
function nav(state, url) { return state.navigate(url); }
function localeTitle(state, recipe) { return recipe?.i18n?.[state.i18n.locale]?.title || recipe?.i18n?.en?.title || recipe?.i18n?.it?.title || recipe?.recipeId || 'Recipe'; }
function dayClass(state, id) { return state.configuration?.dayClasses?.find(item => item.id === id) || null; }
function mealClass(state, id) { return state.configuration?.mealClasses?.find(item => item.id === id) || null; }
function localDateLabel(state, date) { try { return new Intl.DateTimeFormat(state.i18n.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); } catch { return date; } }
function localTime(state) { const parts = new Intl.DateTimeFormat('en', { timeZone: state.config.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])); return `${map.hour}:${map.minute}`; }
function statusBox() { const node = element('div', { 'aria-live': 'polite' }); return { node, ok(message) { node.className = 'validation-box'; node.textContent = message; }, error(error) { node.className = 'validation-box validation-box--error'; node.textContent = error?.message || String(error); } }; }
function seedValue(prefix, date) { return `${prefix}-${date}-${Math.random().toString(36).slice(2, 8)}`; }

function planFailure(state, failure) {
  const code = failure?.code || 'unknown'; const key = `plan.failure.${code}`; const translated = state.i18n.t(key);
  const base = translated === key ? `${t(state, 'plan.failure.generic')} (${code})` : translated;
  if (code !== 'no_feasible_plan' || !failure?.energy) return base;
  const nearest = failure.nearestPlannedEnergyKcal == null ? '—' : Math.round(failure.nearestPlannedEnergyKcal);
  const distance = failure.nearestDistanceKcal == null ? '—' : Math.round(failure.nearestDistanceKcal);
  const details = t(state, 'plan.failure.energyDetails', {
    target: Math.round(failure.energy.targetKcal), min: Math.round(failure.energy.dailyMinKcal), max: Math.round(failure.energy.dailyMaxKcal),
    nearest, distance, reason: failure.reason || 'bounded_search'
  });
  return `${base} ${details}`;
}

function progressPercent(progress = {}) {
  if (Number.isFinite(Number(progress.percent))) return Math.max(0, Math.min(100, Math.round(Number(progress.percent))));
  const completed = Number(progress.completed ?? progress.completedDays ?? progress.generatedDayCount);
  const total = Number(progress.total);
  return Number.isFinite(completed) && Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;
}

function progressLabel(state, progress = {}) {
  const percent = progressPercent(progress);
  const completed = Number(progress.completed ?? progress.completedDays ?? progress.generatedDayCount);
  const total = Number(progress.total);
  const count = Number.isFinite(completed) && Number.isFinite(total) && total > 0 ? ` · ${completed}/${total}` : '';
  return `${t(state, 'plan.generation.searching')} ${percent}%${count}`;
}

function generationOptions(state, host) {
  state.planUi.generationController?.abort();
  const controller = new AbortController(); state.planUi.generationController = controller;
  const label = element('span', { text: progressLabel(state, { percent: 0 }) });
  const meter = element('progress', { max: 100, value: 0, 'aria-label': t(state, 'plan.generation.progress') });
  const abort = element('button', { type: 'button', className: 'button button--secondary button--small', 'data-testid': 'plan-generation-abort', text: t(state, 'common.abort'), onClick: () => { abort.disabled = true; controller.abort(); } });
  const message = element('div', { className: 'validation-box', role: 'status', 'data-testid': 'plan-generation-progress' }, [label, meter, abort]);
  host?.append(message);
  return { signal: controller.signal, onProgress: progress => { const percent = progressPercent(progress); label.textContent = progressLabel(state, progress); meter.value = percent; meter.setAttribute('aria-valuenow', String(percent)); } };
}

function recipePills(state, recipe) {
  const n = recipe.calculatedNutrition || {};
  return element('div', { className: 'recipe-metrics' }, [element('span', { text: `${Math.round(n.energyKcal || 0)} kcal` }), element('span', { text: `${Math.round((n.proteinG || 0) * 10) / 10} g ${t(state, 'nutrient.protein')}` }), element('span', { text: recipe.practicalEvidence?.status === 'unverified' ? t(state, 'r2.practical.unverified') : `${recipe.practical?.prepMinutes || 0} min` })]);
}

function previewDays(state, preview, { selectable = false, replaceable = false } = {}) {
  const list = element('div', { className: 'plan-preview-list' });
  for (const day of preview.calendarDays || []) {
    const dc = dayClass(state, day.dayClassId); const check = selectable ? element('input', { type: 'checkbox', checked: true, 'data-preview-date': day.date }) : null;
    const meals = element('div', { className: 'preview-meals' });
    for (const slot of day.mealSlots || []) {
      const mc = mealClass(state, slot.mealClassId); const names = slot.mode === 'external' ? t(state, 'plan.external') : slot.recipeComponents.map(component => preview.recipeLabels?.[component.recipeVersionId] || component.recipeVersionId).join(' + ');
      const energyKcal = slot.mode === 'planned' ? calculateMealEnergyKcal(slot.recipeComponents, preview.recipeNutrition || {}) : null;
      meals.append(element('div', { className: `preview-meal${replaceable && slot.mode === 'planned' ? ' preview-meal--replaceable' : ''}`, 'data-meal-occurrence-id': slot.mealOccurrenceId }, [
        element('span', { className: 'muted', text: `${slot.time} · ${mc?.name || slot.mealClassId}` }),
        element('strong', { text: names }),
        energyKcal == null ? null : element('span', { className: 'preview-meal__energy', 'data-testid': 'preview-meal-energy', text: `${Math.round(energyKcal)} kcal` }),
        replaceable && slot.mode === 'planned' ? element('button', { type: 'button', className: 'button button--secondary button--small preview-meal__replace', 'data-testid': 'preview-meal-replace', text: t(state, 'plan.replace'), onClick: event => openGenerationReplacementDialog(state, preview, slot, event.currentTarget) }) : null
      ]));
    }
    list.append(element('article', { className: 'plan-preview-day' }, [element('div', { className: 'plan-preview-day__head' }, [check, element('span', { className: 'day-swatch', style: `background:${dc?.color || '#888'}` }), element('strong', { text: `${localDateLabel(state, day.date)} · ${dc?.name || dc?.abbreviation || day.dayClassId}` }), element('span', { className: 'muted', text: `${Math.round(day.nutritionSummary?.knownPlanned?.energyKcal || 0)} kcal` })]), meals]));
  }
  return list;
}

async function addRecipeLabels(state, preview) {
  if (preview?.status !== 'success') return preview;
  const ids = [...new Set(preview.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => slot.recipeComponents.map(component => component.recipeVersionId))))];
  const derived = preview.derivedRecipeVersions || []; const derivedById = new Map(derived.map(recipe => [recipe.recipeVersionId, recipe]));
  const rows = [...await state.repo.getMany('recipeVersions', ids.filter(id => !derivedById.has(id))), ...derived];
  preview.recipeLabels = Object.fromEntries(rows.map(recipe => [recipe.recipeVersionId, localeTitle(state, recipe)]));
  preview.recipeNutrition = Object.fromEntries(rows.map(recipe => [recipe.recipeVersionId, recipe.calculatedNutrition]));
  return preview;
}

function nutritionDeltaSummary(state, delta = {}) {
  const value = (number, unit) => `${Number(number || 0) > 0 ? '+' : ''}${Math.round(Number(number || 0) * 10) / 10}${unit}`;
  return `${value(delta.energyKcal, ' kcal')} · P ${value(delta.proteinG, ' g')} · C ${value(delta.carbsG, ' g')} · F ${value(delta.fatG, ' g')} · ${t(state, 'nutrient.fiber')} ${value(delta.fiberG, ' g')}`;
}


function hardViolationDetail(state, violation) {
  const it = state.i18n.locale === 'it';
  const code = String(violation?.code || 'hard_constraint');
  if (code === 'daily_energy_tolerance' && violation.energy) {
    const e = violation.energy;
    const over = e.budgetedTotalKcal < e.dailyMinKcal ? e.budgetedTotalKcal - e.dailyMinKcal : e.budgetedTotalKcal > e.dailyMaxKcal ? e.budgetedTotalKcal - e.dailyMaxKcal : 0;
    return `${it ? 'Energia giornaliera' : 'Daily energy'}: ${Math.round(e.budgetedTotalKcal)} kcal (${it ? 'ammesso' : 'allowed'} ${Math.round(e.dailyMinKcal)}–${Math.round(e.dailyMaxKcal)}; ${over > 0 ? '+' : ''}${Math.round(over)} kcal)`;
  }
  if (code === 'frequency_window' && violation.window) {
    const w = violation.window;
    const bounds = [w.min != null ? `min ${w.min}` : null, w.max != null ? `max ${w.max}` : null].filter(Boolean).join(', ');
    return `${it ? 'Frequenza' : 'Frequency'} ${violation.ruleId || w.ruleId || ''}: ${w.count} (${bounds || '—'})`;
  }
  if (code.startsWith('meal_rule:require:')) return `${it ? 'Requisito MealClass non soddisfatto' : 'MealClass requirement not met'}: ${code.slice('meal_rule:require:'.length)}`;
  if (code.startsWith('meal_rule:')) return `${it ? 'Regola MealClass violata' : 'MealClass rule violated'}: ${code.slice('meal_rule:'.length)}`;
  if (code.startsWith('capability:')) return `${it ? 'Capacità della giornata' : 'Day capability'}: ${code.slice('capability:'.length)}`;
  if (code.startsWith('never:')) return `${it ? 'Frequenza vietata' : 'Forbidden frequency'}: ${code.slice('never:'.length)}`;
  if (code.startsWith('auto_exclude:')) return `${it ? 'Esclusione automatica' : 'Automatic exclusion'}: ${code.slice('auto_exclude:'.length)}`;
  if (code.startsWith('safety:') || code.startsWith('safety_unverified:')) return `${it ? 'Sicurezza/allergeni' : 'Safety/allergens'}: ${code}`;
  if (code.startsWith('tuning:')) return `${it ? 'Vincolo temporaneo' : 'Temporary constraint'}: ${code}`;
  return code.replaceAll('_', ' ');
}

function generationReplacementCard(state, generationPreview, preview, dialog) {
  const it = state.i18n.locale === 'it'; const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'generation-replacement-preview' });
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); };
  const query = element('input', { type: 'search', value: preview.query || '', placeholder: it ? 'Titolo o ingrediente' : 'Title or ingredient' });
  const showIncompatible = check(it ? 'Mostra anche ricette che violano vincoli hard' : 'Also show recipes that violate hard constraints', Boolean(preview.includeIncompatible));
  const reload = async offset => {
    const next = await createGenerationReplacementPreview({ generationPreview, mealOccurrenceId: preview.mealOccurrenceId, query: query.value.trim(), includeIncompatible: showIncompatible.querySelector('input').checked, offset, limit: preview.limit, seed: `preview-replace-${generationPreview.generationRun?.seed || 'seed'}` }, { repo: state.repo, registry: state.registry });
    card.replaceWith(generationReplacementCard(state, generationPreview, next, dialog));
  };
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: `${t(state, 'plan.replace.previewTitle')} · ${preview.mealLabel}` }), element('p', { className: 'muted', text: t(state, 'plan.replace.nutritionBody') })]), element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: close })]));
  card.append(element('div', { className: 'form-grid form-grid--2' }, [field(it ? 'Cerca' : 'Search', query), showIncompatible]), element('button', { type: 'button', className: 'button button--secondary', text: it ? 'Cerca alternative' : 'Search alternatives', onClick: () => void reload(0) }));
  const list = element('div', { className: 'replacement-list' });
  for (const item of preview.candidates) {
    const article = element('article', { className: `replacement-card${item.hardCompatible === false ? ' replacement-card--incompatible' : ''}` });
    const violations = item.hardViolations || [];
    article.append(element('div', {}, [
      element('strong', { text: localeTitle(state, item.recipe) }), recipePills(state, item.recipe),
      element('p', { className: 'muted', text: `${t(state, 'plan.replace.affinity')}: ${item.affinityScore}%` }),
      element('p', { text: nutritionDeltaSummary(state, item.nutritionDelta) }),
      item.hardCompatible === false ? element('div', { className: item.safetyBlocked ? 'validation-box validation-box--error' : 'validation-box validation-box--warning', 'data-testid': 'generation-replacement-hard-warning' }, [
        element('strong', { text: item.safetyBlocked ? (it ? 'Non compatibile per sicurezza' : 'Safety incompatible') : (it ? 'Viola vincoli hard' : 'Violates hard constraints') }),
        ...violations.map(violation => element('span', { text: hardViolationDetail(state, violation) }))
      ]) : element('p', { className: 'validation-box', text: it ? 'Compatibile con i vincoli hard.' : 'Hard-constraint compatible.' }),
      frequencySummary(state, item.score.frequencies)
    ]));
    article.append(element('button', { type: 'button', className: 'button button--small', disabled: item.hardCompatible === false, 'data-testid': 'generation-replacement-apply', text: item.hardCompatible === false ? (it ? 'Solo confronto' : 'Comparison only') : t(state, 'plan.replace.useAlternative'), onClick: async event => {
      const button = event.currentTarget; button.disabled = true; card.setAttribute('aria-busy', 'true');
      try {
        const next = await applyGenerationReplacementPreview({ generationPreview, replacementPreview: preview, choiceId: item.choiceId }, { repo: state.repo, registry: state.registry });
        state.planUi.planPreview = await addRecipeLabels(state, next); close(); state.render();
      } catch (error) { state.notify?.('error', error.message || String(error)); button.disabled = false; card.setAttribute('aria-busy', 'false'); }
    } })); list.append(article);
  }
  if (!preview.candidates.length) list.append(element('div', { className: 'empty-state', text: t(state, 'plan.replace.empty') }));
  card.append(list); const pages = element('div', { className: 'button-row' });
  if (preview.offset > 0) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.previous'), onClick: () => void reload(Math.max(0, preview.offset - preview.limit)) }));
  if (preview.hasMore) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.next'), onClick: () => void reload(preview.offset + preview.limit) }));
  card.append(pages); return card;
}

function openGenerationReplacementDialog(state, generationPreview, slot, button) {
  button.disabled = true; const dialog = element('dialog', { className: 'replacement-dialog', 'aria-label': t(state, 'plan.replace.previewTitle') });
  const loading = element('section', { className: 'plan-action-card plan-action-card--accent', 'aria-busy': 'true' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); dialog.append(loading); document.body.append(dialog); dialog.showModal();
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); if (button.isConnected) button.disabled = false; };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  void createGenerationReplacementPreview({ generationPreview, mealOccurrenceId: slot.mealOccurrenceId, seed: `preview-replace-${generationPreview.generationRun?.seed || 'seed'}` }, { repo: state.repo, registry: state.registry }).then(preview => loading.replaceWith(generationReplacementCard(state, generationPreview, preview, dialog))).catch(error => { loading.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }), element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.cancel'), onClick: close })); loading.setAttribute('aria-busy', 'false'); });
}


function localeIngredientName(state, revision) {
  return revision?.i18n?.[state.i18n.locale]?.name || revision?.i18n?.it?.name || revision?.i18n?.en?.name || revision?.ingredientId || '';
}

function planIngredientSubstitutionCard(state, generationPreview, usage, preview, dialog) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'plan-ingredient-substitution-preview' });
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); };
  const source = element('select', { 'data-testid': 'plan-ingredient-source' });
  for (const row of usage) source.append(element('option', { value: row.ingredientId, text: `${localeIngredientName(state, row.ingredient)} · ${row.affectedOccurrences} ${t(state, 'plan.ingredientSubstitution.occurrences')}` }));
  if (preview?.sourceIngredientId) source.value = preview.sourceIngredientId;
  const query = element('input', { type: 'search', value: preview?.query || '', placeholder: t(state, 'plan.ingredientSubstitution.search') });
  const reload = async offset => {
    card.setAttribute('aria-busy', 'true');
    try {
      const next = await createPlanIngredientSubstitutionPreview({ generationPreview, sourceIngredientId: source.value, query: query.value.trim(), offset, limit: preview?.limit || 8 }, { repo: state.repo, registry: state.registry });
      card.replaceWith(planIngredientSubstitutionCard(state, generationPreview, usage, next, dialog));
    } catch (error) { state.notify?.('error', error.message || String(error)); card.setAttribute('aria-busy', 'false'); }
  };
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'plan.ingredientSubstitution.title') }), element('p', { className: 'muted', text: t(state, 'plan.ingredientSubstitution.body') })]), element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: close })]));
  card.append(element('div', { className: 'form-grid form-grid--2' }, [field(t(state, 'plan.ingredientSubstitution.source'), source), field(t(state, 'plan.ingredientSubstitution.searchLabel'), query)]));
  card.append(element('div', { className: 'button-row' }, [element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'plan.ingredientSubstitution.searchAction'), onClick: () => void reload(0) })]));
  if (!preview) return card;
  card.append(element('p', { className: 'muted', text: t(state, 'plan.ingredientSubstitution.impact', { recipes: preview.affectedRecipeCount, occurrences: preview.affectedOccurrences }) }));
  const list = element('div', { className: 'replacement-list' });
  for (const item of preview.candidates) {
    const article = element('article', { className: 'replacement-card' });
    article.append(element('div', {}, [
      element('strong', { text: localeIngredientName(state, item.ingredient) }),
      element('p', { className: 'muted', text: `${t(state, 'plan.replace.affinity')}: ${item.score}%` }),
      element('p', { text: t(state, 'plan.ingredientSubstitution.amount', { amount: item.replacementAmountTotal, unit: item.replacementUnit || '' }) }),
      element('p', { text: nutritionDeltaSummary(state, item.planDelta) }),
      item.stateMismatchOccurrences ? element('p', { className: 'validation-box validation-box--warning', text: t(state, 'plan.ingredientSubstitution.stateWarning', { count: item.stateMismatchOccurrences }) }) : null,
      item.newAllergenIds?.length ? element('p', { className: 'validation-box validation-box--warning', text: `${t(state, 'catalog.substitution.newAllergens')}: ${item.newAllergenIds.map(id => t(state, `allergen.${id}`)).join(', ')}` }) : null
    ]));
    article.append(element('button', { type: 'button', className: 'button button--small', 'data-testid': 'plan-ingredient-substitution-apply', text: t(state, 'plan.ingredientSubstitution.apply'), onClick: async event => {
      const button = event.currentTarget; button.disabled = true; article.setAttribute('aria-busy', 'true');
      try {
        const next = await applyPlanIngredientSubstitutionPreview({ generationPreview, substitutionPreview: preview, candidateIngredientRevisionId: item.candidateIngredientRevisionId }, { repo: state.repo, registry: state.registry });
        state.planUi.planPreview = await addRecipeLabels(state, next); close(); state.render();
      } catch (error) { state.notify?.('error', error.message || String(error)); button.disabled = false; article.setAttribute('aria-busy', 'false'); }
    } }));
    list.append(article);
  }
  if (!preview.candidates.length) list.append(element('div', { className: 'empty-state', text: t(state, 'plan.ingredientSubstitution.empty') }));
  card.append(list);
  const pages = element('div', { className: 'button-row' });
  if (preview.offset > 0) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.previous'), onClick: () => void reload(Math.max(0, preview.offset - preview.limit)) }));
  if (preview.hasMore) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.next'), onClick: () => void reload(preview.offset + preview.limit) }));
  card.append(pages); return card;
}

function openPlanIngredientSubstitutionDialog(state, generationPreview, button) {
  button.disabled = true; const dialog = element('dialog', { className: 'replacement-dialog', 'aria-label': t(state, 'plan.ingredientSubstitution.title') });
  const loading = element('section', { className: 'plan-action-card plan-action-card--accent', 'aria-busy': 'true' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); dialog.append(loading); document.body.append(dialog); dialog.showModal();
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); if (button.isConnected) button.disabled = false; };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  void listPlanIngredientUsage(generationPreview, { repo: state.repo }).then(usage => {
    if (!usage.length) throw new Error(t(state, 'plan.ingredientSubstitution.noSources'));
    return createPlanIngredientSubstitutionPreview({ generationPreview, sourceIngredientId: usage[0].ingredientId }, { repo: state.repo, registry: state.registry }).then(preview => loading.replaceWith(planIngredientSubstitutionCard(state, generationPreview, usage, preview, dialog)));
  }).catch(error => { loading.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }), element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.cancel'), onClick: close })); loading.setAttribute('aria-busy', 'false'); });
}

function generationTuningHasPostEdits(preview) {
  return Boolean((preview?.diagnostics?.postGenerationEdits || []).length || (preview?.planIngredientSubstitutions || []).length || (preview?.derivedRecipeVersions || []).length);
}

function tuningMealScopeLabel(state, rule) {
  const ids = rule?.scope?.mealClassIds || [];
  if (!ids.length) return t(state, 'plan.tuning.allMeals');
  return ids.map(id => mealClass(state, id)?.name || id).join(', ');
}

function tuningRuleLabel(state, rule) {
  const label = rule.label || rule.target;
  const intentKey = rule.intent ? `plan.tuning.intent.${rule.intent}` : '';
  const intentLabel = intentKey && state.i18n.t(intentKey) !== intentKey ? state.i18n.t(intentKey) : label;
  const hardness = rule.mode === 'exclude' ? t(state, 'plan.tuning.hard') : t(state, 'plan.tuning.soft');
  const scope = `${rule.scope?.startDate || '—'} → ${rule.scope?.endDate || '—'} · ${tuningMealScopeLabel(state, rule)}`;
  return `${hardness} · ${intentLabel}${label && label !== intentLabel ? ` · ${label}` : ''} · ${scope}`;
}

function generationTuningSummary(state, preview) {
  const overlay = generationTuningOverlayFromPreview(preview);
  if (!overlay?.rules?.length) return null;
  return element('div', { className: 'validation-box', 'data-testid': 'generation-tuning-summary' }, [
    element('strong', { text: t(state, 'plan.tuning.appliedTitle') }),
    ...overlay.rules.map(rule => element('span', { text: tuningRuleLabel(state, rule) }))
  ]);
}

function generationTuningIntentDefinitions(state) {
  return [
    ['ingredient_prefer', t(state, 'plan.tuning.intent.ingredient_prefer')],
    ['ingredient_avoid', t(state, 'plan.tuning.intent.ingredient_avoid')],
    ['ingredient_unavailable', t(state, 'plan.tuning.intent.ingredient_unavailable')],
    ['recipe_prefer', t(state, 'plan.tuning.intent.recipe_prefer')],
    ['recipe_avoid', t(state, 'plan.tuning.intent.recipe_avoid')],
    ['sweet', t(state, 'plan.tuning.intent.sweet')],
    ['savory', t(state, 'plan.tuning.intent.savory')],
    ['lower_fiber', t(state, 'plan.tuning.intent.lower_fiber')],
    ['lower_fat', t(state, 'plan.tuning.intent.lower_fat')],
    ['more_protein', t(state, 'plan.tuning.intent.more_protein')],
    ['simpler', t(state, 'plan.tuning.intent.simpler')],
    ['quick_to_eat', t(state, 'plan.tuning.intent.quick_to_eat')],
    ['simpler_lower_fat', t(state, 'plan.tuning.intent.simpler_lower_fat')]
  ];
}

function tuningRulesForIntent(state, intent, target, label, weight, scope) {
  const base = { weight, scope, intent, label: label || t(state, `plan.tuning.intent.${intent}`) };
  if (intent === 'ingredient_prefer') return [{ ...base, targetType: 'ingredient', target, mode: 'prefer' }];
  if (intent === 'ingredient_avoid') return [{ ...base, targetType: 'ingredient', target, mode: 'avoid' }];
  if (intent === 'ingredient_unavailable') return [{ ...base, targetType: 'ingredient', target, mode: 'exclude', weight: 5 }];
  if (intent === 'recipe_prefer') return [{ ...base, targetType: 'recipe', target, mode: 'prefer' }];
  if (intent === 'recipe_avoid') return [{ ...base, targetType: 'recipe', target, mode: 'avoid' }];
  if (intent === 'sweet') return [{ ...base, targetType: 'flavor', target: 'flavor_sweet', mode: 'prefer' }];
  if (intent === 'savory') return [{ ...base, targetType: 'flavor', target: 'flavor_savory', mode: 'prefer' }];
  if (intent === 'lower_fiber') return [{ ...base, targetType: 'nutrient', target: 'fiberG', mode: 'decrease' }];
  if (intent === 'lower_fat') return [{ ...base, targetType: 'nutrient', target: 'fatG', mode: 'decrease' }];
  if (intent === 'more_protein') return [{ ...base, targetType: 'nutrient', target: 'proteinG', mode: 'increase' }];
  if (intent === 'quick_to_eat') return [{ ...base, targetType: 'practical', target: 'eatingMinutes', mode: 'decrease' }];
  if (intent === 'simpler') return [
    { ...base, targetType: 'practical', target: 'prepMinutes', mode: 'decrease' },
    { ...base, targetType: 'practical', target: 'cookMinutes', mode: 'decrease' }
  ];
  if (intent === 'simpler_lower_fat') return [
    { ...base, targetType: 'practical', target: 'prepMinutes', mode: 'decrease' },
    { ...base, targetType: 'practical', target: 'cookMinutes', mode: 'decrease' },
    { ...base, targetType: 'nutrient', target: 'fatG', mode: 'decrease' }
  ];
  throw new Error(t(state, 'plan.tuning.invalidIntent'));
}

function generationTuningCard(state, generationPreview, targets, draftRules, dialog, opener) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'generation-tuning-dialog' });
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); if (opener?.isConnected) opener.disabled = false; };
  const horizon = generationPreview.generationRun?.horizon || { startDate: '', endDate: '' };
  const intent = element('select', { 'data-testid': 'generation-tuning-intent' });
  for (const [value, text] of generationTuningIntentDefinitions(state)) intent.append(element('option', { value, text }));
  const targetInput = element('input', { type: 'search', list: 'generation-tuning-target-list', autocomplete: 'off', placeholder: t(state, 'plan.tuning.targetPlaceholder'), 'data-testid': 'generation-tuning-target' });
  const targetList = element('datalist', { id: 'generation-tuning-target-list' });
  const targetField = field(t(state, 'plan.tuning.target'), targetInput);
  const startDate = element('input', { type: 'date', value: horizon.startDate, min: horizon.startDate, max: horizon.endDate });
  const endDate = element('input', { type: 'date', value: horizon.endDate, min: horizon.startDate, max: horizon.endDate });
  const mealScope = element('select', { multiple: true, size: Math.min(5, Math.max(2, state.configuration?.mealClasses?.length || 2)), 'aria-label': t(state, 'plan.tuning.mealClasses') });
  for (const mc of state.configuration?.mealClasses || []) mealScope.append(element('option', { value: mc.id, text: mc.name || mc.id }));
  const strength = element('select');
  for (const value of [1, 2, 3, 4, 5]) strength.append(element('option', { value, text: t(state, `plan.tuning.strength.${value}`) }));
  strength.value = '3';

  const targetValueMap = new Map();
  const intentNeedsTarget = () => ['ingredient_prefer', 'ingredient_avoid', 'ingredient_unavailable', 'recipe_prefer', 'recipe_avoid'].includes(intent.value);
  const refreshTargets = () => {
    targetList.replaceChildren(); targetValueMap.clear(); targetInput.value = '';
    const rows = intent.value.startsWith('recipe_') ? targets.recipes : targets.ingredients;
    for (const row of rows) {
      const id = row.recipeId || row.ingredientId; const value = `${row.label} · ${id}`;
      targetValueMap.set(value, { id, label: row.label }); targetValueMap.set(id, { id, label: row.label });
      targetList.append(element('option', { value }));
    }
    targetField.hidden = !intentNeedsTarget(); targetInput.disabled = !intentNeedsTarget();
  };
  intent.addEventListener('change', refreshTargets); refreshTargets();

  const rulesList = element('div', { className: 'replacement-list', 'data-testid': 'generation-tuning-rules' });
  const renderRules = () => {
    rulesList.replaceChildren();
    if (!draftRules.length) { rulesList.append(element('div', { className: 'empty-state', text: t(state, 'plan.tuning.empty') })); return; }
    draftRules.forEach((rule, index) => rulesList.append(element('article', { className: 'replacement-card' }, [
      element('div', {}, [element('strong', { text: rule.label || rule.target }), element('p', { className: 'muted', text: tuningRuleLabel(state, rule) })]),
      element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'plan.tuning.remove'), onClick: () => { draftRules.splice(index, 1); renderRules(); } })
    ])));
  };
  renderRules();

  const add = element('button', { type: 'button', className: 'button button--secondary', 'data-testid': 'generation-tuning-add', text: t(state, 'plan.tuning.add'), onClick: () => {
    try {
      if (!startDate.value || !endDate.value || startDate.value > endDate.value) throw new Error(t(state, 'plan.tuning.invalidDates'));
      let target = ''; let label = t(state, `plan.tuning.intent.${intent.value}`);
      if (intentNeedsTarget()) {
        const match = targetValueMap.get(targetInput.value.trim());
        if (!match) throw new Error(t(state, 'plan.tuning.chooseTarget'));
        target = match.id; label = match.label;
      }
      const scope = { startDate: startDate.value, endDate: endDate.value, mealClassIds: Array.from(mealScope.selectedOptions).map(option => option.value) };
      draftRules.push(...tuningRulesForIntent(state, intent.value, target, label, Number(strength.value), scope));
      renderRules(); targetInput.value = '';
    } catch (error) { state.notify?.('error', error.message || String(error)); }
  } });

  const apply = element('button', { type: 'button', className: 'button', 'data-testid': 'generation-tuning-apply', text: t(state, 'plan.tuning.apply'), onClick: async () => {
    apply.disabled = true; card.setAttribute('aria-busy', 'true');
    try {
      const progress = generationOptions(state, card);
      const next = await createGenerationTuningPreview({ generationPreview, rules: draftRules, signal: progress.signal, onProgress: progress.onProgress }, { repo: state.repo, registry: state.registry });
      if (next.status !== 'success') throw new Error(planFailure(state, next.failure));
      state.planUi.planPreview = await addRecipeLabels(state, next); close(); state.render();
    } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); apply.disabled = false; card.setAttribute('aria-busy', 'false'); }
  } });

  card.append(element('div', { className: 'section-heading' }, [
    element('div', {}, [element('h2', { text: t(state, 'plan.tuning.title') }), element('p', { className: 'muted', text: t(state, 'plan.tuning.body') })]),
    element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: close })
  ]));
  if (generationTuningHasPostEdits(generationPreview)) card.append(element('div', { className: 'validation-box validation-box--warning', text: t(state, 'plan.tuning.resetWarning') }));
  card.append(element('div', { className: 'form-grid form-grid--2' }, [field(t(state, 'plan.tuning.intent'), intent), targetField, field(t(state, 'plan.tuning.scopeStart'), startDate), field(t(state, 'plan.tuning.scopeEnd'), endDate), field(t(state, 'plan.tuning.mealClasses'), mealScope), field(t(state, 'plan.tuning.strength'), strength)]));
  card.append(targetList, element('p', { className: 'muted', text: t(state, 'plan.tuning.scopeHelp') }), element('div', { className: 'button-row' }, [add]));
  card.append(element('h3', { text: t(state, 'plan.tuning.rulesTitle') }), rulesList, element('div', { className: 'button-row' }, [apply]));
  return card;
}

function openGenerationTuningDialog(state, generationPreview, button) {
  button.disabled = true;
  const dialog = element('dialog', { className: 'replacement-dialog', 'aria-label': t(state, 'plan.tuning.title') });
  const loading = element('section', { className: 'plan-action-card plan-action-card--accent', 'aria-busy': 'true' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]);
  dialog.append(loading); document.body.append(dialog); dialog.showModal();
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); if (button.isConnected) button.disabled = false; };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  void listGenerationTuningTargets({ repo: state.repo, locale: state.i18n.locale }).then(targets => {
    const current = generationTuningOverlayFromPreview(generationPreview);
    const draftRules = (current.rules || []).map(rule => structuredClone(rule));
    loading.replaceWith(generationTuningCard(state, generationPreview, targets, draftRules, dialog, button));
  }).catch(error => { loading.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }), element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.cancel'), onClick: close })); loading.setAttribute('aria-busy', 'false'); });
}

function generationPreviewCard(state, preview, { onConfirm, confirmKey = 'plan.preview.confirm' } = {}) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'plan-generation-preview' });
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'plan.preview.title') }), element('p', { className: 'muted', text: t(state, 'plan.preview.body') })]), element('button', { className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => { state.planUi.planPreview = null; state.render(); } })]));
  card.append(previewDays(state, preview, { replaceable: true }));
  if (preview.diagnostics?.frequencies) card.append(frequencySummary(state, preview.diagnostics.frequencies));
  const tuningSummary = generationTuningSummary(state, preview); if (tuningSummary) card.append(tuningSummary);
  if (preview.planIngredientSubstitutions?.length) card.append(element('div', { className: 'validation-box', 'data-testid': 'plan-ingredient-substitution-summary' }, [element('strong', { text: t(state, 'plan.ingredientSubstitution.appliedTitle') }), ...preview.planIngredientSubstitutions.map(edit => element('span', { text: t(state, 'plan.ingredientSubstitution.appliedRow', { source: edit.sourceNames?.[state.i18n.locale] || edit.sourceIngredientId, target: edit.candidateNames?.[state.i18n.locale] || edit.candidateIngredientId, count: edit.affectedOccurrences }) }))]));
  card.append(element('div', { className: 'button-row' }, [element('button', { type: 'button', className: 'button button--secondary', 'data-testid': 'generation-tuning-open', text: t(state, 'plan.tuning.action'), onClick: event => openGenerationTuningDialog(state, preview, event.currentTarget) }), element('button', { type: 'button', className: 'button button--secondary', 'data-testid': 'plan-ingredient-substitution-open', text: t(state, 'plan.ingredientSubstitution.action'), onClick: event => openPlanIngredientSubstitutionDialog(state, preview, event.currentTarget) }), element('button', { className: 'button', 'data-testid': 'plan-confirm', text: t(state, confirmKey), onClick: async event => { const button = event.currentTarget; button.disabled = true; try { await onConfirm(); } catch (error) { card.append(element('p', { role: 'alert', text: error.message || String(error) })); button.disabled = false; } } })])); return card;
}

function createPlanCard(state, today, target) {
  const card = element('section', { className: 'plan-action-card', 'data-testid': 'plan-create' }); const status = statusBox();
  const start = element('input', { type: 'date', value: today, 'data-testid': 'plan-start' }); const days = element('input', { type: 'number', min: 1, max: 90, step: 1, required: true, value: 7, 'data-testid': 'plan-days' }); const seed = element('input', { type: 'text', value: seedValue('plan', today), 'data-testid': 'plan-seed' });
  const mode = element('select'); for (const value of ['prompt', 'auto_extend', 'fixed']) mode.append(element('option', { value, text: t(state, `plan.continuation.${value}`) }));
  const form = element('div', { className: 'form-grid form-grid--4' }, [field(t(state, 'plan.startDate'), start), field(t(state, 'plan.days'), days), field(t(state, 'plan.seed'), seed), field(t(state, 'plan.continuation.label'), mode)]);
  let controller = null;
  const progressLabelNode = element('span', { text: progressLabel(state, { percent: 0 }) });
  const progressMeter = element('progress', { max: 100, value: 0, 'aria-label': t(state, 'plan.generation.progress') });
  const abort = element('button', { type: 'button', className: 'button button--secondary', 'data-testid': 'plan-generation-abort', text: t(state, 'common.abort'), disabled: true, onClick: () => { abort.disabled = true; controller?.abort(); } });
  const progress = element('div', { className: 'validation-box', role: 'status', 'data-testid': 'plan-generation-progress' }, [progressLabelNode, progressMeter, abort]);
  progress.hidden = true;
  const generate = element('button', { className: 'button', 'data-testid': 'plan-generate', text: t(state, 'plan.generatePreview'), onClick: async () => {
    generate.disabled = true;
    try {
      status.node.className = ''; status.node.textContent = '';
      const count = Number(days.value);
      if (!Number.isInteger(count) || count < 1 || count > 90 || !start.value) throw new Error(state.i18n.locale === 'it' ? 'Scegli una data e da 1 a 90 giorni interi.' : 'Choose a date and 1–90 whole days.');
      controller = new AbortController(); abort.disabled = false; progress.hidden = false; progressMeter.value = 0; progressLabelNode.textContent = progressLabel(state, { percent: 0 });
      const preview = await createInitialPreview({
        signal: controller.signal,
        onProgress: value => { const percent = progressPercent(value); progressMeter.value = percent; progressMeter.setAttribute('aria-valuenow', String(percent)); progressLabelNode.textContent = progressLabel(state, value); },
        horizon: { startDate: start.value, endDate: addCivilDays(start.value, count - 1) },
        seed: seed.value.trim() || seedValue('plan', start.value),
        continuationPolicy: { mode: mode.value, triggerDaysBeforeEnd: 3, extensionDays: count }
      }, { repo: state.repo, registry: state.registry });
      if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure));
      state.planUi.planPreview = await addRecipeLabels(state, preview); state.render();
    } catch (error) {
      status.error(error);
    } finally {
      controller = null; abort.disabled = true; progress.hidden = true; generate.disabled = false;
    }
  } });
  card.append(element('h2', { text: t(state, 'plan.create.title') }), element('p', { className: 'muted', text: t(state, 'plan.create.body') }), form, status.node, progress, element('div', { className: 'button-row' }, [generate]));
  const prefs = state.configuration.foodPreferences.find(p => p.id === state.config.foodPreferencesId); const recommended = Math.max(1, ...(prefs?.schemaVersion === 2 ? prefs.rules.filter(r => r.enabled && r.mode === 'frequency' && r.minOccurrences > 0).map(r => r.window.days) : []));
  if (recommended > 1) card.append(element('button', { type: 'button', className: 'button button--secondary', text: state.i18n.locale === 'it' ? `Usa ${recommended} giorni per valutare i minimi` : `Use ${recommended} days to evaluate minimums`, onClick: () => { days.value = recommended; } })); target.append(card);
}

function field(label, control) { return element('label', { className: 'field' }, [element('span', { text: label }), control]); }

function adherenceEditor(state, day, slot, rerender) {
  const wrap = element('div', { className: 'adherence-editor', 'data-testid': 'adherence-editor' }); const select = element('select', { 'data-testid': 'adherence-status' });
  for (const value of ['not_recorded', 'followed', 'partial', 'not_followed']) select.append(element('option', { value, text: t(state, `plan.adherence.${value}`) })); select.value = slot.adherenceStatus || 'not_recorded';
  const notes = element('input', { type: 'text', value: slot.adherenceNotes || '', placeholder: t(state, 'plan.adherence.notes') });
  const controls = [field(t(state, 'plan.adherence.label'), select), field(t(state, 'plan.adherence.notesLabel'), notes)];
  let energy = null; let protein = null;
  if (slot.mode === 'external' && slot.externalEstimate?.policy === 'user_estimate') { energy = element('input', { type: 'number', min: 0, step: 10, value: slot.externalEstimate.userEstimatedEnergyKcal ?? '' }); protein = element('input', { type: 'number', min: 0, step: 1, value: slot.externalEstimate.userEstimatedProteinG ?? '' }); controls.push(field(t(state, 'plan.external.energyEstimate'), energy), field(t(state, 'plan.external.proteinEstimate'), protein)); }
  state.planUi.adherenceDrafts ||= {};
  const draftKey = `${day.calendarDayId}:${slot.mealOccurrenceId}`;
  const draft = state.planUi.adherenceDrafts[draftKey];
  if (draft) { select.value = draft.status; notes.value = draft.notes; if (energy) energy.value = draft.energy ?? ''; if (protein) protein.value = draft.protein ?? ''; }
  const remember = () => { state.planUi.adherenceDrafts[draftKey] = { status: select.value, notes: notes.value, energy: energy?.value, protein: protein?.value }; };
  for (const input of [select, notes, energy, protein].filter(Boolean)) { input.addEventListener('input', remember); input.addEventListener('change', remember); }
  wrap.append(...controls, element('button', { className: 'button button--secondary button--small', 'data-testid': 'adherence-save', text: t(state, 'common.save'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: select.value, notes: notes.value, userEstimatedEnergyKcal: energy?.value ?? null, userEstimatedProteinG: protein?.value ?? null }, { repo: state.repo, registry: state.registry }); delete state.planUi.adherenceDrafts[draftKey]; await rerender(); } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); button.disabled = false; } } }));
  return wrap;
}

function applyContextReturnTarget() {
  const rawHash = globalThis.location?.hash?.slice(1);
  if (!rawHash) return false;
  const target = document.getElementById(decodeURIComponent(rawHash));
  if (!target) return false;
  document.querySelectorAll('.context-return-target').forEach(node => { if (node !== target) node.classList.remove('context-return-target'); });
  target.classList.add('context-return-target');
  target.scrollIntoView?.({ block: 'center' });
  return true;
}

function mealCard(state, day, slot, recipes, { manage = false, rerender = null, safetyOverlay = null } = {}) {
  const anchorId = `meal-${slot.mealOccurrenceId}`;
  const returnRoute = `/calendar/day?date=${encodeURIComponent(day.date)}#${encodeURIComponent(anchorId)}`;
  const mc = mealClass(state, slot.mealClassId); const card = element('article', { id: anchorId, className: 'meal-card', 'data-testid': 'plan-meal-card', 'data-meal-occurrence-id': slot.mealOccurrenceId }); const title = slot.mode === 'external' ? t(state, 'plan.external') : (mc?.name || slot.mealClassId);
  card.append(element('div', { className: 'meal-card__head' }, [element('div', {}, [element('span', { className: 'muted', text: `${slot.time} · ${mc?.name || slot.mealClassId}` }), element('h3', { text: title })]), element('span', { className: `status-chip status-chip--${slot.adherenceStatus || 'not_recorded'}`, text: t(state, `plan.adherence.${slot.adherenceStatus || 'not_recorded'}`) })]));
  if (safetyOverlay && safetyOverlay.status !== 'compatible') card.append(element('p', { className: 'validation-box validation-box--error', text: state.i18n.locale === 'it' ? (safetyOverlay.status === 'incompatible' ? 'Non compatibile con le esclusioni correnti. Trova alternative dalla gestione giornata.' : 'Compatibilità non verificata con le esclusioni correnti.') : (safetyOverlay.status === 'incompatible' ? 'Incompatible with current exclusions. Find alternatives in day management.' : 'Compatibility with current exclusions is unverified.') }));
  for (const recipe of recipes) {
    const query = new URLSearchParams({ version: recipe.recipeVersionId, return: returnRoute });
    card.append(element('a', { href: `/recipes/${encodeURIComponent(recipe.recipeId)}?${query}`, 'data-route': '', className: 'meal-recipe-link meal-recipe-link--direct', 'data-testid': 'plan-recipe-link' }, [
      element('span', { className: 'meal-recipe-link__content' }, [element('strong', { text: localeTitle(state, recipe) }), recipePills(state, recipe)]),
      element('span', { className: 'meal-recipe-link__action', text: t(state, 'plan.openRecipe') })
    ]));
  }
  if (slot.mode === 'external') card.append(element('p', { className: 'muted', text: t(state, `plan.external.policy.${slot.externalEstimate?.policy || 'unknown'}`) }));
  if (manage && rerender) card.append(adherenceEditor(state, day, slot, rerender)); return card;
}

function nutritionPanel(state, day) {
  if (!day?.nutritionSummary) return null;
  const n = day.nutritionSummary.knownPlanned; const target = day.nutritionSummary.target; const external = day.nutritionSummary.externalBudget?.energyKcal || 0;
  const energy = energyConstraintStatus(n.energyKcal, target.energyKcal, target.energyTolerancePct, external);
  const energyLabel = `${Math.round(energy.budgetedTotalKcal)} / ${Math.round(energy.targetKcal)} kcal · ${Math.round(energy.dailyMinKcal)}–${Math.round(energy.dailyMaxKcal)} · ${t(state, energy.withinTolerance ? 'plan.energy.hardOk' : 'plan.energy.hardFail')}`;
  return element('section', { className: 'nutrition-panel', 'data-testid': 'plan-energy-constraint', 'data-energy-hard-status': energy.withinTolerance ? 'pass' : 'fail' }, [element('div', { className: 'section-heading' }, [element('h2', { text: t(state, 'plan.nutrition.title') }), element('span', { className: 'muted', text: energyLabel })]), element('div', { className: 'nutrition-metrics' }, [metric(t(state, 'nutrient.protein'), `${n.proteinG} g`), metric(t(state, 'nutrient.carbs'), `${n.carbsG} g`), metric(t(state, 'nutrient.fat'), `${n.fatG} g`), metric(t(state, 'nutrient.fiber'), `${n.fiberG} g`)])]);
}
function metric(label, value) { return element('div', { className: 'metric-box' }, [element('span', { className: 'muted', text: label }), element('strong', { text: value })]); }

async function todayBody(state, section) {
  const today = civilDateInTimeZone(state.config.timeZone); const view = await loadEffectivePlanState(today, { repo: state.repo });
  if (view.continuation.action === 'auto_extend' && !state.planUi.autoExtending && !state.planUi.autoExtendError) {
    state.planUi.autoExtending = true;
    try { const autoPreview = await createExtensionPreview(view.latestPlan.planInstanceId, { ...generationOptions(state, section), seed: seedValue('auto-extend', view.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (autoPreview.status !== 'success') throw new Error(planFailure(state, autoPreview.failure)); await commitGeneratedPreview(autoPreview, { repo: state.repo, registry: state.registry }); state.planUi.autoExtendError = null; }
    catch (error) { state.planUi.autoExtendError = error.message || String(error); }
    finally { state.planUi.autoExtending = false; state.render(); }
    return;
  }
  section.replaceChildren();
  section.append(profileStatus(state));
  section.append(element('p', { className: 'eyebrow', text: 'TODAY' }), element('h1', { text: t(state, 'page.today.title') }), element('p', { className: 'lead', text: localDateLabel(state, today) }));
  if (state.planUi.autoExtendError) section.append(element('div', { className: 'validation-box validation-box--error', text: state.planUi.autoExtendError }));
  const actions = element('div', { className: 'page-actions' }, [element('a', { href: '/history', 'data-route': '', className: 'button button--secondary', text: t(state, 'plan.history.title') })]); if (view.dietDay) actions.append(element('a', { href: `/calendar/day?date=${today}`, 'data-route': '', className: 'button button--secondary', 'data-testid': 'plan-manage-today', text: t(state, 'plan.manageDay') })); section.append(actions);
  if (!view.latestPlan) { createPlanCard(state, today, section); if (state.planUi.planPreview) section.append(generationPreviewCard(state, state.planUi.planPreview, { onConfirm: async () => { await commitGeneratedPreview(state.planUi.planPreview, { repo: state.repo, registry: state.registry }); state.planUi.planPreview = null; state.render(); } })); return; }
  if (view.dietDay) { const dc = dayClass(state, view.dietDay.dayClassId); section.append(element('div', { className: 'day-heading-card' }, [element('span', { className: 'day-swatch day-swatch--large', style: `background:${dc?.color || '#888'}` }), element('div', {}, [element('strong', { text: `${dc?.name || view.dietDay.dayClassId} · ${t(state, 'plan.cycleDay', { day: view.dietDay.cycleDay })}` }), element('span', { className: 'muted', text: t(state, `plan.dayStatus.${view.dietDay.status}`) })])])); }
  const now = localTime(state); const next = view.civilMeals.find(item => item.slot.time >= now) || null; if (next) { section.append(element('section', { className: 'next-meal-card' }, [element('span', { className: 'eyebrow', text: t(state, 'plan.nextMeal') }), element('strong', { text: next.slot.mode === 'external' ? t(state, 'plan.external') : (mealClass(state, next.slot.mealClassId)?.name || next.slot.mealClassId) }), element('span', { className: 'muted', text: `${next.slot.time} · ${mealClass(state, next.slot.mealClassId)?.name || next.slot.mealClassId}` })])); const prepMinutes = next.recipes.reduce((total, recipe) => total + Number(recipe.practical?.prepMinutes || 0), 0); if (prepMinutes > 0) section.append(element('div', { className: 'prep-inline' }, [element('strong', { text: t(state, 'plan.upcomingPrep') }), element('span', { className: 'muted', text: t(state, 'plan.prepMinutes', { minutes: prepMinutes }) })])); }
  const meals = element('section', { className: 'meal-list' }, [element('h2', { text: t(state, 'plan.mealsByCivilDate') })]); for (const item of view.civilMeals) meals.append(mealCard(state, item.sourceDay, item.slot, item.recipes, { safetyOverlay: item.safetyOverlay })); if (!view.civilMeals.length) meals.append(element('div', { className: 'empty-state', text: t(state, 'plan.noMealsToday') })); section.append(meals, nutritionPanel(state, view.dietDay), await currentFrequencySummary(state, view.dietDay ? [view.dietDay] : [], today));
  if (view.continuation.state === 'ended' || view.continuation.state === 'extension_window') { const cta = element('section', { className: 'plan-action-card' }, [element('h2', { text: t(state, view.continuation.state === 'ended' ? 'plan.ended.title' : 'plan.extend.title') }), element('p', { className: 'muted', text: t(state, view.continuation.state === 'ended' ? 'plan.ended.body' : 'plan.extend.body') })]); if (view.continuation.action && view.continuation.action !== 'auto_extend') cta.append(element('button', { className: 'button', text: t(state, 'plan.extend.preview'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; const preview = await createExtensionPreview(view.latestPlan.planInstanceId, { ...generationOptions(state, section), seed: seedValue('extend', view.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure)); state.planUi.planPreview = await addRecipeLabels(state, preview); state.render(); } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); button.disabled = false; } } })); section.append(cta); }
  if (view.continuation.state === 'ended' && !view.continuation.action) createPlanCard(state, today, section);
  if (state.planUi.planPreview) section.append(generationPreviewCard(state, state.planUi.planPreview, { onConfirm: async () => { await commitGeneratedPreview(state.planUi.planPreview, { repo: state.repo, registry: state.registry }); state.planUi.planPreview = null; state.render(); } }));
}

export function todayPage(state) { state.planUi ||= {}; const section = page(state, 'page.today.title', 'plan.today.loading', 'TODAY'); void todayBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }

function monthBounds(month) { const [year, number] = month.split('-').map(Number); const start = `${year}-${String(number).padStart(2, '0')}-01`; const endDate = new Date(Date.UTC(year, number, 0)); return { start, end: endDate.toISOString().slice(0, 10), year, number }; }
function shiftMonth(month, delta) { const [year, number] = month.split('-').map(Number); const date = new Date(Date.UTC(year, number - 1 + delta, 1)); return date.toISOString().slice(0, 7); }
function monthLabel(state, month) { const bounds = monthBounds(month); return new Intl.DateTimeFormat(state.i18n.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${bounds.start}T12:00:00Z`)); }


function activeDayClasses(state) {
  const ids = new Set(state.config?.dayClassIds || state.configuration?.appConfig?.dayClassIds || []);
  return (state.configuration?.dayClasses || []).filter(item => !ids.size || ids.has(item.id));
}

async function requestCalendarStructurePreview(state, options, button) {
  button.disabled = true;
  try {
    const preview = await createCalendarStructurePreview(options, { repo: state.repo, registry: state.registry });
    state.planUi.calendarStructurePreview = await addRecipeLabels(state, preview);
    state.render();
  } catch (error) {
    state.notify?.('error', error.message || String(error), { timeoutMs: 0 });
    button.disabled = false;
  }
}

function calendarStructureEditor(state, { day = null, date, planInstanceId }) {
  const card = element('section', { className: 'plan-action-card', 'data-testid': 'calendar-structure-editor' });
  const choices = activeDayClasses(state);
  const select = element('select', { 'data-testid': 'calendar-day-class' });
  for (const item of choices) select.append(element('option', { value: item.id, text: item.name || item.abbreviation || item.id }));
  if (day?.dayClassId && choices.some(item => item.id === day.dayClassId)) select.value = day.dayClassId;
  const titleKey = day ? 'plan.structure.modifyTitle' : 'plan.structure.addTitle';
  const bodyKey = day ? 'plan.structure.modifyBody' : 'plan.structure.addBody';
  card.append(element('h2', { text: t(state, titleKey) }), element('p', { className: 'muted', text: t(state, bodyKey) }), field(t(state, 'plan.structure.dayClass'), select));
  if (day) {
    const outgoing = day.mealSlots.filter(slot => slot.civilDate !== day.date);
    if (outgoing.length) card.append(element('div', { className: 'validation-box', text: t(state, 'plan.structure.currentOverflow', { count: outgoing.length, dates: [...new Set(outgoing.map(slot => slot.civilDate))].join(', ') }) }));
  }
  const actions = element('div', { className: 'button-row' });
  actions.append(element('button', {
    type: 'button', className: 'button', 'data-testid': day ? 'calendar-day-modify-preview' : 'calendar-day-add-preview',
    text: t(state, day ? 'plan.structure.modifyPreview' : 'plan.structure.addPreview'),
    disabled: !choices.length,
    onClick: event => void requestCalendarStructurePreview(state, { planInstanceId, date, action: day ? 'modify' : 'add', dayClassId: select.value, seed: seedValue('calendar-structure', date) }, event.currentTarget)
  }));
  if (day) {
    actions.append(element('button', {
      type: 'button', className: 'button button--secondary', 'data-testid': 'calendar-day-insert-preview', text: t(state, 'plan.structure.insertPreview'),
      disabled: !choices.length,
      onClick: event => void requestCalendarStructurePreview(state, { planInstanceId, date, action: 'insert', dayClassId: select.value, seed: seedValue('calendar-insert', date) }, event.currentTarget)
    }));
    actions.append(element('button', {
      type: 'button', className: 'button button--danger', 'data-testid': 'calendar-day-remove-shift-preview', text: t(state, 'plan.structure.removeShiftPreview'),
      onClick: event => void requestCalendarStructurePreview(state, { planInstanceId, date, action: 'remove_shift' }, event.currentTarget)
    }));
    actions.append(element('button', {
      type: 'button', className: 'button button--danger', 'data-testid': 'calendar-day-remove-preview', text: t(state, 'plan.structure.removePreview'),
      onClick: event => void requestCalendarStructurePreview(state, { planInstanceId, date, action: 'remove' }, event.currentTarget)
    }));
  }
  card.append(actions);
  return card;
}

function calendarStructurePreviewCard(state, preview) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'calendar-structure-preview' });
  const label = t(state, `plan.structure.action.${preview.action}`);
  card.append(element('div', { className: 'section-heading' }, [
    element('div', {}, [element('h2', { text: `${t(state, 'plan.structure.previewTitle')} · ${label}` }), element('p', { className: 'muted', text: t(state, 'plan.structure.previewBody') })]),
    element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => { state.planUi.calendarStructurePreview = null; state.render(); } })
  ]));
  if (preview.proposedDay) card.append(previewDays(state, preview));
  else card.append(element('div', { className: 'validation-box validation-box--warning', text: t(state, 'plan.structure.removeSummary', { meals: preview.summary.sourceMealCount }) }));
  if (preview.summary.shiftedDayCount) card.append(element('div', { className: 'validation-box validation-box--warning', 'data-testid': 'calendar-shift-summary', text: t(state, 'plan.structure.shiftSummary', { count: preview.summary.shiftedDayCount, direction: preview.action === 'insert' ? '+1' : '-1' }) }));
  card.append(element('p', { className: 'muted', text: t(state, 'plan.structure.horizonSummary', { start: preview.planAfter.startDate, end: preview.planAfter.endDate }) }));
  if (preview.spillovers?.affectedCivilDates?.length) card.append(element('div', { className: 'validation-box', 'data-testid': 'calendar-spillover-summary', text: t(state, 'plan.structure.overflowSummary', { removed: preview.summary.removedSpillovers, added: preview.summary.addedSpillovers, dates: preview.spillovers.affectedCivilDates.join(', ') }) }));
  card.append(element('button', {
    type: 'button', className: ['remove', 'remove_shift'].includes(preview.action) ? 'button button--danger' : 'button', 'data-testid': 'calendar-structure-confirm', text: t(state, 'plan.structure.confirm'),
    onClick: async event => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const committed = await commitCalendarStructurePreview(preview, { repo: state.repo, registry: state.registry });
        state.planUi.calendarStructurePreview = null;
        state.planUi.replacementMessage = t(state, 'plan.structure.success');
        state.planUi.replacementUndoOperationId = committed.operation.operationId;
        if (['remove', 'remove_shift'].includes(preview.action)) nav(state, `/calendar?month=${preview.date.slice(0, 7)}`); else state.render();
      } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); button.disabled = false; }
    }
  }));
  return card;
}

function incomingSpilloverCard(state, date, civilMeals) {
  const incoming = civilMeals.filter(item => item.sourceDate !== date);
  if (!incoming.length) return null;
  const card = element('section', { className: 'plan-action-card calendar-spillover-card', 'data-testid': 'incoming-spillovers' });
  card.append(element('h2', { text: t(state, 'plan.structure.incomingTitle') }), element('p', { className: 'muted', text: t(state, 'plan.structure.incomingBody') }));
  for (const item of incoming) card.append(element('div', { className: 'calendar-spillover-row' }, [
    element('strong', { text: `${item.slot.time} · ${mealClass(state, item.slot.mealClassId)?.name || item.slot.mealClassId}` }),
    element('span', { className: 'muted', text: t(state, 'plan.structure.fromSourceDate', { date: localDateLabel(state, item.sourceDate) }) })
  ]));
  return card;
}

async function calendarBody(state, section) {
  const today = civilDateInTimeZone(state.config.timeZone);
  const params = new URLSearchParams(location.search);
  const month = params.get('month') || today.slice(0, 7);
  const bounds = monthBounds(month);
  const result = await loadCalendarRange(bounds.start, bounds.end, { repo: state.repo });
  const byDate = new Map(result.days.map(day => [day.date, day]));
  const latestPlan = result.chain.at(-1) || null;
  const canEditStructure = latestPlan?.status === 'active';
  section.replaceChildren();
  section.append(element('p', { className: 'eyebrow', text: 'CALENDAR' }), element('h1', { text: t(state, 'page.calendar.title') }), element('div', { className: 'calendar-toolbar' }, [
    element('a', { href: `/calendar?month=${shiftMonth(month, -1)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.previous') }),
    element('strong', { text: monthLabel(state, month) }),
    element('a', { href: `/calendar?month=${shiftMonth(month, 1)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.next') }),
    element('a', { href: '/history', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'plan.history.title') })
  ]));
  const grid = element('div', { className: 'calendar-grid' });
  const weekday = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(state.i18n.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 7, 3 + i))));
  weekday.forEach(name => grid.append(element('div', { className: 'calendar-weekday', text: name })));
  const first = new Date(`${bounds.start}T00:00:00Z`); const offset = (first.getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i += 1) grid.append(element('div', { className: 'calendar-cell calendar-cell--blank' }));
  for (let date = bounds.start; date <= bounds.end; date = addCivilDays(date, 1)) {
    const day = byDate.get(date); const dc = day ? dayClass(state, day.dayClassId) : null; const editableEmpty = !day && canEditStructure;
    const cell = element(day || editableEmpty ? 'a' : 'div', day || editableEmpty ? {
      href: `/calendar/day?date=${date}`, 'data-route': '', 'data-calendar-date': date,
      className: `calendar-cell${editableEmpty ? ' calendar-cell--empty calendar-cell--editable-empty' : ''}${date === today ? ' calendar-cell--today' : ''}`
    } : { className: `calendar-cell calendar-cell--empty${date === today ? ' calendar-cell--today' : ''}` });
    cell.append(element('strong', { text: String(Number(date.slice(-2))) }));
    if (day) cell.append(
      element('span', { className: 'calendar-dayclass' }, [element('span', { className: 'day-swatch', style: `background:${dc?.color || '#888'}` }), element('span', { text: dc?.name || dc?.abbreviation || day.dayClassId })]),
      element('span', { className: `calendar-status calendar-status--${day.status}`, text: t(state, `plan.dayStatus.${day.status}`) })
    );
    else if (editableEmpty) cell.append(element('span', { className: 'calendar-add-hint', text: t(state, 'plan.structure.addShort') }));
    if (day && day.mealSlots.some(slot => ['incompatible', 'unknown'].includes(result.safetyOverlays.get(slot.mealOccurrenceId)?.status))) cell.append(element('span', { className: 'validation-box--error', text: state.i18n.locale === 'it' ? 'Esclusioni: da verificare' : 'Exclusions: review needed' }));
    grid.append(cell);
  }
  section.append(grid);
  if (result.days.length) section.append(await currentFrequencySummary(state, result.days, result.days.at(-1).date));
  const effective = await loadEffectivePlanState(today, { repo: state.repo });
  if (effective.continuation.action === 'auto_extend' && !state.planUi.autoExtending && !state.planUi.autoExtendError) { state.planUi.autoExtending = true; try { const autoPreview = await createExtensionPreview(effective.latestPlan.planInstanceId, { ...generationOptions(state, section), seed: seedValue('auto-extend', effective.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (autoPreview.status !== 'success') throw new Error(planFailure(state, autoPreview.failure)); await commitGeneratedPreview(autoPreview, { repo: state.repo, registry: state.registry }); state.planUi.autoExtendError = null; } catch (error) { state.planUi.autoExtendError = error.message || String(error); } finally { state.planUi.autoExtending = false; state.render(); } return; }
  if (state.planUi.autoExtendError) section.append(element('div', { className: 'validation-box validation-box--error', text: state.planUi.autoExtendError }));
  if (effective.continuation.state === 'ended' || effective.continuation.state === 'extension_window') { const cta = element('section', { className: 'plan-action-card' }, [element('h2', { text: t(state, effective.continuation.state === 'ended' ? 'plan.ended.title' : 'plan.extend.title') }), element('p', { className: 'muted', text: t(state, effective.continuation.state === 'ended' ? 'plan.ended.body' : 'plan.extend.body') })]); if (effective.continuation.action && effective.continuation.action !== 'auto_extend') cta.append(element('button', { className: 'button', text: t(state, 'plan.extend.preview'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; const extension = await createExtensionPreview(effective.latestPlan.planInstanceId, { ...generationOptions(state, section), seed: seedValue('extend', effective.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (extension.status !== 'success') throw new Error(planFailure(state, extension.failure)); state.planUi.planPreview = await addRecipeLabels(state, extension); state.render(); } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); button.disabled = false; } } })); section.append(cta); }
  if (effective.continuation.state === 'ended' && !effective.continuation.action) createPlanCard(state, today, section);
  if (!result.chain.length) createPlanCard(state, today, section); else if (result.days.length) section.append(rebalanceRangeCard(state, result.days));
  if (state.planUi.planPreview) section.append(generationPreviewCard(state, state.planUi.planPreview, { onConfirm: async () => { await commitGeneratedPreview(state.planUi.planPreview, { repo: state.repo, registry: state.registry }); state.planUi.planPreview = null; state.render(); } }));
  if (state.planUi.rebalancePreview) section.append(rebalancePreviewCard(state, state.planUi.rebalancePreview));
}

async function requestRebalancePreview(state, { planInstanceId, startDate, endDate, mode, status = null, button = null }) {
  try {
    if (button) button.disabled = true;
    const preview = await createRebalancePreview({
      planInstanceId, startDate, endDate,
      ...generationOptions(state, button?.parentNode),
      seed: seedValue(mode === 'alternative' ? 'regenerate' : 'recalculate', startDate),
      mode
    }, { repo: state.repo, registry: state.registry });
    if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure));
    state.planUi.rebalancePreview = await addRecipeLabels(state, preview);
    state.render();
  } catch (error) {
    if (status) status.error(error); else state.notify?.('error', error.message || String(error), { timeoutMs: 0 });
    if (button) button.disabled = false;
  }
}

function rebalanceRangeCard(state, visibleDays) {
  const card = element('section', { className: 'plan-action-card', 'data-testid': 'rebalance-range' });
  const start = element('input', { type: 'date', value: visibleDays[0]?.date || '', 'data-testid': 'rebalance-start' });
  const end = element('input', { type: 'date', value: visibleDays.at(-1)?.date || '', 'data-testid': 'rebalance-end' });
  const status = statusBox();
  const action = mode => async event => {
    const source = visibleDays.find(day => day.date === start.value);
    if (!source) { status.error(new Error(t(state, 'plan.rebalance.startMissing'))); return; }
    await requestRebalancePreview(state, { planInstanceId: source.planInstanceId, startDate: start.value, endDate: end.value, mode, status, button: event.currentTarget });
  };
  card.append(
    element('h2', { text: t(state, 'plan.rebalance.title') }),
    element('p', { className: 'muted', text: t(state, 'plan.rebalance.body') }),
    element('div', { className: 'form-grid form-grid--3' }, [
      field(t(state, 'plan.startDate'), start),
      field(t(state, 'plan.endDate'), end),
      element('div', { className: 'page-actions' }, [
        element('button', { className: 'button', 'data-testid': 'rebalance-preview', text: t(state, 'plan.rebalance.preview'), onClick: action('alternative') }),
        element('button', { className: 'button button--secondary', 'data-testid': 'recalculate-preview', text: t(state, 'plan.rebalance.recalculate'), onClick: action('recalculate') })
      ])
    ]),
    status.node
  );
  return card;
}

function rebalancePreviewCard(state, preview) {
  const summary = preview.regenerationSummary;
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'rebalance-preview-card' });
  card.append(element('div', { className: 'section-heading' }, [
    element('div', {}, [
      element('h2', { text: t(state, 'plan.rebalance.previewTitle') }),
      element('p', { className: 'muted', text: t(state, 'plan.rebalance.selectDays') })
    ]),
    element('button', { className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => { state.planUi.rebalancePreview = null; state.render(); } })
  ]));
  if (summary) {
    card.append(element('div', {
      className: summary.unchangedSlots ? 'validation-box validation-box--warning' : 'validation-box',
      'data-testid': 'rebalance-summary',
      'data-changed': String(summary.changedSlots),
      'data-unchanged': String(summary.unchangedSlots),
      'data-total': String(summary.totalPlannedSlots),
      text: t(state, 'plan.rebalance.summary', { changed: summary.changedSlots, total: summary.totalPlannedSlots, unchanged: summary.unchangedSlots })
    }));
    if (summary.strictFailure) card.append(element('p', { className: 'muted', text: t(state, 'plan.rebalance.boundedReason') }));
  }
  const days = previewDays(state, preview, { selectable: true });
  card.append(days, element('button', {
    className: 'button', 'data-testid': 'rebalance-confirm', text: t(state, 'plan.rebalance.confirm'),
    onClick: async event => {
      const button = event.currentTarget;
      try {
        button.disabled = true;
        const selectedDates = [...days.querySelectorAll('input[data-preview-date]:checked')].map(input => input.dataset.previewDate);
        await commitRebalancePreview(preview, { selectedDates, repo: state.repo, registry: state.registry });
        state.planUi.rebalancePreview = null; state.render();
      } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); button.disabled = false; }
    }
  }));
  return card;
}

export function calendarPage(state) { state.planUi ||= {}; const section = page(state, 'page.calendar.title', 'plan.calendar.loading', 'CALENDAR'); void calendarBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }

async function manageDayBody(state, section) {
  const date = new URLSearchParams(location.search).get('date') || civilDateInTimeZone(state.config.timeZone);
  const result = await loadCalendarRange(date, date, { repo: state.repo });
  const day = result.days[0];
  const latestPlan = result.chain.at(-1) || null;
  const activeStructuralPlan = latestPlan?.status === 'active' ? latestPlan : null;
  section.replaceChildren();
  section.append(element('p', { className: 'eyebrow', text: 'DAY' }), element('h1', { text: `${t(state, 'plan.manageDay')} · ${localDateLabel(state, date)}` }), element('div', { className: 'page-actions' }, [element('a', { href: `/calendar?month=${date.slice(0, 7)}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'common.back') }), element('a', { href: '/history', 'data-route': '', className: 'button button--secondary', text: t(state, 'plan.history.title') })]));
  if (!day) {
    section.append(element('div', { className: 'empty-state', text: t(state, 'plan.dayMissing') }));
    if (activeStructuralPlan) section.append(calendarStructureEditor(state, { date, planInstanceId: activeStructuralPlan.planInstanceId }));
    if (state.planUi.calendarStructurePreview?.date === date) section.append(calendarStructurePreviewCard(state, state.planUi.calendarStructurePreview));
    return;
  }
  const ids = [...new Set(day.mealSlots.flatMap(slot => slot.recipeComponents.map(component => component.recipeVersionId)))];
  const rows = await state.repo.getMany('recipeVersions', ids);
  const recipeMap = new Map(rows.map(recipe => [recipe.recipeVersionId, recipe]));
  const rerender = async () => state.render();
  const dc = dayClass(state, day.dayClassId);
  const cycleLabel = day.cycleDay == null ? t(state, 'plan.structure.manualDay') : t(state, 'plan.cycleDay', { day: day.cycleDay });
  section.append(element('div', { className: 'day-heading-card' }, [element('span', { className: 'day-swatch day-swatch--large', style: `background:${dc?.color || '#888'}` }), element('div', {}, [element('strong', { text: `${dc?.name || day.dayClassId} · ${cycleLabel}` }), element('span', { className: 'muted', text: t(state, `plan.dayStatus.${day.status}`) })])]), nutritionPanel(state, day));
  if (state.planUi.replacementMessage) section.append(element('p', { role: 'status', className: 'validation-box', text: state.planUi.replacementMessage }), element('button', { className: 'button button--secondary', text: state.i18n.locale === 'it' ? 'Annulla modifica' : 'Undo change', onClick: async event => { const button = event.currentTarget; button.disabled = true; try { await undoPlanOperation(day.planInstanceId, { repo: state.repo, registry: state.registry, expectedOperationId: state.planUi.replacementUndoOperationId }); state.planUi.replacementMessage = null; await manageDayBody(state, section); } catch (error) { state.notify?.('error', error.message); button.disabled = false; } } }));

  const civilMeals = await loadCivilMealsForDate(date, { repo: state.repo });
  const incoming = incomingSpilloverCard(state, date, civilMeals);
  if (incoming) section.append(incoming);
  if (activeStructuralPlan?.planInstanceId === day.planInstanceId) section.append(calendarStructureEditor(state, { day, date, planInstanceId: day.planInstanceId }));

  const list = element('div', { className: 'meal-list' });
  for (const slot of day.mealSlots) {
    const card = mealCard(state, day, slot, slot.recipeComponents.map(component => recipeMap.get(component.recipeVersionId)).filter(Boolean), { manage: true, rerender, safetyOverlay: result.safetyOverlays.get(slot.mealOccurrenceId) });
    if (slot.mode === 'planned') card.append(element('button', { disabled:Boolean(slot.locked||slot.recipeComponents.some(c=>c.productionBatchId)), className: 'button button--secondary button--small', 'data-testid': 'plan-replace', text: t(state, 'plan.replace'), onClick: event => requestReplacement(state, day, slot, event.currentTarget, section) }));
    if(slot.mode==='planned'){const batched=slot.recipeComponents.some(c=>c.productionBatchId);card.append(element('button',{type:'button',className:'button button--secondary','data-testid':'meal-lock','aria-pressed':String(Boolean(slot.locked)),text:state.i18n.locale==='it'?(slot.locked?'Sblocca pasto':'Blocca pasto'):(slot.locked?'Unlock meal':'Lock meal'),onClick:async event=>{const button=event.currentTarget;button.disabled=true;try{await setMealLocked({calendarDayId:day.calendarDayId,mealOccurrenceId:slot.mealOccurrenceId,locked:!slot.locked},{repo:state.repo,registry:state.registry});await manageDayBody(state,section);}catch(error){state.notify?.('error',error.message);button.disabled=false;}}}));if(slot.locked||batched)card.append(element('p',{className:'muted',text:state.i18n.locale==='it'?(batched?'Assegnato a un lotto. Scollega il lotto in Organizza prima di sostituire.':'Pasto bloccato: il riequilibrio lo mantiene. Sbloccalo per sostituirlo.'):(batched?'Allocated to a batch. Detach it in Organize before replacing.':'Locked meal: rebalancing preserves it. Unlock to replace.')}));}
    list.append(card);
  }
  section.append(list, await currentFrequencySummary(state, [day], date));
  applyContextReturnTarget();
  const dayActions = element('section', { className: 'plan-action-card' }, [
    element('h2', { text: t(state, 'plan.rebalance.dayTitle') }),
    element('p', { className: 'muted', text: t(state, 'plan.rebalance.dayBody') })
  ]);
  dayActions.append(element('div', { className: 'page-actions' }, [
    element('button', { className: 'button', 'data-testid': 'rebalance-day-preview', text: t(state, 'plan.rebalance.preview'), onClick: event => requestRebalancePreview(state, { planInstanceId: day.planInstanceId, startDate: date, endDate: date, mode: 'alternative', button: event.currentTarget }) }),
    element('button', { className: 'button button--secondary', 'data-testid': 'recalculate-day-preview', text: t(state, 'plan.rebalance.recalculate'), onClick: event => requestRebalancePreview(state, { planInstanceId: day.planInstanceId, startDate: date, endDate: date, mode: 'recalculate', button: event.currentTarget }) })
  ]));
  section.append(dayActions);
  if (state.planUi.replacePreview?.calendarDayId === day.calendarDayId) { const current = state.planUi.replacePreview; const anchor = [...list.children].find(node => node.dataset.mealOccurrenceId === current.mealOccurrenceId); if (anchor) state.planUi.replacePreview = null; }
  if (state.planUi.rebalancePreview?.sourcePlanInstanceId === day.planInstanceId) section.append(rebalancePreviewCard(state, state.planUi.rebalancePreview));
  if (state.planUi.calendarStructurePreview?.date === date) section.append(calendarStructurePreviewCard(state, state.planUi.calendarStructurePreview));
}

function focusReplacement(card) {
  const heading = card.querySelector('h2');
  heading?.focus({ preventScroll: true });
  card.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
}

function closeReplacement(state, card, button) {
  state.planUi.replaceRequest = (state.planUi.replaceRequest || 0) + 1;
  state.planUi.replacePreview = null;
  card.closest('dialog')?.close(); card.closest('dialog')?.remove(); card.remove(); if (button?.isConnected) { button.disabled = false; button.focus(); }
}

async function requestReplacement(state, day, slot, button, section, options = {}) {
  const request = (state.planUi.replaceRequest || 0) + 1;
  state.planUi.replaceRequest = request; state.planUi.replacePreview = null;
  section.querySelectorAll('.replacement-dialog').forEach(node => { node.close(); node.remove(); });
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'replacement-preview', 'aria-busy': 'true', 'aria-label': t(state, 'plan.replace.previewTitle') }, [
    element('h2', { tabIndex: -1, text: `${t(state, 'plan.replace.previewTitle')} · ${mealClass(state, slot.mealClassId)?.name || slot.time}` }),
    element('p', { text: [...button.closest('.meal-card').querySelectorAll('.meal-recipe-link strong')].map(node => node.textContent).join(' + ') }),
    element('p', { role: 'status', text: t(state, 'common.loading') }),
    element('button', { className: 'button button--secondary', text: t(state, 'common.cancel'), onClick: () => closeReplacement(state, card, button) })
  ]);
  card.addEventListener('keydown', event => { if (event.key === 'Escape') closeReplacement(state, card, button); });
  const dialog = element('dialog', { className: 'replacement-dialog', 'aria-label': t(state, 'plan.replace.previewTitle') }, [card]);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (dialog.querySelector('[aria-busy=true] [data-testid=replacement-confirm]')) return; closeReplacement(state, dialog.querySelector('[data-testid=replacement-preview]') || card, button); });
  section.append(dialog); dialog.showModal(); focusReplacement(card);
  try {
    const preview = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: seedValue('replace', day.date), ...options }, { repo: state.repo, registry: state.registry });
    if (state.planUi.replaceRequest !== request || !card.isConnected) return;
    state.planUi.replacePreview = preview;
    const result = replacementPreviewCard(state, preview, button, section); card.replaceWith(result); result._replacementContext = { day, slot }; focusReplacement(result);
  } catch (error) {
    if (state.planUi.replaceRequest !== request || !card.isConnected) return;
    card.setAttribute('aria-busy', 'false'); const status = card.querySelector('[role=status]'); status.setAttribute('role', 'alert'); status.textContent = error.message || String(error);
    card.append(element('button', { className: 'button', text: t(state, 'common.retry'), onClick: () => requestReplacement(state, day, slot, button, section, options) }));
  }
}

function replacementPreviewCard(state, preview, button, section) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'replacement-preview', 'aria-label': t(state, 'plan.replace.previewTitle') });
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { tabIndex: -1, text: `${t(state, 'plan.replace.previewTitle')} · ${preview.mealLabel}` }), element('p', { className: 'muted', text: t(state, 'plan.replace.previewBody') })]), element('button', { className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => closeReplacement(state, card, button) })]));
  card.addEventListener('keydown', event => { if (event.key === 'Escape' && card.getAttribute('aria-busy') !== 'true') closeReplacement(state, card, button); });
  const status = element('p', { role: 'status' }); card.append(status);
  if (!preview.candidates.length) {
    status.textContent = t(state, 'plan.replace.empty');
    const reasons = preview.rejectionCounts || {};
    if (Object.keys(reasons).some(key => key.startsWith('safety_unverified'))) card.append(element('p', { text: t(state, 'plan.replace.unverified') }));
    if (Object.keys(reasons).some(key => key.includes('frequency'))) card.append(element('p', { text: state.i18n.locale === 'it' ? 'Le alternative trovate non rispettano le frequenze configurate.' : 'Retrieved alternatives do not meet configured frequencies.' }));
    card.append(element('p', { text: state.i18n.locale === 'it' ? 'Puoi cambiare i filtri o ampliare il catalogo. La ricerca è limitata ai candidati disponibili e alle composizioni approvate.' : 'Change filters or expand the catalog. Search is limited to available candidates and approved compositions.' }));
    if (preview.hardConstraints.rejectedByEnergy) card.append(element('p', { text: t(state, 'plan.replace.energyEmpty') }));
  }
  const context = () => card._replacementContext;
  const load = (changes = {}) => { const ctx = context(); if (ctx) return requestReplacement(state, ctx.day, ctx.slot, button, section, { ...preview.filters, componentIndex: preview.componentIndex, offset: 0, ...changes }); };
  const it = state.i18n.locale === 'it';
  const query = element('input', { type: 'search', value: preview.filters?.query || '' });
  const minutes = element('input', { type: 'number', min: 0, value: preview.filters?.maxMinutes ?? '' });
  const choice = element('select'); choice.append(element('option', { value: '', text: it ? 'Intero pasto' : 'Whole meal' }));
  for (const [index, component] of preview.currentComponents.entries()) choice.append(element('option', { value: index, text: `${it ? 'Componente' : 'Component'} ${index + 1} · ${preview.currentRecipeTitles?.[index]?.[state.i18n.locale] || preview.currentRecipeTitles?.[index]?.it || ''}` }));
  choice.value = preview.componentIndex ?? ''; choice.addEventListener('change', () => load({ componentIndex: choice.value === '' ? null : Number(choice.value) }));
  const food = createProductFoodPicker(state, state.referenceDataIndex, { value: preview.filters?.conceptId, levels: ['concept'] });
  card.append(field(it ? 'Sostituisci' : 'Replace', choice), field(it ? 'Cerca ricetta o ingrediente' : 'Search recipe or ingredient', query), food.node, field(it ? 'Tempo massimo totale (min)' : 'Maximum total time (min)', minutes), element('button', { className: 'button button--secondary', text: it ? 'Cerca alternative' : 'Search alternatives', onClick: () => { if (!minutes.checkValidity()) { minutes.reportValidity(); return; } load({ query: query.value, conceptId: food.getValue(), maxMinutes: minutes.value === '' ? null : Number(minutes.value) }); } }));
  const list = element('div', { className: 'replacement-list' });
  for (const item of preview.candidates) {
    const article = element('article', { className: 'replacement-card' });
    for (const recipe of item.recipes || [item.recipe]) article.append(element('div', {}, [element('strong', { text: localeTitle(state, recipe) }), recipePills(state, recipe)]));
    article.append(element('p', { text: `${item.components.length} ${it ? 'componenti nel pasto' : 'meal components'} · ${t(state, 'plan.replace.affinity')} ${item.affinityScore ?? '—'}% · ${Math.round(item.energyDelta)} kcal ${it ? 'sul giorno' : 'daily change'}` }), item.nutritionDelta ? element('p', { className: 'muted', text: nutritionDeltaSummary(state, item.nutritionDelta) }) : null, element('p', { text: it ? 'Sicurezza, energia e frequenze verificate per questa anteprima.' : 'Safety, energy and frequencies checked for this preview.' }), frequencySummary(state, item.score.frequencies));
    article.append(element('button', { className: 'button button--small', 'data-testid': 'replacement-confirm', text: t(state, 'plan.replace.confirm'), onClick: async () => {
      if (card.getAttribute('aria-busy') === 'true') return;
      card.setAttribute('aria-busy', 'true'); card.querySelectorAll('button, input, select').forEach(node => { node.disabled = true; }); status.textContent = t(state, 'common.loading');
      try {
        const committed = await commitReplacement({ previewId: preview.previewId, planInstanceId: preview.planInstanceId, calendarDayId: preview.calendarDayId, mealOccurrenceId: preview.mealOccurrenceId, choiceId: item.choiceId }, { repo: state.repo, registry: state.registry });
        state.planUi.replacementUndoOperationId = committed.operation.operationId;
        closeReplacement(state, card, button); state.planUi.replacementMessage = t(state, 'plan.replace.success');
        await manageDayBody(state, section);
        [...section.querySelectorAll('[data-meal-occurrence-id]')].find(node => node.dataset.mealOccurrenceId === preview.mealOccurrenceId)?.querySelector('[data-testid=plan-replace]')?.focus();
      } catch (error) { status.setAttribute('role', 'alert'); status.textContent = error.message || String(error); card.setAttribute('aria-busy', 'false'); card.querySelectorAll('button, input, select').forEach(node => { node.disabled = false; }); }
    } })); list.append(article);
  }
  card.append(list);
  const pages = element('div', { className: 'page-actions' });
  if (preview.offset > 0) pages.append(element('button', { className: 'button', text: t(state, 'common.previous'), onClick: () => load({ offset: Math.max(0, preview.offset - preview.limit) }) }));
  if (preview.hasMore) pages.append(element('button', { className: 'button', text: t(state, 'common.next'), onClick: () => load({ offset: preview.offset + preview.limit }) }));
  card.append(pages); return card;
}

export function manageDayPage(state) { state.planUi ||= {}; const section = page(state, 'plan.manageDay', 'plan.day.loading', 'DAY'); void manageDayBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }

async function historyBody(state, section) {
  const operations = await recentPlanOperations({ repo: state.repo }); section.replaceChildren(); section.append(element('p', { className: 'eyebrow', text: 'HISTORY' }), element('h1', { text: t(state, 'plan.history.title') }), element('p', { className: 'lead', text: t(state, 'plan.history.body') }), element('a', { href: '/', 'data-route': '', className: 'button button--secondary', text: t(state, 'common.back') }));
  if (!operations.length) { section.append(element('div', { className: 'empty-state', text: t(state, 'plan.history.empty') })); return; }
  const planIds = [...new Set(operations.map(item => item.planInstanceId).filter(Boolean))]; const states = new Map(); for (const id of planIds) states.set(id, await planHistoryState(id, { repo: state.repo }));
  const controls = element('div', { className: 'history-controls' }); for (const planId of planIds) { const hs = states.get(planId); controls.append(element('div', { className: 'history-plan-control' }, [element('code', { text: planId }), element('button', { className: 'button button--secondary button--small', disabled: !hs.canUndo, 'data-testid': 'plan-undo', text: t(state, 'plan.undo'), onClick: async () => { await undoPlanOperation(planId, { repo: state.repo, registry: state.registry }); state.render(); } }), element('button', { className: 'button button--secondary button--small', disabled: !hs.canRedo, 'data-testid': 'plan-redo', text: t(state, 'plan.redo'), onClick: async () => { await redoPlanOperation(planId, { repo: state.repo, registry: state.registry }); state.render(); } })])); } section.append(controls);
  const list = element('div', { className: 'history-list' }); for (const op of operations) { const stateLabel = op.metadata?.invalidatedAt ? t(state, 'plan.history.invalidated') : op.undoneAt ? t(state, 'plan.history.undone') : t(state, 'plan.history.applied'); list.append(element('article', { className: 'history-card' }, [element('div', {}, [element('strong', { text: t(state, `plan.operation.${op.kind}`) }), element('span', { className: 'muted', text: `${op.createdAt} · #${op.sequence}` })]), element('span', { className: 'status-chip', text: stateLabel })])); } section.append(list);
}
export function historyPage(state) { const section = page(state, 'plan.history.title', 'plan.history.body', 'HISTORY'); void historyBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }
