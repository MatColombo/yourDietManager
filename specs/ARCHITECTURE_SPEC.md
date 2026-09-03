# Architecture Spec V1

## 1. Decisione architetturale

yourDietManager V1 resta una PWA statica, local-first e senza backend, ma usa **IndexedDB come database runtime strutturato**.

La separazione e obbligatoria:

```text
JSON catalog shards
= formato canonico di distribuzione/versionamento dei cataloghi base

IndexedDB
= database runtime locale, indicizzato e transazionale

JSON backup/export
= formato portabile dei dati utente e della configurazione
```

IndexedDB non sostituisce i JSON sorgente del catalogo: i cataloghi base devono poter essere ricostruiti integralmente dai JSON distribuiti.

La toolchain editoriale del corpus ricette e separata dal runtime PWA: `RecipeCorpusPolicy`, `RecipeCorpusSnapshot`, `RecipeCorpusOrchestrationRun` e `RecipeGenerationJob` sono artifact build-time/release e non store IndexedDB utente.

## 2. Architettura logica

```text
UI / PWA
  |
  +-- Application Services
  |     +-- Configuration Service
  |     +-- Catalog Service
  |     +-- Plan Service
  |     +-- Shopping Service
  |     +-- Backup Service
  |
  +-- Domain Engines (DOM-independent)
  |     +-- Nutrition Engine
  |     +-- Constraint Engine
  |     +-- Recipe Ranker
  |     +-- Plan Generator
  |     +-- Rebalance Engine
  |
  +-- Repository Layer
  |     +-- RecipeRepository
  |     +-- IngredientRepository
  |     +-- ConfigRepository
  |     +-- PlanRepository
  |     +-- OperationRepository
  |
  +-- IndexedDB `yourDietManager`
        +-- structured runtime stores

Static JSON catalog shards ----> Catalog Importer ----> IndexedDB
JSON backup <------------------ Backup Engine <------ IndexedDB
```

L'UI e i domain engine non devono chiamare direttamente `indexedDB.open()`, transaction o objectStore. Tutto l'accesso dati passa dal Repository Layer.

## 3. Dati distribuiti

File statici sotto `data/`:

```text
data/
  catalog-manifest.json
  ingredients/
    ingredient-families-0001.json
    ingredient-revisions-0001.json
  recipes/
    recipe-families-0001.json
    recipe-versions-0001.json
  locales/
    it.json
    en.json
```

I JSON sono immutabili per una specifica `catalogVersion` e accompagnati da checksum.

## 4. Database runtime

Database:

```text
name: yourDietManager
DB_VERSION: 1 iniziale
contentSchemaVersion: 1 iniziale
```

Store V1 raccomandati:

```text
meta
appConfigs
nutritionProfiles
allergyIntoleranceProfiles
foodPreferences
themeProfiles
mealClasses
dayClasses
cycles

ingredients
ingredientRevisions
recipes
recipeVersions
catalogPacks

planInstances
calendarDays
generationRuns
operations
shoppingChecklists
```

La separazione famiglia/versione per ingredienti e ricette e obbligatoria; vedere `IDENTITY_VERSIONING_SPEC.md`.

## 5. Indici minimi

Definire indici prima della UI, per evitare scansioni dell'intero catalogo.

### ingredientRevisions

- `ingredientId`
- `origin`
- `taxonomy.foodGroup`
- `allergenIds` multiEntry

### recipeVersions

- `recipeId`
- `origin`
- `mealArchetypes` multiEntry
- `calculatedNutrition.energyKcal`
- `calculatedNutrition.proteinG`
- `calculatedNutrition.fiberG`
- `practical.prepMinutes`
- `allergenIds` multiEntry
- `searchTokens` multiEntry oppure equivalente indicizzato

### calendarDays

- `[planInstanceId, date]` unique
- `planInstanceId`
- `date`

### operations

- `[planInstanceId, sequence]` unique
- `planInstanceId`
- `createdAt`

Gli indici sono una scelta runtime e non alterano il formato JSON canonico.

## 6. Catalog bootstrap

Prima installazione:

1. aprire IndexedDB;
2. caricare `catalog-manifest.json`;
3. verificare compatibilita app/schema;
4. scaricare gli shard necessari;
5. verificare checksum e JSON Schema;
6. importare in transazioni bounded/chunked;
7. impostare `activeCatalogVersion` solo dopo import completo;
8. rendere disponibile la UI catalogo.

L'app shell deve essere utilizzabile mentre il catalogo viene importato e deve mostrare progresso/retry senza bloccare la navigazione di configurazione.

## 7. Catalog update atomico

Un nuovo catalogo non deve sostituire quello attivo finche non e completamente valido.

Workflow:

```text
manifest nuovo
-> compatibility check
-> download shard cambiati
-> checksum/schema validation
-> staging/upsert base records
-> integrity checks
-> switch activeCatalogVersion
-> garbage collection sicura successiva
```

