# yourDietManager specifica vincolante della revisione V2

Versione della specifica 1.0 · 11 settembre 2026 · Base verificata 1.0.0-rc.34 fase H.

Questa change request definisce la revisione di funzionalità, modello alimentare, UI, UX e robustezza di yourDietManager. L'obiettivo è un pianificatore personale italiano e mediterraneo configurabile, comprensibile e affidabile. La qualità si misura con i requisiti e i test qui definiti; la dicitura «stato dell'arte» non costituisce da sola un criterio di completamento.

Il documento è destinato all'AI che implementerà le modifiche. DEVE, NON DEVE e VIETATO sono prescrizioni. PUÒ indica una scelta facoltativa. Nessuna fase può dichiararsi completa con test previsti ma non eseguiti. La review descrive il problema; questa specifica e il file `yourDietManager_CR_V2_TEST_ACCETTAZIONE.md` definiscono il comportamento da realizzare.

## 1 Mandato e perimetro

### 1.1 Risultato richiesto

L'utente deve poter configurare il proprio sistema alimentare senza conoscere ID, tassonomie tecniche, nomi USDA o dettagli del solver. Deve poter cercare un alimento generico, scegliere la forma appropriata quando serve una quantità, stabilire quante volte desidera una categoria nel tempo, escludere ingredienti per sicurezza o gusto, generare un piano comprensibile, sostituire un pasto, controllare l'impatto delle modifiche e ottenere una spesa utilizzabile.

La revisione comprende tutti i requisiti core delle sezioni 3–15, la migrazione, la pipeline dati e la documentazione. La sezione 16 contiene estensioni successive con confini definiti. Il raggiungimento dei soli obiettivi numerici di catalogo non autorizza a saltare qualità, allergeni o test UX.

### 1.2 Invarianti da preservare

- **INV-01** Architettura locale con IndexedDB, PWA, utilizzo offline dopo download e nessun account obbligatorio.
- **INV-02** Nutrienti calcolati deterministicamente da quantità, unità e revisioni alimentari tracciabili. Un LLM non inventa nutrienti, rese, conversioni o assenze di allergeni.
- **INV-03** Le versioni già referenziate da piani sono immutabili. Le correzioni creano nuove revisioni e mantengono risolvibili i riferimenti storici.
- **INV-04** `servingCount=1` e `recipeComponents.servings=1` restano vincoli del piano automatico. Il moltiplicatore persone della spesa non cambia l'apporto nutrizionale del piano personale.
- **INV-05** La tolleranza energetica giornaliera resta hard nella modalità corrente. L'energia dei pasti esterni stimati rimane distinta da quella conosciuta. Non allargare automaticamente la tolleranza per far riuscire il solver.
- **INV-06** I vincoli di sicurezza vengono applicati prima del ranking e ricontrollati alla conferma. Nessun punteggio positivo compensa un'allergia.
- **INV-07** Ogni modifica a piano o spesa espone il proprio effetto, produce una sola operazione logica e supporta undo coerente. Una modifica di configurazione non riscrive silenziosamente il piano.
- **INV-08** Gli archetipi iniziali degli editor ingredienti e ricette sono tutti selezionati; almeno uno resta necessario al salvataggio. La regola è identica per entrambi.
- **INV-09** IT ed EN restano supportati; l'utente italiano non deve compilare due lingue per salvare una propria ricetta. Fallback esplicito per i contenuti locali; il catalogo distribuito richiede etichette curate.
- **INV-10** Nessuna riscrittura di framework, introduzione di backend o sincronizzazione cloud è necessaria a questa CR. Refactoring mirati sono ammessi se accompagnati da preservazione del comportamento.

### 1.3 Relazione con il freeze H

G e H congelano il candidato precedente. Questa CR modifica contenuti e contratti e DEVE creare una nuova linea di revisione; non è la promozione metadata-only di rc.34. Il freeze precedente e i suoi report restano evidenza storica. Non rigenerarli facendo sembrare che validassero il nuovo prodotto. Nessun `ACCEPT V1`, accettazione umana o stato stable viene creato automaticamente.

## 2 Evidenze che l'implementazione deve risolvere

L'archivio esaminato ha SHA-256 `9210fba9cbbe5fc3311790b2fc6554e115a63856a97d555b8a173ee8b2306800`. Contiene 600 revisioni ingredienti, 1.800 versioni ricette, 203 termini `product_food` e 86 concetti effettivamente popolati. Le ricette usano 302 delle 600 revisioni. Tutte hanno `cuisine_international`; 1.301 titoli superano 100 caratteri; 1.153 ricette condividono gli stessi tre passi generici di cottura. Tutti i 600 ingredienti hanno alias italiani e conversioni vuoti.

La baseline `npm test` supera 247 test; lint, build, audit sorgente accessibilità e audit form superano i rispettivi controlli. Il gate stable resta correttamente bloccato su tre condizioni di rilascio intenzionali. Il browser disponibile per questa review blocca localhost: nessuna conformità visiva o prova manuale browser viene dichiarata.

Le prove aggiuntive nel pacchetto riproducono: metadati glutine mancanti accettati dal filtro; frequenze che escludono il giorno corrente e includono un giorno di troppo; conferma di anteprima dopo modifica della sicurezza; troncamento dei candidati prima del filtro sulle versioni correnti. Su un piano standard di sette giorni il servizio di sostituzione restituisce otto alternative per ciascuno dei quattro pasti del primo giorno, salva correttamente e consente undo. Il difetto percepito del pulsante non è quindi dimostrato come guasto generale del servizio.

## 3 Modello ingrediente generico e forme

### 3.1 Tre livelli e significato degli identificatori

**ING-01** Riutilizzare `product_food`, evitando una seconda tassonomia concorrente per il medesimo concetto. Il termine di livello concept è l'alimento generico cercabile. Categoria e sottocategoria organizzano gli alimenti. Le famiglie personalizzate della sezione 6 sono raccolte esplicite, non copie del concetto.

| Livello | Identificatore autorevole | Esempio | Responsabilità |
| --- | --- | --- | --- |
| Alimento generico | `productTaxonomy.conceptId`, termine `product_food` | Miglio | Nome comune, alias, appartenenza gerarchica e aggregazione delle forme |
| Forma alimentare stabile | `IngredientFamily.ingredientId` | Miglio cotto; miglio soffiato | Identità della forma/prodotto, puntatore alla revisione corrente |
| Revisione nutrizionale | `IngredientRevision.ingredientRevisionId` | Revisione 2 del miglio cotto | Stato, base di peso, nutrienti, fonte, evidenza sicurezza e qualità |

Il nome `IngredientFamily` esistente indica un'identità versionata e NON equivale a una famiglia alimentare scelta dall'utente. L'AI non deve unirne gli ID solo perché due record condividono il nome Miglio. Quando servono nuovi campi nel codice, usare il nome esplicito `foodGroup` per una raccolta personalizzata e `ingredientConcept` per il concetto, senza rinominare arbitrariamente i record storici.

**ING-02** La revisione corrente di ogni forma DEVE risolvere a un solo percorso categoria → sottocategoria → concetto valido. I concetti generici «Altro» sono ammessi soltanto nell'area di revisione dati; non valgono come copertura del catalogo italiano curato.

**ING-03** Per le nuove revisioni aggiungere un piccolo blocco di presentazione:

```json
{
  "display": {
    "it": {"variantLabel": "Cotto e scolato"},
    "en": {"variantLabel": "Cooked and drained"}
  },
  "basis": {"amount": 100, "unit": "g", "state": "cooked"}
}
```

`variantLabel` è lungo 1–60 caratteri e specifica solo le differenze utili. Il nome generico deriva dal concetto; non duplicarlo obbligatoriamente nel blocco `display`. Il nome originale della fonte resta in provenance. Un record con `as_sold` non è automaticamente pronto al consumo: «come venduto» descrive la base analitica, non un'istruzione d'uso.

### 3.2 Forme che non devono essere confuse

**ING-04** Cotto, crudo, secco e sgocciolato mantengono nutrienti e quantità separati. Intero/scremato, integrale/raffinato, zuccherato/non zuccherato, sott'olio/al naturale e con/senza sale sono varianti quando la distinzione modifica identità o dati utili. Non aggiungere decine di campi obbligatori per descriverle: la differenza può vivere nell'etichetta controllata e nella fonte.

