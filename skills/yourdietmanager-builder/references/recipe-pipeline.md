# Recipe generation reference for the bundled Skill

For corpus-level planning also read `corpus-orchestrator.md`; always read `reference-data-taxonomy.md` when cuisine/family/category/tag/ingredient classification is involved. User intent should remain high-level unless an explicit focus override is requested.

# yourDietManager Recipe Pipeline Generator V1

## 1. Scopo

Generare migliaia di ricette testuali strutturate, nutrizionalmente calcolabili e sufficientemente varie per consentire al plan generator di scegliere porzioni standard senza moltiplicatori di porzione.

La pipeline puo essere eseguita in batch da ChatGPT o da script futuri, ma il **contratto dei dati e deterministico**.

La pipeline esegue un `RecipeGenerationJob`; non decide autonomamente la strategia globale del corpus. La scelta del prossimo job appartiene al `Recipe Corpus Orchestrator` definito in `RECIPE_CORPUS_ORCHESTRATOR_SPEC.md`.

## 2. Regola zero

Non generare una ricetta pubblicabile se uno dei suoi ingredienti non esiste nel catalogo ingredienti con i nutrienti minimi richiesti.

Non inventare kcal o macro per colmare dati mancanti.

Non inventare stringhe semantiche. Cuisine, family, category e tag devono essere term ID canonici. Se manca un termine estendibile, usare il `ReferenceDataProposal` lifecycle prima di materializzarlo; se manca un ingrediente, curarlo da fonte verificabile prima della ricetta. Eseguire semantic-reference validation prima di accettare il candidato.

## 3. Input

Obbligatori:

- ingredient catalog JSON;
- exact Reference Data Registry snapshot;
- `referenceDataVersion`;
- `referenceDataDigest`;
- recipe schema;
- target coverage matrix / target IDs;
- lingua sorgente;
- `targetAcceptedCount`;
- `candidateCount`.

Opzionali:

- cuisine focus;
- dietary profile;
- kcal range;
- protein/fiber range;
- meal archetypes;
- max prep time;
- equipment constraints.

## 4. Pipeline

### Step 0 — Resolve reference-data prerequisites

Require the job's `referenceDataVersion/referenceDataDigest`, load the exact snapshot and fail on mismatch. Resolve every classification to a canonical ID and detect gaps. Per tassonomie estendibili creare/proporre il termine con parent, IT/EN, alias, rationale e provenance; per ingredienti mancanti completare source intake/curation. Solo dopo emettere candidati. Registry chiusi non si estendono.

### Step 1 — Validate ingredient catalog

Per ogni ingrediente richiesto verificare:

- ID unico;
- nutrienti minimi;
- unita/conversioni;
- tassonomia;
- allergeni.

Output: ingredient set utilizzabile.

### Step 2 — Build coverage matrix

Definire celle da coprire, per esempio:

```text
meal archetype x kcal band x protein band x fiber band x practicality
```

Esempio kcal bands:

- 100–199
- 200–299
- 300–399
- 400–499
- 500–599
- 600–699
- 700–799

La matrice impedisce di generare 2.000 ricette tutte concentrate nello stesso profilo.

### Step 3 — Choose recipe family

Famiglie iniziali consigliate:

- bowl
- pasta/grain dish
- salad
- soup/stew
- wrap/sandwich
- egg dish
- yogurt/breakfast bowl
- porridge
- toast
- meat/fish + side
- legumes + grains
- curry
- stir-fry
- baked dish
- cold lunch box
- snack combo
- smoothie where appropriate
- simple side/component

Ogni family definisce ruoli ingredienti, non ingredienti obbligatori.

### Step 4 — Generate structured candidate

Generare:

- ingredient IDs;
- quantita realistiche per 1 serving;
- family;
- meal archetypes;
- cuisine/flavor tags;
- prep steps;
- practical metadata.

Non generare ancora nutrienti testuali.

### Step 5 — Canonicalize quantities

Convertire ogni linea a g/ml canonici usando conversioni ingredienti. Bloccare il candidato se una conversione richiesta manca.

### Step 6 — Calculate nutrition deterministically

Per ogni ingrediente:

```text
nutrient line = nutrient per 100 canonical units * amount / 100
```

Somma per recipe serving.

Nutrienti obbligatori:

- kcal
- protein
- carbs
- fat
- fiber

### Step 7 — Sanity validation

Bloccare o segnalare candidati con:

- energia <=0;
- macro negativi;
- quantita irrealistiche;
- volume/peso totale eccessivo per meal archetype;
- preparazione incompatibile con metadata;
- ingredienti duplicati non intenzionali;
- allergen metadata non derivabile;
- kcal incompatibili grossolanamente con macro (quality warning, non ricalcolo sostitutivo).

### Step 8 — Classify

Derivare:

- nutrition bands;
- protein/fiber density;
- allergens;
- diet tags;
- canonical practicality terms (`practical_cold_suitable`, `practical_portable`, `practical_quick`);
- meal compatibility;
- ingredient category fingerprint.

