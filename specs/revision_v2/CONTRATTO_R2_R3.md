# Contratto di sviluppo R2/R3 — build 1.1.0-dev.r3

## Autorità e perimetro

Questo contratto attua la richiesta «proseguiamo con R2 e R3» sulla consegna R0/R1. Non sostituisce la specifica originale: `baseline/yourDietManager_CR_V2_SPECIFICA.md`, i suoi 149 requisiti e i 79 scenari rimangono autorevoli. `FASI_SVILUPPO.md` mantiene le nove fasi e quaranta attività. `TRACEABILITY.json`, `TEST_REGISTRY.json` e `reports/revision_v2/STATE.json` collegano ogni requisito all'attività e alla prova disponibile.

Versioni: app 1.1.0-dev.r3, IndexedDB 7, contenuti 4, backup 2; export ordinario del catalogo personale 2 con lettore 1. Cache shell 39 e dati 19. Nessun reset dell'epoch. Questa è una consegna di sviluppo; non una dichiarazione di release stable o di conformità completa della V2.

## R2.1 — Identità, ricerca e scelta

1. `ingredientId` identifica una forma stabile; `ingredientRevisionId` ne congela i dati nutrizionali. `product_food` identifica categoria, sottocategoria e concetto. Vietato usare il nome visualizzato come chiave, fondere forme o trasferire nutrienti tra forme.
2. `ingredientConceptQuery.js` e `createIngredientPicker` sono i punti comuni. La modalità concetto serve a filtri/regole; la modalità forma richiede una scelta ulteriore prima di ammettere una quantità. La selezione del concetto cancella una forma precedentemente scelta: non sceglie automaticamente la prima disponibile.
3. Cercare etichette e alias IT/EN, descrittori della fonte, categoria, sottocategoria e stato. Ordinamento: nome esatto, alias esatto, prefisso, corrispondenza degli altri campi; parità risolta da etichetta e ID. La normalizzazione non autorizza sostituzioni semantiche né correzioni automatiche di typo.
4. La proiezione delle ricette comprende ingredienti e relative forme, anche se il titolo abbreviato non li elenca. Le cache dipendono dal token del repository, invalidato dalle scritture e dai messaggi di invalidazione tra schede. Il componente mantiene l'ID solo dopo una selezione valida.
5. Il catalogo ingredienti raggruppa le forme. Filtri e ritorno contestuale sono conservati negli URL. Integrazioni consegnate: cataloghi, editor ricetta, riferimento ingrediente nelle regole, preferenze e sicurezza. Le nuove superfici dei comandi R4 e della spesa R6 dovranno usare lo stesso componente: ING-10 non è globalmente chiuso.

## R2.2 — Presentazione e migrazione

1. Titoli: 5–70 caratteri, obiettivo 55, al massimo tre alimenti distintivi nel generatore di presentazione. Vietati parentesi e descrittori tecnici della fonte nei nuovi titoli. Non inventare denominazioni protette o prodotti equivalenti.
2. `recipePresentationMigration.js` crea una nuova versione V2 della ricetta base con `supersedesVersionId`. Le righe, quantità e nutrienti restano quelli della versione precedente; la versione precedente resta leggibile. Non sovrascrivere ricette locali: proporre conversione durante modifica esplicita.
3. Tre correzioni di identità sono legate agli ID del corpus e ai descrittori esatti: `ing_fdc_2685568` → Zucchina, `ing_fdc_167705` → formaggio duro tipo parmesan, `ing_fdc_169051` → mozzarella senza grassi. Nuovi concetti, revisioni e mapping conservano i record originali. Non estendere queste regole per somiglianza lessicale.
4. L'appartenenza ai pacchetti accetta le versioni R2 solo con collegamento esplicito alla versione installata della medesima famiglia. Il fatto che il catalogo sia stato ripubblicato non rende indisponibile una versione storica referenziata dal pacchetto.
5. Il rapporto dei 1.800 titoli è preparatorio: la revisione editoriale finale e la qualità culinaria spettano a R5. Non presentare questa migrazione come approvazione editoriale umana.

