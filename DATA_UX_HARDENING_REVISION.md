# Data / UX Hardening Revision — pre corpus production

## Decisione

Prima di riprendere la materializzazione del corpus production Phase 4, completare un hardening dei dati di riferimento e degli editor.

Il problema da eliminare e la presenza di valori semantici digitati liberamente che vengono poi confrontati dal planner o dalla pipeline. Typo, alias non canonici e conoscenza mnemonica non devono poter cambiare il comportamento del sistema.

## Invarianti approvate

1. Ogni valore semantico riutilizzato dal motore e un ID canonico proveniente da registry/tassonomia.
2. Le UI mostrano label e autocomplete; non chiedono all'utente di conoscere gli ID.
3. Gruppi/sottogruppi, cuisine, family e tag semantici sono reference data espliciti.
4. La pipeline corpus puo proporre e creare termini delle tassonomie estendibili prima di usarli.
5. Registry di sistema chiusi (allergeni, archetipi, stati tecnici, ecc.) non sono estendibili dalla pipeline.
6. Se manca un ingrediente, la pipeline puo crearlo solo da fonte verificabile e dopo i quality gate; mai inventare nutrienti/allergeni.
7. Ingredienti e ricette partono con tutti i MealArchetype selezionati e richiedono almeno una selezione per il save.
8. Tutte le ricette e tutti gli ingredienti sono modificabili dall'utente; internamente la modifica crea una nuova revisione/versione e preserva i riferimenti storici.
9. Recipe detail e ingredient detail devono essere indipendenti dall'esistenza di un piano.
10. Nessun form deve produrre normalmente un oggetto che lo schema rifiuta solo al momento del salvataggio.

## Stato dei pass

### Pass A — Reference/Data Model Review ✅ completato

Implementato:

- inventario completo dei campi (`REFERENCE_DATA_FIELD_INVENTORY.md`);
- 7 tassonomie canoniche / 113 termini seed;
- schema Taxonomy, TaxonomyTerm e ReferenceDataProposal;
- IndexedDB `DB_VERSION=4`, `contentSchemaVersion=3`, store `taxonomies`/`taxonomyTerms`;
- catalog manifest con reference-data version/digest/shard;
- semantic validation nei service/catalog/pipeline boundary;
- `contentMigration:3` exact/alias/manual/unresolved, con blocker su unresolved;
- preservazione delle versioni/revisioni storiche durante la migrazione;
- MealArchetype `minItems:1` uniforme per ingredienti e ricette;
- pipeline/orchestrator congelati su reference-data version/digest e proposal lifecycle auditabile;
- backup di tassonomie/termini user.

### Pass B — Guided form infrastructure ✅ completato

Implementato:

- `Configura -> Tassonomie e reference data` per consultare, cercare e creare/modificare termini user delle 7 tassonomie estendibili;
- autocomplete canonico per ingredienti, categorie, cuisine, flavor e target delle regole;
- chip multi-select per family/cuisine/diet/flavor/practical/preparation delle ricette;
- selector gerarchico gruppo/sottogruppo con vincolo parent-child;
- enum tecnici localizzati, incluso ingredient state;
- selector unità delle recipe line limitato a basis + conversioni dell'IngredientRevision selezionata;
- MealArchetype uniforme: tutti selezionati in creazione, minimo uno obbligatorio;
- nutrienti autorevoli vuoti distinti da zero;
- rimozione dei normali input semantici CSV/free-text e rifiuto service-side di tag passati come stringa;
- validazione inline sui nuovi editor ingredient/recipe e sui controlli reference richiesti.

### Pass C — Editor/Navigation UX Hardening ✅ completato

Implementato:

