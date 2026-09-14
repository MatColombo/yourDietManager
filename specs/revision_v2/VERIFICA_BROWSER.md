# Prove browser ancora aperte

Stato alla consegna: BLOCCATO nell'ambiente di sviluppo (`ERR_BLOCKED_BY_CLIENT`, URL locale negato dalla policy del browser). Nessuno screenshot dell'app o PASS interattivo è disponibile. I test Node usano un repository in memoria; non sono prove di IndexedDB reale.

## R0.4 — Gestione giornata

1. Avviare la build e generare un piano con una giornata lunga. Aprire Gestisci giornata; registrare build, viewport, browser, lingua e fixture.
2. Scrivere una nota senza salvarla in un pasto in basso. Premere Sostituisci. Atteso: il pannello adiacente appare subito, il titolo riceve focus, l'attesa è visibile e la nota non sparisce.
3. Verificare risultati, zero risultati con causa e un errore simulato della lettura dati. Non è sufficiente trovare il testo nel sorgente.
4. Avviare A e subito B: una risposta di A non deve sovrascrivere B. Escape/Annulla tornano al pulsante corretto; nessun commit.
5. Confermare un'alternativa: un solo salvataggio, esito visibile, nota persistita conservata; verificare undo e aderenza. Ripetere con tastiera, mobile e IT/EN.
6. Per il limite 100 ms usare una misura della macchina di riferimento. Non attribuire PASS in assenza di misura. Modalità drawer, ricerca avanzata e composizione restano R4.

## R1.4 — Upgrade reale e continuità

1. Su un'origine locale di prova installare la baseline H. Creare piano, note, checklist, regole e una modifica locale; esportare un backup prima dell'upgrade.
2. Sostituire i file serviti con questa build mantenendo la stessa origine. Verificare DB 7/contenuti 4, migrazione completa e current locale conservato, senza reset epoch. Confrontare export e riferimenti storici.
3. Interrompere durante un batch di migrazione e riaprire due volte. Atteso: ripresa senza duplicazioni, batch atomici, irrisolti segnalati. Ripetere con errore di quota e reload.
4. Verificare una scheda già aperta durante l'upgrade, il caricamento dei nuovi moduli dopo refresh e un successivo avvio offline. Non dedurre la riuscita dalla sola presenza dei file nella cache list.
5. Fare round-trip backup 2 sullo stesso catalogo e verificare registri/staging e riferimenti creati. Non estendere il risultato al ripristino cross-catalog previsto in R6.
6. Preparare anteprima A; cambiare allergia o nota in B; confermare A. Atteso: rifiuto. La chiusura della corsa fra confronto e scrittura e delle ricevute persistenti è R4, con relativo test a due tab.

Conservare azioni, attesi, effettivi, screenshot pertinenti, build SHA e log nel dossier di fase. Aggiornare i registri soltanto dopo la prova.
