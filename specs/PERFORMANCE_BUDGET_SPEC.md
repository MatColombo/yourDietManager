# Performance & Scalability Budget Spec V1

## 1. Target scala V1

Progettare e testare almeno per:

- 1.000 IngredientRevision;
- 10.000 RecipeVersion attive;
- 365 giorni piano;
- 10.000 operations storico stress;
- cataloghi JSON complessivi senza fotografie.

## 2. Principi

- non caricare tutto il catalogo ricette nel DOM;
- non filtrare 10k ricette da JSON fetch a ogni interazione;
- usare IndexedDB indexes per candidate retrieval;
- limitare il solver a un candidate set bounded;
- virtualizzare liste lunghe;
- importare cataloghi in chunk e mostrare progresso.

## 3. Candidate retrieval

Target operativo pre-V1 planner validation: recuperare dall'IndexedDB un subset bounded fino a **500 candidati per archetype/slot**. Il limite 500 permette al corpus Phase B (fino a 450 ricette per lunch/dinner) di entrare interamente nello spazio di ricerca. Hard safety/capability filtering deve essere applicato dal filtro canonico del planner, non da prefiltri che rendano invisibili le ragioni di esclusione. Per cataloghi post-V1 più grandi, l'obiettivo resta ridurre il working set con indici e query semanticamente equivalenti senza troncare arbitrariamente la coverage utile.

## 4. UI budgets

Obiettivi indicativi su dispositivo mobile medio:

- input/search percepito senza lag;
- nessun rendering sincrono di migliaia di card;
- long task >100 ms da considerare bug/performance debt;
- generation progress visibile se il solver supera una soglia percepibile.

I benchmark devono registrare hardware/browser usati: non trattare questi numeri come SLA universali.

## 5. Storage

Prima di installare pack grandi, usare `navigator.storage.estimate()`.

Mantenere metriche in `meta`:

- catalogVersion;
- record counts;
- import duration;
- approximate storage usage;
- last successful integrity check.

## 6. Worker

Se generation/import causano long task significativi, V1 deve poter spostare solver/import parsing in Web Worker senza cambiare i contratti Repository/Domain.

## Phase 8 implementation gate

For the 10k V1 hardening path, boundedness is a release invariant:

- unfiltered recipe browsing must not call a full-store `getAll()` for RecipeVersion records;
- one UI page may materialize only its bounded page/subset;
- non-indexable fallback filters must scan in bounded chunks;
- recent operation history must use indexed cursor paging rather than loading the entire operation log;
- operation commit/undo/redo must use persisted head/redo pointers in normal operation rather than O(n) rescans.

`npm run hardening:scale` records environment-specific timings and these boundedness counters. Timings are diagnostic and must not be interpreted as universal browser SLAs.
