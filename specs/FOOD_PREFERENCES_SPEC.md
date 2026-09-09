# Food Preferences Spec V1

## 1. Tre livelli distinti

### Preferenza soft

Influenza il ranking ma non esclude il candidato:

- more_often
- normal
- less_often
- rarely

### Esclusione volontaria

`autoExclude: true` rimuove il target dalle proposte automatiche, ma l'utente puo selezionarlo manualmente con un normale override.

### Allergia/intolleranza

Gestita separatamente da `ALLERGY_INTOLERANCE_SPEC.md`; e un hard constraint di sicurezza e non deve essere trattata come gusto.

## 2. Target

Una preferenza puo riferirsi a:

- `ingredient` -> `Ingredient.ingredientId`;
- `productFood` -> term ID `product_food` (categoria, sottocategoria o concetto prodotto; scelta predefinita per nuove preferenze);
- `foodCategory` -> term ID legacy/source `food_category` quando serve compatibilita con una regola esistente;
- `recipeTag` -> term ID di una tassonomia tag compatibile con il consumer;
- `cuisine` -> term ID `cuisine`.

Il form non accetta un target semantico arbitrario: usa autocomplete/search sul registry o sul catalogo ingredienti e persiste esclusivamente `targetId`. Alias e label servono a trovare la voce ma non vengono persistiti come target. Il service boundary ripete la validazione e rifiuta ID sconosciuti.

Il limite frequenza deve essere presentato come due quantità esplicitamente etichettate (`maxOccurrences`, `windowDays`), non come due input anonimi.

## 3. Frequenza

Ogni preferenza puo aggiungere:

```json
"frequency": {"maxOccurrences":2,"windowDays":7}
```

Il conteggio e per **recipe component/pasto** in cui il target e presente, non per semplice giorno civile.

## 4. Preferenze positive

`more_often` deve aumentare la priorita senza causare monotonia. Il repetition penalty resta attivo.

## 5. Rebalance

Cambiare una preferenza persistita in IndexedDB non modifica il piano esistente automaticamente. L'utente puo richiedere un riequilibrio su un periodo, con preview e conferma atomica.

## 6. Query e frequenze

Le frequenze su finestre temporali devono usare CalendarDay/PlannedMeal da IndexedDB con query per plan/date. Non ricostruire ogni volta tutto il piano dai JSON catalogo.

## Phase D2 — productFood targets

Food preference rules MAY target a `product_food` category, subcategory or concept through `targetType=productFood`. Matching is true when any ingredient in a recipe has the target ID on its explicit product taxonomy path. `autoExclude=true` keeps the existing hard semantics; non-excluding preference levels remain soft scoring inputs. Product-food matching is independent from allergen matching and legacy/source food categories.


## Phase D3 — picker tassonomico condiviso

Per `targetType=productFood` la UI MUST usare il picker gerarchico condiviso `FoodCategory -> FoodSubcategory -> IngredientConcept`, mostrare il path localizzato e il numero di IngredientFamily correnti coperte dalla scelta. L'utente non deve selezionare singole revisioni tecniche per esprimere una preferenza concettuale (es. `Noodles`).

Lo stesso picker e la stessa semantica ID vengono riusati da Prefer/Avoid/AutoExclude, safety rules e MealClass rules. Nuove preferenze partono da `productFood`; l'utente puo scegliere altri target type solo esplicitamente.
