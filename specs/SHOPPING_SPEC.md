# Shopping Spec V1

## 1. Principio

La dieta viene pianificata per una persona nutrizionalmente. La lista della spesa puo essere moltiplicata per un numero di persone equivalenti indipendente.

## 2. Moltiplicatore

Campo:

```json
"shoppingPeopleMultiplier":2.1
```

Range V1 consigliato: 0.1–20.0.

Non deve modificare i nutrienti o le porzioni del piano.

## 3. Calcolo

Per ogni recipe component pianificata, risolvere la `recipeVersionId` storica tramite RecipeRepository e usare le ingredientRevision/quantita congelate:

```text
shopping amount = frozen RecipeVersion line amount * shoppingPeopleMultiplier
```

Somma per ingredientId, unita canonica e stato compatibile.

## 4. External slots

Esclusi dalla spesa.

## 5. Date

Intervalli rapidi consigliati:

- oggi;
- domani;
- prossime 48h;
- prossimi 5 giorni;
- prossimi 7 giorni;
- custom range.

Usare data civile di consumo per includere correttamente carry-over notturni.

## 6. Rounding

V1 puo mostrare quantita esatte e arrotondare solo a livello display configurabile. Packaging commerciale/confezioni e una feature successiva.

## 7. Query runtime

ShoppingEngine recupera CalendarDay per data civile e risolve RecipeVersion/IngredientRevision dai repository IndexedDB. Non deve usare la versione corrente di una ricetta se il piano punta a una versione storica.

## 8. Checklist persistita

La lista calcolata puo essere materializzata come `ShoppingChecklist` per conservare stato `checked`, elementi manuali e note. La fonte nutrizionale resta il piano: la checklist non modifica CalendarDay o RecipeVersion.

Ogni checklist congela:

- `planInstanceId`;
- range di **date civili**;
- `peopleMultiplier` usato;
- `sourcePlanUpdatedAt` per rilevare staleness;
- item derivati con `ingredientId`, quantita/unita e `sourceMealOccurrenceIds`;
- item manuali, che non richiedono ingredientId e non partecipano ai calcoli del piano.

Se il piano cambia dopo `sourcePlanUpdatedAt`, la UI marca la checklist come da aggiornare. Il refresh ricalcola gli item derivati preservando, quando la corrispondenza e univoca, checked state e note; gli item manuali vengono sempre preservati.

Vedere `SHOPPING_CHECKLIST_SPEC.md` e `schemas/shopping-checklist.schema.json`.

## 9. Preparation horizon

La vista preparazione usa un intervallo di **date civili** (V1: 1, 2, 3, 5 o 7 giorni) e mostra soltanto i componenti ricetta dei meal occurrence `planned` consumati in quell'intervallo.

Per ogni occurrence deve risolvere la `recipeVersionId` storica congelata nel piano e mostrare i metadata `practical` e le istruzioni di quella versione, inclusi almeno:

- `prepMinutes` e `cookMinutes`;
- `mealPrepSuitable`;
- `fridgeRequired` / `freezerSuitable`;
- `reheatingRequired` / `coldSuitable`.

Gli slot `external` non generano attivita di preparazione. Un carry-over appartiene al giorno della sua `civilDate`, non alla data dietetica sorgente.

Il preparation horizon V1 e una vista derivata e non introduce un nuovo record persistito: non modifica RecipeVersion, CalendarDay o ShoppingChecklist. Eventuali task/prep batch persistenti sono fuori scope V1.

## 10. Effective-plan chain e staleness

Una lista civile puo attraversare il confine tra due `PlanInstance` concatenate. Il runtime usa la catena effettiva del piano attivo e conserva nella checklist il `planInstanceId` del segmento attivo al momento della materializzazione.

`sourcePlanUpdatedAt` rappresenta il timestamp globale dell'ultima mutazione della catena effettiva (`planUpdatedAt`, con fallback al piu recente `PlanInstance.updatedAt`). In questo modo anche una modifica a un segmento precedente rende stale una checklist che ne usa meal occurrence.