**ING-05** Le forme di pasta di semola e di pasta di riso possono essere trovate sotto il concetto Pasta, ma la loro appartenenza generica non autorizza un'identica classificazione allergeni. Una forma di riso verificata senza glutine conserva la propria evidenza. La sicurezza della singola forma prevale sulle equivalenze usate per ricerca o gusto.

**ING-06** Due record sorgente che descrivono realmente la stessa forma possono alimentare la sua provenance o una nuova revisione. Non mediare i nutrienti automaticamente e non fondere per somiglianza lessicale. Ogni fusione richiede mapping esplicito, motivazione, fonte scelta e conservazione degli ID in una tabella di reindirizzamento versionata. Un mapping non risolto resta in quarantena.

### 3.3 Un selettore condiviso in ogni campo

**ING-07** Implementare un unico controllo con due modalità:

1. `concept`: cerca e seleziona categoria, famiglia o alimento generico; usato per filtri, preferenze, allergie e regole pasto. La selezione include tutte le forme pertinenti.
2. `variant`: cerca prima il concetto, poi sceglie una forma per una quantità; usato nelle righe ricetta, dispensa e conversioni della spesa. Il salvataggio richiede un `ingredientId` e una revisione precisa.

**ING-08** La ricerca deve consultare nomi e alias IT/EN del concetto, nomi della forma, categoria, sottocategoria e descrizione originale della fonte. Normalizzare maiuscole, accenti, spazi e trattini. Ordinare prima corrispondenza esatta sul nome generico, poi alias, prefisso e altri campi. A parità usare label localizzata e ID stabile. La ricerca approssimata può suggerire, ma non seleziona mai automaticamente un'entità diversa.

**ING-09** La ricerca `miglio` mostra una sola voce principale con «2 forme disponibili» nella baseline, apribile nelle due forme esistenti. Non inventa miglio crudo assente. La ricerca `cotto` può trovare la forma e mostrare il suo concetto come contesto. `zucchina`, `zucchine` e `zucchini` devono risolvere il medesimo concetto curato. Un testo digitato e non selezionato non è un ID valido.

**ING-10** Le superfici obbligatorie sono: elenco ingredienti, elenco ricette, riga ingrediente nell'editor, dettaglio ricetta, preferenze, profilo sicurezza, regole classi pasto, sostituzione, spesa e relative ricerche. Nessuna può mantenere un proprio elenco di stringhe scollegato.

**ING-11** La ricerca ricette deve indicizzare anche il concetto degli ingredienti. Dopo aver abbreviato il titolo, cercare `miglio` deve continuare a trovare la ricetta. Filtri attivi e ordinamento devono sopravvivere a dettaglio, ritorno e ricaricamento tramite URL o stato persistito della vista.

### 3.4 Presentazione e quantità

**ING-12** Riga ricetta: «Miglio · cotto e scolato · 150 g». Il nome è un link; lo stato resta sempre visibile accanto alla quantità. Per ingredienti secchi mostrare «peso a secco»; per crudi «peso a crudo»; per sgocciolati «peso sgocciolato». Non eliminare lo stato dalla riga per risolvere il problema del titolo.

**ING-13** La scheda ingrediente mostra prima nome comune, forme, nutrienti essenziali e appartenenze. Fonte originale, ID, digest, qualità e storico stanno in «Dati e fonti». Restano consultabili e copiabili, ma non occupano il livello principale.

## 4 Conversioni e coerenza nutrizionale

**NUT-01** Conservare come autorità `nutritionCore` e le revisioni fissate dalle righe. Gli import devono distinguere quantità riferita a 100 g, 100 ml, parte edibile e alimento acquistato. Non equiparare g e ml senza densità valida; non equiparare crudo e cotto senza resa documentata.

**NUT-02** Introdurre un registro di conversioni opzionali, versionate e direzionali, separato dall'editor semplice. Campi necessari: `conversionId`, `fromIngredientId`, `toIngredientId`, `fromUnit`, `toUnit`, `factor`, `purpose`, `sourceRef`, `reviewStatus`, `version`. Definizione: `quantitàDestinazione = quantitàOrigine × factor`. Una conversione inversa si usa solo se dichiarata valida per quello scopo.

`purpose` vale `unit` o `shopping_yield`. Una resa per acquisto converte la quantità della spesa; non ricalcola automaticamente i nutrienti della ricetta. Se cambia la forma pesata nella ricetta, cambiano la revisione nutrizionale referenziata e il relativo calcolo, con anteprima prima del salvataggio.

**NUT-03** Una conversione mancante produce una richiesta di scelta o una riga separata, mai una quantità stimata silenziosamente. Esempi numerici delle fixture sono sintetici e non diventano rese universali pubblicate.

**NUT-04** L'import da fonti diverse deve conservare definizione del nutriente, unità e metodo. In particolare non trattare automaticamente carboidrati disponibili CREA e carboidrati totali/by difference come misure identiche. La trasformazione verso `carbsG` deve essere documentata per adapter e coperta da fixture; valori non confrontabili restano non utilizzabili nel calcolo corrente finché non risolti.

**NUT-05** Mancante, traccia, inferiore al limite di quantificazione e zero sono stati diversi. Non tradurre tutti in 0. L'app corrente richiede energia, proteine, carboidrati, grassi e fibra: per una nuova versione eleggibile tali valori devono essere risolti e validi. Nutrienti opzionali futuri possono avere stato `unknown`; non assegnare una precisione falsa.

**NUT-06** `finalWeightG` non può essere la semplice somma degli ingredienti quando avviene una cottura con assorbimento o perdita d'acqua. Usare peso misurato/documentato o `null`; distinguere «peso ingredienti» da «peso finale». Tempi attivi e totali restano disponibili, con provenienza del dato e senza procedimento testuale.

## 5 Preferenze di frequenza

### 5.1 Linguaggio del form

**PREF-01** Il form principale usa la frase: «In ogni periodo di [7] giorni voglio [Legumi] almeno [2], idealmente [3] e al massimo [4] volte». Sotto mostra: «Una volta = un pasto in cui compare l'alimento, anche in più componenti». Le tre quantità hanno etichette permanenti e messaggi di errore specifici.

**PREF-02** Tre modalità mutuamente esclusive: `Nessuna regola`, `Frequenza`, `Mai nel piano`. Un interruttore separato «Attiva» abilita/disabilita una regola salvata. Disattivare non elimina i valori.

**PREF-03** In modalità Frequenza: finestra intera 1–90 giorni, minimo e massimo interi non negativi oppure vuoti, obiettivo ideale numero non negativo con passo 0,5 oppure vuoto. Vuoto significa «non impostato», non zero. Deve esistere almeno uno fra minimo, ideale e massimo. Validare `min ≤ target ≤ max` per ogni coppia presente. Non arrotondare né correggere input illegali in silenzio.

**PREF-04** `Mai nel piano` equivale a esclusione hard per le nuove assegnazioni automatiche e manuali. Il riepilogo è «Escluso dal piano». I campi di frequenza non sono attivi e non influenzano il solver. Per riammettere il target occorre modificare esplicitamente la preferenza; nessun pulsante di sostituzione la ignora di nascosto. La differenza con un'allergia è nella motivazione e nel percorso di modifica della regola, non nel ranking.

**PREF-05** L'ideale è un obiettivo soft; minimo e massimo sono hard sulle finestre complete applicabili. Esempio: minimo 2, ideale 3, massimo 4 consente 2, 3 o 4; privilegia 3. Un ideale 2,5 non crea mezzo pasto: il conteggio resta intero e lo scostamento dall'ideale viene mostrato. Non presentare l'ideale come promessa di media esatta sul piano.

### 5.2 Contratto dati

**PREF-06** Il nuovo `FoodPreferences` ha `schemaVersion=2`. Una regola usa il seguente contratto; gli ID d'esempio sono illustrativi e devono esistere nel registry prima dell'uso.

```json
{
  "id": "pref-legumi",
  "enabled": true,
  "mode": "frequency",
  "target": {"type": "productFood", "id": "product_category_legumes"},
  "scope": {"mealClassIds": []},
  "countUnit": "meal",
  "countBasis": "planned",
  "window": {"kind": "rolling", "days": 7},
  "minOccurrences": 2,
  "targetOccurrences": 3,
  "maxOccurrences": 4,
  "priority": "normal",
  "effectiveFrom": "2026-09-11"
}
```

Il target può essere `productFood`, `foodGroup`, `ingredient`, `recipeTag`, `cuisine` o `flavor`. `ingredient` indica una forma specifica ed è scelta avanzata esplicita. `scope.mealClassIds=[]` significa tutte le classi pasto; in UI mostra «Tutti i pasti», non un campo vuoto ambiguo. ID inesistenti, duplicati o archiviati non sono accettati in una nuova regola.