### Step 9 — Culinary quality check

Valutare semanticamente:

- abbinamenti plausibili;
- procedimento coerente;
- quantita sensate;
- condimenti presenti;
- nessuna combinazione palesemente assurda;
- ricetta realizzabile con equipment dichiarato.

Il controllo creativo puo usare un LLM, ma non puo sovrascrivere nutrienti calcolati.

### Step 10 — Deduplicate

Creare una signature canonica usando:

- family;
- set ingredient IDs principali;
- quantita normalizzate per fasce;
- meal archetypes.

Controllare:

1. duplicato esatto della signature;
2. Jaccard ingredienti elevato;
3. profilo quantitativo quasi identico;
4. titolo/istruzioni troppo simili.

Mantenere varianti solo se differiscono materialmente per nutrizione, tecnica o profilo culinario.

### Step 11 — Coverage scoring

Accettare prioritariamente candidati che riempiono celle poco coperte della coverage matrix.

Obiettivo: densita di opzioni lungo tutto lo spazio nutrizionale, non massimo numero assoluto di ricette.

### Step 12 — Assign stable record identity

Alla prima accettazione:

- assegnare `recipeId` stabile UUID/ULID alla famiglia;
- creare `recipeVersionId` stabile per il contenuto immutabile;
- impostare `versionNumber: 1`;
- congelare `ingredientRevisionId` e normalized amount su ogni linea;
- calcolare `inputDigest` sugli input nutrizionali e `contentHash` sul contenuto canonico.

Per una revisione successiva mantenere `recipeId`, incrementare `versionNumber`, creare un nuovo `recipeVersionId` e impostare `supersedesVersionId`. Non derivare gli ID dal titolo tradotto.

### Step 13 — Generate text

Generare titolo, descrizione breve e istruzioni nella lingua sorgente usando solo ingredienti/quantita gia congelati.

Le istruzioni non devono introdurre ingredienti non presenti nelle linee strutturate, salvo acqua e operazioni tecniche espressamente consentite dalla policy del catalogo.

### Step 14 — Localize

Tradurre il contenuto in IT/EN senza modificare:

- ingredient IDs e ingredientRevisionIds;
- quantita canoniche;
- nutrienti;
- tag canonici.

### Step 15 — Export shard

Esportare famiglie/versioni JSON validate in shard da 250–500 record. Il runtime importera gli shard in IndexedDB; la pipeline non scrive direttamente nel database del browser.

Aggiornare `catalog-manifest.json` con conteggi e checksum.

## 5. Batch strategy e orchestrazione

Non chiedere alla Recipe Pipeline "genera 5.000 ricette" in una singola operazione. L'utente puo invece dare questo obiettivo al Recipe Corpus Orchestrator, che lo spezza in job mirati e adattivi.

Esempi di job esecutivi:

```text
Batch 001: 100 breakfast 250–450 kcal
Batch 002: 100 lunch 450–650 kcal high-protein
Batch 003: 100 dinner 350–550 kcal moderate-fiber
Batch 004: 100 portable during-shift 250–450 kcal
...
```

Dopo ogni batch:

1. validate;
2. deduplicate contro catalogo completo;
3. aggiornare gli shard di staging;
4. ricostruire `RecipeCorpusSnapshot`;
5. restituire metriche/rejects all'orchestratore;
6. lasciare all'orchestratore la decisione del job successivo.

`targetAcceptedCount` indica quante ricette forti si vogliono accettare; `candidateCount` include l'oversampling e deve essere >= `targetAcceptedCount`. Non ridurre i quality gate per raggiungere il target.

## 6. Quality gates obbligatori

Un batch non entra nel catalogo se:

- JSON schema validation != 100%;
- nutrient calculation coverage != 100%;
- unknown ingredient/revision IDs >0;
- hard allergen derivation errors >0;
- exact duplicates >0;
- recipe portion != 1 serving standard;
- untranslated required locale fields >0 per release bilingual.

## 7. Coverage report

Ogni release catalogo deve produrre almeno:

- recipes total;
- recipes per meal archetype;
- kcal histogram;
- protein histogram;
- fiber histogram;
- prep-time histogram;
- diet tag counts;
- allergen counts;
- cuisine counts;
- duplicate similarity distribution;
- uncovered/undercovered cells.

## 8. Generazione responsabile

Le ricette sono contenuto culinario e organizzativo. Non etichettare una ricetta come trattamento di patologie o appropriata per condizioni cliniche senza un processo esterno dedicato.

## 9. Runtime import gate

Prima di pubblicare un catalog release, importare gli shard in un IndexedDB di test e verificare conteggi, indici, risoluzione ingredientRevisionId, query per meal archetype/energia e rollback su failure. La pipeline resta JSON-first; IndexedDB e il consumer runtime.


## Reference-data gate

Accepted recipe count is irrelevant if unresolved taxonomy/reference IDs remain. Batch QA must report reference-data proposals/materializations and before/after registry version/digest separately from recipe acceptance.
