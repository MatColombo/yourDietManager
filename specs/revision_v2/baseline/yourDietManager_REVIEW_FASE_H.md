# yourDietManager review della fase H

Funzionalità interfaccia esperienza utente e robustezza

11 settembre 2026 · Versione analizzata 1.0.0-rc.34 · Catalogo 1.2.0-planner-phase-d

La base tecnica ha già molte delle capacità necessarie a un buon pianificatore personale. La revisione deve concentrarsi sulla qualità semantica dei dati, sulla sicurezza effettiva e sulla chiarezza delle azioni quotidiane. Il numero di ricette e il superamento dei test esistenti non dimostrano, da soli, che il catalogo sia culinariamente utile o che ogni flusso sia comprensibile.

La priorità proposta è correggere i problemi di sicurezza e conferma del piano, rendere l'alimento generico l'unità di ricerca, introdurre frequenze esplicite e costruire un catalogo italiano curato. Una revisione estetica isolata lascerebbe aperte le cause principali dei problemi segnalati.

## Evidenze principali

| Indicatore | Risultato verificato |
| --- | --- |
| Ingredienti e forme attuali | 600 revisioni, 86 concetti popolati |
| Uso reale degli ingredienti | 302 revisioni impiegate dalle ricette |
| Catalogo ricette | 1.800 versioni, tutte cuisine_international |
| Titoli oltre 100 caratteri | 1.301 su 1.800 |
| Procedimento generico identico | 1.153 ricette |
| Test esistenti | 247 superati, nessun fallimento |
| Anomalie no cook | 20 ricette con pesce registrato crudo |

Le prove mirate hanno riprodotto un falso passaggio del filtro glutine, un difetto nel conteggio delle frequenze, l'accettazione di un'anteprima dopo modifica della sicurezza e un problema di retrieval con molte versioni storiche.

La sostituzione a livello di servizio funziona nello scenario standard provato, compreso undo. Il difetto percepito dall'utente richiede ancora una riproduzione nell'interfaccia reale; il codice mostra problemi concreti di presentazione della preview e dello stato senza alternative.

La specifica allegata traduce la review in requisiti vincolanti, fasi R0–R8 e 65 test core più 5 test per estensioni. Il progetto applicativo resta la baseline della review: questi documenti definiscono le modifiche da implementare.

<!-- PAGE -->

## Funzionalità già presenti e stato reale

| Area | Stato nella fase H | Valutazione |
| --- | --- | --- |
| PWA locale e offline | Implementata con IndexedDB e cache | Fondazione da preservare |
| Obiettivi nutrizionali | Energia giornaliera hard, macro/fibra soft | Potente; spiegazione UX da migliorare |
| Classi giorno e pasto | Configurabili con capacità e regole | Buona flessibilità, editor complessi |
| Cicli e carry over | Cicli 1–31 giorni, date civili e offset | Distintivo; necessario rigore nei conteggi |
| Generazione e continuazione | Anteprima, conferma, estensione | Presenti; precondizioni commit insufficienti |
| Sostituzione e riequilibrio | Servizi e schermate esistenti | Servizio provato; UX da correggere |
| Storico e undo redo | Snapshot e operazioni persistite | Buona base, rischio di snapshot obsoleti |
| Aderenza | Stato pasto, note, stime esterne | Presente; bozze della giornata non protette |
| Preferenze | Ranking, autoExclude, massimo soft | Non soddisfa minimo e ideale richiesti |
| Sicurezza parametrica | Allergene, ingrediente, productFood | Già parziale; affidabilità dei dati critica |
| Ricette e ingredienti locali | Modifica, duplicazione e versioni | Preservare promozione a gestione locale |
| Ricerca e tassonomie | Filtri e selettore product_food | Concetto presente, uso ancora disomogeneo |
| Spesa | Aggregazione, persone, checklist | Manca ponte affidabile verso acquisto |
| Backup e migrazioni | Presenti e testati | Ripristino legato al catalogo identico |
| Tema lingua e accessibilità | IT/EN, densità, focus e contrasto | Audit sorgente positivo, QA visiva aperta |
| Onboarding | Sospeso | Ingresso nel prodotto da ridisegnare |

