import { element } from './dom.js';
import { addCivilDays, energyConstraintStatus } from '../planner/planMath.js';
import {
  civilDateInTimeZone, loadEffectivePlanState, loadCalendarRange, createInitialPreview, createExtensionPreview, commitGeneratedPreview,
  createReplacementPreview, commitReplacement, updateAdherence, createRebalancePreview, commitRebalancePreview,
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

function recipePills(state, recipe) {
  const n = recipe.calculatedNutrition || {};
  return element('div', { className: 'recipe-metrics' }, [element('span', { text: `${Math.round(n.energyKcal || 0)} kcal` }), element('span', { text: `${Math.round((n.proteinG || 0) * 10) / 10} g ${t(state, 'nutrient.protein')}` }), element('span', { text: `${recipe.practical?.prepMinutes || 0} min` })]);
}

function previewDays(state, preview, { selectable = false } = {}) {
  const list = element('div', { className: 'plan-preview-list' });
  for (const day of preview.calendarDays || []) {
    const dc = dayClass(state, day.dayClassId); const check = selectable ? element('input', { type: 'checkbox', checked: true, 'data-preview-date': day.date }) : null;
    const meals = element('div', { className: 'preview-meals' });
    for (const slot of day.mealSlots || []) {
      const mc = mealClass(state, slot.mealClassId); const names = slot.mode === 'external' ? t(state, 'plan.external') : slot.recipeComponents.map(component => preview.recipeLabels?.[component.recipeVersionId] || component.recipeVersionId).join(' + ');
      meals.append(element('div', { className: 'preview-meal' }, [element('span', { className: 'muted', text: `${slot.time} · ${mc?.name || slot.mealClassId}` }), element('strong', { text: names })]));
    }
    list.append(element('article', { className: 'plan-preview-day' }, [element('div', { className: 'plan-preview-day__head' }, [check, element('span', { className: 'day-swatch', style: `background:${dc?.color || '#888'}` }), element('strong', { text: `${localDateLabel(state, day.date)} · ${dc?.abbreviation || day.dayClassId}` }), element('span', { className: 'muted', text: `${Math.round(day.nutritionSummary?.knownPlanned?.energyKcal || 0)} kcal` })]), meals]));
  }
  return list;
}

async function addRecipeLabels(state, preview) {
  if (preview?.status !== 'success') return preview;
  const ids = [...new Set(preview.calendarDays.flatMap(day => day.mealSlots.flatMap(slot => slot.recipeComponents.map(component => component.recipeVersionId))))];
  const rows = await state.repo.getMany('recipeVersions', ids); preview.recipeLabels = Object.fromEntries(rows.map(recipe => [recipe.recipeVersionId, localeTitle(state, recipe)])); return preview;
}

function generationPreviewCard(state, preview, { onConfirm, confirmKey = 'plan.preview.confirm' } = {}) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'plan-generation-preview' });
  card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'plan.preview.title') }), element('p', { className: 'muted', text: t(state, 'plan.preview.body') })]), element('button', { className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => { state.planUi.planPreview = null; state.render(); } })]));
  card.append(previewDays(state, preview));
  card.append(element('div', { className: 'button-row' }, [element('button', { className: 'button', 'data-testid': 'plan-confirm', text: t(state, confirmKey), onClick: onConfirm })])); return card;
}

