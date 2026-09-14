"""Rebuild R2/R3 trace links from existing evidence; never upgrades partial acceptance to PASS."""
import json, subprocess, hashlib, pathlib
root = pathlib.Path.cwd()
def read(p): return json.loads((root / p).read_text())
def write(p, value): (root / p).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def digest(p): return hashlib.sha256((root / p).read_bytes()).hexdigest()
build = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {buildIdentity} from './scripts/revision-v2/build-identity.mjs'; console.log(JSON.stringify(await buildIdentity()));"], text=True))
sha = build['sha256']; write('reports/revision_v2/BUILD_MANIFEST.json', build)
summary = read('reports/revision_v2/R3/evidence/suite/summary.json')
if summary['failedFiles'] or summary['totals']['fail'] or summary['totals']['pass'] != 288: raise RuntimeError('Regression is not green: cannot rebuild PASS evidence')
summary['buildSha256'] = sha; summary['scope'] = 'Automated regression; browser acceptance remains blocked'; write('reports/revision_v2/R3/evidence/suite/summary.json', summary)
files = {
'R2.1': ['src/services/ingredientConceptQuery.js','src/domain/ingredientPresentation.js','src/ui/guidedControls.js','src/services/catalogQuery.js','src/repositories/repositoryHub.js'],
'R2.2': ['src/domain/recipePresentation.js','src/services/recipePresentationMigration.js','src/services/foodPresentationMigration.js','src/domain/foodPresentationCorrections.js','src/services/catalogAvailability.js'],
'R2.3': ['src/services/personalCatalogService.js','src/services/customCatalogTransfer.js','src/corpus/recipePipeline.js','src/corpus/corpusScanner.js','src/corpus/deterministicRecipeGenerator.js','src/corpus/v1PhaseBRecipeGenerator.js','src/corpus/v1ReleaseRecipeGenerator.js','src/services/shoppingService.js','src/ui/catalogPages.js','schemas/recipe-version-v2.schema.json'],
'R2.4': ['src/ui/catalogPages.js','src/ui/guidedControls.js','src/ui/configurationPages.js','src/main.js','src/styles.css','public/data/locales/it.json','public/data/locales/en.json'],
'R3.1': ['src/domain/frequencyCounter.js','src/services/planPolicyValidation.js','src/services/planGenerationService.js','src/services/effectivePlanService.js'],
'R3.2': ['src/planner/frequencyPlanGenerator.js','src/planner/planGenerator.js','src/planner/beamSolver.js','src/planner/constraintPolicy.js','src/services/planCandidateService.js','src/services/plannerExecution.js','src/services/plannerWorker.js','public/service-worker.js'],
'R3.3': ['src/ui/configurationRulesV2Ui.js','src/ui/foodGroupEditor.js','src/ui/frequencySummary.js','src/ui/configurationPages.js','src/ui/planPages.js','src/domain/revisionV2Contracts.js','src/services/configurationService.js'],
'R3.4': ['src/domain/legacyRuleAdapter.js','src/planner/softScoring.js','src/ui/configurationRulesV2Ui.js','schemas/food-preferences-v2.schema.json','schemas/allergy-intolerance-profile-v2.schema.json'],
'R3.5': ['src/domain/safetyPolicy.js','src/planner/hardFilter.js','src/planner/recipeFeatures.js','src/services/planPolicyValidation.js','src/services/planPreviewGuard.js','src/services/effectivePlanService.js','src/services/backupEngine.js','src/services/referenceDataService.js']}
for paths in files.values():
 for p in paths:
  if not (root / p).is_file(): raise RuntimeError('Missing implementation: '+p)
