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
