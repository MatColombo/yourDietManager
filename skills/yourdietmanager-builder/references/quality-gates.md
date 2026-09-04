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
