# V1 Data/UX Hardening — Pass A Reference/Data Field Inventory

Status: **implemented baseline for Pass A**  
Runtime target: `DB_VERSION=4`, `contentSchemaVersion=3`, app `1.0.0-rc.3`.

## 1. Classification rule

Every persisted or generated field is classified by how downstream code consumes it.

| Class | Rule |
| --- | --- |
| Descriptive text | May be free text because no engine compares it by semantic identity. |
| Quantitative value | Numeric/date/time input with range/unit validation; never taxonomy text. |
| Closed registry | Product-controlled finite ID set. UI must show localized labels and persist the ID. Pipeline cannot extend it. |
| Extensible taxonomy | Canonical `TaxonomyTerm.termId`. UI/pipeline must resolve or materialize the term before use. |
| Entity reference | Must resolve to an existing entity ID/revision ID; UI uses search/select, never manual ID entry. |
| Technical reference | Internal resource/algorithm/i18n key. Not a normal free-text user field. |
| Derived data | Computed by code and read-only to ordinary editors. |

If a value is compared, filtered, grouped, scored or used as a hard/soft constraint, it may not remain an ungoverned string.

## 2. Extensible taxonomy registry — V1

| Taxonomy ID | Hierarchical | Main consumers | Pipeline extensible | User extensible |
| --- | --- | --- | --- | --- |
| `food_category` | yes | IngredientRevision, food preferences, allergy/intolerance category targets, MealClass rules, corpus coverage | yes | yes |
| `cuisine` | no | RecipeVersion, food preferences, corpus coverage/focus | yes | yes |
| `recipe_family` | no | RecipeVersion, corpus coverage/focus | yes | yes |
| `diet_tag` | no | RecipeVersion, food preferences/generic tag rules, corpus coverage | yes | yes |
| `practical_tag` | no | RecipeVersion, MealClass generic tag rules, corpus coverage | yes | yes |
| `flavor_profile` | no | IngredientRevision, RecipeVersion, MealClass flavor/tag rules | yes | yes |
| `preparation_technique` | no | RecipeVersion, corpus generation/review | yes | yes |

The seed distributed with V1 contains 7 taxonomies and 113 canonical terms. Labels/aliases are search/import aids; records persist `termId` only.

## 3. Closed registries — V1

These remain product-controlled and are not represented as extensible Taxonomy rows.

| Registry | Persisted fields / consumers | Governance |
| --- | --- | --- |
| Allergen ID | `IngredientRevision.allergenIds`, derived `RecipeVersion.allergenIds`, Allergy/Intolerance rules | closed safety registry; pipeline must block unknown IDs |
| MealArchetype | IngredientRevision compatibility, RecipeVersion compatibility, MealClass | closed; ingredient and recipe use identical min-1 semantics |
| DayArchetype | DayClass | closed |
| Ingredient state | IngredientRevision basis/state and shopping aggregation | closed |
| Canonical units / conversion kind | ingredient basis/conversions, recipe ingredient lines | closed technical registry |
| Rule strength/operators | MealClass rules | closed technical enum |
| Nutrition/practical quantitative targets | MealClass numeric rules | closed code registry (`energyKcal`, `proteinG`, `prepMinutes`, etc.) |
| Locale/unit-system/theme mode enums | AppConfig/UI runtime | closed product enum |

## 4. Ingredient model

