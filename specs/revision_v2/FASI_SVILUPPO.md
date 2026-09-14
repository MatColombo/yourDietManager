# yourDietManager fasi di sviluppo collegate alla revisione V2

Versione del piano 1.0 · 11 settembre 2026 · Stato iniziale di tutte le fasi core: DA FARE.

Questo piano traduce la review della fase H e la change request V2 in nove fasi operative, R0–R8. Per ogni rilievo e requisito identifica attività, fase responsabile, verifiche e prova necessaria per dichiarare il lavoro concluso. È pensato per eseguire una fase alla volta, anche con AI diverse, mantenendo la continuità del progetto.

La sequenza ordinaria è R0, R1, R2, R3, R4, R5, R6, R7. R7 chiude il core della revisione; R8 contiene le estensioni già distinte nella specifica, da dichiarare singolarmente. La raccolta e lo staging delle fonti R5 possono iniziare dopo R1, mentre la pubblicazione del catalogo richiede R3 e i controlli di R5. Il piano non assegna durate di calendario prive di stima: la dimensione del lavoro e il tempo necessario alla revisione dei dati saranno registrati per attività.

## Documenti autorevoli e precedenza

Leggere insieme questi documenti, conservandoli accanto al piano o nella cartella baseline del progetto:

| Documento | Responsabilità |
| --- | --- |
| [yourDietManager_REVIEW_FASE_H.md](yourDietManager_REVIEW_FASE_H.md) | Problemi, evidenze, limiti e rilievi R01–R27 |
| [yourDietManager_CR_V2_SPECIFICA.md](yourDietManager_CR_V2_SPECIFICA.md) | Significato integrale dei 149 requisiti e invarianti |
| [yourDietManager_CR_V2_TEST_ACCETTAZIONE.md](yourDietManager_CR_V2_TEST_ACCETTAZIONE.md) | Fixture F01–F07 e test T01–T70 |
| Questo piano | Attività, dipendenze, tracciabilità, passaggi di consegna e test integrativi T71–T79 |
| `audit_evidence.json` e `audit_review.mjs` del pacchetto della review | Prove della baseline H, inclusi comportamenti difettosi da correggere |

Le istruzioni successive dell’utente prevalgono sui documenti. Per il comportamento funzionale prevale la specifica; i test la rendono verificabile. Questo piano dettaglia l’esecuzione e aggiunge prove, senza modificare i 149 requisiti. Una contraddizione va registrata con gli ID coinvolti e risolta esplicitamente; non si elimina un requisito per far passare un gate.

La numerazione R conserva il collegamento con la sezione 17 della specifica e mantiene identificabili le precedenti fasi A–H. Distinguere sempre il rilievo **R01** dalla fase **R0** e dall’attività **R0.1**. Non rinumerare questi identificatori durante l’implementazione.

## Come leggere il collegamento completo

La catena obbligatoria è: rilievo o mandato della CR → requisito → attività → modifica concreta → test → evidenza → stato di chiusura. La matrice di questo documento definisce i primi tre collegamenti e i test. Lo sviluppo aggiunge file modificati, commit o hash dell’archivio consegnato, risultati ed evidenze.

Esempio: **R12**, conteggio delle finestre incoerente, è collegato a **PREF-08/09/12**, alle attività **R3.1/R3.2**, ai test **T26–T32** e alle funzioni di conteggio e validazione. La chiusura richiede risultati effettivi che dimostrino estremi corretti, presenze nello stesso giorno e controllo delle finestre future. Un cambiamento del testo del form non chiude R12.

Una fase titolare è responsabile dell’implementazione completa del requisito nel proprio ambito. Se una superficie o un dataset arriva in una fase successiva, la matrice resta aperta su quella verifica integrativa. Per esempio, R2 consegna il selettore e lo integra nelle superfici esistenti; R3, R4 e R6 devono usarlo nei nuovi configuratori, nella sostituzione e nella spesa. R7 verifica il risultato completo. Le prove parziali sono registrate come tali e non valgono come PASS dell’intero test.

I requisiti DOC-01–04 e gli invarianti si applicano fin da R0. La titolarità finale R7 per la documentazione significa verifica complessiva e chiusura del dossier: ogni fase deve comunque aggiornare subito i documenti che modifica.

## Quadro delle fasi

| Fase | Risultato da consegnare | Dipendenze di ingresso | Confine di completamento |
| --- | --- | --- | --- |
| R0 | Mitigazioni dei problemi bloccanti e dossier iniziale | Baseline disponibile | Dati critici esclusi, anteprime obsolete rifiutate sul contratto H, feedback della sostituzione verificabile |
| R1 | Identità, schemi, conversioni e migrazione additiva | R0 | Contratti V2 leggibili e scrivibili senza perdita di dati |
| R2 | Ricerca generica, forme, titoli e rimozione procedimento | R1 | Nuovi flussi di catalogo coerenti e compatibilità storica preservata |
| R3 | Frequenze, sicurezza e validazione del piano | R1 e R2 | Regole numeriche realmente applicate dal motore e dai commit |
| R4 | Gestione giornata e UX completa del planner | R3 | Interazioni verificate nel browser, incluse sostituzioni composte e concorrenza |
| R5 | Catalogo italiano e mediterraneo curato | R1 per staging, R3 per pubblicazione | Pilot 40/60, copertura 200/300 e 120 piatti verificati |
| R6 | Spesa, backup, privacy e continuità offline | R3, R4 e R5 | Quantità coerenti, ripristino autosufficiente e upgrade affidabile |
| R7 | Accettazione del core della nuova revisione | R0–R6 | 74 test core verificati, nessun P0/P1 core aperto, dossier della nuova build |
| R8 | Estensioni con stato e contratti distinti | R7 | Ogni estensione abilitata supera i propri test e le regressioni pertinenti |

Le dipendenze sono di prodotto e non richiedono agenti in parallelo. È possibile preparare dati o attività indipendenti quando il prerequisito specifico è già soddisfatto, ma non attivare funzioni che dipendono da un contratto ancora incompleto. Un gate bloccato rimane visibile e impedisce la dichiarazione di completamento corrispondente.

## Stato iniziale e significato dei gate

Questa consegna crea il piano, non implementa le fasi. Gli esiti della review H restano evidenza storica: i 247 test superati non costituiscono accettazione della V2. La causa esatta del bug Sostituisci nell’interfaccia è ancora da riprodurre; il servizio aveva funzionato nello scenario provato. Nessun PASS browser viene ereditato dalla review.

| Stato | Significato ammesso |
| --- | --- |
| DA FARE | Attività definita, nessuna implementazione accettata |
| IN CORSO | Modifiche iniziate con base e ambito identificati |
| IMPLEMENTATO | Codice e documenti presenti, verifiche ancora incomplete |
| VERIFICATO | Attesi pertinenti superati sulla build dichiarata con evidenza |
| BLOCCATO | Prerequisito o verifica indispensabile non disponibile, causa esplicita |
| COMPLETATO | Stato di fase con tutte le attività obbligatorie verificate e consegna completa |
| PIANIFICATO COME ESTENSIONE | Requisito R8 non ancora attivato; non equivale a completato |

Un FAIL richiede correzione; un BLOCKED richiede il prerequisito mancante. Nessuno dei due diventa PASS con una nota. Una mitigazione temporanea protegge il prodotto ma non chiude automaticamente i requisiti definitivi. Tutte le 40 attività descritte di seguito devono essere presenti nel registro di avanzamento; le cinque di R8 restano inizialmente pianificate come estensioni.

## R0 Correzioni bloccanti

**Obiettivo.** Ridurre subito i rischi riprodotti della baseline e inizializzare il collegamento fra revisione e sviluppo. Lavorare sul contratto H; i nuovi record V2 vengono introdotti da R1.

**Ingresso.** Progetto H o base successiva identificata con differenze documentate; review, specifica e test disponibili. Non riutilizzare un rapporto H come prova della nuova build.

**R0.1 Baseline e registro della revisione.** Identificare versione app, catalogo, schema e hash di partenza. Copiare i documenti autorevoli nella struttura indicata nel passaggio di consegna. Creare il registro con 27 rilievi, 149 requisiti, 40 attività e 79 test, senza stati di sviluppo già verificati. Riprodurre le prove critiche usando fixture e repository di test; conservare gli expected difettosi della baseline separati dagli attesi della correzione.

**R0.2 Esclusione dei dati critici.** Elencare esplicitamente le 20 ricette con pesce crudo e metadata senza cottura. Bloccarle nelle nuove proposte e correggere il template `mini-fish-grain` per impedire ricorrenze. Per metadati allergeni incompleti, usare un manifest provvisorio versionato di quarantena o evidenza verificata, applicato prima del ranking e alla conferma. Coprire pasta/farro, noci del Brasile e i casi di negazione burro di arachidi/noodles. Il manifest contiene ID, motivo, fonte o riferimento alla prova e stato; non viene ottenuto riapplicando la stessa regex difettosa. I record storici restano risolvibili. La mitigazione non autorizza ad assegnare `reviewed` a contenuti mai verificati.

**R0.3 Anteprime e conferme sul contratto attuale.** Nei commit di generazione, estensione, sostituzione e riequilibrio ricaricare configurazione e giorni rilevanti; rifiutare le anteprime obsolete prima di scrivere. Proteggere dal doppio invio nel perimetro attuale e conservare il before autorevole. Se l’idempotenza persistente o il confronto atomico richiedono nuovi contratti, registrarli come lavoro da completare in R1/R4: una disabilitazione del pulsante non chiude HARD-04/05. Non scrivere strutture V2 senza il relativo lettore.

**R0.4 Riscontro immediato della sostituzione.** Tentare la riproduzione visiva del caso segnalato su una giornata lunga. Rendere raggiungibile l’anteprima, mostrare caricamento, zero risultati ed errore, e preservare le note durante il render. Annotare separatamente ciò che è riprodotto, ciò che è dedotto dal codice e ciò che rimane non verificato. Il drawer e la sostituzione composta definitiva sono attività R4.

**File principali.** `src/corpus/fdcAutoCuration.js`, `src/corpus/v1PhaseBRoleClassifier.js`, `src/corpus/v1PhaseBRecipeGenerator.js`, `src/planner/hardFilter.js`, `src/services/effectivePlanService.js`, `src/services/planGenerationService.js`, `src/ui/planPages.js`, `src/ui/uiState.js`, test pertinenti e dossier della revisione.

**Verifiche di uscita.** T10 completo per tutti i 20 ID; prove mirate del filtro glutine, dell’anteprima obsoleta e del doppio invio; scenari di feedback e vuoto della sostituzione con scope registrato. I test V2 T01–T09 e T40–T44 mantengono lo stato previsto dal registro finché non viene eseguito il loro intero contratto. Browser non disponibile significa verifica UI BLOCCATA.

