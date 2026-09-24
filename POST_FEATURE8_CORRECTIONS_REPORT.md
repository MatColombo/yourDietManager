# Post-Feature 8 corrections

## Scope

This patch addresses four issues found on the 2026-09-24 configuration/run:

1. Maximum-variety scoring now includes repeated ingredient identities, including non-primary ingredients, both inside a day and across 3/7/14-day windows. The perishable-reuse strategy remains intentionally exempt from this extra ingredient penalty.
2. Calendar structural editing now supports timeline splice operations: insert a day and shift all following days +1, or remove a day and shift all following days -1. Day ownership, `dayOffset`, civil dates, plan bounds, history and undo/redo remain transactional.
3. Recipe ingredient substitution is temporary by default. Persisting the substitution is a separate "create new version" action and requires a new recipe name.
4. Generated-plan meal replacement can optionally show recipes that violate hard constraints. Incompatible choices are color-coded, list the violated constraints, quantify energy/frequency overages when available, and are comparison-only rather than directly applicable.

## Configuration finding

The provided structure export has an empty rule list for `mc-snack`. `Turno giorno` and `Turno Notte` also both allow `complexSnack: true`. Therefore pork/chicken-heart snack recipes are not configuration violations in those day classes. This patch does not silently override that configuration. Use the existing quick/light snack preset or disable complex snacks in the relevant DayClass if that behavior is desired.

## Validation

- `npm run check`: PASS
- catalog: 282 ingredients / 1,030 recipes
- catalog tests: 25/25 PASS
- planner/interactions: 26/26 PASS
- frequency-cap: 2/2 PASS
- build + GitHub Pages audit: PASS