function createPlanCard(state, today, target) {
  const card = element('section', { className: 'plan-action-card', 'data-testid': 'plan-create' }); const status = statusBox();
  const start = element('input', { type: 'date', value: today, 'data-testid': 'plan-start' }); const days = element('input', { type: 'number', min: 1, max: 31, value: 7, 'data-testid': 'plan-days' }); const seed = element('input', { type: 'text', value: seedValue('plan', today), 'data-testid': 'plan-seed' });
  const mode = element('select'); for (const value of ['prompt', 'auto_extend', 'fixed']) mode.append(element('option', { value, text: t(state, `plan.continuation.${value}`) }));
  const form = element('div', { className: 'form-grid form-grid--4' }, [field(t(state, 'plan.startDate'), start), field(t(state, 'plan.days'), days), field(t(state, 'plan.seed'), seed), field(t(state, 'plan.continuation.label'), mode)]);
  const generate = element('button', { className: 'button', 'data-testid': 'plan-generate', text: t(state, 'plan.generatePreview'), onClick: async () => {
    try { generate.disabled = true; status.node.className = 'validation-box'; status.node.textContent = t(state, 'common.loading'); const count = Math.max(1, Math.min(31, Number(days.value) || 7)); const preview = await createInitialPreview({ horizon: { startDate: start.value, endDate: addCivilDays(start.value, count - 1) }, seed: seed.value.trim() || seedValue('plan', start.value), continuationPolicy: { mode: mode.value, triggerDaysBeforeEnd: 3, extensionDays: Math.min(31, count) } }, { repo: state.repo, registry: state.registry }); if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure)); state.planUi.planPreview = await addRecipeLabels(state, preview); state.render(); } catch (error) { status.error(error); generate.disabled = false; }
  } });
  card.append(element('h2', { text: t(state, 'plan.create.title') }), element('p', { className: 'muted', text: t(state, 'plan.create.body') }), form, status.node, generate); target.append(card);
}
function field(label, control) { return element('label', { className: 'field' }, [element('span', { text: label }), control]); }

function adherenceEditor(state, day, slot, rerender) {
  const wrap = element('div', { className: 'adherence-editor', 'data-testid': 'adherence-editor' }); const select = element('select', { 'data-testid': 'adherence-status' });
  for (const value of ['not_recorded', 'followed', 'partial', 'not_followed']) select.append(element('option', { value, text: t(state, `plan.adherence.${value}`) })); select.value = slot.adherenceStatus || 'not_recorded';
  const notes = element('input', { type: 'text', value: slot.adherenceNotes || '', placeholder: t(state, 'plan.adherence.notes') });
  const controls = [field(t(state, 'plan.adherence.label'), select), field(t(state, 'plan.adherence.notesLabel'), notes)];
  let energy = null; let protein = null;
  if (slot.mode === 'external' && slot.externalEstimate?.policy === 'user_estimate') { energy = element('input', { type: 'number', min: 0, step: 10, value: slot.externalEstimate.userEstimatedEnergyKcal ?? '' }); protein = element('input', { type: 'number', min: 0, step: 1, value: slot.externalEstimate.userEstimatedProteinG ?? '' }); controls.push(field(t(state, 'plan.external.energyEstimate'), energy), field(t(state, 'plan.external.proteinEstimate'), protein)); }
  wrap.append(...controls, element('button', { className: 'button button--secondary button--small', 'data-testid': 'adherence-save', text: t(state, 'common.save'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; await updateAdherence({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, status: select.value, notes: notes.value, userEstimatedEnergyKcal: energy?.value ?? null, userEstimatedProteinG: protein?.value ?? null }, { repo: state.repo, registry: state.registry }); await rerender(); } catch (error) { alert(error.message || error); button.disabled = false; } } }));
  return wrap;
}