**Consegna.** Correzioni applicabili, manifest della quarantena con destinazione di ogni ID, prova prima/dopo, registro iniziale e rapporto R0. Dichiarare espressamente quali mitigazioni R1/R3/R4 devono sostituire. Non dichiarare la V2 o la release stable completata.

## R1 Contratti identità e migrazione

**Obiettivo.** Fornire le basi persistenti che permettono configurazione e ricerca coerenti senza rinominare o fondere lo storico.

**Ingresso.** Protezioni R0 disponibili; inventario dei record correnti, storici e locali. Decisione sulle versioni DB 7, content schema 4 e backup 2 verificata contro la base effettiva; usare il prossimo numero libero se necessario.

**R1.1 Concetti forme e gruppi.** Riutilizzare `product_food`; mantenere `IngredientFamily.ingredientId` come forma stabile e le revisioni come autorità nutrizionale. Aggiungere etichette di forma, alias controllati, percorso univoco e mapping versionati. Creare `FoodGroup` come raccolta di concetti o forme senza annidamenti. Implementare validatori di membership e reindirizzamenti senza trasformare una somiglianza di nome in equivalenza nutrizionale o allergenica.

**R1.2 Base nutrizionale e conversioni.** Implementare il contratto del registro direzionale `unit|shopping_yield`, con fonte, revisione e scopo. Separare la conversione per acquisto dai nutrienti del piano. I dati mancanti generano un limite esplicito. Nessuna resa universale viene dedotta dalle fixture sintetiche.

**R1.3 Lettori e scrittori dei nuovi contratti.** Preparare schemi V2 per forme, evidenze di sicurezza, preferenze e ricette senza procedimento; mantenere i lettori V1. Definire il passaggio dal manifest provvisorio R0 all’evidenza strutturata, senza inventare approvazioni. Il modello delle nuove preferenze viene definito ora, mentre la conversione comportamentale si completa in R3. L’introduzione dello schema ricetta non abilita ancora un editor incoerente.

**R1.4 Migrazione additiva e riferimenti locali.** Migrare con checkpoint e ripresa, preservando piani, note, preferenze legacy, checklist, history e current pointer locali. Nessun reset tramite epoch. Conservare irrisolti e proposte di riconciliazione. I record modificati localmente non vengono sovrascritti da una correzione del catalogo. Predisporre la chiusura transitiva del backup che R6 implementerà integralmente.

**File principali.** `src/domain/productFoodTaxonomy.js`, `src/services/referenceDataService.js`, `src/services/referenceDataEditorService.js`, `src/domain/nutritionCore.js`, `src/db/constants.js`, `src/db/database.js`, `src/services/migrationRunner.js`, `src/services/personalCatalogService.js`, `schemas/`, `public/schemas/`.

**Verifiche di uscita.** T18, T59 e T72, più test di dominio per T01/T05/T06/T17/T19 con scope esplicito. Provare doppia esecuzione della migrazione e interruzione a checkpoint. Validare parità degli schemi pubblici e autorevoli. Le prove che richiedono un nuovo form o l’intero backup vengono ripetute nella fase indicata nel registro.

**Consegna.** Schemi e migrazioni applicabili, fixture F01/F03/F04/F07, mapping degli ID e report degli irrisolti. R0 resta coperto dagli stessi casi di regressione dopo il cambio di contratto.

## R2 Ingredienti ricerca titoli e ricette

**Obiettivo.** Rendere utilizzabile il modello generico in tutte le superfici esistenti e rimuovere il procedimento dal contratto operativo.

**Ingresso.** R1 con lettori, scrittori e mapping pronti. Liste dei selettori esistenti e delle dipendenze da `instructions` censite prima delle modifiche.

**R2.1 Ricerca e selettore comune.** Implementare modalità concetto e forma, ordinamento deterministico, alias IT/EN, categorie e descrittori originali. Indicizzare anche gli ingredienti delle ricette. Aggiornare e invalidare le proiezioni su alias, current pointer e import. Cercare Miglio produce il concetto e le due forme della fixture; nessuna forma viene inventata. Consegnare un componente comune e un servizio, non un elenco di copie.

**R2.2 Titoli e presentazione.** Implementare titoli 5–70 caratteri e separare nome comune, forma e quantità. Correggere il contenuto autorevole; mantenere le denominazioni corrispondenti al prodotto reale. Predisporre controllo completo dei titoli del nuovo catalogo, la cui revisione editoriale finale avviene in R5. La ricerca per ingrediente continua a funzionare dopo l’abbreviazione.

**R2.3 Procedimento rimosso e metadata corretti.** Aggiornare editor, dettaglio, duplicazione, generazione, validazione, indici, checksum nuovi ed export ordinari. Il duplicatore deve gestire l’assenza del campo. Conservare lettore e backup storico schema 1 senza mostrare le istruzioni nei flussi ordinari. Distinguere peso ingredienti e peso finale; usare solo dati pratici attendibili. Aggiornare pipeline e schemi nello stesso intervento.

**R2.4 Integrazione degli editor.** Integrare il selettore nelle superfici esistenti, conservare stato vista, richiedere una forma per quantità e garantire identica regola degli archetipi nei due editor. Permettere creazione locale in italiano con fallback EN. Elencare le integrazioni successive obbligatorie R3/R4/R6 nel registro: non marcare ING-10 globalmente verificato mentre tali superfici sono ancora incomplete.

**File principali.** `src/services/catalogQuery.js`, `src/ui/guidedControls.js`, `src/ui/catalogPages.js`, `src/services/personalCatalogService.js`, `src/domain/nutritionCore.js`, `src/corpus/recipePipeline.js`, `schemas/`, `public/schemas/` e moduli che producono search token e checksum.

**Verifiche di uscita.** T13–T17, T22, T50–T52 e T73; T14 sulle superfici già disponibili, con inventario di quelle da riverificare. T49 su fixture e titoli effettivamente modificati; il PASS sul catalogo finale richiede R5. Verificare nuove ricette, modifica di V1, duplicazione e riapertura dopo reload.

**Consegna.** Flussi di catalogo applicabili, tabella delle superfici integrate, migrazione dei nuovi contenuti, report dei titoli e riferimenti storici preservati. Nessun campo equivalente al procedimento viene introdotto con un nome diverso.

## R3 Frequenze sicurezza e motore del piano

**Obiettivo.** Far coincidere ciò che l’utente imposta con ciò che il planner applica, spiega e salva.

**Ingresso.** R1 e R2; selettore comune e schemi nuovi operativi. Fixture delle date e dei conflitti dichiarate indipendentemente dall’algoritmo.

**R3.1 Contatore delle frequenze.** Implementare un solo contatore per pasto o giorno, intervallo civile D-W+1…D, deduplicazione per `mealOccurrenceId`, carry-over, storico W-1 e finestre future coinvolte. Rappresentare esplicitamente esterni ignoti, decorrenza e finestre incomplete. Eliminare il limite fisso di 14 giorni.

**R3.2 Solver e recupero candidati.** Applicare minimi/massimi come hard e ideale come soft; controllare conteggi ancora raggiungibili e intersezione delle regole. Distinguere impossibilità dimostrata da budget di ricerca esaurito. Recuperare versioni correnti ammissibili prima del limite di 500. Rendere la ricerca annullabile con Worker o chunking e predisporre i benchmark, senza rinviare una UI bloccata a R7.

**R3.3 Configuratori numerici e riepiloghi.** Esporre Nessuna regola, Frequenza e Mai, finestra, minimo, ideale, massimo e scope guidato. Applicare il contratto di vuoti, zeri e priorità; non mostrare coefficienti del solver nel form Base. Integrare target generici e famiglie nelle preferenze e nella sicurezza. Il riepilogo mostra pasti che contano, scostamenti e conflitti.

**R3.4 Conversione delle regole precedenti.** Conservare `legacy_soft`, mostrare differenze e convertire solo con salvataggio esplicito. Non dedurre minimi da more_often, né diagnosi da esclusione del glutine. Le nuove regole sostituiscono quelle convertite senza penalità legacy duplicate.

**R3.5 Compatibilità e validazione dei commit.** Completare derivazione dell’evidenza, appartenenze, gestione di ignoti e tracce, assenza di bypass monouso, invalidazione anteprime e overlay attuale sullo storico. Un confine comune rilegge e valida riferimenti, sicurezza, energia, frequenze e componenti conservati per tutti i commit disponibili. Predisporre i contratti di comando che R4 renderà atomicamente concorrenti. Le nuove assegnazioni mantengono porzioni fisse e tolleranza energetica hard.

**File principali.** `src/domain/configurationRules.js`, `src/ui/configurationPages.js`, `src/planner/recipeFeatures.js`, `src/planner/hardFilter.js`, `src/planner/softScoring.js`, `src/planner/planGenerator.js`, `src/planner/beamSolver.js`, `src/services/planCandidateService.js`, `src/services/planGenerationService.js`, `src/services/effectivePlanService.js`.

**Verifiche di uscita.** T01–T09, T21, T23–T39; T71 per dominio/piano con parte spesa da completare in R6. Eseguire gli stessi attesi su generazione, estensione, sostituzione e riequilibrio. Non calcolare gli expected richiamando il contatore da verificare. Per priorità low/normal/high controllare il mapping 1/2/4 e l’invarianza dei limiti hard come asserzione del contratto T23.

**Consegna.** Motore e configuratori integrati, inventario dei commit coperti, risultati per finestre/confini/conflitti e conversione V1. Nessuna impossibilità di ricerca viene risolta allargando silenziosamente energia, allergie o frequenze.

## R4 Giornata sostituzione e UX

**Obiettivo.** Rendere affidabili e visibili le azioni quotidiane, usando il motore completo di R3.

**Ingresso.** R3; fixture di pasto singolo, composto, nessun candidato, errore e concorrenza. L’esecuzione dei gate UI richiede un browser reale.

**R4.1 Pannello e stato della sostituzione.** Aprire drawer desktop o pannello mobile immediato e contestuale. Gestire caricamento, risultati, vuoto, errore, retry, conferma e annullamento; ignorare risposte obsolete. Mostrare impatto energetico e sulle frequenze. Gestire focus, Escape e ritorno, preservando draft di note e aderenza. Integrare il selettore comune in ricerca e filtri delle alternative.

**R4.2 Componente o intero pasto.** Esporre la scelta definita dalla specifica. Conservare integralmente i componenti non scelti. Proporre insiemi approvati di componenti quando serve; non aumentare porzioni né sostituire sempre l’intero array con una sola ricetta. Controllare energia e frequenze sul giorno risultante.

**R4.3 Comandi concorrenti e history.** Completare il confine transazionale o protocollo equivalente nel repository, controllo delle versioni, serializzazione per piano e idempotenza persistente. Leggere il before al commit dopo il confronto autorevole. Provare due tab e transazioni interrotte; BroadcastChannel o un lock in memoria non bastano. Conferma e undo generano una sola operazione logica.

