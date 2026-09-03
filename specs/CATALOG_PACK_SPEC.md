# Catalog Pack Spec V1

## 1. Scopo

I catalog pack consentono installazione selettiva/offline di sottoinsiemi logici del catalogo senza duplicare RecipeVersion.

## 2. Fonte canonica

`catalog-manifest.json` dichiara `packs[]`. Ogni pack ha `packId`, chiavi i18n label/description, flag `required`, `estimatedBytes` e `recipeVersionIds`. La membership e versionata con `catalogVersion`.

## 3. Runtime

Lo store IndexedDB `catalogPacks` materializza la definizione attiva e lo stato: `available | installing | installed | failed | retired`, con timestamp e ultimo error code opzionale.

## 4. Installazione

Prima di installare un pack:

1. verificare compatibilita manifest;
2. verificare storage estimate/quota quando disponibile;
3. risolvere gli shard necessari;
4. checksum + schema validation;
5. import transazionale/chunked;
6. verificare tutti i `recipeVersionIds`;
7. marcare `installed` solo a completamento.

Un fallimento non rende parzialmente attivo il pack.

## 5. Core pack

Almeno un pack `required=true` deve rendere l'app funzionale per la generazione base. I pack opzionali ampliano coverage, non cambiano semantica di ricette gia presenti.

## 6. Disinstallazione

Disinstallare un pack non elimina RecipeVersion ancora richieste da altri pack installati o referenziate da piani storici. La garbage collection e reference-aware.

## 7. Validazione

La Schema valida la forma; l'importer valida unicita `packId`, esistenza dei recipeVersionIds, coerenza catalogVersion e assenza di riferimenti a shard/versioni incompatibili.

## 8. Risoluzione shard V1

Per rendere realmente selettiva l'installazione dei pack, ogni descrittore shard del manifest puo dichiarare `recordIds`, l'elenco degli ID contenuti nello shard. Per `recipeVersions` l'importer usa questo indice distributivo per scaricare solo gli shard che intersecano i `recipeVersionIds` dei pack richiesti. Se un manifest legacy non dichiara `recordIds`, il fallback compatibile e scaricare tutti gli shard della parte e filtrare dopo la validazione.

Ingredient families e IngredientRevision formano il catalogo ingredienti di base e V1 puo importarli integralmente; i pack controllano l'attivazione/offline delle RecipeVersion. Le Recipe family necessarie vengono importate insieme alle versioni installate.