## R2.3 — Ricette senza procedimento

1. Scrittori, dettaglio, editor, duplicazione, pipeline, ricerca e export ordinario non producono `instructions`. Non introdurre un equivalente chiamato suggerimenti, metodo o preparazione.
2. Il lettore V1 e il backup preservano i campi storici. L'export ordinario 2 trasferisce versioni correnti; converte una corrente locale V1 in un nuovo record di export senza alterare il record salvato. La cronologia completa resta compito del backup.
3. Una ricetta può essere scritta solo in italiano; EN usa il testo italiano come fallback esplicito, senza traduzione inventata. Una forma quantitativa e almeno un archetipo sono obbligatori. Entrambi i nuovi editor propongono inizialmente tutti gli archetipi.
4. L'anteprima nutrizionale usa la revisione selezionata e le quantità normalizzate. Forme diverse non sono intercambiabili. Le conversioni V2 richiedono una corrispondenza direzionale univoca e revisionata; ambiguità o assenza bloccano il calcolo.
5. Somma dei pesi e peso finale sono concetti distinti. Senza resa documentata la migrazione assegna `finalWeightG` e `finalVolumeMl` nulli. I metadati pratici legacy sono marcati non verificati e visibili come tali; restano da revisionare in R5. L'editor locale richiede tempi espliciti non negativi, senza convertire un campo vuoto in zero nel service.

## R3.1 — Contatore unico

`frequencyCounter.js` è l'unica autorità per conteggio, riepilogo, raggiungibilità e validazione finale. Non crearne copie nell'interfaccia o nei comandi R4.

- Finestra mobile inclusiva `[D-W+1, D]`, con W intero 1–90 e date civili. `dayOffset` determina il giorno civile dello slot, indipendentemente dal giorno dieta.
- `meal`: un `mealOccurrenceId` conta zero o uno anche se contiene più forme, righe o componenti pertinenti. `day`: zero o uno per data civile. Due pasti diversi non vengono deduplicati.
- Le righe opzionali V1 materializzate sono conteggiate. Un'eventuale esclusione esplicita `included=false` non contribuisce. Non interpretare il solo flag `optional` come esclusione dal pasto.
- Un esterno senza composizione non vale zero noto: viene contato separatamente come sconosciuto. Le conclusioni riguardano esclusivamente i pasti pianificati noti.
- Non inventare giornate mancanti. I massimi e Mai valgono anche nei prefissi; il minimo diventa verificabile solo con una finestra completa dalla decorrenza. Prima: `pending` e prima data valutabile.
- Caricare lo storico necessario a W-1 più il margine dei pasti notturni; conservare la catena di estensioni senza un limite arbitrario di record. Le modifiche ricontrollano anche le finestre future interessate, fino a D+W-1.
- Riepilogo: intervallo, conteggio, unità, minimo/ideale/massimo, stato, pasti contribuenti, esterni ignoti. La differenza dall'ideale non è una garanzia di consumo effettivo.

## R3.2 — Motore e recupero

1. Applicare l'intersezione delle regole. Min/max sono vincoli hard nelle finestre valutabili; ideale è soft. Priorità low/normal/high corrisponde a 1/2/4 solo per l'ideale. Non generare porzioni frazionarie per target 2,5.
2. Ricerca su più giorni con beam limitato e controllo dopo le scelte del pasto. Verificare quante presenze restano raggiungibili; riservare candidati rappresentativi dei target e delle fasce energetiche.
3. Prima del limite 500 escludere versioni storiche, famiglie non correnti/archiviate, pacchetti non installati e ricette non ammissibili nei contesti richiesti. Diagnosticare numerosità, scarti, stratificazione e troncamento. Il limite non è una prova di impossibilità.
4. Esiti pubblici distinti: `success`, `invalid_input`, `infeasible_proven`, `search_exhausted`, `cancelled`. Solo una contraddizione o una capacità massima dimostrata sull'insieme completo autorizza `infeasible_proven`. Un riferimento storico mancante è input non valutabile, non prova di impossibilità.
5. Worker ES module nel browser; progressi e AbortSignal terminano la ricerca senza commit. Il fallback Node serve ai test e non costituisce prova di responsività del browser. Verificare l'interruzione reale sul dispositivo prima del gate finale.
6. Orizzonte del piano 1–90 giorni; ciclo 1–31. Suggerire W quando serve al minimo, senza estendere automaticamente l'orizzonte o rilassare le regole.

