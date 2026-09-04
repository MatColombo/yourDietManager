# Reference Data & Taxonomy Registry Spec V1 Hardening

## 1. Scopo

Eliminare valori semantici impliciti, stringhe libere e conoscenza mnemonica dell'utilizzatore da tutti i flussi che alimentano filtri, regole, planner, corpus generator, ricerca o quality gate.

Regola fondamentale:

> Se un valore viene confrontato, filtrato, aggregato o interpretato dal sistema in un secondo momento, deve essere selezionato tramite un ID canonico appartenente a un registry esplicito. Non deve essere ridigitato come stringa libera.

Le label localizzate, gli alias e le legacy key servono all'interfaccia, alla ricerca, all'import e alla migrazione. Dopo la risoluzione, record persistiti e artifact della pipeline usano esclusivamente ID canonici.

L'inventario normativo dei campi e in `../REFERENCE_DATA_FIELD_INVENTORY.md`.

## 2. Classificazione dei dati di riferimento

Ogni dominio semantico dichiara la propria governance.

### 2.1 Registry di sistema chiusi

Sono definiti dal prodotto e non possono essere estesi automaticamente dalla pipeline ricette:

- allergen ID;
- MealArchetype;
- DayArchetype;
- ingredient state;
- canonical unit e conversion kind;
- enum tecnici di hard/soft constraint;
- altri enum necessari alla compatibilita dei contratti.

Le UI mostrano label IT/EN ma salvano l'ID canonico. Un valore sconosciuto e un errore, non una richiesta implicita di creare un nuovo enum.

### 2.2 Tassonomie curate ed estendibili

Possono crescere nel tempo tramite configuratori, processo editoriale o pipeline catalogo, secondo `extensibleBy`:

- gruppi e sottogruppi alimentari;
- cuisine;
- recipe family;
- diet tag non equivalenti ad allergeni;
- practical tag;
- preparation/cooking technique;
- flavor/profile tag quando usati dal motore;
- eventuali altre categorie semantiche introdotte con una revisione esplicita del contratto.

## 3. Registry V1 canonico

Il seed V1 contiene **7 tassonomie e 113 termini** in:

```text
public/data/reference-data/taxonomies-0001.json
public/data/reference-data/taxonomy-terms-0001.json
```

Tassonomie canoniche:

| taxonomyId | Gerarchica | Uso principale |
|---|---:|---|
| `food_category` | si | gruppi/sottogruppi IngredientRevision e regole alimentari |
| `cuisine` | no | classificazione RecipeVersion e coverage corpus |
| `recipe_family` | no | famiglia culinaria/strutturale della ricetta |
| `diet_tag` | no | classificazioni dietetiche non equivalenti ad allergeni |
| `practical_tag` | no | quick, portable, cold-suitable, meal-prep, ecc. |
| `flavor_profile` | no | profilo gustativo controllato |
| `preparation_technique` | no | tecnica di preparazione/cottura |

Esempi di ID canonici:

```text
food_group_fish_seafood
food_subgroup_fatty_fish
food_group_legumes
food_group_eggs
food_group_pasta_rice_cereals
food_subgroup_rice
cuisine_mediterranean
recipe_family_grain_bowl
diet_high_protein
diet_vegetarian
practical_quick
practical_portable
flavor_savory
prep_roast
```

Non dedurre mai l'ID dalla label visualizzata. Usare il registry.

## 4. Contratti persistiti

### 4.1 Taxonomy

`schemas/taxonomy.schema.json` definisce:

- `taxonomyId` stabile e language-neutral;
- `origin`: `base | user`;
- `hierarchical`;
- `extensibleBy`: subset di `user | editorial_pipeline`;
- `allowedConsumers`;
- `status`: `active | deprecated`;
- label/description localizzate, almeno IT/EN;
- timestamp.

### 4.2 TaxonomyTerm

`schemas/taxonomy-term.schema.json` definisce:

- `termId` stabile e language-neutral;
- `taxonomyId`;
- `origin`;
- `parentTermId` opzionale;
- label/description IT/EN;
- aliases IT/EN;
- `legacyKeys[]` per import/migrazione;
- `status`: `active | deprecated`;
- `supersedesTermId` opzionale;
- provenance strutturata;
- `searchTokens[]`;
- timestamp.

Gli alias e `legacyKeys` non sono valori alternativi persistibili nei record di dominio. Risolvono sempre a `termId`.

Durante una migrazione legacy e ammesso un cambio esplicito di `targetType` solo quando il valore storico non e valido per il tipo dichiarato, risolve senza ambiguita a un registry canonico compatibile con l'intento non-hard e la trasformazione viene registrata come `resolved_retyped_legacy`. Questo meccanismo non e un fallback runtime e non puo ampliare automaticamente regole hard/esclusive.

### 4.3 ReferenceDataProposal

`schemas/reference-data-proposal.schema.json` e un **artifact editoriale/build-time**, non un object store utente. Registra:

- taxonomy e proposed term ID;
- parent;
- label IT/EN e alias;
- rationale/provenance;
- collision candidate;
- stato `proposed | needs_review | approved | rejected | materialized`;
- eventuale `materializedTermId`.

La pipeline usa questo contratto per creare reference data prima di generare ricette che ne dipendono.

## 5. Persistenza runtime

Il Pass A introduce:

```text
DB_VERSION = 4
contentSchemaVersion = 3
```

Object store:

```text
taxonomies      keyPath taxonomyId
taxonomyTerms   keyPath termId
```

Indici `taxonomyTerms`:

- `taxonomyId`;
- `parentTermId`;
- `status`;
- `origin`;
- `[taxonomyId, status]`;
- `searchTokens` multiEntry.

I due store sono reference data autorevoli nel runtime. Il catalog manifest distribuisce gli shard e congela `referenceDataVersion` + `referenceDataDigest`.

## 6. Gerarchie e semantica di matching V1

Le tassonomie gerarchiche devono impedire:

- cicli parent/child;
- parent di tassonomia diversa;
- ID duplicati;
- collisioni ambigue tra label/alias/legacy key normalizzati;
- `supersedesTermId` inesistente o incoerente.

Esempio:

```text
food_category
└── food_group_fish_seafood
    ├── food_subgroup_fatty_fish
    ├── food_subgroup_lean_fish
    ├── food_subgroup_crustaceans
    └── food_subgroup_molluscs
```

### Matching V1

`IngredientRevision.taxonomy` mantiene esplicitamente:

- `foodGroup`: un term ID di livello gruppo;
- `foodSubgroup`: un term ID figlio diretto del gruppo, oppure `null`;
- `flavorProfile`: un term ID `flavor_profile`.

Per le regole V1:

- un target gruppo matcha **esattamente** `taxonomy.foodGroup === targetId`;
- un target sottogruppo matcha **esattamente** `taxonomy.foodSubgroup === targetId`;
- la gerarchia serve a validare parent/child e guidare i selector;
- non esiste matching ricorsivo implicito basato su label, prefissi o discendenti arbitrari.

Se in futuro servira `self_and_descendants`, deve essere introdotto come opzione contrattuale esplicita e testata, non dedotta dalla gerarchia.

## 7. Regola UI di destinazione

Il Pass A rende disponibili i repository canonici; il Pass B rende i widget guidati il percorso normale degli editor.

I configuratori/editor devono usare:

- autocomplete/search per reference entity;
- multi-select a chip per multi-reference;
- selector parent/child per tassonomie gerarchiche;
- select localizzate per registry di sistema;
- unit selector filtrato dalle conversioni realmente disponibili per l'ingrediente.

