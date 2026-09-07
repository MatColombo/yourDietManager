# Phase 4 Production Review rc.24 — Browser schema mirror hardening

## Trigger
The `Publish 500 Recipe Review Catalog` workflow reached Chromium with the published 500-recipe catalog but browser bootstrap failed on `ingredientRevision.source`: production energy provenance fields (`energyBasis`, `energyNutrientId`, `energySourceUnit`, `energyOriginalValue`, `energyConversion`) were rejected as additional properties.

## Root cause
The canonical `schemas/ingredient-revision.schema.json` already allowed the production provenance fields introduced during rc.15–rc.16. The PWA mirror `public/schemas/ingredient-revision.schema.json` had not been synchronized. Node production validation loaded canonical schemas and passed; the browser `SchemaRegistry` fetches `/schemas/*` from `public/`, so it correctly rejected the stale client contract.

## rc.24 correction
- mirror the canonical ingredient revision schema into `public/schemas/ingredient-revision.schema.json`;
- synchronize two additional latent browser-schema drifts found by the new gate: `recipe-corpus-orchestration-run.schema.json` (`intentStrategy`) and `ingredient-curation-batch.schema.json` (production curation fields);
- export the exact browser schema list from `schemaValidator.js`;
- require every browser-loaded schema to be byte-for-byte identical between `schemas/` and `public/schemas/`;
- enforce the same invariant as a build preflight, so a drift cannot be shipped even when a developer runs `npm run build` without the full test suite;
- validate a production-style ingredient revision against the public schema, including all five energy provenance fields;
- retain `additionalProperties:false` and prove an uncontrolled source field is still rejected;
- raise the production-review catalog `appMinVersion` to `1.0.0-rc.24` because earlier clients do not carry this schema contract;
- advance the shell cache to `ydm-shell-v26` because a precached schema changed.

## Invariant
A schema used by the browser has one canonical definition. `public/schemas/` is a deployment mirror, never an independently evolving contract. Any drift must fail `npm test` before Chromium or publication.

## Verification
- production-review control plane: 17/17 PASS;
- public-schema production bootstrap: 500 recipe families + 500 recipe versions imported with the browser schema surface;
- complete Node test suite: 177/177 PASS;
- lint/a11y/forms/scale/build pass before the local Chromium step;
- local Chromium cannot complete reliably in the sandbox execution window, so the GitHub browser gate remains the authoritative browser run.
