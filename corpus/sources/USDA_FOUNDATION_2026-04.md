# USDA FoodData Central Foundation Foods — April 2026

Canonical upstream candidate source for Phase 4 ingredient curation.

- Provider: U.S. Department of Agriculture, Agricultural Research Service — FoodData Central.
- Dataset: Foundation Foods, April 2026 release (verified on the USDA download page on 2026-09-03).
- Download page: https://fdc.nal.usda.gov/download-datasets/
- Expected JSON archive: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip
- License: CC0 1.0 Universal as stated by the FoodData Central API guide.
- Intended use: source nutrient values and source metadata for generic/minimally processed ingredients.

The upstream binary dataset is intentionally not fabricated or vendored when it cannot be fetched. Run `npm run corpus:import-usda -- <extracted-json-file>` after downloading and extracting the official archive. The importer creates a review queue; it does not silently publish source records as production ingredients.

If the curated Foundation subset is below the V1 ingredient target (400–800), supplement only with another explicitly versioned, documented trusted source or editorially curated generic components. Do not fill the gap with invented nutrient values.