Campi tipo `Cucine (CSV)`, `tag (CSV)`, `foodGroup` testuale o `target` testuale non fanno parte dei normali flussi di editing. I service boundary continuano comunque a rifiutare valori che non risolvono a ID canonici: la UI guidata non sostituisce la validazione dati.

## 8. Meal archetype — semantica uniforme

Ingredienti e ricette usano lo stesso significato:

- il form di creazione deve partire con **tutti** i MealArchetype selezionati;
- almeno un archetype deve rimanere selezionato per poter salvare;
- tutti selezionati = compatibile con tutti;
- nessuno selezionato = stato invalido, mai equivalente a "tutti".

Gli schema IngredientRevision e RecipeVersion impongono entrambi `minItems: 1`.

MealArchetype resta un registry di sistema chiuso: la pipeline ricette non crea nuovi archetipi.

## 9. Pipeline ricette e creazione reference data

La generazione corpus deve creare/approvare i dati semantici necessari **prima** di usarli nelle ricette.

Flusso obbligatorio:

```text
corpus gap / candidate concept
        ↓
reference-data gap detection
        ↓
ReferenceDataProposal
        ↓
collision + hierarchy + localization + provenance validation
        ↓
approval/materialization of canonical TaxonomyTerm / supporting data
        ↓
registry version/digest update
        ↓
RecipeGenerationJob frozen to that version/digest
        ↓
recipe candidates with canonical IDs only
```

La pipeline non puo inserire in RecipeVersion/IngredientRevision una stringa semantica non presente nel registry per normalizzarla in seguito.

### 9.1 Auto-creazione consentita

Una policy editoriale puo consentire materializzazione solo quando:

- la tassonomia include `editorial_pipeline` in `extensibleBy`;
- non esiste match canonico/label/alias/legacy equivalente;
- parent e semantica sono non ambigui;
- label IT/EN obbligatorie sono complete;
- provenance e rationale sono registrati;
- la validazione del registry e verde.

In presenza di collisione la proposta passa a `needs_review`. Nessuna collisione viene risolta silenziosamente.

### 9.2 Registry chiusi

Per allergeni, MealArchetype, DayArchetype, ingredient state e altri registry chiusi:

- non creare nuovi termini;
- se il valore richiesto non esiste, bloccare candidato/job con diagnostica.

## 10. Creazione degli ingredienti necessari alla pipeline

Se una ricetta utile richiede un ingrediente assente, la pipeline puo creare Ingredient + IngredientRevision solo quando dispone di una fonte verificabile sufficiente per:

- nutrienti minimi;
- basis/state/unit;
- allergeni;
- tassonomia canonica;
- provenance e confidence richiesti dalla release.

Non e consentito inventare nutrienti, allergeni, conversioni o stato per sbloccare una ricetta.

## 11. Versionamento e snapshot

Ogni release catalogo congela:

- `referenceDataVersion`;
- digest canonico del registry;
- shard `taxonomies` e `taxonomyTerms`;
- provenance delle aggiunte create durante la pipeline.

Ogni `RecipeGenerationJob` **deve** includere `referenceDataVersion` e `referenceDataDigest`. La pipeline deve ricevere lo snapshot corrispondente e rifiutare l'esecuzione se versione/digest non sono risolvibili.

Un termine puo essere deprecato, non hard-deleted se referenziato da revisioni/versioni storiche. Le nuove versioni non devono assegnare termini deprecated salvo migration esplicita.

## 12. Migrazione legacy — content migration 3

La migrazione Pass A e idempotente/resumable e usa il marker:

```text
contentMigration:3
```

Classifica ogni mapping come:

- `resolved_exact`;
- `resolved_alias`;
- `resolved_manual`;
- `unresolved`.

`unresolved > 0` blocca la migrazione e il release gate. Non esistono fallback silenziosi.

Esempi coperti:

```text
legacy "fish"
→ food_group_fish_seafood

legacy group "grains" + subgroup "rice"
→ resolved_manual food_group_pasta_rice_cereals + food_subgroup_rice
```

