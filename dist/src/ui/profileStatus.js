import { element } from './dom.js';
import { sha256Json } from '../lib/crypto.js';
export function profileStatus(state) {
  const root = element('aside', { className: 'validation-box', role: 'status' });
  const it = state.i18n.locale === 'it';
  root.append(element('a', { href: '/onboarding', 'data-route': '', text: it ? 'Configura o riprendi il profilo' : 'Set up or resume your profile' }));
  void (async () => {
    const declaration = await state.repo.getMeta('profileDeclaration:R4');
    const profile = state.configuration.allergyIntoleranceProfiles.find(p => p.id === state.config.allergyIntoleranceProfileId);
    const valid = declaration?.safetyProfileDigest === await sha256Json(profile || null);
    const safety = valid ? declaration.safety : 'unverified';
    root.prepend(element('p', { text: safety === 'none_declared' ? (it ? 'Hai dichiarato nessuna allergia o intolleranza.' : 'You declared no allergy or intolerance.') : safety === 'rules_declared' ? (it ? 'Esclusioni personali dichiarate.' : 'Personal exclusions declared.') : (it ? 'Profilo di sicurezza non ancora verificato.' : 'Safety profile not yet reviewed.') }));
    if (!declaration || declaration.goals === 'demonstration') root.append(element('p', { text: it ? 'Obiettivi dimostrativi: personalizzali prima di usarli come riferimento.' : 'Demonstration goals: customize before using as a reference.' }));
  })().catch(error => { root.append(element('p', { text: it ? 'Stato del profilo non disponibile. Riprova dalla configurazione.' : 'Profile status unavailable. Retry from settings.' })); });
  return root;
}