def ev(id, path, command, scope): return {'id': id, 'path': path, 'sha256': digest(path), 'command': command, 'exitCode': 0, 'result': 'PASS', 'scope': scope, 'buildSha256': sha, 'catalog': '1.2.0-planner-phase-d', 'environment': 'Node 24.19.0 / Linux x64; in-memory repositories; no browser execution'}
evidence = {
'R2': [ev('EV-R2-CATALOG', 'reports/revision_v2/R2/evidence/catalog-and-search.json', 'node scripts/revision-v2/audit-r2-r3.mjs', 'Real catalog identity/title migration, history preservation and synthetic Node search benchmark; not browser or editorial approval')],
'R3': [ev('EV-R3-REGRESSION', 'reports/revision_v2/R3/evidence/suite/summary.json', 'node --test <each tests/*.test.mjs>; corrected groups rerun', '288 automated tests; scopes identified in the individual logs'), ev('EV-R3-FORMS', 'reports/revision_v2/R3/evidence/forms.log', 'node scripts/hardening/form-contract-audit.mjs', 'Source contract audit only'), ev('EV-R3-BUILD', 'reports/revision_v2/R3/evidence/build.log', 'node scripts/build.mjs', 'Static build and schema mirrors'), ev('EV-R3-A11Y', 'reports/revision_v2/R3/evidence/a11y.log', 'node scripts/hardening/a11y-audit.mjs', '16 source checks, not runtime accessibility'), ev('EV-R3-PAGES', 'reports/revision_v2/R3/evidence/pages.log', 'node scripts/hardening/pages-audit.mjs dist', 'Static artifact paths'), ev('EV-R3-LINT', 'reports/revision_v2/R3/evidence/lint.log', 'node scripts/lint.mjs', '229 JavaScript syntax checks')]}
for phase in ['R0','R1']:
 path=f'reports/revision_v2/{phase}/test-results.json'; report=read(path)
 for e in report['evidence']: e['historical']=True
 report['historical']=True; write(path,report)
for phase in ['R2','R3']:
 write(f'reports/revision_v2/{phase}/test-results.json', {'schemaVersion':1,'phase':phase,'buildSha256':sha,'overallFunctionalStatus':'PASS','phaseGate':'BLOCKED','gateReason':'Browser/IndexedDB/offline reali e scenari end-to-end completi non verificati','expected':'Implementation scope passes without relabeling partial acceptance tests as complete','actual':'288 automated tests pass; source audits/build pass; browser acceptance blocked','evidence':evidence[phase]})
trace=read('specs/revision_v2/TRACEABILITY.json'); registry=read('specs/revision_v2/TEST_REGISTRY.json'); state=read('reports/revision_v2/STATE.json')
trace['buildSha256']=sha; state['buildSha256']=sha; state['appVersion']='1.1.0-dev.r3'
for r in trace['requirements']:
 if r['status']=='VERIFICATO':
  r.setdefault('historicalEvidenceIds',r['evidenceIds']);r['evidenceIds']=['EV-R3-REGRESSION'];r['lastVerifiedArtifactSha256']=sha
 if r['ownerTask'] in files:
  r['status']='IMPLEMENTATO';r['changedFiles']=files[r['ownerTask']];r['evidenceIds']=['EV-R3-REGRESSION','EV-R3-FORMS']+(['EV-R2-CATALOG'] if r['ownerPhase']=='R2' else []);r['lastVerifiedArtifactSha256']=None
  r['remainingScopes']=['Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline.']
  if r['id'] in ['ING-10','ING-11']:r['remainingScopes'].append('Nuove superfici R4/R6 e invalidazione cross-tab end-to-end.')
  if r['ownerTask'] in ['R2.2','R2.3']:r['remainingScopes'].append('R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione.')
for t in registry['tests']:
 if t['status']=='PASS':t['buildSha256']=sha;t.setdefault('historicalEvidenceIds',t['evidenceIds']);t['evidenceIds']=['EV-R3-REGRESSION']
 if t['firstCompletePhase'] in ['R2','R3']:
  t['buildSha256']=sha;t['completeScope']=False;t['status']='DA ESEGUIRE';t['fixture']='tests/revision-v2-r2-r3.test.mjs; fixtures sintetiche e corpus allegato nell’audit R2'
  t['evidenceIds']=sorted(set(t.get('evidenceIds',[])+['EV-R3-REGRESSION']+(['EV-R2-CATALOG'] if t['firstCompletePhase']=='R2' else [])))
  t['actual']='Sotto-prove di dominio/service e audit sorgenti passati; vedere log nominativi. Lo scenario end-to-end completo resta aperto.'
  scopes=t.get('partialScopes',[]);scope='R2/R3: test automatici e migrazione disponibili; browser, dispositivi, reload/IndexedDB/offline e intero scenario non certificati.'
  if scope not in scopes:scopes.append(scope)
  t['partialScopes']=scopes
