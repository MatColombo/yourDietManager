# yourDietManager test di accettazione della revisione V2

Versione 1.0 · 11 settembre 2026 · Companion vincolante della specifica CR V2.

Questi sono test da implementare ed eseguire sulla nuova versione. Non sono risultati già ottenuti. L'evidenza della review H è separata in `audit_evidence.json`; il suo script riproduce il comportamento precedente, inclusi i difetti. Non alterarlo per far apparire corretta la baseline.

Ogni test registra build, catalogo, schema, policy, fixture/seed, azioni, risultato atteso, risultato effettivo e PASS/FAIL/BLOCKED. Un ambiente non disponibile dà BLOCKED, mai PASS. P0 riguarda sicurezza/integrità; P1 core riguarda funzionalità necessarie; P2 riguarda estensioni. Nessuna schermata automatizzata deve essere dichiarata verificata soltanto perché il selettore esiste nel sorgente.

## 1 Fixture comuni

**F01 Catalogo minimo.** Creare concetti Miglio, Zucchina, Cece, Pasta, Latte, Mandorla, Arachide e Noce del Brasile. Pasta ha forme di semola e di riso con evidenza allergeni distinta. Miglio ha due forme con ID differenti, cotto e soffiato, e due revisioni storiche per almeno una forma. Zucchina ha alias zucchine/zucchini. Un gruppo Legumi include Cece e un altro concetto legume. Un gruppo Frutta a guscio selezionata contiene Mandorla e Noce del Brasile. Tutti gli ID appartengono a registry espliciti.

**F02 Piano e date.** Timezone Europe/Rome. Date di riferimento D=2026-09-11; D-6=2026-09-05; D-7=2026-09-04; D+6=2026-09-17. Inserire almeno pranzo e cena, un pasto a più componenti, uno slot con dayOffset=1 e uno esterno senza composizione. I pasti hanno ID unici e appartengono a una catena di piano verificabile.

**F03 Numeri sintetici.** Per verificare l'aritmetica usare una resa di test cotto → secco pari a 0,4, esplicitamente etichettata sintetica. Non pubblicarla come resa alimentare. Una forma A di test ha 100 kcal/100 g, B ne ha 200: selezionare 50 g di A deve produrre 50 kcal, B 100 kcal. Le fixture nutrizionali sono input software e non consigli dietetici.

**F04 Sicurezza.** Dati curati con glutine presente per semola e farro; variante riso con evidenza verificata pertinente; burro di arachidi senza ingredienti latte; noci del Brasile con relativo allergene; una forma con assessment non revisionato; una con tracce note. Inserire fonte/evidenza di fixture, senza inventare un documento ufficiale reale.

**F05 UI.** Browser reale desktop 1440×900; mobile 390×844 e 320×700 CSS px; zoom 200%; IT e EN; compact e comfortable; chiaro e scuro. Non serve moltiplicare ogni test per tutte le combinazioni: coprire i flussi critici e registrare la matrice eseguita. I test focus/touch richiedono elementi visibili e azioni utente normali.

**F06 Concorrenza.** Due tab reali sullo stesso origin e DB. Due anteprime con stesso giorno sorgente; cambio sicurezza nella seconda tab; quota storage o transazione abortita simulata tramite boundary di test documentato, senza toccare dati reali.

**F07 Aggiornamento.** Copia pulita del catalogo H, configurazione personalizzata, ricetta base promossa a locale, ingredienti locali, note, aderenza, checklist con righe manuali, almeno due operazioni con undo/redo disponibile. Il backup V1 è precedente all'upgrade.

## 2 Sicurezza e integrità

### T01 Metadati allergeni non ridotti a sottostringhe

Requisiti SAFE-05/09/10, CAT-13 · P0. Importare F04. Verificare semola/farro e noci del Brasile, variante riso e burro di arachidi. Atteso: i primi hanno gli allergeni appropriati, il riso non eredita glutine solo perché appartiene a Pasta, il burro di arachidi non riceve latte per la parola butter. L'evidenza deve distinguere assenza verificata, non noto e tracce. Non usare la funzione da testare per generare gli expected.

