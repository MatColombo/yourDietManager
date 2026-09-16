---
name: recipe-catalog-author
description: Generate deployable yourDietManager recipe-catalog batches from natural-language prompts. Use whenever the user asks to add, create, generate, expand, replace, or revise recipes for yourDietManager, including prompts that require ingredients not yet present. Inspect the current repository, reuse canonical ingredients and T4 culinary semantics, create fully sourced IngredientRevision v2 records and taxonomy metadata when needed, author sensible bilingual recipes, write one append-only data-proposals/recipes JSON batch, and validate it with the deterministic recipe publisher before delivery.
---

# Recipe Catalog Author

Generate catalog data that can go directly through:

`prompt -> data-proposals/recipes/<batch>.json -> npm run recipes:publish -> build/deploy -> app`

Do not invent a parallel pipeline. Do not stop at prose, a recipe list, or a Markdown brief when a repository is available: produce the deployable batch file.

## 1. Read the current repository before authoring

Never rely only on remembered catalog state. Inspect these sources in this order:

1. `data-proposals/active/culinary-generation-policy-v2/role-pools-v2.json`
2. `data-proposals/active/culinary-generation-policy-v2/archetypes-v2.json`
3. `data-proposals/active/ingredient-semantic-consolidation-round1/ingredient-semantic-proposal.json`
4. `data-proposals/active/ingredient-semantic-consolidation-round1/proposed-product-terms.json`
5. all existing `data-proposals/recipes/*.json`, excluding `*.example.json`
6. legacy base ingredient/reference shards under `public/data/ingredients/` and `public/data/reference-data/`
7. schemas relevant to any new records
8. `references/proposal-contract.md` in this skill

Treat the semantic corrections from the ingredient consolidation as authoritative over legacy source-facing names. Treat already-authored recipe batches as part of the current catalog when checking collisions and duplicates.

## 2. Interpret the prompt as a culinary brief

Extract without over-questioning:

- requested recipe count;
- meal distribution;
- cuisines/style;
- dietary constraints;
- ingredients to favor/avoid;
- prep/cook-time constraints;
- portability, no-cook, cold, meal-prep or reheating requirements;
- desired variety;
- whether the request is replacement, expansion, or both.

If the prompt leaves non-critical choices open, choose sensible defaults and proceed. Culinary plausibility has priority over filling a numerical quota with artificial combinations.

## 3. Resolve ingredients semantically, not by string matching

For each ingredient concept needed by a recipe:

1. Resolve the canonical ProductFood concept first.
2. Resolve the appropriate IngredientRevision/state second.
3. Check the T4 culinary role required by the recipe.
4. Reuse an existing revision only when identity, state and culinary use actually match.

Never collapse distinct foods merely because source descriptions share words. Never use a generic concept such as `other vegetable`, `other fruit`, `beans`, `fish`, etc. when a specific reviewed concept exists.

Keep these layers separate:

- canonical food identity: e.g. `Zucchina`;
- technical variant/state: e.g. `cruda`, `grigliata`, `sgocciolata`;
- source descriptor/provenance: e.g. external database description.

The source descriptor is not the UX name.

## 4. Create a new ingredient only when needed

Before creating a new ingredient, search the current semantic catalog and existing recipe batches. If no appropriate IngredientRevision exists, create one in the same batch.

A new ingredient MUST be IngredientRevision schema v2 and MUST include:

- bilingual `i18n` name/aliases;
- `basis` with 100 g or 100 ml and explicit state;
- source-backed nutrition;
- food group/subgroup/flavor/meal semantics;
- complete ProductFood category/subcategory/concept;
- allergen IDs;
- conversions when relevant;
- provenance in `source`;
- `quality`;
- bilingual `display.variantLabel`;
- reviewed and complete `safetyEvidence`;
- one or more valid `culinaryRoleIds`.

### Never fabricate nutrition or safety provenance

If reliable nutrition for the missing ingredient is not already present in the repository, retrieve it from an authoritative source before authoring the record. Prefer primary/official food-composition data where practical. Record the source label and a stable `reference` or `sourceRecordId`.

Do not create a source-backed numeric value from general model knowledge alone.

For a new ingredient used in deployable recipes:

- `safetyEvidence.assessmentStatus` must be `reviewed`;
- `compositionCompleteness` must be `complete`;
- `sourceRefs` must identify the reviewed source;
- `allergenIds` must equal `safetyEvidence.containsAllergenIds`.

If this evidence cannot be established, do not use that new ingredient in a deployable recipe batch.

