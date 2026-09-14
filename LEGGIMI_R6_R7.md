# yourDietManager — consegna R6/R7

Versione di sviluppo **1.1.0-dev.r7**. Include R0–R5 e le modifiche R6/R7. Non è una release stable: accettazione browser, catalogo mediterraneo R5 e matrice core completa restano aperti.

## Cosa cambia

- **Spesa:** reparto e alimento generico con forme separate; scelta facoltativa di una conversione di acquisto verificata e con fonte; anteprima del fattore e del risultato. Ordine reparti salvato. Moltiplicatore persone limitato agli acquisti.
- **Checklist:** obsolescenza basata sui dati di acquisto, non sull'aderenza o sulle note del pasto. Quantità aumentate da verificare, note e righe manuali conservate. Esportazione testuale e anteprima di stampa del periodo selezionato; esterni ignoti esclusi esplicitamente.
- **Backup:** formato 3 autosufficiente, con catalogo installato, versioni storiche, profili, famiglie, mapping, conversioni, history e checklist. Ripristino su catalogo diverso senza richiederne il download. Verifica di schema, checksum, riferimenti e collisioni; confronto transazionale prima della sostituzione. Copia precedente scaricabile anche dopo reload. Reader dei formati 1/2 mantenuto, con il catalogo originario necessario.
- **Aggiornamenti e diagnostica:** DB 8 protegge dai writer precedenti; shell e schemi appartengono alla versione installata. Diagnostica locale esportabile con versioni, contatori e codici, senza nomi di regole, allergie, note o stack.
- **R7:** regressioni, benchmark riproducibile, dossier collegato ai requisiti e gate automatico che resta bloccato se il core è incompleto.

## Avvio e aggiornamento

Il sorgente è nella cartella principale; `dist/` contiene la PWA statica costruita. Con Node disponibile, `npm run dev` avvia l'ambiente locale e `npm run build` ricostruisce `dist/`. Servire tramite HTTP/localhost o HTTPS, non aprire index.html con file://. Per sottopercorsi usare il build con `YDM_BASE_PATH` documentato nel progetto.

Prima di aggiornare un'installazione usata, esportare il backup dalla versione attuale. Il nuovo worker attende che le vecchie schede siano chiuse; dopo aver conservato eventuali modifiche non salvate, chiuderle e riaprire l'app. Non cancellare IndexedDB per aggiornare. Se compare l'indicazione di client obsoleto, ricaricare. Questi passaggi richiedono ancora la prova su browser reale prima di un rilascio agli utenti.

In **Backup**, scegliere il file: dopo validazione viene chiesta la conferma del ripristino. Il limite è 64 MiB. Gli ID immutabili con contenuto divergente sono rifiutati. Dopo il ripristino è disponibile **Scarica copia precedente all’ultimo ripristino**. Il backup contiene dati personali: la diagnostica è un export distinto e ridotto.

## Comandi e prove

Consegna verificata: **315 test automatici su 43 file**, zero fallimenti, annullamenti o skip. La matrice core ha **3/74 scenari completi**: le altre sottoprove non sono state promosse artificialmente.

- `npm run revision:v2:test`: regressioni della revisione; `npm run revision:v2:regression` esegue l’intera suite e aggiorna i log usati dal dossier. Su ambienti senza `/tmp`, impostare TMPDIR a una cartella scrivibile.
- `npm run revision:v2:benchmark`: workload sintetico da 10.000 ricette; campioni e ambiente in `reports/revision_v2/R7/performance.json`.
- `npm run revision:v2:trace`: verifica dei collegamenti, digest ed evidenze.
- `npm run revision:v2:gate`: **exit code 2 atteso** finché il core è bloccato. Non è un comando di pubblicazione.
- `npm run revision:v2:dossier`: rigenera la matrice dalle evidenze complete della suite; non inventa test mancanti. I log inclusi sono la prova della consegna.

Specifiche vincolanti: `specs/revision_v2/CONTRATTO_R6_R7.md`. Collegamenti completi: `MATRICE_R6_R7.md`, `TRACEABILITY.json`, `TEST_REGISTRY.json`. Stato autorevole: `reports/revision_v2/STATE.json` e `R7/core-gate.json`.

## Limiti espliciti

Browser autorizzato bloccato in questa sessione di lavoro: nessuna certificazione di focus, stampa reale, reload offline, rete, quota/interruzione o due tab IndexedDB. Non è stato usato un browser alternativo per aggirare il blocco. I test automatici in memoria non chiudono questi scenari.

R5 mantiene 200 concetti/307 forme e 120 proposte di piatti in staging, ma nessuna forma approvata: pilot e scala richiedono revisioni nutrizionali, di sicurezza e culinarie autentiche. Non sono stati pubblicati nuovi ingredienti o piatti mediterranei. I tempi su ricette sintetiche non costituiscono accettazione del catalogo né della UI. R8 e promozione stable non sono state eseguite.
