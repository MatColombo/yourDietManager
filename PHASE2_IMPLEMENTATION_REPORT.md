# Phase 2 Implementation Report

## Status

**Phase 2 — Configuration editors: implemented.**

Roadmap deliverables:

- NutritionProfile: complete.
- Allergy/Intolerance: complete.
- MealClass: complete.
- DayClass: complete.
- Cycle 1–31: complete.
- onboarding: complete for the configuration scope; plan preview/generation remains Phase 5 by design.

`FoodPreferences` is also implemented because it is part of the authoritative configuration domain and onboarding flow even though the abbreviated Phase 2 roadmap list omits it.

## Important design decisions

1. JSON Schema remains the record-level contract. Phase 2 adds a Configuration Service for invariants JSON Schema cannot express cleanly across records/items.
2. Active configuration replacement is atomic across all configuration stores. Invalid cross-record references never partially persist.
3. The onboarding draft is persisted in the existing `meta` store and is separate from active configuration. Each step can be resumed; final activation is one validated transaction.
4. Canonical allergens are selected from the closed V1 ID set. Free user-facing labels never become engine IDs.
5. The MealClass quantitative target registry is explicit and versioned in code. V1 supports nutrition targets `energyKcal`, `proteinG`, `carbsG`, `fatG`, `fiberG` and practical targets `prepMinutes`, `cookMinutes`; unknown quantitative targets are rejected.
6. Deleting a MealClass or DayClass is disabled while it is referenced by active DayClass slots or Cycle days respectively.
7. External DayClass slots expose `estimatedNutritionPolicy`, budget, optional protein minimum and `parallel`; planned slots do not retain an external estimate policy.
8. Configuration sharing is separate from full backup. The structural export intentionally excludes safety/nutrition/preferences and other personal settings, while preserving referentially complete theme/meal/day/cycle structure.
9. Phase 2 does not fake plan-preview behavior. The onboarding readiness screen stops at validated configuration + catalog status until Phase 5 supplies the generator.

## Validation added

The semantic validator checks:

- all AppConfig references resolve;
- DayClass slots reference active MealClasses;
- Cycle days reference active DayClasses;
- enabled nutrients contain at least one min/target/max and obey `min <= target <= max` where values exist;
- disabled nutrients have null min/target/max and weight 0;
- MealClass energy shares obey `min <= target <= max`;
- categorical MealClass rules do not carry quantitative operator/value fields;
- numeric MealClass rules use a known registry target;
- non-free DayClasses have at least one slot;
- slot IDs are unique per DayClass;
- same-time/dayOffset overlaps are valid only when all overlapping slots set `parallel=true`;
- Cycle length equals day count and `cycleDay` is exactly 1..N without gaps.

The same validation is now used by default bootstrap, ordinary configuration saves, configuration import and backup import.

## Automated verification

The Node built-in suite covers the Phase 1 regressions plus Phase 2 invariants, including:

- canonical bootstrap configuration is semantically valid;
- invalid nutrient bounds/ambiguous enabled nutrient are rejected;
- overlapping DayClass slots require `parallel=true` on every overlapping slot;
- missing cross-record references are rejected;
- Cycle normalization produces contiguous days and supports the V1 maximum of 31 days;
- invalid configuration is rejected before atomic replacement;
- onboarding drafts remain separate from active records and final completion activates atomically;
- unknown numeric MealClass targets are rejected;
- structural configuration export excludes sensitive profile sections and preserves local safety data on import;
- configuration export checksum detects tampering;
- all Phase 1 schema/catalog/backup/i18n/theme/migration regressions continue to pass.

## Environment limitation

The container's managed Chromium policy blocks navigation to local HTTP sites with the message "Your organization doesn't allow you to view this site". Therefore automated browser E2E could not be executed in this environment. HTTP serving itself is reachable with `curl`, and application modules are covered by syntax/build checks plus domain/integration tests. Browser E2E for onboarding and CRUD should be run in an unrestricted browser environment before production release.

## Next coherent phase

Phase 3 — Catalog engine:

- ingredient/recipe JSON updater;
- atomic catalog version replacement;
- IndexedDB indexed query layer;
- search/filter and dynamic recipe detail;
- custom ingredient and custom recipe family/version authoring records.
