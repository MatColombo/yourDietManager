# Contratto attivo R8 — estensioni con accettazione catalogo aperta

## Autorizzazione e precedenza

L'utente ha richiesto «facciamo fase R8 con accettazione revisione catalogo ancora aperta». Questa istruzione autorizza lo sviluppo delle cinque attività R8 prima della chiusura del normale ingresso R7. Non costituisce approvazione del catalogo, completamento di R7 o promozione stable. Prevale sul divieto storico di iniziare R8 nel contratto R6/R7. Restano obbligatori tutti gli invarianti R0–R7 e gli ID di review, requisiti, attività e scenari originari.

Versioni: app `1.1.0-dev.r8`, DB **9**, contenuti **5**, backup writer **4**, reader **1/2/3/4**, shell **42**, cache dati **22**. Epoch invariato. Catalogo distribuito `1.2.0-planner-phase-d` invariato; staging R5 non attivato. Le funzioni sono disponibili nella build di sviluppo; l'accettazione delle estensioni resta distinta dall'abilitazione tecnica. `enabledExtensions` nello stato elenca esclusivamente estensioni certificate, `developmentExtensions` quelle disponibili per collaudo.

## Invarianti comuni

1. Usare repository, `atomicMutate` e schema canonico/mirror. Aggiungere sei store senza eliminare o riscrivere le revisioni storiche. Tutti gli store entrano nello snapshot atomico del backup.
2. Ogni componente di un pasto personale conserva `servings: 1`. Porzioni del lotto e moltiplicatore persone riguardano gli acquisti; non riscalano i nutrienti del piano.
3. Preferiti e stagionalità sono obiettivi soft facoltativi, peso 0 per default, configurabili 0–5. Non possono superare allergie, esclusioni, energia, frequenze o ammissibilità della ricetta.
4. Menu e lotti richiedono anteprima sigillata, rivalidazione del piano completo interessato e dei confini temporali, confronto del contesto e transazione finale protetta. Cambiamenti concorrenti di configurazione, catalogo, piano o estensioni invalidano la conferma. Un comando già applicato non è riutilizzabile dopo undo.
5. Non creare calendari stagionali, prezzi, rese, conservabilità, revisioni culinarie o approvazioni editoriali presunte. Le fonti immesse dall'utente restano dichiarazioni locali, non attestazioni automatiche del sistema.
6. Non introdurre account, servizi di rete, ordini, telemetria o nuovi parametri nutrizionali nelle schede ingredienti/ricette. I dati R8 sono dati personali separati.

## R8.1 — EXT-01, T66: preferiti e blocchi

`recipeFavorites` ha chiave `recipeId`, `schemaVersion:1` e `createdAt`. Il preferito segue la famiglia ricetta, anche quando cambia la versione corrente. Pulsante nel dettaglio, filtro «Solo preferiti» nella ricerca e raccolta in Organizza. Ricette archiviate/non installate restano escluse dalla normale ricerca disponibile e dalla generazione ordinaria.

Il blocco è `MealSlot.locked`, facoltativo, falso in assenza. La gestione giornata offre Blocca/Sblocca con stato `aria-pressed`. Sostituisci è disabilitato con spiegazione per un pasto bloccato o assegnato a un lotto. Il riequilibrio tratta i componenti congelati come unica scelta dello slot, preservando il resto dello slot; rivalida comunque le regole correnti. Se la ricetta bloccata diventa incompatibile, l'anteprima deve fallire con diagnostica e il piano resta immutato. Lo sblocco esplicito resta possibile. Blocco/sblocco sono operazioni annullabili della cronologia.

## R8.2 — EXT-02, T67: menu

`savedMenus`: `menuId`, nome 1–100 caratteri, timestamp, da 1 a 31 giorni. Ogni giorno ha offset 0–30; ogni assegnazione identifica classe pasto, ordinale dei soli slot pianificati della stessa classe e 1–3 componenti con `recipeId`, `recipeVersionId`, `servings:1`. Non serializzare CalendarDay nel modello. Non copiare aderenza, note, blocchi o collegamenti a lotti.