### T02 Ricetta non ammessa con allergene pertinente

SAFE-06/10/11 · P0. Attivare esclusione glutine; generare, cercare alternative e tentare assegnazione diretta di una ricetta con semola. Atteso: esclusa prima del ranking e rifiutata anche dal service commit. Ripetere con noci del Brasile e allergene frutta a guscio. Un array recipe.allergenIds manomesso a vuoto non deve superare la derivazione autorevole.

### T03 Compatibilità non verificata

SAFE-05/06 · P0. Con una regola sicurezza attiva usare una forma priva di assessment pertinente. Atteso: nessuna assegnazione automatica; motivo «Compatibilità non verificata». Un array allergeni vuoto non basta. La consultazione del record resta possibile.

### T04 Tracce e alimento composto

SAFE-07/10 · P0. Ingrediente con tracce note dell'allergene escluso; altro composto con composizione incompleta. Atteso: esclusione coerente con la policy conservativa e spiegazione distinta per tracce/composizione ignota; nessuna dicitura certificata inventata. Variante con composizione verificata usa soltanto la propria evidenza.

### T05 Famiglia sicurezza su tutte le forme

SAFE-01–04 · P0. Escludere Miglio tramite concetto; provare cotto e soffiato, poi una nuova forma correttamente mappata. Atteso: tutte escluse. Una regola esplicita sulla sola forma soffiata deve escludere quella forma senza essere visualizzata come esclusione dell'intero alimento.

### T06 Gruppo personalizzato senza testo libero

SAFE-02/04 · P1. Creare un gruppo da due concetti e una forma; cercarlo nel profilo sicurezza e nelle preferenze. Atteso: stesso ID e membri visibili. Vietati membri sconosciuti, duplicati, cicli o gruppi annidati. La modifica membership segnala regole e piani interessati.

### T07 Anteprima invalidata da cambio sicurezza

SAFE-11/12, HARD-01–03 · P0. Generare anteprima contenente A; aggiungere una regola che esclude A; confermare la vecchia anteprima. Atteso: `STALE_PREVIEW` o errore di sicurezza tipizzato, nessuna scrittura, aggiornamento proposto. Eseguire per generazione iniziale, estensione, sostituzione e riequilibrio.

### T08 Piano esistente e nuova incompatibilità

SAFE-12/13 · P0. Salvare un piano, cambiare allergia, poi aprire Oggi e Calendario. Atteso: pasti futuri incompatibili segnalati subito; nessuna modifica silenziosa a ricette/quantità. Lo storico resta leggibile; «Trova alternative» crea una preview.

### T09 Undo con sicurezza cambiata

SAFE-13 · P0. Sostituire A con B, escludere A, eseguire undo. Atteso: se lo snapshot viene ripristinato, compare incompatibilità corrente; non è presentato come conforme e non può essere copiato in un nuovo pasto. Nutrienti e hash storici rimangono quelli originari.

### T10 Pesce crudo e zero cottura

CAT-12, REC-05 · P0. Passare al template mini-fish-grain una revisione pesce raw non qualificata per consumo crudo. Atteso: record non pubblicabile/assegnabile come no-cook. Verificare tutte le 20 ricette baseline elencate nell'evidenza e relativa destinazione di correzione/quarantena.

### T11 Preview cambiata da altra tab

HARD-02/04/06 · P0. Tab A prepara riequilibrio; tab B salva sostituzione o aderenza nella stessa giornata; tab A conferma. Atteso: precondizione fallita e nessuna perdita della modifica B. Il confronto non deve affidarsi al solo stato JS della tab A.

### T12 Commit idempotente e atomico

HARD-05/07 · P0. Invocare due volte lo stesso commandId e simulare retry dopo timeout. Atteso: una mutazione logica e una sola history entry. Interrompere la transazione: nessun mezzo piano, puntatore o checklist parzialmente aggiornato.

