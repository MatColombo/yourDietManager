# Day Class Spec V1

## 1. Distinzione fondamentale

**DayArchetype** = enum hardcoded usato dal motore.

**DayClass** = configurazione creata dall'utente e persistita come record IndexedDB esportabile in JSON.

Esempio:

```text
Nome: Lavoro ufficio
Sigla: LU
Colore: #4A8F55
Archetipo: day
```

## 2. Archetipi V1

| ID | Significato | Default del motore |
|---|---|---|
| `day` | lavoro diurno | pasti distribuiti di giorno |
| `morning` | turno anticipato | energia anticipata |
| `afternoon` | turno tardo | pranzo/pre-turno rilevanti |
| `night` | turno notturno | abilita naturalmente slot `dayOffset=1` |
| `long_shift` | turno 10–14h | piu slot operativi |
| `split_shift` | due finestre | supporta due intervalli lavoro |
| `on_call` | reperibilita | preferisce pasti flessibili/trasportabili |
| `rest` | riposo | distribuzione libera |
| `free` | giornata flessibile | minima imposizione automatica |

## 3. Orari

La DayClass puo dichiarare zero, una o due finestre:

```json
"workWindows": [
  {"start":"08:00","end":"17:00","endDayOffset":0}
]
```

Per notte:

```json
{"start":"20:00","end":"08:00","endDayOffset":1}
```

## 4. Meal slots

Ogni DayClass contiene slot ordinati. Esempio:

```json
{
  "mealClassId":"mc-breakfast-home",
  "time":"07:00",
  "dayOffset":0,
  "mode":"planned"
}
```

Carry-over e determinato dallo slot, non dal nome della classe.

## 5. Pasto esterno/mensa

Uno slot puo usare:

```json
"mode":"external"
```

In quel caso il generatore non assegna una ricetta. Produce invece un budget/guida nutrizionale per lo slot.

Campi raccomandati:

- `energyBudgetKcal` o quota percentuale;
- `proteinMinG` opzionale;
- `guidanceKeys` localizzabili;
- `estimatedNutritionPolicy`: `unknown`, `budget_only`, `user_estimate`.

La spesa ignora gli slot external.

## 6. Context capabilities

Ogni classe puo dichiarare:

- fridge: yes/no/unknown;
- reheating: yes/no/unknown;
- cooking: yes/no;
- complexSnack: yes/no;
- portabilityRequired: yes/no;
- maxPrepMinutes opzionale.

Questi segnali filtrano/rankano le ricette.

## 7. Validazioni

- nome obbligatorio;
- abbreviazione 1–2 caratteri visuali;
- colore CSS hex valido;
- archetipo noto;
- max 31 slot per classe;
- `dayOffset` 0–2 in V1;
- slot con stessi time/dayOffset consentiti solo se esplicitamente marcati paralleli;
- almeno uno slot se la classe non e `free` puro.

## 8. Effetto delle modifiche

Modificare una DayClass influenza solo nuove generazioni o operazioni esplicite di rigenerazione. CalendarDay gia materializzati conservano gli slot operativi necessari e non cambiano retroattivamente.

## 9. Contratto slot esterni

Per `mode=external` lo slot deve dichiarare `estimatedNutritionPolicy`:

- `unknown`: nessuna stima nutrizionale; il solver non attribuisce nutrienti effettivi;
- `budget_only`: `energyBudgetKcal` e opzionalmente `proteinMinG` sono budget/guardrail di pianificazione, non nutrienti consumati;
- `user_estimate`: la UI puo raccogliere una stima dell'utente a posteriori nel CalendarDay, separata dalla configurazione DayClass.

`proteinMinG` e un obiettivo operativo opzionale per la scelta esterna; non viene conteggiato come proteina realmente assunta finche non esiste una stima utente esplicita.

## 10. Slot paralleli

Due slot con la stessa coppia `time` + `dayOffset` sono invalidi salvo che **tutti** gli slot sovrapposti abbiano `parallel=true`. Il default applicativo e `false`. La validazione cross-record/cross-item deve essere eseguita dal Configuration Service oltre alla JSON Schema.

## 11. Formato orario

Tutti gli orari locali `HH:mm` usano il pattern 24 ore `00:00`–`23:59`. Valori come `24:00` o `29:59` sono invalidi.
