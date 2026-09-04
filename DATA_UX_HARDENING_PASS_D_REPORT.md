# V1 Data/UX Hardening — Pass D Report

## Stato

**DONE (implementation)** — candidate `1.0.0-rc.5`.

Pass D chiude il blocco Recipe/Ingredient Detail & Editing UX sopra Pass A-C. La sola verifica non eseguibile nel runtime locale e il click-level Chromium contro localhost, che viene registrato come `skipped` per policy ambientale; il workflow GitHub Pages imposta invece il browser regression come gate richiesto.

## 1. Recipe detail indipendente dal planner

Il catalogo usa route canoniche dinamiche:

```text
/recipes/<recipeId>
/recipes/<recipeId>/edit
```

La card ricetta apre sempre il dettaglio catalogo. `routePath()` normalizza anche trailing slash come `/recipes/`, evitando il precedente fall-through verso la pagina Today/Create plan.

Il dettaglio risolve Recipe family e RecipeVersion direttamente da CatalogQueryService e non legge PlanInstance, CalendarDay o GenerationRun. Funziona quindi anche prima della prima generazione piano.

Il dettaglio mostra almeno:

- titolo/descrizione;
- nutrienti;
- ingredient lines con link al dettaglio ingrediente/revisione congelata;
- istruzioni e practical metadata;
- MealArchetype, allergeni e tassonomie canoniche;
- provenance/origin;
- numero versione e storico RecipeVersion;
- azioni Modifica e Duplica ricetta.

Una versione storica resta consultabile tramite query `?version=<recipeVersionId>`.

## 2. Ingredient detail indipendente dal planner

Aggiunte route:

```text
/configure/ingredients/<ingredientId>
/configure/ingredients/<ingredientId>/edit
```

Il dettaglio mostra:

- nome e stato/basis;
- energia, proteine, carboidrati, grassi e fibra con label esplicite;
- food group/subgroup e flavor profile canonici;
- MealArchetype e allergeni;
- provenance/quality;
- numero revisione e storico IngredientRevision.

Una revisione storica resta consultabile tramite `?revision=<ingredientRevisionId>`.

## 3. Edit per qualunque origine

`origin` non e piu trattato come edit permission.

La prima modifica di una family distribuita:

1. mantiene lo stesso stable `recipeId`/`ingredientId`;
2. crea una nuova immutable RecipeVersion/IngredientRevision `origin=user`;
3. imposta `supersedesVersionId`/revision number coerente;
4. avanza il family current pointer;
5. promuove la family a gestione locale (`origin=user`);
6. lascia il record storico base invariato.

Per l'utente l'azione e semplicemente **Modifica**. Il versionamento storico resta un dettaglio di integrita interna.

Le label UI di origine sono state chiarite da `Base/Personale` a `Catalogo/Locale` (EN: `Catalog/Local`) per descrivere provenance/gestione e non suggerire read-only.

## 4. Catalog update e local override

Una family promossa localmente non puo essere sovrascritta da update/rollback/install pack successivi.

`CatalogUpdater` filtra le incoming base family quando esiste gia la stessa family ID `origin=user`. Nuovi immutable record base possono essere staged nello storico, ma il current pointer locale resta autorevole.

Il custom catalog transfer consente inoltre di esportare/importare una local override con lo stesso stable family ID della family distribuita. Restano vietate collisioni sugli immutable IngredientRevision/RecipeVersion ID.

## 5. Duplicate separato da Edit

`Duplica ricetta` continua a creare una nuova Recipe family con nuovo `recipeId`.

`Modifica` non duplica, non rinomina come copia e non cambia stable family ID. Questo elimina il precedente workaround concettuale `duplica per modificare`.

## 6. Dirty-state sulle route dinamiche

Le nuove route editor dinamiche sono registrate in `uiState.isEditableRoute(...)`:

- `/recipes/<recipeId>/edit`;
- `/configure/ingredients/<ingredientId>/edit`.

Restano quindi sotto lo stesso dirty-navigation guard Pass C per link interni, Back/Forward e reload/close.

## 7. Browser regression harness

Aggiunto `scripts/hardening/browser-regression.mjs`, dependency-free e basato su Chromium DevTools Protocol.

Il flusso automatico verifica:

1. apertura `/recipes`;
2. click card -> vero recipe detail;
3. assenza di contenuto Create plan nel detail;
4. Edit disponibile anche per contenuto catalogo;
5. apertura editor ricetta;
6. apertura catalogo ingredienti;
7. click -> ingredient detail;
8. Edit disponibile anche per ingrediente catalogo.

In questo runtime Chromium blocca esplicitamente la navigazione HTTP localhost; il report `reports/pass-d-browser.json` e quindi `skipped` con reason `local-http-blocked-by-environment`, non `passed`.

Per evitare che questo limite locale indebolisca il deploy, `.github/workflows/pages.yml` esegue `npm run check` con:

```text
YDM_BROWSER_REQUIRED=1
```

In CI, assenza Chromium o blocco localhost rende il gate fallito invece di essere accettato silenziosamente.

## 8. Gate automatici

Verifica completata:

- `npm run check` — PASS locale, con browser regression registrato SKIPPED per policy localhost;
- corpus smoke Phase 4 — PASS;
- planner smoke Phase 5 — PASS;
- **105/105 test** — PASS;
- syntax check **95 file JavaScript** — PASS;
- accessibility source audit **16/16** — PASS;
- `npm run hardening:forms` — PASS;
- benchmark catalog/history 10k — PASS (browse 10.6 ms, filtered 84.4 ms, history 16.1 ms nell'ultima run);
- build root `/` — PASS;
- build/audit GitHub Pages `/yourDietManager/` — PASS;
- IT/EN parity **624/624 chiavi** — PASS;
- Skill validator/package — PASS.

Il browser report locale e `reports/pass-d-browser.json` con status `skipped`, reason `local-http-blocked-by-environment`. Il workflow GitHub Pages imposta `YDM_BROWSER_REQUIRED=1`, quindi in CI un browser gate skipped/fallito blocca il deploy invece di essere considerato verde.

## 9. Release gate V1

Pass D non modifica il known production corpus blocker. `npm run release:gate` deve continuare a fallire finche il catalogo distribuito non soddisfa i requisiti Phase 4 production (>=3000 ricette validate, production pipeline/catalog version e ingredienti autorevoli curated/high).

## 10. Risultato

Dopo Pass D la consultazione e la modifica del catalogo non dipendono dal piano e non esiste piu una distinzione UX tra contenuto editabile `user` e contenuto non editabile `base`.

Resta immutabile soltanto cio che deve esserlo per riproducibilita: le singole revisioni/versioni storiche gia pubblicate o referenziate.
