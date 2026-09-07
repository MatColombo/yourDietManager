# yourDietManager — V1 Release Acceleration Plan

**Status:** Step 1 e Step 2 completati; Step 3 release-candidate freeze implementato in `1.0.0-rc.27`; test manuale finale e promozione stabile ancora pendenti
**Baseline:** `5cc6491` / `1.0.0-rc.24`
**Priorità:** time-to-release > retrocompatibilità con build RC/dev
**Obiettivo:** arrivare a `v1.0.0` in **3 step**, validando prima il prodotto verticale e solo dopo congelando compatibilità e crescita corpus.

---

## 1. Decisione

Fino al rilascio pubblico `v1.0.0`, **nessun dato generato dalle build precedenti è considerato produzione**.

Questo significa che, fino al freeze V1:

- è consentito cancellare e rigenerare l'intero IndexedDB;
- è consentito rigenerare ingredienti, ricette, tassonomie, ID e manifest;
- è consentito cambiare schema e modello semantico senza migrare le RC precedenti;
- fixture, template, cataloghi dev e record storici non devono essere preservati se introducono complessità;
- non si implementano compatibility layer per dati mai rilasciati;
- non si blocca lo sviluppo per garantire rollback verso cataloghi RC/dev;
- se una modifica al modello rende incoerenti piani/configurazioni locali di test, si effettua un reset pre-V1 invece di costruire una migrazione;
- la compatibilità all'indietro diventa requisito **solo dal tag `v1.0.0` in poi**.

L'errore `Immutable catalog record changed in place: ingrev_salmon_raw_v2` è quindi classificato come **debito pre-release da eliminare con reset/rigenerazione**, non come caso da supportare tramite migrazione conservativa.

Il precedente hotfix che cercava di preservare i record `*_v2` non è più la direzione da seguire.

---

## 2. Stato reale della baseline

Alla baseline `5cc6491`:

- applicazione: `1.0.0-rc.24`;
- catalogo pubblicato: `1.0.0-production-review-500`;
- RecipeFamily pubblicate: **500**;
- RecipeVersion pubblicate: **500**;
- IngredientFamily pubblicate: **600**;
- IngredientRevision pubblicate: **604**;
- le 4 revisioni extra derivano dai vecchi fixture di sviluppo e non appartengono alle 600 family production correnti;
- il pack `core` dichiara tutte le **500** RecipeVersion;
- `quick`, `high_protein` e `vegetarian` sono sottoinsiemi opzionali del corpus core;
- Phase 5–8 risultano implementate a livello di codice/report/test, ma il prodotto non è ancora stato validato come flusso reale end-to-end sulla base dati che vogliamo rilasciare;
- planner, effective plan, replace/rebalance, shopping e checklist devono quindi essere considerati **non ancora accettati come prodotto**, anche se esistono test unit/integration e smoke test.

Questa distinzione è fondamentale: la priorità non è più perfezionare il processo di corpus generation, ma provare che l'applicazione completa funziona davvero.

---

## 3. Invarianti che restano obbligatorie

La libertà pre-V1 non significa rimuovere le proprietà necessarie alla correttezza del prodotto.

Restano obbligatorie:

1. **Allergie, intolleranze ed esclusioni hard non possono essere rilassate dal planner.**
2. **I campi semantici usati dal motore devono usare ID canonici**, non stringhe libere o alias impliciti.
3. **RecipeVersion deve referenziare IngredientRevision esistenti** nel catalogo che la contiene.
4. **Il planner deve essere deterministico a parità di input/seed/versione solver.**
5. **Il piano confermato deve essere persistente e ricaricabile** senza cambiare assegnazioni spontaneamente.
6. **Shopping e prep devono derivare dalle stesse versioni frozen usate dal piano.**
7. **Nessun record orfano o riferimento dangling** è ammesso nel catalogo V1.
8. **Repository Layer + IndexedDB restano l'architettura runtime.**
9. **Local-first e privacy locale restano requisiti V1.**
10. **IT/EN restano supportati nella release V1.**

La struttura family + revision/version può essere mantenuta perché è utile al prodotto V1, ma **gli ID pre-release non sono ancora API/storia pubblica e possono essere rigenerati**.

---

# STEP 1 — PRE-V1 RESET + DATA/CATALOG CLOSURE

