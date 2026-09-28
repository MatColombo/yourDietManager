# Import revisione ricette — 28 settembre 2026

Baseline workbook: `clean-6e81d46b0cd7`.

## Esito

- righe ricetta realmente modificate rilevate: **472**
- revisioni ricetta emesse: **466**
- disattivazioni (`status: retired`): **457**
- modifiche contenuto attive emesse: **9**
- modifiche ricetta bloccate: **6**
- modifiche ingredienti nel foglio INGREDIENTI: **0**
- revisioni ingrediente emesse: **0**

## Modifiche bloccate

- `recipe_beef_expansion_25` (riga 546): ingredienti_non_risolti — slot1:ingrediente_non_presente:Vitello
- `recipe_beef_expansion_24` (riga 547): ingredienti_non_risolti — slot1:ingrediente_non_presente:Vitello
- `recipe_beef_expansion_23` (riga 548): ingredienti_non_risolti — slot1:ingrediente_non_presente:Vitello
- `recipe_beef_expansion_22` (riga 549): ingredienti_non_risolti — slot1:ingrediente_non_presente:Vitello
- `recipe_beef_expansion_21` (riga 550): ingredienti_non_risolti — slot1:ingrediente_non_presente:Vitello
- `recipe_r2_quick_pesce_serra_pomodoro_olive` (riga 898): ingredienti_non_risolti — slot1:ingrediente_non_presente:Orata cruda

Le ricette bloccate non sono state emesse nel batch: il catalogo precedente resta quindi invariato per quegli ID. `Note_revisore` è informativa e non viene serializzata nel catalogo.

Per `Vitello` e `Orata cruda` il workbook non contiene una nuova riga nel foglio INGREDIENTI con nutrizione/tassonomia; i dati non sono stati inventati.

## Contratto delta

Il batch contiene solo record con differenze rispetto alla baseline incorporata. Nessuna ricetta invariata e nessun ingrediente invariato viene riscritto.
