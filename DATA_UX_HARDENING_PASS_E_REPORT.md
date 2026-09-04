# V1 Data/UX Hardening — Pass E Report

## Stato

**DONE (implementation)** — candidate `1.0.0-rc.6`.

Pass E chiude formalmente la V1 Data/UX Hardening Revision con un final acceptance gate end-to-end. Non aggiunge nuovi concetti di dominio e non anticipa la materializzazione del corpus production Phase 4: rende invece verificabili, nello stesso flusso automatico, le invarianti UX introdotte nei Pass C-D che prima erano coperte solo da audit source/domain o da una browser regression limitata al detail/edit catalogo.

## 1. Gap chiuso

La strategia di test richiedeva gia una final acceptance browser per:

- dirty navigation confirmation;
- feedback persistente di salvataggio;
- form/schema parity sui campi obbligatori;
- disclosure state che non collassa durante rerender locali;
- recipe/ingredient detail ed Edit indipendenti dal piano.

Il browser harness del Pass D verificava soltanto l'ultimo gruppo. Pass E estende lo stesso harness dependency-free/Chromium-CDP a tutta la superficie di acceptance richiesta.

## 2. Form/schema parity nel browser

La pagina Nutrition espone marker stabili per il gate (`nutrition-editor`, `nutrition-daily-energy`, `editor-save`). Il test svuota realmente il target energetico obbligatorio, emette l'evento `input` e verifica che:

- il draft resti invalido;
- Save sia `disabled` e `aria-disabled=true`;
- ripristinando il valore valido Save torni disponibile.

Questo verifica via interazione utente che un required numeric blank non venga coercito silenziosamente a zero/default e che la validazione live sia allineata al contratto di persistenza.

## 3. Disclosure state e rerender locale

La pagina MealClass usa il `controlledDetails` centralizzato del Pass C. Il browser gate:

1. apre esplicitamente una MealClass;
2. aggiunge una regola tramite il controllo reale `meal-rule-add`;
3. lascia che l'editor esegua il rerender locale;
4. verifica che lo stesso `data-ui-key` resti aperto;
5. verifica contemporaneamente che la nuova regola incompleta renda Save non disponibile.

Il test copre quindi sia no-collapse sia invalid-draft blocking con un'unica sequenza reale.

## 4. Dirty navigation guard

Con il draft MealClass dirty, il gate clicca un normale link interno verso DayClass e sostituisce soltanto la risposta del dialogo `confirm` per renderla deterministica:

- prima risposta `false`: il tentativo di navigazione viene rifiutato e la route resta `/configure/meals`;
- seconda risposta `true`: il draft viene scartato e la navigazione prosegue verso `/configure/days`.

Il controllo esercita il normale click/router path, non chiama direttamente le funzioni di stato.

## 5. Save feedback persistente

Dopo il controllo del required numeric blank, il gate ripristina un valore valido, verifica Save abilitato, salva realmente il bundle Nutrition nel profilo IndexedDB temporaneo del browser e attende una `.toast--success` nella notification region persistente. Il save pulisce inoltre il dirty state prima di passare alla successiva sequenza MealClass.

Il profilo Chromium usato dal gate e temporaneo e viene eliminato al termine della run.

## 6. Browser report Pass E

`scripts/hardening/browser-regression.mjs` produce ora:

- `reports/pass-e-browser.json` — report canonico della final acceptance A-E;
- `reports/pass-d-browser.json` — alias di compatibilita mantenuto per i riferimenti storici del Pass D.

Un ambiente che non dispone di Chromium o blocca localhost continua a produrre `status=skipped`, mai `passed`. Con `YDM_BROWSER_REQUIRED=1` lo skip e un errore di gate.

## 7. Revision closure gate

Aggiunto `npm run hardening:revision`, implementato da `scripts/hardening/revision-closure.mjs`.

Il gate verifica machine-to-machine:

- sincronizzazione `package.json` / `APP_VERSION`;
- presenza del Pass E in revision, roadmap e test strategy;
- presenza delle invarianti Pass E nella Skill di progetto e nei quality gates;
- copertura browser delle quattro acceptance interaction del Pass E;
- `YDM_BROWSER_REQUIRED=1` nel workflow GitHub Pages;
- ordine del main gate: browser regression prima del revision closure;
- stato dell'ultima browser run, accettando localmente solo gli skip ambientali esplicitamente riconosciuti e richiedendo `passed` quando il browser e obbligatorio.

Il report e `reports/pass-e-closure.json`.

## 8. Skill e specifiche

Aggiornati:

- `skills/yourdietmanager-builder/SKILL.md`;
- `skills/yourdietmanager-builder/references/quality-gates.md`;
- `skills/yourdietmanager-builder/references/reference-data-taxonomy.md`;
- `DATA_UX_HARDENING_REVISION.md`;
- `README.md`;
- `SPEC_README.md`;
- `specs/ROADMAP_V1.md`;
- `specs/TEST_STRATEGY.md`.

La Skill ora tratta la final acceptance browser come invariante del workflow di review/QA, evitando che una futura modifica degli editor possa essere dichiarata completa sulla sola base di source audit/unit test.

## 9. Versione candidate

La candidate passa da `1.0.0-rc.5` a **`1.0.0-rc.6`**. Non cambia `DB_VERSION=4` ne `CONTENT_SCHEMA_VERSION=3`: Pass E non introduce migrazioni dati.

## 10. Release blocker residuo

Pass E non rimuove ne aggira il gate dati production. `npm run release:gate` deve continuare a risultare **BLOCKED** sul catalogo fixture finche Phase 4 non pubblica:

- almeno 3.000 RecipeVersion validate;
- pipeline/catalog version production, non smoke/dev;
- IngredientRevision base curated/high-confidence con provenance adeguata;
- reference-data digest e quality gates verdi.

La V1 Data/UX Hardening Revision A-E e quindi chiusa a livello di implementazione. In un ambiente locale che blocca localhost, la final acceptance browser resta correttamente `skipped`; il workflow GitHub Pages la richiede invece `passed` prima del deploy.


## 11. Verifica eseguita

Gate locale finale:

- `npm run check` — PASS, con browser acceptance registrata `skipped` esclusivamente per `local-http-blocked-by-environment`;
- **108/108 test** — PASS;
- syntax check **97 file JavaScript** — PASS;
- accessibility source audit **16/16** — PASS;
- form contract audit — PASS;
- scale benchmark 10k — PASS;
- build + Pages artifact audit — PASS;
- Pass E revision closure **13/13** — PASS;
- project Skill validator/package — PASS.

`npm run release:gate` resta intenzionalmente **BLOCKED** con i quattro blocker production attesi: corpus sotto 3.000, pipeline fixture, 4 IngredientRevision base non curated/high e catalogVersion dev.
