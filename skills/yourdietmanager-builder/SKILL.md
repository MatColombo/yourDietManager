---
name: yourdietmanager-builder
description: "Design, build, review, or extend the yourDietManager local-first PWA and its configurable V1 domain. Use for specs, schemas, IndexedDB/repositories, migrations, configuration editors, canonical reference-data/taxonomy registries, catalog import/update, nutrition/constraints, recipe and ingredient authoring, corpus orchestration/generation, plan generation, shopping, i18n, theming, backup, QA, or implementation work. Also use when generating or validating catalog content: enforce deterministic nutrition, canonical taxonomy IDs, audited creation of required taxonomy terms/ingredients, historical version integrity, and no automatic portion scaling."
---

# yourDietManager Builder

## Core invariants

Preserve these rules:

1. Treat TataDiet V5.2.1 as legacy/reference only; never reintroduce its fixed shift matrix or calorie assumptions.
2. Keep V1 backend-free/local-first: JSON catalog shards are canonical distribution data; IndexedDB `yourDietManager` is the runtime structured store; JSON is backup/export.
3. Access IndexedDB through repositories/services. Domain engines and UI must not depend directly on objectStore/keyPath details.
4. Keep cycle length configurable 1–31 and independent of civil month length.
5. Keep DayArchetype and MealArchetype as closed system registries, while DayClass and MealClass are user-configurable data. Ingredient and recipe forms select all MealArchetypes by default and require at least one.
6. Determine cross-midnight behavior from slot `dayOffset`; use explicit IANA timezone in AppConfig.
7. Treat allergies and intolerances as hard constraints. Never downgrade them to preference penalties.
8. Treat nutrition targets and ordinary food preferences as soft constraints unless explicit voluntary exclusion is configured.
9. Never auto-scale recipe servings in plan generation. Each automatic recipe component is exactly one standard serving.
10. Use stable Ingredient/Recipe family IDs plus immutable historical IngredientRevision/RecipeVersion records. Any current ingredient/recipe is user-editable regardless of origin by creating a new revision/version and advancing the family pointer. Planned meals reference `recipeVersionId`; recipe lines reference `ingredientRevisionId`.
11. Calculate nutrition deterministically from frozen IngredientRevision quantities. Never invent final nutrient values with an LLM.
12. Stage/validate catalog updates and switch active catalogVersion atomically; never mutate a published historical version.
13. Record GenerationRun seed, solver/generator version, catalogVersion and config snapshot/hash so generation is reproducible/explainable.
14. Build IT/EN localization from the start; keep IDs language-neutral and canonical quantities metric.
15. Keep ordinary UI compact/task-oriented. While the onboarding wizard is disabled, do not require it for app use; provide essential guidance contextually/help and bootstrap fresh installs with a neutral standard configuration.
16. Treat theme, density and DayClass colors as user data with accessibility guardrails.
17. Shopping may multiply ingredient quantities by a decimal people multiplier without changing the diet user's nutrition plan.
18. Data is local by default; backup/export/delete/rebuild catalog are separate explicit operations.
19. Never persist engine-consumed semantic categories as free text. Use canonical reference-data/taxonomy IDs selected from registries; labels/aliases are presentation/search only.
20. Let the corpus pipeline propose/materialize missing extensible taxonomy terms and curate missing ingredients before recipe generation; never invent semantic strings, nutrient facts or allergens inside a candidate recipe.
21. Preserve editor state. Adding/removing/reordering form elements or background rerenders must not collapse unrelated disclosures or wipe an unsaved draft. Centralize disclosure state instead of relying on recreated DOM defaults.
22. Guard every editable route with one dirty-navigation mechanism covering internal links, browser Back/Forward and reload/close. Explicit save/discard clears dirty state; programmatic field changes must mark dirty too.
23. Every explicit save must produce persistent visible success/failure feedback. Live form validation should prevent ordinary schema/cross-record/reference-data errors from being deferred until persistence.
24. Treat Pass E final acceptance as a release invariant: browser interaction coverage must exercise required-field/schema parity, disclosure preservation across local rerenders, dirty-navigation reject/accept, persistent save feedback, and plan-independent recipe/ingredient detail/edit. A skipped browser run is never equivalent to passed when the environment marks browser verification required.
25. Treat Phase 4 production corpus as a contract-bound data pipeline. Before production recipe generation require the versioned ProductionCorpusContract, >=400 current curated/high ingredients, a frozen reference-data snapshot, explicit pilot intake states, and zero unresolved taxonomy/ingredient requests. Production candidates may only enter deterministic processing from `ready_for_generation`; never bypass intake by using development fixtures or provisional semantic strings.
26. Treat 4P-B ingredient import as review intake, never publication. Use the frozen trusted-source policy (Foundation primary, SR Legacy supplemental, no Branded), require source/input digests and explicit review fields for labels, taxonomy, state, allergens, culinary suitability, duplicates, nutrition and provenance before `curated/high` materialization. A deterministic reviewer may populate those checks only for strict generic, nutrient-complete, rule-mappable USDA records under the execution companion spec; it must reject ambiguous records, never fuzzy-merge concepts or create taxonomy terms, preserve reviewer/FDC/source audit data, and preserve USDA energy basis. Prefer Foundation nutrient 2047 Atwater General over 2048 Specific regardless of JSON ordering; never reject 2048/SR Legacy energy merely for differing from a General-factor 4/4/9 calculation. Never implicitly retire fixtures. Execute the production pilot only in ordered 20-candidate waves; do not start the next wave until the previous one is terminal with zero unresolved references/proposals.
27. Treat 4P-C scale execution as gated industrial production. Do not create scale job intake or run post-pilot batches while Scale Gate 500 is blocked by unfinished 4P-B data/pilot. For each scale job use a deterministic ProductionCorpusIntake, require a fresh matching snapshot, classify every candidate into explicit accepted/rejected/duplicate/reference-review/recipe-review/nutrition-outlier disposition, keep review findings non-terminal, verify the result/report digest before apply, cap retries, and re-scan/re-plan after each applied batch.