## 3 Ingredienti ricerca e quantità

### T13 Ricerca generica Miglio

ING-01/07–09 · P1. Cercare miglio nel catalogo. Atteso: un risultato concetto con due forme; selezionandolo come filtro si ottengono ricette con entrambe. Nessuna forma cruda viene inventata perché assente dalla fixture.

### T14 Ricerca in tutti i campi

ING-08/10/11 · P1. Eseguire query nome IT, alias IT/EN, nome forma, categoria e descrizione originale. Ripetere nei selettori di preferenze, sicurezza, classi pasto, editor ricetta, sostituzione e spesa. Atteso: stessi ID e copertura, anche quando il titolo ricetta non contiene più l'ingrediente cercato.

### T15 Sinonimi e ambiguità

ING-08/09 · P1. Zucchina, zucchine e zucchini risolvono lo stesso concetto. Una stringa incompleta o un possibile typo propone scelte ma non salva un ID finché l'utente non seleziona. Una fonte «squash, zucchini» non viene approvata come zucca invernale per semplice traduzione del primo token.

### T16 Forma obbligatoria nella ricetta

ING-07/12, NUT-01 · P1. Nell'editor selezionare il concetto con due forme e inserire quantità senza scegliere la forma. Atteso: salvataggio bloccato con spiegazione. Dopo selezione, ID revisione e stato di pesatura sono visibili e persistiti.

### T17 Nutrienti diversi per forme diverse

NUT-01/02 · P0. Usare F03 e alternare A/B a 50 g. Atteso: 50/100 kcal rispettivamente; anteprima evidenzia differenza; nessuna copia dei nutrienti del concetto comune o conversione 1:1 implicita.

### T18 Unità e conversione mancante

NUT-01–03 · P1. Chiedere ml per forma con sola base g e nessuna densità. Atteso: non disponibile o errore prima del salvataggio. Aggiungere una conversione verificata e riprovare; solo quella direzione e quello scopo sono permessi.

### T19 Separazione resa spesa e nutrizione

NUT-02/03, SHOP-02/03 · P0. 150 g cotti e resa sintetica 0,4 verso secco. Atteso: acquisto equivalente 60 g quando scelto; nutrienti del pasto restano quelli dei 150 g cotti. Senza resa, 150 g cotti resta riga separata.

### T20 Origine e definizione nutrienti

NUT-04/05, CAT-06 · P0. Adapter con energia kJ, carboidrati disponibili, fibra mancante e zero misurato. Atteso: conversione documentata kJ/kcal; definizione carboidrati preservata; mancante distinto da zero; record non eleggibile finché mancano valori obbligatori. Nessuna media automatica di due dataset.

### T21 Versioni correnti oltre il limite retrieval

PERF-01/02 · P1. Inserire 500 versioni storiche prima di una versione corrente valida, più famiglie archiviate e pack non installati. Atteso: il candidato corrente valido è recuperato; il limite viene applicato all'insieme corretto e la truncation è diagnosticata.

### T22 Aggiornamento alias e indici

ING-11, PERF-03 · P1. Aggiungere alias, cambiare current pointer e aggiornare catalogo con una ricetta locale promossa. Atteso: indice aggiornato, alias cercabile offline, storico risolvibile e current locale preservato.

## 4 Preferenze e finestre

### T23 Validazione form minimo ideale massimo

PREF-01–06 · P1. Provare vuoti, zero, negativi, decimali, min>max, target fuori intervallo, W=0 e W=91. Atteso: semantica vuoto distinta da zero; min/max interi; target a passi 0,5; errori specifici e nessuna correzione silenziosa. Serve almeno un valore nella modalità Frequenza.

### T24 Minimo 2 ideale 3 massimo 4

