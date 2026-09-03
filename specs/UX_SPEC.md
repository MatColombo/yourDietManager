# UX Spec V1

## 1. Principio

Dopo l'onboarding, assumere utente formato. Evitare card tutorial permanenti, paragrafi introduttivi ridondanti e spazi bianchi non funzionali.

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

Catalogo con ricerca/filter virtualizzabile e candidate retrieval indicizzato da IndexedDB. Una sola pagina dinamica di dettaglio; nessuna pagina statica per recipe.

## 7. Errori

Messaggi orientati all'azione:

- "Nessuna ricetta compatibile con questi vincoli. Allarga la tolleranza energetica o rivedi i vincoli della Cena."

Non mostrare errori interni/schema all'utente finale salvo se necessario in strumenti di diagnostica.

## 8. Stato di caricamento catalogo

Durante primo import/aggiornamento catalogo la UI deve mostrare progresso e consentire configurazione non dipendente dalle ricette. Evitare splash bloccanti lunghi; differenziare chiaramente app pronta, catalogo in import e catalogo non disponibile.

## 9. Authoring ricette custom

La sezione Ricette include azione `Nuova ricetta` e, per `origin=user`, `Modifica`/`Archivia`. L'editor crea una nuova Recipe family alla prima pubblicazione e una nuova RecipeVersion immutabile a ogni modifica successiva; non muta versioni gia referenziate da piani.

Flusso minimo editor:

1. titolo/descrizione/istruzioni IT e EN (con fallback assistito ma conferma utente);
2. ingredient lines selezionate dal catalogo o ingredienti custom;
3. normalizzazione unita e validazione conversioni;
4. metadati meal/practical/tags;
5. preview nutrizionale calcolata deterministicamente;
6. validazione allergeni derivati;
7. salva nuova versione.

Il dettaglio di una ricetta base non offre editing distruttivo; puo offrire `Duplica come ricetta personale`.

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
