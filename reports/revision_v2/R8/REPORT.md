# R8 — tutte le attività implementate, accettazione catalogo aperta

R8.1–R8.5 sono implementate nella build `1.1.0-dev.r8`. La richiesta dell'utente autorizza l'avvio prima della chiusura R7; non equivale ad accettazione del catalogo o del prodotto. Sono disponibili preferiti e pasti bloccati, menu riutilizzabili, dispensa, lotti e avanzi, stagionalità per area e costi locali. Nessuna nuova approvazione editoriale o promozione stable.

## Consegne collegate alla revisione

| Attività | Origine | Rapporto |
| --- | --- | --- |
| R8.1 Preferiti e blocchi | CR §16, EXT-01, T66 | [R8.1](R8.1-REPORT.md) |
| R8.2 Menu | CR §16, EXT-02, T67 | [R8.2](R8.2-REPORT.md) |
| R8.3 Dispensa | CR §16, EXT-03, T68 | [R8.3](R8.3-REPORT.md) |
| R8.4 Lotti/avanzi | CR §16, EXT-04, T69 | [R8.4](R8.4-REPORT.md) |
| R8.5 Stagionalità e costo | CR §16, EXT-05/06, T70 con due scope | [R8.5](R8.5-REPORT.md) |

La [matrice R8](../../../specs/revision_v2/MATRICE_R8.md) mantiene il collegamento completo fra requisito, attività, sorgente e verifica. Gli EXT originano nella CR, senza inventare nuovi rilievi della review. I 27 rilievi, 149 requisiti, 40 attività e 79 scenari restano invariati.

## Risultati e correzioni

Diciotto test di integrazione R8 verificano le regole delle estensioni, compresa persistenza in memoria, confronto del contesto prima della conferma, relazioni bidirezionali dei lotti, backup v4 con tutte le raccolte, lettura del v3, import malformato e migrazione idempotente. La regressione completa copre 44 file: il totale definitivo e il digest della build sono in `evidence/suite/summary.json`. I test Node non sono i cinque scenari di accettazione completi T66–T70.

Il caso sintetico quattro porzioni/quattro pasti produce 400 g di ingrediente da una sola produzione, non 1.600 g; le frequenze contano quattro consumi. Le singole porzioni personali restano 1. Il riequilibrio conserva componenti bloccati e assegnati, verificando comunque la sicurezza. Menu e lotti entrano nella cronologia undo/redo; il backup include le sei nuove raccolte e i loro riferimenti storici. Una quantità sconosciuta in dispensa o un prezzo mancante restano distinti da zero.

Nel controllo del sorgente è emerso un errore di sintassi nella scheda del prossimo pasto in Oggi (`next.(...)`): corretto e verificato dal lint di tutti i moduli. Corretti anche il confronto con i giorni originali durante il salvataggio menu, il ricalcolo della sintesi nutrizionale dopo applicazione, la conferma delle anteprime senza falso messaggio di salvataggio, e l'esclusione delle forme storiche incompatibili dalle deduzioni dispensa. I dialog R8 usano i token del tema esistente.

I log iniziali falliti sono in `evidence/initial-suite`. Le ripetizioni finali correggono aspettative esplicite su DB/store/backup/cache e fixture sintetiche incomplete; non eliminano gate. I test di compatibilità leggono ancora i formati precedenti. Form, accessibilità del sorgente, lint, esempi di schema, build, mirror e Pages hanno log dedicati. Lo script del vecchio gate stable eseguito nei test resta bloccato come previsto; il suo report originario è conservato come storico.

## Versioni e compatibilità

DB 9 con 31 store, contenuti 5, backup writer 4/reader 1–4, shell 42/cache dati 22. Epoch invariato. Dati catalogo e staging R5 sono identici al parent: `catalog-review-status.json` registra impronte e stato, con 200 concetti/307 forme/120 brief pianificati e zero revisionati. Il pilot R5 resta bloccato; niente incremento di copertura approvata.

La migrazione aggiunge store e metadati senza cambiare revisioni congelate. Un client DB8 diventa obsoleto all'upgrade. Il backup autosufficiente porta tutti gli store e usa lo stesso confine transazionale protetto R6; preserva una copia pre-import. Prezzi, area, mesi e conservazione sono dichiarazioni documentate dell'utente, non contenuti nutrizionali generati. La dispensa non si decrementa automaticamente. Per cambiare un'allocazione lotto, scollegare e ricreare tramite anteprima.

## Accettazione ancora aperta

`acceptance-gate.json`: tutte le cinque attività implementate, T66–T70 PARZIALI. `core-gate.json`: R7 ancora BLOCCATO. `browser-matrix.json` dettaglia le prove IT/EN a 320/375/768/1280/1440 px, focus/touch, reload, IndexedDB reale, due tab, quote/interruzioni e upgrade offline non eseguite. Il browser autorizzato aveva rifiutato l'app con ERR_BLOCKED_BY_CLIENT; non sono stati usati aggiramenti.

Non dichiarare completezza R8 prima della verifica degli scope mancanti. Per continuare: collaudare la matrice browser R8, completare le revisioni autentiche R5 e rieseguire il gate core sulla build candidata. Le misure prestazionali R7 restano storiche: non sono nuove misure R8.
