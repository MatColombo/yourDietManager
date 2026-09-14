import { controlledDetails } from './uiState.js';
import { element } from './dom.js';
import { loadPlanPolicyContext } from '../services/planPolicyValidation.js';
import { evaluateFrequencies } from '../domain/frequencyCounter.js';
const say = (s, it, en) => s.i18n.locale === 'it' ? it : en;
export function frequencySummary(state, result) {
  const root = controlledDetails(state, 'frequency-summary', { className: 'frequency-summary', children: [element('summary', { text: say(state, 'Frequenze del piano', 'Plan frequencies') })] });
  const table = element('table'); const head = element('tr');
  for (const text of [say(state, 'Alimento / regola', 'Food / rule'), say(state, 'Intervallo', 'Interval'), say(state, 'Presenze', 'Occurrences'), 'Min / '+say(state,'ideale','ideal')+' / Max', say(state, 'Stato', 'Status')]) head.append(element('th', { scope: 'col', text }));
  table.append(element('thead', {}, [head])); const body = element('tbody');
  for (const window of result?.windows || []) {
    const target = state.referenceDataIndex?.term(window.target.id); const label = target?.i18n?.[state.i18n.locale]?.label || state.foodGroups?.find(g => g.id === window.target.id)?.name || window.ruleId;
    const states = { satisfied: ['Rispettata', 'Satisfied'], violated: ['Violata', 'Violated'], pending: [`In attesa; prima valutazione ${window.firstEvaluableDate}`, `Pending; first evaluation ${window.firstEvaluableDate}`], not_evaluable: ['Non valutabile', 'Not evaluable'] };
    const row = element('tr'); for (const text of [label, `${window.interval.startDate} → ${window.interval.endDate}`, `${window.count} ${say(state, window.countUnit === 'day' ? 'giorni' : 'pasti', window.countUnit === 'day' ? 'days' : 'meals')} · ${window.unknownExternalMeals} ${say(state, 'esterni sconosciuti', 'unknown external')}`, `${window.min ?? '—'} / ${window.ideal ?? '—'} / ${window.max ?? '—'}`, say(state, ...(states[window.state] || states.not_evaluable))]) row.append(element('td', { text }));
    const detail = controlledDetails(state, `frequency:${window.ruleId}:${window.interval.endDate}`, { children: [element('summary', { text: say(state, 'Pasti conteggiati', 'Counted meals') })] }); for (const meal of window.contributingMeals) detail.append(element('a', { href: `/calendar/day?date=${meal.civilDate}#meal-${meal.mealOccurrenceId}`, 'data-route': '', text: `${meal.civilDate} · ${state.configuration.mealClasses.find(m => m.id === meal.mealClassId)?.name || meal.mealClassId} ` })); row.lastChild.append(detail); body.append(row);
  }
  table.append(body); root.append(table); return root;
}
export async function currentFrequencySummary(state, days, endDate) { const context = await loadPlanPolicyContext(state.repo, { days }); return frequencySummary(state, evaluateFrequencies({ profile: context.active.foodPreferences, calendarDays: context.calendarDays, recipesByVersion: context.recipesByVersion, revisionById: context.revisionById, foodGroups: context.foodGroups, endDates: [endDate] })); }
