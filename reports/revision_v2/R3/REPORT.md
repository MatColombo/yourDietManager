# R3 — Frequenze, sicurezza e piano

**Implementazione consegnata; gate di accettazione BLOCCATO sulle prove reali del browser.** Non è una release stable. Riferimento normativo: `specs/revision_v2/CONTRATTO_R2_R3.md`.

| Attività | Risultato | Verifica disponibile |
|---|---|---|
| R3.1 | Contatore unico, finestre civili, meal/day, componenti deduplicati, esterni ignoti, finestre incomplete/future e storico dinamico | Test sintetici con expected espliciti; non tutti gli scenari end-to-end T23–T39 sono chiusi |
| R3.2 | Ricerca multi-giorno con min/max hard, ideale soft, capacità residua, esiti distinti e Worker annullabile | Soluzioni note su 7/31/90 giorni; budget esaurito distinto da impossibilità; cancellazione prima dell'avvio; Worker reale da provare |
| R3.3 | Configuratori numerici, Mai, scope, priorità avanzata, gruppi versionati, riepiloghi nel piano | Service e audit sorgenti; interazioni touch/tastiera, cambio lingua e reload da verificare nel browser |
| R3.4 | Adapter delle regole precedenti; conversione in bozza e salvataggio esplicito | Nessuna inferenza automatica dei numeri; rimozione della penalità legacy della regola convertita |
| R3.5 | Sicurezza da evidenze ingredienti, overlay corrente, validatore comune dei commit | Regressioni R0, servizi di sostituzione/ribilanciamento/undo; nuovi test overlay immutabile; concorrenza atomica fra schede R4 |

## Risultati

- 288 test passati, 41 file, nessun fallimento, test annullato o saltato. Sono stati eseguiti tutti i file separatamente e ripetuti i gruppi corretti. I log iniziali falliti sono conservati come diagnostica; `evidence/suite/summary.json` e `results.json` identificano il risultato finale.
- 15 test nuovi R2/R3, oltre ai 26 di R0/R1 e alla regressione precedente. Il numero dei test automatici non è il numero degli scenari di accettazione completi: il registro resta l'autorità sullo scope.
- Sintassi di 229 file JavaScript, build statica, audit form, audit sorgenti di accessibilità 16/16 e audit artifact Pages passati. Non sono prove di rendering/accessibilità reale.
- Prova sul corpus: versioni storiche intatte; migrazioni ripetibili; nessuna revisione di sicurezza inventata.

## Correzioni emerse dalla regressione

I dati sintetici dei vecchi test planner dichiaravano calorie senza una base nutrizionale coerente. Sono state aggiunte revisioni sintetiche specifiche per ricetta: il validatore continua a ricalcolare dai dati congelati, non è stato indebolito. I test dei vecchi esiti `failed` ora verificano `search_exhausted` o `invalid_input`, conservando i motivi hard attesi. Il vecchio test a 365 giorni ora verifica il rifiuto del range oltre 90; il ciclo continua a essere limitato a 31.

Le aspettative dei controlli sorgente sono state adeguate ai nuovi link contestuali e alle cache. I nuovi pannelli usano `controlledDetails`, così il loro stato passa dal sistema comune. I test storici G/H restano verifiche della baseline, non certificazioni della nuova release.

## Limiti e prossime verifiche

La precedente prova browser autorizzata è stata bloccata dalla policy URL (`ERR_BLOCKED_BY_CLIENT`). In questa fase non è stato usato un percorso alternativo per aggirarla. Restano BLOCCATI: browser reale, IndexedDB reale, aggiornamento da installazione R0/R1, offline dopo upgrade, responsività/annullamento effettivo del Worker e prove UI complete. Il test di cancellazione Node non sostituisce queste verifiche.

Il corpus non ha nuove approvazioni allergeniche. Sul dato originale, il controllo glutine dà 0 compatibili verificati, 106 incompatibili, 1.694 sconosciuti. Le esclusioni attive possono quindi rendere impossibile trovare proposte finché i dati non sono curati; non si trasforma uno sconosciuto in sicuro per aumentare la disponibilità.

R4 chiuderà comandi e concorrenza fra tab. R5 chiuderà revisione editoriale, praticità e ampliamento italiano/mediterraneo. R6 completerà spesa e backup autosufficiente. La modifica di preferenze o sicurezza non riscrive automaticamente i pasti già salvati.
