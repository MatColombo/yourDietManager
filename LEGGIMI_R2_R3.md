# yourDietManager — consegna R0–R3

Build di sviluppo **1.1.0-dev.r3**, cumulativa delle modifiche R0/R1. Estrarre il progetto e avviare `npm run dev`; per creare l'artifact statico usare `npm run build`. La cartella `dist` contiene la build già generata. Servire l'app tramite HTTP: non aprire `index.html` come file locale.

Novità: alimenti generici con forme selezionabili, ricerca estesa agli ingredienti delle ricette, titoli brevi, ricette senza procedimento, autore italiano con fallback EN, preferenze numeriche e Mai, sicurezza per alimento/gruppo/forma, motore con frequenze e validazione comune dei cambi al piano.

La migrazione è additiva e non richiede cancellazione dei dati. Non usare reset/clear-site-data per aggiornare un'installazione esistente. Il backup conserva lo storico V1; l'export ordinario personale trasferisce i record correnti nel formato 2.

Documenti di ingresso:

- `specs/revision_v2/CONTRATTO_R2_R3.md`: specifica vincolante dell'implementazione.
- `specs/revision_v2/MATRICE_R2_R3.md`: collegamenti revisione → requisito → attività → file → prove.
- `reports/revision_v2/R2/REPORT.md` e `R3/REPORT.md`: risultati, limiti e verifiche aperte.
- `reports/revision_v2/STATE.json`: stato delle fasi. R2/R3 implementate, gate browser ancora bloccato.

**288 test automatici passati.** Questo non certifica la prova reale del browser o l'attendibilità editoriale del corpus. I dati allergenici sconosciuti restano esclusi dalle proposte quando una regola di sicurezza pertinente è attiva. La revisione editoriale e l'ampliamento mediterraneo appartengono a R5; questa consegna non dichiara l'applicazione stable.

La consegna include la cronologia Git in `reports/revision_v2/R3/source-history.bundle` e il riferimento al commit in `SOURCE_COMMIT.json` nella stessa cartella. Il bundle consente di ricostruire il sorgente senza dipendere dal percorso di lavoro originario.
