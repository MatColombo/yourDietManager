# R6 — implementazione consegnata, gate bloccato

Spesa e checklist usano forme, conversioni esplicite e digest materiale. Backup 3 porta tutti gli store e lo storico, con ripristino protetto, metadata selezionati e copia di recupero. Writer DB 8, shell 41/dati 21. Diagnostica mediante allowlist locale.

Evidenze automatiche: `../R7/evidence/suite/revision-v2-r6-r7.test.log` e suite completa. Inclusi caso sintetico 100 g secchi + 150 g cotti → 160 g secchi, quantità aumentate, note/aderenza, periodi, conversioni rifiutate, backup su catalogo diverso, catalogo reale allegato, formati 1/2, corruzione e collisioni, confronto concorrente, metadata history malevoli, diagnosi senza marker sensibili e ciclo di connessione con stub. L'uso di stub e repository in memoria è dichiarato nei test.

Restano da eseguire le prove reali browser, stampa, due tab, quota/interruzione, recovery dopo reload, rete e offline. R5 non fornisce ancora il catalogo di accettazione revisionato. Perciò la fase non è COMPLETATA. Il codice non pubblica dati di staging e non modifica i nutrienti del piano tramite la spesa.