**R4.4 Navigazione e gerarchia.** Organizzare Oggi, Calendario, Ricette e Spesa; configurazione ordinata e Diagnostica avanzata. Eliminare titoli duplicati nelle card, rendere leggibili quantità e stati, preservare filtri e ritorno. Calendario mobile in agenda e classe giorno comprensibile oltre al solo colore. Applicare livelli Base/Avanzate e preset espliciti.

**R4.5 Onboarding riprendibile.** Implementare lingua/fuso, sicurezza, struttura, preferenze, obiettivi o valori dimostrativi e anteprima. Distinguere profilo non verificato e nessuna allergia dichiarata. Il catalogo rimane esplorabile e il riepilogo mostra le scelte ancora predefinite.

**R4.6 Accessibilità errori e continuità delle bozze.** Verificare focus, nomi accessibili, etichette persistenti, errori associati, target, contrasto, zoom e movimento ridotto. Sostituire gli alert tecnici nei flussi ordinari. Ricerca/import non sovrascrivono editor modificati. Verificare IT/EN, schermi richiesti e nomi lunghi; il controllo per regex del sorgente non è una prova visiva.

**File principali.** `src/ui/planPages.js`, `src/ui/uiState.js`, `src/ui/app.js`, `src/ui/configurationPages.js`, `src/ui/catalogPages.js`, `src/styles.css`, `src/services/effectivePlanService.js`, `src/services/operationHistoryService.js`, confine di repository e test browser.

**Verifiche di uscita.** T11/T12, T40–T46, T48, T77–T79; T47 sul piano con integrazione spesa finale in R6. T63 sui flussi completati e matrice browser registrata. Riverificare T07/T09/T31 sui nuovi percorsi. Registrare la riproduzione del caso Sostituisci prima e dopo, oppure descrivere onestamente la copertura senza attribuire una causa non osservata.

**Consegna.** Flussi utilizzabili e verificati su desktop/mobile, evidenze browser e multi-tab, nessun draft perso nei casi obbligatori. Restano esplicitamente da chiudere le verifiche di spesa e backup R6.

## R5 Catalogo italiano e mediterraneo

**Obiettivo.** Consegnare alimenti e piatti pertinenti, con identità, dati e compatibilità verificabili.

**Ingresso.** R1 per strutture e staging; R2 per ricette e titoli; R3 prima della pubblicazione per validazione di sicurezza e fattibilità. È ammesso preparare le fonti mentre si completano altre fasi, rispettando questi confini.

**R5.1 Manifest e pilot.** Elencare nominalmente concetti, forme, alias e gruppi. Coprire tutti i gruppi nel pilot 40 concetti/60 forme, incluse ambiguità italiane e stati difficili. Preparare la successiva copertura 200/300 secondo le quote CAT-02 e i 120 piatti CAT-04; nessun record Altro o variante di grammi vale come nuovo concetto o piatto.

**R5.2 Adapter e normalizzazione delle fonti.** Implementare acquisizione/staging separati per CREA, Ciqual, USDA ed eventuali etichette pertinenti. Verificare la versione e le condizioni effettive al momento dell’acquisizione. Conservare record originali, hash, unità, definizione dei nutrienti, trasformazioni e provenienza. Consentire estratti manuali autorizzati. In assenza di corrispondenza o dati essenziali, lasciare il record irrisolto; nessun valore plausibile inventato da AI completa la riga.

**R5.3 Revisione e pubblicabilità dei record.** Separare controlli automatici, nutrizionali, sicurezza e revisione culinaria; compilare approvazioni solo se effettivamente avvenute. Applicare regole positive e controesempi. Portare avanti gli ID e i motivi del manifest R0 fino alla destinazione definitiva: corretto, sostituito con revisione, oppure ancora escluso. La scomparsa di un record dal conteggio non prova che sia stato corretto.

**R5.4 Scala piatti e copertura del planner.** Dopo il pilot accettato, raggiungere 200 concetti, 300 forme e 120 piatti curati distinti. Misurare titoli, stati, peso finale, tempi, allergeni, varietà per concetto/piatto e fattibilità sui profili di test. Conservare storico e contenuti locali. Pubblicare il pacchetto di catalogo in modo coerente con schemi e build; non cambiare l’etichetta delle vecchie 1.800 combinazioni per farle risultare italiane.

**File principali.** `src/corpus/fdcAutoCuration.js`, `src/corpus/v1PhaseBRoleClassifier.js`, `src/corpus/v1PhaseBRecipeGenerator.js`, `src/corpus/recipePipeline.js`, `scripts/corpus/`, manifest di fonti/staging, `public/data/`, specifiche della pipeline e `skills/yourdietmanager-builder/`.

**Verifiche di uscita.** T20, T49, T53–T56; ripetere T01/T02/T03/T10/T52 sul catalogo distribuito. T54 conserva condizioni e riproducibilità del pacchetto effettivo; T55 non accetta approvazioni umane simulate. Un dato in attesa di revisione non conta nei target. Le sottotappe pilot e scala hanno rapporti separati.

**Consegna.** Catalogo, manifest nominale, provenienza, rapporti di qualità, elenco degli esclusi e report di fattibilità. Se una fonte o revisione manca, consegnare staging e strumenti ma dichiarare BLOCCATO il relativo gate di pubblicazione e la fase incompleta.

## R6 Spesa continuità dati e privacy

**Obiettivo.** Collegare il piano agli acquisti e garantire che i dati personali restino recuperabili durante gli aggiornamenti.

**Ingresso.** R3, R4 e R5, più migrazioni R1; catalogo di accettazione e piano storico/locali delle fixture disponibili.

**R6.1 Gruppi e forme di acquisto.** Raggruppare per reparto e concetto; mantenere forme incompatibili in righe separate. Integrare il selettore comune e le conversioni direzionali scelte dall’utente con fonte e anteprima. La forma di acquisto non cambia la revisione nutritiva del pasto.

**R6.2 Checklist digest ed esportazione.** Conservare note e righe manuali, segnalare quantità aumentate su righe già spuntate e calcolare obsolescenza dai soli input materiali. Aderenza o note del pasto non invalidano la spesa. Implementare periodo, reparti, testo e stampa con indicazione degli esterni ignoti. Verificare persone nella spesa senza alterare il piano.

**R6.3 Backup autosufficiente e import atomico.** Includere la chiusura transitiva dei riferimenti storici, famiglie, regole, evidenze e mapping. Importare offline con catalogo diverso, controllare dimensioni/hash/schema/riferimenti e applicare una mutazione finale protetta. Completare round trip, interruzione e ripresa su tutte le nuove entità. Conservare quantità, note, history e valori storici.

**R6.4 Upgrade offline e client precedenti.** Aggiornare shell, schemi e catalogo senza pacchetti misti; impedire scritture dalle tab vecchie e gestire versionchange, quote e download interrotti. Provare prima installazione, reload offline e upgrade a due tab. Nessun account diventa necessario per i flussi locali già previsti.

**R6.5 Privacy e diagnostica.** Verificare che il profilo non venga inviato per generazione o acquisizione fonti. Esportare diagnostica locale con dati sensibili esclusi di default. Trattare etichette e contenuti importati come testo; validare URL e preservare la separazione delle chiavi dagli asset pubblici. Nessuna telemetria obbligatoria.

**File principali.** `src/services/shoppingService.js`, `src/ui/shoppingPages.js`, `src/services/backupEngine.js`, `src/services/migrationRunner.js`, `src/services/operationHistoryService.js`, `src/db/database.js`, `public/service-worker.js`, `scripts/build.mjs` e moduli di diagnostica.

**Verifiche di uscita.** T19, T47, T57–T62, T71 completo e T74–T76. Riverificare T39/T50/T59 e tutti i nuovi record dopo export/import. T61 include import malevoli o corrotti; T62 usa due tab reali. Completare gli scope di ING-10, SWAP-09 e INV-07 rimasti legati alla spesa.

**Consegna.** Spesa, backup e upgrade applicabili, prove di ripristino offline con catalogo differente, rapporto privacy/diagnostica e stato aggiornato di tutti i requisiti trasversali.

## R7 Accettazione del core

**Obiettivo.** Verificare sulla stessa build e sullo stesso catalogo l’intera revisione core. Non usare questa fase come contenitore di funzionalità non implementate nelle fasi titolari.

**Ingresso.** R0–R6 con consegne presenti e nessun requisito core ancora da implementare. La matrice completa può indicare verifiche finali in attesa, ma non funzionalità promesse senza codice.

**R7.1 Accettazione integrata.** Eseguire T01–T65 e T71–T79, la matrice browser e le regressioni pertinenti esistenti. Trattare i 74 ID come scenari di accettazione e registrarne le sottoprove: non farli coincidere artificialmente con il numero di test del framework. Un test parziale non chiude l’ID. Risolvere FAIL nella fase titolare e ripetere le prove influenzate sulla nuova build.

**R7.2 Prestazioni e qualità misurate.** Eseguire T64 sulla macchina dichiarata, con query e scenari/seed registrati e dataset di 10.000 ricette. Distinguere import iniziale da stato caldo. Verificare i budget già prescritti: ricerca p95 250 ms, apertura pannello 100 ms, alternative p95 2 s, piani 7/31/90 giorni 5/15/60 s e annullabilità. Non eliminare outlier né dedurre il risultato dalla complessità del codice.

**R7.3 Coerenza documentale e dossier.** Completare T65 e il controllo automatico dei collegamenti. Verificare spec, skill, esempi, schemi duplicati e contratti attivi; conservare la baseline H. Produrre il dossier della nuova release candidata con digest, build, catalogo, report, migrazione e problemi residui. Accettazione umana e promozione stable restano distinte; non generare firme, `ACCEPT V1` o pubblicazioni per chiudere il piano.

**File principali.** `tests/`, `scripts/hardening/`, workflow CI, `specs/`, `skills/yourdietmanager-builder/`, `reports/revision_v2/` e materiali di release del progetto. I nomi dei comandi effettivi vanno verificati in `package.json`, senza inventare script già disponibili.

**Gate di uscita.** Zero P0/P1 core aperti; tutti i 74 test core verificati; R19 e R25 restano obblighi core anche se la review li classificava P2; tutti i criteri della sezione 20 della specifica soddisfatti. Nessun requisito o test orfano. Per R8 usare PIANIFICATO COME ESTENSIONE e dichiarare che quelle funzioni non sono ancora abilitate.

**Consegna.** Build o archivio sorgente applicabile con hash, dossier finale, matrice chiusa sul core e istruzioni di aggiornamento/ripristino. Non riutilizzare il gate metadata-only delle fasi G/H come criterio della nuova revisione.

