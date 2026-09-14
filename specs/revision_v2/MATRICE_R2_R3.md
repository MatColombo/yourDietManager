# Matrice di consegna R2/R3

La matrice conserva gli ID della revisione e della specifica. IMPLEMENTATO non significa che il relativo scenario di accettazione sia completo. Le prove browser rimangono aperte. Il registro JSON include anche le altre fasi.

| Attività | Requisiti titolari | File principali | Evidenze |
|---|---|---|---|
| R2.1 | ING-07, ING-08, ING-09, ING-11, PERF-03 | src/services/ingredientConceptQuery.js<br>src/domain/ingredientPresentation.js<br>src/ui/guidedControls.js<br>src/services/catalogQuery.js<br>src/repositories/repositoryHub.js | EV-R3-REGRESSION, EV-R3-FORMS, EV-R2-CATALOG |
| R2.2 | ING-12, ING-13, REC-01, REC-02, REC-03 | src/domain/recipePresentation.js<br>src/services/recipePresentationMigration.js<br>src/services/foodPresentationMigration.js<br>src/domain/foodPresentationCorrections.js<br>src/services/catalogAvailability.js | EV-R3-REGRESSION, EV-R3-FORMS, EV-R2-CATALOG |
| R2.3 | NUT-06, REC-04, REC-05, REC-06, REC-07 | src/services/personalCatalogService.js<br>src/services/customCatalogTransfer.js<br>src/corpus/recipePipeline.js<br>src/corpus/corpusScanner.js<br>src/corpus/deterministicRecipeGenerator.js<br>src/corpus/v1PhaseBRecipeGenerator.js<br>src/corpus/v1ReleaseRecipeGenerator.js<br>src/services/shoppingService.js<br>src/ui/catalogPages.js<br>schemas/recipe-version-v2.schema.json | EV-R3-REGRESSION, EV-R3-FORMS, EV-R2-CATALOG |
| R2.4 | INV-08, INV-09, ING-10 | src/ui/catalogPages.js<br>src/ui/guidedControls.js<br>src/ui/configurationPages.js<br>src/main.js<br>src/styles.css<br>public/data/locales/it.json<br>public/data/locales/en.json | EV-R3-REGRESSION, EV-R3-FORMS, EV-R2-CATALOG |
| R3.1 | PREF-07, PREF-08, PREF-09, PREF-10, PREF-11, PREF-12, PREF-13, PREF-14 | src/domain/frequencyCounter.js<br>src/services/planPolicyValidation.js<br>src/services/planGenerationService.js<br>src/services/effectivePlanService.js | EV-R3-REGRESSION, EV-R3-FORMS |
| R3.2 | PREF-15, PREF-16, PREF-17, PREF-18, PERF-01, PERF-02, PERF-05 | src/planner/frequencyPlanGenerator.js<br>src/planner/planGenerator.js<br>src/planner/beamSolver.js<br>src/planner/constraintPolicy.js<br>src/services/planCandidateService.js<br>src/services/plannerExecution.js<br>src/services/plannerWorker.js<br>public/service-worker.js | EV-R3-REGRESSION, EV-R3-FORMS |
| R3.3 | ING-07, ING-08, ING-09, ING-10, ING-11, PREF-01, PREF-02, PREF-03, PREF-04, PREF-05, PREF-06, PREF-19, SAFE-01, SAFE-02 | src/ui/configurationRulesV2Ui.js<br>src/ui/foodGroupEditor.js<br>src/ui/frequencySummary.js<br>src/ui/configurationPages.js<br>src/ui/planPages.js<br>src/domain/revisionV2Contracts.js<br>src/services/configurationService.js | EV-R3-REGRESSION, EV-R3-FORMS |
| R3.4 | PREF-20, SAFE-03 | src/domain/legacyRuleAdapter.js<br>src/planner/softScoring.js<br>src/ui/configurationRulesV2Ui.js<br>schemas/food-preferences-v2.schema.json<br>schemas/allergy-intolerance-profile-v2.schema.json | EV-R3-REGRESSION, EV-R3-FORMS |
| R3.5 | INV-03, INV-04, INV-05, INV-06, NUT-01, SAFE-04, SAFE-05, SAFE-06, SAFE-07, SAFE-08, SAFE-09, SAFE-10, SAFE-11, SAFE-12, SAFE-13, SAFE-14, HARD-01, HARD-02, HARD-03, MIG-04 | src/domain/safetyPolicy.js<br>src/planner/hardFilter.js<br>src/planner/recipeFeatures.js<br>src/services/planPolicyValidation.js<br>src/services/planPreviewGuard.js<br>src/services/effectivePlanService.js<br>src/services/backupEngine.js<br>src/services/referenceDataService.js | EV-R3-REGRESSION, EV-R3-FORMS |