| Field | Class | Canonical source / rule |
| --- | --- | --- |
| `ingredientId` | entity identity | generated stable ID |
| `currentRevisionId` | entity reference | IngredientRevision store |
| names / aliases | descriptive/search text | free text, localized |
| `basis.amount` | quantitative | validated number |
| `basis.unit` | closed registry | canonical units |
| `basis.state` | closed registry | ingredient-state enum |
| nutrition values | quantitative authoritative data | source-backed; no blank→zero coercion |
| `taxonomy.foodGroup` | extensible taxonomy | `food_category` top-level term |
| `taxonomy.foodSubgroup` | extensible taxonomy | `food_category` child term or null; parent must equal `foodGroup` |
| `taxonomy.flavorProfile` | extensible taxonomy | `flavor_profile` |
| `taxonomy.mealArchetypes[]` | closed registry | MealArchetype; **min 1**, all selected by default in creation UX |
| protein/carb/fat/fiber role | closed enum | nutrient-role enum |
| `allergenIds[]` | closed safety registry | canonical allergen ID |
| conversions | quantitative + closed unit IDs | only explicit valid conversions |
| source/quality metadata | technical/provenance | structured, not semantic taxonomy |
| `contentHash` | derived | code-generated |

### Food group/subgroup matching semantics

V1 does not infer arbitrary recursive semantics from labels. An IngredientRevision stores both its canonical `foodGroup` and optional direct `foodSubgroup`.

- a rule targeting a group matches `revision.taxonomy.foodGroup === targetId`;
- a rule targeting a subgroup matches `revision.taxonomy.foodSubgroup === targetId`;
- the hierarchy validates the subgroup parent and drives guided selectors;
- no string-prefix or label-based matching is permitted.

If V2 needs deeper recursive category targeting, that requires an explicit rule contract change; it must not be inferred silently.

## 5. Recipe model

| Field | Class | Canonical source / rule |
| --- | --- | --- |
| `recipeId` | entity identity | generated stable ID |
| `currentVersionId` | entity reference | RecipeVersion store |
| title/description/instructions | descriptive text | localized free text |
| `mealArchetypes[]` | closed registry | MealArchetype; **min 1**, all selected by default in creation UX |
| ingredient line `ingredientId` | entity reference | Ingredient family |
| ingredient line `ingredientRevisionId` | historical entity reference | frozen IngredientRevision |
| ingredient line unit | closed unit registry | valid only when basis/conversion supports it |
| calculated nutrition | derived | deterministic nutrition engine |
| `tags.families[]` | extensible taxonomy | `recipe_family` |
| `tags.cuisines[]` | extensible taxonomy | `cuisine` |
| `tags.diet[]` | extensible taxonomy | `diet_tag` |
| `tags.flavor[]` | extensible taxonomy | `flavor_profile` |
| `tags.practical[]` | extensible taxonomy | `practical_tag` |
| `tags.preparation[]` | extensible taxonomy | `preparation_technique` |
| allergens | derived | frozen ingredient revisions |
| search tokens | derived | localized content + canonical taxonomy data |
| input/content digests | derived | deterministic |

## 6. Configuration rules

### FoodPreferences

| `targetType` | Value class | Resolution |
| --- | --- | --- |
| `ingredient` | entity reference | Ingredient family ID |
| `foodCategory` | extensible taxonomy | `food_category` term ID |
| `recipeTag` | extensible taxonomy | exactly one of recipe-family/diet/practical/flavor/preparation taxonomies |
| `cuisine` | extensible taxonomy | `cuisine` term ID |

Frequency `maxOccurrences/windowDays` is quantitative, not taxonomy data.

### Allergy / Intolerance

| `targetType` | Value class | Resolution |
| --- | --- | --- |
| `allergen` | closed safety registry | allergen ID |
| `ingredient` | entity reference | Ingredient family ID |
| `foodCategory` | extensible taxonomy | `food_category` term ID |

No safety rule may be stored with an unresolved target.

### MealClass rules

| `ruleType` | Value class | Resolution |
| --- | --- | --- |
| `foodCategory` | extensible taxonomy | `food_category` term ID |
| `ingredient` | entity reference | Ingredient family ID |
| `tag` | extensible taxonomy | exactly one allowed recipe-tag taxonomy |
| `flavor` | extensible taxonomy | `flavor_profile` term ID |
| `nutrition` | closed quantitative registry | known nutrition metric + operator/value |
| `practical` | closed quantitative registry | known practical metric + operator/value |