- onboarding temporaneamente disabilitato; una installazione nuova parte direttamente da una configurazione standard neutra, senza allergie/preferenze arbitrarie e con moltiplicatore spesa 1;
- upgrade automatico del vecchio bootstrap solo se la configurazione legacy non e mai stata modificata/importata esplicitamente;
- disclosure/accordion state centralizzato: aggiunte, rimozioni, riordini e rerender locali non possono chiudere sezioni aperte senza azione utente;
- full rerender differito mentre un editor contiene una bozza dirty, per evitare perdita di input a causa di aggiornamenti asincroni;
- dirty-state/navigation guard globale per link interni, Back/Forward e reload/chiusura tab;
- feedback save/error persistente tramite notification region `aria-live`, non distrutta dai rerender;
- fix `DayClass.capabilities`: `fridge`, `reheating`, `cooking`, `complexSnack`, `portabilityRequired` e `maxPrepMinutes` sono modificati nel nodo schema corretto;
- full form/schema audit con validazione live e Save disabilitato quando il draft non puo soddisfare schema + invarianti cross-record + reference data;
- campi numerici obbligatori vuoti restano invalidi invece di essere coerciti silenziosamente a `0` o a un default;
- una DayClass non `free` non puo essere salvata senza almeno un meal slot;
- navigazione programmatica e disclosure operative centralizzate, senza `history.pushState` o `<details>` ad hoc nei singoli editor.

### Pass D — Detail/edit UX ✅ implementato

Implementato:

- route canoniche dinamiche `/recipes/<recipeId>` e `/configure/ingredients/<ingredientId>` indipendenti da PlanInstance/CalendarDay;
- route editor dinamiche corrispondenti e dirty-state coverage;
- dettaglio con nutrienti, ingredienti/tassonomie, allergeni, provenance e storico versioni/revisioni;
- `Modifica` disponibile per family distribuite e locali: la prima modifica mantiene lo stable family ID, crea una nuova immutable revision/version `origin=user` e promuove la family a gestione locale;
- catalog update, rollback e pack install preservano il current pointer locale di una family promossa;
- export/import del catalogo personale supporta l'override locale di una family distribuita con lo stesso stable ID, senza permettere collisioni sugli immutable ID;
- `Duplica` resta un'azione separata che crea una nuova family;
- normalizzazione trailing slash per impedire il fall-through di `/recipes/` verso la schermata planner;
- regression suite domain/source e harness Chromium/CDP per i click critici. Il workflow GitHub Pages richiede il browser gate; un ambiente locale che blocca localhost viene registrato come `skipped`, non come `passed`.


### Pass E — Final Acceptance & Revision Closure ✅ implementato

Implementato:

- browser acceptance estesa oltre il solo detail/edit: required numeric blank -> Save bloccato, disclosure state preservato dopo rerender locale, dirty navigation reject/accept e feedback persistente dopo save reale;
- marker `data-testid` stabili limitati ai punti di acceptance, senza trasformare la UI in un test-specific implementation;
- report canonico `reports/pass-e-browser.json`, mantenendo `pass-d-browser.json` come alias storico;
- `hardening:revision` machine-checkable per sincronizzazione versione, copertura documentale/Skill, presenza dei browser acceptance checks e requisito CI `YDM_BROWSER_REQUIRED=1`;
- main `npm run check` ordinato come build -> browser -> revision closure -> Pages audit;
- Skill, quality gates, roadmap e test strategy allineati al Pass E;
- candidate `1.0.0-rc.9`; rc.7 rende deterministico il bootstrap browser GitHub Actions, rc.8 corregge la dirty-navigation acceptance e la diagnostica CDP, mentre rc.9 rende recuperabile una `contentMigration:3` gia bloccata da FoodPreference legacy `ingredient:uova` tramite retyping auditato verso `foodCategory:food_group_eggs` (solo non-hard) e anticipa il recovery/update della Service Worker prima del bootstrap applicativo. `DB_VERSION=4` e `CONTENT_SCHEMA_VERSION=3` restano invariati.

## Gate per riprendere Phase 4 production

Pass A-E sono implementati. Prima di riprendere la generazione 3.000–5.000 deve essere verde la final acceptance browser Pass E in un ambiente Chromium/localhost non bloccato; il workflow GitHub Pages la imposta come gate obbligatorio. Dopo questo gate, il solo lavoro residuo per V1 e la materializzazione del corpus production Phase 4 con provenance/quality production.

Vedere `specs/REFERENCE_DATA_TAXONOMY_SPEC.md` per il contratto normativo e i report `DATA_UX_HARDENING_PASS_A_REPORT.md`, `DATA_UX_HARDENING_PASS_B_REPORT.md`, `DATA_UX_HARDENING_PASS_C_REPORT.md`, `DATA_UX_HARDENING_PASS_D_REPORT.md` e `DATA_UX_HARDENING_PASS_E_REPORT.md` per l'implementazione.