## Requisiti e osservazioni della revisione

| Requisito | Origine revisione / CR | Attività | Test di accettazione | Stato / ambiti aperti |
|---|---|---|---|---|
| INV-04 | CR §1.2 | R3.5 | T37, T46, T57, T71 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| INV-05 | CR §1.2 | R3.5 | T34, T38, T71 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| INV-06 | R01, R04 | R3.5 | T02, T03, T07 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| INV-08 | CR §1.2 | R2.4 | T51 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| ING-07 | R08 | R2.1 | T13, T14, T16 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| ING-08 | R08 | R2.1 | T14, T15 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| ING-09 | R08 | R2.1 | T13, T15 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| ING-10 | R08 | R2.4 | T14 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. Nuove superfici R4/R6 e invalidazione cross-tab end-to-end. |
| ING-11 | R08, R09 | R2.1 | T14, T22, T63 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. Nuove superfici R4/R6 e invalidazione cross-tab end-to-end. |
| ING-12 | R08, R23 | R2.2 | T16, T17 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| ING-13 | R08, R20 | R2.2 | T63, T77 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| NUT-06 | R24 | R2.3 | T52 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| PREF-01 | R11 | R3.3 | T23 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-02 | R11 | R3.3 | T23, T25 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-03 | R11 | R3.3 | T23 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-04 | R11 | R3.3 | T25 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-05 | R11 | R3.3 | T24, T37 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-06 | R11 | R3.3 | T23, T36 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-07 | R12 | R3.1 | T24, T26, T27, T28, T31 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-08 | R12 | R3.1 | T26, T27, T32 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-09 | R12 | R3.1 | T27, T28 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-10 | R12 | R3.1 | T28, T29 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-11 | R12 | R3.1 | T34 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-12 | R12 | R3.1 | T30, T31, T32 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-13 | R11, R12 | R3.1 | T33 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-14 | R11 | R3.1 | T30, T33 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-15 | R11 | R3.2 | T35, T36 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-16 | R11 | R3.2 | T35, T38 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-17 | R11, R12 | R3.2 | T24, T27, T31, T38 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-18 | R11 | R3.2 | T38 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-19 | R11, R12 | R3.3 | T24, T34, T37, T38 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PREF-20 | R13 | R3.4 | T39 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-01 | R01, R08 | R3.3 | T05, T06 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-03 | R01 | R3.4 | T05, T79 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-04 | R01, R08 | R3.5 | T05, T06 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-05 | R01 | R3.5 | T01, T03 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-06 | R01 | R3.5 | T02, T03 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-07 | R01 | R3.5 | T04, T79 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-08 | R01 | R3.5 | T79 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-09 | R01, R03 | R3.5 | T01, T79 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-10 | R01 | R3.5 | T01, T02, T04 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-11 | R01, R04 | R3.5 | T02, T07 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-12 | R04 | R3.5 | T07, T08 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-13 | R04, R05 | R3.5 | T08, T09 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| SAFE-14 | R01 | R3.5 | T02, T79 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| REC-01 | R09 | R2.2 | T49 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-02 | R09 | R2.2 | T49 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-03 | R10 | R2.2 | T15, T49 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-04 | R22 | R2.3 | T50 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-05 | R02, R22, R24 | R2.3 | T10, T52 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-06 | R22, R27 | R2.3 | T50, T60 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| REC-07 | R22 | R2.3 | T50, T65 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. R5: revisione editoriale definitiva di titoli e praticità; corpus legacy non certificato dalla migrazione. |
| HARD-01 | R04 | R3.5 | T07 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| HARD-02 | R04, R05 | R3.5 | T07, T11 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| HARD-03 | R04, R05 | R3.5 | T02, T07, T31, T71 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PERF-01 | R06 | R3.2 | T21, T64 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PERF-02 | R06 | R3.2 | T21, T38, T64 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PERF-03 | R08 | R2.1 | T22, T64 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |
| PERF-05 | CR §13 | R3.2 | T64, T78 | IMPLEMENTATO; Accettazione completa degli scenari associati: le sotto-prove automatiche non chiudono la prova UI/browser/IndexedDB/offline. |

## Prove

I log di ciascun file sono in `reports/revision_v2/R3/evidence/suite/`. `results.json` registra le ripetizioni e `summary.json` il totale finale. `R2/evidence/catalog-and-search.json` e `titles.json` documentano il corpus. Le sotto-prove non trasformano automaticamente gli scenari T01–T79 in PASS.