Salvare da un intervallo completo di un piano. Confrontare nella transazione i giorni usati per la lettura, non una nuova lettura effettuata dopo la costruzione del modello. Applicare a giorni già presenti nel piano destinazione, a partire dalla data scelta. Abbinare classe e ordinale, rifiutare slot assenti, esterni, bloccati o assegnati. Rifiutare versioni non più correnti/disponibili: il modello richiede un nuovo salvataggio esplicito, senza sostituzione silenziosa della versione.

Mostrare date e ricette dell'anteprima, poi conferma separata. Ricalcolare nutrienti e stato del giorno. Nei pasti sostituiti azzerare aderenza e note della destinazione: l'interfaccia deve dichiararlo. I pasti esterni e gli slot non selezionati mantengono i dati. Una conferma valida è un'unica operazione `menu_apply`, annullabile/ripetibile nella cronologia.

## R8.3 — EXT-03, T68: dispensa

`pantryEntries`: chiave `entryId`, concetto canonico, forma `ingredientId` facoltativa, presente/assente, quantità positiva oppure null, unità g/ml oppure null, scadenza facoltativa, timestamp. Un concetto generico è ammesso con quantità sconosciuta; una quantità nota richiede forma specifica e unità. Una voce per forma oppure per concetto senza forma: modificare quella esistente per evitare doppio conteggio.

La selezione esplicita delle voci da utilizzare è in Preferenze aggiuntive. L'assenza di selezione non sottrae nulla. Quantità sconosciute, assenti, forma sconosciuta e voci scadute prima della fine dell'intervallo non vengono sottratte. La regola sulla scadenza è conservativa: non ripartire automaticamente consumi e scadenze all'interno dell'intervallo.

Dedurre una sola volta il pool disponibile, con limite alla quantità acquistabile. Non mischiare stati storici incompatibili della stessa famiglia. Conversione ammessa solo usando la scelta di acquisto R6 esplicita e il suo arco direzionale reviewed con fonte e versione; niente catene/inversioni/rapporti g↔ml impliciti. Mostrare quantità già sottratte e voci totalmente coperte, anche se la spesa residua è vuota. Non decrementare automaticamente il magazzino dopo il calcolo: dichiarare che l'utente aggiorna lo stock dopo il consumo.

Il digest materiale comprende le deduzioni effettive; checklist salvata ed export dichiarano il perimetro dispensa. Cambiare una quantità o la selezione che influisce sulla spesa rende obsoleta la checklist. Note, righe manuali e comportamento delle spunte R6 restano preservati.

## R8.4 — EXT-04, T69: lotti e avanzi

`productionBatches`: `batchId`, `planInstanceId`, versione ricetta congelata, 1–100 porzioni intere prodotte, data produzione, conservazione e almeno una assegnazione. Ogni assegnazione identifica giorno, slot e indice componente, con data civile derivata dal pasto. Il componente porta `productionBatchId`; la relazione è verificata in entrambe le direzioni. Una porzione per componente, una sola assegnazione per componente, somma assegnata non superiore alle porzioni prodotte. Le porzioni non assegnate sono il residuo dichiarato del lotto.

L'utente seleziona componenti già pianificati della stessa versione; non occorre un nuovo modello ricetta. Il lotto non modifica ingredienti o nutrienti. Il riequilibrio conserva i pasti collegati. Per cambiarli occorre scollegare il lotto esplicitamente; cancellazione e creazione includono record e collegamenti nella stessa operazione undo/redo. Per cambiare allocazioni in questa versione scollegare e ricreare il lotto, passando nuovamente dall'anteprima.

Acquisti: sommare ingredienti della versione × porzioni prodotte × persone alla sola data di produzione. Escludere i componenti assegnati dagli acquisti delle singole date di consumo, anche quando la produzione precede l'intervallo selezionato. Quattro porzioni a quattro pasti equivalgono a una produzione e quattro occorrenze nelle frequenze. L'orizzonte preparazioni mostra una produzione; non moltiplicare né inventare i tempi per porzioni diverse: dichiararli non verificati e segnalare che la somma dei tempi è parziale.