Non conviene ricostruire da zero queste capacità. Occorre correggerne i contratti e collegare meglio le decisioni dell'utente agli effetti del motore.

La configurabilità utile riguarda periodi, pasti, famiglie, preferenze e praticità. La base corrente tende anche a esporre dettagli tecnici come seed, qualità del catalogo e strumenti di accettazione: sono utili agli sviluppatori, ma devono passare in Diagnostica.

<!-- PAGE -->

## Problemi bloccanti nei dati alimentari

**R01 P0 — Allergeni mancanti con falso esito compatibile.** Il record Pasta dry unenriched, ing_fdc_168927, non contiene gluten_cereals. Lo stesso accade nei record di cous cous e farro identificati dall'audit. Il record Nuts brazilnuts raw, ing_fdc_2515373, ha allergenIds vuoto. Alcuni noodles all'uovo riportano soltanto eggs.

La ricetta recver_010b59396aeed81589064c94_v1, con pasta secca generica, passa hardFilterRecipe con esclusione glutine attiva. Questa è una prova sul comportamento del codice e sui dati distribuiti, non una semplice ipotesi UX.

**Causa.** conservativeAllergens in src/corpus/fdcAutoCuration.js cerca parole come wheat o barley; descrittori senza quelle parole sfuggono alla regola. La derivazione delle ricette propaga fedelmente un dato ingredienti incompleto. Test che controllano soltanto gli stessi tag non rilevano l'errore semantico iniziale.

**Correzione.** Evidence di sicurezza distinta da array vuoti; mapping curato per forme e prodotti composti; fallback non verificato; controllo indipendente sulle aspettative degli alimenti. Correggere nuove revisioni e ricette coinvolte, mantenendo lo storico e segnalando i piani futuri incompatibili.

**R02 P0 — Pesce crudo in ricette senza cottura.** Venti ricette con cookMinutes=0 includono una revisione di pesce con basis.state=raw. Esempio: Fish mahimahi raw nel template mini-fish-grain. I metadata dichiarano anche coldSuitable e mealPrepSuitable, senza una qualificazione specifica per l'uso crudo.

**Causa.** Il ruolo fishSeafood ammette questi record; il template mini-fish-grain applica noCook(8). Il procedimento generico non costituisce una verifica della preparabilità.

**Correzione.** Quarantena dei casi incompatibili e classificazione positiva delle forme ammesse. Togliere il procedimento, come richiesto, non sana questa incoerenza dei metadata: la correzione deve avvenire anche nella pipeline.

**R03 P1 — Falsi positivi e classificazioni improprie.** Peanut butter reduced sodium riceve milk per la parola butter. Otto noodles all'uovo sono assegnati al gruppo sorgente Uova. Le categorie product_food e quelle legacy possono quindi produrre preferenze diverse sullo stesso alimento. Separare categoria culinaria, composizione allergeni e classificazione della fonte.