PREF-05/17/19 · P1. Fixture con soluzioni note di conteggio 1, 2, 3, 4 e 5 su W=7. Atteso: 1 e 5 non ammissibili; 2/3/4 ammissibili; 3 favorito a parità degli altri obiettivi. Conteggio reale e motivi concordano nel riepilogo.

### T25 Semantica Mai

PREF-02/04 · P1. Impostare Mai su Miglio. Atteso: nessuna nuova assegnazione automatica o manuale contenente una forma; la consultazione resta possibile. Il pannello sostituzione non offre bypass monouso. Disabilitare la regola conserva i valori salvati.

### T26 Confine esatto di sette giorni

PREF-08 · P1. Con D=11 settembre, inserire presenze il 4, il 5 e l'11. Atteso: il 4 è escluso e 5/11 inclusi. W=1 include solo la data civile corrente, anche con più pasti.

### T27 Presenze nello stesso giorno

PREF-08/09 · P1. Miglio a pranzo e proposta miglio a cena, massimo 1 in W=7. Atteso: la cena violerebbe il massimo. La validazione deve tenerne conto durante generazione e sostituzione, non soltanto nel report finale.

### T28 Più ingredienti o componenti nello stesso pasto

PREF-09/10 · P1. Un pasto contiene due forme di Miglio e un secondo componente con Miglio. Atteso: una occorrenza per la regola Miglio/countUnit meal. Un gruppo Legumi con due figli nello stesso pasto conta uno. Non deduplicare invece pasti con mealOccurrenceId diversi.

### T29 Unità giorni

PREF-10 · P1. Miglio a pranzo/cena dello stesso giorno e a pranzo il giorno successivo. Atteso: countUnit meal=3; day=2. La UI spiega l'unità attiva e non somma i due conteggi.

### T30 Storico oltre quattordici giorni

PREF-12 · P1. W=31 con presenza a D-20 nella catena precedente. Atteso: la presenza influisce su generazione/estensione/sostituzione. Aggiungere W=90 e almeno due segmenti piano; nessun limite silenzioso a 14 o al numero di record caricati.

### T31 Finestre future dopo edit

PREF-12, HARD-06 · P1. Giorno D e D+3 contengono già il target al massimo; inserire una presenza in D-1. Atteso: le finestre future interessate vengono ricontrollate e il commit non viola il limite lasciando intatti altri giorni. Coprire anche rimozione che viola un minimo futuro.

### T32 Data civile e carry over

PREF-08/12 · P1. Slot del giorno dieta D con dayOffset=1. Atteso: il conteggio avviene su D+1. Provare i cambi ora di Europe/Rome, una timezone con offset diverso e un range che include il bordo della catena: nessun doppio conteggio o salto.

### T33 Orizzonte incompleto e attivazione

PREF-13/14 · P1. Attivare oggi una regola W=14 min=3 e chiedere piano 7 giorni. Atteso: proposta di estendere a 14; mantenendo 7, stato pending con prima data verificabile. Non dichiarare min soddisfatto né violato usando giorni futuri come zeri.

### T34 Pasti esterni sconosciuti

PREF-11 · P1. Un pasto esterno senza composizione nella finestra. Atteso: non conta come presenza, ma il report riporta la lacuna e limita le conclusioni ai pasti noti pianificati. Nessuna dichiarazione di rispetto totale di dieta/allergie dell'alimentazione esterna.

### T35 Famiglia e figlio in conflitto

PREF-15/16 · P1. Mai Legumi e minimo 2 Ceci nello stesso scope. Atteso: conflitto con entrambe le regole mostrate, nessuna priorità implicita del figlio. Per regole compatibili si applica la loro intersezione.

### T36 Scope classi pasto

PREF-06/15 · P1. Regola solo Cena, poi Tutti i pasti. Atteso: il pranzo conta solo nel secondo caso. Una classe pasto duplicata non deve essere inclusa in uno scope ristretto senza scelta; scope vuoto è visualizzato come Tutti i pasti.

### T37 Ideale frazionario

