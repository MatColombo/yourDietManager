# Identity & Versioning Spec V1

## 1. Obiettivo

Garantire che modifiche future a ingredienti, ricette e cataloghi non cambino retroattivamente un piano gia generato.

## 2. Regola famiglia/versione

Usare una identita stabile di famiglia e record contenuto immutabili.

```text
Ingredient -> IngredientRevision
Recipe     -> RecipeVersion
```

Le famiglie possono cambiare il puntatore alla versione corrente. Le revisioni/versioni gia create non vengono mutate.

## 3. Ingredienti

`ingredientId` identifica il concetto stabile. `ingredientRevisionId` identifica una fotografia nutrizionale/tassonomica precisa.

Modificare nutrienti, stato, conversioni, allergeni o tassonomia crea una nuova IngredientRevision.

Una RecipeVersion deve memorizzare sia `ingredientId` sia `ingredientRevisionId` per ogni linea.

## 4. Ricette

`recipeId` identifica la famiglia. `recipeVersionId` identifica una versione immutabile.

Modificare ingredienti, quantita, istruzioni, practical metadata o qualsiasi dato che possa influenzare ranking/nutrizione crea una nuova RecipeVersion.

Il titolo tradotto non determina l'identita.

## 5. Provenienza e gestione locale

Ogni famiglia ha `origin = base | user`. `origin` descrive la provenienza/gestione corrente e non e un permesso di modifica.

- `base`: famiglia fornita dal catalogo distribuito e aggiornata dai catalog update finche non esiste un override locale;
- `user`: famiglia creata dall'utente oppure famiglia di catalogo promossa a gestione locale dopo la prima modifica.

Qualunque famiglia corrente e modificabile dall'utente. La prima modifica di una famiglia `base` mantiene lo stesso `ingredientId`/`recipeId`, crea una nuova `IngredientRevision`/`RecipeVersion` con `origin=user`, avanza il current pointer e promuove la famiglia a `origin=user`. Le revisioni/versioni storiche `base` restano immutate e risolvibili.

Un catalog update successivo non puo sovrascrivere il current pointer di una famiglia promossa localmente. Le nuove versioni base possono essere importate nello storico, ma l'override locale resta autorevole finche l'utente non sceglie esplicitamente un'azione futura di ripristino/adozione catalogo.

`Duplica` e un'azione distinta: crea una nuova famiglia `origin=user` con un nuovo ID stabile. Non e il meccanismo necessario per modificare contenuto di catalogo.

## 6. Riferimenti storici

- PlannedMeal -> `recipeVersionId`.
- RecipeVersion ingredient line -> `ingredientRevisionId`.
- Shopping calcola dalle revisioni/versioni referenziate nel piano, non dai current pointer.

## 7. Archive/delete

Preferire archive/retire al delete.

Delete fisico consentito solo se il record user non e referenziato da:

- recipe version;
- plan/calendar day;
- operation/history;
- backup staging/import.

Una versione base ritirata da un catalogo resta disponibile finche referenziata.

## 8. Content hash

Ogni record immutabile deve avere hash del contenuto strutturato canonico.

Usi:

- deduplica;
- audit;
- verifica import;
- detection di catalog corruption.

L'hash non sostituisce l'ID.

## 9. Catalog updates

Un catalog update puo:

- aggiungere famiglie;
- aggiungere revisioni/versioni;
- cambiare current pointer;
- marcare family/version come retired.

Non puo riscrivere il contenuto di un ID di versione gia pubblicato.