Riferimento informativo: la FSA distingue allergeni, ingredienti non coperti dai 14 gruppi e rischio di tracce. Una banca dati nutrizionale non certifica la confezione acquistata. [FSA](https://www.gov.uk/government/publications/food-allergy-and-intolerance-advice-for-consumers/food-allergy-and-intolerance-advice-for-consumers)

<!-- PAGE -->

## Problemi di integrità delle modifiche

**R04 P0 — Anteprima confermata dopo modifica delle allergie.** La prova genera un'anteprima, salva una regola che esclude uno dei suoi ingredienti e conferma quella stessa anteprima. commitGeneratedPreview la accetta. La verifica è stata eseguita con i servizi reali e repository di test in memoria.

Il commit controlla status success e costruisce la mutazione; non confronta lo snapshot con la configurazione attuale e non rivalida la sicurezza. Anche il commit del riequilibrio non mostra questo confine di verifica.

**Modifica richiesta.** Precondizioni esplicite su configurazione, catalogo, policy e giorni letti, rivalidazione al commit e rifiuto STALE_PREVIEW prima di qualsiasi scrittura. Tutte le operazioni devono passare da un confine comune; una validazione al momento della sola generazione non è sufficiente.

**R05 P1 — Riequilibrio con snapshot storico della preview.** commitRebalancePreview usa preview.sourceDays per lo stato prima della modifica. Se il giorno è cambiato nel frattempo, conferma e undo possono usare uno snapshot vecchio. Il rischio emerge dal codice; il comportamento con due tab non è stato eseguito in questa review.

**Modifica richiesta.** Verifica concorrenza e lettura autorevole al commit; nessuna sovrascrittura della modifica concorrente. Il piano risultante da un riequilibrio parziale deve essere validato insieme ai giorni conservati, incluse le finestre future.

**R06 P1 — Limite prima del filtro sulle versioni correnti.** PlanCandidateService preleva fino a 500 versioni e poi elimina quelle storiche. Una fixture con 500 vecchie versioni e una corrente valida restituisce zero candidati. La baseline attuale ha al massimo 450 ricette per archetipo, ma edit ripetuti o espansione del catalogo espongono il difetto.

**Modifica richiesta.** Recuperare o indicizzare le versioni correnti eleggibili prima del limite. Quando la ricerca è incompleta, distinguerla dall'assenza effettiva di candidati.

**R07 P1 — Confine concorrente e idempotenza da completare.** La history è scritta atomicamente, ma lettura del puntatore e costruzione del comando precedono la transazione. Servono controllo di versione, serializzazione per piano e commandId. Questa è una lacuna rilevata da ispezione, non un incidente multi-tab osservato.

I file coinvolti sono effectivePlanService.js, planGenerationService.js, operationHistoryService.js e planCandidateService.js. I test T07–T12 e T21 vincolano la correzione.

<!-- PAGE -->

## Ingredienti generici forme e denominazioni

**R08 P1 — Identità tecnica dominante nell'esperienza.** Product_food esiste già: 203 termini, di cui 86 concetti popolati. Il miglio cotto e quello soffiato condividono product_concept_millet. Non manca quindi tutta l'infrastruttura: manca un suo uso uniforme nelle ricerche e nella presentazione delle forme.

IngredientFamily è attualmente legata a un'identità nutrizionale sorgente; non coincide con l'alimento generico che l'utente intende cercare. Tutti i 600 record hanno alias italiani vuoti. Cercare soltanto nomi originali e ID di percorso non copre adeguatamente sinonimi italiani e denominazioni comuni.

| Livello proposto | Esempio | Uso nell'app |
| --- | --- | --- |
| Concetto | Miglio | Ricerca, filtri, preferenze e sicurezza generale |
| Forma | Cotto e scolato; soffiato | Scelta di ciò che si pesa o acquista |
| Revisione | Fonte e valori della forma | Calcolo e storico immutabile |

Il catalogo deve mostrare una voce Miglio espandibile. I filtri sul concetto includono le forme; una riga ricetta richiede invece una forma precisa. Nome breve e precisione nutrizionale sono compatibili: «Miglio · cotto · 150 g».

**R09 P1 — Titoli generati come elenco sorgente.** Il titolo più lungo misura 171 caratteri; 1.301 dei 1.800 superano 100. familyPhrase/shortLabel concatenano i descrittori delle revisioni. La fase D ha migliorato alcune etichette degli ingredienti, ma i titoli ricetta restano quelli già generati con parentesi e descrittori vecchi.

**Modifica richiesta.** Titolo culinario curato con massimo 70 caratteri, senza fasce energetiche o note USDA. Il filtro ingrediente deve funzionare anche quando il suo nome non compare nel titolo. Vietato risolvere tutto con ellissi CSS o rimozione indiscriminata di dettagli significativi.

**R10 P1 — Distinzioni locali da preservare.** Mozzarella nonfat e mozzarella standard non sono lo stesso record; parmesan non autorizza una denominazione italiana protetta. Zucchina non deve diventare indistintamente Zucca. Traduzione e mapping devono riflettere il prodotto effettivo.

**Decisione.** Riutilizzare product_food come identità generica e introdurre soltanto metadata essenziali per le forme. Non costruire una seconda tassonomia concorrente e non fondere gli ID storici in base al testo.

<!-- PAGE -->

## Preferenze di frequenza e configurabilità

**R11 P1 — Il contratto attuale non esprime la richiesta.** FoodPreferences contiene livelli more_often/normal/less_often/rarely, autoExclude e un massimo opzionale in una finestra di 1–31 giorni. Quel massimo è una penalità soft: può essere superato. Non esistono minimo e ideale numerici.

**R12 P1 — Conteggio delle finestre incoerente.** recent() esclude entry.date uguale alla data corrente. Due pasti dello stesso giorno non si vedono. Per W=7 la soglia parte da D-7, quindi può contare sette giorni precedenti più il candidato del giorno corrente. La prova evidenzia entrambi i comportamenti. Inoltre i servizi recuperano solo 14 giorni di storico anche se il form consente finestre maggiori.

**Nuovo form proposto.** «In ogni periodo di 7 giorni voglio Legumi almeno 2, idealmente 3 e al massimo 4 volte». Minimo e massimo sono limiti hard; l'ideale guida il ranking. La voce «Mai nel piano» esclude il target in modo esplicito. Nessun parametro della funzione obiettivo è necessario all'utente.

| Decisione | Regola della specifica |
| --- | --- |
| Che cosa conta | Un pasto contenente il target, non ogni riga ingrediente |
| Più forme nello stesso pasto | Una occorrenza sul concetto generico |
| Pranzo e cena | Due occorrenze; opzione avanzata per contare giorni |
| Finestra | D-W+1 fino a D, inclusi gli estremi |
| Data | Data civile di consumo nella timezone del piano |
| Giorni non coperti | Stato pending, non zeri inventati |
| Pasto esterno ignoto | Lacuna dichiarata, non compatibilità presunta |
| Regole famiglia e figlio | Si applicano entrambe; conflitti spiegati |

L'ideale frazionario, per esempio 2,5, non genera mezzo pasto. È una preferenza rispetto a conteggi interi e non una promessa di media esatta. Le finestre future toccate da una sostituzione devono essere rivalidate.

**R13 P1 — Migrazione comportamentale.** Non esiste una conversione onesta di more_often in tre volte a settimana. Le regole precedenti devono restare operative tramite compatibilità finché l'utente sceglie frequenze esplicite. Anche trasformare un massimo soft in hard richiede che la differenza sia mostrata e salvata.

La nuova specifica estende la finestra fino a 90 giorni, separandola dal ciclo 1–31; richiede progressi, annullamento e un risultato che distingua impossibilità dimostrata da ricerca esaurita.

<!-- PAGE -->

## Il pulsante Sostituisci e la gestione giornata

**R14 P1 — Bug segnalato con causa UI da confermare.** L'utente riferisce che il pulsante non funziona. La prova sui servizi della stessa build genera un piano di sette giorni e ottiene otto alternative per ciascuno dei quattro pasti del primo giorno. Conferma e undo funzionano. Il guasto non è stato riprodotto come problema generale del servizio.

Nel codice di manageDayBody, la preview viene aggiunta dopo tutta la lista dei pasti e le azioni di riequilibrio. Il click esegue state.render() sulla stessa route. Il focus di renderApp si sposta soltanto quando cambia route; non c'è uno scroll specifico alle alternative. Questo può rendere invisibile il risultato all'utente, ma senza browser reale non va presentato come unica causa certa del caso segnalato.

**R15 P1 — Mancanza di stato senza alternative.** replacementPreviewCard rende intestazione e lista, ma non un messaggio per candidates vuoto. createReplacementPreview può restituire success con zero candidati dopo i filtri. La schermata deve distinguere caricamento, risultato, vuoto ed errore.

**R16 P1 — Sostituzione intero pasto limitata a una ricetta.** Il piano può contenere più componenti a porzione fissa. La sostituzione propone una singola ricetta e il commit sostituisce l'intero array con un componente. Questo può impedire alternative a pasti composti per effetto del vincolo energetico. La prova standard aveva componenti singoli: questo limite è rilevato dal codice.

**Flusso richiesto.** Aprire un drawer immediatamente contestuale al pasto; cercare alternative; mostrare variazione di energia, tempi e frequenze; confermare una volta; offrire undo. Se ci sono più componenti, scegliere intero pasto o componente. Preservare gli altri componenti e tutti i vincoli.

Focus, Escape, annullamento, richieste fuori ordine e doppio click fanno parte della feature. Non basta verificare che un pulsante sia presente nel DOM. Il test browser storico usa anche click programmatici su elementi: questi possono superare un controllo pur quando il percorso visivo è scomodo.

**R17 P1 — Note non salvate nella giornata.** uiState.isEditableRoute non include calendar/day, mentre la pagina contiene editor di aderenza e note. Un render completo può perdere input ancora non salvati. Occorre uno stato bozza per slot o un'esplicita scelta di scarto.

I test T40–T48 definiscono la correzione verificabile; non sarà sufficiente spostare il pulsante o cambiare il testo.

<!-- PAGE -->

## Interfaccia esperienza e accessibilità

L'analisi di questa sezione è strutturale, basata su componenti, flussi, CSS e contratti. Non attribuisce una verifica visiva a schermate non aperte nel browser.

**R18 P1 — Onboarding sospeso e configurazione poco orientata alle decisioni.** La nuova installazione parte da una configurazione neutra; l'onboarding è disabilitato. Per un'app molto configurabile, l'utente deve distinguere ciò che ha scelto dai valori predefiniti. Serve un percorso breve riprendibile con sicurezza, giorni/pasti, preferenze e anteprima, lasciando consultabile il catalogo.

**R19 P2 — Navigazione eccessivamente tecnica.** app.js inserisce Validazione planner e Accettazione manuale nella navigazione secondaria ordinaria. La creazione piano mostra il seed. Il pannello catalogo espone versioni e conteggi in modo permanente. Spostare i dettagli di sviluppo in Diagnostica e lasciare nel percorso principale gli effetti per l'utente.

**R20 P1 — Densità informativa senza gerarchia sufficiente.** In mealCard il nome appare nella testata e di nuovo nel link, amplificando titoli già lunghi. Il dettaglio ricetta presenta origine, procedimento, tassonomie e storico nello stesso flusso. Proposta: una sola etichetta breve per componente, quantità/stato e nutrienti prima, dati tecnici in espansione.

**R21 P1 — Errori e accessibilità da verificare oltre il sorgente.** Esistono skip link, focus visibile, aria-current, riduzione movimento, lingue e controllo di contrasto. L'audit passa 16/16, ma cerca principalmente stringhe nel codice. Non dimostra label associate, target realmente utilizzabili, assenza di overflow, ordine focus e contrasto di tutte le combinazioni dinamiche.

Il planner usa vari alert(error.message), che possono esporre errori tecnici e interrompere il flusso. Sostituirli con feedback locale, retry e dettagli tecnici facoltativi. I controlli delle preferenze e della sicurezza devono avere etichette persistenti, non solo placeholder.

**Criteri UX proposti.** Ricerca e ritorno al punto precedente; giornata modificabile con una scelta e una conferma; mobile con agenda; filtri leggibili e azzerabili; nessuna perdita delle bozze; stato del catalogo durante import non bloccante; tempo totale coerente; 44 px come obiettivo interno touch.

L'obiettivo è WCAG 2.2 AA con test browser reale. Il criterio 2.5.8 prevede un minimo di 24×24 CSS px con eccezioni: l'obiettivo interno di 44 px non deve essere confuso con quel requisito normativo. [W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

<!-- PAGE -->

## Procedimento nutrizione e lista della spesa

**R22 P1 — Procedimento poco utile e integrato nel contratto.** La richiesta di rimozione è motivata dai dati: 1.153 ricette hanno lo stesso testo di tre passi. Altre istruzioni sono principalmente la lista degli ingredienti più frasi generiche. Lo schema lo richiede e l'editor lo valida: nascondere la sezione lascerebbe il lavoro obbligatorio.

Rimuoverlo da editor, validatori nuovi, pipeline, dettaglio, indici e export ordinari. Mantenere lettori/backup compatibili per le versioni storiche. Conservare stati di pesatura, tempi attendibili e metadata pratici. Non sostituire il procedimento con un campo equivalente dal nome diverso.

**R23 P1 — Quantità di consumo senza conversione d'acquisto.** Tutte le 600 revisioni distribuite hanno conversions vuoto. Il motore supporta conversioni di unità, ma non c'è copertura dati per l'uso quotidiano. ShoppingService aggrega correttamente per ingrediente/unità/stato; così evita somme scorrette, ma mantiene forme difficili da acquistare come voci distinte.

Proposta: gruppi per alimento generico e reparto, forme sotto il gruppo, conversione opzionale verificata verso acquisto. Miglio crudo e cotto non sono sommabili in grammi senza resa. g/ml richiede densità; sgocciolato e confezione richiedono parte edibile. Senza informazione, la lista deve mostrare il limite.

**R24 P1 — Peso finale non dimostrato.** Il generatore assegna finalWeightG dalla somma dei pesi delle righe, anche per piatti cotti. Questa somma descrive il peso degli ingredienti, non necessariamente il prodotto finale dopo assorbimento o perdita d'acqua. Usare dato verificato o null.

**R25 P2 — Obsolescenza spesa troppo ampia.** L'aderenza aggiorna planUpdatedAt e lo stesso timestamp contribuisce allo stato della checklist. Una modifica della nota non cambia cosa comprare. Usare un digest dei soli input di acquisto; gestire esplicitamente l'aumento di quantità su una riga già spuntata.

Il calcolo deterministico per revisione è un punto di forza. L'espansione alle fonti europee richiede però adattamento delle definizioni: carboidrati disponibili e carboidrati totali non sono sempre comparabili; mancante non equivale a zero. Sono requisiti per il nuovo import, non errori numerici già dimostrati su ogni record H.

<!-- PAGE -->

## Catalogo mediterraneo e fonti alimentari

**R26 P1 — Ampiezza numerica con copertura sbilanciata.** Dei 600 record, 468 provengono da SR Legacy 2018 e 132 da Foundation 2026-04. Il concetto Suino assorbe 108 record; 52 sono in Altra frutta e 30 in Altre verdure. La classificazione gusto usa solo neutro, dolce e fresco; tutte le ricette sono internazionali e distribuite in otto famiglie effettivamente usate.

L'import deterministico non è il problema in sé. Il limite è chiedergli di scegliere anche sinonimi, ingredienti culturalmente pertinenti e abbinamenti culinari. Un campionamento per ruoli nutrizionali può produrre contenuti formalmente validi ma poco desiderabili.

| Fonte | Ruolo proposto | Vincolo da rispettare |
| --- | --- | --- |
| CREA | Corrispondenza con alimenti italiani | Attribuzione; modalità e diritti bulk da documentare |
| Ciqual 2025 | Integrazione europea | Versione e condizioni del pacchetto specifico |
| USDA Foundation | Dati analitici e fallback pertinente | Corrispondenza esatta di forma/prodotto |
| USDA SR Legacy | Copertura ulteriore con provenienza storica | Data e tipo di fonte chiaramente conservati |
| Etichette documentate | Prodotti confezionati specifici | Qualità, composizione e diritti verificati |

CREA espone dati per alimenti e stato, con obbligo di chiara indicazione della fonte. La review non ha verificato una API pubblica bulk da usare come dipendenza obbligatoria. Ciqual 2025 dichiara 3.484 alimenti e 74 componenti e rende disponibili file dati. USDA dichiara i dati FoodData Central CC0. [CREA](https://www.alimentinutrizione.it/tabelle-nutrizionali), [Ciqual](https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table), [USDA](https://fdc.nal.usda.gov/)

**Percorso concreto.** Manifest nominale dei cibi desiderati, pilot di 40 concetti/60 forme, poi obiettivo di 200 concetti/300 forme e almeno 120 piatti culinariamente distinti. La tabella dettagliata della specifica assegna quote per gruppi senza contare stati o varianti come nuovi alimenti.

La pipeline acquisisce e normalizza; la revisione risolve nomi, equivalenze, allergeni e abitudini d'uso. Un LLM può proporre il mapping, ma non inventare valori o completare automaticamente un'approvazione umana. Ogni dato pubblicato mantiene fonte, codice originale, versione e trasformazione.

<!-- PAGE -->

## Come rendere il prodotto più competitivo

Lo stato dell'arte, per questo progetto, significa decisioni facili da esprimere, piano spiegabile, modifiche reversibili, dati pertinenti e lavoro quotidiano ridotto. Non richiede il maggior numero possibile di parametri dell'ingrediente.

| Capacità | Direzione per yourDietManager | Priorità |
| --- | --- | --- |
| Ricerca per alimento comune | Concetto unico, forme in secondo livello | Core |
| Frequenze comprensibili | Minimo, ideale, massimo e Mai | Core |
| Sicurezza spiegabile | Target parametrici ed evidenza dei dati | Core |
| Modifica rapida | Drawer sostituzione con impatto e undo | Core |
| Catalogo desiderabile | Piatti italiani curati e copertura reale | Core |
| Spesa pratica | Reparti, forme acquisto e conversioni valide | Core |
| Preferiti e pasti fissi | Favoriti e blocco dei pasti scelti | Dopo core |
| Riutilizzo della settimana | Menu salvati rivalidati nelle nuove date | Estensione |
| Dispensa e avanzi | Quantità facoltative, produzione contata una volta | Estensione |
| Stagionalità e costo | Dati locali verificati e nessuno zero fittizio | Successiva |

Come benchmark funzionale, Eat This Much dichiara piani personalizzati, dispensa e lista spesa automatica; Paprika propone aggregazione per reparto e menu riutilizzabili. Questi esempi sostengono l'utilità di un flusso pianificazione → acquisti più integrato, ma non provano superiorità dei loro algoritmi. [Eat This Much](https://www.eatthismuch.com/), [Paprika](https://www.paprikaapp.com/)

Mealime è utile come riferimento di semplicità fra piano, preferenze e spesa. Il sito consultato annuncia chiusura il 21 ottobre 2026: viene richiamato soltanto come esempio UX, non come servizio raccomandato per migrare il progetto. [Mealime](https://www.mealime.com/)

La maggiore flessibilità va concentrata sul piano: giorni, classi, finestre, famiglie, tempi e disponibilità. L'ingrediente ordinario richiede nome comune, forma, unità/quantità e dati essenziali. I metadata avanzati restano opzionali o gestiti dalla cura del catalogo.

Sconsiglio per questa revisione una riscrittura del framework, un backend obbligatorio o un generatore LLM runtime che riceva il profilo alimentare privato. La base locale e il calcolo verificabile sono vantaggi da mantenere.

<!-- PAGE -->

## Continuità dei dati e ordine degli interventi

**R27 P1 — Backup dipendente dal catalogo identico.** validateBackup rifiuta un backup con catalogVersion diversa da quella attiva; l'export conserva soprattutto ingredienti e ricette locali, non tutta la chiusura dei riferimenti pubblici storici. È una scelta del contratto corrente, ma limita il ripristino duraturo durante questa revisione.

**Modifica.** Backup V2 autosufficiente per i riferimenti di piani e history, import staged, versioni immutabili e migrazione additiva. Non usare il cambio di epoch pre-V1 per cancellare i dati. Le nuove correzioni devono rispettare anche ricette base già modificate localmente.

| Fase | Risultato concreto |
| --- | --- |
| R0 | Chiudere anomalie sicurezza, anteprime obsolete e feedback sostituzione |
| R1 | Contratti concetto/forma, evidenza sicurezza, conversioni e migrazione |
| R2 | Ricerca generica uniforme, titoli corretti, rimozione procedimento |
| R3 | Motore frequenze, famiglie e sicurezza parametriche |
| R4 | Flussi giornata e sostituzione, onboarding, accessibilità reale |
| R5 | Pilot e scala del catalogo italiano con revisione e copertura |
| R6 | Spesa, backup autosufficiente e upgrade PWA affidabile |
| R7 | Accettazione completa del nuovo candidato |
| R8 | Favoriti, menu, dispensa, avanzi e altre estensioni definite |

R1 precede le feature che dipendono dai nuovi ID. La raccolta di fonti può iniziare presto, ma nessun record entra nel catalogo distribuito prima delle verifiche. La nuova linea di sviluppo deve mantenere separati i report G/H: non è una promozione metadata-only di rc.34.

I requisiti della specifica sono collegati a 65 test core: dodici coprono direttamente sicurezza e integrità, gli altri ingredienti, finestre, flussi, catalogo, migrazione, spesa e accessibilità. Le estensioni hanno cinque test aggiuntivi.

La verifica finale richiede assenza di P0/P1 core, misure prestazionali sulla build effettiva, browser reale e dati curati. I criteri quantitativi 200/300/120 sono obiettivi proposti e verificabili; non sono una certificazione di qualità se raggiunti con duplicati.

<!-- PAGE -->

## Metodo prove e riferimenti

La review combina lettura di specifiche e sorgenti, analisi completa degli shard pubblici, test automatici esistenti, prove mirate sui servizi e ricerca di fonti primarie pubbliche. L'archivio originale resta identificato dal proprio hash; le prove modificano solo copie e repository in memoria.

| Verifica eseguita | Esito |
| --- | --- |
| npm test | 247 pass, 0 fail, circa 22 secondi |
| npm run lint | Sintassi valida per 196 file JavaScript |
| npm run build | Build PWA riuscita |
| hardening a11y | 16/16 controlli sorgente |
| hardening forms | PASS del contratto form |
| release gate | BLOCKED 7/10, tre condizioni intenzionali |
| Generazione fixture | Piano di sette giorni riuscito |
| Sostituzione servizio | Alternative, commit e undo verificati |
| Prove difetti | Risultati riproducibili nel JSON allegato |

Non è stato eseguito l'intero npm run check né il percorso browser completo in questo ambiente. Il browser disponibile rifiuta l'indirizzo locale con ERR_BLOCKED_BY_CLIENT. Restano da verificare sul prodotto avviato: causa esatta del bug segnalato, layout mobile/desktop, focus, touch, tecnologie assistive, offline multi-tab e misure prestazionali reali. Non è stato consultato il repository remoto o il suo CI live.

L'audit è riproducibile con Node da una directory di lavoro separata, passando allo script la radice estratta del progetto H e il percorso del report. Nessun dato personale di una installazione esistente viene letto. Gli esiti difettosi nell'audit sono evidenza della baseline e non il risultato atteso della nuova versione.

**Riferimenti tecnici del progetto.** I punti principali sono src/corpus/fdcAutoCuration.js, v1PhaseBRoleClassifier.js e v1PhaseBRecipeGenerator.js; src/planner/hardFilter.js, softScoring.js e recipeFeatures.js; src/services/effectivePlanService.js, planCandidateService.js, backupEngine.js e shoppingService.js; src/ui/planPages.js, catalogPages.js e uiState.js. La specifica contiene la mappa completa delle modifiche e dei documenti da aggiornare.

**Fonti nutrizionali aggiuntive.** [Pacchetto Ciqual 2025](https://zenodo.org/records/17550133), [documentazione USDA](https://fdc.nal.usda.gov/data-documentation/), [esempio CREA sul farro cotto](https://www.alimentinutrizione.it/tabelle-nutrizionali/000025). Versioni e condizioni vanno conservate per il pacchetto effettivamente utilizzato.

**Documenti operativi.** yourDietManager_CR_V2_SPECIFICA.md è il contratto da implementare; yourDietManager_CR_V2_TEST_ACCETTAZIONE.md contiene fixture, passi e risultati attesi. L'audit JSON e lo script supportano la verifica dei difetti identificati.
