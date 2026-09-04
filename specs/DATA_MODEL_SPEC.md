# Data Model Spec V1

## 1. Convenzioni

- ID stabili, language-neutral e non derivati da titoli.
- Date civili ISO `YYYY-MM-DD`.
- Orari locali `HH:mm`.
- `dayOffset` intero >=0 per carry-over.
- Quantita canoniche in `g` o `ml` quando possibile.
- Record esportabili includono `schemaVersion`.
- Cataloghi includono `catalogVersion`.
- Timestamp ISO-8601 UTC per audit (`createdAt`, `updatedAt`).
- Oggetti persistiti devono essere structured-clone safe e JSON-serializzabili.

## 2. Identita, famiglia e versione

Ingredienti e ricette sono separati in **famiglia stabile** e **contenuto immutabile versionato**.

```text
Ingredient
  currentRevisionId -> IngredientRevision

Recipe
  currentVersionId -> RecipeVersion
```

Un piano non punta a una generica ricetta corrente: punta sempre a `recipeVersionId`. Una RecipeVersion punta sempre a specifici `ingredientRevisionId`.

La mutabilita percepita dall'utente vive sulla family/current pointer, non sugli immutable record. Qualunque family puo essere modificata: il sistema crea una nuova revision/version. Se la family proveniva dal catalogo (`origin=base`), la prima modifica mantiene lo stable family ID e promuove la family a gestione locale (`origin=user`), preservando tutti gli immutable record precedenti.

Vedere `IDENTITY_VERSIONING_SPEC.md`.

## 3. Entita configurazione

### AppConfig

Riferimenti a:

- locale/unita;
- theme profile;
- nutrition profile;
- allergy/intolerance profile;
- food preferences;
- meal classes;
- day classes;
- cycle;
- shopping settings.

### NutritionProfile

- `dailyEnergyKcal`;
- `energyTolerancePct`;
- target/range macro opzionali;
- fibra;
- preset nutrizionale;
- pesi soft;
- modificatori per archetipo giornata.

### DayClass

Classe creata dall'utente:

- nome;
- abbreviazione max 2 caratteri visuali;
- colore;
- `dayArchetype` hardcoded;
- finestre orarie opzionali;
- capabilities/context;
- `mealSlots`.

### MealClass

- nome;
- abbreviazione;
- `mealArchetype` hardcoded;
- preferenze specifiche;
- hard rule opzionali;
- target energetico relativo/assoluto opzionale.

### MealSlot

- `mealClassId`;
- `time`;
- `dayOffset`;
- `mode`: `planned` o `external`;
- budget nutrizionale;
- context override opzionale.

### Cycle

- lunghezza 1–31;
- array ordinato `cycleDay -> dayClassId`.

## 4. Entita catalogo

### Ingredient

Famiglia stabile:

- `ingredientId`;
- `origin`: `base | user`;
- `currentRevisionId`;
- `archived/retired`;
- metadata minimi di famiglia.

### IngredientRevision

Immutabile:

- `ingredientRevisionId`;
- `ingredientId`;
- `revisionNumber`;
- i18n name/aliases;
- basis/state;
- nutrition per 100 g/ml;
- taxonomy;
- allergenIds;
- conversions;
- provenance/quality;
- `contentHash`.

### Recipe

Famiglia stabile:

- `recipeId`;
- `origin`;
- `currentVersionId`;
- `archived/retired`.

### RecipeVersion

Immutabile:

- `recipeVersionId`;
- `recipeId`;
- `versionNumber`;
- `supersedesVersionId` opzionale;
- localized title/instructions;
- `servingCount = 1`;
- ingredient lines con `ingredientId` + `ingredientRevisionId`;
- normalized amount;
- calculated nutrition;
- practical metadata;
- taxonomy/tags/allergens;
- `calculationAlgorithmVersion`;
- `inputDigest`/`contentHash`;
- provenance/quality state.

## 5. Entita piano

### GenerationRun

Audit della generazione:

- `generationRunId`;
- generator/solver version;
- deterministic `seed`;
- `catalogVersion`;
- `configSnapshot` oppure snapshot hash + dipendenze congelate;
- horizon;
- diagnostics summary;
- createdAt.

### PlanInstance

- `planInstanceId`;
- `generationRunId`;
- start/end date;
- status;
- createdAt/updatedAt.

### CalendarDay

Materializzazione del ciclo su una data dietetica:

- `planInstanceId`;
- `date`;
- `cycleDay`/`dayClassId`;
- snapshot operativo di slot/orari necessari;
- planned meal assignments;
- stato aderenza/modifiche.

### PlannedMeal

Per ogni slot:

- stable meal occurrence ID;
- `mealClassId`;
- diet date;
- civil consumption date;
- time/dayOffset;
- `mode`;
- `recipeComponents`.

Ogni component automatico:

```json
{"recipeId":"...","recipeVersionId":"...","servings":1}
```

### Operation

Operazione utente atomica con before/after o patch reversibile, sequence e timestamp. Vedere `OPERATIONS_HISTORY_SPEC.md`.

## 6. Archetipi giornata V1

Enum fisso:

- `day`
- `morning`
- `afternoon`
- `night`
- `long_shift`
- `split_shift`
- `on_call`
- `rest`
- `free`

Gli archetipi forniscono segnali/default; gli slot reali sono definiti nella DayClass.

## 7. Archetipi pasto V1

Enum fisso:

- `breakfast`
- `lunch`
- `dinner`
- `snack`
- `mini_meal`
- `brunch`
- `pre_shift`
- `during_shift`
- `post_shift`
- `night_meal`

`external` e modalita slot, non meal archetype.

