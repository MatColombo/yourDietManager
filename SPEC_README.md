# yourDietManager

Baseline di prodotto e architettura per una PWA local-first dedicata alla pianificazione alimentare altamente configurabile.

## Stato

Questo repository di specifiche definisce **yourDietManager V1**. Il V1 Data/UX Hardening **Pass A — Reference/Data Model Review**, **Pass B — Guided Form Infrastructure**, **Pass C — Editor/Navigation UX Hardening**, **Pass D — Recipe/Ingredient Detail & Editing UX** e **Pass E — Final Acceptance & Revision Closure** sono implementati: runtime DB v4/content v3, registry canonico persistito, migration legacy, pipeline reference-data-aware, form guidati da ID canonici, bootstrap neutro, stato editor stabile, dirty navigation guard, feedback persistente, detail/edit catalogo indipendente dal piano con versionamento storico trasparente e final acceptance browser machine-checkable. La Phase 4 production **Pass A (4P-A) — Production Contract & Pilot Pipeline** e implementata. Il **Pass B (4P-B) — Ingredient Curation & Pilot Execution** implementa inoltre source policy, acquisition/import con digest, review editoriale esplicita, materializzazione `curated/high`, retirement map e wave gate da 20. Il **Pass C (4P-C) — Industrialized Corpus Generation & Scale Gate 500** implementa il control plane di batch industrializzati, review/retry, digest e scale gate. L'esecuzione locale resta correttamente bloccata finche 4P-B non chiude realmente con >=400 ingredienti production-ready e 120/120 pilot terminali. rc.13 aggiunge pero il runner GitHub Actions che esegue la catena source-backed completa senza abbassare quei gate.

TataDiet V5.2.1 resta una applicazione legacy separata e una reference implementation per funzioni gia validate (calendario effettivo, compositore, spesa, backup, offline, undo/redo), ma nessun concetto specifico di TataDiet deve diventare un vincolo del nuovo dominio.

## Principio guida

> Configurazione prima delle assunzioni.

Il motore non conosce turni da infermiera, matrici fisse, target calorici prefissati o ricette hardcoded. Conosce profili, archetipi, classi configurabili, vincoli e cataloghi dati.

## Decisioni V1

- PWA local-first, senza account obbligatorio e senza backend richiesto.
- Cataloghi ingredienti/ricette distribuiti come **JSON shard versionati**.
- **IndexedDB** come database runtime strutturato, indicizzato e transazionale.
- Repository Layer tra domain/UI e IndexedDB; nessun accesso DB disperso nei componenti.
- JSON come formato canonico di distribuzione, backup/export e pipeline catalogo.
- Ciclo configurabile da 1 a 31 giorni, indipendente dal mese civile.
- Classi giornata custom basate su archetipi hardcoded.
- Classi pasto custom basate su archetipi hardcoded.
- Carry-over determinato dagli slot tramite `dayOffset`.
- Timezone IANA esplicito e sistema di misura configurabile.
- Allergie e intolleranze sono hard constraints.
- Preferenze e obiettivi nutrizionali sono soft constraints, salvo esplicite esclusioni hard.
- Il generatore automatico non usa moltiplicatori di porzione: ogni recipe component e una porzione standard.
- Ingredienti e ricette usano famiglia stabile + revisioni/versioni storiche immutabili; qualunque entita corrente e modificabile creando una nuova revisione/versione.
- I piani storici referenziano sempre `recipeVersionId`; le ricette referenziano `ingredientRevisionId`.
- Solver seedato, versionato e spiegabile tramite GenerationRun.
- IT e EN dalla prima release; architettura predisposta per altre lingue.
- Tema e densita UI configurabili.
- Nessuna pagina HTML per singola ricetta: una vista dinamica usa RecipeRepository.
- Nessuna dipendenza da fotografie nel catalogo ricette V1.
- Catalog update atomico con checksum/schema validation e rollback al catalogo precedente.
- Corpus ricette governato da policy versionata + snapshot di coverage + orchestratore deterministico dei batch.
- Reference Data Registry canonico: niente stringhe semantiche libere nei campi usati da planner/pipeline; tassonomie estendibili create/configurate prima dell'uso.
- La corpus pipeline puo proporre/materializzare tassonomie e ingredienti necessari con provenance e gate, mai inventare valori direttamente nelle ricette.
- Catalog pack con membership canonica nel manifest e stato installazione persistito.
- Checklist spesa persistite con checked state, note e item manuali.
- Rolling horizon esplicito tramite continuation policy e segmenti di piano concatenati.
- Dati sensibili local-only per default; export/delete espliciti.

## Persistenza

```text
JSON catalog shards
        ↓ import/validate
IndexedDB yourDietManager
        ↓ repositories
UI + planner + shopping + history
        ↓ export
JSON backup
```

`localStorage` puo contenere soltanto copie bootstrap non autorevoli (es. tema/locale per evitare flash), mai piano/configurazione come fonte primaria.

## Mappa delle specifiche

