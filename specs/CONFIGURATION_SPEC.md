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

## 5. Bootstrap standard e template iniziali

Nel release candidate V1 il wizard onboarding e temporaneamente disabilitato. Una nuova installazione viene attivata direttamente con un bundle standard neutro, trattato come normale configurazione persistita e non come caso speciale del dominio. Il bootstrap standard deve avere almeno:

- zero regole allergia/intolleranza preimpostate;
- zero preferenze alimentari preimpostate;
- `shoppingPeopleMultiplier = 1`;
- un set standard di MealClass utilizzabile subito;
- una DayClass standard e un Cycle di un giorno;
- vincoli nutrizionali opzionali disabilitati (`enabled=false`, limiti null, `weight=0`) salvo l'energia giornaliera necessaria al funzionamento di base;
- timezone risolta dall'ambiente quando possibile invece di assumere il fuso del fixture.

Un vecchio bootstrap puo essere aggiornato automaticamente al nuovo standard soltanto se non risulta mai modificato o importato esplicitamente dall'utente. Una configurazione salvata/importata dall'utente ha sempre precedenza e non viene sovrascritta dal bootstrap.

Quando l'onboarding verra ridisegnato potra offrire template modificabili, ma non deve trattarli come configurazioni speciali nel codice.

Esempi:

- settimana standard 5 lavoro + 2 riposo;
- ciclo 4 on / 4 off;
- turni misti giorno/notte;
- freelance senza orari lavoro;

Un template e semplicemente JSON precompilato che crea DayClass/MealClass/Cycle normali.

## 6. Import/export configurazione

Consentire export della sola configurazione separato dal backup completo. Questo permette di condividere un setup di ciclo/tema senza condividere storico, allergie o dati personali non desiderati.

## 7. Persistenza, validazione e atomicita

I record configurazione sono salvati tramite repository in IndexedDB. Un onboarding multi-step futuro potra salvare bozze, ma il passaggio a configurazione `active` deve avvenire atomicamente dopo validazione referenziale. Il backup JSON rimane il formato portabile.

Gli editor di configurazione devono validare live il draft usando lo stesso contratto applicato al save: JSON Schema, invarianti cross-record e reference-data canonici. Save resta disabilitato finche il draft non puo essere persistito validamente. Gli input obbligatori vuoti non vengono coerciti a valori di fallback. Ogni save esplicito deve produrre feedback success/failure visibile anche se l'app esegue successivamente un rerender.

Le strutture annidate devono essere modificate nel nodo previsto dallo schema. In particolare le capacita di una DayClass (`fridge`, `reheating`, `cooking`, `complexSnack`, `portabilityRequired`, `maxPrepMinutes`) appartengono sempre a `DayClass.capabilities` e non sono proprieta top-level. Una DayClass diversa da `free` deve avere almeno un meal slot prima di poter essere salvata.
