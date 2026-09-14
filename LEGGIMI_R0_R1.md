# Consegna R0/R1

Il progetto aggiornato conserva il catalogo di origine e introduce protezioni del planner e nuovi contratti dati. Il dettaglio verificabile è nei rapporti R0/R1 e nel registro di stato.

- R0: quarantena versionata, evidenza di compatibilità distinta dai tag, anteprime legate al contesto, doppio invio nella sessione, before autorevole, pannello di sostituzione vicino al pasto e bozze delle note.
- R1: concetti e forme separati, gruppi/mapping/conversioni versionati, schemi 1/2, migrazione additiva e staging di preferenze/sicurezza. Nuove ricette di schema 2 senza procedimento.
- I 600 record nutrizionali originali e le 1.800 ricette sono preservati; la migrazione crea 600 revisioni 2 aggiuntive. Nessuna revisione alimentare viene inventata.

## Avvio e verifica

1. Estrarre l'intera cartella; usare la stessa origine locale dell'installazione precedente se si vuole verificare l'upgrade del suo IndexedDB.
2. Con Node.js 24: `npm run dev` e aprire l'indirizzo mostrato. La cartella dist è generata da `npm run build`.
3. Eseguire `npm run revision:v2:test`, `npm run revision:v2:audit`, `npm test`, `npm run lint`, `npm run hardening:forms`, `npm run hardening:a11y`, `npm run build`, `npm run revision:v2:trace`.
4. Completare [le prove browser](specs/revision_v2/VERIFICA_BROWSER.md). Un esito non verificato resta aperto.

## Confini della consegna

Il browser remoto ha rifiutato l'app locale con ERR_BLOCKED_BY_CLIENT. Non è stata verificata visivamente la correzione di Sostituisci né l'upgrade in un vero IndexedDB. Le prove automatiche dei servizi e della migrazione non sostituiscono questi gate.

Le nuove frequenze non sono ancora operative nell'interfaccia; il motore e gli editor sono R3. Il selettore generico e la rimozione completa delle istruzioni V1 sono R2. Le sostituzioni composte e la concorrenza completa tra tab sono R4. Il catalogo mediterraneo curato è R5. Il backup autosufficiente anche con diverso catalogo è R6: il formato 2 R1 mantiene il vincolo al catalogo attivo.

Una regola allergene attiva esclude i candidati privi di compatibilità verificata. Sul catalogo attuale questo può impedire la generazione; il messaggio va risolto con dati verificati, non attenuando l'allergia.

## Ripresa dello sviluppo

Leggere nell'ordine `specs/revision_v2/FASI_SVILUPPO.md`, `CONTRATTO_R0_R1.md`, `DECISIONI.md`, `reports/revision_v2/STATE.json`, i rapporti di fase e `TRACEABILITY.json`. Gli ID R01–R27, i 149 requisiti, le 40 attività e T01–T79 restano invariati. R7 deve riverificare il core completo. Non interpretare il freeze H come accettazione della nuova versione.