`priority` vale `low|normal|high` e modifica solo il peso dell'ideale, con mapping documentato 1/2/4. Il form semplice usa normal. Nessun peso numerico del solver è visibile nel form ordinario. `countBasis` è `planned` in questa CR: la contabilizzazione delle preferenze riguarda il piano programmato, non inferenze sul consumo reale.

### 5.3 Conteggio autorevole

**PREF-07** Implementare una sola funzione di dominio per conteggio e verifica, richiamata da generazione, estensione, sostituzione, riequilibrio, riepilogo e test. Non duplicare la logica fra UI e solver.

**PREF-08** Per data finale D e finestra W, l'intervallo è `[D-(W-1), D]`, inclusi gli estremi, usando la data civile di consumo dello slot nella timezone del piano. W=7 include sette date, non otto. Includere i pasti già assegnati nello stesso giorno durante la ricerca.

**PREF-09** `countUnit=meal`: un target contribuisce 0 o 1 per `mealOccurrenceId`, facendo OR sulle righe e su tutti i componenti inclusi. Due forme di miglio nello stesso pasto contano una volta. Miglio a pranzo e a cena conta due. Più ingredienti figli della famiglia Legumi nello stesso pasto contano una sola volta per la regola Legumi.

**PREF-10** `countUnit=day`, disponibile in «Avanzate», conta 0 o 1 per data civile. Non applicare entrambe le unità alla medesima regola. Le ricette opzionali o le righe opzionali non incluse non contribuiscono; per i dati V1 ogni riga materializzata è considerata inclusa, coerentemente con il calcolo esistente, finché manca un'esplicita selezione di inclusione.

**PREF-11** Uno slot esterno senza composizione è sconosciuto, non una presenza e non uno zero verificato. Il conteggio mostra valore conosciuto e numero di pasti esterni non classificati. Nessuna garanzia sui limiti dell'intera alimentazione viene derivata da soli slot ignoti. La verifica automatica dei limiti si riferisce ai pasti pianificati dal motore; il riepilogo deve dirlo.

**PREF-12** Caricare lo storico necessario per `max(windowDays)-1`, considerando catena attiva, date civili e carry-over fino a due giorni. Eliminare il limite storico fisso di 14 giorni. Per un edit nella data D controllare anche tutte le finestre successive già materializzate che contengono D, fino a D+W-1. Non limitarsi ai giorni antecedenti.

**PREF-13** La regola si applica da `effectiveFrom`. Le finestre con inizio precedente non richiedono retroattivamente il minimo. Prima della prima finestra completa mostrare `pending` e la prima data valutabile; il massimo viene comunque verificato sul prefisso noto della regola. Nessun giorno non osservato o non pianificato può diventare uno zero fittizio. Sui prefissi l'obiettivo può essere riproporzionato come soft `target × giorniCoperti/W`, mai il limite hard finale.

**PREF-14** Separare lunghezza del ciclo (rimane 1–31) e orizzonte del piano (esteso a 1–90). Se una regola con minimo ha W maggiore dell'orizzonte richiesto, proporre un orizzonte almeno W e spiegare perché. L'utente può mantenere un orizzonte più corto, ma la regola deve risultare «Minimo ancora da verificare», non soddisfatta. Non allungare il piano persistito senza anteprima e conferma.

### 5.4 Vincoli sovrapposti e spiegazione

**PREF-15** Regole globali, di famiglia e di pasto si applicano tutte quando pertinenti. Non usare «vince la più specifica» per cancellare un divieto. Rilevare duplicati con stesso target/scope/unità/finestra; proporre fusione dei valori solo con anteprima. Regole diverse possono convivere.

**PREF-16** Rilevare contraddizioni dimostrabili prima della generazione: minimo > massimo, Mai più minimo sullo stesso target, famiglia esclusa con minimo obbligatorio su un figlio, o capacità massima inferiore al minimo. Mostrare le regole coinvolte e le modifiche possibili. Non rilassare automaticamente allergie, min/max o Mai.

**PREF-17** Il solver deve gestire minimi e massimi a livello di finestra del piano, includendo i limiti inferiori e superiori dei conteggi ancora raggiungibili. Sommare penalità per ricetta non basta. L'output finale deve essere verificato dalla funzione indipendente di PREF-07.

**PREF-18** Stati del risultato: `success`, `infeasible_proven`, `search_exhausted`, `cancelled`, `invalid_input`. Un'esplorazione limitata senza risultato non dimostra matematicamente l'impossibilità. Mostrare «Non ho trovato un piano entro il limite di ricerca» quando appropriato, con cause e suggerimenti limitati ai vincoli coinvolti.

**PREF-19** Ogni regola nel riepilogo mostra target, conteggio, intervallo, ideale, stato `satisfied|violated|pending|not_evaluable`, finestre interessate ed elenco dei pasti che contribuiscono. Non mostrare score grezzi al posto di una spiegazione.

### 5.5 Migrazione delle preferenze precedenti

**PREF-20** Non trasformare automaticamente vecchi massimi soft in hard. Le vecchie regole restano eseguibili in un adapter `legacy_soft`, visibile come «Preferenza precedente da convertire». Il percorso guidato propone il nuovo form, mostra differenza di comportamento e richiede salvataggio esplicito.

`more_often/normal/less_often/rarely` non hanno equivalenza numerica dimostrabile: mantenere il ranking legacy finché l'utente sceglie frequenze. `autoExclude=true` conserva l'esclusione automatica precedente in compatibilità; la conversione a «Mai nel piano» spiega la nuova estensione alle assegnazioni manuali. Nessuna migrazione inventa valori minimo/medio/massimo attribuendoli all'utente.

## 6 Allergie intolleranze e famiglie parametriche

### 6.1 Target configurabili

**SAFE-01** Riutilizzare il selettore comune per allergene canonico, alimento generico, famiglia personalizzata o forma specifica. Le famiglie possono contenere più concetti/forme; l'utente crea una famiglia scegliendo voci esistenti, mai scrivendo CSV o nomi da risolvere più tardi.

**SAFE-02** Introdurre `FoodGroup` con `id`, `name`, `members`, `version`, `origin`, `status` e date. `members` è un insieme di `{type:productFood|ingredient,id}`. Una famiglia non può includere un'altra famiglia in questa CR: evita cicli e ambiguità senza togliere l'aggregazione per categorie della tassonomia.

**SAFE-03** Nuove regole `SafetyProfile.schemaVersion=2`: `id`, `kind=allergy|intolerance|coeliac`, `target`, `enabled`, `notes`, `effectiveFrom`. Aggiungere `coeliac` per non presentare la celiachia come gusto o allergia. Le regole legacy su `gluten_cereals` restano operative senza dedurre diagnosi o cambiare automaticamente `kind`.

**SAFE-04** Una regola sulla categoria include i suoi discendenti. Una regola sul concetto include tutte le forme. Una regola sulla forma è avanzata e mostra «Solo questa forma». Le appartenenze modificate hanno versioni: l'aggiornamento indica quali regole e piani sono interessati.

### 6.2 Evidenza e comportamento in caso di incertezza

**SAFE-05** Separare la composizione nota dal rischio di tracce. Per una revisione alimentare introdurre `safetyEvidence`: `assessmentStatus=reviewed|unreviewed`, `containsAllergenIds`, `mayContainAllergenIds`, `compositionCompleteness=complete|partial|unknown`, `sourceRefs`, `reviewedBy`, `reviewedAt`, `policyVersion`. Un array vuoto di allergeni, senza valutazione, non significa assenza verificata.

**SAFE-06** Quando esiste una regola di sicurezza attiva e la compatibilità pertinente non è determinabile, il candidato automatico è escluso con motivo «Compatibilità non verificata». È vietato far passare una ricetta per mancanza di mapping o di revisione. Non richiedere che tutte le fonti conoscano ogni traccia industriale: per gli alimenti generici distinguere compatibilità per composizione da verifica della confezione.

**SAFE-07** Per le tracce note applicare la policy conservativa predefinita di esclusione in presenza della corrispondente regola attiva. La confezione concreta può aggiungere evidenza, non toglierla senza una fonte. La scheda non deve usare «sicuro» o «certificato senza» sulla sola assenza di tag; usare «Compatibile in base ai dati disponibili» e, quando serve, «Verifica l'etichetta del prodotto».

