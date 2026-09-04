# Reference data and taxonomy rules

Use this reference whenever forms, filters, rules, recipe generation, ingredient generation, catalog metadata or corpus coverage depend on semantic categories.

## Non-negotiable rule

If a value will later be compared, filtered, aggregated or interpreted, persist a canonical registry ID, never user-entered semantic text. Labels, aliases and legacy keys are UI/search/import aids only.

## Current Pass A-E implementation

The current runtime is:

- `DB_VERSION=4`;
- `contentSchemaVersion=3`;
- stores `taxonomies` and `taxonomyTerms`;
- bundled reference-data seed version `1.0.0`;
- 7 V1 taxonomies / 113 seed terms;
- catalog manifest and RecipeGenerationJob frozen by `referenceDataVersion` + `referenceDataDigest`;
- `contentMigration:3` for legacy semantic values;
- guided taxonomy/reference-data configurator at `/configure/reference-data`;
- reusable autocomplete, multi-select chips, hierarchical category selector and ingredient-aware unit selector;
- operational semantic forms persist canonical IDs and do not expose CSV/free-text semantic entry.

Pass C owns navigation/dirty-state/save-feedback/no-collapse/onboarding fixes. Pass D implements plan-independent recipe/ingredient detail plus edit-any-origin with stable-family local overrides and immutable historical revisions/versions. Pass E browser-validates the final interaction contracts and closes the revision with a machine-checkable code/spec/Skill/CI gate.

## Registry classes

### Closed system registries

Do not extend automatically:

- allergens;
- MealArchetype;
- DayArchetype;
- ingredient state;
- canonical units/technical enums.

Unknown values are blockers.

### Curated extensible taxonomies

Current taxonomy IDs:

- `food_category` — hierarchical food groups/subgroups;
- `cuisine`;
- `recipe_family`;
- `diet_tag`;
- `practical_tag`;
- `flavor_profile`;
- `preparation_technique`.

Each term needs stable `termId`, `taxonomyId`, localized labels, aliases, `legacyKeys`, status, provenance, search tokens and optional parent. Reject parent cycles, cross-taxonomy parents, ambiguous normalized collisions and invalid supersede references.

For V1 food-category matching, compare group rules exactly to `IngredientRevision.taxonomy.foodGroup` and subgroup rules exactly to `.foodSubgroup`. Use hierarchy to validate/guide selection; do not infer recursive descendant matching unless a future contract explicitly adds it.


## Guided form controls

For operational forms, use the shared guided-control infrastructure instead of ad-hoc inputs:

- taxonomy/reference values: autocomplete that returns an existing canonical ID;
- multi-valued taxonomy fields: canonical chip multi-select;
- food group/subgroup: hierarchical selector where subgroup options are constrained by the selected group;
- ingredient references: searchable ingredient chooser that persists `ingredientRevisionId`/family identity as required by the contract;
- recipe-line units: offer only the ingredient basis unit plus declared conversions;
- closed enums: localized labels over stable internal IDs;
- aliases/descriptions/notes: ordinary text/token entry is allowed because these are descriptive/search metadata, not engine references.

Do not add a text box or CSV field for a value consumed by matching, filtering, scoring, generation or validation. If a required extensible term does not exist, create it through the reference-data editor/proposal lifecycle first.

## Pipeline behavior

Before recipe candidate generation:

1. require `RecipeGenerationJob.referenceDataVersion/referenceDataDigest`;
2. load the exact reference-data snapshot and verify the digest;
3. resolve requested concepts to canonical term IDs;
4. detect missing terms or ingredients;
5. for extensible taxonomies, emit `ReferenceDataProposal` with parent, IT/EN labels, aliases, rationale and provenance;
6. collision => `needs_review`; materialize only an approved valid proposal;
7. for a missing ingredient, source and curate nutrition/state/allergens/taxonomy/provenance before use;
8. semantic-validate IngredientRevision/RecipeVersion against the registry before acceptance;
9. continue the job using canonical IDs only.

Never put provisional strings into RecipeVersion or IngredientRevision with the intention of normalizing later.

## Meal archetypes

Use the same rule for ingredients and recipes:

- all archetypes selected by default in creation UI;
- at least one required to save;
- all selected means compatible with all;
- zero selected is invalid, not shorthand for all.

The schemas enforce `minItems:1`, and Pass B implements the same all-selected creation default in both ingredient and recipe forms. Do not reintroduce a zero-selection shorthand.

## Editing and history

All current recipes and ingredients must be user-editable regardless of origin. Editing creates a new immutable RecipeVersion/IngredientRevision and advances the family current pointer. Historical versions/revisions are never overwritten. The UI implementation of base-origin editing is Pass D.

## Migration/release gates

Enumerate every legacy semantic value and classify it as `resolved_exact`, `resolved_alias`, `resolved_manual` or `unresolved`. `unresolved > 0` blocks migration/release.

`contentMigration:3` must not mutate historical IngredientRevision/RecipeVersion rows. Create new current revisions/versions when canonical references change, and migrate mutable configuration records atomically.

Production release additionally requires zero unresolved taxonomy IDs, a manifest digest matching the distributed reference-data shards, and provenance for pipeline-created reference data.
