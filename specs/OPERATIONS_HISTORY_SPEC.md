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
