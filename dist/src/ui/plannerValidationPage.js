import { element } from './dom.js';
import { controlledDetails } from './uiState.js';
import { civilDateInTimeZone } from '../services/effectivePlanService.js';
import { runPlannerValidationCase, runPlannerDeterminismCheck, runPlannerEnergySweep } from '../services/plannerValidationService.js';
import { plannerConstraintPolicySnapshot } from '../planner/constraintPolicy.js';
import { PLANNER_VALIDATION_ALLERGENS, PLANNER_VALIDATION_PROFILES, PLANNER_VALIDATION_TARGETS, PLANNER_VALIDATION_TOLERANCES } from '../planner/validationProfiles.js';

function t(state, key, vars = {}) { let value = state.i18n.t(key); for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, String(replacement)); return value; }
function fmt(value, digits = 1) { if (value == null || Number.isNaN(Number(value))) return '—'; return new Intl.NumberFormat(stateLocale, { maximumFractionDigits: digits }).format(Number(value)); }
let stateLocale = 'it';

function initialControls(state) {
  return { targetKcal: 2000, tolerancePct: 2, days: 7, startDate: civilDateInTimeZone(state.config.timeZone), seed: 'phase-c-manual-1', profileId: 'current', hardAllergenId: '' };
}

function setRunning(state, value) { state.plannerValidationUi.running = value; state.render(); }
function inputField(label, input) { return element('label', { className: 'field' }, [element('span', { text: label }), input]); }
function select(values, selected, labelFor, onChange) {
  const node = element('select', { onChange: event => onChange(event.currentTarget.value) });
  for (const value of values) node.append(element('option', { value, text: labelFor(value) }));
  node.value = String(selected); return node;
}
function metric(label, value, testid = null) { return element('div', { className: 'metric', 'data-testid': testid }, [element('span', { text: label }), element('strong', { text: String(value) })]); }
function statusChip(text, ok = null) { return element('span', { className: `status-chip${ok === true ? ' status-chip--followed' : ok === false ? ' status-chip--not_followed' : ''}`, text }); }
function rangeText(range) { return range?.minKcal == null ? '—' : `${Math.round(range.minKcal)}–${Math.round(range.maxKcal)} kcal`; }

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const anchor = element('a', { href: url, download: filename }); document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function constraintPolicyPanel(state) {
  const policy = plannerConstraintPolicySnapshot();
  const renderGroup = (title, rows) => element('section', { className: 'validation-policy-group' }, [
    element('h3', { text: title }),
    element('div', { className: 'validation-policy-list' }, rows.map(item => element('article', { className: 'validation-policy-item' }, [
      element('strong', { text: item.id }), element('span', { className: 'muted', text: item.source }), element('code', { text: item.enforcement })
    ])))
  ]);
  return controlledDetails(state, 'phase-c-policy', { className: 'plan-action-card', children: [
    element('summary', { text: t(state, 'planner.validation.policy.title') }),
    element('p', { className: 'muted', text: t(state, 'planner.validation.policy.body') }),
    element('div', { className: 'validation-policy-grid' }, [renderGroup(t(state, 'planner.validation.hard'), policy.hard), renderGroup(t(state, 'planner.validation.soft'), policy.soft)])
  ] });
}

function rejectionPanel(state, rejections) {
  const entries = Object.entries(rejections || {});
  if (!entries.length) return element('p', { className: 'muted', text: t(state, 'planner.validation.noRejections') });
  return element('div', { className: 'validation-rejections' }, entries.map(([key, value]) => element('div', {}, [element('code', { text: key }), element('strong', { text: value })])));
}

