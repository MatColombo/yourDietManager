# Initial Recipe Corpus Plan V1

## 1. Obiettivo

Costruire un catalogo iniziale sufficientemente denso da ridurre drasticamente la necessita di scalare ricette e da supportare configurazioni molto diverse.

Target consigliato per V1: **3.000–5.000 ricette validate**, senza fotografie.

## 2. Prerequisito

Prima dei recipe batch serve un ingredient catalog JSON curato, importabile e validabile nel runtime IndexedDB, con nutrienti minimi completi. Non pubblicare ricette calcolate su ingredienti con valori nutrizionali inventati o mancanti.

Target indicativo ingredienti iniziali: 400–800 ingredienti generici e componenti comuni.

## 3. Distribuzione iniziale indicativa

| Area | Target ricette |
|---|---:|
| Breakfast / brunch | 500–700 |
| Lunch | 700–900 |
| Dinner | 700–900 |
| Snacks / mini meals | 500–700 |
| Portable / during-shift | 300–500 |
| Simple sides/components | 300–500 |
| Soups/stews/light meals | 250–400 |

Le categorie si sovrappongono: una ricetta puo coprire piu archetipi.

## 4. Coverage nutrizionale

Per lunch/dinner assicurare densita almeno nelle bande:

- 300–399 kcal
- 400–499 kcal
- 500–599 kcal
- 600–699 kcal
- 700–799 kcal

Per breakfast/snack aggiungere bande inferiori.

Per ogni banda coprire almeno:

- protein low/medium/high;
- fiber low/moderate/high;
- quick vs standard prep;
- cold/portable vs hot;
- vegetarian/non-vegetarian.

Questi requisiti non si verificano confrontando solo i conteggi marginali globali. La `RecipeCorpusPolicy` di produzione deve materializzare target con `criteria[]` per le celle incrociate rilevanti (es. `energy_band + protein_band`, `meal_archetype + energy_band`, `energy_band + practicality`).

## 5. Bootstrap e ordine iniziale

Per un corpus vuoto l'orchestratore puo usare questa sequenza come bootstrap prior, non come ordine rigido:

1. componenti semplici e sides;
2. breakfast;
3. snacks/mini meals;
4. quick lunch/dinner;
5. portable meals;
6. higher-protein meals;
7. vegetarian/legume-heavy;
8. fish meals;
9. soups/stews.

Appena esistono dati sufficienti, l'ordine deve essere sostituito dal deficit scoring di `RECIPE_CORPUS_ORCHESTRATOR_SPEC.md`. Dopo ogni batch si ricostruisce lo snapshot e si pianifica il successivo in base ai gap reali.

## 6. Strategia di generazione con ChatGPT

L'input normale dell'utente e ad alto livello (BUILD/EXPAND/IMPROVE/FOCUSED_EXPANSION). L'orchestratore legge `RecipeCorpusPolicy` + `RecipeCorpusSnapshot` e produce ogni `RecipeGenerationJob`.

Il job fornisce alla fase generativa:

- subset ingredienti autorizzati;
- ingredienti sottoutilizzati preferiti;
- celle coverage target;
- vincoli quantitativi;
- recipe family/cuisine/practicality focus quando utile;
- target di diversita intra-batch;
- schema Recipe;
- elenco hash/signature gia accettati.

ChatGPT genera struttura e testo; un calcolatore deterministico produce nutrienti e un validator decide accettazione/rifiuto. L'agente non deve chiedere all'utente di micro-pianificare kcal/family/cuisine quando la policy consente di derivarle.

## 7. Acceptance rate

Non puntare al 100% di candidati accettati. E preferibile generare 120 candidati per ottenere 80–100 ricette forti e diverse dopo deduplica/quality check.

## 8. Versionamento catalogo

Ogni release del corpus produce:

- manifest;
- shards;
- coverage report;
- rejected summary;
- checksums;
- catalogVersion semver-like indipendente dall'app.

## 9. Test di import runtime

Ogni release corpus deve essere testata anche come import JSON -> IndexedDB: conteggi, checksum, indici, query campione e rollback su shard corrotto. Il catalogo non e accettato se valida solo come file ma fallisce il bootstrap runtime.

## 9. Reference-data bootstrap prima del corpus production

Prima del BUILD 3.000–5.000, completare il Reference Data Registry e la migrazione dei valori legacy. L'orchestratore deve poter ampliare tassonomie estendibili e creare ingredienti mancanti curati durante il BUILD, ma ogni nuovo reference data deve essere validato/materializzato prima delle ricette che lo usano.

Il corpus target non e considerato completo se il conteggio ricette e raggiunto ma esistono semantic free-text values, taxonomy ID unresolved o ingredienti creati senza i normali gate di provenance.



## 10. Phase 4 production Pass A gate

Before the first production recipe candidate, `corpus/contracts/v1-production.json` is authoritative for readiness and pilot lifecycle.

Hard prerequisites:

- at least 400 active Ingredient families whose current revisions are `curated/high` and pass nutrition/reference/provenance gates;
- valid canonical Reference Data Registry with manifest digest match;
- zero unresolved reference requests for any candidate entering generation;
- production job frozen to the same reference-data version/digest and production-contract digest;
- production candidate intake state `ready_for_generation`.

The first pilot is 120 candidate slots in waves of 20. It exists to discover missing taxonomy/ingredient concepts and measure acceptance/duplication/coverage before scaling. Reaching 120 candidates is not a release criterion; resolving the data gaps discovered by those candidates is.