La migrazione **non muta** IngredientRevision o RecipeVersion storiche. Quando un record corrente deve cambiare riferimento semantico:

1. crea una nuova IngredientRevision/RecipeVersion;
2. mantiene intatto il record precedente;
3. avanza il current pointer della family;
4. ricalcola digest/hash dove previsto.

Le configurazioni utente mutabili vengono invece migrate atomicamente in place.

Il marker conserva summary/sample dei mapping e l'elenco unresolved per audit.

## 13. Editing e immutabilita storica

`origin` non deve determinare se l'utente puo modificare una ricetta/ingrediente corrente. Base e user sono modificabili come **entita correnti**; il salvataggio crea sempre una nuova revisione/versione e preserva quella storica.

Pass D implementa questo comportamento nella UX: detail/edit sono indipendenti dal piano, Edit e disponibile per qualunque origin e la prima modifica di una family distribuita crea un override locale versionato senza mutare lo storico.

## 14. Quality gates

Per una release production devono valere almeno:

- zero semantic free-text values nei campi reference-driven;
- zero taxonomy/reference ID non risolti;
- zero parent cycle;
- zero cross-taxonomy parent reference;
- zero nuove assegnazioni a termini deprecated;
- zero modifiche non autorizzate a registry di sistema chiusi;
- 100% label IT/EN per termini pubblicati;
- 100% reference-data additions con provenance/rationale;
- digest del registry coerente col manifest;
- ogni termine usato da una ricetta esiste nello snapshot reference-data precedente all'accettazione della ricetta;
- ogni ingrediente creato dalla pipeline supera i normali quality gate ingredienti prima di essere utilizzato;
- `RecipeGenerationJob` congela versione/digest del reference registry.

## 15. Configuratori — Pass B implementato

Il Pass B introduce `Configura -> Tassonomie / Dati di riferimento` e selector guidati che consentono, secondo governance:

- consultazione e ricerca;
- aggiunta/modifica dei termini estendibili;
- assegnazione gerarchica gruppo/sottogruppo alla creazione dei termini food-category;
- alias;
- visualizzazione provenance;
- prevenzione di duplicati e riferimenti non validi.

I registry chiusi possono essere visualizzati/localizzati ma non modificati come normali tassonomie utente.

La deprecazione di un termine già referenziato richiede una migration esplicita e non è un'azione ordinaria del configuratore Pass B. Non è consentito trasformare un click di archivio in una reference rotta.

Nei form operativi:

- ingredienti e target entity usano autocomplete che persiste l'ID selezionato e non il testo digitato;
- categorie alimentari usano selector gruppo/sottogruppo parent-aware;
- family/cuisine/diet/flavor/practical/preparation di RecipeVersion usano chip multi-select su una singola tassonomia nota;
- le righe ingrediente di RecipeVersion offrono solo unità supportate dalla basis/conversion dell'IngredientRevision selezionata;
- ingredient state, allergeni e MealArchetype mostrano label localizzate ma persistono ID chiusi;
- gli alias restano testo descrittivo/search e usano un token editor, non un campo semantico CSV.


## 15. 4P-A production intake resolver

The production pilot ledger may contain descriptive labels only as build-time `referenceRequests`; these labels are never persisted as domain references.

For taxonomy requests the resolver must:

1. reuse exactly one existing canonical term when ID/label/alias resolves uniquely;
2. create a `ReferenceDataProposal` only for an active taxonomy extensible by `editorial_pipeline`;
3. set `needs_review` on collisions instead of choosing a term heuristically;
4. require explicit proposal approval before materialization;
5. recalculate the registry digest after materialization;
6. keep the recipe candidate blocked until the intake references the materialized canonical ID.

Ingredient requests use the same no-implicit-resolution principle, but additionally require the resolved current IngredientRevision to pass the production `curated/high` gate.