## 8. Hard vs soft

### Hard constraints

- allergie;
- intolleranze dichiarate;
- esclusioni volontarie configurate hard per automatic generation;
- incompatibilita fisica slot quando configurata hard;
- riferimenti a revisioni/versioni mancanti;
- ricette con dati strutturali/nutrizionali non validi.

### Soft constraints

- energia/macro/fibra entro tolleranza;
- preferenze alimentari;
- preferenze MealClass;
- varieta/frequenza;
- praticita;
- preferenze di distribuzione per archetipo giornata.

## 9. Snapshot e non-retroattivita

Modificare una configurazione o una ricetta non deve alterare retroattivamente un piano gia materializzato.

- recipe assignment congela `recipeVersionId`;
- recipe version congela `ingredientRevisionId`;
- generationRun congela configurazione/seed/catalogVersion;
- calendarDay conserva gli slot operativi necessari alla visualizzazione storica.

## 10. IndexedDB ownership

Il Data Model e indipendente da IndexedDB, ma ogni entita ha un repository runtime. Nessun modulo di dominio deve dipendere da keyPath/objectStore direttamente.

## 11. Entita catalog pack

`CatalogPack` materializza nel runtime la definizione del manifest e lo stato locale di installazione. La membership e espressa tramite `recipeVersionIds` canonici; non tramite tag RecipeVersion. `CatalogManifest` e la fonte distributiva, `catalogPacks` conserva stato installazione/errore/versione.

## 12. ShoppingChecklist

Entita utente persistita con range civile, moltiplicatore, timestamp del piano sorgente, item derivati e item manuali. Checked state e note appartengono alla checklist e non al piano.

## 13. Aderenza per meal occurrence

`CalendarDay.mealSlots[]` contiene `adherenceStatus` e note opzionali. `CalendarDay.status` e una sintesi della giornata e non sostituisce il dettaglio per slot.

## 14. Continuita piani

`PlanInstance.continuationPolicy` rende esplicito il comportamento a fine orizzonte. Segmenti successivi sono nuovi PlanInstance/GenerationRun collegati, mai estensioni mutanti dello snapshot storico.

## 15. Reference Data Registry (Data/UX Hardening Pass A)

I campi semantici riutilizzati dal motore sono reference ID canonici, non stringhe libere. Il runtime persiste `Taxonomy` e `TaxonomyTerm` in due store dedicati e distribuisce gli stessi record come shard catalogo versionati.

### 15.1 Taxonomy

Chiave: `taxonomyId`. Campi principali: `origin`, `hierarchical`, `extensibleBy`, `allowedConsumers`, `status`, label/description IT/EN e timestamp.

Le tassonomie V1 sono:

- `food_category`;
- `cuisine`;
- `recipe_family`;
- `diet_tag`;
- `practical_tag`;
- `flavor_profile`;
- `preparation_technique`.

### 15.2 TaxonomyTerm

Chiave: `termId`. Ogni termine dichiara `taxonomyId`, parent opzionale, label/description IT/EN, alias, `legacyKeys`, status, provenance, eventuale supersede e search token. Alias e legacy key servono a risolvere input/import; i record di dominio persistono solo `termId`.

### 15.3 IngredientRevision

`taxonomy` usa:

- `foodGroup` -> term ID `food_category`;
- `foodSubgroup` -> figlio diretto del gruppo o `null`;
- `flavorProfile` -> term ID `flavor_profile`;
- `mealArchetypes` -> registry chiuso, almeno un valore.

La gerarchia V1 valida la relazione group/subgroup; il matching delle regole resta esplicito: group confronta `foodGroup`, subgroup confronta `foodSubgroup`. Non esiste espansione ricorsiva implicita.

### 15.4 RecipeVersion

I tag semantici sono ID canonici per chiave:

- `family` -> `recipe_family`;
- `cuisine` -> `cuisine`;
- `diet` -> `diet_tag`;
- `flavor` -> `flavor_profile`;
- `practical` -> `practical_tag`;
- `preparation` -> `preparation_technique`.

`mealArchetypes` richiede almeno un valore, con la stessa semantica di IngredientRevision.

### 15.5 Configuration targets

FoodPreferences, AllergyIntoleranceProfile e MealClass possono contenere target verso ingredienti, allergeni, archetipi o taxonomy term secondo il `targetType`. Il service boundary deve verificare che il target appartenga al registry/tassonomia prevista prima della persistenza.

### 15.6 ReferenceDataProposal

`ReferenceDataProposal` e un artifact editoriale/build-time. Non e uno store IndexedDB. Permette alla corpus pipeline di proporre un termine mancante con parent, label IT/EN, alias, rationale, provenance e collision candidates; solo un proposal `approved` senza collisioni puo essere materializzato come TaxonomyTerm.

### 15.7 Versionamento e modifica ricette/ingredienti

Le singole IngredientRevision/RecipeVersion storiche sono immutabili. Ingredient e Recipe correnti sono invece modificabili indipendentemente da `origin`: una modifica crea una nuova revisione/versione e avanza il current pointer. Questa distinzione preserva piani e shopping storici senza introdurre un divieto UX per il catalogo base.

### 15.8 Migration 3

`contentMigration:3` risolve i valori legacy come `resolved_exact`, `resolved_alias`, `resolved_manual` o `unresolved`. `unresolved > 0` blocca la migrazione. Per record versionati crea nuove revisioni/versioni, preservando byte-for-byte le versioni storiche; le configurazioni mutabili vengono migrate atomicamente in place.

Vedere `REFERENCE_DATA_TAXONOMY_SPEC.md` e `../REFERENCE_DATA_FIELD_INVENTORY.md`.
