# Quality gates

## Persistence

- Empty DB bootstraps catalog from JSON successfully.
- Reopen/refresh preserves user state.
- Structural/content migration preserves all user records.
- Failed catalog update leaves previous catalog active.
- Base catalog can rebuild without deleting user data.
- Backup JSON round-trip preserves configuration/custom content/plans/history.

## Domain

- Cycle accepts 1–31 independent of month length.
- Every DayClass/MealClass references a known archetype.
- Every slot civil date = diet date + dayOffset in configured timezone semantics.
- External slots generate no shopping ingredients.

## Safety

- Zero auto-selected recipes violating allergy/intolerance.
- Allergens derive from IngredientRevision records, not title matching.
- Missing relevant allergen metadata is a catalog blocker.

## Version integrity

- PlannedMeal recipeVersionId always resolves.
- RecipeVersion ingredientRevisionId always resolves.
- Editing current ingredient/recipe never mutates historical plan nutrition.

## Recipe catalog

- 100% JSON Schema valid.
- 100% revision references resolve.
- Required nutrition calculated for 100% accepted versions.
- `servingCount` exactly 1.
- No NaN/Infinity/negative nutrients.
- Zero exact duplicates.
- IT/EN text complete.
- provenance/contentHash/inputDigest present.

## Generator

- No automatic portion multiplier !=1.
- Same catalog/config/solver/seed reproduces same output.
- Failure to meet soft targets never violates hard constraints.
- Failure diagnostics identify the blocking class.

## Scale/UI

- Catalog scale tested 1k/5k/10k RecipeVersion.
- Candidate retrieval uses IndexedDB indexes; no full catalog DOM rendering.
- Theme retains accessible focus/contrast.

## Contract hardening

- Canonical allergen IDs validate through the shared enum; unknown IDs are rejected.
- Every declared IndexedDB V1 store has a schema/example contract.
- DayClass overlapping slots require explicit `parallel=true`.
- 24h times reject values outside 00:00–23:59.
- External slots persist the declared estimate policy without inventing nutrients.
- Theme save rejects essential text/background contrast below WCAG AA thresholds.
- Per-meal adherence is writable from UX and day status remains a deterministic summary.
- Plan horizon end follows an explicit continuation policy and never mutates prior GenerationRun snapshots.
- Shopping checklist refresh preserves manual items.


## Reference data

- Zero unresolved semantic free-text values in reference-driven fields.
- Every taxonomy/reference ID resolves in the registry snapshot used by the record/job.
- Hierarchies have no cycles/cross-taxonomy parents.
- Closed registries cannot be extended by recipe generation.
- Pipeline-created taxonomy terms have localized labels, rationale/provenance and collision checks.
- Pipeline-created ingredients pass normal production nutrient/allergen/provenance gates before recipe use.
- Legacy semantic migration has zero unresolved values before production corpus/release.
- Ingredient and recipe forms use identical MealArchetype semantics: all selected by default, minimum one.


## Editor integrity / Pass C

- Fresh install uses the neutral standard bootstrap; provisional onboarding is not a prerequisite for app use.
- An untouched legacy bootstrap may upgrade automatically; explicitly saved/imported user configuration is never overwritten by bootstrap migration.
- Feature editors use centralized disclosure state so add/remove/reorder actions do not collapse unrelated sections.
- Background/full rerenders do not replace a dirty editor.
- Editable routes use the centralized dirty-navigation guard for internal links, browser history and reload/close.
- Programmatic semantic-control changes mark the draft dirty like native inputs.
- Explicit saves always emit persistent success/failure feedback through an accessible live region.
- Live validation blocks Save when schema, cross-record or reference-data diagnostics are unresolved.
- Required numeric blanks remain invalid; never silently coerce empty input to zero/default.
- DayClass capability inputs write only to `DayClass.capabilities`; non-free DayClass retains at least one meal slot.
- Run `npm run hardening:forms` plus the normal test/build/Page audits for editor changes.
## Detail/edit integrity / Pass D

