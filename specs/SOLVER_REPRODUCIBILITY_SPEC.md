# Solver Reproducibility & Explainability Spec V1

## 1. Obiettivo

Rendere la generazione verificabile, riproducibile e spiegabile senza trasformare la UI in un pannello tecnico.

## 2. GenerationRun

Ogni generazione salva:

- `generatorVersion`;
- `solverVersion`;
- `seed`;
- `catalogVersion`;
- `configSnapshotHash` e snapshot necessario;
- horizon;
- createdAt;
- summary diagnostics.

Stesso catalogVersion + stessa configurazione + stesso solverVersion + stesso seed deve produrre lo stesso risultato, salvo bug.

## 3. Randomness

Usare PRNG seedato per:

- tie-break;
- varietà controllata;
- recipe scheduler casuale;
- sampling di candidati quando necessario.

Non usare `Math.random()` direttamente nel domain engine.

## 4. Candidate diagnostics

Per ogni pasto selezionato conservare una spiegazione compatta:

- hard filters superati;
- score totale;
- componenti principali dello score;
- top reasons di scelta;
- eventuali soft constraint rilassati.

Non e necessario persistire migliaia di candidati scartati. In debug mode si possono mantenere top N e conteggi per rejection reason.

## 5. Failure diagnostics

Quando non esiste soluzione, classificare almeno:

- no candidates after hard constraints;
- energy range impossible;
- meal class over-constrained;
- insufficient catalog coverage;
- variety/frequency conflict;
- external budget inconsistency.

Non violare allergie/intolleranze per ottenere una soluzione.

## 6. Rebalance

Ogni riequilibrio e un nuovo run con seed proprio e registra la relazione col planInstance originario.
