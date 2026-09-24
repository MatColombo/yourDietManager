# Operations & History Spec V1

## 1. Obiettivo

Ogni modifica multi-record dell'utente deve essere atomica, auditabile e annullabile.

## 2. Operation

Campi minimi:

- `operationId`;
- `planInstanceId` opzionale;
- `sequence`;
- `kind`;
- `createdAt`;
- `before`/`after` snapshot bounded oppure patch reversibile;
- `undoneAt` opzionale;
- metadata UI minimi.

## 3. Transazione

Scrittura dei record modificati + operation avviene nella stessa transazione IndexedDB quando possibile.

## 4. Undo/redo

- undo applica before;
- redo applica after;
- una nuova operazione dopo undo invalida il ramo redo successivo;
- bulk edit/rebalance e una singola operation.

## 5. Limiti

Evitare snapshot dell'intero database per piccoli cambiamenti. Salvare solo i record coinvolti.

Per operazioni molto grandi, supportare payload compatti e un limite di retention configurabile, senza eliminare la possibilita di backup completo.

## 6. Structural calendar edit operations (Feature 8)

Confirmed-plan structural edits are history operations, not direct CalendarDay mutations.

Supported operation kinds:

- `calendar_day_add`;
- `calendar_day_modify`;
- `calendar_day_remove`.

Each operation must atomically capture the affected PlanInstance bounds, the source/proposed CalendarDay, any generated GenerationRun required by an add/modify action, relevant metadata, and the spill-over delta used for audit/UI display.

The source-day ownership invariant is mandatory: a meal with `dayOffset > 0` remains stored in its source CalendarDay. Calendar rendering projects it onto `civilDate`; an edit never moves that occurrence into the destination CalendarDay record.

Undo/redo must therefore restore/delete the source CalendarDay and its PlanInstance bounds as one mutation. The projected spill-over view changes automatically from the restored source record and must not be stored as a second copy.

Structural edits are blocked when recorded adherence would be invalidated, when production-batch allocations are attached, or when locked meals cannot be preserved by the requested edit. A remove operation must also re-evaluate frequency constraints before commit.