## R8 Estensioni del prodotto

**Obiettivo.** Sviluppare le capacità aggiuntive già previste dalla CR, mantenendo chiaro quali sono effettivamente disponibili.

**Ingresso.** R7 completata. Ogni sottofase comprende dominio, persistenza/migrazione necessaria, UI, test e documentazione. La sua attivazione non modifica gli invarianti del piano personale.

**R8.1 Favoriti e pasti bloccati.** Implementare EXT-01 e T66. Distinguere preferenza della ricetta da blocco dello slot; un lock non supera una nuova incompatibilità di sicurezza. Questa è la prima estensione suggerita dopo il core.

**R8.2 Menu riutilizzabili.** Implementare EXT-02 e T67. Copiare il modello in nuove date tramite anteprima rivalidata; non copiare note e aderenza del giorno di origine.

**R8.3 Dispensa semplice.** Implementare EXT-03 e T68. Quantità e scadenza facoltative; quantità sconosciuta non sottratta dalla spesa. Usare concetto, forma e conversioni comuni.

**R8.4 Avanzi e preparazione anticipata.** Implementare EXT-04 e T69. Contare una sola produzione negli acquisti e ciascun consumo nelle frequenze. Non inventare conservabilità; associare porzioni a versioni ricetta e date coerenti.

**R8.5 Stagionalità e costo.** Implementare EXT-05 e EXT-06 con criteri T70 separati per stagionalità e costo. Dichiarare distintamente quale parte è abilitata. Usare area e mesi documentati per il ranking; prezzi con data/unità e mancanti diversi da zero. Nessun confronto prezzi live o ordine a supermercati viene aggiunto implicitamente.

**Verifiche di uscita.** T66–T70 per le parti abilitate, più regressioni di sicurezza, energia, frequenze, spesa, backup e migrazione influenzate. Non è necessario rieseguire scenari estranei a una modifica senza un rischio concreto; il dossier di ogni estensione motiva la selezione.

**Consegna.** Una consegna distinta per sottofase, elenco delle funzioni abilitate e schema/versioni effettivi. R8 complessiva è completa solo quando tutte e cinque le attività sono chiuse; un’estensione rinviata rimane esplicitamente pianificata.

## Matrice dalla review allo sviluppo

Le righe R01–R27 sono i rilievi della review, mentre R0–R8 sono le fasi di sviluppo. La fase iniziale indica dove comincia l’intervento; la chiusura richiede tutte le parti indicate. R7 riverifica l’intero core sulla build finale.


| Rilievo | Problema della review | Avvio | Chiusura funzionale | Risultato necessario |
| --- | --- | --- | --- | --- |
| R01 | Allergeni mancanti con falso esito compatibile | R0 | R3 e R5 | Classificazione e compatibilità complete sul catalogo nuovo |
| R02 | Pesce crudo in ricette senza cottura | R0 | R0 con riverifica R5 | Quarantena completa dei venti casi e template corretto |
| R03 | Falsi positivi e classificazioni improprie | R0 | R3 e R5 | Regole positive e classificazioni distinte per prodotto |
| R04 | Anteprima confermata dopo modifica delle allergie | R0 | R3 e R4 | Tutti i commit rifiutano stato obsoleto anche fra tab |
| R05 | Riequilibrio con snapshot storico della preview | R0 | R4 | Before autorevole e finestre dei giorni conservati |
| R06 | Limite prima del filtro sulle versioni correnti | R3 | R3 | Candidato corrente recuperato oltre le versioni storiche |
| R07 | Confine concorrente e idempotenza da completare | R0 | R4 | Idempotenza e atomicità con due tab reali |
| R08 | Identità tecnica dominante nell'esperienza | R1 | R2 con integrazione R3 R4 R6 | Concetto e forma coerenti in tutte le superfici |
| R09 | Titoli generati come elenco sorgente | R2 | R5 | Titoli corretti anche sul catalogo distribuito finale |
| R10 | Distinzioni locali da preservare | R1 | R5 | Nessuna denominazione o equivalenza alimentare falsa |
| R11 | Il contratto attuale non esprime la richiesta | R1 | R3 | Frequenze esplicite con conteggio e solver concordi |
| R12 | Conteggio delle finestre incoerente | R3 | R3 | Finestre esatte su storico giorno e futuro |
| R13 | Migrazione comportamentale | R1 | R3 con riverifica R6 | Nessuna frequenza hard inventata nella migrazione |
| R14 | Bug segnalato con causa UI da confermare | R0 | R4 | Percorso realmente visibile e azionabile nel browser |
| R15 | Mancanza di stato senza alternative | R0 | R4 | Stati risultati vuoti errori e retry verificati |
| R16 | Sostituzione intero pasto limitata a una ricetta | R3 | R4 | Scelta componente o insieme di componenti ammissibili |
| R17 | Note non salvate nella giornata | R0 | R4 | Bozze della giornata preservate durante altre azioni |
| R18 | Onboarding sospeso e configurazione poco orientata alle decisioni | R3 | R4 | Onboarding riprendibile e scelte distinguibili dai default |
| R19 | Navigazione eccessivamente tecnica | R4 | R6 | Navigazione ordinaria pulita e diagnostica utile |
| R20 | Densità informativa senza gerarchia sufficiente | R2 | R4 | Gerarchia delle informazioni verificata su mobile e desktop |
| R21 | Errori e accessibilità da verificare oltre il sorgente | R4 | R7 | Accessibilità reale su tutti i flussi finali |
| R22 | Procedimento poco utile e integrato nel contratto | R1 | R2 con riverifica R5 R6 | Procedimento assente nei nuovi flussi e storico preservato |
| R23 | Quantità di consumo senza conversione d'acquisto | R1 | R6 | Forme acquisto e consumi distinti con conversioni valide |
| R24 | Peso finale non dimostrato | R2 | R5 | Peso finale e praticità veri sui contenuti distribuiti |
| R25 | Obsolescenza spesa troppo ampia | R4 | R6 | Solo gli input materiali rendono obsoleta la spesa |
| R26 | Ampiezza numerica con copertura sbilanciata | R1 | R5 | Copertura curata e fattibilità reale con fonti tracciate |
| R27 | Backup dipendente dal catalogo identico | R1 | R6 | Backup autosufficiente e migrazione senza perdita |


## Matrice dei requisiti e delle prove

Ogni ID mantiene il significato integrale della specifica originale. La descrizione breve serve per orientarsi e non sostituisce quel testo. La fase titolare implementa e documenta il requisito; integrazioni e verifiche su componenti successivi restano obbligatorie. Un test citato non è un test già superato. La sezione seguente distingue la prima esecuzione completa dalle prove parziali anticipate.

CR significa requisito esplicito della change request o principio da preservare, senza un difetto numerato corrispondente; deriva dalle sezioni 1, 11, 13, 15, 16 e 19 della specifica o dalle sezioni sulle capacità da preservare e sull’evoluzione del prodotto nella review. Non va inventato un R28 per riempire la cella.