**SAFE-08** Non dedurre automaticamente intolleranza al lattosio da allergia al latte o viceversa. Non proporre soglie mediche numeriche per tolleranza in questa CR. Le esclusioni parametriche per ingredienti e famiglie rispondono alla richiesta senza diventare un motore clinico.

**SAFE-09** I 14 ID canonici esistenti restano compatibili, con esempi e traduzioni corrette. La lista legale e l'insieme botanico «frutta a guscio» non sono sinonimi assoluti. Non aggiungere o togliere etichette esclusivamente cercando sottostringhe come `butter`, `egg` o `nut`.

### 6.3 Propagazione e protezione del piano

**SAFE-10** La ricetta deriva l'evidenza dagli ingredienti effettivamente inclusi. Non può cancellare manualmente un allergene derivato. Un alimento composto generico con composizione incompleta non diventa compatibile per default.

**SAFE-11** Rivalidare al salvataggio sicurezza e in ogni commit: generazione iniziale, estensione automatica o richiesta, sostituzione, modifica manuale, riequilibrio, import, copia di giornata e ripetizione da storico. La validazione UI da sola non basta.

**SAFE-12** Un cambio di allergia o una correzione del catalogo deve invalidare le anteprime e segnalare subito i pasti futuri incompatibili. Il piano non viene riscritto: lo stato aggiuntivo segnala incompatibilità e offre «Trova alternative» con selezione e undo. Il passato resta consultabile e viene annotato senza inventare cosa l'utente abbia consumato.

**SAFE-13** Un undo/redo può ripristinare uno snapshot storico, ma NON deve visualizzarlo come compatibile se la sicurezza attuale lo vieta. Applicare overlay di sicurezza corrente, impedire di riutilizzare quel pasto per nuove assegnazioni e mostrare lo stato da correggere. Non modificare retroattivamente hash e nutrienti delle versioni storiche.

**SAFE-14** Non permettere override monouso di un'allergia dentro la scelta ricetta. Per modificare la propria regola l'utente usa l'editor sicurezza, vede i cambiamenti e salva esplicitamente. Il software non può decidere al posto dell'utente una nuova condizione clinica.

## 7 Sostituzione della giornata

### 7.1 Correzione del flusso

**SWAP-01** Al click «Sostituisci» aprire immediatamente un pannello contestuale associato al pasto: drawer su desktop e pannello a tutto schermo su mobile. Il pannello mostra nome del pasto, ricetta attuale e caricamento; non aggiungere la sola preview al fondo della giornata senza navigazione.

**SWAP-02** Stati obbligatori: `idle → loading → results|empty|error → confirming → success|error`; `cancelled` annulla la richiesta pendente. Il feedback iniziale deve comparire entro 100 ms nella macchina di test di riferimento. Un ID di richiesta impedisce a risposte vecchie di sovrascrivere il pasto selezionato successivamente.

**SWAP-03** Focus sul titolo del pannello all'apertura; ordine tastiera coerente; Escape e «Annulla» chiudono senza mutare dati; focus restituito al pulsante originario. Il comportamento modale deve impedire interazioni accidentali con lo sfondo. Non perdere note di aderenza non salvate: conservarle per slot in stato bozza o chiedere scelta prima di scartarle.

**SWAP-04** Il pannello mostra inizialmente fino a otto alternative e permette ricerca e filtri per alimento generico, nome, tempo e caratteristiche rilevanti. La lista usa candidati ammissibili, con paginazione se necessario. Non limitare la selezione a una lista non esplorabile.

**SWAP-05** Ogni alternativa mostra titolo breve, quantità/numero componenti, energia e variazione sul giorno, tempo totale, motivi di compatibilità e impatto sulle frequenze. I dettagli nutrizionali completi stanno in un'espansione. Nessun numero di score grezzo è l'informazione principale.

### 7.2 Un componente o l'intero pasto

**SWAP-06** Se il pasto contiene un solo componente, il default è sostituire quel componente. Se ne contiene più di uno, mostrare le opzioni «Intero pasto» e ciascun componente, con default Intero pasto. I componenti non selezionati vengono conservati integralmente.

**SWAP-07** La sostituzione dell'intero pasto può proporre un insieme compatibile di componenti, entro il limite dichiarato della classe pasto. Non sostituire sempre un pasto composto con una singola ricetta se questo elimina tutte le alternative per energia. Restano porzioni fisse e archetipi coerenti; non creare tre piatti completi senza un'esplicita composizione pasto approvata.

**SWAP-08** Se non esistono alternative, mostrare «Nessuna alternativa con questi vincoli» e le cause raccolte: sicurezza, frequenze, energia, tempo o catalogo. Offrire solo azioni pertinenti: cambiare filtri, rivedere una preferenza, cercare un pasto composto, aggiornare il catalogo. Non offrire riduzione delle protezioni allergiche come semplice suggerimento automatico.

**SWAP-09** Conferma unica con rivalidazione di snapshot, sicurezza, energia e finestre di frequenza. Nessuna scrittura prima della conferma. Feedback persistente «Pasto sostituito» e «Annulla modifica». La spesa diventa obsoleta solo quando cambiano i suoi input materiali.

## 8 Titoli e rimozione del procedimento

**REC-01** Ogni ricetta distribuita deve avere titolo culinario italiano 5–70 caratteri, obiettivo editoriale ≤55. Usare preparazione o piatto riconoscibile e al massimo tre elementi distintivi. Esempi di formato: «Miglio con zucchine e ceci», «Uova con noodles e formaggio». Sono esempi di etichette: non autorizzano l'associazione alla ricetta concreta senza verificarne contenuto.

**REC-02** VIETATO generare il titolo concatenando i nomi completi delle revisioni. VIETATO copiare parentesi USDA, termini come `unenriched`, `whole frozen`, note di sale, fasce kcal, ID o spiegazioni del planner nel titolo. Non basta nascondere l'eccesso con ellissi CSS: correggere il contenuto autorevole.

**REC-03** Non chiamare «Parmigiano Reggiano» un generico `parmesan` americano; non trasformare mozzarella nonfat in mozzarella standard, limone in arancia o zucchini in una zucca generica. Il titolo deve essere breve ma vero. La marca o denominazione protetta richiede il corrispondente alimento documentato.

**REC-04** Rimuovere il procedimento dalle schermate di dettaglio, editor, validazioni obbligatorie, ricerca, pipeline di generazione, export ordinari di ricetta e specifiche operative. Non sostituirlo con un'altra sezione equivalente denominata «Passaggi», «Preparazione guidata» o «Consigli di cottura».

**REC-05** Restano: ingredienti e quantità, stato di pesatura, nutrienti, tempi attivi/totali attendibili, attrezzatura o conservazione quando realmente utili, informazioni di compatibilità e fonte. Un'indicazione strutturata `requiresCooking` è metadata operativo, non un procedimento testuale. Non inventare tempi o conservabilità per riempire campi.

**REC-06** Nuove `RecipeVersion` di schema 2 non contengono `i18n.*.instructions`. La lettura e il backup delle versioni schema 1 restano lossless. I campi storici sopravvivono nel backup/versione immutabile, ma non vengono mostrati nel normale dettaglio né copiati in nuove versioni. Il duplicatore deve gestire l'assenza di istruzioni senza spread di `undefined`.

**REC-07** Rimuovere dipendenze da istruzioni in checksum di nuovi formati e searchTokens, mantenendo il validatore storico del formato precedente. Aggiornare insieme schemi autorevoli e copie pubbliche. Il test di parità degli schemi rimane obbligatorio.

## 9 Catalogo italiano e mediterraneo

### 9.1 Misurare la copertura corretta

**CAT-01** Definire un manifest curato con almeno 200 concetti alimentari italiani/mediterranei distinti e almeno 300 forme complessive, inclusi quelli già esistenti che superano la revisione. Questi sono target proposti di progetto, non numeri presenti nella baseline. Ogni concetto conteggiato deve avere almeno una forma nutrizionalmente utilizzabile; nessuna variante di stato conta come nuovo concetto.

**CAT-02** Il manifest deve elencare tutti i concetti nominalmente, gruppo, sinonimi locali, forme prioritarie, priorità e fonte da risolvere. Nessuna riga «altri 50 ingredienti» vale per la copertura. L'obiettivo minimo per gruppi è:

| Gruppo | Concetti minimi | Esempi da risolvere |
| --- | ---: | --- |
| Cereali pane pasta e derivati | 25 | Pasta di semola, integrale, riso, farro, orzo, avena, polenta, pane, cous cous |
| Legumi e derivati | 15 | Ceci, lenticchie, cannellini, borlotti, fagioli dall'occhio, fave, piselli, lupini |
| Ortaggi tuberi e funghi | 45 | Zucchine, melanzane, finocchi, carciofi, bietole, cicoria, radicchio, broccoli, zucca |
| Frutta | 35 | Frutta fresca italiana e mediterranea, agrumi distinti, frutta essiccata distinta |
| Latte latticini formaggi e uova | 20 | Latte, yogurt bianco, ricotta, mozzarella, grana, pecorino, uova |
| Pesce e prodotti ittici | 20 | Alici, sardine, sgombro, merluzzo, orata, branzino, tonno, cozze, vongole |
| Carni e alternative proteiche | 15 | Pollo, tacchino, coniglio, manzo, vitello, suino e alternative pertinenti |
| Frutta a guscio semi e grassi | 15 | Mandorle, noci, nocciole, pistacchi, semi, olio extravergine, olive |
| Erbe spezie e condimenti | 10 | Basilico, prezzemolo, rosmarino, salvia, origano, capperi, aceti |
| Totale minimo | 200 | Nessun doppio conteggio tra gruppi |

**CAT-03** Partire da un pilot di 40 concetti e 60 forme, coprendo tutti i gruppi e casi difficili, prima della scala 200/300. Il pilot deve contenere sia crudo/cotto sia secco/sgocciolato, almeno un alimento composto e sinonimi italiani ambigui. L'estensione non è promossa se i criteri editoriali e di sicurezza falliscono.

**CAT-04** Curare almeno 120 piatti effettivamente distinti utilizzabili in abitudini italiane/mediterranee: minimo 15 colazioni, 15 spuntini/mini pasti, 35 primi/piatti unici, 30 secondi/composizioni e 25 contorni/insalate o altre composizioni coerenti. Un piatto con grammi diversi o stato nutrizionale diverso non conta come un nuovo piatto culinario.

L'etichetta pasto deve essere indipendente da queste classi editoriali: una ricetta può essere valida a pranzo e cena. Occorre coprire anche praticità e profili di esclusione; non pubblicare varietà culinaria che rende il planner privo di opzioni. Se 120 piatti non coprono energia e combinazioni richieste, aggiungere contenuti curati e combinazioni ammissibili, mai allargare vincoli in silenzio.

### 9.2 Fonte nutrizionale e selezione culinaria

**CAT-05** Usare adapter separati per CREA, Ciqual, USDA e, solo per prodotti confezionati pertinenti, etichette documentate o altra fonte abilitata. L'ordine è una preferenza di ricerca, non una sostituzione cieca: prima cercare corrispondenza alimentare italiana esatta in CREA, poi europea pertinente in Ciqual, poi equivalente verificato USDA. Se USDA è la corrispondenza migliore, mantenerlo con motivazione.

**CAT-06** Archiviare nel manifest della fonte: ente, versione dataset, URL record, codice originale, data acquisizione, licenza/condizioni, hash dei byte, regola di trasformazione, stato revisione. Conservare il descrittore originale integro. L'ID pubblico di nuova forma non deve dipendere dal nome tradotto o da una ricerca live.

**CAT-07** La pagina CREA richiede indicazione chiara della fonte; la review non ha verificato una API pubblica documentata o una licenza bulk che copra ogni modalità di distribuzione. L'adapter deve funzionare anche con un estratto autorizzato caricato manualmente. Per il bundle distribuito documentare esattamente diritti, attribuzione e modalità d'acquisizione prima della pubblicazione. Non spacciare CREA per CC0.

**CAT-08** Ciqual 2025 offre 3.484 alimenti e 74 componenti, con file scaricabili pubblicati da ANSES. Conservare versione e condizioni di quel preciso pacchetto; non applicare automaticamente a 2025 le condizioni di un file 2020. USDA FoodData Central dichiara CC0 e resta un fallback utile, con distinzione fra Foundation, SR Legacy e Branded.

**CAT-09** Non scegliere i record soltanto per categoria sorgente o hash casuale. Una pipeline deterministica è adeguata a estrazione, normalizzazione, validazione e calcolo; non dimostra adeguatezza culinaria. Un LLM può proporre traduzioni, mapping, nomi e abbinamenti, che restano proposte finché verificati. Nessuna assenza di allergene o cifra nutrizionale è approvata per mera plausibilità del testo.

### 9.3 Pipeline obbligatoria

**CAT-10** Eseguire in quest'ordine, con output versionati:

1. Manifest fabbisogni italiano con voci nominali e copertura.
2. Acquisizione della fonte e registrazione delle condizioni d'uso.
3. Import staging con descrittori originali, unità e qualità.
4. Proposta mapping concetto/forma e confronto con record esistenti.
5. Revisione di ambiguità, allergeni, sinonimi e compatibilità nutrizionale.
6. Approvazione del record corrente e creazione di revisione immutabile.
7. Proposta ricette da schemi culinari curati, con abbinamenti e ruoli consentiti.
8. Calcolo nutrizionale e controlli di praticità, stato di pesatura e allergeni.
9. Revisione culinaria distinta dalla validazione tecnica.
10. Verifica copertura planner, pubblicazione atomica e report delle esclusioni.

**CAT-11** Distinguere `automatedChecks`, `nutritionReview`, `safetyReview`, `culinaryReview` ed eventuale `humanAcceptance`. Uno script non può compilare «revisione umana approvata». `quality.status=validated` da solo non dimostra idoneità culinaria o sicurezza.

**CAT-12** Correggere subito il template `mini-fish-grain`: un record di pesce crudo non è ammissibile in un piatto classificato senza cottura senza una qualificazione specifica documentata. In questa CR il catalogo automatico deve escludere preparazioni di pesce crudo non curate per tale uso; non basta rimuovere il procedimento per sanare il problema.

**CAT-13** Le correzioni strutturali devono usare regole positive verificate e casi di negazione: pasta generica/di riso, burro/burro di arachidi, noci del Brasile, uova/noodles all'uovo, latte/alternative vegetali. Una categoria culinaria, una categoria sorgente e un allergene sono tre proprietà distinte.

**CAT-14** Il catalogo attuale di 1.800 combinazioni non deve essere rinominato automaticamente «ricette italiane». I record respinti sono esclusi dalla nuova generazione, ma restano risolvibili nei piani storici. Le correzioni non cancellano il catalogo locale personalizzato dell'utente.

## 10 UI e architettura dell'esperienza

### 10.1 Navigazione e impostazioni

**UX-01** Mantenere quattro destinazioni primarie: Oggi, Calendario, Ricette, Spesa. «Configura» contiene Piano e orari, Obiettivi nutrizionali, Preferenze, Allergie e intolleranze, Catalogo, Aspetto e lingua, Dati e backup.

**UX-02** Spostare «Validazione planner», «Accettazione manuale», digest, seed e controlli release in Strumenti avanzati/Diagnostica. Nessun parametro algoritmico o stato di sviluppo deve essere necessario a un flusso alimentare ordinario.

**UX-03** Ogni editor usa livelli Base e Avanzate con stato conservato. Base raccoglie solo decisioni dell'utente; campi derivati e identificatori sono generati. Preset espliciti e duplicazione di classi riducono la compilazione. Non nascondere campi obbligatori o errori dentro disclosure chiuse.

### 10.2 Primo utilizzo

**UX-04** Sostituire l'onboarding sospeso con un percorso breve, riprendibile: lingua/fuso; sicurezza; struttura giornata; preferenze; obiettivi o uso dei valori dimostrativi chiaramente etichettati; anteprima. Il catalogo resta esplorabile senza completare il percorso.

**UX-05** «Nessuna allergia dichiarata» e «Profilo non ancora verificato» sono stati diversi. Non inventare assenza di condizioni dell'utente. Il primo piano deve mostrare cosa è stato configurato e cosa usa ancora valori predefiniti, senza diagnostica medica o calcolo prescrittivo implicito.

### 10.3 Oggi calendario e ricette

**UX-06** Oggi presenta data/classe, prossimo pasto, lista compatta, azioni contestuali e riepilogo. Il titolo ricetta appare una volta per componente; evitare la ripetizione dell'intero titolo nella testata e nel link sottostante.

