# Meal Class Spec V1

## 1. Distinzione

**MealArchetype** = enum stabile del motore.

**MealClass** = definizione utente riutilizzabile nei DayClass meal slots e persistita via ConfigRepository/IndexedDB.

Esempio:

```text
Nome: Cena leggera
Sigla: CL
Archetipo: dinner
```

## 2. Archetipi V1

- breakfast
- lunch
- dinner
- snack
- mini_meal
- brunch
- pre_shift
- during_shift
- post_shift
- night_meal

## 3. Preferenze specifiche

Una MealClass puo definire soft constraints come:

- sweet/savory preference;
- avoid fish;
- lower carb preference;
- high protein preference;
- no spicy preference;
- cold suitable preferred;
- max prep time;
- portability preferred.

Scala consigliata:

```text
prefer = +2
slight_prefer = +1
neutral = 0
avoid = -3
```

`forbid` e hard e deve essere esplicito.

## 4. Vincoli per categorie/ingredienti

Usare sempre ID canonici per target semantici. `foodCategory`, `tag` e `flavor` devono risolvere al Reference Data Registry; `ingredient` deve risolvere a un Ingredient ID. String matching libero non e ammesso al service boundary.

Nel Pass B gli stessi vincoli sono anticipati dalla UI: categoria/ingrediente/tag/flavor sono selector ricercabili guidati. L'utente vede label localizzate e non inserisce manualmente `target`; un valore digitato ma non selezionato non e valido.

Esempio:

```json
{
  "ruleType":"foodCategory",
  "target":"food_group_fish_seafood",
  "strength":"avoid"
}
```

Oppure:

```json
{
  "ruleType":"ingredient",
  "target":"ing_chili_pepper",
  "strength":"forbid"
}
```

## 5. Target slot

MealClass puo dichiarare quote preferite dell'energia giornaliera:

```json
"energyShare": {"target":0.30,"min":0.22,"max":0.38}
```

La DayClass puo sovrascrivere questi valori per uno specifico slot.

## 6. Multiple recipe components

Uno slot pianificato puo contenere piu componenti, ma ogni ricetta sempre a una porzione standard:

```text
Pranzo
- ricetta principale x1
- contorno x1
- frutto x1
```

Questo e il meccanismo preferito per colmare gap calorici; non usare `1.35 porzioni` della ricetta principale.

## 7. Effetto delle modifiche

Modificare una MealClass non riscrive silenziosamente i CalendarDay gia generati. La nuova configurazione entra in gioco in nuove generazioni o riequilibri esplicitamente confermati.

## 8. Regole numeriche

Le regole categoriali usano `target` + `strength`. Per preferenze quantitative (`ruleType=nutrition|practical`) il record usa inoltre:

- `operator`: `eq | lte | gte`;
- `value`: numero nella unita implicita del target contrattuale.

Esempio:

```json
{"ruleType":"practical","target":"prepMinutes","operator":"lte","value":20,"strength":"prefer"}
```

I target numerici supportati devono essere registrati in un registry applicativo versionato; target sconosciuti non vengono interpretati liberamente.

## 9. Abbreviazione

Per coerenza visuale con DayClass, V1 limita anche `MealClass.abbreviation` a **massimo 2 caratteri visuali**.