| Requisito | Impegno | Origine | Fase titolare | Attività titolare | Prove |
| --- | --- | --- | --- | --- | --- |
| INV-01 | PWA locale offline senza account obbligatorio | CR §1.2 | R6 | R6.4 | T62, T74 |
| INV-02 | Calcolo deterministico e valori tracciabili | R01, R23, R24, R26 | R5 | R5.2 | T17, T19, T20, T54 |
| INV-03 | Revisioni storiche immutabili e risolvibili | R27 | R6 | R6.3 | T59, T60, T72 |
| INV-04 | Porzioni fisse e persone limitate alla spesa | CR §1.2 | R3 | R3.5 | T37, T46, T57, T71 |
| INV-05 | Energia giornaliera hard ed esterni distinti | CR §1.2 | R3 | R3.5 | T34, T38, T71 |
| INV-06 | Sicurezza prima del ranking e al commit | R01, R04 | R3 | R3.5 | T02, T03, T07 |
| INV-07 | Modifiche esplicite e undo coerente | R05, R07, R25 | R6 | R6.2 | T09, T12, T47, T58 |
| INV-08 | Archetipi iniziali tutti selezionati | CR §1.2 | R2 | R2.4 | T51 |
| INV-09 | IT ed EN senza doppia compilazione locale | CR §1.2 | R4 | R4.6 | T63, T73 |
| INV-10 | Refactoring mirato e architettura preservata | CR §1.2 | R7 | R7.3 | T65, T74 |
| ING-01 | Concetto unico nella tassonomia product_food | R08 | R1 | R1.1 | T13, T72 |
| ING-02 | Percorso gerarchico valido e univoco | R08, R26 | R1 | R1.1 | T53, T72 |
| ING-03 | Etichetta forma e base di peso esplicite | R08 | R1 | R1.1 | T16, T72 |
| ING-04 | Forme nutrizionali distinte con pochi campi | R08, R10 | R1 | R1.1 | T17, T72 |
| ING-05 | Equivalenza di ricerca separata dagli allergeni | R01, R03 | R1 | R1.1 | T01, T72 |
| ING-06 | Fusione solo con mapping e storico conservato | R08, R10 | R1 | R1.1 | T20, T72 |
| ING-07 | Selettore condiviso in modalità concetto o forma | R08 | R2 | R2.1 | T13, T14, T16 |
| ING-08 | Ricerca normalizzata in tutti i campi | R08 | R2 | R2.1 | T14, T15 |
| ING-09 | Risultato generico con forme e sinonimi | R08 | R2 | R2.1 | T13, T15 |
| ING-10 | Selettore uniforme in tutte le superfici | R08 | R2 | R2.4 | T14 |
| ING-11 | Ricette indicizzate per ingredienti e stato vista | R08, R09 | R2 | R2.1 | T14, T22, T63 |
| ING-12 | Stato di pesatura accanto alla quantità | R08, R23 | R2 | R2.2 | T16, T17 |
| ING-13 | Dettaglio semplice con dati tecnici espandibili | R08, R20 | R2 | R2.2 | T63, T77 |
| NUT-01 | Revisione e unità autorevoli per il calcolo | R08, R23 | R1 | R1.2 | T16, T17, T18 |
| NUT-02 | Conversioni versionate direzionali per scopo | R23 | R1 | R1.2 | T17, T18, T19 |
| NUT-03 | Conversione assente esplicitata senza stime | R23 | R1 | R1.2 | T18, T19 |
| NUT-04 | Definizioni nutrizionali armonizzate per fonte | R26 | R5 | R5.2 | T20, T54 |
| NUT-05 | Distinguere mancanti tracce e zero | R26 | R5 | R5.2 | T20 |
| NUT-06 | Peso finale e tempi documentati | R24 | R2 | R2.3 | T52 |
| PREF-01 | Form leggibile minimo ideale massimo | R11 | R3 | R3.3 | T23 |
| PREF-02 | Nessuna regola Frequenza Mai e disattivazione | R11 | R3 | R3.3 | T23, T25 |
| PREF-03 | Intervalli vuoti zero e decimali validati | R11 | R3 | R3.3 | T23 |
| PREF-04 | Mai esclude assegnazioni automatiche e manuali | R11 | R3 | R3.3 | T25 |
| PREF-05 | Minimo massimo hard e ideale soft | R11 | R3 | R3.3 | T24, T37 |
| PREF-06 | Contratto versionato target scope e priorità | R11 | R3 | R3.3 | T23, T36 |
| PREF-07 | Un solo contatore autorevole di dominio | R12 | R3 | R3.1 | T24, T26, T27, T28, T31 |
| PREF-08 | Finestre di date esatte incluso il giorno | R12 | R3 | R3.1 | T26, T27, T32 |
| PREF-09 | Una occorrenza per pasto e target | R12 | R3 | R3.1 | T27, T28 |
| PREF-10 | Conteggio alternativo per giorni | R12 | R3 | R3.1 | T28, T29 |
| PREF-11 | Pasti esterni ignoti esplicitati | R12 | R3 | R3.1 | T34 |
| PREF-12 | Storico necessario e finestre future | R12 | R3 | R3.1 | T30, T31, T32 |
| PREF-13 | Decorrenza e finestre incomplete | R11, R12 | R3 | R3.1 | T33 |
| PREF-14 | Ciclo separato da orizzonte fino a novanta giorni | R11 | R3 | R3.1 | T30, T33 |
| PREF-15 | Intersezione delle regole sovrapposte | R11 | R3 | R3.2 | T35, T36 |
| PREF-16 | Conflitti dimostrabili senza rilassamento | R11 | R3 | R3.2 | T35, T38 |
| PREF-17 | Solver consapevole dei vincoli di finestra | R11, R12 | R3 | R3.2 | T24, T27, T31, T38 |
| PREF-18 | Distinguere impossibilità e ricerca esaurita | R11 | R3 | R3.2 | T38 |
| PREF-19 | Riepilogo con conteggi pasti e scostamenti | R11, R12 | R3 | R3.3 | T24, T34, T37, T38 |
| PREF-20 | Compatibilità delle preferenze precedenti | R13 | R3 | R3.4 | T39 |
| SAFE-01 | Scelta guidata di allergeni concetti gruppi e forme | R01, R08 | R3 | R3.3 | T05, T06 |
| SAFE-02 | FoodGroup versionato senza gruppi annidati | R08 | R1 | R1.1 | T06 |
| SAFE-03 | Profilo versionato senza diagnosi dedotte | R01 | R3 | R3.4 | T05, T79 |
| SAFE-04 | Discendenti e membership applicati esplicitamente | R01, R08 | R3 | R3.5 | T05, T06 |
| SAFE-05 | Evidenza distinta da array allergeni vuoto | R01 | R3 | R3.5 | T01, T03 |
| SAFE-06 | Escludere compatibilità pertinente non verificata | R01 | R3 | R3.5 | T02, T03 |
| SAFE-07 | Tracce e linguaggio di compatibilità corretto | R01 | R3 | R3.5 | T04, T79 |
| SAFE-08 | Distinguere latte lattosio e celiachia | R01 | R3 | R3.5 | T79 |
| SAFE-09 | Allergeni canonici e classificazione semantica | R01, R03 | R3 | R3.5 | T01, T79 |
| SAFE-10 | Derivazione autorevole dagli ingredienti inclusi | R01 | R3 | R3.5 | T01, T02, T04 |
| SAFE-11 | Sicurezza verificata in ogni percorso di scrittura | R01, R04 | R3 | R3.5 | T02, T07 |
| SAFE-12 | Invalidare anteprime e segnalare incompatibilità | R04 | R3 | R3.5 | T07, T08 |
| SAFE-13 | Overlay attuale su storico undo e redo | R04, R05 | R3 | R3.5 | T08, T09 |
| SAFE-14 | Nessun bypass monouso della sicurezza | R01 | R3 | R3.5 | T02, T79 |
| SWAP-01 | Pannello contestuale immediatamente visibile | R14 | R4 | R4.1 | T40 |
| SWAP-02 | Stati asincroni completi e risposte ordinate | R14, R15 | R4 | R4.1 | T40, T42, T43 |
| SWAP-03 | Focus annullamento e bozze preservate | R14, R17 | R4 | R4.1 | T43, T44, T48 |
| SWAP-04 | Alternative ricercabili e paginabili | R14, R16 | R4 | R4.1 | T14, T40 |
| SWAP-05 | Alternative con impatto sul piano | R14, R20 | R4 | R4.1 | T40, T45 |
| SWAP-06 | Scelta fra componente e intero pasto | R16 | R4 | R4.2 | T45 |
| SWAP-07 | Alternative composte ammissibili | R16 | R4 | R4.2 | T46, T71 |
| SWAP-08 | Caso senza alternative spiegato | R15 | R4 | R4.1 | T41 |
| SWAP-09 | Conferma unica rivalidata e undo con spesa | R04, R07, R25 | R4 | R4.3 | T45, T47, T58 |
| REC-01 | Titoli culinari brevi per il catalogo distribuito | R09 | R2 | R2.2 | T49 |
| REC-02 | Titoli autorevoli senza concatenazioni tecniche | R09 | R2 | R2.2 | T49 |
| REC-03 | Nomi brevi senza false equivalenze alimentari | R10 | R2 | R2.2 | T15, T49 |
| REC-04 | Procedimento rimosso in tutti i flussi correnti | R22 | R2 | R2.3 | T50 |
| REC-05 | Conservare solo metadata pratici attendibili | R02, R22, R24 | R2 | R2.3 | T10, T52 |
| REC-06 | Schema ricetta nuovo senza istruzioni e storico integro | R22, R27 | R2 | R2.3 | T50, T60 |
| REC-07 | Checksum indici e schemi coerenti con i formati | R22 | R2 | R2.3 | T50, T65 |
| CAT-01 | Copertura di duecento concetti e trecento forme | R26 | R5 | R5.1 | T53 |
| CAT-02 | Manifest nominale e quote senza duplicati | R26 | R5 | R5.1 | T53 |
| CAT-03 | Pilot di quaranta concetti e sessanta forme | R26 | R5 | R5.1 | T53 |
| CAT-04 | Centoventi piatti distinti e copertura pratica | R26 | R5 | R5.4 | T49, T53, T56 |
| CAT-05 | Adapter distinti e corrispondenze pertinenti | R26 | R5 | R5.2 | T54 |
| CAT-06 | Provenance completa e trasformazioni riproducibili | R26 | R5 | R5.2 | T20, T54 |
| CAT-07 | Acquisizione CREA con condizioni verificate | R26 | R5 | R5.2 | T54 |
| CAT-08 | Versioni e condizioni specifiche di Ciqual e USDA | R26 | R5 | R5.2 | T54 |
| CAT-09 | Selezione curata e proposte AI non autoapprovate | R26 | R5 | R5.3 | T54, T55 |
| CAT-10 | Pipeline ordinata con output versionati | R26 | R5 | R5.3 | T54, T55, T56 |
| CAT-11 | Distinguere verifiche automatiche e revisioni | R01, R26 | R5 | R5.3 | T55 |
| CAT-12 | Escludere pesce crudo non qualificato dai piatti senza cottura | R02 | R0 | R0.2 | T10 |
| CAT-13 | Regole positive e casi di negazione alimentare | R01, R03 | R5 | R5.3 | T01, T54 |
| CAT-14 | Esclusioni di catalogo con storico e contenuti locali preservati | R26, R27 | R5 | R5.4 | T56, T59, T60 |
| UX-01 | Navigazione primaria e configurazione ordinate | R19 | R4 | R4.4 | T63 |
| UX-02 | Diagnostica fuori dai flussi ordinari | R19 | R4 | R4.4 | T63, T75 |
| UX-03 | Editor Base e Avanzate con preset espliciti | R18, R20 | R4 | R4.4 | T63, T77 |
| UX-04 | Onboarding breve e riprendibile | R18 | R4 | R4.5 | T63, T79 |
| UX-05 | Profilo non verificato distinto da nessuna allergia | R18 | R4 | R4.5 | T79 |
| UX-06 | Oggi compatto con titolo unico per componente | R20 | R4 | R4.4 | T63 |
| UX-07 | Aderenza rapida e bozze persistenti per slot | R17 | R4 | R4.1 | T48 |
| UX-08 | Calendario e agenda con ritorno contestuale | R20 | R4 | R4.4 | T63 |
| UX-09 | Ricerca ricette e compatibilità spiegata | R08, R20 | R4 | R4.4 | T14, T63 |
| UX-10 | Card con dati essenziali e titoli veritieri | R20 | R4 | R4.4 | T49, T63 |
| UX-11 | Accessibilità reale di input e interazioni | R21 | R4 | R4.6 | T44, T63 |
| UX-12 | Target touch e assenza di overflow | R21 | R4 | R4.6 | T40, T63 |
| UX-13 | Errori locali utili e diagnostica facoltativa | R15, R21 | R4 | R4.6 | T42, T63, T75 |
| UX-14 | Operazioni asincrone senza perdita delle bozze | R17, R21 | R4 | R4.6 | T42, T48, T78 |
| SHOP-01 | Gruppi generici e ordine dei reparti | R23 | R6 | R6.1 | T57, T76 |
| SHOP-02 | Aggregazione solo fra quantità compatibili | R23 | R6 | R6.1 | T19, T57 |
| SHOP-03 | Forma di acquisto preferita facoltativa | R23 | R6 | R6.1 | T19, T57 |
| SHOP-04 | Checklist note e righe manuali conservate | R25 | R6 | R6.2 | T58 |
| SHOP-05 | Obsolescenza solo per input di acquisto cambiati | R25 | R6 | R6.2 | T47, T58 |
| SHOP-06 | Esportazione stampa e periodo con limiti espliciti | R23 | R6 | R6.2 | T76 |
| HARD-01 | Identità anteprima e precondizioni complete | R04 | R3 | R3.5 | T07 |
| HARD-02 | Confronto con stato autorevole prima della scrittura | R04, R05 | R3 | R3.5 | T07, T11 |
| HARD-03 | Validazione completa del risultato del commit | R04, R05 | R3 | R3.5 | T02, T07, T31, T71 |
| HARD-04 | Concorrenza e protezione transazionale fra tab | R05, R07 | R4 | R4.3 | T11, T12 |
| HARD-05 | Idempotenza dei comandi e annullamento | R07 | R4 | R4.3 | T12, T43, T47 |
| HARD-06 | Riequilibrio con giorni conservati e before attuale | R05 | R4 | R4.3 | T11, T31 |
| HARD-07 | History atomica anche in caso di fallimento | R07 | R4 | R4.3 | T12 |
| PERF-01 | Filtro delle versioni correnti prima del limite | R06 | R3 | R3.2 | T21, T64 |
| PERF-02 | Troncamento di ricerca distinto da assenza | R06 | R3 | R3.2 | T21, T38, T64 |
| PERF-03 | Indici aggiornati per concetti alias e date | R08 | R2 | R2.1 | T22, T64 |
| PERF-04 | Budget misurati su build e macchina dichiarate | CR §13 | R7 | R7.2 | T64 |
| PERF-05 | Planner annullabile senza bloccare interazioni | CR §13 | R3 | R3.2 | T64, T78 |
| PERF-06 | Varietà misurata per concetti e piatti | R26 | R5 | R5.4 | T53, T56 |
| MIG-01 | Versioni DB contenuti e backup assegnate senza downgrade | R27 | R1 | R1.4 | T59 |
| MIG-02 | Migrazione additiva senza reset dei dati | R13, R27 | R1 | R1.4 | T39, T59 |
| MIG-03 | Mapping esplicito degli ID e gestione irrisolti | R08, R27 | R1 | R1.4 | T59, T72 |
| MIG-04 | Nuove revisioni senza sovrascrivere lo storico locale | R01, R27 | R1 | R1.4 | T22, T59, T60, T72 |
| MIG-05 | Backup con chiusura transitiva dei riferimenti | R27 | R6 | R6.3 | T60 |
| MIG-06 | Backup di famiglie regole evidenze e mapping | R27 | R6 | R6.3 | T60 |
| MIG-07 | Import controllato e applicazione atomica | R27 | R6 | R6.3 | T60, T61 |
| MIG-08 | Round trip e ripresa idempotente delle migrazioni | R27 | R6 | R6.3 | T59, T60 |
| OPS-01 | Upgrade coerente di shell schemi e catalogo | R27 | R6 | R6.4 | T62 |
| OPS-02 | Client vecchio bloccato prima delle scritture | R27 | R6 | R6.4 | T62 |
| OPS-03 | Nessun invio del profilo privato per generare il piano | CR §15 | R6 | R6.5 | T74 |
| OPS-04 | Diagnostica esportabile con dati sensibili esclusi | R19 | R6 | R6.5 | T75 |
| OPS-05 | Contenuti importati inerti e nessuna chiave nel bundle | CR §15 | R6 | R6.5 | T61, T74 |
| EXT-01 | Favoriti e blocco dei pasti scelti | CR §16 | R8 | R8.1 | T66 |
| EXT-02 | Menu riutilizzabili con rivalidazione | CR §16 | R8 | R8.2 | T67 |
| EXT-03 | Dispensa semplice con quantità facoltative | CR §16 | R8 | R8.3 | T68 |
| EXT-04 | Avanzi con acquisto contato una volta | CR §16 | R8 | R8.4 | T69 |
| EXT-05 | Stagionalità per area come preferenza soft | CR §16 | R8 | R8.5 | T70 |
| EXT-06 | Costo facoltativo con prezzi locali documentati | CR §16 | R8 | R8.5 | T70 |
| DOC-01 | Specifiche di prodotto e dominio aggiornate | CR §19 | R7 | R7.3 | T65 |
| DOC-02 | Pipeline e skill coerenti con i nuovi contratti | R01, R26 | R7 | R7.3 | T65 |
| DOC-03 | Contratti attivi distinti da compatibilità e storico | R11, R22, R26 | R7 | R7.3 | T50, T65 |
| DOC-04 | Rapporto di ogni fase con prove effettive | CR §19 | R7 | R7.3 | T65 |