**UX-07** Aderenza rapida con azioni comprensibili, note facoltative espandibili, salvataggio annunciato e bozza per slot. Una nota non salvata deve sopravvivere all'apertura di Sostituisci o alla rigenerazione di un'altra card.

**UX-08** Calendario desktop mensile e mobile con agenda leggibile; classe giorno con nome/abbreviazione oltre al colore. Aprire una data porta alla giornata in un passaggio. Conservare mese, filtri, scroll e punto di ritorno dal dettaglio.

**UX-09** Ricette: ricerca primaria unica, filtri frequenti visibili e filtri avanzati richiudibili; conteggio risultati, rimozione singola e «Azzera filtri». Ordinamento per pertinenza durante ricerca; titolo/tempo/nutrienti disponibili. Default «Compatibili con il mio profilo» dopo la configurazione; l'utente può mostrare incompatibili per consultazione, sempre con badge e assegnazione bloccata.

**UX-10** Le card mostrano titolo, pasti ammessi, tempo totale e sintesi nutrizionale. Provenance e storico stanno nel dettaglio. Nessuna fotografia generata deve suggerire una preparazione diversa dagli ingredienti reali; foto e immagini non sono necessarie a questa CR.

### 10.4 Accessibilità e comportamento

**UX-11** Target WCAG 2.2 AA. Ogni input deve avere nome accessibile persistente, help/error associati e stato valido/non valido. Placeholder da solo non è label. Supportare tastiera completa, focus visibile, contrasto, zoom e movimento ridotto.

**UX-12** Obiettivo interno touch 44×44 CSS px per azioni principali; verificare tutte le eccezioni secondo WCAG. Niente scroll orizzontale della pagina a 320 CSS px, a 200% di zoom e con nomi italiani lunghi; le tabelle dati possono avere scorrimento locale dichiarato.

**UX-13** Errori nelle operazioni ordinarie sono inline e orientati all'azione, con riepilogo/focus quando necessario. Non esporre stack, nomi schema o ID al posto della spiegazione. Dettaglio tecnico copiabile in Diagnostica. Eliminare `alert(error.message)` come percorso principale del planner.

**UX-14** Ricerca asincrona e import non possono sovrascrivere un editor dirty. Usare token di richiesta, stato di caricamento locale e preservazione del draft. Ogni async action ha gestione dell'errore e riabilita correttamente il comando.

## 11 Spesa utilizzabile

**SHOP-01** Raggruppare prima per reparto, poi per alimento generico. Sotto mostrare le forme/quantità non aggregabili. Personalizzare ordine dei reparti senza cambiare tassonomia nutrizionale.

**SHOP-02** Aggregare quantità soltanto con stessa forma e unità, oppure con conversione per acquisto verificata scelta esplicitamente. «100 g miglio secco + 150 g miglio cotto» non diventa «250 g miglio». Senza resa, mostrare due righe sotto Miglio e spiegare la differenza.

**SHOP-03** Consentire una forma di acquisto preferita per alimento, facoltativa e validata. La proposta di conversione mostra quantità di partenza, fattore, fonte e quantità risultante. Cambiare forma d'acquisto non modifica la ricetta nutritiva.

**SHOP-04** Mantenere checklist, note, aggiunte manuali e moltiplicatore persone. Se un aggiornamento aumenta una quantità già spuntata, marcarla «Quantità cambiata da verificare» invece di lasciarla implicitamente acquistata. Le righe manuali non sono cancellate.

**SHOP-05** Usare un digest degli input di spesa: componenti, quantità, inclusioni, date, conversioni e moltiplicatore. La sola aderenza o una nota sul pasto non rende obsoleta la spesa. Undo/redo di una ricetta sì, se cambia il digest.

**SHOP-06** Offrire esportazione testuale/stampa e selezione periodo. La lista deve indicare che pasti esterni ignoti non contribuiscono agli acquisti calcolati.

## 12 Comandi atomici e anteprime

**HARD-01** Ogni anteprima contiene `previewId`, `operationKind`, hash della configurazione rilevante, versione policy, digest catalogo/sicurezza, fingerprint dei giorni e componenti letti, insieme delle date toccate, stato e timestamp. Il commit accetta l'identificatore e la scelta dell'utente, non un oggetto arbitrario ritenuto attendibile dalla UI.

**HARD-02** Al commit ricaricare lo stato autorevole e confrontare le precondizioni. Se cambiano sicurezza, min/max, quantità o giorni sorgente, restituire `STALE_PREVIEW` senza scritture e proporre aggiornamento. Non applicare un'anteprima vecchia a nuovi dati.

**HARD-03** Convalidare nuovamente il risultato completo del commit: integrità riferimenti, versioni correnti ammissibili, sicurezza corrente, energia, frequenze nelle finestre interessate e componenti conservati. Il solo JSON Schema non copre questi invarianti.

**HARD-04** La verifica delle precondizioni e la scrittura devono essere protette dallo stesso confine transazionale o da un protocollo equivalente con versione monotona. Aggiungere serializzazione per piano e gestione multi-tab; un lock solo nella memoria di una tab non basta. BroadcastChannel può notificare invalidazioni, ma non sostituisce un compare-and-swap nel repository.

**HARD-05** Rendere il commit idempotente per `previewId/commandId`: doppio click, retry e doppia risposta non generano due operazioni. L'annullamento di una richiesta non può completare più tardi una mutazione nascosta.

**HARD-06** Per il riequilibrio parziale validare il piano risultante dall'unione dei giorni selezionati e di quelli conservati, incluse finestre oltre il bordo. Lo snapshot before viene letto al commit dopo il controllo di concorrenza; non usare `preview.sourceDays` vecchio come verità per undo.

**HARD-07** Tutte le modifiche logiche corrispondono a una operazione nella history. Fallimento o quota storage esaurita non lascia mezzi giorni, spesa parziale o puntatori di versione incoerenti.

## 13 Retrieval prestazioni e qualità del solver

**PERF-01** Correggere `PlanCandidateService.retrieve`: non applicare il limite di 500 prima di scartare versioni storiche, archiviate o non installate. Indicizzare o materializzare l'insieme eleggibile corrente; poi effettuare campionamento/paginazione deterministica con copertura delle classi energetiche e dei target richiesti.

**PERF-02** Il limite di ricerca deve essere dichiarato nei diagnostics. Quando la ricerca è troncata, non mostrare «nessuna ricetta esistente» se sono stati esaminati soltanto i primi record. Una ricetta appena modificata non deve sparire perché le vecchie versioni occupano il limite.

**PERF-03** Indici/proiezioni per conceptId, famiglie, alias e data civile devono evitare il caricamento completo del catalogo per ogni battuta. Invalidare proiezioni su update e cambio current pointer; mantenere correttezza offline e delle versioni storiche.

**PERF-04** Budget proposti, da misurare su una macchina di riferimento dichiarata con almeno 4 core e 8 GB RAM: ricerca locale p95 ≤250 ms con 10.000 ricette; apertura drawer ≤100 ms; alternative p95 ≤2 s dopo import caldo; piano 7 giorni ≤5 s e 31 giorni ≤15 s sul dataset di accettazione. Per 90 giorni fissare budget esplicito ≤60 s con avanzamento e annullamento, senza bloccare UI. Registrare catalogo, seed, profilo, runtime e hardware dei benchmark.

**PERF-05** Spostare le ricerche costose del planner in Web Worker o chunk interrompibili; non bloccare interazioni e salvataggi. Nessuna dichiarazione di performance deriva dalla sola complessità teorica.

**PERF-06** Misurare varietà per concetti, piatti culinari e combinazioni, non solo recipeId. Varianti di fonte, stato o grammi non devono aggirare la penalità di ripetizione. Riutilizzo volontario e pasti bloccati restano possibili e vanno spiegati.

## 14 Migrazione e backup

### 14.1 Contratto di compatibilità

**MIG-01** Per la nuova linea definire DB 7, content schema 4 e backup format 2. Gli schemi record evoluti possono avere versione 2 mantenendo lettori per versione 1. L'AI deve verificare che questi numeri siano ancora liberi nella base su cui implementa; se la base è cambiata, riportare il conflitto e usare il prossimo numero coerente, mai fare downgrade.

**MIG-02** Non cambiare `PRE_V1_DATA_EPOCH` per cancellare i dati dell'utente. Usare migrazione additiva con checkpoint, backup e ripresa. Preservare classi, cicli, preferenze, piani, aderenza, note, checklist, contenuti locali e operazioni storiche.

