import { element } from './dom.js';
import { APP_VERSION } from '../db/constants.js';
import { MANUAL_ACCEPTANCE_CASES, exportManualAcceptanceReport, loadManualAcceptanceSession, saveManualAcceptanceSession, summarizeManualAcceptance } from '../services/manualAcceptanceService.js';

function t(state,key){ return state.i18n.t(key); }
function downloadJson(value, filename){ const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=element('a',{href:url,download:filename}); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function persist(state, session){ state.manualAcceptanceSession=saveManualAcceptanceSession(session); state.render(); }

function caseCard(state, item, session){
  const record=session.cases[item.id];
  const card=element('article',{className:'acceptance-case','data-testid':`manual-acceptance-case-${item.id}`});
  card.append(element('div',{className:'section-heading'},[element('div',{},[element('strong',{text:item.title}),element('span',{className:'muted',text:item.hint})]),element('code',{text:item.id})]));
  const status=element('select',{onChange:e=>{ record.status=e.currentTarget.value; if(record.status!=='fail') record.severity=null; persist(state,session); }});
  for(const value of ['pending','pass','fail','blocked']) status.append(element('option',{value,text:t(state,`manualAcceptance.status.${value}`)})); status.value=record.status;
  const severity=element('select',{disabled:record.status!=='fail',onChange:e=>{record.severity=e.currentTarget.value||null;persist(state,session);}}); severity.append(element('option',{value:'',text:'—'})); for(const value of ['P0','P1','P2']) severity.append(element('option',{value,text:value})); severity.value=record.severity||'';
  const notes=element('textarea',{rows:3,value:record.notes,placeholder:t(state,'manualAcceptance.notes'),onChange:e=>{record.notes=e.currentTarget.value;persist(state,session);}});
  const evidence=element('input',{type:'text',value:record.evidence,placeholder:t(state,'manualAcceptance.evidence'),onChange:e=>{record.evidence=e.currentTarget.value;persist(state,session);}});
  card.append(element('div',{className:'acceptance-case__controls'},[element('label',{className:'field'},[element('span',{text:t(state,'manualAcceptance.status')}),status]),element('label',{className:'field'},[element('span',{text:t(state,'manualAcceptance.severity')}),severity])]),notes,evidence); return card;
}

export function manualAcceptancePage(state){
  const meta={appVersion:APP_VERSION,catalogVersion:state.catalogVersion||''};
  state.manualAcceptanceSession ||= loadManualAcceptanceSession(globalThis.localStorage,meta);
  const session=state.manualAcceptanceSession; session.appVersion=APP_VERSION; session.catalogVersion=state.catalogVersion||session.catalogVersion;
  const summary=summarizeManualAcceptance(session);
  const section=element('section',{className:'page-card page-card--wide plan-page manual-acceptance-page','data-testid':'manual-acceptance-page'});
  section.append(element('p',{className:'eyebrow',text:'V1 MANUAL ACCEPTANCE'}),element('h1',{text:t(state,'manualAcceptance.title')}),element('p',{className:'lead',text:t(state,'manualAcceptance.body')}));
  section.append(element('div',{className:'validation-box'},[element('strong',{text:t(state,'manualAcceptance.rule.title')}),element('span',{text:t(state,'manualAcceptance.rule.body')})]));
  section.append(element('div',{className:'validation-summary-grid','data-testid':'manual-acceptance-summary'},[
    element('div',{className:'metric'},[element('span',{text:'PASS'}),element('strong',{text:summary.counts.pass})]),
    element('div',{className:'metric'},[element('span',{text:'FAIL'}),element('strong',{text:summary.counts.fail})]),
    element('div',{className:'metric'},[element('span',{text:'BLOCKED'}),element('strong',{text:summary.counts.blocked})]),
    element('div',{className:'metric'},[element('span',{text:'P0/P1'}),element('strong',{text:summary.p0+summary.p1})])
  ]));
  const stateBox=element('div',{className:`validation-box${summary.eligible?'':' validation-box--error'}`,'data-testid':'manual-acceptance-eligibility'},[
    element('strong',{text:summary.eligible?t(state,'manualAcceptance.eligible'):t(state,'manualAcceptance.notEligible')}),
    element('span',{text:summary.eligible?t(state,'manualAcceptance.eligible.body'):t(state,'manualAcceptance.notEligible.body')})
  ]); section.append(stateBox);
  const actions=element('div',{className:'page-actions'},[
    element('a',{href:'/planner-validation','data-route':'',className:'button button--secondary',text:t(state,'manualAcceptance.openLab')}),
    element('button',{className:'button button--secondary','data-testid':'manual-acceptance-export',text:t(state,'manualAcceptance.export'),onClick:()=>downloadJson(exportManualAcceptanceReport(session),`ydm-manual-acceptance-${new Date().toISOString().slice(0,10)}.json`)})
  ]); section.append(actions);
  const groups=[...new Set(MANUAL_ACCEPTANCE_CASES.map(item=>item.group))];
  for(const group of groups){ const block=element('section',{className:'plan-action-card'},[element('h2',{text:t(state,`manualAcceptance.group.${group}`)})]); for(const item of MANUAL_ACCEPTANCE_CASES.filter(row=>row.group===group)) block.append(caseCard(state,item,session)); section.append(block); }
  return section;
}