function slotDiagnosticCard(state, slot, selectedByVersion) {
  const selected = (slot.selectedRecipeVersionIds || []).map(id => selectedByVersion.get(id)).filter(Boolean);
  const card = element('article', { className: 'validation-slot-card' });
  card.append(element('div', { className: 'section-heading' }, [
    element('div', {}, [element('strong', { text: `${slot.mealArchetype || slot.mealClassId} · ${Math.round(slot.targetEnergyKcal || 0)} kcal` }), element('span', { className: 'muted', text: `${slot.sourceCandidateCount || 0} → ${slot.acceptedCandidateCount || 0} → ${slot.candidateFrontierCount || 0} → ${slot.optionCount || 0}` })]),
    statusChip(selected.length ? t(state, 'planner.validation.selected') : t(state, 'planner.validation.notSelected'), selected.length ? true : null)
  ]));
  card.append(element('div', { className: 'validation-range-grid' }, [
    metric(t(state, 'planner.validation.range.source'), rangeText(slot.sourceEnergyRange)),
    metric(t(state, 'planner.validation.range.accepted'), rangeText(slot.acceptedEnergyRange)),
    metric(t(state, 'planner.validation.range.frontier'), rangeText(slot.frontierEnergyRange)),
    metric(t(state, 'planner.validation.range.options'), rangeText(slot.optionEnergyRange))
  ]));
  if (selected.length) card.append(element('div', { className: 'validation-selected-list' }, selected.map(recipe => element('div', {}, [element('strong', { text: recipe.title }), element('span', { className: 'muted', text: `${Math.round(recipe.energyKcal)} kcal · ${recipe.recipeVersionId}` })]))));
  card.append(controlledDetails(state, `phase-c-rejections-${slot.slotId}`, { children: [element('summary', { text: t(state, 'planner.validation.hardRejections') }), rejectionPanel(state, slot.hardRejectionCounts)] }));
  if (slot.topSoftCandidates?.length) card.append(controlledDetails(state, `phase-c-soft-${slot.slotId}`, { children: [
    element('summary', { text: t(state, 'planner.validation.topSoft') }),
    element('div', { className: 'validation-soft-list' }, slot.topSoftCandidates.map(item => element('div', {}, [element('code', { text: `#${item.rank} ${item.recipeVersionId}` }), element('span', { text: `${Math.round(item.energyKcal)} kcal · score ${Math.round(item.score * 100) / 100}` }), element('span', { className: 'muted', text: Object.entries(item.scoreComponents || {}).map(([key, value]) => `${key}=${Math.round(Number(value) * 100) / 100}`).join(' · ') })])))
  ] }));
  return card;
}

function dayDiagnosticCard(state, day, selectedByVersion) {
  const energy = day.energyConstraint || {};
  const card = element('article', { className: 'validation-day-card' });
  card.append(element('div', { className: 'section-heading' }, [
    element('div', {}, [element('h3', { text: day.date }), element('span', { className: 'muted', text: `${Math.round(energy.budgetedTotalKcal || 0)} kcal · ${Math.round(energy.dailyMinKcal || 0)}–${Math.round(energy.dailyMaxKcal || 0)}` })]),
    statusChip(energy.withinTolerance ? 'HARD PASS' : 'HARD FAIL', energy.withinTolerance === true)
  ]));
  card.append(element('div', { className: 'validation-day-metrics' }, [
    metric(t(state, 'planner.validation.target'), `${Math.round(energy.targetKcal || day.energyTarget || 0)} kcal`),
    metric(t(state, 'planner.validation.total'), `${Math.round(energy.budgetedTotalKcal || 0)} kcal`),
    metric(t(state, 'planner.validation.deviation'), `${Math.round(Number(energy.deviationPct || 0) * 10) / 10}%`),
    metric(t(state, 'planner.validation.objective'), Math.round(Number(day.score || 0) * 100) / 100)
  ]));
  const selectedMeals = day.selectedMeals || [];
  if (selectedMeals.length) card.append(controlledDetails(state, `phase-c-selected-${day.date}`, { children: [
    element('summary', { text: t(state, 'planner.validation.selectedScores') }),
    element('div', { className: 'validation-soft-list' }, selectedMeals.map(item => {
      const recipe = selectedByVersion.get(item.recipeVersionId);
      return element('div', {}, [element('strong', { text: recipe?.title || item.recipeVersionId }), element('span', { text: `soft rank ${item.softRank ?? '—'} · frontier ${item.frontierRank ?? '—'} · score ${Math.round(Number(item.score || 0) * 100) / 100}` }), element('span', { className: 'muted', text: Object.entries(item.scoreComponents || {}).map(([key, value]) => `${key}=${Math.round(Number(value) * 100) / 100}`).join(' · ') })]);
    }))
  ] }));
  const slots = element('div', { className: 'validation-slot-list' }, (day.slotDiagnostics || []).map(slot => slotDiagnosticCard(state, slot, selectedByVersion)));
  card.append(slots); return card;
}