**Implementation status:** COMPLETE in `1.0.0-rc.25`; final real-browser verification is enforced by GitHub Actions. See `V1_STEP1_IMPLEMENTATION_REPORT.md`.

## Obiettivo

Portare l'app a una base dati unica, pulita e coerente, eliminando completamente la compatibilità con fixture e cataloghi precedenti.

Lo Step 1 deve risolvere definitivamente il problema catalogo prima di spendere altro tempo sul corpus o sul planner.

## 1.1 Reset pre-release

Introdurre un unico **pre-V1 data epoch**.

Quando l'app rileva dati appartenenti a una build/epoch precedente:

- elimina IndexedDB dell'app oppure ne resetta integralmente tutti gli store applicativi;
- riparte dal bootstrap corrente;
- non tenta content migration da RC/dev precedenti;
- non tenta di preservare piani, configurazioni, recipe history o catalog state pre-release.

È accettabile perdere dati creati durante sviluppo/test: non esiste ancora una release pubblica.

Il reset deve essere automatico. L'utente non deve pulire manualmente IndexedDB, cache o Service Worker.

## 1.2 Catalogo unico

Rigenerare il catalogo V1 candidate a partire da una sola fonte canonica.

Requisiti:

- esattamente 600 IngredientFamily attive, salvo correzioni motivate del modello;
- una sola revisione corrente valida per ogni family pubblicata, più eventuali revisioni storiche **solo se realmente referenziate** da una RecipeVersion pubblicata;
- eliminazione dei quattro fixture/orfani legacy (`salmon/rice/zucchini/olive_oil *_v2`) se non appartengono al corpus corrente;
- 500 RecipeFamily / 500 RecipeVersion iniziali coerenti;
- nessun riferimento a IngredientRevision assente;
- nessuna family pubblicata senza current pointer valido;
- nessun ID duplicato;
- nessun record semanticamente legacy;
- manifest, checksum e shard rigenerati insieme al catalogo;
- `core` deve contenere l'intero corpus V1 candidate;
- i pack opzionali devono essere semplici viste/subset e **non devono nascondere il catalogo core**.

## 1.3 Modello semantico

Durante questo step è consentito modificare da zero:

- tassonomie;
- food group/subgroup;
- cuisine/family/flavor tags;
- meal archetype mappings;
- ingredient state;
- unit/conversion model;
- nutrition metadata;
- schema IngredientRevision / RecipeVersion;
- policy di generazione.

Regola: se una parte del modello è difficile da spiegare o richiede compatibility logic con fixture pre-release, **semplificarla ora**.

Non introdurre nuove astrazioni per supportare dati vecchi.

## 1.4 Stop alla crescita corpus

Durante Step 1:

- non generare recipe 501+;
- non lavorare al target 1.500/3.000/4.000;
- non richiedere Human Review Gate 500/500;
- non costruire altre pipeline di compatibilità corpus.

Le 500 ricette servono come corpus di validazione prodotto.

## 1.5 Acceptance Step 1

Step 1 è PASS solo se, su installazione pulita e su browser con vecchi dati RC:

- l'app si avvia senza intervento manuale;
- il vecchio database viene resettato automaticamente quando necessario;
- `Aggiorna catalogo locale` non produce errori di immutabilità;
- Catalogo → Ricette mostra **500 ricette**, non <10;
- il dettaglio di una ricetta apre sempre;
- il dettaglio ingredienti apre sempre;
- ricerca e filtri restituiscono risultati coerenti;
- ogni RecipeVersion risolve tutti i propri IngredientRevision;
- il pack core contiene 500 ricette;
- installare/rimuovere un pack opzionale non riduce accidentalmente il core;
- zero record orfani nei catalog shard;
- zero semantic reference unresolved;
- build Pages completa e bootstrap reale in Chromium sono verdi.

## Deliverable Step 1

Un'unica patch/ZIP contro la baseline corrente che includa:

- codice;
- dati rigenerati;
- manifest/checksum;
- test aggiornati;
- eventuale semplificazione schema;
- documentazione aggiornata.

**Nessuna sequenza di comandi manuali complessi richiesta sul PC aziendale.**

---

# STEP 2 — VERTICAL PRODUCT / ENGINE ACCEPTANCE

## Obiettivo

