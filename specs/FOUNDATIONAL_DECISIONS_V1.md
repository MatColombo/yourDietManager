# Foundational Decisions V1

Questo documento registra decisioni che devono essere considerate gia risolte prima dell'implementazione.

## 1. Persistenza

- JSON shard = distribuzione/versionamento del catalogo base.
- IndexedDB = runtime store strutturato.
- Repository Layer = unico accesso applicativo ai dati.
- JSON backup = portabilita utente.
- localStorage = solo cache/bootstrap non autorevole.

## 2. Identita storica

Ingredienti e ricette usano famiglia stabile + revisioni/versioni immutabili. Piani esistenti non cambiano quando viene aggiornata la versione corrente.

## 3. Catalog updates

Aggiornamenti catalogo sono staged, verificati con schema/checksum/reference integrity e attivati atomicamente. Failure mantiene il catalogo precedente.

## 4. Migrazioni

Separare DB_VERSION, contentSchemaVersion, catalogVersion e backupFormatVersion. Migrazioni dati lunghe devono essere idempotenti/resumable.

## 5. Solver

Ogni generazione ha seed, solver/generator version, catalogVersion e config snapshot/hash. Lo stesso input deve essere riproducibile e avere diagnostica comprensibile.

## 6. Provenance

Nutrienti ingrediente e recipe generation conservano provenance/quality metadata. Un LLM non e fonte autorevole dei nutrienti finali.

## 7. Unita e stati

Canonical nutrition in g/ml; conversioni esplicite e revisionate. Nessuna conversione automatica crudo/cotto. Measurement system e solo display/input layer.

## 8. Tempo

AppConfig include IANA timezone. Carry-over deriva da dayOffset; il browser timezone e soltanto default iniziale.

## 9. Privacy

Nessun backend V1. Allergie/profilo/piano restano locali; export e delete sono espliciti. Nessun dato sensibile in URL o telemetria di default.

## 10. Performance

Target 10k RecipeVersion: IndexedDB indexes, candidate retrieval bounded, liste virtualizzate, niente full catalog scan/render ad ogni interazione.

## 11. Operations

Bulk edit, rebalance e modifiche calendario sono transazioni atomiche con undo/redo. Non salvare stato parziale.

## 12. Recovery

Separare rebuild catalogo base da delete user data. Il catalogo base deve poter essere rigenerato dai JSON senza cancellare configurazione, ricette custom o piani.

## 13. V1 deliberate deferrals

- backend/account/cloud sync;
- database server;
- collaboration multi-user;
- immagini ricette;
- automatic external food APIs;
- product barcode catalog completo;
- clinical recommendation engine;
- commercial packaging optimization avanzata.
