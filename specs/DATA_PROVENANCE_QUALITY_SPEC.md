# Data Provenance & Quality Spec V1

## 1. Obiettivo

Ogni valore nutrizionale e ogni ricetta devono essere tracciabili fino alla fonte strutturata usata per produrli.

## 2. IngredientRevision provenance

Campi raccomandati:

- `source.type`: manual | curated | imported | generated_mapping;
- `source.label`;
- `source.reference` opzionale;
- `source.sourceRecordId` opzionale;
- `source.checkedAt`;
- `source.licenseNote` opzionale;
- `quality.status`: draft | validated | curated;
- `quality.confidence`: low | medium | high;
- `quality.notes` opzionale.

V1 puo partire con dati curati/generati internamente, ma deve conservare provenance per permettere future sostituzioni con fonti esterne.

## 3. RecipeVersion provenance

Campi raccomandati:

- `generation.jobId`;
- `generation.pipelineVersion`;
- `generation.sourceLocale`;
- `generation.generatedAt`;
- `quality.status`: generated | validated | curated;
- `quality.reviewNotes` opzionale.

## 4. Nutrition calculation provenance

Ogni RecipeVersion conserva:

- `calculationAlgorithmVersion`;
- `inputDigest` delle ingredientRevision + quantita canoniche;
- nutrienti calcolati.

Ricalcolare con algoritmo nuovo crea una nuova RecipeVersion quando il risultato cambia materialmente.

## 5. Quality gates

Release catalogo bloccata se:

- source mancante sui nutrienti base;
- revision reference non risolta;
- allergen derivation incoerente;
- inputDigest non corrisponde;
- nutrition non ricalcolabile;
- NaN/Infinity;
- duplicati esatti.

## 6. UI

La UI ordinaria non deve mostrare provenance in modo invasivo. Deve pero essere disponibile in dettaglio ingrediente/ricetta e strumenti diagnostici.


## Reference data e tassonomie

Ogni TaxonomyTerm creato da processo editoriale o corpus pipeline deve registrare provenance/rationale sufficiente a spiegare:

- chi/che processo lo ha proposto;
- per quale taxonomy e parent;
- quali label/alias sono stati verificati;
- per quale corpus gap o source evidence e stato introdotto;
- se e stato auto-approvato dalla policy o revisionato manualmente.

Gli alias non diventano mai ID persistiti. Un termine senza provenance minima o con collisione semantica irrisolta non puo essere usato da un record production.

Quando la pipeline materializza un ingrediente mancante, valgono gli stessi quality gate di ogni IngredientRevision production. L'esistenza di un RecipeGenerationJob non giustifica confidence inferiore o nutrienti/allergeni inferiti senza fonte.
