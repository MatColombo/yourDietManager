# Contratto attivo R6/R7

L'utente ha autorizzato R6 e R7. Baseline, ID della revisione e titolarità delle fasi restano quelli di `FASI_SVILUPPO.md`. Versione applicativa 1.1.0-dev.r7, DB 8 (stessi 25 store), contenuti 4, backup writer 3 e reader 1/2/3, shell 41 e cache dati 21. Epoch invariato. Non eseguire R8 o pubblicazione stable.

## R6.1 Acquisti

Usare le revisioni congelate del piano. Raggruppare reparto → concetto → forma; sommare soltanto stessa famiglia-forma, unità e stato. L'ordine dei reparti è una preferenza di spesa in `shoppingSettings:R6`, non una modifica alla tassonomia. Il selettore condiviso ricerca concetti e forme; la preferenza di acquisto memorizza ID e versione della conversione direzionale. Ammettere soltanto conversioni reviewed con fonte, direzione e fattore positivo. Non invertire archi, non concatenarli e non stimare rese. Il caso 150 g cotti × 0,4 = 60 g secchi è una fixture sintetica, mai dato nutrizionale pubblicato. Nessuna conversione è creata o approvata automaticamente.

L'anteprima mostra quantità, unità, fattore, fonte e risultato; quando la forma non contribuisce al periodo, dichiara l'esempio su 100 unità. I componenti e i nutrienti del piano restano immutati. Quantità per persone 0,1–20 applicate esclusivamente alla spesa.

## R6.2 Checklist

`sourceInputDigest` include periodo, moltiplicatore, componenti/versioni, revisioni, quantità/unità, inclusioni, date e conversioni utilizzate. Non include aderenza, note, ora di modifica o ordine dei reparti. Gli esterni sono esclusi dagli acquisti e dichiarati nell'export. Le checklist precedenti senza digest richiedono un aggiornamento esplicito, conservando righe manuali e note.

All'aumento di una quantità già spuntata togliere la spunta e impostare `quantityChanged`; mostrare «Quantità cambiata da verificare». Una nuova spunta esplicita azzera l'indicazione. Scrivere gli aggiornamenti con confronto della checklist letta, evitando perdita di modifiche concorrenti. Periodo della checklist immutato durante refresh; le sue righe manuali appartengono a quel periodo. Testo e stampa usano solo il documento selezionato, con ordine reparti persistito. Il contenuto stampato è textContent, non HTML interpretato.

## R6.3 Backup

Il formato 3 porta `portableSnapshot`: tutti gli store, tutte le revisioni installate e tutte le versioni storiche. Questo superset soddisfa la chiusura transitiva senza dipendere da un download successivo. I campi legacy nel payload restano per continuità diagnostica; configuration deve coincidere con lo snapshot. L'autorità per il ripristino è lo snapshot. Nessuna collisione divergente fra ID immutabili può sovrascrivere dati.

Lettura di export in un'unica transazione readonly. Prima dell'import: limite 64 MiB (anche prima di file.text), schema, checksum obbligatorio formato 3, chiavi univoche, versioni supportate, riferimenti congelati anche in undo/redo, appartenenza delle revisioni, tassonomie, regole, famiglie e conversioni. Non interpretare proprietà importate come codice. Gli snapshot history possono scrivere solo store e meta del piano autorizzati dal contratto.

Conferma in dialog prima del ripristino. Una sola transazione readwrite confronta tutti gli store letti, applica dati e metadati e conserva `backupRecovery` con lo stato precedente. Errore/quota/interruzione prima del commit non deve produrre un ripristino parziale. Il backup di recupero è scaricabile anche dopo reload e non si annida negli export successivi. Metadata importabili solo da allowlist: nessuna dichiarazione di cache offline già presente viene trasportata su altro dispositivo. Reader 1/2 richiede ancora il catalogo originale necessario a risolvere i riferimenti; confluisce poi nello stesso confine transazionale protetto. Non promettere recupero di dati assenti da un vecchio backup e dal dispositivo.

## R6.4 Aggiornamento

DB 8 serve a rendere incompatibile il vecchio writer DB 7. Su versionchange chiudere la connessione e rendere il client obsoleto, senza riapertura automatica. Un errore di apertura libera la promise fallita; un upgrade bloccato produce indicazione UI. Service worker non forza skipWaiting: il worker completo attende la chiusura dei client precedenti. HTML, moduli e schemi usano la shell installata; non mescolare schemi recuperati dalla cache dati con la shell precedente. Mantenere staging, digest e attivazione atomica del catalogo già implementati. Download/quote/two-tab/offline devono essere verificati nel browser: test in memoria non sono sostitutivi.

## R6.5 Privacy

Diagnostica esportata solo per azione locale, mediante allowlist di versioni, contatori e codici noti. Escludere nomi, regole, allergie, note, ID personali, messaggi arbitrari e stack. Nessun invio o telemetria. Non aggiungere una funzione di invio per questa fase. Contenuti importati restano testo; eventuali link esterni richiedono schema http/https senza credenziali. T74 completo richiede un log di rete con profilo sintetico e verifica offline; l'audit del sorgente è parziale.

## R7 Accettazione

I 74 scenari core sono T01–T65 e T71–T79: non sono il conteggio dei test Node. `revision:v2:gate` deve fallire finché uno scenario è incompleto, un requisito core non verificato o un P0/P1 resta aperto. R19 e R25 restano core. Rapporti e test devono essere legati al digest della build attuale; rapporti precedenti sono storici. Non promuovere un ID intero sulla base di una sottoprova.

`revision:v2:benchmark` registra macchina, dataset, seed, campioni senza rimozione outlier, import, ricerca fredda/calda e piani 7/31/90. Il dataset sintetico da 10.000 ricette serve a misure riproducibili di servizio. Non equivale a corpus mediterraneo revisionato, IndexedDB reale, UI, alternative o annullamento browser. T64 resta incompleto finché tutti gli scope prescritti non sono verificati.

R5 pilot/scala resta bloccato: 0 forme approvate. Browser autorizzato nella sessione precedente respinto con ERR_BLOCKED_BY_CLIENT; nessun aggiramento mediante altro browser o CDP. R6 e R7 possono consegnare codice, regressioni e dossier con gate BLOCCATO. Nessuna firma umana sintetica, ACCEPT V1 o promozione stable.
