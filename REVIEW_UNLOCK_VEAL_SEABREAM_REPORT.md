# Review unlock — Vitello e Orata

Data: 2026-09-28

## Scopo

Chiudere le 6 modifiche del workbook `yourDietManager-recipe-review-roundtrip(1).xlsx` rimaste fuori dal batch 012 perché `Vitello` e `Orata cruda` non erano ingredienti catalogati.

## Nuovi record

- ProductFood `tax_product_veal_loin` -> categoria `tax_category_meat_poultry`
- ingrediente `ing_veal_loin_raw` -> ruolo `tax_role_protein_meat`, stato raw/fresh
- ProductFood `tax_product_gilthead_seabream` -> categoria `tax_category_fish_seafood`
- ingrediente `ing_gilthead_seabream_raw` -> ruolo `tax_role_protein_fish`, stato raw/fresh, allergene `fish`

## Ricette sbloccate

Sono state emesse esclusivamente le 6 revisioni precedentemente bloccate:

- `recipe_beef_expansion_21` r2
- `recipe_beef_expansion_22` r2
- `recipe_beef_expansion_23` r2
- `recipe_beef_expansion_24` r2
- `recipe_beef_expansion_25` r2
- `recipe_r2_quick_pesce_serra_pomodoro_olive` r4

Per queste ricette sono applicate solo le modifiche effettuate nel workbook: `title.it` e il primo ingrediente. Gli altri campi della revisione precedente restano invariati.

## Nutrizione sorgente

- Vitello: USDA FoodData Central, FDC 173826, `Veal, loin, separable lean only, raw`.
- Orata: CIQUAL 26088, `Daurade royale, crue, élevage (Sparus aurata)`.

## Effetto catalogo

- ingredienti attivi: 295 -> 297
- ricette attive: 803 -> 803 (le 6 ricette erano attive anche prima; era bloccata solo la revisione richiesta)
