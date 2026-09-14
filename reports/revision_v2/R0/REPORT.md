# Rapporto R0 — implementazione e verifiche

11 settembre 2026 · app `1.1.0-dev.r1` · catalogo `1.2.0-planner-phase-d` · DB 7 / contenuti 4 / backup 2.

**Implementazione consegnata; gate di fase BLOCCATO per le prove browser/IndexedDB reale.** Non è una release stable né il completamento della CR V2.

## Identità

- Baseline H: `9210fba9cbbe5fc3311790b2fc6554e115a63856a97d555b8a173ee8b2306800`.
- Build verificata (sorgenti, schemi, asset, script e test): `caac4ac89441b02fd07cb166d2f1683102e47e1540855986fc6161d31122a087`. Elenco in `../BUILD_MANIFEST.json`.
- Piano tracciato 1.0: `specs/revision_v2/FASI_SVILUPPO.md`; origine e hash dei documenti in `baseline/MANIFEST.json`.

## Collegamenti fra revisione e sviluppo

| Attività | Rilievi | Requisiti | Modifiche | Prove/evidenze | Stato e residuo |
| --- | --- | --- | --- | --- | --- |
| R0.1 | R01, R11, R22, R26 | INV-10, DOC-01, DOC-02, DOC-03, DOC-04 | `scripts/validate-revision-v2-traceability.mjs`<br>`specs/revision_v2/TRACEABILITY.json`<br>`specs/revision_v2/TEST_REGISTRY.json`<br>`reports/revision_v2/STATE.json` | T50, T65, T74; EV-R0-001 | VERIFICATO; perimetro di questa attività verificato |
| R0.2 | R01, R02, R03 | SAFE-05, SAFE-06, SAFE-09, SAFE-10, CAT-12, CAT-13 | `src/domain/catalogQuarantine.js`<br>`src/domain/safetyCompatibility.js`<br>`src/planner/hardFilter.js`<br>`src/corpus/v1PhaseBRecipeGenerator.js` | T01, T02, T03, T04, T10, T54, T79; EV-R0-002, EV-R1-002 | VERIFICATO; perimetro di questa attività verificato |
| R0.3 | R01, R04, R05, R07 | SAFE-11, SAFE-12, HARD-01, HARD-02, HARD-03, HARD-05, HARD-06 | `src/services/planPreviewGuard.js`<br>`src/services/planGenerationService.js`<br>`src/services/effectivePlanService.js`<br>`src/services/operationHistoryService.js` | T02, T07, T08, T11, T12, T31, T43, T47, T71; EV-R0-002 | VERIFICATO; perimetro di questa attività verificato |
| R0.4 | R14, R15, R17, R21 | SWAP-01, SWAP-02, SWAP-03, SWAP-08, UX-07, UX-14 | `src/ui/planPages.js`<br>`public/data/locales/it.json`<br>`public/data/locales/en.json` | T40, T41, T42, T43, T44, T48, T78; EV-R0-003, EV-R0-004, EV-R0-005 | IMPLEMENTATO; Verifica visuale del comportamento e dei focus |

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