## Registro completo delle verifiche

T01–T70 conservano azioni e risultati attesi del documento originale. T71–T79 sono integrazioni additive definite più avanti; diventano parte del gate core R7. Il core comprende dunque T01–T65 e T71–T79, per un totale di 74 test di accettazione. T66–T70 si applicano alle estensioni R8 abilitate. Nessun test è stato eseguito come parte di questa pianificazione.

Prima verifica completa indica il primo punto della sequenza ordinaria in cui si pretende l’intero scenario; una fase precedente esegue i sottoinsiemi necessari e li registra come scope parziali. R0 usa il contratto H per le mitigazioni: T01, T02, T03, T07, T12 e T40–T43 possono essere esercitati in forma mirata, senza dichiarare completati i corrispondenti test V2. Per T07 la prima verifica V2 avviene in R3 e viene ripetuta sui nuovi percorsi R4 e R6. T59 in R1 verifica lo schema e i dati allora disponibili e viene rieseguito in R6 su tutti i nuovi record.


| Test | Scenario | Prima verifica completa | Gate finale |
| --- | --- | --- | --- |
| T01 | Metadati allergeni non ridotti a sottostringhe | R3 | R7 |
| T02 | Ricetta non ammessa con allergene pertinente | R3 | R7 |
| T03 | Compatibilità non verificata | R3 | R7 |
| T04 | Tracce e alimento composto | R3 | R7 |
| T05 | Famiglia sicurezza su tutte le forme | R3 | R7 |
| T06 | Gruppo personalizzato senza testo libero | R3 | R7 |
| T07 | Anteprima invalidata da cambio sicurezza | R3 | R7 |
| T08 | Piano esistente e nuova incompatibilità | R3 | R7 |
| T09 | Undo con sicurezza cambiata | R3 | R7 |
| T10 | Pesce crudo e zero cottura | R0 | R7 |
| T11 | Preview cambiata da altra tab | R4 | R7 |
| T12 | Commit idempotente e atomico | R4 | R7 |
| T13 | Ricerca generica Miglio | R2 | R7 |
| T14 | Ricerca in tutti i campi | R2 | R7 |
| T15 | Sinonimi e ambiguità | R2 | R7 |
| T16 | Forma obbligatoria nella ricetta | R2 | R7 |
| T17 | Nutrienti diversi per forme diverse | R2 | R7 |
| T18 | Unità e conversione mancante | R1 | R7 |
| T19 | Separazione resa spesa e nutrizione | R6 | R7 |
| T20 | Origine e definizione nutrienti | R5 | R7 |
| T21 | Versioni correnti oltre il limite retrieval | R3 | R7 |
| T22 | Aggiornamento alias e indici | R2 | R7 |
| T23 | Validazione form minimo ideale massimo | R3 | R7 |
| T24 | Minimo 2 ideale 3 massimo 4 | R3 | R7 |
| T25 | Semantica Mai | R3 | R7 |
| T26 | Confine esatto di sette giorni | R3 | R7 |
| T27 | Presenze nello stesso giorno | R3 | R7 |
| T28 | Più ingredienti o componenti nello stesso pasto | R3 | R7 |
| T29 | Unità giorni | R3 | R7 |
| T30 | Storico oltre quattordici giorni | R3 | R7 |
| T31 | Finestre future dopo edit | R3 | R7 |
| T32 | Data civile e carry over | R3 | R7 |
| T33 | Orizzonte incompleto e attivazione | R3 | R7 |
| T34 | Pasti esterni sconosciuti | R3 | R7 |
| T35 | Famiglia e figlio in conflitto | R3 | R7 |
| T36 | Scope classi pasto | R3 | R7 |
| T37 | Ideale frazionario | R3 | R7 |
| T38 | Impossibile o ricerca esaurita | R3 | R7 |
| T39 | Migrazione preferenze V1 | R3 | R7 |
| T40 | Pulsante Sostituisci visibile e contestuale | R4 | R7 |
| T41 | Nessuna alternativa | R4 | R7 |
| T42 | Errore asincrono e retry | R4 | R7 |
| T43 | Richieste fuori ordine e annullamento | R4 | R7 |
| T44 | Focus tastiera e ritorno | R4 | R7 |
| T45 | Sostituzione singolo componente | R4 | R7 |
| T46 | Sostituzione intero pasto composto | R4 | R7 |
| T47 | Conferma annullamento e spesa | R6 | R7 |
| T48 | Bozza aderenza e note | R4 | R7 |
| T49 | Titoli brevi e veri | R5 | R7 |
| T50 | Procedimento rimosso end to end | R2 | R7 |
| T51 | Archetipi coerenti | R2 | R7 |
| T52 | Peso finale e praticità reali | R2 | R7 |
| T53 | Pilot e copertura catalogo | R5 | R7 |
| T54 | Provenance e condizioni d'uso | R5 | R7 |
| T55 | Distinzione delle approvazioni | R5 | R7 |
| T56 | Fattibilità e varietà reali | R5 | R7 |
| T57 | Spesa generica senza somme scorrette | R6 | R7 |
| T58 | Checklist dopo cambio quantità | R6 | R7 |
| T59 | Migrazione senza reset | R1 | R7 |
| T60 | Backup indipendente dal catalogo corrente | R6 | R7 |
| T61 | Import malformato e riferimenti orfani | R6 | R7 |
| T62 | Upgrade PWA con due tab e offline | R6 | R7 |
| T63 | UX completa e accessibilità | R7 | R7 |
| T64 | Performance e annullabilità | R7 | R7 |
| T65 | Documentazione e gate della nuova linea | R7 | R7 |
| T66 | Favoriti e lock | R8 | R8 se estensione abilitata |
| T67 | Menu salvato | R8 | R8 se estensione abilitata |
| T68 | Dispensa | R8 | R8 se estensione abilitata |
| T69 | Avanzi | R8 | R8 se estensione abilitata |
| T70 | Stagionalità e costo | R8 | R8 se estensione abilitata |
| T71 | Porzioni energia ed esterni invariati | R6 | R7 |
| T72 | Identità mapping e fusioni senza perdita dello storico | R1 | R7 |
| T73 | Autore italiano senza compilazione inglese obbligatoria | R2 | R7 |
| T74 | Privacy della pianificazione e integrità del bundle | R6 | R7 |
| T75 | Diagnostica locale con contenuti sensibili esclusi | R6 | R7 |
| T76 | Spesa esportata per periodo e reparti persistenti | R6 | R7 |
| T77 | Editor Base e Avanzate senza decisioni implicite | R4 | R7 |
| T78 | Operazioni asincrone del catalogo con editor modificato | R4 | R7 |
| T79 | Stato del profilo e distinzioni di sicurezza | R4 | R7 |


## Test integrativi della pianificazione

Queste prove rendono espliciti aspetti prescritti ma poco isolati nei 70 scenari iniziali. Si aggiungono ai test esistenti e non ne indeboliscono gli attesi. Per i risultati usare lo stesso formato build, catalogo, schema, fixture, atteso, effettivo e stato.


### T71 Porzioni energia ed esterni invariati