function failurePanel(state, result) {
  const failure = result.failure || {};
  const panel = element('section', { className: 'validation-box validation-box--error', 'data-testid': 'planner-validation-failure' });
  panel.append(element('strong', { text: `${failure.code || 'failed'}${failure.constraintId ? ` · ${failure.constraintId}` : ''}` }));
  if (failure.reason) panel.append(element('p', { text: failure.reason }));
  if (failure.energy) panel.append(element('p', { text: `${Math.round(failure.energy.targetKcal || 0)} kcal · ${Math.round(failure.energy.dailyMinKcal || 0)}–${Math.round(failure.energy.dailyMaxKcal || 0)} kcal` }));
  if (failure.search) panel.append(element('code', { text: JSON.stringify(failure.search) }));
  panel.append(element('h3', { text: t(state, 'planner.validation.rejections') }), rejectionPanel(state, result.rejectionCounts));
  const slotDiagnostics = failure.slotDiagnostics || [];
  if (slotDiagnostics.length) panel.append(element('div', { className: 'validation-slot-list' }, slotDiagnostics.map(slot => slotDiagnosticCard(state, slot, new Map()))));
  return panel;
}

function caseResultPanel(state, result) {
  if (!result) return null;
  const selectedByVersion = new Map(result.selection.recipes.map(recipe => [recipe.recipeVersionId, recipe]));
  const section = element('section', { className: 'plan-action-card plan-action-card--accent', 'data-testid': 'planner-validation-result' });
  const expectedText = result.expectedOutcome === 'failed' ? t(state, 'planner.validation.expectedFailure') : t(state, 'planner.validation.observation');
  section.append(element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'planner.validation.result.title') }), element('span', { className: 'muted', text: expectedText })]), statusChip(result.actualOutcome.toUpperCase(), result.actualOutcome === 'success' ? true : result.expectationMet ? null : false)]));
  section.append(element('div', { className: 'validation-summary-grid' }, [
    metric(t(state, 'planner.validation.runtime'), `${result.durationMs} ms`),
    metric(t(state, 'planner.validation.uniqueRecipes'), result.selection.uniqueRecipeCount),
    metric(t(state, 'planner.validation.uniqueIngredients'), result.selection.uniqueIngredientCount),
    metric(t(state, 'planner.validation.uniqueRecipeRate'), result.quality ? `${Math.round(result.quality.uniqueRecipeRate * 100)}%` : '—'),
    metric(t(state, 'planner.validation.repeat3d'), result.quality?.exactRepeatPairsWithin3Days ?? '—'),
    metric(t(state, 'planner.validation.repeat7d'), result.quality?.exactRepeatPairsWithin7Days ?? '—'),
    metric(t(state, 'planner.validation.primaryRepeat3d'), result.quality?.samePrimaryPairsWithin3Days ?? '—'),
    metric(t(state, 'planner.validation.energyHard'), result.actualOutcome === 'success' && result.energy.allWithinTolerance ? 'PASS' : result.actualOutcome === 'failed' ? 'N/A' : 'FAIL'),
    metric(t(state, 'planner.validation.fixedServings'), result.servingsFixed ? 'PASS' : 'FAIL'),
    metric(t(state, 'planner.validation.signature'), result.signature.slice(0, 12))
  ]));
  if (result.actualOutcome === 'failed') section.append(failurePanel(state, result));
  else {
    section.append(element('div', { className: 'validation-day-list' }, (result.diagnostics.days || []).map(day => dayDiagnosticCard(state, day, selectedByVersion))));
    section.append(controlledDetails(state, 'phase-c-case-rejections', { children: [element('summary', { text: t(state, 'planner.validation.aggregateRejections') }), rejectionPanel(state, result.rejectionCounts)] }));
  }
  section.append(element('div', { className: 'page-actions' }, [element('button', { className: 'button button--secondary button--small', text: t(state, 'planner.validation.export'), onClick: () => downloadJson(result, `planner-validation-${result.options.targetKcal}-${result.options.tolerancePct}.json`) })]));
  section.append(controlledDetails(state, 'phase-c-raw', { children: [element('summary', { text: t(state, 'planner.validation.raw') }), element('pre', { className: 'validation-json', text: JSON.stringify({ options: result.options, actualOutcome: result.actualOutcome, energy: result.energy, quality: result.quality, rejectionCounts: result.rejectionCounts, diagnostics: result.diagnostics, failure: result.failure }, null, 2) })] }));
  return section;
}

