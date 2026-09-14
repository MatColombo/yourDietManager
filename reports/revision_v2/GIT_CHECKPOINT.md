# Checkpoint del codice

`source-history.bundle` conserva un repository Git locale con due commit: l’archivio H allegato e la consegna R0/R1. Non è collegato a un servizio esterno.

Per consultare il confronto in una cartella separata:

```sh
git clone reports/revision_v2/source-history.bundle ../yourDietManager-history
```

`SOURCE_COMMIT.json` identifica i due commit. Questi metadati e il bundle sono aggiunti dopo il commit della consegna; non fanno parte della sua identità della build. Il controllo dei sorgenti è definito da `BUILD_MANIFEST.json`; il confronto con lo ZIP originario è in `DELIVERY_MANIFEST.json`.
