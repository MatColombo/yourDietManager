# GitHub Pages deployment

This repository is ready for GitHub Pages project sites and root/custom-domain sites.

## Recommended publishing mode

Use **Settings -> Pages -> Source: GitHub Actions**.

Do not configure `Deploy from a branch -> /(root)` for this repository. The source tree contains development files; the Pages workflow builds and publishes only `dist/`.

## First deployment

1. Create or open the GitHub repository.
2. Put the contents of this project at the repository root. `.github/workflows/pages.yml` must remain in that exact path.
3. Push to the `main` branch.
4. Open **Settings -> Pages** and select **GitHub Actions** as the source if it is not already selected.
5. Open the **Actions** tab and wait for `Deploy GitHub Pages` to complete.
6. Open the URL shown by the `github-pages` deployment.

No repository name needs to be configured in the application. `actions/configure-pages` supplies the current Pages `base_path` to the build.

## What the workflow does

The workflow:

- runs the full application verification gate;
- reads the Pages `base_path` from `actions/configure-pages`;
- builds `dist/` with the correct `<base href>`;
- generates a `404.html` SPA redirect for direct links such as `/calendar/day?...`;
- audits the Pages artifact;
- uploads `dist/` with `actions/upload-pages-artifact`;
- deploys it with `actions/deploy-pages`.

## Base-path behavior

For a project repository named `yourDietManager`, the default Pages location is normally:

```text
https://USERNAME.github.io/yourDietManager/
```

The same code also works when Pages is hosted at `/`, for example a `USERNAME.github.io` repository or a root custom domain.

Runtime paths for routes, schemas, locales, catalog shards, the manifest and service worker are resolved relative to the deployed application root. The repository name is therefore not hardcoded.

## SPA direct links and offline behavior

GitHub Pages does not provide arbitrary SPA rewrites. The build generates `dist/404.html`, which redirects a direct route to the application entry point while preserving the requested route in `__ydm_route`. The application restores the route with `history.replaceState` before rendering.

The built `index.html` also has a deployment-specific `<base href>`, so direct/offline navigation does not resolve JavaScript or CSS relative to a nested route.

The service worker derives its scope from its own deployed URL and uses scope-specific cache names, preventing project-path assumptions and reducing cache collisions between Pages project sites on the same `github.io` origin.

## Local verification

Root build:

```bash
npm run check
```

Simulate a project Pages base path:

```bash
YDM_BASE_PATH=/yourDietManager npm run build
node scripts/hardening/pages-audit.mjs dist /yourDietManager
```

The production V1 release gate remains separate:

```bash
npm run release:gate
```

It is expected to remain blocked until the Phase 4 production corpus replaces the development fixture.
## Pass E final-acceptance browser gate

The Pages workflow first resolves an executable browser and exports `CHROMIUM_PATH`, preferring the runner's stable `google-chrome`/`google-chrome-stable` over the separately installed Chromium snapshot. The browser harness launches headless Chrome with a temporary non-default user-data directory, `--remote-debugging-port=0`, and discovers the assigned endpoint from `DevToolsActivePort` (with the emitted DevTools URL as fallback). This avoids fixed-port collisions and makes early browser exits visible in CI diagnostics.

The Pages workflow runs the application check with `YDM_BROWSER_REQUIRED=1`. This makes the Chromium/CDP final-acceptance suite a deployment gate in CI: a missing browser, blocked localhost navigation, failed recipe/ingredient detail/edit route, dirty-navigation regression, disclosure-state regression, form/schema mismatch, or missing save feedback blocks the Pages build instead of being accepted as a skipped test. The dirty-navigation check follows the rendered UI path (`/configure/meals` -> `/configure` -> `/configure/days`) rather than assuming a direct Day classes link exists on the Meal classes page. Local developer environments may run `npm run hardening:browser` without this variable; if their organization blocks localhost, the result is recorded in `reports/pass-e-browser.json` as `skipped` (with `pass-d-browser.json` retained as a compatibility alias). `npm run hardening:revision` runs after the browser check and verifies the A-E closure contract.



## rc.9 — recovery da bootstrap/migration failure persistito

La PWA registra/aggiorna ora la Service Worker tramite `src/recoveryBootstrap.js` **prima** di `src/main.js`. Questo evita che un errore di bootstrap applicativo impedisca al browser di ricevere una Service Worker nuova e continui quindi a servire moduli JS obsoleti dalla shell cache precedente.

Le cache correnti sono `ydm-shell-v26-<scope>` e `ydm-data-v12-<scope>`. `updateViaCache: 'none'` e `registration.update()` forzano il controllo del worker dalla rete; al cambio controller viene eseguito un solo reload protetto da `sessionStorage`.

Per upgrade da installazioni pre-hardening, `contentMigration:3` e resumable. Una FoodPreference legacy non-hard salvata come `ingredient:uova` viene re-tipizzata in modo auditato a `foodCategory:food_group_eggs`; non e un alias runtime e non modifica regole `autoExclude=true`.

Se si sta testando una build precedente gia bloccata prima di rc.9, un hard refresh o la rimozione una tantum della vecchia Service Worker puo accelerare il primo caricamento della rc.9, ma non e parte del flusso normale dopo che `recoveryBootstrap.js` e stato ricevuto.


## Production-review catalog publication

The 500-recipe review catalog is intentionally published by `.github/workflows/production-review-500.yml`, not by copying a prebuilt catalog into the repository. Run **Publish 500 Recipe Review Catalog** first with `commit_results=false`; after it is green, rerun with `commit_results=true`. The commit updates the base catalog JSON and the normal Pages workflow then deploys it.

A fresh browser profile imports the 500-recipe review catalog on first bootstrap. An existing profile keeps its local data and applies the new base catalog through the normal catalog-update path. The manifest remains `releaseEligible=false` until the later production release process.