function determinismPanel(state, result) {
  if (!result) return null;
  return element('section', { className: 'plan-action-card', 'data-testid': 'planner-validation-determinism-result' }, [
    element('div', { className: 'section-heading' }, [element('h2', { text: t(state, 'planner.validation.determinism.title') }), statusChip(result.deterministic ? 'PASS' : 'FAIL', result.deterministic)]),
    element('p', { text: t(state, result.deterministic ? 'planner.validation.determinism.pass' : 'planner.validation.determinism.fail') }),
    element('code', { text: `${result.first.signature.slice(0, 16)} / ${result.second.signature.slice(0, 16)}` })
  ]);
}

function sweepPanel(state, sweep) {
  if (!sweep) return null;
  const byKey = new Map(sweep.rows.map(row => [`${row.targetKcal}:${row.tolerancePct}`, row]));
  const table = element('div', { className: 'validation-sweep-table' });
  table.append(element('div', { className: 'validation-sweep-row validation-sweep-row--head' }, [element('strong', { text: 'kcal' }), ...PLANNER_VALIDATION_TOLERANCES.map(tol => element('strong', { text: `±${tol}%` }))]));
  for (const target of PLANNER_VALIDATION_TARGETS) table.append(element('div', { className: 'validation-sweep-row' }, [
    element('strong', { text: target }),
    ...PLANNER_VALIDATION_TOLERANCES.map(tol => {
      const row = byKey.get(`${target}:${tol}`); const pass = row?.status === 'success' && row.energyWithinTolerance;
      return element('span', { className: `status-chip ${pass ? 'status-chip--followed' : 'status-chip--not_followed'}`, title: row?.failureCode || '', text: pass ? `PASS · ${Math.round(row.durationMs)}ms` : `FAIL · ${row?.failureCode || 'unknown'}` });
    })
  ]));
  return element('section', { className: 'plan-action-card', 'data-testid': 'planner-validation-sweep-result' }, [
    element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'planner.validation.sweep.title') }), element('p', { className: 'muted', text: t(state, 'planner.validation.sweep.body') })]), statusChip(sweep.allFeasible ? '30/30' : `${sweep.rows.filter(row => row.status === 'success' && row.energyWithinTolerance).length}/30`, sweep.allFeasible)]),
    table, element('p', { className: 'muted', text: t(state, 'planner.validation.sweep.runtime', { ms: Math.round(sweep.totalDurationMs) }) })
  ]);
}

function profileDescription(state, profileId) {
  return element('div', { className: 'validation-profile-description' }, [element('strong', { text: t(state, `planner.validation.profile.${profileId}.title`) }), element('p', { className: 'muted', text: t(state, `planner.validation.profile.${profileId}.body`) })]);
}