Read `references/invariants.md` and `references/persistence.md` when architecture, storage, identity, catalog updates or migrations are involved. Read `references/reference-data-taxonomy.md` whenever a field can affect matching, filtering, scoring, generation or catalog classification.

## Workflow decision tree

### Product/domain design

1. Read `references/domain-model.md`.
2. Identify affected entities and hard/soft constraints.
3. Update JSON contracts before UI behavior when domain data changes. Classify each field as free text, numeric, closed enum, reference entity, taxonomy, multi-reference or derived data.
4. Preserve stable IDs and historical version references.
5. Define persistence/index/migration effects if the change creates new query patterns. Do not create semantic free-text fields where a registry/reference is required.
6. Use neutral work/life schedule examples, not nurse-specific assumptions.

### Recipe catalog generation

1. Read `references/recipe-pipeline.md` and `references/reference-data-taxonomy.md`; for corpus-level BUILD/EXPAND/IMPROVE requests also read `references/corpus-orchestrator.md`.
2. For corpus-level requests, derive the next batch from versioned corpus policy + fresh snapshot instead of asking the user to micro-plan bands/families/cuisines.
3. Load the versioned ProductionCorpusContract for production targets and resolve all semantic criteria to canonical registry IDs. If an extensible taxonomy term or ingredient is missing, record it in ProductionCorpusIntake, create/propose and validate that prerequisite before recipe candidates.
4. For production ingredient prerequisites, load the 4P-B curation policy and `PRODUCTION_CORPUS_EXECUTION_SPEC.md` when executing the missing data steps. Acquire only declared trusted source data, preserve archive/input digests, treat importer mappings as pending suggestions, and require all eight review checks before materializing `curated/high`. Foundation is primary and SR Legacy is supplemental; do not use Branded or fuzzy source merges. Preserve energy nutrient semantics: Foundation prefers 2047 General, then 2048 Specific, while SR Legacy keeps 1008 as its historical primary energy field. Apply a 4/4/9 blocking comparison only when the selected energy basis is General-comparable. Deterministic review is allowed only after import and only inside the bounded generic/rule-mappable criteria; otherwise leave the record for explicit human review.
5. Require IngredientRevision records with complete minimum nutrition and provenance.
6. Record mode/goal/seed, reference-data version/digest and production contract ID/version/digest in a traceable RecipeGenerationJob before production candidate generation.
7. Generate structured ingredient IDs/revision IDs/amounts and canonical taxonomy term IDs first.
8. Calculate nutrition deterministically.
9. Validate hard constraints, units, taxonomy references and culinary plausibility.
10. Deduplicate against accepted RecipeVersion records and enforce diversity targets.
11. Generate/localize text only after structure is frozen.
12. For production, process only intake records in `ready_for_generation`; emit reference-data changes first, then Recipe/RecipeVersion JSON shards plus acceptance/coverage/QA report, update intake outcomes, rebuild the snapshot, then choose the next batch.
13. After the 4P-B pilot, require the 4P-C pipeline policy and Scale Gate 500. Create one deterministic intake per RecipeGenerationJob, reject stale snapshots, preserve explicit non-terminal review dispositions, and apply only digest-verified batches with zero review backlog and passing target/diversity gates. For the rc.13 execution bridge, require the exact sequence official-source acquisition -> bounded review -> materialization -> explicit fixture retirement -> 120/120 pilot -> Scale Gate `ready` -> first 100-accepted industrialized batch; never treat the network workflow itself as a V1 release.
14. Run a test JSON -> IndexedDB import and query gate before catalog release.