## 5. Extend taxonomy only when the canonical concept is genuinely missing

Reuse an existing ProductFood term whenever it correctly represents the food.

If a specific concept is absent, add the smallest necessary `taxonomyTerms` entry in the same batch. Prefer an existing category and subcategory; create broader nodes only when no correct parent exists.

Do not create synonyms as separate concepts. Do not create a concept for every cut, brand, cooking state or source-database phrase. Those normally belong in aliases, variant/state, or provenance.

Any new taxonomy term must be a full `taxonomyTerm` schema-v1 record with bilingual labels, aliases, provenance, search tokens and timestamps.

## 6. Use culinary roles and archetypes as constraints

Prefer the existing 32 T4 roles and 20 reviewed archetypes.

For each ingredient line:

- choose the correct culinary role;
- keep grams within both the role portion range and the archetype slot range;
- use an ingredient that belongs to that role;
- do not use flavorings/condiments as main portions;
- do not use raw ingredients in a ready-to-eat role unless appropriate;
- do not use finishing-only oils as cooking fats;
- keep preparation times realistic for the actual ingredient state.

### When an existing archetype is insufficient

A recipe batch may define `culinaryRoles` and `culinaryArchetypes` inline.

Create a new role/archetype only when the requested dish cannot be expressed truthfully with existing policy. Define narrow, culinary meanings and realistic portion ranges. Reuse these IDs in later batches rather than creating near-duplicates.

Examples of justified extensions include a broth/liquid role for soup or a layered-baked-dish archetype when no existing archetype can represent the recipe.

## 7. Author recipes as real dishes

Every recipe must:

- represent one fixed serving (`servingCount` is derived as 1 by the publisher);
- have natural Italian and English titles;
- have bilingual descriptions and step-by-step instructions;
- use fixed authored gram amounts;
- use a valid meal archetype;
- use one culinary archetype;
- have realistic prep/cook times and practical flags;
- use valid taxonomy tag IDs only;
- make culinary sense independently of calorie coverage.

Do not author or copy calculated recipe nutrition or recipe allergen totals. The deterministic publisher derives them from ingredient revisions.

Do not tune ingredient amounts after the fact merely to hit an energy target. Amounts must first be culinary portions. If the resulting recipe fails a requested nutritional band, choose a different sensible composition or portion structure.

## 8. Prevent low-quality repetition

Before finalizing a batch, compare against the current catalog and earlier batches.

Reject or rewrite:

- exact ingredient-set duplicates;
- near-duplicate recipes with the same meal role and nearly identical ingredient sets;
- duplicate titles;
- trivial ingredient swaps presented as distinct recipes when they add no useful variety;
- title-only variants of the same dish;
- structurally implausible combinations.

Prefer diversity across culinary family, main ingredient, preparation technique, texture, meal use and practical behavior.

## 9. Write one append-only batch

Create exactly one new file per user generation request:

`data-proposals/recipes/YYYY-MM-DD-<short-slug>.json`

Never overwrite or rewrite a previously deployed batch. A later correction is a new batch.

The batch may contain:

- `taxonomyTerms`;
- `culinaryRoles`;
- `culinaryArchetypes`;
- `ingredients`;
- `recipes`.

Use stable, descriptive `proposalId`, `proposalIngredientId`, `proposalRecipeId`, role IDs and archetype IDs. Let the publisher derive recipe and ingredient entity IDs unless there is a specific compatibility reason to provide them.

Read `references/proposal-contract.md` for the exact JSON contract.

## 10. Validate before delivering

Run:

```bash
npm run recipes:check
```

Do not deliver a batch that fails this command.

The publisher must be allowed to derive and validate:

- IDs/hashes where omitted;
- nutrition totals;
- allergen totals;
- schema validity;
- ProductFood references;
- culinary role/archetype compatibility;
- exact/near duplicates;
- catalog version and cache-safe shard paths.

When code changes are part of the task, also run the relevant tests/lint. For an actual deployment build use:

```bash
npm run recipes:publish
npm run recipes:e2e
npm run build
```

## 11. Definition of done for a generation prompt

A generation request is complete only when:

1. the requested recipes are represented in one new append-only batch;
2. every referenced existing ingredient resolves to the current semantic catalog;
3. every missing ingredient is fully sourced and semantically defined;
4. recipes are culinary-sensible and bilingual;
5. `npm run recipes:check` passes;
6. the batch is ready for the repository's normal publish/build flow.

Do not declare success merely because a Markdown list of recipes looks plausible.
