# Recipe Catalog Spec V1

## 1. Principio

Le ricette sono dati JSON, non pagine e non codice.

Ogni RecipeVersion del catalogo e normalizzata a **una porzione standard pianificabile**. Recipe e RecipeVersion sono separate per garantire storico immutabile.

## 2. Record minimo

La famiglia `Recipe` contiene almeno `recipeId`, `origin`, `currentVersionId`, `status`, timestamp.

Ogni `RecipeVersion` contiene almeno:

- `recipeVersionId`
- `recipeId`
- `versionNumber`
- `supersedesVersionId` opzionale
- `schemaVersion`
- `catalogVersion` o null per contenuto user
- localized title/description/instructions
- `servingCount = 1`
- mealArchetypes
- ingredientLines con revision references
- calculatedNutrition per serving
- prep/cook time
- equipment/storage/transport metadata
- diet/flavor/cuisine tags
- allergen IDs derivati
- searchTokens
- calculationAlgorithmVersion
- inputDigest
- contentHash
- generation/provenance e quality status

## 3. Ingredient lines

Ogni linea usa `ingredientId` + `ingredientRevisionId`, quantita originale e quantita normalizzata canonica.

```json
{
  "ingredientId":"ing_salmon",
  "ingredientRevisionId":"ingrev_salmon_raw_v1",
  "amount":120,
  "unit":"g",
  "normalizedAmount":120,
  "normalizedUnit":"g",
  "optional":false
}
```

## 4. Nutrizione

`calculatedNutrition` e sempre ricalcolabile dalle ingredient lines.

Nessun LLM puo scrivere direttamente il valore nutrizionale finale come fonte autorevole.

## 5. Porzione

Il catalogo V1 conserva ingredienti **per una porzione**. `servingCount` della RecipeVersion standard e 1. Ogni linea deve congelare `ingredientRevisionId` e normalized amount.

Per meal prep si possono aggiungere `batchHints`, ma il generatore del piano assegna sempre una porzione standard per component.

## 6. Meal compatibility

Ogni ricetta dichiara almeno un archetype compatibile. In creazione/edit tutti gli archetipi sono selezionati per default; almeno uno deve rimanere selezionato. La stessa regola vale per gli ingredienti. MealArchetype e un registry di sistema chiuso.

Esempio:

```json
"mealArchetypes":["lunch","dinner","during_shift"]
```

Il ranking puo usare MealClass aggiuntive senza modificare il record base.

## 7. Practical metadata

Campi raccomandati:

- prepMinutes
- cookMinutes
- totalMinutes
- reheatingRequired
- coldSuitable
- portable
- fridgeRequired
- freezerSuitable
- mealPrepSuitable
- shelfLifeHours opzionale

## 8. Recipe components

Catalogare anche semplici componenti come ricette valide:

- frutto + frutta secca;
- insalata semplice;
- pane/contorno;
- yogurt bowl;
- verdura di accompagnamento.

Servono al solver per bilanciare il pasto senza scalare porzioni.

## 9. Localizzazione

Contenuto base language-neutral per nutrienti/tags. Testi:

```json
"i18n": {
  "it":{"title":"...","instructions":["..."]},
  "en":{"title":"...","instructions":["..."]}
}
```

## 10. Catalog packs

Il manifest puo organizzare ricette in pack logici:

- core
- quick
- high_protein
- vegetarian
- mediterranean
- international
- portable

Una ricetta puo appartenere a piu pack ma deve esistere una sola volta come record canonico.

## 11. Runtime catalog

I catalog shard sono importati in IndexedDB. RecipeRepository deve risolvere sia la versione corrente per browsing/generazione sia versioni storiche per piani esistenti. Catalog update non muta una RecipeVersion pubblicata.

## 12. Membership dei pack

La membership pack non vive in `RecipeVersion.tags` e non e dedotta da tag liberi. La fonte canonica e `CatalogManifest.packs[].recipeVersionIds`. Il runtime materializza lo stato di installazione in `catalogPacks` secondo `CATALOG_PACK_SPEC.md`.