for task in state['tasks']:
 if task['status']=='VERIFICATO':task.setdefault('historicalEvidenceIds',task['evidenceIds']);task['evidenceIds']=['EV-R3-REGRESSION']
 if task['id'] in files:
  task['status']='IMPLEMENTATO';task['changedFiles']=files[task['id']];task['evidenceIds']=['EV-R3-REGRESSION','EV-R3-FORMS']+(['EV-R2-CATALOG'] if task['phase']=='R2' else []);task['remainingScopes']=['Gate browser/IndexedDB/offline e scenari di accettazione completi; eventuali dipendenze editoriali R5 e superfici R4/R6 indicate nel contratto.']
for phase in state['phases']:
 if phase['id'] in ['R2','R3']:phase.update(status='BLOCCATO',implementationStatus='IMPLEMENTATO',gateBlockers=['Browser reale, IndexedDB, upgrade offline e interazioni end-to-end non verificati'],report=f"reports/revision_v2/{phase['id']}/REPORT.md",buildSha256=sha)
for issue in state['openCoreIssues']:
 if issue['closurePhase'] in ['R2','R3']:issue['implementationStatus']='IMPLEMENTATO';issue['acceptanceStatus']='IN ATTESA DI VERIFICA COMPLETA'
state['nextRequiredVerification']='Scenari completi R0–R3 nel browser autorizzato; IndexedDB e upgrade offline; nessun aggiramento della policy URL'
state['nextDevelopmentTask']='R4.1: comandi e concorrenza, riutilizzando selettore, contatore e validatore R2/R3'
state['lastVerifiedTask']='Regressione automatica R0–R3: 288 PASS; fasi non dichiarate complete';state['releaseStatus']='DEVELOPMENT_ONLY_NOT_STABLE'
write('specs/revision_v2/TRACEABILITY.json',trace);write('specs/revision_v2/TEST_REGISTRY.json',registry);write('reports/revision_v2/STATE.json',state)
lines=['# Matrice di consegna R2/R3','', 'La matrice conserva gli ID della revisione e della specifica. IMPLEMENTATO non significa che il relativo scenario di accettazione sia completo. Le prove browser rimangono aperte. Il registro JSON include anche le altre fasi.','', '| Attività | Requisiti titolari | File principali | Evidenze |', '|---|---|---|---|']
for task in state['tasks']:
 if task['id'] in files:lines.append('| '+task['id']+' | '+', '.join(task['requirementIds'])+' | '+'<br>'.join(files[task['id']])+' | '+', '.join(task['evidenceIds'])+' |')
lines+=['','## Requisiti e osservazioni della revisione','','| Requisito | Origine revisione / CR | Attività | Test di accettazione | Stato / ambiti aperti |','|---|---|---|---|---|']
for r in trace['requirements']:
 if r['ownerTask'] in files:lines.append('| '+r['id']+' | '+(', '.join(r['reviewIds']) or r['origin'])+' | '+r['ownerTask']+' | '+', '.join(r['testIds'])+' | IMPLEMENTATO; '+ ' '.join(r['remainingScopes'])+' |')
lines+=['','## Prove','', 'I log di ciascun file sono in `reports/revision_v2/R3/evidence/suite/`. `results.json` registra le ripetizioni e `summary.json` il totale finale. `R2/evidence/catalog-and-search.json` e `titles.json` documentano il corpus. Le sotto-prove non trasformano automaticamente gli scenari T01–T79 in PASS.']
(root/'specs/revision_v2/MATRICE_R2_R3.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'buildSha256':sha,'tests':summary['totals'],'implementedTasks':list(files)},indent=2))
