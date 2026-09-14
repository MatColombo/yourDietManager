import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildIdentity } from './build-identity.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const build=await buildIdentity();
const results=await read('reports/revision_v2/R4/evidence/suite/results.json');
if(results.length!==42 || results.some(row=>row.exitCode!==0)) throw new Error('The complete 42-file regression must pass before updating the dossier');
let tests=0,pass=0,fail=0;
for(const row of results) {
 const log=await fs.readFile(`reports/revision_v2/R4/evidence/suite/${row.file.split('/').at(-1).replace('.mjs','.log')}`,'utf8');
 for(const key of ['tests','pass','fail','cancelled','skipped']) if(!new RegExp(`ℹ ${key} (\\d+)`).test(log)) throw new Error(`Incomplete log ${row.file}: ${key}`);
 tests+=Number(log.match(/ℹ tests (\d+)/)[1]);pass+=Number(log.match(/ℹ pass (\d+)/)[1]);fail+=Number(log.match(/ℹ fail (\d+)/)[1]);
 if(!/ℹ cancelled 0/.test(log)||!/ℹ skipped 0/.test(log))throw new Error(`Cancelled/skipped tests: ${row.file}`);
}
if(tests!==pass||fail)throw new Error('Regression totals do not match');
await write('reports/revision_v2/R4/evidence/suite/summary.json',{files:results.length,tests,pass,fail,cancelled:0,skipped:0,environment:'Node 24.19.0 Linux; memory repositories, no browser; TMPDIR in scratch',buildSha256:build.sha256});
const paths={
 'R4.1':['src/ui/planPages.js','src/services/effectivePlanService.js','src/styles.css'],
 'R4.2':['src/services/effectivePlanService.js','src/services/planPolicyValidation.js','src/planner/planGenerator.js','schemas/meal-class.schema.json','src/ui/configurationPages.js'],
 'R4.3':['src/repositories/repositoryHub.js','src/services/operationHistoryService.js','src/services/planPreviewGuard.js','src/services/planGenerationService.js'],
 'R4.4':['src/ui/app.js','src/ui/catalogPages.js','src/ui/configurationPages.js','src/ui/planPages.js','src/styles.css'],
 'R4.5':['src/ui/configurationPages.js','src/ui/profileStatus.js','src/services/configurationService.js','src/ui/uiState.js'],
 'R4.6':['src/ui/planPages.js','src/ui/uiState.js','src/ui/catalogPages.js','src/styles.css'],
 'R5.1':['data/revision-v2/mediterranean/manifest.json','data/revision-v2/mediterranean/dish-briefs.json'],
 'R5.2':['src/corpus/mediterranean/sourceAdapters.js','data/revision-v2/mediterranean/source-register.json','data/revision-v2/mediterranean/sources/crea-004000.json','data/revision-v2/mediterranean/sources/crea-004005.json','data/revision-v2/mediterranean/sources/crea-004010.json'],
 'R5.3':['src/corpus/mediterranean/sourceAdapters.js','scripts/revision-v2/import-mediterranean-reviews.mjs','scripts/revision-v2/stage-mediterranean.mjs','reports/revision_v2/R5/quarantine-dispositions.json'],
 'R5.4':['src/corpus/mediterranean/coverage.js','data/revision-v2/mediterranean/dish-briefs.json','reports/revision_v2/R5/coverage.json']
};
const evidence=async(id,path,scope,result='PASS')=>({id,path,sha256:await hash(path),result,buildSha256:build.sha256,scope,environment:'Node/Linux; no real browser execution'});
const r4=[await evidence('EV-R4-REGRESSION','reports/revision_v2/R4/evidence/suite/summary.json',`${pass} tests; unit and service scopes including synthetic concurrency/abort and composition fixtures`),await evidence('EV-R4-BUILD','reports/revision_v2/R4/evidence/build.log','Static build; no runtime/offline certification'),await evidence('EV-R4-FORMS','reports/revision_v2/R4/evidence/forms.log','Source contract checks only'),await evidence('EV-R4-A11Y','reports/revision_v2/R4/evidence/a11y.log','Source checks only; no visual accessibility certification'),await evidence('EV-R4-BROWSER','reports/revision_v2/R4/browser-matrix.json','Browser/IndexedDB/multi-tab/offline acceptance unavailable','BLOCKED')];
const r5=[await evidence('EV-R5-STAGING','reports/revision_v2/R5/coverage.json','Nominal manifest, three CREA extracts and blocked coverage gate; not published catalog'),await evidence('EV-R5-QUARANTINE','reports/revision_v2/R5/quarantine-dispositions.json','All R0 IDs/reasons retained, still excluded')];
for(const phase of ['R0','R1','R2','R3']) {const file=`reports/revision_v2/${phase}/test-results.json`,report=await read(file);report.historical=true;for(const e of report.evidence)e.historical=true;await write(file,report);}
await write('reports/revision_v2/R4/test-results.json',{schemaVersion:1,phase:'R4',buildSha256:build.sha256,overallFunctionalStatus:'PASS',phaseGate:'BLOCKED',actual:`${pass} automated tests pass. Real browser acceptance remains blocked. Shopping material digest remains R6.`,evidence:r4});
await write('reports/revision_v2/R5/test-results.json',{schemaVersion:1,phase:'R5',buildSha256:build.sha256,overallFunctionalStatus:'STAGING_ONLY',phaseGate:'BLOCKED',actual:'200 concepts/307 forms/120 dish proposals planned; 3 extracts; 0 reviewed forms. Pilot and scale not accepted.',evidence:r5});
const trace=await read('specs/revision_v2/TRACEABILITY.json'),registry=await read('specs/revision_v2/TEST_REGISTRY.json'),state=await read('reports/revision_v2/STATE.json');
for(const task of state.tasks){
 if(paths[task.id]){task.status=task.phase==='R4'?'IMPLEMENTATO':'BLOCCATO';task.changedFiles=paths[task.id];task.evidenceIds=task.phase==='R4'?['EV-R4-REGRESSION']:['EV-R5-STAGING','EV-R5-QUARANTINE'];task.remainingScopes=task.phase==='R4'?['Accettazione browser reale, focus/touch/IT-EN/multi-tab/IndexedDB/offline; parti di integrazione spesa R6']:['Fonti complete, mapping e revisioni reali del pilot; scala e pubblicazione subordinate al pilot accettato'];}
 else if(task.status==='VERIFICATO'){task.evidenceIds=['EV-R4-REGRESSION'];}
}
for(const req of trace.requirements){
 if(['R4','R5'].includes(req.ownerPhase)){req.status=req.ownerPhase==='R4'?'IMPLEMENTATO':'BLOCCATO';req.changedFiles=paths[req.ownerTask]||[];req.evidenceIds=req.ownerPhase==='R4'?['EV-R4-REGRESSION']:['EV-R5-STAGING','EV-R5-QUARANTINE'];req.remainingScopes=state.tasks.find(t=>t.id===req.ownerTask).remainingScopes;}
 if(req.status==='VERIFICATO'){req.lastVerifiedArtifactSha256=build.sha256;req.evidenceIds=['EV-R4-REGRESSION'];}
}
for(const scenario of registry.tests){if(scenario.status==='PASS'){scenario.buildSha256=build.sha256;scenario.evidenceIds=['EV-R4-REGRESSION'];}if(['T11','T12','T40','T41','T42','T43','T44','T45','T46','T47','T48','T53','T54','T55','T56','T63','T77','T78','T79'].includes(scenario.id)&&scenario.status!=='PASS'){scenario.implementationEvidenceIds=['EV-R4-REGRESSION','EV-R5-STAGING'];scenario.completeScope=false;}}
for(const phase of state.phases){if(['R4','R5'].includes(phase.id)){phase.status='BLOCCATO';phase.implementationStatus=phase.id==='R4'?'IMPLEMENTATO':'STAGING IMPLEMENTATO, CATALOGO BLOCCATO';phase.gateBlockers=phase.id==='R4'?['Browser/IndexedDB/multi-tab/offline reali non verificati']:['Pilot 40/60 senza review complete','Scala 200/300 e 120 ricette non materializzate'];phase.report=`reports/revision_v2/${phase.id}/REPORT.md`;phase.buildSha256=build.sha256;}}
state.appVersion='1.1.0-dev.r5';state.buildSha256=build.sha256;state.releaseStatus='DEVELOPMENT_ONLY_NOT_STABLE';state.nextDevelopmentTask='Completare fonti e revisioni pilot R5; accettazione browser R4. R6 non avviata.';state.nextRequiredVerification='Browser reale R4 e pilot 40/60 R5 revisionato; nessuna approvazione simulata';state.lastVerifiedTask=`Regressione automatica R0–R5: ${pass} PASS; manifest/staging verificati, fasi non dichiarate complete`;
for(const issue of state.openCoreIssues){if(issue.closurePhase==='R4'){issue.implementationStatus='IMPLEMENTATO';issue.acceptanceStatus='IN ATTESA DI VERIFICA COMPLETA';}if(issue.closurePhase==='R5'){issue.implementationStatus='BLOCCATO';issue.acceptanceStatus='PILOT E REVISIONI NON COMPLETI';}}
await write('specs/revision_v2/TRACEABILITY.json',trace);await write('specs/revision_v2/TEST_REGISTRY.json',registry);await write('reports/revision_v2/STATE.json',state);await write('reports/revision_v2/BUILD_MANIFEST.json',build);
const lines=['# Collegamento revisione → sviluppo R4/R5','', '| Attività | Requisiti della revisione | File | Evidenze | Stato |','| --- | --- | --- | --- | --- |'];
for(const task of state.tasks.filter(t=>paths[t.id]))lines.push(`| ${task.id} ${task.title} | ${task.requirementIds.join(', ')} | ${paths[task.id].map(f=>'`'+f+'`').join('<br>')} | ${task.evidenceIds.join(', ')} | ${task.status} |`);
lines.push('','Le prove di accettazione complete rimangono nel TEST_REGISTRY; un test unitario non chiude automaticamente lo scenario browser o il gate editoriale.');
await fs.writeFile('specs/revision_v2/MATRICE_R4_R5.md',lines.join('\n')+'\n');console.log(JSON.stringify({tests,pass,buildSha256:build.sha256}));