function mealCard(state, day, slot, recipes, { manage = false, rerender = null } = {}) {
  const anchorId = `meal-${slot.mealOccurrenceId}`;
  const returnRoute = `/calendar/day?date=${encodeURIComponent(day.date)}#${encodeURIComponent(anchorId)}`;
  const mc = mealClass(state, slot.mealClassId); const card = element('article', { id: anchorId, className: 'meal-card', 'data-testid': 'plan-meal-card', 'data-meal-occurrence-id': slot.mealOccurrenceId }); const title = slot.mode === 'external' ? t(state, 'plan.external') : recipes.map(recipe => localeTitle(state, recipe)).join(' + ');
  card.append(element('div', { className: 'meal-card__head' }, [element('div', {}, [element('span', { className: 'muted', text: `${slot.time} · ${mc?.name || slot.mealClassId}` }), element('h3', { text: title })]), element('span', { className: `status-chip status-chip--${slot.adherenceStatus || 'not_recorded'}`, text: t(state, `plan.adherence.${slot.adherenceStatus || 'not_recorded'}`) })]));
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
  if (view.continuation.action === 'auto_extend' && !state.planUi.autoExtending) {
    state.planUi.autoExtending = true;
    try { const autoPreview = await createExtensionPreview(view.latestPlan.planInstanceId, { seed: seedValue('auto-extend', view.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (autoPreview.status !== 'success') throw new Error(planFailure(state, autoPreview.failure)); await commitGeneratedPreview(autoPreview, { repo: state.repo, registry: state.registry }); state.planUi.autoExtendError = null; }
    catch (error) { state.planUi.autoExtendError = error.message || String(error); }
    finally { state.planUi.autoExtending = false; state.render(); }
    return;
  }
  section.replaceChildren();
  section.append(element('p', { className: 'eyebrow', text: 'TODAY' }), element('h1', { text: t(state, 'page.today.title') }), element('p', { className: 'lead', text: localDateLabel(state, today) }));
  if (state.planUi.autoExtendError) section.append(element('div', { className: 'validation-box validation-box--error', text: state.planUi.autoExtendError }));
  const actions = element('div', { className: 'page-actions' }, [element('a', { href: '/history', 'data-route': '', className: 'button button--secondary', text: t(state, 'plan.history.title') })]); if (view.dietDay) actions.append(element('a', { href: `/calendar/day?date=${today}`, 'data-route': '', className: 'button button--secondary', 'data-testid': 'plan-manage-today', text: t(state, 'plan.manageDay') })); section.append(actions);
  if (!view.latestPlan) { createPlanCard(state, today, section); if (state.planUi.planPreview) section.append(generationPreviewCard(state, state.planUi.planPreview, { onConfirm: async () => { await commitGeneratedPreview(state.planUi.planPreview, { repo: state.repo, registry: state.registry }); state.planUi.planPreview = null; state.render(); } })); return; }
  if (view.dietDay) { const dc = dayClass(state, view.dietDay.dayClassId); section.append(element('div', { className: 'day-heading-card' }, [element('span', { className: 'day-swatch day-swatch--large', style: `background:${dc?.color || '#888'}` }), element('div', {}, [element('strong', { text: `${dc?.name || view.dietDay.dayClassId} · ${t(state, 'plan.cycleDay', { day: view.dietDay.cycleDay })}` }), element('span', { className: 'muted', text: t(state, `plan.dayStatus.${view.dietDay.status}`) })])])); }
  const now = localTime(state); const next = view.civilMeals.find(item => item.slot.time >= now) || null; if (next) { section.append(element('section', { className: 'next-meal-card' }, [element('span', { className: 'eyebrow', text: t(state, 'plan.nextMeal') }), element('strong', { text: next.slot.mode === 'external' ? t(state, 'plan.external') : next.recipes.map(recipe => localeTitle(state, recipe)).join(' + ') }), element('span', { className: 'muted', text: `${next.slot.time} · ${mealClass(state, next.slot.mealClassId)?.name || next.slot.mealClassId}` })])); const prepMinutes = next.recipes.reduce((total, recipe) => total + Number(recipe.practical?.prepMinutes || 0), 0); if (prepMinutes > 0) section.append(element('div', { className: 'prep-inline' }, [element('strong', { text: t(state, 'plan.upcomingPrep') }), element('span', { className: 'muted', text: t(state, 'plan.prepMinutes', { minutes: prepMinutes }) })])); }
  const meals = element('section', { className: 'meal-list' }, [element('h2', { text: t(state, 'plan.mealsByCivilDate') })]); for (const item of view.civilMeals) meals.append(mealCard(state, item.sourceDay, item.slot, item.recipes)); if (!view.civilMeals.length) meals.append(element('div', { className: 'empty-state', text: t(state, 'plan.noMealsToday') })); section.append(meals, nutritionPanel(state, view.dietDay));
  if (view.continuation.state === 'ended' || view.continuation.state === 'extension_window') { const cta = element('section', { className: 'plan-action-card' }, [element('h2', { text: t(state, view.continuation.state === 'ended' ? 'plan.ended.title' : 'plan.extend.title') }), element('p', { className: 'muted', text: t(state, view.continuation.state === 'ended' ? 'plan.ended.body' : 'plan.extend.body') })]); if (view.continuation.action && view.continuation.action !== 'auto_extend') cta.append(element('button', { className: 'button', text: t(state, 'plan.extend.preview'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; const preview = await createExtensionPreview(view.latestPlan.planInstanceId, { seed: seedValue('extend', view.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure)); state.planUi.planPreview = await addRecipeLabels(state, preview); state.render(); } catch (error) { alert(error.message || error); button.disabled = false; } } })); section.append(cta); }
  if (view.continuation.state === 'ended' && !view.continuation.action) createPlanCard(state, today, section);
  if (state.planUi.planPreview) section.append(generationPreviewCard(state, state.planUi.planPreview, { onConfirm: async () => { await commitGeneratedPreview(state.planUi.planPreview, { repo: state.repo, registry: state.registry }); state.planUi.planPreview = null; state.render(); } }));
}

export function todayPage(state) { state.planUi ||= {}; const section = page(state, 'page.today.title', 'plan.today.loading', 'TODAY'); void todayBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }

function monthBounds(month) { const [year, number] = month.split('-').map(Number); const start = `${year}-${String(number).padStart(2, '0')}-01`; const endDate = new Date(Date.UTC(year, number, 0)); return { start, end: endDate.toISOString().slice(0, 10), year, number }; }
function shiftMonth(month, delta) { const [year, number] = month.split('-').map(Number); const date = new Date(Date.UTC(year, number - 1 + delta, 1)); return date.toISOString().slice(0, 7); }
function monthLabel(state, month) { const bounds = monthBounds(month); return new Intl.DateTimeFormat(state.i18n.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${bounds.start}T12:00:00Z`)); }

async function calendarBody(state, section) {
  const today = civilDateInTimeZone(state.config.timeZone); const params = new URLSearchParams(location.search); const month = params.get('month') || today.slice(0, 7); const bounds = monthBounds(month); const result = await loadCalendarRange(bounds.start, bounds.end, { repo: state.repo }); const byDate = new Map(result.days.map(day => [day.date, day])); section.replaceChildren();
  section.append(element('p', { className: 'eyebrow', text: 'CALENDAR' }), element('h1', { text: t(state, 'page.calendar.title') }), element('div', { className: 'calendar-toolbar' }, [element('a', { href: `/calendar?month=${shiftMonth(month, -1)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.previous') }), element('strong', { text: monthLabel(state, month) }), element('a', { href: `/calendar?month=${shiftMonth(month, 1)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.next') }), element('a', { href: '/history', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'plan.history.title') })]));
  const grid = element('div', { className: 'calendar-grid' }); const weekday = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(state.i18n.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 7, 3 + i)))); weekday.forEach(name => grid.append(element('div', { className: 'calendar-weekday', text: name })));
  const first = new Date(`${bounds.start}T00:00:00Z`); const offset = (first.getUTCDay() + 6) % 7; for (let i = 0; i < offset; i += 1) grid.append(element('div', { className: 'calendar-cell calendar-cell--blank' }));
  for (let date = bounds.start; date <= bounds.end; date = addCivilDays(date, 1)) { const day = byDate.get(date); const dc = day ? dayClass(state, day.dayClassId) : null; const cell = element(day ? 'a' : 'div', day ? { href: `/calendar/day?date=${date}`, 'data-route': '', 'data-calendar-date': date, className: `calendar-cell${date === today ? ' calendar-cell--today' : ''}` } : { className: `calendar-cell calendar-cell--empty${date === today ? ' calendar-cell--today' : ''}` }); cell.append(element('strong', { text: String(Number(date.slice(-2))) })); if (day) cell.append(element('span', { className: 'calendar-dayclass' }, [element('span', { className: 'day-swatch', style: `background:${dc?.color || '#888'}` }), element('span', { text: dc?.abbreviation || day.dayClassId })]), element('span', { className: `calendar-status calendar-status--${day.status}`, text: t(state, `plan.dayStatus.${day.status}`) })); grid.append(cell); }
  section.append(grid);
  const effective = await loadEffectivePlanState(today, { repo: state.repo });
  if (effective.continuation.action === 'auto_extend' && !state.planUi.autoExtending) { state.planUi.autoExtending = true; try { const autoPreview = await createExtensionPreview(effective.latestPlan.planInstanceId, { seed: seedValue('auto-extend', effective.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (autoPreview.status !== 'success') throw new Error(planFailure(state, autoPreview.failure)); await commitGeneratedPreview(autoPreview, { repo: state.repo, registry: state.registry }); state.planUi.autoExtendError = null; } catch (error) { state.planUi.autoExtendError = error.message || String(error); } finally { state.planUi.autoExtending = false; state.render(); } return; }
  if (state.planUi.autoExtendError) section.append(element('div', { className: 'validation-box validation-box--error', text: state.planUi.autoExtendError }));
  if (effective.continuation.state === 'ended' || effective.continuation.state === 'extension_window') { const cta = element('section', { className: 'plan-action-card' }, [element('h2', { text: t(state, effective.continuation.state === 'ended' ? 'plan.ended.title' : 'plan.extend.title') }), element('p', { className: 'muted', text: t(state, effective.continuation.state === 'ended' ? 'plan.ended.body' : 'plan.extend.body') })]); if (effective.continuation.action && effective.continuation.action !== 'auto_extend') cta.append(element('button', { className: 'button', text: t(state, 'plan.extend.preview'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; const extension = await createExtensionPreview(effective.latestPlan.planInstanceId, { seed: seedValue('extend', effective.latestPlan.endDate) }, { repo: state.repo, registry: state.registry }); if (extension.status !== 'success') throw new Error(planFailure(state, extension.failure)); state.planUi.planPreview = await addRecipeLabels(state, extension); state.render(); } catch (error) { alert(error.message || error); button.disabled = false; } } })); section.append(cta); }
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
      seed: seedValue(mode === 'alternative' ? 'regenerate' : 'recalculate', startDate),
      mode
    }, { repo: state.repo, registry: state.registry });
    if (preview.status !== 'success') throw new Error(planFailure(state, preview.failure));
    state.planUi.rebalancePreview = await addRecipeLabels(state, preview);
    state.render();
  } catch (error) {
    if (status) status.error(error); else alert(error.message || error);
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
      } catch (error) { alert(error.message || error); button.disabled = false; }
    }
  }));
  return card;
}

