# Planner exposure diversity revision

## Problema

Con 1.260 ricette il planner restava troppo concentrato su un piccolo gruppo di candidati. Sono stati individuati tre choke point:

- retrieval per archetipo bounded a 500, precedentemente deterministico;
- frontier per slot bounded a 20, dominato dai migliori soft score e dal target energetico;
- selezione finale del beam sostanzialmente `best score wins`, con una perturbazione seedata troppo piccola per cambiare candidati materialmente diversi.

Nel catalogo corrente `dinner=521` e `lunch=507`, quindi il primo choke point escludeva permanentemente almeno una parte delle ricette gia prima dello scoring.

## Modifica

- retrieval a 500 mantenuto per performance, ma rotato deterministicamente dal seed all'interno degli strata energia/frequenza;
- frontier di default aumentato 20 -> 32;
- quota random esplicita 35-55% a seconda del profilo;
- quota taxonomy/family/primary-ingredient, quota energy-target e quota quality;
- ordine di costruzione delle combinazioni seed-dependent;
- quattro profili di esplorazione: `balanced`, `broad`, `energy_stratified`, `taxonomy_stratified`;
- `broad` usa `uniform_feasible`: hard-valid + minima ripetizione, poi pick uniforme seedato;
- gli altri profili usano jitter simmetrico limitato sui soli soft score;
- frequency planner amplia il beam di default 4 -> 6 e le alternative giornaliere 4 -> 6, con pick finale esplorativo coerente;
- versioni planner: `plan-generator-2.3`, `beam-search-2.3`, frequency `plan-generator-r3-4` / `window-beam-r3-4`;
- shell cache PWA v57.

## Invarianti

Nessun hard constraint viene randomizzato o rilassato. Stesso seed = stesso risultato. La casualita interviene soltanto dopo i filtri hard e resta tracciata nei diagnostics.

## Test aggiunti

`planner-exposure-fairness.test.mjs` verifica:

1. esposizione dell'intera popolazione hard-feasible attraverso seed diversi;
2. rotazione del retrieval bounded;
3. capacita del pick finale di selezionare ricette fuori dall'elite greedy.
