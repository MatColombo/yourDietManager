# Recipe Corpus Orchestrator Spec V1

## 1. Scopo

Il Recipe Corpus Orchestrator decide **quale batch di ricette generare dopo**. E un componente build-time/editoriale del catalogo, separato sia dalla Recipe Pipeline sia dal Plan Generator runtime.

La responsabilita e trasformare un intento ad alto livello come:

- costruisci il corpus V1;
- aggiungi 500 ricette;
- migliora il catalogo;
- aggiungi ricette indiane;

in una sequenza riproducibile di `RecipeGenerationJob` mirati, guidati dallo stato misurato del corpus.

L'utente non deve scegliere manualmente ogni fascia calorica, family, cucina o gruppo di ingredienti. Questi dettagli sono pianificati dall'orchestratore salvo override espliciti.

L'orchestratore e responsabile anche della **readiness dei dati di riferimento**. Se una coverage utile richiede cuisine/family/category/tag o ingredienti che non esistono ancora, non deve inventare stringhe nel job: pianifica prima la creazione/proposta dei reference data necessari secondo `REFERENCE_DATA_TAXONOMY_SPEC.md`, quindi emette il RecipeGenerationJob con soli ID canonici.

## 2. Confini di responsabilita

```text
User intent / release goal
          |
          v
RecipeCorpusPolicy (versionata)
          |
          v
Corpus scanner -> RecipeCorpusSnapshot
          |
          v
Gap analysis + Batch planner
          |
          v
RecipeCorpusOrchestrationRun
          |
          v
RecipeGenerationJob
          |
          v
Recipe Pipeline Generator
          |
          v
validated Recipe/RecipeVersion shards
          |
          +----> nuovo snapshot ----> prossimo batch
```

L'orchestratore:

- legge catalogo e report;
- misura coverage, diversita e ridondanza;
- sceglie il prossimo batch;
- applica gli override utente;
- produce job deterministici e auditabili;
- decide quando fermarsi secondo la modalita richiesta.

L'orchestratore **non**:

- inventa nutrienti;
- pubblica candidati che falliscono la Recipe Pipeline;
- modifica ricette storiche immutabili;
- genera il piano alimentare dell'utente;
- impone quote artificiali di allergeni.

## 3. Artefatti canonici

### 3.1 RecipeCorpusPolicy

`schemas/recipe-corpus-policy.schema.json`

Policy immutabile/versionata che definisce:

- target dimensionale del corpus;
- bande nutrizionali;
- target di coverage;
- pesi di scoring;
- regole di diversita ingredienti;
- soglie di similarita;
- strategia batch;
- release gates.

Un cambio sostanziale della strategia crea una nuova `policyVersion`. Non modificare retroattivamente una policy gia usata per una release.

### 3.2 RecipeCorpusSnapshot

`schemas/recipe-corpus-snapshot.schema.json`

Fotografia derivata e riproducibile dello stato del corpus a un dato `catalogVersion`. Contiene conteggi e metriche, non e la fonte primaria delle RecipeVersion.

Almeno:

- recipe count attivo;
- coverage cells;
- distribuzioni meal/kcal/protein/fiber;
- family/cuisine/practicality/diet counts;
- uso ingredienti e ingredient pairs;
- indicatori similarita;
- errori quality gate;
- content digest.

### 3.3 RecipeCorpusOrchestrationRun

`schemas/recipe-corpus-orchestration-run.schema.json`

Audit della decisione del planner. Registra:

- modalita;
- policy;
- snapshot di input;
- seed;
- goal/override utente;
- job pianificati;
- score breakdown;
- stato e stop reason;
- snapshot di output quando completato.

### 3.4 RecipeGenerationJob

Resta il contratto esecutivo downstream. Ogni job generato dall'orchestratore deve includere `orchestration` con riferimenti a run, policy e snapshot.

Il Pass A rende inoltre obbligatori:

- `referenceDataVersion`;
- `referenceDataDigest`.

Questi campi congelano il Reference Data Registry usato per risolvere cuisine, family, diet/practical/flavor/preparation tag e categorie ingredienti. La pipeline deve rifiutare il job se non riceve lo snapshot che corrisponde a versione/digest, o se un criterio del job non risolve a un ID canonico attivo.

