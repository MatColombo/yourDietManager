# UX Spec V1

## 1. Principio

Dopo la configurazione iniziale, assumere utente formato. Evitare card tutorial permanenti, paragrafi introduttivi ridondanti e spazi bianchi non funzionali.

Nel release candidate V1 l'onboarding guidato e temporaneamente disabilitato in attesa della revisione dedicata. Una nuova installazione parte da una configurazione standard neutra e puo essere modificata direttamente da `Configura`; nessuna funzione ordinaria deve dipendere dal completamento del wizard disabilitato.

## 2. Densita

Supportare:

- compact
- comfortable

Default raccomandato desktop: compact; mobile: compact con touch target adeguati.

## 3. Pattern operativi

### Editing

Preferire inline editor, drawer o schermata unica con conferma finale rispetto a catene di pagine.

### Bulk operations

Sempre preview selezionabile + confirm + undo atomico.

### Advanced configuration

Tenere configurazione avanzata in area dedicata, non nella toolbar primaria.

### Editor integrity

Gli editor devono preservare lo stato visuale e la bozza dell'utente:

- aggiungere, rimuovere o riordinare un elemento non puo aprire/chiudere disclosure o accordion non coinvolti;
- lo stato `open` delle disclosure e parte dello UI state e deve sopravvivere ai rerender locali/globali;
- un aggiornamento asincrono dell'app non puo sostituire un editor dirty; il full rerender viene differito finche la bozza non e salvata/scartata o la navigazione e confermata;
- qualunque route editabile registra dirty state per input/change e mutazioni programmatiche equivalenti;
- link interni, Back/Forward e reload/chiusura tab chiedono conferma prima di perdere una bozza non salvata;
- dopo un save esplicito deve comparire sempre un feedback success/failure persistente attraverso i rerender e annunciato con una region `aria-live`;
- la validazione del form deve essere almeno restrittiva quanto JSON Schema + invarianti cross-record + reference-data. Se il draft non e valido, Save e disabilitato e l'errore viene mostrato prima del tentativo di persistenza;
- un campo numerico obbligatorio vuoto resta invalido: non deve essere trasformato silenziosamente in `0` o in un default.

## 4. Home/Oggi

Ordine consigliato:

1. day class/date;
2. next meal;
3. meals by civil date;
4. nutrition summary;
5. upcoming prep.

## 5. Calendario

Il calendario deve mostrare la DayClass con abbreviazione e colore definiti dall'utente. Tap/click apre la gestione della giornata senza passaggi intermedi.

## 6. Ricette

Catalogo con ricerca/filter virtualizzabile e candidate retrieval indicizzato da IndexedDB. Una sola pagina dinamica di dettaglio; nessuna pagina statica per recipe. La route canonica e `/recipes/<recipeId>`; `/recipes/<recipeId>/edit` apre l'editor.

La consultazione della RecipeVersion corrente e indipendente dall'esistenza di PlanInstance/CalendarDay. Il catalogo e il dettaglio devono funzionare anche prima della prima generazione piano. Cliccare una card ricetta deve sempre aprire il dettaglio ricetta e non puo dipendere dallo stato del planner. Il dettaglio espone ingredienti, istruzioni, nutrienti, archetipi, tassonomie, allergeni, provenance e storico versioni.

Ogni ricetta corrente mostra `Modifica` indipendentemente da `origin`. Una modifica crea una nuova RecipeVersion della stessa family; `Duplica ricetta` resta un'azione separata che crea una nuova family.

## 7. Errori

Messaggi orientati all'azione:

- "Nessuna ricetta compatibile con questi vincoli. Allarga la tolleranza energetica o rivedi i vincoli della Cena."

Non mostrare errori interni/schema all'utente finale salvo se necessario in strumenti di diagnostica.

## 8. Stato di caricamento catalogo

Durante primo import/aggiornamento catalogo la UI deve mostrare progresso e consentire configurazione non dipendente dalle ricette. Evitare splash bloccanti lunghi; differenziare chiaramente app pronta, catalogo in import e catalogo non disponibile.

## 9. Authoring ricette custom

La sezione Ricette include azione `Nuova ricetta` e rende `Modifica` disponibile per qualunque Recipe family corrente, indipendentemente da `origin`. L'editor crea una nuova Recipe family alla prima pubblicazione e una nuova RecipeVersion immutabile a ogni modifica successiva; non muta versioni gia referenziate da piani. La prima modifica di una family di catalogo la promuove a gestione locale mantenendo lo stesso recipeId; il current pointer locale non viene sovrascritto da catalog update successivi.

