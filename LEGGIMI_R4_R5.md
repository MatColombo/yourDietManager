# yourDietManager — sviluppo R0–R5

Build `1.1.0-dev.r5`. Include le modifiche precedenti R0–R3.

## Novità R4

- Sostituzione in pannello modale: ricerca, alimento generico, tempo massimo, paginazione, retry e annullamento.
- Scelta di un componente o dell’intero pasto, con conservazione degli altri componenti e porzioni fisse. Supporto a composizioni esplicitamente approvate.
- Impatto su energia giornaliera e frequenze; conferma rivalidata, history e ricevuta persistente del comando.
- Confronto transazionale dei dati per impedire sovrascritture concorrenti; abort su errori di serializzazione; undo/redo protetti.
- Agenda mobile, card più compatte, opzioni avanzate raggruppate, preset di composizione espliciti.
- Profilo guidato riprendibile in sei passi; distinzione fra sicurezza non verificata, nessuna esclusione dichiarata e regole configurate. Valori dimostrativi riconoscibili.

## R5: cosa contiene realmente il pacchetto

Manifest nominale di **200 alimenti e 307 forme**, pilot selezionato **40/60**, **120 proposte di piatti**. Adapter distinti CREA, Ciqual, USDA ed etichette; staging, import delle review e conteggi di copertura. Tre estratti CREA reali e tracciati dei ceci nelle forme secca, bollita e sgocciolata in scatola.

**Non è ancora un nuovo catalogo mediterraneo pubblicato.** Nessuna forma ha tutte le review richieste; il pilot e la scala sono bloccati. Le 120 proposte non contengono ricette materializzate con quantità/nutrienti inventati. Il catalogo operativo resta quello precedente, con le correzioni R0–R3.

Per chiudere R5 servono le restanti fonti, mapping e revisioni nutrizionali, di sicurezza e culinarie del pilot. Questo requisito proviene da R5.3/T55 e dalla skill del progetto. Il dossier distingue i controlli automatici dalle approvazioni effettivamente ricevute.

## Verifiche e limiti

**302 test automatici passati** in 42 file; build, sintassi, form, audit del sorgente per accessibilità e tracciabilità validi. Le fixture sintetiche sono dichiarate nei test.

Restano da eseguire nel browser autorizzato le prove visuali desktop/mobile, focus/touch, due schede IndexedDB, reload/offline e Worker. Il blocco URL riscontrato nelle fasi precedenti non è stato aggirato. R4 e R5 restano fasi con gate aperti, e questa build non è stable.

La spesa conserva l’obsolescenza precedente: il digest dei soli input materiali resta R6. Non avviare automaticamente R6 o la pubblicazione stable.

## Avvio

Da questa cartella, con Node.js recente:

```bash
npm run dev
```

Aprire l’indirizzo locale stampato dal server. La cartella `dist/` contiene la PWA statica già compilata. Non aprire `index.html` direttamente con file://. Per il profilo guidato usare Configurazione → Configura o riprendi il profilo; per le sostituzioni usare la gestione giornata.

## Comandi per chi continua lo sviluppo

```bash
npm run revision:v2:test
npm run revision:v2:mediterranean
npm run build
npm run revision:v2:trace
```

Il secondo comando rigenera lo staging, senza pubblicare un catalogo. Le review esterne complete si importano con:

```bash
node scripts/revision-v2/import-mediterranean-reviews.mjs review-decisions.json
```

## Collegamenti completi

- `specs/revision_v2/CONTRATTO_R4_R5.md`: specifica vincolante per l’implementazione e i passi mancanti.
- `specs/revision_v2/MATRICE_R4_R5.md`: attività → requisiti → file → evidenze.
- `specs/revision_v2/TRACEABILITY.json` e `TEST_REGISTRY.json`: 149 requisiti, 79 scenari e collegamenti alla review.
- `reports/revision_v2/STATE.json`: stato di tutte le fasi, gate e prossimo lavoro.
- `reports/revision_v2/R4/` e `R5/`: rapporti, log, copertura, matrice browser ed esclusioni.
- `data/revision-v2/mediterranean/`: manifest, brief, estratti e staging.
- `reports/revision_v2/R4/source-history.bundle`: storia Git portabile, inclusa la baseline.

Nessun reset dell’epoch e nessuna riscrittura dei record storici di ricette o ingredienti. DB 7, contenuti 4, backup 2; cache shell/data aggiornate a 40/20.