Gli artefatti dell'orchestratore e `ReferenceDataProposal` sono **build-time catalog artifacts**. Non diventano store IndexedDB utente e non entrano nel backup. Possono essere conservati nel repository/release workspace del catalogo.

## 4. Modalita operative

### BUILD

Obiettivo: costruire un corpus iniziale fino al target richiesto o al `targetCorpus.target` della policy.

Stop quando:

1. il recipe count target e raggiunto;
2. tutti i target marcati `hardForRelease` rispettano il minimo;
3. i release gates sono verdi.

Se il massimo corpus viene raggiunto con gap hard ancora aperti, il run fallisce e richiede revisione policy/catalogo ingredienti; non continua a generare volume cieco.

### EXPAND

Obiettivo: aumentare il catalogo di un numero netto di ricette accettate.

Prima di ogni batch l'orchestratore ricalcola lo snapshot. Le nuove ricette devono massimizzare il valore marginale del catalogo corrente, non replicare la distribuzione esistente.

### IMPROVE

Obiettivo: migliorare coverage/qualita/diversita senza richiedere crescita netta.

Azioni ammesse:

- nuove RecipeVersion migliorative;
- nuove famiglie per coprire gap;
- retirement di famiglie base ridondanti/deboli **solo dopo** che sostituzioni validate mantengono o migliorano coverage;
- nessuna cancellazione di versioni storiche.

Un retirement non deve rompere PlanInstance storici: le versioni referenziate restano risolvibili.

### FOCUSED_EXPANSION

Obiettivo: espandere una dimensione scelta dall'utente, per esempio cucina indiana, pesce, portable o un gruppo di ingredienti.

Il focus puo essere:

- `boost`: aumenta la priorita ma conserva il bilanciamento globale;
- `restrict`: il batch deve rispettare il focus; usare solo su richiesta esplicita e se fattibile.

Tutte le dimensioni non specificate dall'utente restano governate dalla policy.

## 5. UX operativa per sviluppo e manutenzione

Comandi ad alto livello sufficienti:

```text
"Costruisci il corpus V1 fino a 4.000 ricette."
"Continua con il prossimo batch."
"Aggiungi 500 ricette."
"Analizza il catalogo e colma i gap."
"Migliora il corpus senza aumentarlo molto."
"Aggiungi 300 ricette indiane e coreane."
"Abbiamo aggiunto nuovi ingredienti: sfruttali dove aumentano la diversita."
```

L'agente/orchestratore deve prima leggere policy + snapshot e non chiedere all'utente di specificare kcal/family/cuisine se tali dettagli sono derivabili.

L'utente puo fornire override strategici, non micro-pianificazione obbligatoria.


## 5.1 Reference-data readiness

Prima di assegnare priorita a un batch, l'orchestratore deve verificare che i criteri dell'intento siano risolvibili rispetto allo snapshot del Reference Data Registry.

Per ogni gap puo scegliere uno dei seguenti esiti:

- `reuse_existing_term`: usare un termine canonico esistente;
- `propose_taxonomy_term`: creare una proposta per tassonomia estendibile;
- `materialize_taxonomy_term`: creare il termine se la policy consente auto-approval e i gate sono non ambigui;
- `propose_ingredient`: avviare intake/curation di un ingrediente mancante;
- `blocked_reference_data`: bloccare/ripianificare quando il dato e ambiguo, manca provenance o appartiene a un registry chiuso.

Il job ricette nasce solo dopo che tutti i reference ID richiesti sono canonici e risolvibili. Lo snapshot/run registra `referenceDataVersion` e digest per riproducibilita.

## 6. Dimensioni di coverage

V1 misura almeno:

- meal archetype;
- energy band;
- protein band;
- fiber band;
- practicality tramite term ID `practical_tag` (`practical_quick`, `practical_portable`, `practical_cold_suitable`, `practical_meal_prep`, ecc.);
- vegetarian/non-vegetarian o altri diet tag canonici disponibili;
- recipe family;
- cuisine;
- ingredient category;
- primary ingredient usage;
- recurring ingredient-pair usage.

Allergeni sono sempre riportati per sicurezza/trasparenza, ma **non** devono essere bilanciati tramite quote. Non generare ricette con allergeni allo scopo di pareggiare una distribuzione.

## 7. Target hard e soft

Ogni `coverageTarget` ha:

