# Nutrition Engine Spec V1

## 1. Natura del motore

Il motore ottimizza un insieme di **soft constraints** dopo avere applicato tutti gli hard constraints. In V1 `dailyEnergyKcal ± energyTolerancePct` e esplicitamente un hard constraint giornaliero. I record necessari vengono ricevuti dai repository; il motore non dipende direttamente da IndexedDB.

Non e un motore clinico e non deve dichiarare appropriatezza medica.

## 2. Profilo energetico

Campi minimi:

- `dailyEnergyKcal`
- `energyTolerancePct`
- `dayArchetypeModifiers`

Esempio:

```json
{
  "dailyEnergyKcal":1800,
  "energyTolerancePct":5,
  "dayArchetypeModifiers": {
    "night":{"mode":"percent","value":8},
    "rest":{"mode":"kcal","value":-100}
  }
}
```

## 3. Macro e fibra

Ogni nutriente puo essere configurato come:

- minimum;
- maximum;
- target;
- target range;
- disabled.

Lo stato `disabled` e **esplicito** tramite `enabled:false`; in quel caso `min`, `target` e `max` devono essere `null` e `weight` deve essere `0`. Non usare "tutti null" o `weight:0` come convenzioni implicite quando `enabled:true`.

Esempio attivo:

```json
"proteinG":{"enabled":true,"min":100,"target":120,"max":null,"weight":2.0}
```

Esempio disabilitato:

```json
"fiberG":{"enabled":false,"min":null,"target":null,"max":null,"weight":0}
```

Il validator applicativo verifica inoltre `min <= target <= max` per i valori presenti.

## 4. Preset

Preset di scoring, non diete rigide:

- balanced
- higher_protein
- lower_fiber
- moderate_fiber
- higher_fiber
- moderate_carbs

L'utente puo partire da un preset e poi modificare i parametri.

## 5. Night energy policy

Per ogni archetipo giorno l'utente puo scegliere:

- same as base;
- fixed kcal delta;
- percent delta.

Il delta modifica il target giornaliero del cycle day, mentre i pasti con `dayOffset=1` vengono contabilizzati nella giornata dietetica di origine e nella data civile di consumo separatamente a seconda della vista.

## 6. Scoring

Esempio di objective function:

```text
score =
  energyPenalty * W_energy
+ proteinPenalty * W_protein
+ carbPenalty * W_carbs
+ fatPenalty * W_fat
+ fiberPenalty * W_fiber
+ preferencePenalty
+ repetitionPenalty
+ practicalityPenalty
```

Punteggio piu basso = migliore.

Hard constraint violation = candidato o soluzione esclusa, non semplicemente penalizzata. La tolleranza calorica viene applicata al finalista giornaliero; non e una semplice componente di score.

## 7. Nessun autoscaling ricetta

Il generatore usa `servings = 1` per ogni recipe component.

Per colmare un deficit:

1. scegliere un'altra ricetta;
2. aggiungere una seconda recipe component compatibile;
3. lasciare un piccolo scostamento entro tolleranza.

Mai modificare automaticamente la porzione standard della ricetta.

## 8. Nutrienti noti vs esterni

Gli slot `external` non contribuiscono con nutrienti inventati. Il motore riserva un budget e ottimizza i pasti pianificabili attorno a quel budget.

## 9. Provenance e riproducibilita

Ogni risultato di generazione deve registrare versione algoritmo/solver, catalogVersion e seed. Le RecipeVersion conservano calculationAlgorithmVersion e inputDigest. Vedere `SOLVER_REPRODUCIBILITY_SPEC.md`.


## 10. Energy tolerance semantics

Per target `T` e tolleranza `p`:

```text
validDailyMin = T * (1 - p/100)
validDailyMax = T * (1 + p/100)
```

Con external meal budgetizzato `E`, il planned energy deve rispettare:

```text
plannedMin = max(0, validDailyMin - E)
plannedMax = max(0, validDailyMax - E)
```

Un risultato fuori finestra non puo avere status `success`. Un external slot con energia sconosciuta non consente certificazione del target giornaliero.

## 11. Soft nutrient semantics

I campi `min`, `target` e `max` di proteine, carboidrati, grassi e fibra sono **soft bounds/targets** in V1 e contribuiscono alla funzione obiettivo. Non vanno interpretati come hard constraints finche il modello non introdurra un campo di strength esplicito.
