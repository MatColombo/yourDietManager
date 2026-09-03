# Configuration Spec V1

## 1. Configurazione come dominio

La configurazione non deve essere dispersa in preferenze UI isolate. E persistita come record strutturati IndexedDB tramite repository e deve restare esportabile come bundle JSON composto da record con ID stabili.

## 2. Blocchi

- AppConfig (locale, timeZone, measurementSystem, weekStart)
- NutritionProfile
- AllergyIntoleranceProfile
- FoodPreferences
- MealClasses
- DayClasses
- Cycle
- ThemeProfile
- Shopping settings

## 3. Dipendenze

```text
AppConfig
  -> locale / timeZone / measurementSystem / weekStart
  -> NutritionProfile
  -> AllergyIntoleranceProfile
  -> FoodPreferences
  -> ThemeProfile
  -> MealClass[]
  -> DayClass[]
       -> MealClass[] via slots
  -> Cycle
       -> DayClass[]
```

## 4. Validazione prima del piano

La configurazione e generabile solo se:

- tutti gli ID referenziati esistono;
- cycle length = numero cycle days;
- cycleDay e una sequenza 1..N senza buchi;
- tutte le DayClass del ciclo sono valide;
- tutti i mealSlot planned puntano a MealClass valide;
- hard constraints sono sintatticamente validi;
- target energia >0;
- esiste almeno una ricetta compatibile per gli archetipi richiesti oppure viene mostrata una diagnostica prima della generazione.

## 5. Template iniziali

L'onboarding puo offrire template modificabili, ma non deve trattarli come configurazioni speciali nel codice.

Esempi:

- settimana standard 5 lavoro + 2 riposo;
- ciclo 4 on / 4 off;
- turni misti giorno/notte;
- freelance senza orari lavoro;

Un template e semplicemente JSON precompilato che crea DayClass/MealClass/Cycle normali.

## 6. Import/export configurazione

Consentire export della sola configurazione separato dal backup completo. Questo permette di condividere un setup di ciclo/tema senza condividere storico, allergie o dati personali non desiderati.

## 7. Persistenza e atomicita

I record configurazione sono salvati tramite repository in IndexedDB. Un onboarding multi-step puo salvare bozze, ma il passaggio a configurazione `active` deve avvenire atomicamente dopo validazione referenziale. Il backup JSON rimane il formato portabile.