- Recipe detail and ingredient detail resolve directly from catalog repositories with zero PlanInstance records.
- Canonical dynamic detail routes do not fall through to plan/today pages; trailing slashes normalize consistently.
- Edit is available for bundled/base and local/user families alike.
- Editing a bundled family preserves the stable family ID, creates a new immutable user revision/version and leaves historical records byte-for-byte unchanged.
- First edit promotes the family to local management; catalog update/rollback/pack install cannot overwrite its local current pointer.
- Export/import can carry a local family override with the same stable ID as a bundled family while immutable ID collisions remain forbidden.
- Duplicate remains a separate action that creates a new family.
- Dirty-route coverage includes dynamic recipe/ingredient edit routes.
- Run `npm run hardening:browser` for click-level recipe/ingredient regressions when the execution environment permits local HTTP Chromium access; a policy-blocked browser run must be reported as skipped, never as passed.



## Final acceptance / Pass E

- Browser acceptance checks a required numeric blank disables Save before persistence and becomes valid again when restored.
- A `controlledDetails` disclosure remains open after a real local editor rerender.
- Dirty routed navigation is rejected when discard confirmation is declined and proceeds only after explicit acceptance.
- A valid configuration edit produces persistent visible success feedback in the global notification region.
- Pass D recipe/ingredient detail -> edit flows remain in the same browser suite.
- `reports/pass-e-browser.json` is the canonical acceptance artifact; environment-policy skips are recorded as `skipped`, never `passed`.
- CI/release verification uses `YDM_BROWSER_REQUIRED=1`; in that mode only a passed browser report is acceptable.
- Run `npm run hardening:revision` after the browser gate to verify code/spec/Skill/CI alignment before declaring the correction revision closed.


## Phase 4 production corpus / 4P-A

- ProductionCorpusContract schema-valid and aligned with RecipeCorpusPolicy.
- Pilot target exactly 120 slots (100-150 allowed range), processed in waves rather than one unreviewed blob.
- At least 400 active current IngredientRevision records are production-ready (`curated/high`) before `readyForPilot=true`.
- Production planner excludes every ingredient that fails the production readiness contract.
- Every production candidate has a ProductionCorpusIntake record with completed reference scan.
- Zero unresolved taxonomy/ingredient requests before `ready_for_generation`.
- ReferenceDataProposal collisions never auto-resolve; materialization requires explicit approval.
- Job/intake/catalog referenceDataVersion and digest match exactly.
- Accepted RecipeVersion records retain candidate/intake/production-contract provenance.
- Production manifest records production contract/policy digest metadata.
- Release validation rejects current active RecipeVersion records missing production-intake provenance.


## 4P-B curation and pilot wave gates

- Curation policy validates and is bound to the production contract.
- Trusted source IDs, source record IDs and input digests are present.
- Branded source data is rejected for the V1 generic foundation.
- Imported mappings are pending suggestions; none of the editorial checks are inferred complete.
- Approved rows require all explicit review dimensions complete.
- Materialized revisions are `curated/high`, schema-valid and canonical-reference-valid.
- Existing ingredient family ID collisions fail merge; fixture retirement requires an explicit replacement map.
- At least 400 active production-ready ingredient families are required before pilot wave 1.
- Do not gate pilot wave 1 on the final 3,000-recipe count or production manifest; those belong to `readyForProduction`, not `readyForPilot`.
- Pilot waves contain 20 deterministic candidate slots.
- Wave N+1 cannot start until wave N is terminal.
- Wave close requires zero unresolved reference requests and zero unhandled taxonomy proposals.
- Missing trusted source data or an absent curation batch is `blocked`, never skipped/passed.


## 4P-C / Scale Gate 500

- Never create/run scale intake while 4P-B pilot/reference/ingredient prerequisites leave Scale Gate 500 `blocked`.
- Require fresh snapshot identity/content before every post-pilot production batch.
- Require one explicit disposition per candidate; review dispositions are non-terminal and block apply.
- Require objective quality score 100/100 for accepted V1 recipes.
- Require result/report digest verification before apply.
- Require targetMet + diversityPassed + zero review backlog before production apply.
- Limit recipe/nutrition retry attempts to the pipeline policy maximum.
- At 500 active recipes require zero schema, ingredient-reference, nutrition, allergen, locale, exact-duplicate and near-duplicate errors.
- Require pro-rata hard coverage minima derived from the 3,000-recipe release floor.
- `corpus:scale-gate-500 -- --strict` remains non-zero until the real 500 gate passes.


