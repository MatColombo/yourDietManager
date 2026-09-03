# Shopping Checklist Spec V1

## 1. Scopo

`ShoppingChecklist` e la materializzazione persistita di una lista spesa derivata dal piano, arricchita da stato utente. Non e una fonte nutrizionale.

## 2. Identita e range

Ogni record ha `checklistId`, `planInstanceId`, range `startCivilDate`/`endCivilDate`, `peopleMultiplier`, `sourcePlanUpdatedAt`, timestamp. Il range e inclusivo e usa date civili.

## 3. Item derivati

Gli item `kind=derived` richiedono `ingredientId`, quantita, unita e riferimenti `sourceMealOccurrenceIds`. Sono ricalcolabili dal piano e dalle RecipeVersion congelate.

## 4. Item manuali

Gli item `kind=manual` conservano label, checked, quantita/unita opzionali e note. Non hanno sorgenti meal occurrence obbligatorie e non entrano nel piano.

## 5. Refresh

Se `PlanInstance.updatedAt` e successivo a `sourcePlanUpdatedAt`, la checklist e stale. `Aggiorna da piano` rigenera soltanto la parte derived. Checked state/note vengono trasferiti quando l'identita semantica dell'item e univoca; item manuali sono preservati sempre.

## 6. Concorrenza

Aggiornamenti di checked/note sono normali write IndexedDB atomiche. Un refresh deve operare su una copia calcolata e sostituire il record in una singola transazione per evitare checklist meta-aggiornate.

## 7. Delete/export

Le checklist sono dati utente: incluse nel backup, eliminabili senza alterare il piano e ripristinabili da backup.

## 8. Catena piani

Il range civile puo includere meal occurrence provenienti da piu segmenti concatenati. `planInstanceId` identifica il segmento attivo al momento della creazione/refresh; `sourcePlanUpdatedAt` usa il timestamp globale della catena effettiva per rilevare modifiche a qualunque segmento contribuente.
