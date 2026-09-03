# Units, Conversions & Yield Spec V1

## 1. Unita canoniche

Ogni IngredientRevision ha basis per 100 `g` o `ml`.

Ogni linea ricetta deve poter essere normalizzata deterministicamente a g/ml.

## 2. Conversioni

Una conversione e esplicita e revisionata insieme all'ingrediente.

Esempi:

```json
{"unit":"piece","canonicalAmount":55,"canonicalUnit":"g"}
{"unit":"tbsp","canonicalAmount":15,"canonicalUnit":"ml"}
```

Non assumere densita o peso di unita senza conversione presente.

## 3. Stato

Raw/cooked/dry/drained/prepared sono record/revisioni distinti quando il valore nutrizionale cambia materialmente.

Non convertire automaticamente crudo <-> cotto.

## 4. Recipe line

Conservare:

- amount/unit inseriti;
- `normalizedAmount`;
- `normalizedUnit`;
- `ingredientRevisionId`.

Il calcolo usa solo normalized amount e nutrient basis della revisione.

## 5. Yield ricetta

Campi opzionali:

- `finalWeightG`;
- `finalVolumeMl`;
- `yieldNotes`.

V1 usa comunque `servingCount=1` per il catalogo standard. Il yield serve a plausibilita, display e future funzioni, non ad auto-scalare il piano.

## 6. Shopping

La spesa aggrega le quantita recipe-line, non finalWeight. Eventuali pack size/commercial rounding restano separati dal calcolo nutrizionale.

## 7. Contratto schema yield

`RecipeVersion.practical` espone `finalWeightG`, `finalVolumeMl` e `yieldNotes`. `yieldNotes` e testo descrittivo opzionale/null e non partecipa al calcolo nutrizionale.