## R3.3/R3.4 — Configurazione e migrazione comportamentale

- Modalità Nessuna preferenza, Frequenza, Mai; abilitazione separata. Cambiare modalità o disabilitare conserva i valori.
- In Frequenza deve esserci almeno un valore. Vuoto significa null; zero è un valore. Min/max interi non negativi; ideale multiplo di 0,5; min ≤ ideale ≤ max per i valori presenti. Vietato arrotondare o correggere silenziosamente input errati.
- Scope vuoto significa tutti i pasti; altrimenti soltanto gli ID delle classi selezionate. Conteggio giorni e priorità sono nel dettaglio avanzato.
- Le vecchie regole sono conservate in `legacyRules` e valutate dall'adapter legacy soft. La conversione crea una bozza esplicita senza derivare numeri da «più spesso/raro». Solo Salva attiva il cambiamento; la regola convertita non deve continuare ad applicare la vecchia penalità.
- Gruppi personalizzati: concetti o forme, senza annidamenti, duplicati o membri sconosciuti. Prima del salvataggio mostrare le regole referenzianti e l'impatto sulle giornate conservate. Apporre una nuova versione, non modificare la precedente.

## R3.5 — Sicurezza e commit

1. Sicurezza parametrica per allergene, concetto/famiglia, gruppo o forma, con tipo allergia/intolleranza/celiachia e decorrenza. Non dedurre una diagnosi dall'esclusione di un alimento.
2. Usare evidenza dell'ingrediente e composizione, non il testo della ricetta o il solo array `recipe.allergenIds`. Assenza non verificata, tracce note e composizione incompleta sono stati distinti; la policy conservativa non li ammette automaticamente. Nessun bypass monouso.
3. `planPolicyValidation.js` rilegge configurazione, ricette, revisioni e gruppi. Valida riferimenti, componenti conservati, sicurezza corrente, energia ricalcolata dalle revisioni congelate e frequenze. È il confine comune di generazione, estensione, sostituzione e ribilanciamento, inclusa selezione parziale dei giorni.
4. I sigilli di anteprima R0 restano obbligatori e vengono invalidati da modifiche intervenute. Questi controlli di sessione non sostituiscono la transazione concorrente e il comando atomico fra schede previsti da R4.
5. Le regole correnti producono un overlay sui piani e sullo storico, anche dopo undo. Non cambiano hash, nutrienti, quantità o stato di aderenza storico. Le azioni di sostituzione producono prima una nuova anteprima.

## Verifiche e condizioni di chiusura

`reports/revision_v2/R2/REPORT.md` e `R3/REPORT.md` descrivono le prove eseguite. La suite corrente comprende 288 test; i 15 test aggiunti esercitano dominio, servizi, export e retrieval. Le fixture sono sintetiche e non approvano dati alimentari.

La prova browser/IndexedDB reale, il controllo touch/tastiera, il cambio lingua nei form, i reload, l'upgrade offline e l'annullamento effettivo del Worker restano da eseguire nell'ambiente autorizzato. Il gate delle fasi resta BLOCCATO finché mancano queste prove. Non marcare PASS un intero scenario T01–T79 sulla base di una sua sola sotto-prova.

R4 deve riusare i contratti senza ridurre i controlli e chiudere concorrenza/azioni. R5 deve revisionare titoli e praticità, aumentare la copertura italiana/mediterranea con fonti e approvazioni effettive. R6 deve completare spesa, chiusura transitiva del backup e relative superfici del selettore. Non anticipare la certificazione di tali fasi in questa consegna.
