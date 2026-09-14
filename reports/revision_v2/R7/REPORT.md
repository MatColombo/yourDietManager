# R7 — regressione e dossier, core non accettato

Consultare `evidence/suite/summary.json` per il totale effettivo dei test automatici e `core-gate.json` per i 74 scenari core. I due numeri hanno significati diversi. I log inizialmente falliti sono conservati in `evidence/initial-suite`; i log finali comprendono le ripetizioni delle verifiche interessate dalle correzioni.

`performance.json` registra macchina, import di 10.000 ricette sintetiche, query fredde/calde con tutti i campioni, alternative e piani 7/31/90. Nessun outlier eliminato. Le prestazioni osservate dei servizi rispettano i budget misurati; la ricerca fredda è riportata separatamente dalla p95 a caldo. Non misurati il pannello browser e l'annullabilità reale. Dataset sintetico e memoria non sostituiscono il catalogo accettato e IndexedDB.

Build, mirror degli schemi, form, accessibilità del sorgente e Pages hanno log dedicati. L'accessibilità del sorgente non equivale a un audit visuale. Le baseline H e precedenti restano storiche, con digest originali; il gate metadata-only precedente non autorizza questa revisione.

Gate BLOCCATO: browser, prerequisiti editoriali R5, T64 completo e matrice core ancora aperti. Nessuna firma umana o promozione stable generata. R8 resta estensione pianificata, non abilitata.

Consegna: 315 test su 43 file PASS; 3/74 scenari core completi. Ricerca calda p95 37,1 ms, fredda 290,1 ms; alternative di servizio p95 1.225,8 ms; piani 7/31/90 giorni 1.970,8/3.750,9/14.581,6 ms sul workload sintetico dichiarato.