| Documento | Scopo |
|---|---|
| `specs/PRODUCT_SPEC.md` | Visione, utenti, scope, UX e onboarding |
| `specs/FOUNDATIONAL_DECISIONS_V1.md` | Decisioni architetturali gia congelate per V1 |
| `specs/ARCHITECTURE_SPEC.md` | PWA, Repository Layer, IndexedDB, catalog bootstrap/update |
| `specs/DATA_MODEL_SPEC.md` | Entita, relazioni, piano e runtime model |
| `specs/CONFIGURATION_SPEC.md` | Bundle configurazione e validazione |
| `specs/JSON_STORAGE_SPEC.md` | JSON canonico + IndexedDB runtime + backup/migrazioni |
| `specs/IDENTITY_VERSIONING_SPEC.md` | Famiglie e versioni/revisioni immutabili |
| `specs/DATA_PROVENANCE_QUALITY_SPEC.md` | Provenance e quality status dei cataloghi |
| `specs/UNITS_YIELD_SPEC.md` | Unita, conversioni, stati e yield |
| `specs/SOLVER_REPRODUCIBILITY_SPEC.md` | Seed, GenerationRun e diagnostica |
| `specs/OPERATIONS_HISTORY_SPEC.md` | Operazioni atomiche, undo/redo |
| `specs/PRIVACY_DATA_LIFECYCLE_SPEC.md` | Privacy locale, export/delete/recovery |
| `specs/PERFORMANCE_BUDGET_SPEC.md` | Scala 10k ricette, query e performance budget |
| `specs/DAY_CLASS_SPEC.md` | Archetipi e classi giornata, carry-over |
| `specs/MEAL_CLASS_SPEC.md` | Archetipi e classi pasto, slot esterni |
| `specs/NUTRITION_ENGINE_SPEC.md` | Target, soft constraints e scoring |
| `specs/ALLERGY_INTOLERANCE_SPEC.md` | Vincoli hard di sicurezza alimentare |
| `specs/FOOD_PREFERENCES_SPEC.md` | Preferenze soft, esclusioni e frequenze |
| `specs/INGREDIENT_TAXONOMY_SPEC.md` | Tassonomia ingredienti |
| `specs/REFERENCE_DATA_TAXONOMY_SPEC.md` | Registry canonici, tassonomie, configuratori e creazione reference data dalla pipeline |
| `specs/RECIPE_CATALOG_SPEC.md` | Contratto famiglie/versioni ricetta |
| `specs/RECIPE_CORPUS_ORCHESTRATOR_SPEC.md` | Orchestrazione coverage-driven dei batch BUILD/EXPAND/IMPROVE/FOCUSED_EXPANSION |
| `specs/RECIPE_PIPELINE_GENERATOR.md` | Pipeline esecutiva per generare e validare singoli batch di ricette |
| `specs/INITIAL_RECIPE_CORPUS_PLAN.md` | Piano quantitativo per il catalogo iniziale |
| `specs/PRODUCTION_CORPUS_CONTRACT.md` | Contratto 4P-A: readiness ingredienti/reference data, pilot intake, candidate lifecycle e production acceptance |
| `specs/INGREDIENT_CURATION_PILOT_SPEC.md` | Contratto operativo 4P-B: trusted sources, review ingredienti, materializzazione, retirement e pilot waves |
| `specs/PRODUCTION_RECIPE_PIPELINE_SCALE_SPEC.md` | Contratto operativo 4P-C: batch industrializzati, disposition/review, stale-snapshot guard e Scale Gate 500 |
| `specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md` | Esecuzione rc.13: acquisizione USDA, deterministic review bounded, retirement fixture, pilot 120/120 e primo batch 4P-C |
| `specs/PLAN_GENERATOR_SPEC.md` | Generatore del piano e solver |
| `specs/SHOPPING_SPEC.md` | Spesa e moltiplicatore persone |
| `specs/SHOPPING_CHECKLIST_SPEC.md` | Contratto checklist persistita e refresh |
| `specs/CATALOG_PACK_SPEC.md` | Membership pack, installazione e garbage collection |
| `specs/I18N_SPEC.md` | Localizzazione, timezone e unita |
| `specs/THEME_SPEC.md` | Personalizzazione estetica |
| `specs/UX_SPEC.md` | UI compatta per utenti formati |
| `specs/TEST_STRATEGY.md` | Quality gates e test |
| `specs/ROADMAP_V1.md` | Fasi raccomandate della V1 |

Documenti di hardening correnti:

- `REFERENCE_DATA_FIELD_INVENTORY.md` - inventario completo dei campi semantici/reference;
- `DATA_UX_HARDENING_REVISION.md` - decisioni e sequenza Pass A-E;
- `DATA_UX_HARDENING_PASS_A_REPORT.md` - implementazione e gate del Pass A;
- `DATA_UX_HARDENING_PASS_B_REPORT.md` - implementazione e gate del Pass B;
- `DATA_UX_HARDENING_PASS_C_REPORT.md` - implementazione, form/schema audit e gate del Pass C;
- `DATA_UX_HARDENING_PASS_D_REPORT.md` - detail/edit catalogo e local override semantics;
- `DATA_UX_HARDENING_PASS_E_REPORT.md` - final acceptance browser, closure gate e allineamento Skill/spec.

Gli esempi JSON sono in `examples/`; gli schemi JSON Schema Draft 2020-12 sono in `schemas/`.

## Skill

La directory `skills/yourdietmanager-builder/` contiene una Skill ChatGPT riutilizzabile per progettare, implementare e mantenere yourDietManager rispettando queste invarianti.


## Phase 4 production execution bridge — rc.13

The missing 4P-B/4P-C execution steps are now encoded in `specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md` and `.github/workflows/production-corpus.yml`. The workflow acquires the frozen USDA archives, performs bounded deterministic review after pending import, materializes a 600-target ingredient foundation, retires the Phase 1 fixtures explicitly, executes six pilot waves to 120/120, requires Scale Gate 500 to become `ready`, and runs the first 100-accepted industrialized batch. Generated source archives remain runtime-only; the working bundle/evidence can be committed only through an explicit workflow input.

The local sandbox used for this package cannot download the USDA ZIPs. Therefore no source-derived ingredient records are claimed as executed locally; the repository gate remains red on production content until the network workflow completes successfully.
