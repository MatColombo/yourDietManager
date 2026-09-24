# Feature 6 implementation report — temporary generation fine-tuning

## Scope

Implemented post-generation fine-tuning for an uncommitted plan proposal. The user can add temporary preferences or exclusions, scope them to part of the proposal horizon and selected MealClasses, then regenerate a new sealed proposal without changing permanent configuration.

## Interaction model

The generation preview now exposes **Fine-tune proposal / Affina proposta**. The first implementation is intentionally guided and taxonomy-aware rather than dependent on unrestricted natural-language interpretation.

Available intents include:

- prefer an ingredient;
- avoid an ingredient;
- mark an ingredient temporarily unavailable;
- prefer a recipe;
- avoid a recipe;
- prefer sweet food;
- prefer savory food;
- reduce fiber density;
- reduce fat density;
- increase protein density;
- prefer simpler/quicker preparation;
- prefer meals that are quicker to eat;
- combine simpler/quicker preparation with lower fat.

Ingredient and recipe targets use catalog-backed autocomplete. Every rule can be limited to a date range inside the current generation horizon and to selected MealClasses. Soft intents expose a 1–5 strength control.

## GenerationTuningOverlay

The new `GenerationTuningOverlay` is a deterministic structured layer with schema version 1. It is normalized before generation and copied into `GenerationRun.configSnapshot`, therefore the exact temporary tuning used for a run is reproducible.

The overlay is never copied to MealClass rules, food preferences or other permanent user configuration.

Each normalized rule records:

- deterministic rule ID;
- target type and target;
- mode;
- weight;
- start/end civil date;
- optional MealClass scope;
- UI label and intent identifier.

## Hard versus soft semantics

The implementation deliberately distinguishes preference from availability:

- `prefer`, `avoid`, `increase` and `decrease` are soft objective components;
- `exclude` is a hard candidate rejection.

Therefore “ingredient Y is unavailable” can never be traded away for a better nutritional score. It is rejected by the same hard-filter path used by the planner and is revalidated before preview confirmation.

The soft objective is part of both the legacy/day solver and the multi-day frequency planner. `qualityPolicy` carries the tuning component into slot-option scoring, preventing the outer beam from erasing the user’s temporary preference.

## Scope semantics

Rule scope is evaluated on each meal occurrence's actual `civilDate`, not only on the owning diet-day date. This preserves correct behavior for slots with `dayOffset`.

An empty MealClass scope means all planned meals in the selected date interval.

## Compatibility with Features 4, 5 and 7

Temporary hard exclusions are threaded through policy validation and proposed-meal replacement, so Feature 7 cannot reintroduce a temporarily unavailable ingredient.

Plan-wide ingredient substitution also rejects a replacement ingredient that is temporarily hard-excluded by the tuning overlay. This is intentionally conservative for a global X→Y operation.

Applying new tuning regenerates from the original generation inputs. If the current preview already contains manual meal or ingredient substitutions, the UI warns that those post-generation edits will be reset by regeneration.

## Preview integrity and persistence

Fine-tuning creates a completely new sealed generation preview. No metadata is appended after preview sealing; this avoids stale-preview hash mismatches.

On confirmation, the normalized overlay remains in the persisted `GenerationRun.configSnapshot`. It is historical/run-local state, not a permanent user preference.

No IndexedDB schema migration is required because `GenerationRun.configSnapshot` is explicitly extensible.

## Solver versioning

The changed solver semantics are versioned as:

- legacy/day generator: `plan-generator-2.2` / `beam-search-2.2`;
- frequency planner: `plan-generator-r3-3` / `window-beam-r3-3`;
- tuning policy: `generation-tuning-r1`;
- constraint policy: `planner-constraint-policy-r3-3`;
- soft objective: `phase-f-soft-objective-3`.

## Tests

Added `tests/generation-tuning.test.mjs` to the permanent planner interaction gate. Coverage includes:

- deterministic overlay normalization and date/MealClass scoping;
- scoped soft scoring;
- recipe preference changing the generated proposal;
- proof that permanent MealClass configuration is untouched;
- temporary unavailable ingredient as a hard exclusion;
- compatibility with generated-plan meal replacement;
- persistence of the overlay in the GenerationRun snapshot;
- UI contract for guided intent, target, add and apply controls.

At implementation completion the full project gate passes: catalog tests, planner/interactions, frequency-cap tests, lint, PWA build and GitHub Pages audit.
