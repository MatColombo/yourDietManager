# Decisioni R0/R1 — 11 settembre 2026

| ID | Decisione | Motivo e collegamento |
| --- | --- | --- |
| DEC-01 | Build di sviluppo 1.1.0-dev.r1, DB 7/contenuti 4/backup 2 | MIG-01; distinguere la nuova linea dal freeze H |
| DEC-02 | Quarantena esplicita più controllo strutturale dei prodotti ittici | CAT-12, SAFE-06; venti casi baseline e altri casi non documentati rilevati dall'audit |
| DEC-03 | Sicurezza legacy resta unreviewed | SAFE-05/06; nessuna fonte o firma alimentare inventata |
| DEC-04 | Preview di sessione, massimo 32, coda locale e rifiuto del replay | HARD-02/05; protezione R0 concreta, confronto atomico e ricevute persistenti R4 |
| DEC-05 | Pannello adiacente non modale in R0 | SWAP-01/02; feedback e preservazione bozze prima del drawer completo R4 |
| DEC-06 | Mapping di identità deterministico, nuove revisioni, current locale invariato | ING-06, MIG-02/04; nessuna fusione lessicale o media dei nutrienti |
| DEC-07 | Batch di 100 con checkpoint e precondizioni transazionali | MIG-02; ripresa senza duplicati e prestazioni sostenibili anche sui 600 ingredienti |
| DEC-08 | Preferenze e SafetyProfile 2 in staging, attivazione rifiutata dal runtime V1 | PREF-06/20; evitare regole apparentemente attive che il solver ignora |
| DEC-09 | Backup 2 include i nuovi record, conserva ancora il vincolo allo stesso catalogo | MIG-01; predisposizione R1, chiusura transitiva e completo restore R6 |
| DEC-10 | Cache shell v38/data v18, epoch invariata | MIG-02, INV-01; nuovi moduli offline senza reset dati |
| DEC-11 | Prove G/H sulla baseline conservata; prove runtime nuove separate | DOC-03/04; non modificare i report storici per renderli accettazione della V2 |
| DEC-12 | Browser e IndexedDB reale restano BLOCCATI, nessun aggiramento dell'URL policy | DOC-04; ERR_BLOCKED_BY_CLIENT nell'ambiente della consegna |

Le etichette di stato migrate sono provvisorie. Le varianti editoriali, i titoli e gli alias italiani del catalogo definitivo sono R2/R5. Le revisioni originali restano disponibili e non vengono riscritte per cambiare la presentazione.

## Decisioni R2/R3

| ID | Decisione | Collegamento |
|---|---|---|
| DEC-13 | Scrittori ricetta V2 e export ordinario 2; V1 solo lettura/compatibilità storica | R2.3, REC-04–07, T50/T73 |
| DEC-14 | Nuove versioni dei titoli con supersedes; nessuna riscrittura del corpus originario o dei current locali | R2.2, INV-01, REC-01–03 |
| DEC-15 | Tre correzioni di identità legate a record e descrittori esatti; nessuna equivalenza generica | R2.1/R2.2, ING-08/09, T15 |
| DEC-16 | Un contatore per solver, UI e commit; meal/day, ignoti separati, prefissi pending | R3.1, PREF-08–14, T26–34 |
| DEC-17 | Min/max hard, ideale soft, orizzonte 1–90 separato dal ciclo 1–31; nessun rilassamento automatico | R3.2, PREF-05/17/19, T24/T37/T38 |
| DEC-18 | Legacy rules conservate fino a conversione e Salva; nessun numero dedotto | R3.4, PREF-20, T39 |
| DEC-19 | Sicurezza corrente come overlay e validatore comune; concorrenza completa rinviata al contratto R4 | R3.5, SAFE-11–13, HARD-01–06 |
| DEC-20 | Cache shell 39/data 19; nessun reset DB o epoch | R2/R3, MIG-02 |
| DEC-21 | Test eseguiti per file, log iniziali e ripetizioni conservati; 288 pass non equivalgono a 79 scenari completi | DOC-03/04, R7 |

## DEC-22 — R4: confronto transazionale e ricevuta persistente

Il read set sigillato e il before sono confrontati nella stessa transazione che scrive piano, history e ricevuta. Nessun lock in memoria è prova di isolamento fra schede. Il percorso commitPlanPreview delega al servizio comune. Undo contestuale è vincolato all’operazione mostrata; non annulla silenziosamente un’operazione successiva.

## DEC-23 — R4: composizioni solo con approvazione legata ai contenuti

Intero pasto può usare insiemi di versioni approvati e vincolati al digest dell’array ordinato. Max componenti della classe pasto 1–3, default 3. L’assenza di insiemi approvati produce una ricerca limitata/esaurita, non una falsa prova di impossibilità. Il test composto è sintetico; non rappresenta approvazione del catalogo reale.

## DEC-24 — R4: dichiarazione di sicurezza esplicita e riprendibile

La nuova route onboarding non blocca il catalogo. Bozza versione 2 e dichiarazione distinta dai vincoli; il digest del profilo evita di mostrare dichiarazioni obsolete. Configurazione e dichiarazione finale si salvano atomicamente.

## DEC-25 — R5: nominale distinto da pubblicato

Il manifest elenca 200 concetti/307 forme e 120 brief; tre estratti CREA sono acquisiti. Zero record ha tutte le review. Il contratto vieta di contare come catalogo pronto le proposte o approvazioni sintetiche. Pilot/scala e fase R5 rimangono BLOCCATI; la consegna contiene strumenti e staging riutilizzabili.

## DEC-26 — R5: definizioni nutrizionali e provenienza

Preservare Southgate/Atwater e carboidrati disponibili/totali come definizioni esplicite. Mancanti/tracce non sono zero. Gli estratti manuali hanno un proprio digest, distinto da un archivio completo della fonte. Ciqual 2025 identificato, ma dati e termini del pacchetto non acquisiti: nessuna licenza presunta.

## DEC-27 — Backup portabile e writer precedente

R6/R7: formato backup 3 con snapshot completo dei 25 store come superset della chiusura transitiva. Reader 1/2 conservato con dipendenza dal catalogo originale. DB 8 senza nuovi store rende obsoleto il writer DB 7; contenuti 4 ed epoch invariati. Copia pre-import e metadati nella stessa transazione finale, con confronto dello stato letto.

## DEC-28 — Materialità della spesa

Checklist basata su digest dei componenti e degli input d'acquisto, non su planUpdatedAt. Le conversioni conservano ID/versione/fonte e richiedono scelta esplicita. Quantità aumentate già spuntate richiedono una nuova verifica. Ordine reparti indipendente dalla tassonomia.

## DEC-29 — Misure e accettazione R7

315 test Node non equivalgono ai 74 scenari core: 3 soli scenari hanno scope completo nel registro corrente. Benchmark con 10.000 copie sintetiche riproducibili e repository in memoria; tutti i campioni restano nel rapporto. R7 è BLOCCATA, non stable. Mancano browser reale, corpus R5 revisionato e completamento degli scope core. Nessuna firma o dato editoriale generato per sbloccare il gate.
