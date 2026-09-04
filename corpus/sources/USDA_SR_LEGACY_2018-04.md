# USDA FoodData Central SR Legacy — April 2018

Supplemental trusted source frozen by 4P-B for generic ingredient concepts that are absent from or cannot be retained from Foundation Foods.

- source ID: `usda-sr-legacy-2018-04`;
- role: supplemental only;
- provider: USDA FoodData Central;
- dataset: SR Legacy;
- release: April 2018;
- license: CC0 1.0 Universal;
- Branded Foods are not an acceptable substitute for this source.

Use only after duplicate/concept review against the primary Foundation source. Automatic fuzzy merge is forbidden.

```bash
npm run corpus:fetch-fdc -- usda-sr-legacy-2018-04
npm run corpus:import-usda-sr -- <extracted-json-file> corpus/staging/usda-sr-review.json
```

As with Foundation import, all rows remain pending until explicit editorial review and materialization.
