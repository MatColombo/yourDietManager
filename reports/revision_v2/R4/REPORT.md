# R4 — implementazione e limiti di accettazione

Implementati pannello modale contestuale, retry/annullamento, ricerca e filtro concetto/tempo, paginazione, scelta componente/intero pasto, composizioni approvate e rivalidazione R3. Note e componenti non selezionati vengono conservati. Il confronto transazionale copre read set, before, history e ricevuta persistente; il percorso alternativo commitPlanPreview usa lo stesso servizio. Undo/redo sono protetti da confronto autorevole. Gli errori sincroni di clonazione abortiscono il confine transazionale.

Implementati agenda mobile, card senza titolo ricetta duplicato, disclosure Avanzate e preset di composizione espliciti. Il nuovo profilo guidato ha sei passi, bozza riprendibile e salvataggio atomico di configurazione/dichiarazione. Nessuna allergia dichiarata e profilo non verificato sono stati distinti; gli obiettivi dimostrativi sono segnalati.

Le prove automatiche sono nel dossier `evidence/suite/summary.json` e nei log per file. Le nuove prove includono modifica fra recheck e commit, replay dopo undo, before obsoleto, conservazione componente, paginazione, sostituzione composta e abort sincrono. Il repository in memoria e lo stub di transazione sono prove software: non simulano fedelmente tutti i comportamenti di IndexedDB.

**Gate R4 BLOCCATO:** non sono state eseguite le prove browser reali della matrice, i due client IndexedDB, focus/touch/IT-EN/zoom e upgrade offline. La policy precedente ha bloccato l’URL locale nel browser autorizzato; non è stata aggirata. Il tempo di apertura di 100 ms e la resa visiva non sono certificati.

La spesa continua a usare il meccanismo di obsolescenza esistente; il digest dei soli input materiali resta R6. Le composizioni approvate del catalogo reale attendono la revisione R5: la capacità software è verificata su fixture dichiarate, non su approvazioni culinarie inventate.

Contratto: `specs/revision_v2/CONTRATTO_R4_R5.md`. Collegamento completo: `MATRICE_R4_R5.md`, `TRACEABILITY.json`, `TEST_REGISTRY.json` e `STATE.json`.