Prima esecuzione completa R6. Usare una fixture con piano energeticamente ammissibile e una in cui una soluzione richiederebbe porzioni diverse da uno. Eseguire generazione, estensione, modifica manuale, sostituzione e riequilibrio; ripetere i percorsi introdotti in R4. Atteso: nessun moltiplicatore o tolleranza energetica ampliata di nascosto; risultato rifiutato o ricerca esaurita quando serve. Energia esterna stimata distinta da energia nota. Cambiare persone nella spesa in R6 lascia identici nutrienti e porzioni del piano.


### T72 Identità mapping e fusioni senza perdita dello storico

Prima esecuzione completa R1. Creare due fonti che descrivono la stessa forma e due forme con nomi simili ma composizione diversa; aggiungere un piano storico e una revisione gestita localmente. Tentare mapping mancante, doppio percorso, fusione solo lessicale e reindirizzamento ciclico. Atteso: nessuna fusione automatica; ogni forma corrente ha un solo percorso valido; mapping approvato con motivazione e reindirizzamenti versionati; nessuna media automatica dei nutrienti; ID e valori storici restano risolvibili; il current locale non è sovrascritto. Un concetto Altro non soddisfa la copertura curata.


### T73 Autore italiano senza compilazione inglese obbligatoria

Prima esecuzione completa R2. Creare e modificare una ricetta locale compilando soltanto l’italiano; salvare, duplicare, ricaricare e passare a EN. Atteso: salvataggio valido con forma e quantità corrette; fallback linguistico esplicito, nessun testo tradotto inventato né campo inglese obbligatorio nascosto. Esportazione e reimport mantengono il contenuto. Il catalogo pubblico continua a richiedere etichette curate secondo INV-09.


### T74 Privacy della pianificazione e integrità del bundle

Prima esecuzione completa R6. Usare esclusivamente un profilo sintetico riconoscibile e registrare le richieste di rete durante configurazione, generazione, ricerca, sostituzione ed export. Atteso: nessun dato del profilo, delle allergie o delle note inviato a servizi esterni; asset e cataloghi pubblici identificati separatamente. Ispezionare configurazione e bundle pubblicato: nessuna credenziale o telemetria obbligatoria. Disconnettere la rete dopo il download: i flussi locali previsti restano disponibili senza account. Il log di prova non deve contenere credenziali reali.


### T75 Diagnostica locale con contenuti sensibili esclusi

Prima esecuzione completa R6. Con nomi di regole e note sintetiche, provocare un errore controllato e generare il rapporto diagnostico predefinito. Atteso: versioni, contatori ed error code utili; nomi sensibili e note omessi; nessun upload. L’inclusione facoltativa di dati scelti richiede un’azione esplicita e un’anteprima chiara; annullare non crea una condivisione. Il normale messaggio UI resta leggibile e non mostra stack o ID al posto della spiegazione.


### T76 Spesa esportata per periodo e reparti persistenti

Prima esecuzione completa R6. Creare due periodi con pasti noti, uno esterno ignoto e righe manuali; cambiare l’ordine dei reparti. Selezionare un periodo, esportare il testo e aprire l’anteprima di stampa. Atteso: solo acquisti del periodo secondo le regole dichiarate, righe manuali gestite esplicitamente, forme non aggregabili distinte, ordine reparti persistito dopo reload. L’esportazione indica che gli esterni ignoti non contribuiscono al calcolo; la tassonomia nutrizionale non cambia.


### T77 Editor Base e Avanzate senza decisioni implicite

Prima esecuzione completa R4. Aprire editor ingrediente, ricetta e configurazione; modificare valori, alternare Base e Avanzate, applicare un preset e duplicare una classe con scope di preferenze ristretto. Atteso: draft conservato, modifica del preset resa esplicita, nessun errore o campo obbligatorio irraggiungibile, ID generati. La nuova classe non entra automaticamente in scope ristretto. Nel dettaglio ingrediente nome comune, forma e nutrienti precedono i dati tecnici espandibili.


### T78 Operazioni asincrone del catalogo con editor modificato

Prima esecuzione completa R4. Tenere aperto un editor con testo non salvato; completare una ricerca vecchia, aggiornare indici/import pubblico e provocare un errore asincrono. Atteso: il draft non viene sostituito né salvato implicitamente; richieste obsolete ignorate, comando riabilitato, errore locale e ripresa possibili. Generare un piano costoso e annullarlo: l’interfaccia continua a rispondere e nessuna risposta tardiva scrive il risultato. Ripetere con Worker o chunking effettivamente scelti.


### T79 Stato del profilo e distinzioni di sicurezza

Prima esecuzione completa R4. Aprire una nuova installazione, lasciare la sicurezza non verificata, riprendere l’onboarding e dichiarare esplicitamente nessuna allergia. Atteso: due stati diversi con riepiloghi coerenti; valori dimostrativi riconoscibili. Importare una regola legacy sul glutine: non viene dedotta una diagnosi. Creare separatamente allergia al latte, intolleranza scelta dall’utente e celiachia; nessuna conversione automatica fra condizioni, soglia clinica inventata o override monouso nel picker. Per correggere una regola si apre l’editor, si mostra l’impatto e si salva esplicitamente.


## Struttura persistente da creare nel progetto in R0

I percorsi di questa sezione sono file da creare durante lo sviluppo; non sono dichiarati già presenti nell’applicazione. La struttura usa la radice del progetto H, dove le specifiche attive sono sotto `specs/`.

| Percorso futuro | Contenuto obbligatorio |
| --- | --- |
| `specs/revision_v2/FASI_SVILUPPO.md` | Copia versionata di questo piano |
| `specs/revision_v2/baseline/` | Review, specifica, test originali ed evidenze H con byte e hash conservati |
| `specs/revision_v2/TRACEABILITY.json` | I 149 requisiti con origini, attività, test e stato |
| `specs/revision_v2/TEST_REGISTRY.json` | T01–T79 con fonte, fase prevista e scope |
| `reports/revision_v2/STATE.json` | Stato di nove fasi, quaranta attività, dipendenze e prossima attività eseguibile |
| `reports/revision_v2/R0/REPORT.md` e analoghi R1–R8 | Rapporto della fase secondo il modello seguente |
| `reports/revision_v2/R0/test-results.json` e analoghi | Atteso, effettivo, stato, scope e riferimenti alle evidenze |
| `reports/revision_v2/R0/evidence/` e analoghi | Log pertinenti, screenshot necessari, risultati e hash degli artefatti |
| `specs/revision_v2/DECISIONI.md` | Decisioni con data, motivo e impatto; nessuna modifica implicita al contratto |
| `scripts/validate-revision-v2-traceability.mjs` | Controllo automatico dei collegamenti e dei criteri di chiusura |

L’AI di R0 materializza i JSON dalle matrici di questo piano. Non seleziona un sottoinsieme dei requisiti e non crea requisiti nuovi usando gli stessi ID. L’eventuale suddivisione dei test in casi del framework conserva l’ID padre, per esempio `T31/finestra-futura-minimo`, senza cancellare il risultato aggregato T31.

### Integrazioni obbligatorie tra attività

La matrice dei requisiti assegna il titolare. Questa tabella popola `supportingTasks` per mitigazioni e integrazioni obbligatorie; gli intervalli comprendono entrambi gli estremi. Una dipendenza tecnica non trasferisce la titolarità del requisito. L’assenza di una riga qui non elimina il gate complessivo R7.

| Attività di supporto | Requisiti da collegare | Obbligo aggiuntivo |
| --- | --- | --- |
| R0.1 | DOC-01–04, INV-10 | Inizializzare baseline, registri e disciplina di consegna |
| R0.2 | SAFE-05/06/09/10, CAT-13 | Protezioni provvisorie e controesempi, in aggiunta a CAT-12 di cui è titolare |
| R0.3 | SAFE-11/12, HARD-01/02/03/05/06 | Proteggere il contratto H prima del nuovo modello |
| R0.4 | SWAP-01/02/03/08, UX-07/14 | Feedback iniziale e protezione delle note prima del flusso definitivo |
| R1.3 | SAFE-05/06/10, PREF-06/20, REC-06/07, HARD-01, INV-03 | Preparare schemi, lettori e scrittori per le fasi titolari |
| R1.4 | PREF-20, SAFE-13 | Preservare le regole legacy e i riferimenti per l’overlay successivo |
| R2.4 | INV-09 | Prima verifica del flusso di compilazione solo in italiano |
| R3.3 | ING-07–11, SAFE-02 | Integrare i nuovi configuratori con selettore e gruppi comuni |
| R3.5 | NUT-01, INV-03, MIG-04 | Controllare revisioni e overlay nei commit senza modificare lo storico |
| R4.1 | ING-07–11, PREF-19, SAFE-14 | Integrare ricerca e spiegazioni nel nuovo pannello |
| R4.2 | PREF-07–12, HARD-03 | Contare e validare l’intero pasto risultante |
| R4.3 | HARD-01–03, SAFE-11–13, SHOP-05 | Collegare il protocollo concorrente ai validatori e alla spesa |
| R4.6 | INV-09, ING-13 | Riverificare lingua, dati tecnici espandibili e accessibilità |
| R5.4 | REC-01–03, REC-05, NUT-06, ING-02–05, CAT-12 | Verifica definitiva sui contenuti distribuiti dopo il pilot |
| R6.1 | ING-07–12, NUT-01–03, INV-04 | Integrare ricerca e conversioni nella spesa senza modificare nutrienti |
| R6.2 | SWAP-09, HARD-05/07, INV-07 | Chiudere gli effetti delle modifiche del piano sulla checklist |
| R6.3 | PREF-20, REC-06, MIG-01–04, INV-03 | Verificare tutte le nuove entità nel ripristino completo |
| R6.4 | INV-01, HARD-04 | Verificare disponibilità offline e tab vecchie |
| R7.1 | Tutti i 143 requisiti core, esclusi EXT-01–06 | Verificare asserzioni e integrazioni sulla build finale |
| R7.3 | DOC-01–04 e INV-10 | Chiudere il dossier; i documenti restano comunque obbligatori in ogni fase |

Per un requisito con più prove aggiungere tutti i risultati pertinenti; non usare una sola evidenza generica per attestare scenari mai eseguiti. L’esempio PREF-08 sottostante collega anche R3.2 e R3.5 perché il contatore viene usato da solver e commit: tali collegamenti interni possono essere aggiunti senza ridurre quelli obbligatori qui definiti.

### Contratto del registro dei requisiti

Ogni requisito contiene almeno `requirementId`, `sourceFile`, `sourceSha256`, `reviewIds`, `changeRequestSection` per le origini CR, `ownerPhase`, `ownerTask`, `supportingTasks`, `testIds`, `status`, `remainingScopes`, `changedFiles`, `evidenceIds` e `lastVerifiedArtifactSha256`. `supportingTasks` rende esplicite le integrazioni successive senza assegnare due titolari concorrenti.

