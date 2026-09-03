# Allergy & Intolerance Spec V1

## 1. Regola assoluta

Allergie e intolleranze dichiarate sono **hard constraints** del generatore automatico.

Una ricetta che viola un hard constraint non entra nel ranking: viene esclusa prima dello scoring nutrizionale.

## 2. Profilo

Ogni regola contiene:

- `kind`: allergy | intolerance;
- `targetType`: allergen | ingredient | foodCategory;
- `targetId`;
- `label` user-facing;
- `enabled`;
- `notes` opzionali.

## 3. Allergeni base V1

Gli ID canonici V1 sono **chiusi e case-sensitive**:

- `gluten_cereals`
- `crustaceans`
- `eggs`
- `fish`
- `peanuts`
- `soy`
- `milk`
- `tree_nuts`
- `celery`
- `mustard`
- `sesame`
- `sulphites`
- `lupin`
- `molluscs`

La fonte contrattuale unica e `schemas/domain-enums.schema.json#/$defs/allergenId`. `IngredientRevision.allergenIds`, `RecipeVersion.allergenIds` e `AllergyIntoleranceProfile.rules[].targetId` quando `targetType=allergen` devono referenziare quel definition. Alias UI/localizzati non sono ID e non possono entrare nel motore.

Ogni IngredientRevision deve mappare gli allergeni per ID; RecipeVersion li deriva deterministicamente dalle revisioni referenziate. Un allergen ID sconosciuto e un errore di validazione/import e blocca il record.

## 4. Intolleranze

Le intolleranze possono riferirsi a:

- allergen-like target (es. milk);
- ingrediente specifico;
- categoria definita nel catalogo.

V1 non tenta di dedurre automaticamente condizioni cliniche da sintomi.

## 5. Propagazione

`Ingredient.allergenIds` -> `Recipe.allergenIds` deve essere derivato deterministicamente dalla lista ingredienti.

Non affidarsi al testo del titolo ricetta.

## 6. Contaminazione e tracce

V1 non modella in modo affidabile contaminazioni, stabilimenti o diciture "puo contenere" per ingredienti generici. L'interfaccia deve chiarire che il controllo hard copre la composizione strutturata del catalogo e non sostituisce la verifica delle etichette dei prodotti reali.

## 7. Scelta manuale

Una regola allergy/intolerance `enabled` resta hard anche nella selezione manuale. La UI non deve offrire un normale pulsante "ignora" come per una preferenza.

Per consentire un alimento incompatibile l'utente deve prima modificare/disabilitare esplicitamente la regola nel profilo di sicurezza; questa modifica viene registrata come cambiamento di configurazione. L'app non interpreta la decisione come consiglio medico.

## 8. Persistenza e snapshot

Il profilo vive in IndexedDB. Ogni GenerationRun congela uno snapshot/hash delle hard constraint applicate, cosi una modifica successiva del profilo non cambia retroattivamente la spiegazione di un piano esistente.
