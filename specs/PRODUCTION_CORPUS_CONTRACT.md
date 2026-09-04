# Production Corpus Contract V1

## 1. Decisione

La Phase 4 production non e un semplice incremento del numero di ricette. E una pipeline editoriale/build-time governata da un contratto versionato che separa chiaramente:

1. readiness degli ingredienti e dei reference data;
2. discovery dei concetti del pilot;
3. risoluzione preventiva di tassonomie/ingredienti mancanti;
4. generazione strutturata dei candidati;
5. deterministic recipe processing;
6. acceptance/rejection auditabile;
7. publication del catalogo production.

Il contratto canonico e `corpus/contracts/v1-production.json`, validato da `schemas/production-corpus-contract.schema.json`.

## 2. Target congelati

Il contratto V1 e allineato a `RecipeCorpusPolicy corpus-policy-v1-default@1.1.0`:

- corpus minimo: 3.000 ricette attive validate;
- corpus target: 4.000;
- corpus massimo prima di revisione policy: 5.000;
- ingredienti production minimi: 400;
- ingredienti target: 600;
- ingredienti massimi indicativi: 800;
- pilot: 100-150 candidati, target 120;
- wave size pilot: 20.

Una modifica sostanziale di questi valori richiede una nuova `contractVersion` e, se cambia la strategia coverage, una nuova `policyVersion`.

## 3. Hard prerequisite ingredienti

Un ingrediente e production-ready solo se la family attiva punta a una `IngredientRevision` che soddisfa almeno:

- JSON Schema valido;
- `quality.status = curated`;
- `quality.confidence = high`;
- source type/label presenti;
- nutrienti minimi finiti e non negativi: energy, protein, carbs, fat, fiber;
- tassonomia canonica valida;
- allergeni e conversioni validi secondo i normali contratti;
- provenance sufficiente per publication.

Il planner production deve filtrare gli ingredienti non ready. Non puo emettere un `RecipeGenerationJob` production basato su fixture `draft/low`.

## 4. Frozen reference-data snapshot

Ogni pilot intake e ogni `RecipeGenerationJob` production congela:

- `referenceDataVersion`;
- `referenceDataDigest` SHA-256.

Il processore production rifiuta il batch se intake, job e catalog snapshot non coincidono esattamente.

Non esiste normalizzazione semantica tardiva dentro `RecipeVersion`.

## 5. Candidate lifecycle

Ogni slot/candidato production ha uno stato esplicito:

```text
discovered
  -> needs_reference_review
  -> needs_ingredient_review
  -> ready_for_generation
  -> generated
  -> accepted | rejected
```

`schemas/production-corpus-intake.schema.json` e il ledger build-time canonico.

### discovered

Il concept slot esiste ma il reference scan non e ancora dichiarato completo.

### needs_reference_review

Esiste almeno un termine tassonomico non ancora riusato/materializzato in modo canonico.

### needs_ingredient_review

Il concetto richiede un ingrediente assente o presente ma non production-ready.

### ready_for_generation

Il reference scan e completo e ogni request risolve a un ID canonico production-ready. Solo questo stato puo entrare nel production recipe processor.

### generated

Il candidato strutturato e stato consegnato al deterministic processor.

### accepted / rejected

Esito terminale del processor. Il ledger conserva job, codice di rifiuto o RecipeVersion accettata.

## 6. Reference-data requests

Le stringhe descrittive sono ammesse solo nel ledger editoriale per descrivere il concetto richiesto. Non sono ID di dominio.

Una request taxonomy contiene almeno:

- taxonomy ID;
- label IT/EN;
- proposed term ID;
- parent quando applicabile;
- rationale;
- proposal/resolution status.

Il resolver segue questo ordine:

1. prova riuso canonical ID/label/alias esistente;
2. se esiste un solo match, marca `reused`;
3. se manca, verifica che la taxonomy sia estendibile da `editorial_pipeline`;
4. crea `ReferenceDataProposal`;
5. collisioni -> `needs_review`;
6. proposal approvata -> materializzazione esplicita;
7. aggiorna reference-data digest;
8. solo dopo il candidato puo diventare `ready_for_generation`.

Nessuna proposal viene auto-approvata.

## 7. Ingredient requests

Una request ingrediente puo diventare `resolved` soltanto quando:

- esiste una family attiva non ambigua;
- la current revision supera il production ingredient gate;
- il suo ID viene congelato nel job/candidato.

Un match testuale a un ingrediente `draft/low` non e sufficiente: lo stato resta `needs_ingredient_review`.

## 8. Pilot V1

Il pilot usa 120 slot deterministici distribuiti su 12 strata:

- breakfast quick;
- breakfast protein;
- snack portable;
- lunch quick;
- lunch standard;
- dinner quick;
- dinner standard;
- vegetarian/legume;
- fish/seafood;
- soups/stews;
- cold/portable;
- components/sides.

Gli strata servono a stressare il modello e la base dati, non a sostituire i 99 coverage targets della production policy.

Il pilot viene processato in wave da 20. Dopo ogni wave:

1. reference/taxonomy gaps;
2. ingredient gaps;
3. acceptance/rejection;
4. duplicate rate;
5. nutrition outliers;
6. coverage gained;
7. nuove taxonomy additions;
8. readiness per wave

devono essere riesaminati prima della wave successiva.

## 9. Production RecipeGenerationJob

Quando il planner riceve `productionContract`:

- usa `pipelineVersion = recipe-pipeline-2-production-intake`;
- filtra gli ingredienti non curated/high;
- aggiunge `productionContract { contractId, contractVersion, contractDigest }` al job;
- mantiene reference data version/digest obbligatori.

Se nessun batch e fattibile con ingredienti production-ready, il planner termina `blocked/no_feasible_batch_intent`. Non degrada i gate.

## 10. Production processing gate

Il comando production e:

```bash
npm run corpus:production-process -- \
  <catalog-data-dir|bundle.json> \
  <policy.json> \
  <contract.json> \
  <job.json> \
  <intake.json> \
  <candidates.json> \
  <result.json> \
  [updated-intake.json]
```

Prima di chiamare la Recipe Pipeline verifica:

- contract match;
- frozen reference snapshot match;
- candidateId presente nel ledger;
- `state = ready_for_generation`;
- `referenceScanStatus = complete`;
- zero request unresolved;
- job pipelineVersion corretto.

Una RecipeVersion accettata conserva in `generation`:

- `candidateId`;
- `intakeId`;
- `productionContractId`;
- `productionContractVersion`;
- job/pipeline provenance gia esistente.

## 11. Production publication

La publication production deve includere nel manifest:

```json
{
  "productionCorpus": {
    "contractId": "ydm-v1-production-corpus",
    "contractVersion": "1.0.0",
    "contractDigest": "...",
    "policyId": "corpus-policy-v1-default",
    "policyVersion": "1.1.0"
  }
}
```

Il release validator production richiede inoltre provenance da production intake per ogni current RecipeVersion attiva.

## 12. Current readiness baseline dopo 4P-A

Il baseline 4P-A rc.10 mantiene intenzionalmente i dati development correnti:

- reference-data registry: valido;
- reference-data digest: coerente;
- active ingredient families: 4;
- production-ready ingredients: 0;
- active recipes: 3;
- pilot target: 120;
- readyForPilot: false;
- readyForProduction: false.

Il successivo lavoro production deve quindi iniziare dalla curation/materialization degli ingredienti, non dalla generazione di ricette.

## 13. Comandi

```bash
npm run corpus:4pa
npm run corpus:production-readiness
npm run corpus:pilot-plan
npm run corpus:pilot-resolve
npm run corpus:production-process -- ...
```

`corpus:production-readiness -- ... --strict` termina non-zero finche il catalogo non e production-ready.


## 14. 4P-B companion curation policy

4P-B does not change `ydm-v1-production-corpus@1.0.0`; it adds the bound operational policy `ingredient-curation-v1@1.0.0` in `corpus/curation/v1-ingredient-curation-policy.json`.

The companion policy freezes source priority, review dimensions and ordered 20-candidate pilot waves. Source import is not curation: every imported row remains pending until explicit editorial review. Only fully reviewed rows can become `curated/high` revisions. Development fixture retirement is explicit and schema-governed.

The current rc.11 baseline remains intentionally blocked before pilot wave 1 because the trusted source batch is not vendored and the production-ready ingredient floor has not been materialized. See `INGREDIENT_CURATION_PILOT_SPEC.md`.


## 15. 4P-C companion production recipe pipeline policy

4P-C does not change `ydm-v1-production-corpus@1.0.0`. It adds `recipe-production-pipeline-v1@1.0.0` in `corpus/production/v1-recipe-pipeline-policy.json`.

The companion policy industrializes post-pilot execution with deterministic per-job intake, explicit candidate dispositions, objective quality stages, stale-snapshot protection, review/retry, immutable batch digest and Scale Gate 500.

The companion policy is dormant for scale execution while 4P-B remains incomplete. A blocked Scale Gate 500 must stop scale-intake creation and batch execution; no development fixture or synthetic pilot completion may be used to change that status.