PREF-05 · P1. Target=2,5, min=2, max=3. Atteso: piani con 2 o 3 occorrenze intere; nessuna porzione 0,5 generata per far tornare la frequenza. Il report mostra scostamento e non promette media esatta.

### T38 Impossibile o ricerca esaurita

PREF-16–18 · P1. Una fixture con impossibilità dimostrabile e una con budget ricerca volutamente ridotto. Atteso: `infeasible_proven` nella prima, `search_exhausted` nella seconda, nessun allargamento automatico di vincoli. La UI spiega la differenza in lingua utente.

### T39 Migrazione preferenze V1

PREF-20, MIG-02 · P1. Importare more_often, rarely, max soft e autoExclude. Atteso: adapter compatibile, avviso di conversione, nessun numero inventato e nessun massimo reso hard senza salvataggio esplicito. Dopo conversione la regola vecchia non continua a sommare penalità nascoste.

## 5 Sostituzione e interazioni

### T40 Pulsante Sostituisci visibile e contestuale

SWAP-01–05 · P1. Dal primo pasto di una giornata lunga cliccare il pulsante con mouse/touch/Enter. Atteso: pannello subito visibile nel viewport, titolo del pasto corretto, caricamento e risultati. Non basta un elemento aggiunto nel DOM fuori schermo.

### T41 Nessuna alternativa

SWAP-08 · P1. Fixture con tutte le alternative escluse per vincoli. Atteso: messaggio esplicito, cause pertinenti e azioni utili; nessun vuoto, pulsante permanentemente disabilitato o eccezione non gestita.

### T42 Errore asincrono e retry

SWAP-02, UX-13/14 · P1. Simulare errore repository durante retrieval. Atteso: errore locale comprensibile, Annulla e Riprova operativi, nessuna scrittura e nessun alert tecnico come unica risposta.

### T43 Richieste fuori ordine e annullamento

SWAP-02/03 · P1. Avviare sostituzione pranzo, poi cena; completare pranzo per ultima. Atteso: il pannello mostra cena. Chiudere durante caricamento: la risposta successiva non riapre il pannello e non cambia il piano.

### T44 Focus tastiera e ritorno

SWAP-03, UX-11 · P1. Aprire drawer, percorrerlo con Tab/Shift+Tab, chiudere con Escape. Atteso: focus confinato se modale, nome accessibile, sfondo non azionabile, ritorno al comando originario. Eseguire nel browser reale.

### T45 Sostituzione singolo componente

SWAP-06/09 · P1. Pasto di tre componenti, scegliere il secondo. Atteso: primo e terzo identici; quantità, revisioni e attributi conservati. Rivalutare energia e frequenze del pasto/giorno completo.

### T46 Sostituzione intero pasto composto

SWAP-07 · P1. Fixture energetica in cui nessuna singola ricetta basta ma due componenti approvati sì. Atteso: proposta composta oppure fallimento motivato con ricerca esaurita, non falsa impossibilità dovuta a ricerca solo singola. Nessuna porzione moltiplicata o ridimensionata.

### T47 Conferma annullamento e spesa

SWAP-09, HARD-05, SHOP-05 · P1. Confermare una sostituzione; usare undo; ricaricare. Atteso: una sola operazione, messaggi corretti, stato ripristinato e checklist aggiornata come obsoleta solo quando il contenuto necessario cambia.

### T48 Bozza aderenza e note

UX-07/14 · P1. Scrivere una nota non salvata in un pasto, aprire Sostituisci su un altro e tornare. Atteso: nota preservata o scelta esplicita prima della perdita. Salvare: feedback persistente e coerente dopo render/reload.

## 6 Titoli procedimento e catalogo

### T49 Titoli brevi e veri

REC-01–03 · P1. Controllo completo dei titoli distribuiti: lunghezza 5–70, assenza di descrittori tecnici vietati, corrispondenza agli ingredienti. Ispezione editoriale dei 120 piatti. Nessun Parmigiano Reggiano dedotto da parmesan USDA, nessuna denominazione italiana falsa.