Provare e correggere il prodotto completo, non i singoli moduli isolati.

Questo è lo step più importante prima della release.

## 2.1 Flusso verticale obbligatorio

La stessa installazione deve completare questo percorso:

`Configurazione → Genera piano → Preview → Conferma → Oggi → Calendario → Gestisci giorno → Sostituisci → Ribilancia → Adherence → Spesa → Checklist → Reload`

Ogni passaggio deve usare dati persistiti reali e il catalogo Step 1.

## 2.2 Scenari minimi di engine acceptance

Eseguire almeno questi scenari end-to-end:

### Scenario A — Omnivoro standard

- ciclo 7 giorni;
- colazione/pranzo/cena + eventuale snack;
- nessuna esclusione;
- generazione multi-day;
- verifica target nutrizionali e varietà.

### Scenario B — Vegetariano

- preferenze/tassonomie vegetariane;
- nessuna ricetta incompatibile nel piano;
- replacement coerente.

### Scenario C — Hard safety

- almeno un'allergia/intolleranza;
- il planner non deve proporre nessuna RecipeVersion incompatibile;
- replace e rebalance devono applicare lo stesso hard filter.

### Scenario D — Giorni/pasti configurabili

- DayClass diverse;
- MealClass diverse;
- meal archetype selezionati;
- vincoli prep/capabilities;
- external slot;
- carry-over tramite `dayOffset`.

### Scenario E — Editing del piano

- replace singolo pasto;
- rebalance giorno;
- rebalance range;
- adherence;
- undo/redo;
- reload browser con stato invariato.

### Scenario F — Shopping/prep

- lista spesa derivata dal piano;
- people multiplier decimale;
- external meal esclusi;
- ingredient state/unit aggregation corretta;
- checklist persistente;
- refresh/staleness coerenti dopo modifica piano.

## 2.3 Regola di correzione

Se uno scenario fallisce:

1. correggere prima la semantica/modello, se il problema nasce dal modello;
2. correggere planner/service/UI;
3. rigenerare catalogo se necessario;
4. resettare ancora il pre-V1 epoch se la modifica rompe dati precedenti;
5. **non aggiungere una migrazione pre-release solo per preservare dati di test**.

È esplicitamente consentito modificare il modello anche durante Step 2.

## 2.4 Validazione del planner

Non basta che il solver restituisca un piano.

Per ogni scenario verificare:

- hard constraints rispettati al 100%;
- nessun recipe/ingredient dangling;
- distribuzione dei pasti compatibile con gli archetipi;
- target nutrizionali ragionevoli rispetto alla configurazione;
- nessun loop o fallback invisibile;
- seed e solver version registrati;
- stesso input + stesso seed = stesso risultato;
- diagnostica comprensibile quando non esiste una soluzione.

## 2.5 UX acceptance

La V1 non richiede polish perfetto, ma deve essere utilizzabile senza conoscere l'implementazione interna.

Devono funzionare almeno:

- configurazione iniziale;
- modifica configurazione;
- recipe/ingredient detail;
- generazione piano;
- preview/confirm;
- calendar/today;
- replace/rebalance;
- shopping/checklist;
- error state;
- empty state;
- back/reload;
- mobile viewport di base.

## 2.6 Acceptance Step 2

Step 2 è PASS solo se:

- tutti i sei scenari verticali sono verdi in Chromium reale;
- almeno un piano di 7 giorni viene generato, confermato e ricaricato;
- hard safety = zero violazioni;
- replace/rebalance = zero violazioni hard;
- shopping corrisponde alle ricette frozen del piano;
- undo/redo non corrompe CalendarDay/PlanInstance;
- nessun errore console critico nei flussi principali;
- non esistono blocker P0/P1 aperti su planner/effective-plan/shopping.

## Deliverable Step 2

Un'unica patch/ZIP che contiene tutte le correzioni emerse dal vertical acceptance.

I test browser e le suite pesanti devono essere eseguiti in GitHub Actions. Il PC locale non è un requisito di esecuzione.

### Stato implementazione Step 2 — 2026-09-07

Implementazione completata nella candidate `1.0.0-rc.26`. I sei scenari deterministici su catalogo reale sono verdi e il percorso UI reale è incorporato nel browser gate obbligatorio di GitHub Pages. Il PASS formale dello Step 2 richiede il workflow Chromium verde dopo il push; il PC locale non è parte del release gate.