Conservazione predefinita `{status:'unverified',useByDate:null,sourceRef:null}` con avviso visibile. Una data limite è ammessa soltanto con `status:'documented'` e fonte non vuota dichiarata dall'utente. Rifiutare consumo prima della produzione o oltre la data documentata; nessuna stima di durata sicura. Un limite documentato non equivale a verifica medica/nutrizionale della ricetta.

## R8.5 — EXT-05 e EXT-06, T70 separato

**Stagionalità disponibile:** profili locali nominati per area; una voce per concetto con mesi 1–12 univoci, fonte e data revisione. L'utente dichiara di aver controllato fonte e mesi. Nessun profilo predefinito. Selezionare esplicitamente area e peso. Solo concetti con dati documentati alla data del pasto contribuiscono al bonus. Mesi ignoti non equivalgono a indisponibilità e non escludono una ricetta. «Mediterraneo» non certifica origine geografica.

**Costi disponibili:** osservazioni locali per forma, prezzo ≥0, quantità di riferimento >0, unità g/ml, valuta EUR/USD/GBP, data osservazione e fonte/negozio obbligatori. Scegliere la più recente osservazione non successiva all'inizio del periodo di spesa, della stessa forma/unità/valuta. Non convertire valute. Mostrare importo stimato e fonte/data per riga, avviso su prezzi più vecchi della soglia scelta (default 30 giorni). Prezzo zero esplicito è valido; prezzo mancante è null. Totale incompleto null più subtotale noto e numero prezzi mancanti; mai presentare il subtotale come totale.

Budget facoltativo del periodo di spesa, informativo. Stati: non impostato, entro, oltre, confronto incompleto. Non usare il budget come vincolo nutrizionale né affermare risparmio misurato. Escludere prezzi live e ordini da questa fase.

## Backup, migrazioni e UI

Snapshot writer 4: 31 store inclusi menu, preferiti, dispensa, lotti, stagionalità, prezzi e `productExtensions:R8`. Reader 3 aggiunge sei store vuoti senza cambiare checksum o documento d'origine. Reader 1/2 mantiene i limiti documentati R6. Controllare riferimenti e integrità delle assegnazioni anche negli snapshot di undo dei lotti. Import fallito non modifica alcuno store. DB 9 rende obsoleto il writer DB 8; resta il protocollo versionchange R6 senza skipWaiting forzato. La migrazione contenuti 5 è additiva/idempotente e non tocca accettazione R5.

Quattro destinazioni principali immutate. Organizza è una destinazione secondaria con sezioni Preferiti, Menu salvati, Dispensa, Lotti e avanzi, Stagionalità, Prezzi locali, Preferenze aggiuntive. Usare selettore ingrediente condiviso, concetto leggibile e variante separata; niente ID nel flusso ordinario. IT/EN, form etichettati, feedback, blocco doppio invio e bozza protetta. Anteprima non produce messaggio «Salvato»; lo produce solo un salvataggio riuscito. Dialog con conferma/cancellazione; cancellare non scrive.

## Uscita e consegna

`MATRICE_R8.md` collega CR §16 → EXT-01…06 → R8.1…5 → file → T66…70 → evidenze. Gli EXT provengono dalla richiesta di cambiamento, quindi non inventare rilievi R01–R27 per attribuirli alla review iniziale. Riportare separatamente T70 stagionalità e costo. Consegnare un pacchetto cumulativo con cinque rapporti di sottofase e stato complessivo.

La regressione completa è motivata dai cambiamenti a pianificatori legacy/V2, storico, backup, migrazioni, spesa, indice catalogo e shell. Test Node/schema/sorgente non sostituiscono IndexedDB reale, interruzioni/quote, multi-tab, focus/touch/overflow o upgrade offline. Il browser autorizzato era bloccato con ERR_BLOCKED_BY_CLIENT; non aggirarlo. R5 resta in attesa di revisioni autentiche; R7 e R8 restano con accettazione incompleta. Nessuna firma, ACCEPT V1 o stable promotion simulata.
