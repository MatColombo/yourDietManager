# Phase 4 production pilot workspace

`v1-pilot-intake.json` contains 120 deterministic candidate slots defined by `corpus/contracts/v1-production.json`.

Every slot starts as:

- `state = discovered`;
- `referenceScanStatus = pending`;
- `referenceRequests = []`.

Before recipe generation, the operator/agent must inspect the concept and explicitly set `referenceScanStatus = complete`. If the concept requires data that is not canonical yet, add a `referenceRequests[]` entry instead of inventing an ID in the recipe candidate.

Taxonomy request example:

```json
{
  "requestId": "pilot-example-cuisine",
  "kind": "taxonomy_term",
  "taxonomyId": "cuisine",
  "labels": { "it": "Peruviana", "en": "Peruvian" },
  "proposedTermId": "cuisine_peruvian",
  "parentTermId": null,
  "rationale": "Required by a pilot recipe concept.",
  "status": "unresolved",
  "proposalId": null,
  "resolvedId": null,
  "notes": null
}
```

Ingredient request example:

```json
{
  "requestId": "pilot-example-chickpea-flour",
  "kind": "ingredient",
  "taxonomyId": null,
  "labels": { "it": "Farina di ceci", "en": "Chickpea flour" },
  "proposedTermId": null,
  "parentTermId": null,
  "rationale": "Required by a pilot recipe concept.",
  "status": "unresolved",
  "proposalId": null,
  "resolvedId": null,
  "notes": null
}
```

Run `npm run corpus:pilot-resolve` after editing the intake. Existing canonical terms are reused; missing extensible taxonomy terms become `ReferenceDataProposal` records. Missing/non-production ingredients remain blocked for curation.

Do not generate recipe JSON for a record until it reaches `ready_for_generation`.


## 4P-B ordered wave gate

The 120 deterministic slots are six waves of 20. Generate the current wave report with:

```bash
npm run corpus:pilot-wave-report -- 1
```

Wave 1 is blocked until production ingredient readiness is green. For wave N > 1, the previous wave must already be fully terminal. A wave closes only when every candidate in the wave is `accepted` or `rejected`, unresolved reference requests are zero, and unhandled taxonomy proposals are zero.

Do not manually move an intake record to `ready_for_generation` to bypass ingredient or taxonomy review. `corpus:production-process` remains the authoritative hard gate.
