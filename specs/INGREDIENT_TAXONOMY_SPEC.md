# Ingredient Taxonomy Spec V1

## 1. Obiettivo

Fornire abbastanza semantica per generare, filtrare e bilanciare ricette senza basarsi su nomi testuali.

## 2. Campi nutrizionali minimi per 100 g/ml

- energyKcal
- proteinG
- carbsG
- fatG
- fiberG

Opzionali raccomandati:

- sugarsG
- saturatedFatG
- saltG
- sodiumMg

## 3. Tassonomia canonica IngredientRevision

La tassonomia non e un insieme di stringhe libere. Ogni valore semantico riutilizzato da planner, filtri, preferenze o corpus pipeline deve risolvere a un ID canonico definito dal Reference Data Registry (`REFERENCE_DATA_TAXONOMY_SPEC.md`).

Il contratto V1 `IngredientRevision.taxonomy` contiene:

- `foodGroup` -> `TaxonomyTerm.termId` della tassonomia `food_category`;
- `foodSubgroup` -> `TaxonomyTerm.termId` figlio diretto del gruppo, oppure `null`;
- `flavorProfile` -> `TaxonomyTerm.termId` della tassonomia `flavor_profile`;
- `mealArchetypes` -> uno o piu valori del registry chiuso MealArchetype;
- `proteinRole`, `carbRole`, `fatRole`, `fiberRole` -> enum tecnico `none | low | medium | high`.

Le label IT/EN, gli alias e le legacy key appartengono al registry, non ai campi di matching. Alias/label possono essere usati per ricerca/import ma devono essere risolti a un `termId` prima della persistenza.

Campi semantici aggiuntivi per ingredienti non vanno introdotti come array di stringhe ad hoc: se diventano necessari, devono essere aggiunti esplicitamente al contratto e associati a una tassonomia/registry.

### 3.1 Gruppo/sottogruppo

La gerarchia `food_category` valida il rapporto parent/child. In V1:

- una regola gruppo confronta `foodGroup`;
- una regola sottogruppo confronta `foodSubgroup`;
- non si deduce matching ricorsivo da label/prefissi.

Esempio:

```text
food_group_fish_seafood
├── food_subgroup_fatty_fish
├── food_subgroup_lean_fish
├── food_subgroup_crustaceans
└── food_subgroup_molluscs
```

### 3.2 Meal archetypes

Ingrediente e ricetta condividono la stessa semantica:

- tutti gli archetipi sono selezionati per default nel form di creazione;
- almeno un archetype e obbligatorio;
- tutti selezionati = compatibile con tutti;
- array vuoto = invalido, non equivale a "tutti".

MealArchetype e un registry di sistema chiuso e non viene creato dalla pipeline.

## 4. Gruppi base V1

I gruppi sono TaxonomyTerm canonici. Esempi del seed:

- `food_group_grains`;
- `food_group_bread_bakery`;
- `food_group_pasta_rice_cereals`;
- `food_group_legumes`;
- `food_group_vegetables`;
- `food_group_fruit`;
- `food_group_nuts_seeds`;
- `food_group_meat`;
- `food_group_poultry`;
- `food_group_fish_seafood`;
- `food_group_eggs`;
- `food_group_dairy_milk_yogurt`;
- `food_group_cheese`;
- `food_group_plant_dairy_alternative`;
- `food_group_fats_oils`;
- `food_group_sauces_condiments`;
- `food_group_herbs_spices`;
- `food_group_sweets`;
- `food_group_beverages`;
- `food_group_convenience_food`.

Non ridigitare questi ID nei form: il Pass B li presenta tramite selector/search localizzato. `foodGroup` e `foodSubgroup` sono un controllo gerarchico; `flavorProfile` e un autocomplete della tassonomia omonima; `basis.state`, allergeni e MealArchetype sono registry chiusi con label localizzate.

## 5. Stati e resa

Ingredienti diversi per stato possono avere record distinti quando i nutrienti cambiano materialmente:

- raw
- cooked
- dry
- drained
- prepared
- ready_to_eat

Ingredient state e un registry/enum tecnico chiuso, mostrato con label localizzate. Usare conversioni esplicite; non assumere automaticamente che 100 g crudi = 100 g cotti.

## 6. Unita

Ogni ingrediente supporta `g` o `ml` canonici e conversioni opzionali:

```json
{"unit":"piece","grams":55}
```

Le conversioni devono essere definite esplicitamente per usare unita custom nelle ricette. Il futuro editor guidato deve offrire solo unita realmente convertibili per l'ingrediente selezionato.

## 7. Provenienza

Ogni IngredientRevision deve dichiarare almeno:

- `source.type`: manual | curated | imported;
- `source.label`;
- `source.reference` opzionale;
- `source.checkedAt` opzionale.

La provenance e la qualita seguono `DATA_PROVENANCE_QUALITY_SPEC.md`. Il recipe generator non deve inventare nutrienti mancanti. Se un ingrediente non dispone dei nutrienti minimi, il candidato ricetta non puo essere pubblicato nel catalogo standard.

## 8. Revisioni e runtime

Tassonomia e nutrizione vivono in IngredientRevision storiche immutabili. L'Ingredient corrente e modificabile indipendentemente da `origin`: il salvataggio crea una nuova revisione e avanza `currentRevisionId`. Ricette e piani storici continuano a risolvere la revisione specifica usata al momento della creazione.

## 9. Creazione dati da pipeline

La pipeline ricette puo proporre/creare nuovi termini nelle tassonomie estendibili e nuovi ingredienti curati quando necessari alla coverage, ma deve completare e validare tali reference data **prima** di generare/accettare una ricetta che li usa. Vedere `REFERENCE_DATA_TAXONOMY_SPEC.md` e `RECIPE_PIPELINE_GENERATOR.md`.

## Phase D2 — product food taxonomy

User-facing food meaning is represented by the independent hierarchical taxonomy `product_food`: `FoodCategory -> FoodSubcategory -> IngredientConcept`. Every base IngredientRevision in the current planner-validation catalog carries `productTaxonomy.categoryId`, `subcategoryId` and `conceptId`. These IDs MUST NOT be inferred at runtime from allergens or source `taxonomy.foodGroup`. Source nutritional classification remains provenance/context only. Repeated labels across hierarchy levels are allowed; ambiguous label lookup MUST fail closed rather than select a level implicitly.

`product_category_dairy` (`Dairy` / `Latticini`) is an explicit product category. Plant-based milk/yogurt/cream/cheese alternatives are classified under `product_category_plant_alternatives`, not Dairy. Technical noodle records may differ in state/composition while sharing `product_concept_noodles`.

