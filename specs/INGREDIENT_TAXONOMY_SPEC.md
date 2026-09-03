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

## 3. Tassonomia

Campi raccomandati:

- `foodGroup`
- `foodSubgroup`
- `proteinRole`: none/low/medium/high
- `carbRole`
- `fatRole`
- `fiberRole`
- `flavorProfile`: sweet/savory/neutral
- `mealArchetypes`
- `cuisineTags`
- `dietTags`
- `allergenIds`
- `processingLevel`
- `defaultState`
- `seasonTags`
- `storageTags`
- `preparationTags`

## 4. Gruppi base suggeriti

- grains
- bread_bakery
- pasta_rice_cereals
- legumes
- vegetables
- fruit
- nuts_seeds
- meat
- poultry
- fish_seafood
- eggs
- dairy_milk_yogurt
- cheese
- plant_dairy_alternative
- fats_oils
- sauces_condiments
- herbs_spices
- sweets
- beverages
- convenience_food

## 5. Stati e resa

Ingredienti diversi per stato possono avere record distinti quando i nutrienti cambiano materialmente:

- raw
- cooked
- dry
- drained
- prepared
- ready_to_eat

Usare conversioni esplicite; non assumere automaticamente che 100 g crudi = 100 g cotti.

## 6. Unita

Ogni ingrediente supporta `g` o `ml` canonici e conversioni opzionali:

```json
{"unit":"piece","grams":55}
```

Le conversioni devono essere necessarie per usare unita custom nelle ricette.

## 7. Provenienza

Ogni IngredientRevision deve dichiarare almeno:

- `source.type`: manual | curated | imported;
- `source.label`;
- `source.reference` opzionale;
- `source.checkedAt` opzionale.

La provenance e la qualita devono seguire `DATA_PROVENANCE_QUALITY_SPEC.md`. Il recipe generator non deve inventare nutrienti mancanti. Se un ingrediente non dispone dei nutrienti minimi, il candidato ricetta non puo essere pubblicato nel catalogo standard.

## 8. Revisioni e runtime

La tassonomia/nutrizione vive in IngredientRevision immutabili. Ingredient punta alla revisione corrente; ricette e piani storici continuano a risolvere la revisione specifica usata al momento della creazione. Vedere `IDENTITY_VERSIONING_SPEC.md` e `UNITS_YIELD_SPEC.md`.
