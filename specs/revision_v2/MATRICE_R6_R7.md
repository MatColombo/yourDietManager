# Revisione → sviluppo → verifica R6/R7

| Attività | Requisiti | File | Evidenze | Stato |
| --- | --- | --- | --- | --- |
| R6.1 Gruppi e forme di acquisto | INV-04, ING-07, ING-08, ING-09, ING-10, ING-11, ING-12, NUT-01, NUT-02, NUT-03, SHOP-01, SHOP-02, SHOP-03 | src/services/shoppingService.js, src/ui/shoppingPages.js | EV-R6-SERVICES | Implementato; accettazione incompleta |
| R6.2 Checklist digest ed esportazione | INV-07, SWAP-09, SHOP-04, SHOP-05, SHOP-06, HARD-05, HARD-07 | src/services/shoppingService.js, schemas/shopping-checklist.schema.json, src/ui/shoppingPages.js | EV-R6-SERVICES | Implementato; accettazione incompleta |
| R6.3 Backup autosufficiente e import atomico | INV-03, PREF-20, REC-06, MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, MIG-08 | src/services/backupEngine.js, src/services/portableBackup.js, src/repositories/repositoryHub.js, schemas/backup-v3.schema.json, src/ui/app.js | EV-R6-SERVICES | Implementato; accettazione incompleta |
| R6.4 Upgrade offline e client precedenti | INV-01, HARD-04, OPS-01, OPS-02 | src/db/database.js, src/db/constants.js, src/main.js, public/service-worker.js, src/services/offlineCatalog.js | EV-R6-SERVICES | Implementato; accettazione incompleta |
| R6.5 Privacy e diagnostica | OPS-03, OPS-04, OPS-05 | src/services/localDiagnostics.js, src/ui/app.js | EV-R6-SERVICES | Implementato; accettazione incompleta |
| R7.1 Accettazione integrata | EXT-01, EXT-02, EXT-03, EXT-04, EXT-05, EXT-06 | scripts/revision-v2/core-gate.mjs, tests/revision-v2-r6-r7.test.mjs | EV-R7-REGRESSION | Implementato; accettazione incompleta |
| R7.2 Prestazioni e qualità misurate | PERF-04 | scripts/revision-v2/benchmark-r7.mjs, reports/revision_v2/R7/performance.json | EV-R7-REGRESSION | Implementato; accettazione incompleta |
| R7.3 Coerenza documentale e dossier | INV-10, DOC-01, DOC-02, DOC-03, DOC-04 | specs/revision_v2/CONTRATTO_R6_R7.md, scripts/revision-v2/update-r6-r7-dossier.mjs, skills/yourdietmanager-builder/SKILL.md | EV-R7-REGRESSION | Implementato; accettazione incompleta |
