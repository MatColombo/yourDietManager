# JSON & IndexedDB Storage Spec V1

## 1. Obiettivo

Usare **JSON come contratto canonico e formato di scambio**, e **IndexedDB come persistenza runtime locale**.

Questa distinzione e vincolante:

- catalogo base: JSON shard versionati -> import IndexedDB;
- dati utente: record JSON-serializzabili persistiti in IndexedDB;
- backup/export: JSON;
- runtime query/search/history: IndexedDB.

## 2. Struttura cataloghi

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

Ogni shard deve essere autonomamente valido e contenere un array omogeneo di record.

## 3. Manifest

Il manifest dichiara almeno:

- `catalogVersion`;
- `schemaVersion`;
- locali disponibili;
- conteggi famiglia/versione;
- shard;
- checksum SHA-256;
- data build;
- compatibilita minima/massima app quando necessario;
- pipeline/calculation version usate per produrre il catalogo.

## 4. Sharding

Default raccomandato:

- famiglie ingredienti: 250–1000/shard;
- revisioni ingredienti: 250–500/shard;
- famiglie ricette: 250–1000/shard;
- versioni ricetta: 250–500/shard.

Target indicativo shard: circa 0,5–2 MiB non compresso. Lo sharding serve a update, caching e import incrementale; dopo l'import le query runtime usano IndexedDB.

## 5. Dati personali

I dati personali non vivono piu in `localStorage` come blob monolitici. Ogni entita viene persistita nel relativo object store IndexedDB come plain object JSON-serializzabile.

`localStorage` puo essere usato solo per bootstrap non sensibile e non autorevole, ad esempio:

- preferenza tema necessaria prima dell'apertura DB;
- locale UI pre-bootstrap;
- flag transitori non critici.

La perdita di `localStorage` non deve causare perdita del piano o della configurazione.

## 6. Backup

Il backup e una serializzazione portabile degli store utente e delle dipendenze custom necessarie.

Struttura concettuale:

```json
{
  "format": "yourDietManager-backup",
  "formatVersion": 1,
  "appVersion": "1.x",
  "dbSchemaVersion": 1,
  "contentSchemaVersion": 1,
  "catalog": {
    "catalogVersion": "1.0.0"
  },
  "createdAt": "ISO-8601",
  "payload": {
    "configuration": {},
    "customIngredients": [],
    "customIngredientRevisions": [],
    "customRecipes": [],
    "customRecipeVersions": [],
    "plans": [],
    "calendarDays": [],
    "operations": [],
    "shoppingChecklists": []
  },
  "sha256": "..."
}
```

Non duplicare nel backup completo tutti i record base se sono ricostruibili dal catalogo e compatibili; includere invece le versioni base storiche necessarie quando il catalogo corrente non le garantisce piu.

## 7. Canonical JSON

Per hash/deduplica:

- UTF-8;
- chiavi ordinate lessicograficamente nel canonicalizer;
- niente `undefined`;
- numeri finiti;
- precisione controllata senza trailing noise;
- niente commenti;
- date ISO.

## 8. IndexedDB transactions

Usare transazioni atomiche per:

- creazione/modifica con nuova revisione/versione;
- operazioni calendario multi-record;
- import backup;
- switch catalogVersion;
- undo/redo.

Non spezzare un'operazione logica in scritture indipendenti che possono lasciare stato parziale.

## 9. Evoluzione schema

Ogni record include `schemaVersion` quando e un contratto di dominio esportabile. IndexedDB mantiene inoltre metadata di database e migration marker.

Migrazioni:

- pure quando possibile;
- idempotenti;
- testate su fixture di versioni precedenti;
- mai distruttive per default;
- con journal/resume se richiedono piu transazioni.

## 10. Cataloghi base immutabili

I record base distribuiti sono immutabili per identita/versione. Ingredienti e ricette custom vivono negli stessi repository ma con `origin = user` e ID separati.

Il `catalogVersion` memorizzato su IngredientRevision/RecipeVersion base identifica la release di prima introduzione del record immutabile, non obbliga a ricreare quel record a ogni release. Un manifest successivo puo includere shard contenenti record introdotti in release precedenti, purche identita e `contentHash` restino invariati.

Un catalog update:

- puo aggiungere nuove versioni;
- puo cambiare il puntatore `currentVersionId`/`currentRevisionId` del record base;
- non deve mutare una versione storica gia referenziata;
- non deve sovrascrivere record user.

## 11. Quota e persistenza browser

All'avvio e durante import catalogo usare quando disponibile:

- `navigator.storage.estimate()` per quota/uso;
- `navigator.storage.persist()` come richiesta opzionale di persistenza.

Se lo spazio non e sufficiente, mostrare una diagnostica prima di iniziare un import che non puo completarsi.

## 12. Recovery

Il catalogo base deve poter essere ricostruito dai JSON senza cancellare dati utente.

Prevedere azioni distinte:

- rebuild catalog indexes/base data;
- export backup;
- import backup;
- clear generated plan/history;
- delete all personal data.

Mai usare "cancella tutto il database" come recovery ordinario.
