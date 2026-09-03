# Privacy & Data Lifecycle Spec V1

## 1. Baseline

V1 e local-first e non richiede account/backend. Dati di dieta, allergie, preferenze e piano restano nel browser salvo export esplicito dell'utente.

## 2. Dati sensibili

Trattare come dati personali sensibili almeno:

- allergie/intolleranze;
- profilo nutrizionale;
- cronologia piano/aderenza;
- note alimentari personali.

Non inserirli in URL, analytics, log remoti o crash report non esplicitamente opt-in.

## 3. Export

Consentire:

- backup completo;
- export sola configurazione;
- export catalogo custom;
- eventuale export piano.

Prima dell'export mostrare chiaramente cosa contiene il file.

## 4. Delete/reset

Distinguere:

- reset piano generato;
- elimina storico operazioni;
- elimina catalogo custom;
- reset configurazione;
- elimina tutti i dati personali;
- rebuild del solo catalogo base.

`Delete all personal data` deve cancellare gli store user senza richiedere di eliminare manualmente dati del sito dal browser.

## 5. Backup import

Importare in staging/preview e validare prima di replace/merge. Creare backup pre-import quando esistono dati personali.

## 6. Quota/eviction

Poiche IndexedDB puo essere soggetto a eviction browser, incoraggiare backup periodico e richiedere persistent storage quando supportato, senza dichiarare garanzie assolute.
