# YourDietManager V1 Freeze Contract

## Status

**Release candidate frozen. Manual product acceptance is still pending.**

This document defines the boundary between the pre-release development model and the stable V1 compatibility model. The catalog is frozen at `1.0.0`; the application remains `1.0.0-rc.27` until the final manual test is accepted.

## Frozen contract

| Area | V1 candidate |
| --- | --- |
| App | `1.0.0-rc.27` |
| Catalog | `1.0.0` |
| IndexedDB schema | `5` |
| Content schema | `3` |
| Backup format | `1` |
| Final pre-V1 data epoch | `v1-freeze-epoch-1` |
| Ingredient families/revisions | `600 / 600` |
| Recipe families/versions | `500 / 500` |
| Required `core` recipes | `500` |
| Stratified recipe review | `60` recipes / `12` strata |

The machine-readable source of truth is `corpus/production/v1-release/freeze-contract.json`.

## Compatibility boundary

Everything before this freeze remains pre-release and disposable. `v1-freeze-epoch-1` is the final destructive reset boundary. Once the stable `v1.0.0` release is approved, IDs, schemas, persisted user data and backup compatibility become release contracts and future changes must use explicit migrations/versioning.

The final promotion must **not** regenerate or republish the recipe corpus. It should only:

1. record successful manual acceptance;
2. promote application version `1.0.0-rc.27` to `1.0.0`;
3. leave the V1 catalog at `1.0.0` and leave the data epoch unchanged;
4. run the final release gate;
5. create the `v1.0.0` tag/release.

If the manual test finds a blocker requiring a schema, data-model or catalog-content change, the candidate returns to Step 3 validation rather than bypassing this contract.

## Release blockers

The candidate cannot be promoted while any of the following is true:

- manual acceptance is pending or failed;
- catalog/reference integrity fails;
- hard allergy/diet constraints fail in planner/replacement/rebalance;
- effective-plan editing or undo/redo corrupts state;
- shopping/checklist state is inconsistent after reload;
- backup cannot validate/restore against the frozen catalog;
- local-data deletion leaves private application state behind;
- required Chromium acceptance fails in GitHub Pages CI;
- locale-key parity, accessibility, form-contract, build or Pages audit fails.

## Non-blocking post-V1 work

Corpus expansion beyond 500 recipes, broader human review, visual refinements and additional convenience features are post-V1 work unless the final acceptance test demonstrates a functional blocker.
