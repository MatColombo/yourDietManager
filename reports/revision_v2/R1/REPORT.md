# Rapporto R1 — implementazione e verifiche

11 settembre 2026 · app `1.1.0-dev.r1` · catalogo `1.2.0-planner-phase-d` · DB 7 / contenuti 4 / backup 2.

**Implementazione consegnata; gate di fase BLOCCATO per le prove browser/IndexedDB reale.** Non è una release stable né il completamento della CR V2.

## Identità

- Baseline H: `9210fba9cbbe5fc3311790b2fc6554e115a63856a97d555b8a173ee8b2306800`.
- Build verificata (sorgenti, schemi, asset, script e test): `caac4ac89441b02fd07cb166d2f1683102e47e1540855986fc6161d31122a087`. Elenco in `../BUILD_MANIFEST.json`.
- Piano tracciato 1.0: `specs/revision_v2/FASI_SVILUPPO.md`; origine e hash dei documenti in `baseline/MANIFEST.json`.

## Collegamenti fra revisione e sviluppo

| Attività | Rilievi | Requisiti | Modifiche | Prove/evidenze | Stato e residuo |
| --- | --- | --- | --- | --- | --- |
| R1.1 | R01, R03, R08, R10, R26 | ING-01, ING-02, ING-03, ING-04, ING-05, ING-06, SAFE-02 | `src/domain/ingredientIdentity.js`<br>`src/services/revisionV2Service.js`<br>`schemas/food-group.schema.json`<br>`schemas/ingredient-mapping.schema.json` | T01, T06, T13, T16, T17, T20, T53, T72; EV-R1-001, EV-R1-002 | VERIFICATO; perimetro di questa attività verificato |
| R1.2 | R08, R23 | NUT-01, NUT-02, NUT-03 | `src/domain/ingredientConversion.js`<br>`src/domain/nutritionCore.js`<br>`schemas/ingredient-conversion.schema.json` | T16, T17, T18, T19; EV-R1-001 | VERIFICATO; perimetro di questa attività verificato |
| R1.3 | R01, R04, R11, R13, R22, R27 | INV-03, PREF-06, PREF-20, SAFE-05, SAFE-06, SAFE-10, REC-06, REC-07, HARD-01 | `src/domain/revisionV2Contracts.js`<br>`src/lib/schemaValidator.js`<br>`src/services/revisionV2Service.js`<br>`src/services/personalCatalogService.js`<br>`src/services/configurationService.js`<br>`schemas/ingredient-revision-v2.schema.json`<br>`schemas/recipe-version-v2.schema.json`<br>`schemas/food-preferences-v2.schema.json`<br>`schemas/allergy-intolerance-profile-v2.schema.json` | T01, T02, T03, T04, T07, T23, T36, T39, T50, T59, T60, T65, T72; EV-R1-001, EV-R1-003 | VERIFICATO; perimetro di questa attività verificato |
| R1.4 | R01, R04, R05, R08, R13, R27 | PREF-20, SAFE-13, MIG-01, MIG-02, MIG-03, MIG-04 | `src/services/ingredientModelMigration.js`<br>`src/services/migrationRunner.js`<br>`src/services/preV1DataEpoch.js`<br>`src/repositories/repositoryHub.js`<br>`src/db/constants.js`<br>`src/services/catalogImporter.js`<br>`src/services/backupEngine.js`<br>`src/main.js`<br>`public/service-worker.js`<br>`src/services/offlineCatalog.js` | T08, T09, T22, T39, T59, T60, T72; EV-R1-001, EV-R1-002, EV-R0-005 | IMPLEMENTATO; Migrazione in IndexedDB reale, reload, upgrade offline |

Gli ID di test collegati indicano anche verifiche di integrazione future. Lo stato completo di T01–T79 è nel TEST_REGISTRY; un sottoinsieme PASS non chiude l’intero scenario.

## Risultati

- 273 test automatici PASS, 0 FAIL nella riesecuzione con cartella temporanea locale: 247 regressioni originarie adattate ai contratti correnti e 26 nuovi test R0/R1. Log integrale `R1/evidence/regression-verified.log`.
- Lint: 210 file JavaScript; build statica: PASS; parità schemi: PASS; audit accessibilità sorgente: 16/16; audit form: PASS; audit Pages: PASS.
- Il primo giro della suite finale aveva 269 PASS e 4 FAIL per `/tmp` non disponibile. Sono state conservate quelle evidenze; l’ambiente temporaneo è stato spostato nel workspace e la suite completa è stata rieseguita. Nessun test è stato eliminato o saltato per questi errori.
- Browser: BLOCCATO con `ERR_BLOCKED_BY_CLIENT`. Nessuna interazione sull’app, misura 100 ms, screenshot, prova a due tab o upgrade IndexedDB/offline reale viene dichiarata verificata.

## Migrazione e dati

- Catalogo reale: 600 vecchie revisioni e 1800 ricette conservate byte-logicamente identiche; 600 nuove revisioni V2, 1.200 revisioni totali, 600 forme correnti.
- Quarantena: 28 ricette escluse, incluse tutte le 20 della review. Le altre 8 sono escluse per prontezza al consumo ittica non documentata. Nessun dato storico viene eliminato.
- Nessuna revisione di sicurezza inventata. Nel controllo glutine: 0 ricette con compatibilità verificata, 106 incompatibili, 1.694 non verificabili secondo la nuova policy. Questo spiega il possibile blocco di generazione con allergie attive; non è stato risolto disattivando le regole.
- Mapping deterministici, batch con confronto dei current, checkpoint e ripresa; current locali conservati con proposta separata. Test di collisione, interruzione, doppia ripresa e nutrienti invariati PASS nel repository di test.
- Backup 2 conserva nuovi registri e staging, con lettura 1. Rimane richiesta la corrispondenza del catalogo attivo; autosufficienza cross-catalog e completo ripristino history/meta sono R6.

## Limiti e passaggio successivo

- Completare R0.4 e R1.4 con `VERIFICA_BROWSER.md` prima di dichiarare i gate di fase chiusi.
- R2.1 è il prossimo sviluppo di catalogo: selettore comune generico/forma, poi etichette/titoli e rimozione end-to-end del procedimento. Non anticipare l’attivazione delle preferenze V2 prima di R3.
- La concorrenza completa e le ricevute persistenti restano R4; il pannello attuale non chiude la sostituzione composta.
- I registri hanno 27 rilievi, 149 requisiti, 9 fasi, 40 attività e 79 test. La validazione strutturale deve restare verde ad ogni consegna.
- Decisioni DEC-01–12 in `specs/revision_v2/DECISIONI.md`. Report G/H conservati come evidenza della baseline.