export function calendarPage(state) { state.planUi ||= {}; const section = page(state, 'page.calendar.title', 'plan.calendar.loading', 'CALENDAR'); void calendarBody(state, section).catch(error => section.append(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section; }

async function manageDayBody(state, section) {
  const date = new URLSearchParams(location.search).get('date') || civilDateInTimeZone(state.config.timeZone); const result = await loadCalendarRange(date, date, { repo: state.repo }); const day = result.days[0]; section.replaceChildren(); section.append(element('p', { className: 'eyebrow', text: 'DAY' }), element('h1', { text: `${t(state, 'plan.manageDay')} · ${localDateLabel(state, date)}` }), element('div', { className: 'page-actions' }, [element('a', { href: `/calendar?month=${date.slice(0, 7)}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'common.back') }), element('a', { href: '/history', 'data-route': '', className: 'button button--secondary', text: t(state, 'plan.history.title') })])); if (!day) { section.append(element('div', { className: 'empty-state', text: t(state, 'plan.dayMissing') })); return; }
  const ids = [...new Set(day.mealSlots.flatMap(slot => slot.recipeComponents.map(component => component.recipeVersionId)))]; const rows = await state.repo.getMany('recipeVersions', ids); const recipeMap = new Map(rows.map(recipe => [recipe.recipeVersionId, recipe])); const rerender = async () => state.render();
  const dc = dayClass(state, day.dayClassId); section.append(element('div', { className: 'day-heading-card' }, [element('span', { className: 'day-swatch day-swatch--large', style: `background:${dc?.color || '#888'}` }), element('div', {}, [element('strong', { text: `${dc?.name || day.dayClassId} · ${t(state, 'plan.cycleDay', { day: day.cycleDay })}` }), element('span', { className: 'muted', text: t(state, `plan.dayStatus.${day.status}`) })])]), nutritionPanel(state, day));
  const list = element('div', { className: 'meal-list' }); for (const slot of day.mealSlots) { const card = mealCard(state, day, slot, slot.recipeComponents.map(component => recipeMap.get(component.recipeVersionId)).filter(Boolean), { manage: true, rerender }); if (slot.mode === 'planned') card.append(element('button', { className: 'button button--secondary button--small', 'data-testid': 'plan-replace', text: t(state, 'plan.replace'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; state.planUi.replacePreview = await createReplacementPreview({ planInstanceId: day.planInstanceId, calendarDayId: day.calendarDayId, mealOccurrenceId: slot.mealOccurrenceId, seed: seedValue('replace', date) }, { repo: state.repo, registry: state.registry }); state.render(); } catch (error) { alert(error.message || error); button.disabled = false; } } })); list.append(card); } section.append(list);
  const dayActions = element('section', { className: 'plan-action-card' }, [
    element('h2', { text: t(state, 'plan.rebalance.dayTitle') }),
    element('p', { className: 'muted', text: t(state, 'plan.rebalance.dayBody') })
  ]);
  dayActions.append(element('div', { className: 'page-actions' }, [
    element('button', { className: 'button', 'data-testid': 'rebalance-day-preview', text: t(state, 'plan.rebalance.preview'), onClick: event => requestRebalancePreview(state, { planInstanceId: day.planInstanceId, startDate: date, endDate: date, mode: 'alternative', button: event.currentTarget }) }),
    element('button', { className: 'button button--secondary', 'data-testid': 'recalculate-day-preview', text: t(state, 'plan.rebalance.recalculate'), onClick: event => requestRebalancePreview(state, { planInstanceId: day.planInstanceId, startDate: date, endDate: date, mode: 'recalculate', button: event.currentTarget }) })
  ]));
  section.append(dayActions);
  if (state.planUi.replacePreview?.calendarDayId === day.calendarDayId) section.append(replacementPreviewCard(state, state.planUi.replacePreview)); if (state.planUi.rebalancePreview?.sourcePlanInstanceId === day.planInstanceId) section.append(rebalancePreviewCard(state, state.planUi.rebalancePreview));
}

function replacementPreviewCard(state, preview) {
  const card = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'replacement-preview' }); card.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'plan.replace.previewTitle') }), element('p', { className: 'muted', text: t(state, 'plan.replace.previewBody') })]), element('button', { className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: () => { state.planUi.replacePreview = null; state.render(); } })])); const list = element('div', { className: 'replacement-list' }); for (const item of preview.candidates) list.append(element('article', { className: 'replacement-card' }, [element('div', {}, [element('strong', { text: localeTitle(state, item.recipe) }), recipePills(state, item.recipe), element('span', { className: 'muted', text: t(state, 'plan.score', { score: Math.round(item.score.total * 100) / 100 }) })]), element('button', { className: 'button button--small', 'data-testid': 'replacement-confirm', text: t(state, 'plan.replace.confirm'), onClick: async event => { const button = event.currentTarget; try { button.disabled = true; await commitReplacement({ planInstanceId: preview.planInstanceId, calendarDayId: preview.calendarDayId, mealOccurrenceId: preview.mealOccurrenceId, recipeVersionId: item.recipe.recipeVersionId }, { repo: state.repo, registry: state.registry }); state.planUi.replacePreview = null; state.render(); } catch (error) { alert(error.message || error); button.disabled = false; } } })])); card.append(list); return card;
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
