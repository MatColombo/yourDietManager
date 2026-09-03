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

- ingredientId;
- foodGroup/foodSubgroup;
- recipe tag;
- cuisine tag.

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