Un `recipeVersionId` puo comparire in piu pack senza duplicare il record RecipeVersion. L'importer verifica che ogni riferimento pack risolva a una versione inclusa nella release del manifest. Il campo `RecipeVersion.catalogVersion` indica la release in cui quella versione immutabile e stata introdotta: una release successiva puo includere e riusare lo stesso record senza crearne una copia o una nuova versione. Sono vietati solo record che dichiarano una `catalogVersion` futura rispetto al manifest.


## 13. Reference-data IDs

RecipeVersion non deve contenere valori semantici liberi per cuisine, family, diet/practical/flavor/preparation tag o altre tassonomie usate dal motore. I campi corrispondenti persistono term ID canonici del Reference Data Registry.

L'editor Pass B usa un chip multi-select separato per ciascuna tassonomia. Le ingredient lines scelgono l'Ingredient family tramite ricerca e fissano la current/historical `ingredientRevisionId`; dopo la scelta, il selector di unita contiene soltanto basis unit e conversioni esplicite supportate da quella revisione. Non esiste fallback a unita digitate liberamente.

La UI puo mostrare label/alias localizzati. La pipeline puo introdurre un nuovo termine solo completando prima il flusso reference-data definito in `REFERENCE_DATA_TAXONOMY_SPEC.md`.

## 14. Modificabilita e versionamento

Tutte le ricette, indipendentemente dall'origine, sono modificabili dall'utente. La modifica non sovrascrive la RecipeVersion storica: crea una nuova versione corrente della stessa famiglia. `origin`/provenance descrivono la provenienza, non un divieto di modifica.

Alla prima modifica di una famiglia distribuita `origin=base`, il runtime mantiene lo stesso `recipeId`, crea una nuova RecipeVersion `origin=user`, avanza `currentVersionId` e promuove la famiglia a gestione locale. Gli update/rollback/install dei catalog pack devono preservare questo current pointer locale e non possono riattivare silenziosamente una versione base. Le RecipeVersion base precedenti restano disponibili per piani storici e audit.

La duplicazione resta un'azione distinta dalla modifica: crea una nuova Recipe family con nuovo `recipeId`.

## 15. Detail route e indipendenza dal piano

Il catalogo usa una route dinamica canonica `/recipes/<recipeId>`. Il dettaglio risolve la Recipe family e la current RecipeVersion (oppure una `recipeVersionId` storica esplicita) direttamente dai repository catalogo; non dipende da PlanInstance, CalendarDay o GenerationRun e deve funzionare anche quando non esiste alcun piano.

La route `/recipes/<recipeId>/edit` modifica la famiglia corrente tramite una nuova RecipeVersion. La UI puo mostrare origine, numero versione, storico e provenance, ma non puo nascondere l'azione Modifica in base a `origin`.

## Phase D4 — faceted discovery

Il catalogo ricette MUST supportare filtri combinabili per `product_food`, diet tag, practical tag e i filtri meal/nutrizione/tempo gia presenti. Il filtro `product_food` viene valutato sul grafo reale delle ingredient lines: una ricetta matcha quando almeno una IngredientRevision appartiene al nodo categoria/sottocategoria/concetto selezionato. Le card possono mostrare categorie prodotto derivate, ma gli ID tassonomici restano la sorgente autorevole.

Il catalogo ingredienti MUST supportare almeno testo, origin, `product_food` e stato tecnico (`raw|cooked|dry|...`). La ricerca concettuale non sostituisce la distinzione tecnica delle IngredientRevision: la nasconde solo quando l'utente sta esprimendo una categoria/preferenza.

## Phase D5 — contextual drill-down

Una ricetta materializzata in un CalendarDay MUST essere direttamente apribile dalla meal card senza passaggi intermedi. Il link include l'esatta RecipeVersion e un `return` contestuale al giorno/meal occurrence. Dal dettaglio ricetta ogni ingredient line apre l'esatta IngredientRevision e conserva a sua volta il percorso di ritorno alla ricetta.

Il ritorno finale al CalendarDay MUST ripristinare lo slot originario tramite anchor stabile `meal-<mealOccurrenceId>` e scroll contestuale. I return route interni vengono sanitizzati e non possono accettare URL esterni.
