# Reference Data / Corpus Pipeline Revision Report

## Scope

This revision updates the normative Markdown specifications and the bundled `yourdietmanager-builder` Skill after the RC data/UX audit. It does **not** yet implement the new registry stores, migrations or UI configurators; those are the next hardening implementation pass.

## Decisions captured

- engine-consumed semantic values must use canonical reference IDs, never free-text strings;
- closed system registries and extensible curated taxonomies are explicitly separated;
- food groups/subgroups, cuisine, recipe family and semantic tags become registry-driven;
- recipe/ingredient forms share one MealArchetype rule: all selected by default, minimum one;
- all current recipes/ingredients are editable regardless of origin through new immutable historical versions/revisions;
- recipe/ingredient detail must not depend on a generated plan;
- corpus orchestration must detect reference-data gaps before batch generation;
- the recipe pipeline may propose/materialize extensible taxonomy terms before using them;
- missing ingredients may be materialized only from verified sources and only after normal production quality gates;
- closed registries cannot be extended by recipe generation;
- legacy semantic strings require explicit exact/alias/manual mapping, with unresolved values blocking production;
- production corpus build remains paused until reference-data hardening is implemented and validated.

## New normative documents

- `specs/REFERENCE_DATA_TAXONOMY_SPEC.md`
- `DATA_UX_HARDENING_REVISION.md`
- `skills/yourdietmanager-builder/references/reference-data-taxonomy.md`

## Updated specification documents

- `SPEC_README.md`
- `README.md`
- `specs/INGREDIENT_TAXONOMY_SPEC.md`
- `specs/RECIPE_PIPELINE_GENERATOR.md`
- `specs/RECIPE_CORPUS_ORCHESTRATOR_SPEC.md`
- `specs/DATA_PROVENANCE_QUALITY_SPEC.md`
- `specs/RECIPE_CATALOG_SPEC.md`
- `specs/FOUNDATIONAL_DECISIONS_V1.md`
- `specs/DATA_MODEL_SPEC.md`
- `specs/ARCHITECTURE_SPEC.md`
- `specs/JSON_STORAGE_SPEC.md`
- `specs/INITIAL_RECIPE_CORPUS_PLAN.md`
- `specs/ROADMAP_V1.md`
- `specs/TEST_STRATEGY.md`
- `corpus/CANDIDATE_GENERATION_PROTOCOL.md`
- `corpus/README.md`
- Phase 4/8 reports include post-RC gate addenda.

## Skill update

The project Skill now instructs future agents to:

- read the reference-data taxonomy rules for any matching/filtering/classification work;
- never introduce semantic free-text fields where registry IDs are required;
- create/reference taxonomy prerequisites before generating recipes;
- curate missing ingredients rather than fabricate nutritional/safety data;
- keep editing available for all recipe/ingredient origins while preserving historical versions.

The Skill validator passes and the complete updated Skill is packaged as `skills/dist/skill.zip`.

## Verification

- Skill validator: PASS.
- Full application `npm run check`: PASS.
- JavaScript syntax check: 83 files PASS.
- Automated tests: 80/80 PASS.
- Accessibility source audit: 16/16 PASS.
- 10k scale benchmark: PASS.
- Production build: PASS.
- GitHub Pages artifact audit: PASS.

No runtime behavior is claimed changed by this documentation/Skill revision.