export function plannerValidationPage(state) {
  stateLocale = state.i18n.locale;
  state.plannerValidationUi ||= { controls: initialControls(state), running: false, caseResult: null, determinism: null, sweep: null };
  const ui = state.plannerValidationUi; const c = ui.controls;
  const section = element('section', { className: 'page-card page-card--wide plan-page planner-validation-page' });
  section.append(element('p', { className: 'eyebrow', text: 'PLANNER LAB' }), element('h1', { text: t(state, 'planner.validation.title') }), element('p', { className: 'lead', text: t(state, 'planner.validation.body') }));
  section.append(element('div', { className: 'validation-box' }, [element('strong', { text: t(state, 'planner.validation.noCommit.title') }), element('span', { text: t(state, 'planner.validation.noCommit.body') })]));
  section.append(element('div', { className: 'page-actions' }, [
    element('a', { href: '/configure/nutrition', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'planner.validation.link.nutrition') }),
    element('a', { href: '/configure/safety', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'planner.validation.link.safety') }),
    element('a', { href: '/configure/preferences', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'planner.validation.link.preferences') }),
    element('a', { href: '/configure/meals', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'planner.validation.link.meals') }),
    element('a', { href: '/configure/days', 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'planner.validation.link.days') })
  ]));

  const controls = element('section', { className: 'plan-action-card', 'data-testid': 'planner-validation-controls' });
  controls.append(element('h2', { text: t(state, 'planner.validation.controls.title') }));
  const grid = element('div', { className: 'validation-control-grid' });
  grid.append(
    inputField(t(state, 'planner.validation.target'), element('input', { type: 'number', min: 800, max: 2600, step: 100, value: c.targetKcal, onInput: e => { c.targetKcal = Number(e.currentTarget.value); } })),
    inputField(t(state, 'planner.validation.tolerance'), select(PLANNER_VALIDATION_TOLERANCES, c.tolerancePct, value => `±${value}%`, value => { c.tolerancePct = Number(value); })),
    inputField(t(state, 'planner.validation.days'), select([1, 3, 7, 14], c.days, value => String(value), value => { c.days = Number(value); })),
    inputField(t(state, 'planner.validation.startDate'), element('input', { type: 'date', value: c.startDate, onInput: e => { c.startDate = e.currentTarget.value; } })),
    inputField(t(state, 'planner.validation.seed'), element('input', { type: 'text', value: c.seed, onInput: e => { c.seed = e.currentTarget.value; } })),
    inputField(t(state, 'planner.validation.profile'), select(PLANNER_VALIDATION_PROFILES.map(item => item.id), c.profileId, value => t(state, `planner.validation.profile.${value}.title`), value => { c.profileId = value; state.render(); })),
    inputField(t(state, 'planner.validation.allergen'), select(['', ...PLANNER_VALIDATION_ALLERGENS], c.hardAllergenId, value => value ? t(state, `allergen.${value}`) : t(state, 'planner.validation.none'), value => { c.hardAllergenId = value; }))
  );
  controls.append(grid, profileDescription(state, c.profileId));

  const execute = async (kind) => {
    if (ui.running) return;
    try {
      setRunning(state, true);
      const options = { ...c };
      if (kind === 'case') ui.caseResult = await runPlannerValidationCase(options, { repo: state.repo, registry: state.registry, locale: state.i18n.locale });
      if (kind === 'determinism') ui.determinism = await runPlannerDeterminismCheck(options, { repo: state.repo, registry: state.registry, locale: state.i18n.locale });
      if (kind === 'sweep') ui.sweep = await runPlannerEnergySweep({ ...options, profileId: 'current', hardAllergenId: null }, { repo: state.repo, registry: state.registry, locale: state.i18n.locale });
    } catch (error) { state.notify?.('error', error.message || String(error)); }
    finally { ui.running = false; state.render(); }
  };
  controls.append(element('div', { className: 'page-actions' }, [
    element('button', { className: 'button', disabled: ui.running, 'data-testid': 'planner-validation-run', text: ui.running ? t(state, 'planner.validation.running') : t(state, 'planner.validation.run'), onClick: () => execute('case') }),
    element('button', { className: 'button button--secondary', disabled: ui.running, 'data-testid': 'planner-validation-determinism', text: t(state, 'planner.validation.determinism.run'), onClick: () => execute('determinism') }),
    element('button', { className: 'button button--secondary', disabled: ui.running, 'data-testid': 'planner-validation-sweep', text: t(state, 'planner.validation.sweep.run'), onClick: () => execute('sweep') })
  ]));
  section.append(controls, constraintPolicyPanel(state));
  const casePanel = caseResultPanel(state, ui.caseResult); if (casePanel) section.append(casePanel);
  const determinism = determinismPanel(state, ui.determinism); if (determinism) section.append(determinism);
  const sweep = sweepPanel(state, ui.sweep); if (sweep) section.append(sweep);
  return section;
}
