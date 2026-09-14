import { controlledDetails } from './uiState.js';
import { element } from './dom.js';
import { ruleTargetPicker } from './configurationRulesV2Ui.js';
import { saveFoodGroup, currentFoodGroups } from '../services/revisionV2Service.js';
import { ingredientProjection } from '../services/ingredientConceptQuery.js';
import { makeId } from '../domain/configurationRules.js';
const say = (s, it, en) => s.i18n.locale === 'it' ? it : en;
export function foodGroupEditor(state, onSaved = null) {
  const root = controlledDetails(state, 'food-groups', { children: [element('summary', { text: say(state, 'Gestisci gruppi di alimenti', 'Manage food groups') })] });
  const body = element('div'); root.append(body); let draft = null;
  const button = (label, action) => element('button', { type: 'button', className: 'button button--secondary button--small', text: label, onClick: action });
  function render() {
    body.replaceChildren();
    for (const group of state.foodGroups || []) body.append(button(`${group.name} (${group.members.length})`, () => { draft = structuredClone(group); draft.version++; draft.origin = 'user'; render(); }));
    body.append(button(say(state, 'Nuovo gruppo', 'New group'), () => { const now = new Date().toISOString(); draft = { schemaVersion: 1, id: makeId('group'), name: '', members: [], version: 1, origin: 'user', status: 'active', createdAt: now, updatedAt: now }; render(); }));
    if (!draft) return;
    const label = element('label', { className: 'field' }, [element('span', { text: say(state, 'Nome del gruppo', 'Group name') }), element('input', { type: 'text', value: draft.name, maxLength: 80, onInput: e => { draft.name = e.target.value; } })]); body.append(label);
    for (const member of draft.members) body.append(element('div', { className: 'rule-card' }, [ruleTargetPicker(state, member, () => {}), button(say(state, 'Rimuovi', 'Remove'), () => { draft.members = draft.members.filter(m => m !== member); render(); })]));
    body.append(button(say(state, 'Aggiungi alimento o famiglia', 'Add food or family'), () => { draft.members.push({ type: 'productFood', id: '' }); render(); }), button(say(state, 'Aggiungi forma specifica', 'Add specific form'), () => { draft.members.push({ type: 'ingredient', id: '' }); render(); }));
    const impact = element('div', { 'aria-live': 'polite' });
    body.append(button(say(state, 'Verifica impatto', 'Review impact'), async () => {
      const rules = [...state.configuration.foodPreferences, ...state.configuration.allergyIntoleranceProfiles].flatMap(p => p.rules).filter(r => r.target?.type === 'foodGroup' && r.target.id === draft.id);
      const count = (await state.repo.getAll('calendarDays')).length;
      impact.replaceChildren(element('p', { text: say(state, `${rules.length} regole referenziano questo gruppo; ${count} giornate conservate saranno rivalutate alla lettura. Le versioni precedenti restano conservate. Salva applica la nuova composizione alle regole correnti.`, `${rules.length} rules reference this group; ${count} stored days will be reassessed when read. Previous versions remain stored. Save applies membership to current rules.`) }));
      const reviewed = JSON.stringify(draft);
      impact.append(button(say(state, 'Salva questa versione', 'Save this version'), async () => { try { if (JSON.stringify(draft) !== reviewed) throw new Error(say(state, 'Il gruppo è cambiato: verifica nuovamente.', 'Group changed: review again.')); draft.updatedAt = new Date().toISOString(); await saveFoodGroup(draft, { repo: state.repo, registry: state.registry }); state.foodGroups = await currentFoodGroups({ repo: state.repo }); state.ingredientProjection = await ingredientProjection(state.repo); draft = null; render(); onSaved?.(); } catch (error) { impact.append(element('p', { role: 'alert', text: error.message })); } }));
    }), impact);
  }
  render(); return root;
}