Never generate thousands of recipes in one unreviewed blob. Use adaptive targeted batches selected by coverage/diversity/similarity scoring.

### Application implementation

1. Keep domain logic DOM-independent.
2. Implement `db` + repository layer before feature UI.
3. Import catalog JSON shards into IndexedDB using manifest/checksums/schema validation.
4. Make catalog update atomic and recoverable.
5. Keep user records structured-clone safe and JSON-exportable.
6. Use canonical dynamic detail/edit routes for recipes and ingredients. Recipe/ingredient detail must resolve from catalog repositories and never depend on an existing plan.
7. Reuse `src/ui/guidedControls.js` and the reference-data services for semantic inputs. Never reintroduce free-text/CSV taxonomy IDs, ad-hoc ingredient references or unrestricted unit strings.
8. Localize closed enum labels while persisting stable IDs; for extensible taxonomies, create terms only through the governed reference-data lifecycle.
9. Reuse `src/ui/uiState.js` for disclosure state, dirty navigation and persistent notifications. Do not introduce raw feature-level `history.pushState` or uncontrolled `<details>` that can lose state on rerender.
10. On fresh installs use the neutral standard bootstrap; do not revive the provisional onboarding flow until its redesign is explicitly requested. Preserve explicitly saved/imported user configuration during bootstrap upgrades.
11. Make forms live-validate against schema + cross-record + reference-data rules; required blank numeric inputs stay invalid rather than coercing to zero/default.
12. Treat `origin` as provenance/management state, not an edit permission. Editing a bundled family keeps its stable family ID, creates a new user revision/version, promotes the family to local management and preserves all historical records; catalog updates must not overwrite the local current pointer.
13. Keep duplicate separate from edit: duplicate creates a new family ID; edit advances the same family.
14. Add migration, historical-reference, hard-constraint, cycle/carry-over, no-scaling, i18n, backup, detail-route and editor-integrity tests before calling a feature complete.

### Review/QA

Read `references/quality-gates.md`. Run `npm run hardening:forms` when editor/configuration behavior changes and include `npm run hardening:browser` plus `npm run hardening:revision` before closing a Data/UX hardening correction pass. Treat any hard-constraint violation, unresolved version reference, non-deterministic nutrition, destructive migration, partially activated catalog update, form/schema mismatch that can be normally persisted, or silent unsaved-draft loss as a release blocker.

## Output conventions

For specifications:

- State decisions first.
- Separate hard constraints from soft constraints.
- Include JSON examples for changed contracts.
- State IndexedDB store/index/migration implications when relevant.
- List deliberate V1 deferrals explicitly.
- Prefer stable IDs/enums over localized strings.
- For any engine-consumed semantic field, require a canonical registry/reference ID and guided selector; never rely on user memory or CSV text.

For recipe batches:

- Return machine-usable JSON separately from narrative QA.
- Include coverage/reject counts and provenance.
- Keep `servingCount = 1`.
- Keep IT/EN text complete for accepted records.

## References

- `references/invariants.md` — architectural non-negotiables.
- `references/persistence.md` — JSON/IndexedDB/repository/migration/versioning model.
- `references/domain-model.md` — domain entities, archetypes, carry-over, constraints.
- `references/recipe-pipeline.md` — generation workflow and catalog gates.
- `references/corpus-orchestrator.md` — policy/snapshot/scoring and automatic next-batch planning.
- `references/reference-data-taxonomy.md` — canonical registries, taxonomy governance, guided inputs and pipeline-created prerequisites.
- `references/quality-gates.md` — testing/release checklist.