**MIG-03** Creare mapping esplicito fra ID vecchi, concetti e forme nuove. Un alimento non risolto resta utilizzabile in consultazione storica con stato da rivedere, ma non viene automaticamente scelto in nuove proposte con sicurezza incerta. Non usare sostituzioni fuzzy per ID referenziati da una regola di allergia.

**MIG-04** Le correzioni dei dati creano nuove revisioni/versioni con link `supersedes`. Il rendering storico usa le vecchie quantità e nutrienti e l'overlay della sicurezza attuale; le nuove proposte usano i dati corretti. Se una famiglia è stata promossa a gestione locale, l'update non ne sovrascrive il current pointer: presenta una proposta di riconciliazione.

### 14.2 Backup ripristinabile nel tempo

**MIG-05** Il backup attuale richiede la stessa `catalogVersion` e include principalmente record locali: il nuovo formato deve poter ripristinare il piano anche quando cambia il catalogo pubblico. Includere chiusura transitiva delle revisioni/versioni referenziate da piani e history, oppure pacchetti versionati garantiti e verificabili. Per questa CR scegliere la prima modalità, archivio autosufficiente dei riferimenti necessari.

**MIG-06** Includere nuove famiglie, regole, mapping, evidenze, versioni policy e proiezioni ricostruibili solo se utili; gli indici derivati si possono rigenerare. Non assumere che il catalogo vecchio resti scaricabile per sempre. Prevedere verifica delle condizioni di redistribuzione dei dati incorporati.

**MIG-07** Import staged con limiti dimensione, parsing sicuro, hash, schema, integrità referenziale e anteprima impatto. Applicare una sola transazione finale; su errore lasciare intatta la base corrente. Un hash valido non basta a rendere attendibili relazioni o quantità.

**MIG-08** Testare V1 → V2 → export → installazione vuota → import; tutti gli ID, quantità, nutrienti storici e note devono coincidere. Migrazione interrotta e ripetuta deve essere idempotente. Un eventuale rollback usa backup verificato e runtime compatibile, senza riscrivere a metà una base già migrata.

## 15 Robustezza PWA e osservabilità

**OPS-01** Aggiornare shell e catalogo come pacchetti coerenti e verificati. Una versione UI non deve usare schemi o dati di una release incompatibile. Testare prima installazione, offline, interruzione dell'import, upgrade con due tab e ritorno a un client vecchio.

**OPS-02** Se una tab vecchia incontra DB più nuovo, deve interrompere gli editor e richiedere ricaricamento, senza tentare scritture. Gestire `versionchange`, blocco upgrade e fallimenti di quota con messaggi che preservano il lavoro.

**OPS-03** Preservare la separazione dati personali/cataloghi pubblici. Nessun upload di allergie, abitudini o piano avviene per generare ricette o cercare fonti. Gli adapter dati sono strumenti di costruzione del catalogo, non chiamate automatiche con il profilo privato dell'utente.

**OPS-04** Creare report diagnostico esportabile locale con versioni, contatori, error codes e dettagli scelti dall'utente. Per default omettere nomi delle regole sensibili e note personali. Non aggiungere telemetria cloud obbligatoria.

**OPS-05** Fonti dati, immagini, testi e note importate devono essere trattati come contenuto, mai come HTML/script eseguibile. Conservare l'uso di `textContent`, testare URL e import malevoli e non inserire chiavi API nei bundle pubblici.

## 16 Estensioni successive con priorità separata

Queste estensioni migliorano il confronto con i prodotti di riferimento ma non devono ritardare i P0 né essere usate per dichiarare completo il core. L'implementazione deve indicare esplicitamente quali sono abilitate e quali ancora pianificate.

**EXT-01 Favoriti e pasti bloccati, P1 dopo il core.** Favorito è un record utente per `recipeId`; influenza discovery e un obiettivo soft facoltativo. Bloccato appartiene allo slot del piano: il riequilibrio lo preserva e segnala eventuale incompatibilità con nuove regole. Bloccato non supera la sicurezza.

**EXT-02 Riutilizzo e menu salvati, P2.** Un menu salvato è un modello di assegnazioni e riferimenti versionati. Applicarlo crea un'anteprima rivalidata nelle date destinazione. Non è copia cieca di CalendarDay, e non copia aderenza o note personali del giorno originale per default.

**EXT-03 Dispensa semplice, P2.** Per alimento/forma: disponibilità presente/assente, quantità e scadenza opzionali. Nessun lotto obbligatorio o gestione magazzino professionale. Quantità sconosciuta non si sottrae dalla spesa; disponibilità con quantità nota si sottrae solo dopo scelta e con conversioni valide.

**EXT-04 Avanzi e preparazione in anticipo, P2.** Un lotto cucinato registra RecipeVersion, porzioni prodotte, data e porzioni assegnate. La spesa conta una produzione sola; i consumi contano ciascun pasto. Non inventare conservabilità. La conservazione deve provenire da dati curati o essere indicata come non verificata.

**EXT-05 Stagionalità e contesto culinario, P2.** Profilo Italia/area geografica scelto, mesi di disponibilità curati e preferenza soft. «Mediterraneo» descrive abitudine culinaria, non origine geografica garantita di ogni alimento. Nessun calendario stagionale uniforme imposto a tutte le regioni.

**EXT-06 Costo, P3.** Budget facoltativo solo con prezzi locali documentati, data e unità; prezzi assenti non valgono zero. Non includere nella CR un confronto prezzi live o ordini a supermercati.

## 17 Piano di implementazione vincolante

Ogni fase termina con codice, test pertinenti, migrazioni necessarie e aggiornamento dei documenti interessati. Completare le dipendenze prima di attivare UI che fa promesse non supportate dal motore.

| Fase | Dipendenze | Ambito obbligatorio | Uscita richiesta |
| --- | --- | --- | --- |
| R0 Correzioni bloccanti | Nessuna | SAFE-05/06/10/11/12, CAT-12/13, HARD-01/02/03/05, primi casi di SWAP | Dati pericolosi esclusi, stale preview rifiutata, sostituzione con feedback e caso vuoto |
| R1 Contratti e identità | R0 | ING, FoodGroup, NUT, schemi e strategia MIG | Mapping esplicito, nuovi lettori/scrittori e fixture di migrazione |
| R2 Ricerca ingredienti e titoli | R1 | Selettore comune, ING-07–13, REC | Ricerca generica ovunque, forme corrette, procedimento rimosso end to end |
| R3 Frequenze e sicurezza parametrica | R1 e R2 | PREF, SAFE completo, retrieval e validator indipendente | Minimo/ideale/massimo e Mai con test finestre e conflitti |
| R4 Flussi planner e UX | R3 | SWAP completo, UX, comandi concorrenti | Sostituzione singola/composta, onboarding e modifica giornata verificati nel browser |
| R5 Catalogo mediterraneo | R1; pubblicazione dopo R3 | Pilot 40/60, poi 200/300 e 120 piatti, CAT e NUT | Report coverage, provenance, revisione e fattibilità reale |
| R6 Spesa e continuità dati | R3–R5 | SHOP, MIG completo, OPS | Quantità d'acquisto coerenti, backup autosufficiente e upgrade offline |
| R7 Accettazione | R0–R6 | Tutti i test core, performance e revisione editoriale | Nessun P0/P1 core aperto, dossier di nuova release candidato |
| R8 Estensioni | R7 | EXT selezionate e contratti dedicati | Funzioni dichiarate singolarmente, senza alterare gli invarianti |

La numerazione R distingue queste fasi dalle precedenti A–H. R0 può applicare temporaneamente un manifest esplicito di quarantena e una rivalidazione sul contratto V1; non deve anticipare scritture del nuovo schema senza il lettore e la migrazione di R1. R1 sostituisce quel confine provvisorio con i contratti completi, mantenendo gli stessi casi bloccanti. R5 può essere preparata con staging durante R2–R4, ma i dati non entrano automaticamente nel catalogo distribuito prima delle verifiche dipendenti. Non introdurre lavoro parallelo fra agenti come requisito: l'ordine delle dipendenze vale anche con una sola AI.

## 18 Mappa dei file da modificare

I percorsi sono relativi alla radice del progetto allegato. Non cambiare soltanto CSS o traduzioni quando il requisito riguarda dati o calcoli.

