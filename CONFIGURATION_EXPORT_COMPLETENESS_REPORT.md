# Configuration export completeness fix

## Problem

A `mode: structure` export was easy to mistake for a complete configuration export. By contract it omitted nutrition, safety, food preferences, time zone and people multiplier. In addition, even the complete configuration bundle did not carry FoodGroup records or the profile safety declaration, although both participate in configuration semantics/UI.

## Resolution

- New exports use `formatVersion: 2`.
- `full` is the default export mode.
- The primary UI action is now `Export configuration` / `Esporta configurazione`.
- `structure` remains available only as an explicitly shareable profile-free preset.
- Full export contains:
  - complete AppConfig;
  - nutrition profiles;
  - allergy/intolerance profiles;
  - food preferences;
  - theme profiles;
  - MealClass records;
  - DayClass records;
  - Cycle records;
  - all FoodGroup versions;
  - `profileDeclaration:R4`.
- Full import restores FoodGroups in the same atomic configuration replacement and restores the profile declaration.
- The UI refreshes FoodGroups/ingredient projection immediately after import.
- Legacy `formatVersion: 1` configuration documents remain importable.

## Deliberate exclusions

The configuration export is not an application backup. It does not include plans/calendar history, generation runs, operations, shopping checklists, favorites, saved menus, pantry, production batches, seasonality, prices, product-extension settings, catalog data, custom ingredients/recipes, or custom reference-data taxonomy records. Those remain in the portable application backup/catalog transfer flows.

## Verification

A dedicated configuration transfer suite covers:

1. default complete export coverage;
2. full round-trip of nutrition, preferences and AppConfig settings;
3. FoodGroup and profile declaration round-trip;
4. intentional profile-free structure export;
5. legacy v1 import compatibility;
6. checksum tamper detection.

`npm run check` passes including 25 catalog tests, 5 configuration-transfer tests, 26 planner/interactions tests, 2 frequency-cap tests, lint, PWA build and GitHub Pages audit.
