export const MANUAL_ACCEPTANCE_STORAGE_KEY = 'ydm:manual-acceptance:v1';
export const MANUAL_ACCEPTANCE_SCHEMA_VERSION = 1;

export const MANUAL_ACCEPTANCE_CASES = Object.freeze([
  { id:'energy-800', group:'energy', required:true, title:'800 kcal strict day', hint:'Generate at 800 kcal with ±2%; every generated day must remain inside the hard window.' },
  { id:'energy-1400', group:'energy', required:true, title:'1400 kcal strict day', hint:'Generate at 1400 kcal with ±2%; inspect variety and hard energy status.' },
  { id:'energy-2000', group:'energy', required:true, title:'2000 kcal strict day', hint:'Generate a normal 7-day plan at ±2% and inspect meal quality.' },
  { id:'energy-2600', group:'energy', required:true, title:'2600 kcal strict day', hint:'Generate at 2600 kcal with ±2%; verify the solver does not scale recipe servings.' },
  { id:'hard-allergen', group:'hard', required:true, title:'Allergen exclusion', hint:'Add a hard allergen and verify no selected recipe contains it, including Replace/Rebalance.' },
  { id:'hard-intolerance', group:'hard', required:true, title:'Intolerance exclusion', hint:'Test an intolerance path independently from allergens.' },
  { id:'hard-capability', group:'hard', required:true, title:'Day capability', hint:'Use cooking=false and confirm recipes requiring cooking are absent.' },
  { id:'hard-forbid', group:'hard', required:true, title:'Forbid rule', hint:'Test a product-food or numeric forbid and verify it is never violated.' },
  { id:'soft-preference', group:'soft', required:true, title:'Prefer / avoid ranking', hint:'Apply a preference and an avoid rule; candidates must remain eligible while ranking changes.' },
  { id:'soft-nutrition', group:'soft', required:true, title:'Protein / fibre soft target', hint:'Raise protein or fibre priority and verify ranking changes without becoming a hard filter.' },
  { id:'regenerate-alternative', group:'regeneration', required:true, title:'Propose alternative', hint:'Regenerate selected dates; recipes should change when a strict alternative is feasible.' },
  { id:'regenerate-fallback', group:'regeneration', required:true, title:'Alternative fallback reason', hint:'Create a constrained case where some slots cannot change; unchanged slots must have an explicit bounded-search reason.' },
  { id:'taxonomy-noodles', group:'discovery', required:true, title:'Noodles concept', hint:'Search/select the Noodles concept once; technical raw/cooked/enriched variants must be grouped.' },
  { id:'taxonomy-dairy', group:'discovery', required:true, title:'Dairy category', hint:'Filter ingredients and recipes by Dairy/Latticini and inspect results.' },
  { id:'context-drilldown', group:'navigation', required:true, title:'Day → Recipe → Ingredient', hint:'Open a recipe directly from a day, then an ingredient, then return to the exact meal slot.' },
  { id:'replace-rebalance', group:'operations', required:true, title:'Replace + rebalance', hint:'Replace a meal and rebalance; hard energy/safety constraints must remain valid.' },
  { id:'shopping', group:'operations', required:true, title:'Shopping derivation', hint:'Confirm shopping aggregation, external exclusion, checklist persistence and stale state after effective-plan changes.' },
  { id:'reload', group:'persistence', required:true, title:'Reload persistence', hint:'Reload after plan operations and verify plan, configuration and checklist remain coherent.' }
]);

export function newManualAcceptanceSession({ appVersion='', catalogVersion='', now=()=>new Date().toISOString() }={}) {
  return {
    schemaVersion: MANUAL_ACCEPTANCE_SCHEMA_VERSION,
    createdAt: now(), updatedAt: now(), appVersion, catalogVersion,
    decision: 'pending', decisionNote: '',
    cases: Object.fromEntries(MANUAL_ACCEPTANCE_CASES.map(item => [item.id, { status:'pending', severity:null, notes:'', evidence:'' }]))
  };
}

export function normalizeManualAcceptanceSession(value, meta={}) {
  const base = newManualAcceptanceSession(meta);
  if (!value || value.schemaVersion !== MANUAL_ACCEPTANCE_SCHEMA_VERSION) return base;
  base.createdAt = value.createdAt || base.createdAt;
  base.updatedAt = value.updatedAt || base.updatedAt;
  base.appVersion = meta.appVersion || value.appVersion || '';
  base.catalogVersion = meta.catalogVersion || value.catalogVersion || '';
  base.decision = ['pending','accepted','rejected'].includes(value.decision) ? value.decision : 'pending';
  base.decisionNote = String(value.decisionNote || '');
  for (const item of MANUAL_ACCEPTANCE_CASES) {
    const raw = value.cases?.[item.id] || {};
    base.cases[item.id] = {
      status: ['pending','pass','fail','blocked'].includes(raw.status) ? raw.status : 'pending',
      severity: ['P0','P1','P2'].includes(raw.severity) ? raw.severity : null,
      notes: String(raw.notes || ''), evidence: String(raw.evidence || '')
    };
    if (base.cases[item.id].status !== 'fail') base.cases[item.id].severity = null;
  }
  return base;
}

export function summarizeManualAcceptance(session) {
  const rows = MANUAL_ACCEPTANCE_CASES.map(item => ({ ...item, ...(session.cases?.[item.id] || {}) }));
  const counts = Object.fromEntries(['pending','pass','fail','blocked'].map(status => [status, rows.filter(row => row.status === status).length]));
  const p0 = rows.filter(row => row.status === 'fail' && row.severity === 'P0').length;
  const p1 = rows.filter(row => row.status === 'fail' && row.severity === 'P1').length;
  const p2 = rows.filter(row => row.status === 'fail' && row.severity === 'P2').length;
  const requiredPending = rows.filter(row => row.required && row.status !== 'pass').length;
  return { counts, p0, p1, p2, requiredPending, eligible: requiredPending === 0 && p0 === 0 && p1 === 0 };
}

export function loadManualAcceptanceSession(storage=globalThis.localStorage, meta={}) {
  try { return normalizeManualAcceptanceSession(JSON.parse(storage?.getItem?.(MANUAL_ACCEPTANCE_STORAGE_KEY) || 'null'), meta); }
  catch { return newManualAcceptanceSession(meta); }
}

export function saveManualAcceptanceSession(session, storage=globalThis.localStorage, now=()=>new Date().toISOString()) {
  const next = normalizeManualAcceptanceSession(session, { appVersion:session.appVersion, catalogVersion:session.catalogVersion, now });
  next.updatedAt = now(); storage?.setItem?.(MANUAL_ACCEPTANCE_STORAGE_KEY, JSON.stringify(next)); return next;
}

export function exportManualAcceptanceReport(session) {
  return { ...session, summary:summarizeManualAcceptance(session), casesDefinition:MANUAL_ACCEPTANCE_CASES };
}
