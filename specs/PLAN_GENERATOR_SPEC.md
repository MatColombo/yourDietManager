# Plan Generator Spec V1

## 1. Input

- NutritionProfile
- Allergy/Intolerance profile
- Global food preferences
- MealClasses
- DayClasses
- Cycle
- RecipeRepository / versioni correnti compatibili dal catalogo IndexedDB
- IngredientRepository / revisioni referenziate
- Generation horizon

## 2. Output

Materializzare giorni di ciclo su date civili con:

- dayClassId
- dayArchetype
- mealSlots
- civil consumption date per slot
- recipe components assegnati
- external slot guidance
- daily nutrition summary
- score/diagnostics
- generationRunId con seed/versioni/snapshot per riproducibilita

## 3. Generazione per giorno

1. Calcolare target energetico del giorno usando modifier archetipo.
2. Allocare budget indicativi agli slot.
3. Per ogni slot `planned`, costruire candidati che passano hard constraints.
4. Rankare candidati su compatibilita, nutrizione, preferenze e varieta.
5. Comporre la giornata come combinazione di ricette a serving=1.
6. Ottimizzare il giorno intero, non slot isolati.
7. Valutare anche frequenze su finestra mobile 7 giorni.

## 4. Solver V1

Approccio raccomandato: **beam search** o bounded backtracking, con PRNG seedato e candidate retrieval bounded da IndexedDB. Vedere `SOLVER_REPRODUCIBILITY_SPEC.md`.

Greedy puro e sconsigliato perche puo saturare calorie o categorie troppo presto.

Esempio:

- top 20 candidati per slot dopo filtering;
- beam width 50–200;
- prune sugli hard constraints e limiti energetici impossibili;
- objective globale a fine giornata.

## 5. No portion scaling

Ogni component usa sempre:

```json
"servings":1
```

La tolleranza energetica giornaliera è un hard constraint. Se nessuna combinazione cade nel range `dailyEnergyKcal ± energyTolerancePct`, il planner restituisce `NO_FEASIBLE_PLAN`; non scala mai una ricetta per forzare il risultato.

## 6. External slots

Per `external`:

- nessuna recipe assignment;
- sottrarre il budget riservato dal target disponibile agli altri slot;
- mostrare guidance;
- non inventare nutrienti effettivi.

## 7. Carry-over

Ogni slot ha `dayOffset`.

```text
cycle diet day = giorno di pianificazione
civil date = diet day date + dayOffset
```

Entrambe le dimensioni devono rimanere disponibili:

- report nutrizionale del giorno dietetico;
- agenda per data civile.

## 8. Variety

Penalty configurabile su:

- stessa recipeId;
- family;
- ingrediente principale;
- foodGroup;
- cuisine.

Finestre raccomandate 3, 7 e 14 giorni con pesi decrescenti.

## 9. Failure modes

Se il solver non trova soluzione:

1. non violare hard constraints;
2. non allargare mai la tolleranza energetica o altri hard constraints;
3. allargare solo soft constraints secondo priorita;
4. produrre diagnostica chiara:
   - catalogo insufficiente;
   - target troppo stretto;
   - meal class troppo restrittiva;
   - allergie/intolleranze riducono troppo i candidati.

Non inventare una ricetta fuori catalogo durante la generazione del piano V1.

## 10. Persistenza output

Il risultato confermato viene scritto in `planInstances`, `calendarDays` e `generationRuns` tramite una transazione/service coordinato. Preview non confermate possono restare in memoria o in staging e non devono contaminare il piano attivo.

`CalendarDay.nutritionSummary` persiste il riepilogo dei nutrienti **noti** delle recipe component pianificate, il budget external separato e il target energetico usato dal solver. I dettagli di explainability per ricetta selezionata restano in `GenerationRun.diagnostics` per evitare duplicazione.

## 11. Continuita e rolling horizon

Un `PlanInstance` resta un intervallo immutabilmente identificabile con `startDate`/`endDate`, ma V1 deve definire come proseguire oltre l'orizzonte. Ogni piano salva `continuationPolicy`:

- `prompt`: default raccomandato; quando mancano `triggerDaysBeforeEnd` giorni la UI propone l'estensione;
- `auto_extend`: genera automaticamente un nuovo segmento quando entra nella finestra di trigger, senza riscrivere i giorni esistenti;
- `fixed`: nessuna estensione automatica o proposta persistente.

`extensionDays` e 1–31. Una estensione crea un **nuovo GenerationRun** con `reason=horizon_extension` e un nuovo PlanInstance collegato tramite `previousPlanInstanceId`; non modifica retroattivamente il GenerationRun precedente. Il nuovo segmento parte dal giorno civile successivo al vecchio `endDate` e continua il ciclo usando l'indice di ciclo corretto.

Se l'utente modifica configurazione prima dell'estensione, il nuovo GenerationRun congela la configurazione corrente e la UI segnala che il segmento successivo puo differire dal precedente. Non devono esistere buchi o sovrapposizioni involontarie fra segmenti attivi della stessa catena.

## 12. Guardrail temporale UI

La Home/Oggi non deve diventare vuota senza spiegazione quando la data corrente supera `endDate`. Deve mostrare lo stato di piano terminato e l'azione coerente con `continuationPolicy` (genera estensione / riattiva proposta / passa a un altro piano).


## 13. Hard energy feasibility contract

`dailyEnergyKcal ± energyTolerancePct` e hard. Il solver deve filtrare i finalisti fuori finestra e ripetere una validazione post-solve prima di materializzare il CalendarDay. Per slot external con budget noto, la finestra si applica a `knownPlanned.energyKcal + externalBudget.energyKcal`. Un external slot con energia `unknown` impedisce di certificare la giornata e produce failure classificata. Replacement e rebalance devono preservare lo stesso vincolo.

## 14. Constraint policy snapshot

Ogni GenerationRun registra la classificazione hard/soft usata dal motore. Nutrienti opzionali (proteine, carboidrati, grassi, fibra), preferenze, frequenza e varieta restano soft in V1; allergie, `autoExclude`, `forbid`, capabilities, meal archetype, quality, fixed serving ed energia giornaliera sono hard.

## 15. Bounded search and hard-feasibility frontier

Il ranking soft non puo eliminare preventivamente tutta la copertura energetica. Prima del beam il planner conserva candidati e combinazioni distribuiti lungo il fronte energetico (low/target/high/quantili), oltre ai migliori per score. Durante l'espansione il beam usa i min/max energetici ancora raggiungibili per scartare solo stati che non possono piu entrare nella finestra hard giornaliera.

Un failure energetico del bounded search deve dichiarare `proof=bounded_search`. `NO_FEASIBLE_PLAN` significa che non e stata trovata una soluzione hard-valid nel catalogo/configurazione/search space corrente; non e una dimostrazione matematica di inesistenza globale.

## Phase D1 — regeneration modes

Date regeneration MUST distinguish `recalculate` from `alternative`. `recalculate` may return the same RecipeVersion. `alternative` MUST first exclude the currently assigned RecipeVersion per meal occurrence and rerun the same hard-constraint search. Only if that strict bounded search fails may the engine fall back to a search that permits the current RecipeVersion with a dominant soft penalty. Any retained meal MUST carry an explicit bounded-search reason. Neither mode may relax hard constraints or serving invariants.