Flusso minimo editor:

1. titolo/descrizione/istruzioni IT e EN (con fallback assistito ma conferma utente);
2. ingredient lines selezionate dal catalogo o ingredienti custom;
3. normalizzazione unita e validazione conversioni;
4. metadati meal/practical/tags;
5. preview nutrizionale calcolata deterministicamente;
6. validazione allergeni derivati;
7. salva nuova versione.

`Duplica` resta un'azione distinta per creare una nuova family, non un prerequisito per modificare una ricetta base.

### 9.1 Input semantici guidati

I form non chiedono all'utente di conoscere ID o spelling canonici. Per qualunque valore riutilizzato dal motore:

- mostra label localizzata + search/autocomplete e persisti l'ID della scelta;
- usa chip multi-select per reference multiple;
- usa group/subgroup selector per `food_category`;
- usa select localizzate per registry chiusi;
- limita le unità della recipe line alle conversioni dell'ingrediente scelto;
- non usare input denominati CSV per cuisine/family/tag o target semantici.

Digitare testo simile a una voce non equivale a selezionarla: un autocomplete senza scelta canonica resta invalido.

## 9.2 Ingredient detail/edit

`Configura -> Ingredienti` offre una route dettaglio canonica `/configure/ingredients/<ingredientId>` e una route editor `/configure/ingredients/<ingredientId>/edit`. Il dettaglio e consultabile senza piano e mostra stato/basis, nutrienti, tassonomia, archetipi, allergeni, provenance/quality e storico revisioni.

Ogni ingrediente corrente e modificabile indipendentemente da `origin`: la modifica crea una nuova IngredientRevision della stessa family e, alla prima modifica di un record distribuito, promuove la family a gestione locale. Le revisioni precedenti non vengono mutate.

## 10. Aderenza

Ogni meal slot materializzato espone `adherenceStatus`: `not_recorded | followed | partial | not_followed`. Dalla Home/Oggi e dalla gestione giornata l'utente puo impostarlo con una singola azione; `partial` puo avere `adherenceNotes` opzionali. Lo stato giorno e derivato/aggiornato coerentemente:

- tutti gli slot registrabili followed -> `followed`;
- almeno uno not_followed/partial e almeno uno followed -> `partial`;
- tutti gli slot registrabili not_followed -> `not_followed`;
- nessun dato di aderenza -> `planned`.

Gli slot external possono essere marcati allo stesso modo; se la policy consente `user_estimate`, l'utente puo inserire una stima a posteriori separata dal budget pianificato. V1 usa l'aderenza per storico e spiegazione, **non** ricalibra automaticamente target futuri senza un comando esplicito di rebalance/regeneration.

## 11. Fine orizzonte

Quando un piano entra nella finestra `triggerDaysBeforeEnd`, Home e Calendario mostrano una sola call-to-action non invasiva coerente con `continuationPolicy`. Se il piano e gia terminato, la UI mostra chiaramente l'ultima data coperta e consente di creare il segmento successivo.

## 12. Checklist spesa

La vista Spesa puo salvare una checklist persistita. Checked state, note e righe manuali sopravvivono a refresh/reload. Quando cambia il piano sorgente, la UI indica che la checklist e obsoleta e offre `Aggiorna da piano` senza perdere le righe manuali.

## 13. Phase D3–D5 — discovery e navigazione contestuale

### 13.1 Product taxonomy picker

Qualunque controllo `productFood` usa un unico picker gerarchico con path localizzato, ricerca per label/alias e coverage count. L'interfaccia privilegia categorie e concetti comprensibili all'utente rispetto alle varianti tecniche della base nutrizionale.

### 13.2 Faceted search

Ricette: `product_food`, dieta, practical tag, meal class, energia, proteine, fibra, prep time e allergeni sono faccette combinabili.

Ingredienti: `product_food`, stato tecnico, origin e testo sono faccette combinabili.

I filtri devono modificare la query reale del catalogo; non sono semplici tag visuali.

### 13.3 Context drill-down

Da Oggi/Gestione giornata il nome ricetta e un link diretto al dettaglio. Da Recipe detail ogni ingrediente e un link diretto alla specifica IngredientRevision. `Back to context` conserva la catena Recipe -> Day e riporta allo specifico meal slot con scroll/highlight.