The legacy mismatch `fish` vs `fish_seafood` is explicitly migrated to `food_group_fish_seafood` and can no longer be persisted as an unknown semantic string.

## 7. Corpus orchestration / generation

Reference-driven corpus dimensions are canonical IDs:

- `ingredient_category` → `food_category`;
- `cuisine` → `cuisine`;
- `recipe_family` → `recipe_family`;
- `diet` → `diet_tag`;
- `practicality` → `practical_tag`.

Meal, kcal/protein/fiber bands remain closed policy dimensions.

Every new `RecipeGenerationJob` freezes:

- `referenceDataVersion`;
- `referenceDataDigest`.

If a candidate concept requires a missing extensible term, generation must stop before RecipeVersion creation and run the `ReferenceDataProposal` lifecycle. Unknown closed-registry values are blockers, never proposals.

## 8. ReferenceDataProposal artifact

Pass A adds a build/editorial artifact contract for pipeline-created taxonomy prerequisites:

`proposed/needs_review → approved → materialized`

A proposal contains canonical proposed ID, taxonomy, parent, IT/EN labels, aliases, rationale, provenance and collision candidates. Materialization is permitted only when:

- taxonomy exists and allows `editorial_pipeline` extension;
- parent is valid when present;
- collision list is empty;
- proposal is approved;
- full registry validation remains green.

The resulting TaxonomyTerm exists in the reference snapshot **before** a recipe may use it.

## 9. Fields that remain legitimate free text

Examples include:

- recipe/ingredient localized name, title, description and instructions;
- editorial notes/review notes;
- user checklist notes/manual item labels;
- explanatory guidance text when stored as content rather than a machine key;
- search query text.

Free text must never be reinterpreted later as an implicit taxonomy ID.

## 10. Technical/reference keys not exposed as free semantic inputs

Examples:

- `labelKey`, `descriptionKey`, `guidanceKeys`, `notesKey` when they refer to localization resources;
- schema/algorithm/pipeline versions;
- hashes/digests;
- catalog pack IDs;
- store/entity IDs.

These are generated or selected by code/editorial tooling. Normal user forms must not ask users to type them from memory.

## 11. Migration inventory

Pass A migration `contentMigration:3` handles legacy semantic values in:

- current IngredientRevision taxonomy;
- current RecipeVersion tags;
- ingredient revisions frozen by current recipes when needed for a coherent new current version;
- FoodPreferences semantic targets;
- Allergy/Intolerance food-category targets;
- MealClass category/flavor/generic-tag targets.

Outcomes are classified as:

- `resolved_exact`;
- `resolved_alias`;
- `resolved_manual`;
- `unresolved`.

`unresolved > 0` blocks migration. Immutable historical IngredientRevision/RecipeVersion rows are never edited: migrated current records receive new revision/version IDs and family pointers advance atomically.

## 12. Pass B implementation and remaining Pass C/D

Pass B is implemented. Ordinary authoring/configuration paths now resolve semantic values through the persisted registry instead of accepting arbitrary semantic strings.

Implemented UI mappings include:

- ingredient / taxonomy target -> searchable canonical-ID autocomplete;
- recipe semantic metadata -> taxonomy-specific chip multi-select;
- food category -> hierarchical group/subgroup selector;
- recipe-line unit -> selected IngredientRevision basis/conversions only;
- ingredient state / MealArchetype / allergens -> localized closed-registry controls;
- alias entry -> descriptive token editor (aliases remain search text, never persisted as semantic IDs).

Service boundaries still validate every ID, so UI guidance is not the security/data-integrity boundary. Semantic tag arrays passed programmatically must contain canonical IDs; CSV/string shortcuts are rejected.

Remaining:

- Pass C: non-collapsing editor state, dirty navigation, save feedback, onboarding disable/default cleanup, DayClass form repair and full form/schema parity audit;
- Pass D: recipe/ingredient detail and transparent editing of base + user families plus complete browser regression coverage.