Esempio iniziale di una riga, da ripetere per tutti i 149 ID con i propri dati:

```json
{
  "requirementId": "PREF-08",
  "sourceFile": "baseline/yourDietManager_CR_V2_SPECIFICA.md",
  "sourceSha256": "f5cbd0bfb460b4d8791f0746955ecbc40b93d5dca19359eb583eef35172a10ac",
  "reviewIds": ["R12"],
  "changeRequestSection": "5.3",
  "ownerPhase": "R3",
  "ownerTask": "R3.1",
  "supportingTasks": ["R3.2", "R3.5", "R4.2", "R7.1"],
  "testIds": ["T26", "T27", "T32"],
  "status": "DA FARE",
  "remainingScopes": ["generazione", "estensione", "sostituzione", "riequilibrio", "riepilogo"],
  "changedFiles": [],
  "evidenceIds": [],
  "lastVerifiedArtifactSha256": null
}
```

Uno stato VERIFICATO richiede scope residui vuoti, attesi pertinenti superati e almeno un’evidenza riferita alla build controllata. Non basta il commit che introduce il codice. Le prove complete del registro test mantengono i propri stati indipendenti: un requisito può avere asserzioni verificate mentre un test più ampio ha ancora sottoscenari da completare. Tale test non risulta PASS finché tutti i suoi sottoscenari obbligatori non sono passati.

### Controlli automatici della tracciabilità

Il validatore deve fallire nei seguenti casi:

1. Un ID della specifica manca, è duplicato o è stato rinumerato; il totale di riferimento è 149.
2. Un rilievo R01–R27 non ha requisiti collegati e una destinazione di chiusura.
3. Un requisito non ha origine verificabile, fase titolare, attività titolare appartenente alla fase o almeno un test.
4. Un test citato non esiste in T01–T79, oppure un test del registro non è collegato ad alcun requisito.
5. Una delle 40 attività o una delle nove fasi manca dal registro; i riferimenti alle dipendenze sono inesistenti o ciclici.
6. Lo hash dichiarato della baseline non corrisponde al file conservato.
7. Un requisito VERIFICATO ha scope residui o prove mancanti/fallite/bloccate per le asserzioni pertinenti.
8. Un test dichiarato PASS non ha build, catalogo, fixture, azioni, atteso, effettivo e scope completo; il solo exit code di un audit sorgente non vale per una prova browser.
9. Una fase COMPLETATA ha attività obbligatorie non verificate o manca di rapporto e artefatto identificato.
10. R7 viene chiusa con requisiti core da implementare, verifiche integrative aperte, T01–T65/T71–T79 non verificati o P0/P1 core aperti. Anche gli obblighi core classificati P2 nella review restano necessari.
11. R8 dichiara una funzione abilitata senza i relativi T66–T70 o senza regressioni pertinenti documentate.
12. L’evidenza indica una build precedente come se fosse quella attuale, senza rivalidazione o analisi esplicita dell’impatto del delta.

Il comando da aggiungere e poi eseguire a fine fase è `node scripts/validate-revision-v2-traceability.mjs`. Deve esistere e funzionare prima che il rapporto lo dichiari eseguito. Le verifiche strutturali del registro non sostituiscono i test funzionali.

## Rapporto obbligatorio di fine fase

Ogni fase usa lo stesso ordine. I campi senza evidenza restano dichiarati mancanti, non vengono riempiti con valutazioni generiche come tutto ok.

### Identità della consegna

Registrare fase, versione del piano, base di ingresso, commit o hash dell’archivio sorgente in ingresso, build consegnata, catalogo, schema DB/contenuti/backup, data e ambiente delle prove. Un hash di un documento non identifica automaticamente la build dell’applicazione.

### Collegamenti chiusi e ancora aperti

| Attività | Rilievi | Requisiti | File o funzioni modificati | Test e scope | Evidenze | Stato e lavoro residuo |
| --- | --- | --- | --- | --- | --- | --- |
| ID reale | ID della review o origine CR | ID della specifica | Percorsi effettivi e responsabilità | ID dei test con casi eseguiti | EV della fase | Stato consentito e scope da completare |

Ogni evidenza usa un ID stabile, per esempio `EV-R3-001`, e include percorso dell’output, comando o procedura, exit code quando applicabile, risultato, build e hash dell’artefatto. Gli screenshot devono provenire dall’interfaccia effettiva verificata e coprire il caso dichiarato; non usare mockup come prova di funzionamento.

### Migrazione e compatibilità

Descrivere dati prima/dopo, checkpoint, record irrisolti, trattamento dei contenuti locali e procedura di ripresa/ripristino. Riportare i riferimenti alle prove. Se la fase non cambia la persistenza, indicarlo soltanto dopo il controllo del delta.

### Risultati e blocchi

Registrare per ogni test pertinente PASS, FAIL, BLOCKED o DA ESEGUIRE e gli eventuali scope parziali. Includere conteggi e dettagli dei fallimenti. I nuovi test che dimostrano un difetto devono fallire prima della correzione quando riproducibile e passare dopo; se non è stato possibile osservare il prima, dichiararlo. R14 non riceve una causa certa sulla base della sola posizione del codice UI.

### Passaggio alla fase successiva

Indicare l’ultima attività verificata, la prossima attività eseguibile, le dipendenze soddisfatte e i blocchi. Elencare le decisioni nuove con ID e motivo. Aggiornare `STATE.json`, matrice e documenti del dominio nello stesso pacchetto. Un’altra AI deve poter ripartire leggendo questi file, senza ricostruire la cronologia della chat.

## Procedura per eseguire una fase

1. Leggere questo piano, i tre documenti autorevoli, `STATE.json` e i rapporti delle fasi da cui dipende la fase richiesta.
2. Verificare la base effettiva e il delta rispetto all’ultima consegna. Se i sorgenti sono cambiati, aggiornare l’analisi d’impatto e le prove interessate senza falsificare gli hash precedenti.
3. Selezionare le attività della fase e i requisiti titolari/supportati dalla matrice. Completare i prerequisiti necessari già compresi nell’incarico; non promuovere una funzione dipendente da un contratto incompleto.
4. Per ciascuna attività implementare gli strati pertinenti: dati, dominio, service, UI, migrazione, test e documentazione. La matrice determina che cosa deve essere verificabile, non autorizza a limitarsi a un solo strato.
5. Eseguire le prove mirate e le regressioni motivate dal delta. Ampliare i test quando resta un rischio concreto o lo richiede il gate. Non eseguire di nuovo suite estranee solo per aumentare il numero di controlli.
6. Correggere i FAIL; per un BLOCKED registrare prerequisito mancante e procedura necessaria. Proseguire le attività indipendenti utili, mantenendo incompleta la fase quando manca un gate obbligatorio.
7. Aggiornare collegamenti, documenti e rapporto; validare la tracciabilità; consegnare codice applicabile e stato concreto.

Nessuna modifica a policy o vincoli per ottenere un piano, nessuna approvazione umana simulata e nessun reset dei dati per evitare una migrazione sono ammissibili come scorciatoie di fase. La scelta di implementare un refactoring necessario non richiede una nuova definizione del prodotto; un cambiamento del comportamento prescritto deve invece essere esplicito e tracciato.

## Istruzioni pronte per le richieste successive

### Prompt comune da usare con una fase

```text
Implementa la fase <R0…R8> di yourDietManager usando FASI_SVILUPPO,
la review H, la specifica CR V2 e i test di accettazione.
Leggi lo stato persistito e i rapporti delle dipendenze prima di modificare.
Rispetta attività, requisiti titolari, integrazioni e gate della fase.
Conserva gli ID R01–R27, i 149 requisiti e i test T01–T79.
Non dichiarare completo un test eseguito solo in parte.
Aggiorna matrice, stato, specifiche e rapporto con le prove effettive.
Consegna il progetto applicabile e il rapporto della fase con la prossima
attività eseguibile. Non promuovere automaticamente a stable.
```

| Richiesta breve | Ambito concreto da eseguire |
| --- | --- |
| Fai R0 usando il piano tracciato | R0.1–R0.4, baseline e protezioni iniziali; inizializza tutti i registri |
| Fai R1 usando il piano tracciato | R1.1–R1.4, contratti e migrazione, preservando le protezioni R0 |
| Fai R2 usando il piano tracciato | R2.1–R2.4, ricerca generica, ricette e rimozione procedimento |
| Fai R3 usando il piano tracciato | R3.1–R3.5, frequenze, sicurezza, solver e validazione |
| Fai R4 usando il piano tracciato | R4.1–R4.6, sostituzione, UX, concorrenza e browser reale |
| Fai R5 usando il piano tracciato | R5.1–R5.4, pilot prima della scala e pubblicazione subordinata alle verifiche |
| Fai R6 usando il piano tracciato | R6.1–R6.5, spesa, backup, PWA, privacy e diagnostica |
| Fai R7 usando il piano tracciato | R7.1–R7.3, accettazione core, prestazioni e dossier della nuova build |
| Fai R8.1 usando il piano tracciato | Prima estensione, favoriti e lock, con T66 e regressioni pertinenti |

Per una nuova conversazione allegare il progetto dell’ultima fase, il pacchetto della review e questo piano, oppure il progetto che li contiene già nella struttura sopra definita. Se manca un file necessario e non è disponibile nel contesto di lavoro, chiederne l’allegato; non ricostruirlo a memoria. La richiesta di una fase autorizza il lavoro di quella fase e i prerequisiti necessari, mantenendo distinto il rilascio pubblico o la promozione stable.


## Impronta dei documenti di riferimento

Questi hash SHA-256 identificano i file realmente usati per pianificare. Conservare i byte originali nella cartella baseline. Se una successiva richiesta cambia il contratto, creare una nuova versione e aggiornare collegamenti e impatto; non sovrascrivere la baseline lasciando immutato il suo hash.


| Documento | SHA-256 |
| --- | --- |
| yourDietManager_REVIEW_FASE_H.md | 0f47c9b404e816ff540037f9279f2393c33e864e4ee0e30288b31229fb1acc36 |
| yourDietManager_CR_V2_SPECIFICA.md | f5cbd0bfb460b4d8791f0746955ecbc40b93d5dca19359eb583eef35172a10ac |
| yourDietManager_CR_V2_TEST_ACCETTAZIONE.md | 7fbaf3f8fc1275aa2fce431d3512c6ecf1bf35217a24936a1c010d9a4e09654a |


Archivio applicativo di riferimento: `yourDietManager_v1_planner_phaseH_full(1).zip`, SHA-256 `9210fba9cbbe5fc3311790b2fc6554e115a63856a97d555b8a173ee8b2306800`. App `1.0.0-rc.34`, catalogo `1.2.0-planner-phase-d`, DB 6, content schema 3, backup 1. Il piano non contiene una nuova build applicativa.
