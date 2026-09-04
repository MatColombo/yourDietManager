# Candidate Generation Protocol — Phase 4

This protocol is the hand-off between a `RecipeGenerationJob` and the deterministic Recipe Pipeline.

## Normal operator flow

The user gives a high-level intent such as BUILD, EXPAND, IMPROVE or FOCUSED_EXPANSION. The agent must not ask the user to manually choose kcal bands, macro bands, cuisine or ingredient mix when those choices are derivable from the current policy/snapshot.

1. Scan the current corpus with the active `RecipeCorpusPolicy`.
2. Ask the deterministic orchestrator for the next `RecipeGenerationJob`.
3. Read the job and generate exactly `candidateCount` candidate objects.
4. Run the deterministic batch processor.
5. If `targetMet` or diversity fails, generate a replacement batch from the rejection summary; never weaken release gates.
6. Apply only accepted records.
7. Re-scan the complete corpus.
8. Repeat until the run stop condition is reached.
9. Publish only through the release validator.


## Production 4P-A intake protocol

For production catalog work, do not generate recipe candidate JSON directly from a conceptual slot.

1. Create/read the `ProductionCorpusIntake` ledger (`corpus/pilot/v1-pilot-intake.json` for the first pilot).
2. Inspect each slot and explicitly set `referenceScanStatus = complete` only after checking taxonomy and ingredient prerequisites.
3. Add `referenceRequests[]` for every missing/ambiguous taxonomy term or ingredient.
4. Run `npm run corpus:pilot-resolve`.
5. Reuse canonical terms when uniquely resolved; review/materialize new `ReferenceDataProposal` records before continuing.
6. Curate missing ingredients to production `curated/high` before use.
7. Generate candidate JSON only for records in `ready_for_generation`.
8. Use the record's stable `candidateId` unchanged in the generated candidate.
9. Process with `npm run corpus:production-process -- ...`; the generic `corpus:process` command is development/editorial tooling and does not satisfy production intake provenance.
10. Accepted RecipeVersion records must carry the intake and production-contract provenance emitted by the production processor.

The production processor fails before recipe calculations if a candidate ledger record is unresolved. Never bypass this by deleting reference requests or substituting a text label for a canonical ID.

## Candidate JSON contract

The candidate file is an array. Each object supplies editorial/culinary intent only; authoritative nutrition, allergens, normalized amounts, hashes and immutable IDs are derived by code.

```json
[
  {
    "candidateId": "cand-001",
    "i18n": {
      "it": {
        "title": "...",
        "description": "...",
        "instructions": ["...", "..."]
      },
      "en": {
        "title": "...",
        "description": "...",
        "instructions": ["...", "..."]
      }
    },
    "mealArchetypes": ["lunch"],
    "ingredientLines": [
      {"ingredientId": "ing_example", "amount": 120, "unit": "g", "optional": false}
    ],
    "practical": {
      "prepMinutes": 10,
      "cookMinutes": 15,
      "reheatingRequired": false,
      "coldSuitable": false,
      "portable": true,
      "fridgeRequired": true,
      "freezerSuitable": false,
      "mealPrepSuitable": true,
      "finalWeightG": 400,
      "finalVolumeMl": null,
      "yieldNotes": null
    },
    "tags": {
      "families": ["recipe_family_grain_bowl"],
      "cuisines": ["cuisine_mediterranean"],
      "practical": ["practical_portable"]
    },
    "culinaryReview": {
      "status": "approved",
      "notes": "Short rationale for culinary plausibility."
    }
  }
]
```

## Agent rules

- Use only `allowedIngredientIds` from the job.
- Prefer `preferredUnderusedIngredientIds` when culinarily sensible.
- Satisfy job meal, energy/protein/fiber ranges, family/cuisine/practicality focus and required/forbidden tags.
- Treat `targetAcceptedCount` as the net target and `candidateCount` as oversampled candidates.
- Vary primary ingredients and recurring ingredient pairs according to `diversityTargets`.
- Do not invent nutrient values or allergen IDs.
- Do not create new ingredient IDs inside a recipe batch.
- Do not copy titles/instructions while merely changing quantities.
- `candidateId` must be unique within the file and stable when re-running the same candidate.
- Mark `culinaryReview.status` as `approved` only when the combination, quantities, preparation and serving are plausible.
- The pipeline, not the generator, decides final acceptance.

## Commands

```bash
npm run corpus:scan -- <catalog-data-dir|bundle.json> <policy.json> <snapshot.json>
npm run corpus:plan -- <snapshot.json> <build|expand|improve|focused_expansion> <policy.json> <catalog-data-dir|bundle.json> [goal.json] [targetCatalogVersion] [seed]
# Development/smoke processor
npm run corpus:process -- <catalog-data-dir|bundle.json> <policy.json> <job.json> <candidates.json> <result.json>

# Production processor
npm run corpus:production-process -- <catalog-data-dir|bundle.json> <policy.json> <contract.json> <job.json> <intake.json> <candidates.json> <result.json> [updated-intake.json]
npm run corpus:apply -- <catalog-data-dir|bundle.json> <result.json> <new-bundle.json> <targetCatalogVersion>
```

Re-run scan/plan after every applied batch. Do not pre-plan a long sequence against a stale snapshot.


## Reference-data prerequisite protocol

Before writing a candidate recipe:

1. resolve every semantic classification against the canonical Reference Data Registry;
2. require the job's `referenceDataVersion` / `referenceDataDigest` and use the exact matching snapshot;
3. if an extensible taxonomy term is missing, emit a `ReferenceDataProposal`, resolve collisions/review, and materialize it first;
4. if a required ingredient is missing, source and curate it first;
5. never place provisional strings or proposal IDs in RecipeVersion;
6. semantic-validate candidate references against the frozen registry before acceptance;
7. record reference-data version/digest with the job/result;
8. reject the batch if unresolved reference data remains.

Closed registries such as allergens, MealArchetype, DayArchetype and ingredient state cannot be expanded by candidate generation.

## Production 4P-C industrialized scale protocol

After the 4P-B pilot is actually complete, post-pilot production batches use the 4P-C control plane.

1. Generate `corpus/reports/scale-gate-500.json`. If its status is `blocked`, stop; do not plan/generate scale candidates.
2. Scan the complete current corpus and plan exactly one next production `RecipeGenerationJob` from that fresh snapshot.
3. Create a deterministic job-specific intake with `npm run corpus:production-job-intake`; every record starts `discovered/pending`.
4. Complete reference scanning and resolve every reference/ingredient request before setting records `ready_for_generation`.
5. Generate exactly the job candidate IDs; do not substitute ad-hoc IDs.
6. Execute with `npm run corpus:production-run-batch`, not the development processor.
7. Inspect the `ProductionRecipeBatchReport`: accepted, rejected, duplicate, needs_reference_review, needs_recipe_review and nutrition_outlier are distinct dispositions.
8. Resolve `needs_reference_review` through canonical reference-data/ingredient governance. Resolve recipe/nutrition review through `npm run corpus:production-review`; never edit the report to make it pass.
9. Apply only with `npm run corpus:production-apply`; it requires zero review backlog, target/diversity pass and matching result digest.
10. Re-scan the full applied corpus. Never run the next job against the previous snapshot.
11. Continue until Scale Gate 500 passes. Do not continue to later scale checkpoints while the 500 gate is not passed.

A 4P-C control-plane implementation is not evidence that 4P-B or Scale Gate 500 is complete. Current blocked data gates must remain visible in reports.