---

# STEP 3 — V1 FREEZE + RELEASE CANDIDATE

**Implementation status:** FREEZE COMPLETE in `1.0.0-rc.27`; catalog frozen at `1.0.0`; final manual acceptance pending. See `V1_STEP3_IMPLEMENTATION_REPORT.md`, `V1_FREEZE_CONTRACT.md` and `V1_FINAL_TEST_CHECKLIST.md`.

## Obiettivo

Congelare ciò che funziona e produrre il candidato finale da testare manualmente. La promozione dell’app a `v1.0.0` e il tag stabile avvengono **solo dopo** l’accettazione manuale esplicita.

Solo in questo step iniziano gli obblighi di compatibilità.

## 3.1 Freeze modello

Al termine dello Step 2:

- congelare schema V1;
- congelare significato degli ID canonici;
- congelare il comportamento di family + revision/version;
- congelare il catalog bootstrap/update contract;
- definire `CONTENT_SCHEMA_VERSION` V1;
- definire il database runtime V1;
- da questo punto ogni futura modifica dati deve avere una migrazione o una strategia compatibile.

**Il tag `v1.0.0` è il confine ufficiale della retrocompatibilità.**

## 3.2 Corpus V1

La V1 viene rilasciata con il corpus che ha superato Step 2.

Nuovo gate V1:

- **500 ricette valide sono sufficienti per la release iniziale** se coprono gli scenari supportati dal prodotto;
- il precedente minimo 3.000 e target 4.000 diventano milestone post-V1;
- nessun gate 500/500 di review manuale blocca la release.

### Human review V1 semplificata

Prima del release tag eseguire una review manuale **stratificata**, non 500/500:

- 12 celle/strati principali del corpus;
- 5 ricette per strato;
- totale indicativo: **60 ricette**;
- verificare plausibilità culinaria, ingredienti, quantità, istruzioni/praticità, nutrizione e classificazione.

Se emerge un difetto sistemico:

- correggere il generatore/modello;
- rigenerare le ricette impattate o l'intero corpus;
- ripetere il campione.

Non correggere 500 ricette manualmente una a una quando il problema è sistemico.

## 3.3 Release gate V1

Per taggare `v1.0.0` devono essere verdi:

- fresh-install bootstrap;
- pre-V1 reset → clean V1 bootstrap;
- catalog integrity;
- 500 recipe visibility;
- planner vertical scenarios;
- hard safety scenarios;
- effective plan flows;
- shopping/checklist;
- backup/export/delete essenziali;
- PWA install/offline shell;
- IT/EN key parity;
- accessibility critical checks;
- GitHub Pages deploy;
- nessun P0/P1 aperto.

Non bloccano V1:

- crescita a 1.500/3.000/4.000;
- full review 500/500;
- compatibilità con rc.1–rc.24;
- mantenimento di fixture iniziali;
- migrazione di database di test pre-release;
- ottimizzazioni non necessarie ai flussi principali;
- feature nuove non richieste dal vertical slice.

## 3.4 Release-candidate artifacts e promozione finale

Lo Step 3 produce prima il **freeze candidate**:

- package version `1.0.0-rc.27`;
- catalog version congelata a `1.0.0`;
- release manifest coerente con `releaseEligible=true`;
- freeze contract machine-readable;
- corpus 500 rigenerabile in modo deterministico;
- review stratificata 60/60 senza blocker automatici;
- backup/restore/delete essenziali;
- CI candidate gate e build GitHub Pages deployabile;
- checklist manuale finale.

Dopo l’accettazione manuale, la promozione stabile deve essere minimale:

- `1.0.0-rc.27` → `1.0.0`;
- registrazione dell’accettazione;
- **nessuna rigenerazione del catalogo**, nessun nuovo ID/schema/epoch;
- final release gate;
- tag `v1.0.0`.

---

# 4. Cosa viene esplicitamente rimosso dai gate correnti

Questa decisione sostituisce, per il percorso verso V1, i seguenti blocker precedenti:

| Gate precedente | Nuova decisione |
|---|---|
| Preservare record immutabili RC/dev | **Rimosso pre-V1** |
| Migrare dati delle build non rilasciate | **Rimosso pre-V1** |
| Human Review Gate 500/500 prima di procedere | **Sostituito da vertical product acceptance + review stratificata** |
| 3.000 ricette minimo per V1 | **Spostato post-V1** |
| 4.000 ricette planning target prima della release | **Spostato post-V1** |
| Controlled scale 500 → 1.500 prima di validare l'app | **Posticipato** |
| Proteggere fixture di Phase 1 | **Rimosso** |
| Rollback verso cataloghi RC/dev | **Non richiesto** |
| Supportare manualmente vecchi IndexedDB di test | **Reset automatico** |

I documenti precedenti restano utili come cronologia tecnica, ma **non devono più essere interpretati come gate superiori a questo piano**.

---

# 5. Protocollo operativo per i prossimi 3 step

Dato il limite del PC aziendale, il flusso di lavoro cambia.

Per ogni step:

1. partire dall'ultimo `main` pulito;
2. produrre direttamente una **patch completa** o uno **ZIP completo**;
3. includere nella patch anche dati generati, manifest e checksum necessari;
4. evitare procedure che richiedono molteplici script locali sul PC dell'utente;
5. usare GitHub Actions come ambiente ufficiale per test, browser regression e build;
6. se il workflow trova un problema, correggere il repository e produrre una nuova patch;
7. non chiedere all'utente di risolvere manualmente conflitti su grossi JSON generati;
8. se una patch diverge dal nuovo `main`, rigenerarla sulla nuova HEAD invece di fare merge manuali del catalogo.

Il risultato atteso per l'utente deve essere principalmente:

`applica patch / sostituisci repository → commit → push → osserva workflow`

non una procedura locale di build della corpus pipeline.

---

# 6. Ordine di priorità

Da questo momento l'ordine è:

1. **Catalogo leggibile e coerente**.
2. **Planner che genera piani corretti**.
3. **Hard constraints realmente rispettati**.
4. **Effective plan utilizzabile**.
5. **Shopping/prep corretto**.
6. **Persistenza/reload/offline**.
7. **UX blocker**.
8. **Release gate**.
9. **Solo dopo V1: scala corpus e compatibilità evolutiva**.

Non invertire nuovamente questo ordine per lavorare prima sulla crescita del corpus.

---

# 7. Definition of Done di V1

`yourDietManager v1.0.0` è pronta quando un utente può:

1. aprire l'app da installazione pulita;
2. configurare il proprio profilo e ciclo;
3. vedere e consultare il catalogo completo incluso nella release;
4. generare un piano multi-day rispettando i vincoli hard;
5. confermare il piano;
6. usarlo da Today/Calendar;
7. sostituire e ribilanciare pasti;
8. registrare adherence;
9. produrre e usare una shopping checklist;
10. chiudere e riaprire l'app senza perdere o corrompere lo stato;
11. usare l'app offline per i flussi supportati;
12. esportare/cancellare i dati locali essenziali.

La V1 **non** è definita dal numero massimo di ricette generate. È definita dal funzionamento end-to-end del prodotto con un corpus iniziale sufficiente e coerente.

---

# 8. Immediata prossima azione

Lo Step 3 è implementato come release-candidate freeze in `1.0.0-rc.27`. Durante la review stratificata è emerso un difetto sistemico nel corpus pre-freeze: la vecchia generazione poteva combinare ingredienti tassonomicamente validi ma culinariamente inadatti. Il corpus V1 è stato quindi rigenerato con un’allowlist esplicita per ruolo culinario e limiti di porzione, ottenendo 500 ricette deterministiche e coerenti con i gate automatici.

Il catalogo è già congelato a `1.0.0`; app/schema/persistenza restano fermi durante il test finale. Il test manuale deve seguire `V1_FINAL_TEST_CHECKLIST.md`.

Se GitHub Actions è verde e il test manuale non trova P0/P1, l’unica azione successiva è la **promozione stabile minimale**:

1. registrare manual acceptance = accepted;
2. promuovere app `1.0.0-rc.27` → `1.0.0`;
3. mantenere catalogo `1.0.0`, DB/schema e `v1-freeze-epoch-1` invariati;
4. eseguire il release gate stabile;
5. creare tag/release `v1.0.0`.

Non riprendere crescita corpus, nuove feature o compatibility work prima di questa decisione.
