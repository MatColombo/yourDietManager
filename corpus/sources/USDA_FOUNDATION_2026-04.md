# USDA FoodData Central Foundation Foods — April 2026

Primary trusted upstream source for the 4P-B V1 generic ingredient foundation.

Frozen source identity in `corpus/curation/v1-ingredient-curation-policy.json`:

- source ID: `usda-foundation-2026-04`;
- provider: USDA FoodData Central;
- dataset: Foundation Foods;
- release: April 2026;
- published inventory recorded by the policy: 394 foods;
- license: CC0 1.0 Universal;
- archive: `FoodData_Central_foundation_food_json_2026-04-30.zip`.

The frozen production contract requires at least 400 active `curated/high` ingredient families before pilot execution. Therefore Foundation Foods alone cannot reach the minimum even if all 394 rows were nutritionally complete, unique and culinary-suitable. 4P-B freezes USDA SR Legacy as a generic-only supplemental source; at least six supplemental approved concepts are structurally required and the actual number may be higher after review.

The upstream archive is not fabricated or replaced when network acquisition is unavailable. In an internet-connected environment:

```bash
npm run corpus:fetch-fdc -- usda-foundation-2026-04
npm run corpus:import-usda -- <extracted-json-file> corpus/staging/usda-foundation-review.json
```

The importer stores an input digest and creates a pending review queue. Heuristic label/taxonomy/state/allergen suggestions are proposals only. No imported row becomes production data until every 4P-B editorial check is explicit and the materializer validates it.
