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

Se nessuna combinazione raggiunge esattamente il target, preferire uno scostamento entro tolleranza piuttosto che scalare una ricetta.

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
2. allargare solo soft constraints secondo priorita;
3. produrre diagnostica chiara:
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