## Phase 4 production execution bridge

- Treat importer output as pending review intake; deterministic approval is a separate reviewer step, never an importer side effect.
- Allow `ydm-deterministic-fdc-curator-v1` only for frozen USDA sources and only when generic-category, required-nutrient, taxonomy, allergen, state, duplicate and provenance rules are all deterministic and explicit.
- Reject gross macro/declared-energy mismatch during deterministic ingredient curation; do not repair nutrient values.
- Require explicit curated/high replacements for salmon, cooked rice, zucchini and olive oil before retiring Phase 1 ingredient fixtures; retire the three Phase 1 recipe fixtures only afterward and preserve all history.
- Require `readyForPilot=true` before pilot generation; require all six 20-candidate waves to close 120/120 accepted with zero unresolved references/proposals.
- Require Scale Gate 500 state `ready` before creating the first 4P-C batch; require that batch to pass its immutable digest/review/apply gate.
- Network/source unavailability is a blocked execution prerequisite, not a skipped/pass production-data gate.


## Production workflow test isolation

- Development-baseline tests must use immutable fixtures, not canonical `corpus/pilot`, retirement, reports, snapshots, runs/jobs/intake, or other paths mutated by production execution.
- Recreate a fresh pilot intake from the frozen contract/reference-data snapshot when testing pre-pilot behavior.
- Generated-production tests must take the generated bundle/artifact as explicit input.
- Require the full test suite to pass both on the pristine development tree and after canonical production execution artifacts are populated.


## 4P-D Pass A / controlled scale 500

- Validate the controlled-scale plan schema and contract/policy/pipeline bindings.
- Require exact bridge 220 -> 500 as 100 + 100 + 80 accepted recipes.
- Require exact tranche start counts 220/320/420; reject ambiguous partial resume.
- Require zero review backlog and zero schema/reference/nutrition/allergen/locale errors after every tranche.
- Require zero exact/near duplicates and all hard coverage floors at the final 500 checkpoint.
- Require Scale Gate 500 `ready` after tranches 1 and 2 and strict `pass` after tranche 3.
- Preserve all prior tranche evidence when later split invocations write canonical artifacts.
- Passing 500 is a scale milestone only; keep the 3,000-recipe release minimum and final production-manifest gate unchanged.


## Production Catalog Review 500 / Human Review Gate

- Require the committed working corpus to have exactly 500 active RecipeVersion records and Scale Gate 500 `pass` before controlled publication.
- Publish through catalog channel `production_review`, freeze exactly those 500 RecipeVersion IDs, set `requiredHumanReview=true` and keep `releaseEligible=false`.
- Require six explicit dimensions per recipe: culinary coherence, ingredient combination, quantity plausibility, instruction quality, title/description quality and differentiation.
- `approved` requires all six dimensions pass; `needs_changes`/`rejected` require at least one failed dimension and notes.
- Bind every decision to publication ID, catalog version, source-corpus digest, RecipeVersion ID and content hash; reject stale/mismatched decisions.
- Persist review state locally and include it in backup. Export/import only checksum-valid review bundles matching the exact frozen set.
- Strict Human Review Gate passes only with expected=500, reviewed=500, approved=500, needs_changes=0, rejected=0, unreviewed=0.
- Any non-approved recipe blocks further corpus scale until controlled remediation and re-review close it.
- A production-review catalog is not a V1 release. Keep the 3,000 release minimum/final manifest gates unchanged.
- Do not enforce a 5,000-recipe maximum. Legacy policy/contract 5,000 fields are advisory provenance references; generation may continue beyond them.

## Browser schema mirror gate
- Treat `schemas/` as canonical and `public/schemas/` as a deployment mirror.
- Require byte-for-byte equality for every file in the browser `SCHEMA_FILES` list.
- Validate representative production records with the public mirror, not only the canonical Node schema loader.
- Keep `additionalProperties:false` where defined; schema parity must be fixed by explicit fields, never by accepting arbitrary properties.