- `dimension`;
- `key`;
- opzionale `criteria[]` per una cella composta; ogni criterio contiene una propria `dimension` + `key`;
- eventuali `minCount`/`desiredCount`/`maxCount`;
- eventuali `minShare`/`desiredShare`/`maxShare`;
- `weight`;
- `hardForRelease`.

Se `criteria` e presente, il conteggio del target include solo RecipeVersion che soddisfano **tutti** i criteri. Questo permette matrici reali come `lunch + 500–599 kcal`, `500–599 kcal + protein-high` o `dinner + quick + 600–699 kcal`, senza affidarsi alle sole distribuzioni marginali. `dimension` e `key` restano obbligatori come classificazione/identita primaria del target e per retrocompatibilita.

Regole:

- `hardForRelease=true`: il minimo deve essere soddisfatto per la release target;
- `hardForRelease=false`: contribuisce allo scoring ma non obbliga a creare contenuto artificiale;
- cuisine/family/diversity sono normalmente soft;
- nutrient/meal coverage minima puo essere hard per la release.

Le categorie possono sovrapporsi; la somma delle share tra target diversi non deve necessariamente essere 1.

## 8. Diversita ingredienti

La diversita non e lasciata alla sola valutazione semantica dell'LLM.

Lo snapshot calcola almeno:

- `recipeCount` e `primaryCount` per ingrediente;
- share di utilizzo totale e come ingrediente primario;
- co-occorrenza delle coppie di ingredienti;
- distribuzione per categoria ingrediente.

La policy definisce:

- soglia da cui parte `ingredientOverusePenalty`;
- `primaryIngredientMaxShare`;
- soglia da cui parte `pairRepetitionPenalty`;
- `repeatedPairMaxShare`;
- minimo desiderato di ingredienti primari distinti;
- eventuali ingredienti esenti (sale/acqua/condimenti tecnici, se modellati).

Un ingrediente sovrautilizzato non viene necessariamente vietato: perde priorita nei batch successivi. Un override `restrict` puo derogare solo alle penalita soft, mai ai quality gate.

## 9. Cuisine e recipe family

Cuisine e recipe family usano target morbidi per default.

Non usare quote rigide simmetriche come "10% per ogni cucina" salvo policy esplicita. Il planner deve preferire cucine/family sottorappresentate quando aumentano diversita e plausibilita culinaria.

Il valore di cuisine deriva dai tag canonici della RecipeVersion; label localizzate non partecipano al matching.

## 10. Scoring del prossimo batch

Tutti i termini sono normalizzati in `[0,1]` prima dei pesi.

Default concettuale:

```text
priority =
    wNutrition    * nutritionalCoverageGap
  + wMeal         * mealCoverageGap
  + wPracticality * practicalityGap
  + wCuisine      * cuisineDiversityGap
  + wIngredient   * ingredientDiversityGap
  + wFamily       * recipeFamilyGap
  + wFocus        * userFocusBoost
  - wSimilarity   * similarityPenalty
  - wOveruse      * ingredientOverusePenalty
  - wPair         * pairRepetitionPenalty
```

I pesi effettivi vengono da `RecipeCorpusPolicy.scoreWeights`.

Per un target con `desiredCount`:

```text
countDeficit = clamp((desiredCount - currentCount) / max(desiredCount, 1), 0, 1)
```

Per un target con `desiredShare`:

```text
shareDeficit = clamp((desiredShare - currentShare) / max(desiredShare, epsilon), 0, 1)
```

Se sono presenti entrambi, usare il massimo dei due deficit prima del peso target. `maxCount`/`maxShare` contribuiscono alle penalita di sovrarappresentazione.

Il planner crea un insieme finito di `batch intent` candidati dalle celle con deficit maggiore, ne stima l'impatto e seleziona il priority score maggiore.

Tie-break obbligatorio: hash deterministico di `seed + canonicalBatchIntentKey`; a parita ulteriore ordinamento lessicografico della key. Nessun `Math.random()` non seedato.

## 11. Pianificazione del batch

Le policy di produzione devono usare celle composte quando un requisito parla di coverage **per fascia** (per esempio protein/fiber/practicality dentro una energy band). Target monodimensionali separati non dimostrano la coverage del loro incrocio.

Per ogni job il planner decide almeno:

- target accepted count;
- candidate count con oversampling;
- massimo numero di coverage target simultanei per job (`batchPlanning.maxCoverageTargetsPerJob`, default implementativo 5 se assente) per evitare batch eccessivamente vincolati;
- meal archetype;
- energy/protein/fiber range;
- recipe family focus tramite term ID canonico;
- cuisine focus tramite term ID canonico se utile;
- practicality focus;
- subset ingredienti ammessi;
- eventuali reference-data prerequisites gia materializzati;
- `referenceDataVersion`/digest usato;
- ingredienti sottoutilizzati preferiti;
- target minimi di diversita intra-batch;
- coverage target IDs serviti dal batch.

Il planner non deve creare cross-product completi inutilmente. Genera intenti dalle celle con deficit, elimina quelli infeasibili in base al catalogo ingredienti e limita il numero di intenti valutati tramite `candidateIntentLimit`.

## 12. Oversampling e acceptance

`targetAcceptedCount` e distinto da `candidateCount`.

```text
candidateCount = ceil(targetAcceptedCount * oversampleRatio)
```

Il valore viene limitato ai bounds della policy. Il run misura acceptance reale e puo aumentare/diminuire l'oversampling nei job successivi entro i limiti dichiarati; la variazione deve essere registrata nel run.

Non abbassare quality gates per raggiungere il numero target.

## 13. Loop adattivo

Dopo ogni batch accettato:

1. aggiornare gli shard di staging;
2. ricostruire `RecipeCorpusSnapshot` sull'intero corpus di staging;
3. verificare quality/release gates;
4. aggiornare deficit e penalita;
5. decidere il prossimo batch;
6. verificare stop condition.

Non pianificare centinaia di batch una volta sola: il planner deve adattarsi ai risultati effettivamente accettati.

## 14. Reproducibilita

A parita di:

- corpus input/content digest;
- RecipeCorpusPolicy;
- modalita e goal;
- override;
- planner version;
- seed;

il primo batch intent selezionato deve essere identico.

Dopo ogni batch lo snapshot cambia, quindi anche il job successivo deriva dal nuovo stato misurato.

Ogni `RecipeCorpusOrchestrationRun` conserva sufficiente metadata per spiegare perche un job e stato scelto.

## 15. Quality e stop gates

Mai continuare automaticamente se:

- schema/reference errors > 0;
- nutrient calculation errors > 0;
- allergen derivation errors > 0;
- exact duplicates > 0;
- snapshot content digest non corrisponde al corpus letto;
- nessun batch intent fattibile ha score positivo mentre restano target hard non soddisfatti.

L'ultimo caso e un errore di fattibilita/policy e deve produrre diagnostica, non ricette casuali.

## 16. Release artifacts

Ogni release catalogo conserva almeno:

- policy usata;
- snapshot finale;
- orchestration run(s);
- RecipeGenerationJob eseguiti;
- manifest/shards;
- coverage report;
- rejected summary;
- checksums.

Questi artifact consentono revisioni future basate su misure e non sulla memoria della conversazione.

## 17. V1 non-goals

- orchestration server-side persistente;
- auto-pubblicazione senza quality gate;
- generazione di ricette runtime sul dispositivo dell'utente;
- ottimizzazione clinica;
- quote obbligatorie per ogni cucina possibile;
- machine learning necessario per decidere i batch.


## 17. Regola anti-conoscenza-implicita

Nessuna decisione dell'orchestratore puo dipendere dal ricordare spelling, alias o convenzioni testuali. Ogni criterio semantico viene scelto da registry/snapshot. Se il registry non contiene il concetto necessario, l'orchestratore crea un'azione reference-data esplicita e auditabile oppure blocca il batch.


## 11. Production contract binding (4P-A)

For a non-development target catalog, the normal CLI planner loads `corpus/contracts/v1-production.json` and passes it to the orchestrator.

When a production contract is present the planner must:

- verify policy ID/version compatibility;
- filter `allowedIngredientIds` to current revisions meeting the contract's `curated/high` ingredient readiness gate;
- use the contract `pipelineVersion`;
- freeze `{contractId, contractVersion, contractDigest}` into `RecipeGenerationJob.productionContract`;
- return `blocked / no_feasible_batch_intent` when no production-ready ingredient set can satisfy the chosen intent.

It is forbidden to fall back to draft/low-confidence ingredients in order to keep BUILD progressing.