### T50 Procedimento rimosso end to end

REC-04–07 · P1. Dettaglio, nuova ricetta, modifica, duplicazione, import nuova ricetta, pipeline, export e ricerca. Atteso: nessun campo o sezione procedimento, nessun requisito instructions e nessun testo generato equivalente. Il backup e il lettore schema 1 preservano lo storico senza errore.

### T51 Archetipi coerenti

INV-08 · P1. Aprire nuovi editor ingrediente e ricetta: tutti selezionati. Deselezionare tutti: salvataggio disabilitato con messaggio. Riabilitare uno: valida stessa regola in entrambi i form e nel service.

### T52 Peso finale e praticità reali

NUT-06, REC-05 · P1. Ricetta con cereale secco che assorbe acqua e senza resa documentata. Atteso: finalWeightG nullo o dato verificato; somma pesi indicata soltanto come peso ingredienti. Tempi/preparabilità non inferiti da un template privo di revisione.

### T53 Pilot e copertura catalogo

CAT-01–04 · P1. Validare prima manifest 40 concetti/60 forme, poi 200/300 e 120 piatti distinti. Atteso: ogni riga nominale risolta, totale categorie uguale alla somma senza duplicati, nessun «altro» conteggiato. Ricette con soli grammi o stati diversi non aumentano la varietà culinaria dichiarata.

### T54 Provenance e condizioni d'uso

CAT-05–10 · P1. Per ogni nuova forma verificare record originale, dataset/versione, hash, trasformazioni e condizioni. Atteso: nessuna API o licenza inventata, nessun valore derivato da LLM senza fonte. Un adapter può accettare un estratto manuale autorizzato e riprodurre l'import con lo stesso output.

### T55 Distinzione delle approvazioni

CAT-11 · P1. Eseguire generazione deterministica e validazione tecnica senza revisore umano. Atteso: automatedChecks valorizzati; humanAcceptance non valorizzata; nessuno stato di revisione culinaria umana inventato. Le approvazioni richiedono identità/tipo revisore e data reali.

### T56 Fattibilità e varietà reali

CAT-04/14, PERF-06 · P1. Usare il nuovo catalogo con profili standard, vegetariano, senza latte, senza glutine, preferenze di frequenza e vincoli pratici, su fixture nutrizionali software dichiarate. Atteso: solo soluzioni conformi o fallimenti spiegati; misurare ripetizioni per concetto e piatto, non solo recipeId. Non importare vecchie ricette problematiche per recuperare il numero nominale di soluzioni.

## 7 Spesa migrazione e rilascio

### T57 Spesa generica senza somme scorrette

SHOP-01–03 · P1. Piano con 100 g miglio secco e 150 g cotto. Atteso: gruppo Miglio con due righe; con conversione F03 scelta, 160 g equivalenti secchi; senza conversione mai 250 g indifferenziati. Moltiplicatore persone applicato alla sola spesa.

### T58 Checklist dopo cambio quantità

SHOP-04/05 · P1. Spuntare una riga, aggiungere un pasto che aumenta la quantità, aggiornare da piano. Atteso: quantità cambiata da verificare, note e righe manuali conservate. Cambiare sola aderenza: nessuna obsolescenza se gli input acquisto sono identici.

### T59 Migrazione senza reset

MIG-01–04 · P0. Usare F07; migrare, interrompere a checkpoint e riprendere due volte. Atteso: stessi dati utente e ID storici, nuova struttura coerente, nessuna duplicazione o chiamata distruttiva per cambio epoch. Report completo degli irrisolti.

### T60 Backup indipendente dal catalogo corrente

MIG-05–08 · P0. Esportare backup2 con piano storico; installazione vuota con diverso catalogo pubblico; importare offline. Atteso: ricette e ingredienti necessari allo storico risolvibili, nutrienti e note identici, nessuna dipendenza nascosta dal vecchio endpoint.

### T61 Import malformato e riferimenti orfani

