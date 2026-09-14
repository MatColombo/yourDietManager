# yourDietManager R8 — build di sviluppo

Sono implementate tutte le cinque attività R8. La richiesta di procedere lasciando aperta l'accettazione del catalogo è registrata nel [contratto R8](specs/revision_v2/CONTRATTO_R8.md). R5, R7 e l'accettazione completa delle estensioni non sono chiuse da questa consegna.

## Avvio

Node 24 verificato, nessuna nuova dipendenza. Dalla cartella del progetto: `npm run dev`, poi aprire l'indirizzo mostrato. Non aprire index.html come file. `npm run build` ricrea `dist/`. Per aggiornare un'installazione precedente, salvare un backup dall'app e sostituire la distribuzione; il service worker attende la chiusura dei client precedenti. L'upgrade nel browser resta da collaudare.

## Dove sono le funzioni

| Funzione | Percorso | Comportamento |
| --- | --- | --- |
| Preferiti | Dettaglio ricetta, filtro ricette, Organizza → Preferiti | Segue la famiglia; peso facoltativo nelle preferenze aggiuntive |
| Pasto bloccato | Calendario → Gestisci giornata | Il riequilibrio lo mantiene e segnala nuove incompatibilità |
| Menu | Organizza → Menu salvati | Salva 1–31 giorni e applica su nuove date tramite anteprima |
| Dispensa | Organizza → Dispensa | Presente/assente, quantità e scadenza facoltative |
| Deduzioni dispensa | Organizza → Preferenze aggiuntive | Selezione esplicita; quantità sconosciute mai sottratte |
| Lotti/avanzi | Organizza → Lotti e avanzi | Porzioni prodotte, consumi pianificati e conservazione dichiarata |
| Stagionalità | Organizza → Stagionalità | Area, mesi e fonti inseriti dall'utente; nessun calendario imposto |
| Costi/budget | Organizza → Prezzi locali e Preferenze aggiuntive; riepilogo in Spesa | Prezzi con data/unità/fonte; parziale noto distinto da totale |

Le priorità preferiti/stagionalità partono da zero. In dispensa nessuna voce è sottratta prima della selezione. Il calcolo non decrementa lo stock: aggiornarlo dopo il consumo. Per modificare allocazioni di un lotto, scollegarlo e ricrearlo; la cronologia permette di annullare. Menu applicati azzerano note/aderenza dei pasti sostituiti, come dichiarato nell'anteprima.

Nessun nuovo ingrediente in staging è reso disponibile. Il catalogo mediterraneo R5 resta con 200 concetti, 307 forme e 120 brief nominali, tre estratti CREA e zero forme approvate: sono materiale per revisione, non nuova copertura certificata.

## Stato tecnico e verifiche

App 1.1.0-dev.r8; DB 9/31 store; contenuti 5; backup 4 (lettura 1–4); shell 42/dati 22. Epoch e catalogo distribuito invariati. Preferiti, menu, dispensa, lotti, fonti stagionali, prezzi e impostazioni entrano nel backup completo.

Eseguire `npm run revision:v2:regression`, `npm run lint`, `npm run hardening:forms`, `npm run hardening:a11y`, `npm run build`, `npm run pages:audit`. Dossier: `npm run revision:v2:dossier`; tracciabilità: `npm run revision:v2:trace`. `npm run revision:v2:gate` resta bloccato finché i 74 scenari core non sono accettati. I risultati effettivi sono in [rapporto R8](reports/revision_v2/R8/REPORT.md) e [matrice](specs/revision_v2/MATRICE_R8.md).

Browser reale, IndexedDB/multi-tab e offline non verificati in questo ambiente. La build è destinata allo sviluppo e al collaudo, con accettazione catalogo ancora aperta. Le precedenti consegne e i loro rapporti mantengono valore storico, non attestano la nuova build.
