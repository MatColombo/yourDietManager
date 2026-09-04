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

The Pages workflow runs the application check with `YDM_BROWSER_REQUIRED=1`. This makes the Chromium/CDP final-acceptance suite a deployment gate in CI: a missing browser, blocked localhost navigation, failed recipe/ingredient detail/edit route, dirty-navigation regression, disclosure-state regression, form/schema mismatch, or missing save feedback blocks the Pages build instead of being accepted as a skipped test. Local developer environments may run `npm run hardening:browser` without this variable; if their organization blocks localhost, the result is recorded in `reports/pass-e-browser.json` as `skipped` (with `pass-d-browser.json` retained as a compatibility alias). `npm run hardening:revision` runs after the browser check and verifies the A-E closure contract.