MIG-07, OPS-05 · P0. Backup con checksum errato, schema futuro, ID mancanti, quantità invalide, label con HTML, URL non ammessi e file oltre limite. Atteso: rifiuto prima della mutazione o rendering sicuro per testo valido; dati attuali intatti, nessuno script eseguito.

### T62 Upgrade PWA con due tab e offline

OPS-01/02 · P0. Tab vecchia, upgrade DB/cat nella nuova, interruzione download, offline/reload. Atteso: nessun bundle misto, tab vecchia non scrive, messaggio di ricarica utile e recupero al checkpoint. Non cancellare automaticamente i dati personali.

### T63 UX completa e accessibilità

UX-01–14 · P1. Su F05 eseguire onboarding, ricerca, editor, giornata, sostituzione, spesa e backup. Atteso: niente scroll orizzontale di pagina, titoli e stati leggibili, target conformi, focus e label reali, errori associati, ritorno contestuale conservato. Audit sorgente regex non sostituisce questa prova.

### T64 Performance e annullabilità

PERF-01–05 · P1. Dataset 10.000 ricette, benchmark caldo e primo import separati, almeno 30 query rappresentative e 10 esecuzioni per scenario planner. Atteso: budget p95 della specifica, metadata macchina e seed nel report, UI responsiva e generazione annullabile. Documentare outlier; non eliminare i casi lenti dal campione.

### T65 Documentazione e gate della nuova linea

DOC-01–04, sezione 20 della specifica · P1. Verificare schemi mirrors, md attivi, skill di progetto, esempi e pipeline. Atteso: nessun contratto attivo opposto alle nuove regole; report H conservati come storici; nuovo dossier con nuovi digest. Tutti i gate necessari passano; accettazione umana resta distinta dall'esito automatico.

## 8 Test delle estensioni quando abilitate

**T66 Favoriti e lock.** Favorito persiste dopo reload; un pasto bloccato sopravvive al riequilibrio, ma una nuova incompatibilità di sicurezza è segnalata. Riferimento EXT-01.

**T67 Menu salvato.** Applicazione in nuove date crea preview con rivalidazione; non copia aderenza o note della giornata originale. Riferimento EXT-02.

**T68 Dispensa.** Quantità sconosciuta non si sottrae dalla spesa; quantità nota si sottrae una volta con unità compatibile, senza nutrienti inventati. Riferimento EXT-03.

**T69 Avanzi.** Un lotto produce quattro porzioni assegnate a quattro pasti; acquisto una produzione, frequenza quattro pasti. Assenza di durata di conservazione resta non verificata. Riferimento EXT-04.

**T70 Stagionalità e costo.** Area scelta modifica soltanto preferenza soft documentata; prezzo mancante non è zero e prezzo vecchio mostra data. Riferimenti EXT-05/06.

## 9 Gate e consegna dei risultati

La nuova pipeline deve conservare i controlli significativi della baseline e aggiungere T01–T65. Raggruppare per dominio e rischio; i test di regressione non devono replicare internamente lo stesso algoritmo per calcolare gli expected. Gli expected semantici di sicurezza, finestre e mapping sono dichiarati nella fixture indipendente.

Per ogni fase eseguire i test interessati; prima di R7 eseguire l'intero set core e la matrice browser. I test T66–T70 diventano obbligatori per ogni estensione dichiarata attiva. Non richiedere che un test sulla precedente forma di procedimento continui a descrivere il prodotto nuovo: conservarlo come compatibilità schema1 oppure aggiornarne esplicitamente il contratto, mantenendo il test di lettura storica.

Il report finale deve includere conteggi PASS/FAIL/BLOCKED, elenco dei P0/P1 aperti, risultati di migrazione, versioni dei dati, report di qualità e misure prestazionali. Se un test è BLOCKED, descrivere il prerequisito mancante e la procedura di esecuzione. Non usare un report precedente come prova di un test non eseguito sulla nuova build.