Record base storici ancora referenziati da un piano non vengono cancellati. Possono essere marcati `retired`.

Se l'update fallisce, il catalogo precedente rimane attivo.

## 8. Migrazioni IndexedDB

Distinguere:

- `DB_VERSION`: cambia solo quando cambiano store/indici;
- `contentSchemaVersion`: cambia quando cambia la forma logica dei record;
- `catalogVersion`: versione indipendente dei dati base;
- `backupFormatVersion`: versione indipendente del formato backup.

Usare `onupgradeneeded` solo per modifiche strutturali IndexedDB. Le migrazioni dati potenzialmente lunghe devono essere idempotenti, resumable e tracciate in `meta`.

Non cancellare mai store utente come scorciatoia di migrazione.

## 9. Moduli obbligatori

- `db`
- `repositories`
- `catalog-importer`
- `catalog-updater`
- `configuration-service`
- `nutrition-core`
- `constraint-engine`
- `recipe-ranker`
- `plan-generator`
- `effective-plan`
- `shopping-engine`
- `operation-history`
- `i18n`
- `theme-engine`
- `backup-engine`
- `migration-runner`

Ogni domain engine deve essere testabile senza DOM e senza IndexedDB reale tramite repository/in-memory adapters.

## 10. Assenza di hardcoding di prodotto

Sono ammessi hardcoded solo:

- enum/archetipi di dominio;
- limiti tecnici (es. ciclo max 31 in V1);
- algoritmi e default neutri;
- schema/store/index metadata.

Non sono ammessi hardcoded:

- classi giornata specifiche;
- orari specifici;
- calorie specifiche;
- ricette o ingredienti;
- colori delle giornate;
- sequenze di ciclo.

## 11. Routing ricette

Una sola vista dinamica:

```text
/recipes/?id=<recipeId>
```

Il record viene risolto da `RecipeRepository`, che restituisce la famiglia e la versione corrente o una `recipeVersionId` esplicita per lo storico.

## 12. Offline

Il service worker cachea app shell, manifest e shard/catalog pack installabili. IndexedDB contiene i record runtime.

Offline devono continuare a funzionare:

- configurazione;
- ricerca sul catalogo gia importato;
- generazione piano;
- calendario/Oggi;
- spesa;
- backup locale.

Il service worker non e il database e non deve essere usato come indice applicativo.

## 13. Sicurezza dei dati locali

Trattare anche i JSON statici/importati come input non fidato:

- validare schema prima dell'import;
- non renderizzare HTML proveniente dai cataloghi con `innerHTML`;
- sanitizzare eventuale markdown futuro;
- usare CSP compatibile con PWA statica;
- non eseguire codice contenuto nei dati.

Vedere `PRIVACY_DATA_LIFECYCLE_SPEC.md`.

## 13. Contratti store aggiuntivi

`catalogPacks` usa `schemas/catalog-pack.schema.json`; `shoppingChecklists` usa `schemas/shopping-checklist.schema.json`. Nessuno store V1 puo rimanere senza schema ed esempio canonico.

Indici runtime minimi aggiuntivi:

### catalogPacks

- `[catalogVersion, packId]` unique
- `status`

### shoppingChecklists

- `planInstanceId`
- `[planInstanceId, range.startCivilDate, range.endCivilDate]`
- `updatedAt`

La JSON Schema non sostituisce i controlli referenziali: importer/repository devono verificare pack membership, date-range ordering e riferimenti al piano.

## Phase 3 amendment — shard selection

I descrittori shard del `CatalogManifest` possono includere `recordIds`. Il Catalog Service usa questo metadata per risolvere gli shard di RecipeVersion necessari ai pack senza dover scaricare l'intero corpus. L'assenza di `recordIds` resta supportata come formato legacy con fallback full-shard.

## Phase 8 amendment — persistence, offline pack cache and rollback

The Phase 8 implementation advances the runtime database to `DB_VERSION=3` and the content migration level to `contentSchemaVersion=2`. Structural upgrades are additive: user stores are never dropped. Immutable ingredient/recipe revision stores add an `originAndCatalogVersion` compound index to support bounded catalog maintenance queries.

Catalog pack offline availability uses Cache Storage/service-worker transport for manifest/schema/shard bytes and IndexedDB for runtime entities. Cache Storage is not an application index or source of record identity.

Catalog updates maintain a journal and a rollback snapshot of mutable activation state. An update may stage immutable records before activation; failed or rolled-back updates must preserve those immutable records because historical plans can reference them. Rollback restores family pointers, pack activation and the previous manifest/version atomically; newly introduced families are retired rather than hard-deleted.

Runtime storage/integrity metrics are persisted in `meta`, including active catalog version, per-store counts, import duration, approximate storage usage/quota where available, and the last successful integrity check.