| Area | File esistenti prioritari | Nuove responsabilità |
| --- | --- | --- |
| Tassonomia e mapping | `src/domain/productFoodTaxonomy.js`, `src/services/referenceDataService.js`, `src/services/referenceDataEditorService.js` | Identità concetti, alias, membership e mapping versionati |
| Ricerca e selettori | `src/services/catalogQuery.js`, `src/services/planCandidateService.js`, `src/ui/guidedControls.js` | Indici correnti, query generica e selettore duale |
| Ingredienti e ricette | `src/ui/catalogPages.js`, `src/services/personalCatalogService.js`, `src/domain/nutritionCore.js` | Forme, titoli, editor senza procedimento, conversioni |
| Regole | `src/ui/configurationPages.js`, `src/domain/configurationRules.js`, `src/planner/recipeFeatures.js`, `src/planner/hardFilter.js`, `src/planner/softScoring.js` | Frequenze e sicurezza parametriche |
| Pianificazione | `src/planner/planGenerator.js`, `src/planner/beamSolver.js`, `src/services/planGenerationService.js`, `src/services/effectivePlanService.js` | Vincoli di finestra, candidate retrieval e precondizioni commit |
| UI planner | `src/ui/planPages.js`, `src/ui/uiState.js`, `src/ui/app.js`, `src/styles.css` | Drawer, focus, draft per slot, navigazione e messaggi |
| Spesa | `src/services/shoppingService.js`, `src/ui/shoppingPages.js` | Gruppi generici, conversioni acquisto e digest |
| Persistenza | `src/db/constants.js`, `src/db/database.js`, `src/services/migrationRunner.js`, `src/services/backupEngine.js`, `src/services/operationHistoryService.js` | DB 7, backup 2, controllo concorrenza |
| Pipeline | `src/corpus/fdcAutoCuration.js`, `src/corpus/v1PhaseBRoleClassifier.js`, `src/corpus/v1PhaseBRecipeGenerator.js`, `src/corpus/recipePipeline.js`, `scripts/corpus/` | Adapter plurifonte, separazione review e generazione culinaria |
| Distribuzione | `schemas/`, `public/schemas/`, `public/data/`, `public/service-worker.js`, `scripts/build.mjs` | Schemi compatibili, cache e cataloghi coerenti |
| QA | `tests/`, `scripts/hardening/`, workflow CI | Test semantici indipendenti, browser reale e migrazioni |

Nuovi moduli consigliati, con nomi coerenti se la struttura evolve: `frequencyPolicy`, `frequencyCounter`, `safetyCompatibility`, `ingredientConceptQuery`, `shoppingConversion`, `planCommandService`. Questi nomi identificano responsabilità, non autorizzano doppie implementazioni della medesima regola.

## 19 Specifiche e skill del progetto

**DOC-01** Aggiornare almeno `PRODUCT_SPEC`, `UX_SPEC`, `DATA_MODEL_SPEC`, `INGREDIENT_TAXONOMY_SPEC`, `REFERENCE_DATA_TAXONOMY_SPEC`, `FOOD_PREFERENCES_SPEC`, `ALLERGY_INTOLERANCE_SPEC`, `RECIPE_CATALOG_SPEC`, `UNITS_YIELD_SPEC`, `SHOPPING_SPEC`, `PLAN_GENERATOR_SPEC`, `NUTRITION_ENGINE_SPEC`, `DATA_PROVENANCE_QUALITY_SPEC`, `JSON_STORAGE_SPEC`, `TEST_STRATEGY` e roadmap.

**DOC-02** Aggiornare `RECIPE_PIPELINE_GENERATOR`, le specifiche del corpus e le skill del progetto sotto `skills/`, inclusi `skills/yourdietmanager-builder/SKILL.md` e le reference sui quality gate. La pipeline deve creare le tassonomie, gli alias e i mapping necessari prima di produrre ricette che li usano.

**DOC-03** Cercare tutte le occorrenze attive di `instructions`, `more_often`, `rarely`, `maxOccurrences`, `windowDays`, `14 days`, `500`, freeze 600/1800 e dichiarazioni di energia soft. Classificarle: contratto corrente da aggiornare, adapter compatibilità o evidenza storica. Non cancellare indiscriminatamente report delle fasi passate né indebolire test per ottenere il verde.

**DOC-04** Ogni fase consegna un report con requisiti soddisfatti, file cambiati, test realmente eseguiti, output, migrazione e limiti residui. Se mancano accesso al browser, dati di una fonte o revisione umana, indicare `non verificato` o `in attesa`, non PASS.

## 20 Criteri di completamento

La CR core è completa soltanto quando:

1. Tutti i test core nel documento di accettazione passano; quelli visivi sono eseguiti su browser reale e viewport dichiarati.
2. Non restano P0/P1 core aperti; dati non verificati sono esclusi in modo esplicito e non contano nei target curati.
3. Ogni controllo ingrediente usa lo stesso concetto e mapping; nessuna superficie ordinaria impone nomi tecnici di stato per esprimere un gusto generale.
4. Minimo, ideale, massimo e Mai hanno semantica identica in form, preview, solver, commit, riequilibrio e riepilogo.
5. Sostituzione funziona per risultati, zero risultati, errore, annullamento, più componenti e stato cambiato.
6. Procedimento assente dai flussi correnti e nuovi dati, con lettura storica e backup preservati.
7. Catalogo italiano supera i criteri di copertura, qualità, diritti d'uso e fattibilità; il numero di ricette non sostituisce la revisione culinaria.
8. Migrazione e backup ripristinano lo storico senza reset; aggiornamento PWA non combina versioni incompatibili.
9. Misure di ricerca, generazione, usabilità e accessibilità sono registrate su build e catalogo della release candidata.
10. Il nuovo dossier di rilascio si riferisce ai nuovi digest e non riutilizza l'accettazione del candidato H.

## 21 Istruzione pronta per l'AI esecutrice

Leggi questa specifica e i test di accettazione prima di modificare il progetto. Lavora sulla base verificata o identifica chiaramente le differenze della tua base. Esegui le fasi R in ordine di dipendenza. Per ogni fase implementa dominio, dati, UI, migrazione, test e documentazione pertinenti; non dichiarare una feature completa se funziona soltanto in un livello. Non trasformare valori mancanti in zero, non inventare nutrienti o allergeni, non simulare approvazioni umane e non rendere meno restrittivi i test esistenti per adattarli a un errore. Mantieni gli invarianti della sezione 1. Una difficoltà di solver, acquisizione fonte o ambiente deve essere riportata con un risultato concreto e un limite preciso; non giustifica una soluzione silenziosamente diversa. Consegna codice applicabile, evidenza dei test eseguiti e report della fase. Una futura richiesta di implementazione di una sola fase autorizza quella fase e le sue dipendenze necessarie, non la promozione automatica a stable.

## 22 Fonti pubbliche verificate

Le fonti esterne orientano selezione dati e requisiti; le decisioni progettuali e le soglie quantitative di questa CR sono proposte specifiche per yourDietManager, non affermazioni di tali enti. Consultazione 11 settembre 2026.

- CREA, [Tabelle di composizione e condizioni di attribuzione](https://www.alimentinutrizione.it/tabelle-nutrizionali). Fonti italiane e modalità di ricerca; nessuna API bulk dedotta dalla sola consultabilità.
- CREA, [Farro perlato cotto](https://www.alimentinutrizione.it/tabelle-nutrizionali/000025). Esempio di record con stato, parte edibile, nutrienti e metodi distinti.
- ANSES, [Ciqual 2025](https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table) e [pacchetto dati pubblicato](https://zenodo.org/records/17550133). Copertura europea e distribuzione dei file.
- USDA, [FoodData Central e licenza](https://fdc.nal.usda.gov/) e [documentazione dei tipi di dati](https://fdc.nal.usda.gov/data-documentation/). CC0, origine e differenze dei dataset.
- Food Standards Agency, [allergeni composizione e rischio di tracce](https://www.gov.uk/government/publications/food-allergy-and-intolerance-advice-for-consumers/food-allergy-and-intolerance-advice-for-consumers). Riferimento informativo; la CR non pretende conformità normativa italiana certificata.
- W3C, [WCAG 2.2 e dimensione dei target](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Il target interno 44 px è una decisione UX più ampia del solo minimo del criterio.
- [Eat This Much](https://www.eatthismuch.com/), [Mealime](https://www.mealime.com/) e [Paprika](https://www.paprikaapp.com/). Benchmark delle funzioni dichiarate pubblicamente, non prova comparativa di qualità dei loro algoritmi. Mealime è un riferimento UX: il sito consultato annuncia chiusura il 21 ottobre 2026, quindi non è una raccomandazione di migrazione verso quel servizio.
