# Production Recipe Pipeline & Scale Gate 500 — 4P-C

Status: **normative for Phase 4 production Pass C control plane**.

4P-C industrializes recipe generation after the 4P-B pilot. It does **not** authorize scale-up while 4P-B production data/pilot is incomplete. The current repository may implement this control plane while the scale gate remains blocked.

## 1. Scope

4P-C introduces four production-only controls:

1. a versioned production recipe pipeline policy;
2. deterministic candidate disposition/quality reporting for every generated batch;
3. explicit review/retry handling for non-terminal recipe and nutrition findings;
4. a cumulative **Scale Gate 500** that must pass before later scale checkpoints.

The machine-readable policy is:

`corpus/production/v1-recipe-pipeline-policy.json`

Identity: **`recipe-production-pipeline-v1@1.0.0`**.

It is bound to:

- `ydm-v1-production-corpus@1.0.0`;
- `corpus-policy-v1-default@1.1.0`;
- `ingredient-curation-v1@1.0.0`;
- `recipe-pipeline-2-production-intake`.

4P-C does not weaken or replace any 4P-A/4P-B gate.

## 2. Hard prerequisite: 4P-B closure

Before a scale intake may be created or a 4P-C batch may run:

- `ProductionCorpusReadinessReport.readyForPilot = true`;
- all 120 pilot records are terminal (`accepted` or `rejected`);
- unresolved pilot reference requests = 0;
- unhandled pilot `ReferenceDataProposal` records = 0.

If any condition is false, Scale Gate 500 is `blocked` and the 4P-C scale runner must refuse execution.

The final 3,000-recipe release count is **not** a prerequisite for starting Scale Gate 500.

## 3. Scale-job intake

Every production `RecipeGenerationJob` after the pilot receives its own `ProductionCorpusIntake` ledger.

Create it with:

```bash
npm run corpus:production-job-intake -- <job.json> <scale-gate-500.json> [contract.json] [output-intake.json]
```

The intake is deterministic from job identity, seed, frozen reference-data snapshot and candidate count.

Every new record starts:

- `state = discovered`;
- `referenceScanStatus = pending`;
- zero implicit reference requests;
- stable `candidateId`.

Never create a scale intake while the Scale Gate 500 report is `blocked`.

## 4. Industrialized candidate dispositions

The production batch report has exactly these dispositions:

| Disposition | Terminal | Intake mapping | Meaning |
|---|---:|---|---|
| `accepted` | yes | `accepted` | all deterministic gates passed |
| `rejected` | yes | `rejected` | hard generation/constraint failure |
| `duplicate` | yes | `rejected` | exact/near duplicate; no recipe is emitted |
| `needs_reference_review` | no | `needs_reference_review` | semantic registry/taxonomy resolution needed |
| `needs_recipe_review` | no | `generated` | editorial/culinary/localization review needed |
| `nutrition_outlier` | no | `generated` | quantity/nutrition plausibility requires review/regeneration |

Do not collapse the three review dispositions into generic rejection. A non-terminal finding must remain visible to the operator and must prevent batch application.

## 5. Ordered objective quality stages

The policy freezes this order:

1. `intake`;
2. `structure_localization`;
3. `ingredient_normalization`;
4. `nutrition`;
5. `semantic_references`;
6. `culinary_review`;
7. `duplicate_diversity`;
8. `schema_provenance`.

Weights sum to 100. V1 production acceptance requires the full score **100/100**. A failure receives the score accumulated before its failing stage.

This score is an audit/triage metric, not an LLM opinion score. Culinary plausibility remains an explicit reviewed field.

`macro_energy_mismatch` is a blocking warning in production when all contributing ingredient energy values are comparable under Atwater General (or have no explicit source-basis metadata). USDA Atwater Specific and SR Legacy energy values must not be forced through a General-factor 4/4/9 comparison; provenance and the remaining nutrition gates still apply.

## 6. Batch report and immutable digest

Run a post-pilot production batch with:

```bash
npm run corpus:production-run-batch -- \
  <catalog-data-dir|bundle.json> \
  <fresh-snapshot.json> \
  <job.json> \
  <job-intake.json> \
  <candidates.json> \
  <result.json> \
  <batch-report.json> \
  [updated-intake.json]
```

The runner requires:

- Scale Gate 500 not `blocked`;
- fresh corpus snapshot matching `job.orchestration.inputSnapshotId`;
- matching production contract/policy/reference-data bindings;
- every supplied candidate intake record `ready_for_generation`;
- zero unresolved intake requests.

The `ProductionRecipeBatchReport` records every candidate disposition, failed stage, quality score, warnings and resulting version ID where applicable.

`resultDigest` binds:

- job ID;
- pipeline policy ID/version;
- input snapshot ID;
- candidate decisions;
- accepted RecipeVersion content hashes.

A modified result/report pair must fail verification.

## 7. Batch gate

A batch is applicable only when:

- `batchGate.status = pass`;
- accepted count reaches `targetAcceptedCount`;
- diversity passes after removing quarantined candidates;
- review backlog = 0;
- result/report digest verifies.

`duplicate` and hard `rejected` candidates are ordinary oversampling outcomes and do not by themselves block a batch if the net target is still met.

`needs_reference_review`, `needs_recipe_review` and `nutrition_outlier` create review backlog and therefore block application.

## 8. Review and retry

Recipe/nutrition review decisions use `ProductionRecipeReviewDecisions`:

```bash
npm run corpus:production-review -- \
  <intake.json> <batch-report.json> <review-decisions.json> [updated-intake.json]
```

Only `needs_recipe_review` and `nutrition_outlier` are handled by this review file.

Actions:

- `retry`: return the record to `ready_for_generation` after explicit reviewer notes;
- `reject`: make it terminal rejected.

Maximum attempts per candidate: **3**.

`needs_reference_review` must instead be resolved through the existing `ProductionCorpusIntake.referenceRequests` + `ReferenceDataProposal` / ingredient curation lifecycle. Do not use recipe review to bypass taxonomy/reference governance.

## 9. Production apply

Apply only a verified industrialized batch:

```bash
npm run corpus:production-apply -- \
  <catalog-data-dir|bundle.json> \
  <result.json> \
  <batch-report.json> \
  [output-bundle.json] \
  [targetCatalogVersion]
```

The production apply command:

- rejects any batch with review backlog;
- rejects failed target/diversity gates;
- verifies the immutable digest;
- rejects family/version ID collisions;
- preserves taxonomies, taxonomy terms, ingredients and reference-data snapshot identity in the staging bundle.

After every applied batch, re-scan the full corpus and plan from the new snapshot. Never reuse a stale job/snapshot pair.

## 10. Scale Gate 500

Generate the gate with:

```bash
npm run corpus:scale-gate-500
npm run corpus:scale-gate-500 -- --strict
```

States:

- `blocked`: 4P-B prerequisites or corpus quality are not valid;
- `ready`: 4P-B prerequisites pass but active corpus has not yet reached 500;
- `pass`: active corpus >=500 and all 500-gate quality/coverage checks pass.

Hard quality checks at 500:

- schema errors = 0;
- unknown ingredient references = 0;
- deterministic nutrition errors = 0;
- allergen derivation errors = 0;
- missing required locale fields = 0;
- exact duplicates = 0;
- near duplicates <= policy maximum (V1: 0).

### 10.1 Coverage at 500

Release hard-minimum coverage targets are scaled proportionally from the 3,000-recipe release floor:

`requiredAt500 = ceil(releaseMinCount * 500 / 3000)`

This avoids inventing a second independent coverage matrix. Soft/share targets continue to guide the orchestrator but do not become new hard 500 gates.

## 11. 4P-C completion definition

### Control plane implemented

Requires:

- pipeline policy + schemas;
- deterministic scale-job intake;
- industrialized batch report/dispositions/quality score;
- stale-snapshot protection;
- explicit review/retry loop;
- digest-gated production apply;
- Scale Gate 500 report;
- automated tests and docs/Skill alignment.

### Scale Gate 500 complete

Requires, in addition:

- 4P-B data/pilot complete;
- production scale batches actually executed;
- >=500 active production RecipeVersion records;
- zero review backlog;
- all hard quality checks pass;
- all pro-rata hard coverage checks pass;
- Scale Gate 500 status = `pass`.

Do not label 4P-C scale execution complete while the current 4P-B gate remains blocked.

## 12. 4P-D Pass A — Controlled Scale 220 -> 500

After the real source-backed workflow has committed the 220-recipe working set and Scale Gate 500 is `ready`, the first controlled-scale milestone uses `controlled-scale-500-v1@1.0.0`.

The plan bridges exactly **220 -> 500** active recipes as three checkpointed tranches:

1. 100 accepted breakfast/snack recipes -> 320;
2. 100 accepted lunch/dinner recipes -> 420;
3. 80 accepted balanced-close recipes -> 500.

Every cell freezes one canonical `mealArchetype` and one canonical `energyBandId`. The controlled generator is not authorized to invent cuisine, preparation taxonomy, protein/fiber bands or other semantic targets. Unsupported semantic constraints require a dedicated generator rather than silent inference.

Run each tranche independently:

```bash
npm run corpus:scale-to-500 -- <220-bundle.json> <out-1> --tranche=1 --canonical
npm run corpus:scale-to-500 -- corpus/production/current-working-bundle.json <out-2> --tranche=2 --canonical
npm run corpus:scale-to-500 -- corpus/production/current-working-bundle.json <out-3> --tranche=3 --canonical
```

Resume is fail-closed: tranche 1 requires exactly 220 active recipes, tranche 2 exactly 320 and tranche 3 exactly 420. Any other count is ambiguous and must be rejected.

Each tranche must have:

- exact planned accepted count;
- zero review backlog;
- zero schema/reference/nutrition/allergen/locale errors;
- zero exact duplicates and zero near duplicates;
- batch gates passing for every cell;
- a full corpus scan after every applied cell;
- Scale Gate 500 `ready` after tranches 1 and 2;
- Scale Gate 500 `pass` after tranche 3.

Canonical evidence must accumulate checkpoints across split invocations. A later tranche must never overwrite the audit record of an earlier completed tranche.

The freshness guard still compares the same canonical content digest. It may compute that identity directly from active RecipeVersion content hashes and IngredientRevision content hashes rather than rerunning unrelated coverage/similarity analysis before every cell.

`.github/workflows/controlled-scale-500.yml` is the canonical repository runner. By default it uploads evidence only. `commit_results=true` may commit the verified 500-recipe working set after the final strict Scale Gate passes.

The real rc.21 verification reached **500 active recipes / Scale Gate 500 = pass** with zero hard coverage blockers and zero quality/similarity errors. This milestone does not satisfy the 3,000-recipe V1 release minimum.
