# yourDietManager — V1 Release Candidate

Local-first PWA implementation through **Phase 8 — Hardening & V1 release gates**.

Candidate version: **`1.0.0-rc.1`**.

Phases 1–7 remain fully present: IndexedDB persistence, onboarding/configuration, backup/import, IT/EN, theme engine, indexed catalog/search/packs, immutable personal catalog authoring, corpus-orchestration tooling, deterministic seeded plan generation, effective-plan UX with history/undo, shopping checklists and preparation horizon.

## Phase 8 adds

- bounded catalog browsing and operation-history access at 10k scale;
- IndexedDB DB v3 / content schema v2 migration and interruption recovery;
- catalog update journaling, recovery and reversible active-state rollback;
- offline catalog-pack shard caching;
- storage/quota and integrity metrics;
- accessibility hardening for keyboard, focus, landmarks, reduced motion and forced colors;
- automated accessibility and 10k-scale hardening gates;
- an explicit final V1 release gate.

See `PHASE8_IMPLEMENTATION_REPORT.md` for the full implementation and verification record.


## GitHub Pages

This package is GitHub Pages-ready. Use **Settings -> Pages -> Source: GitHub Actions**; do not publish the repository root directly. The included `.github/workflows/pages.yml` verifies the app, obtains the repository Pages `base_path`, builds `dist/`, checks the artifact and deploys it.

Project-site paths such as `https://USERNAME.github.io/yourDietManager/`, root user sites and root custom domains are supported without hardcoding the repository name. Direct SPA links are handled by the generated `404.html` redirect and deployment-specific `<base href>`.

See `GITHUB_PAGES_DEPLOYMENT.md` for the exact setup and troubleshooting model.

## Commands

```bash
npm run dev
npm run check
npm run hardening:a11y
npm run hardening:scale
npm run release:gate
```

No `npm install` is required.

## Current status

**Phase 8 implementation is complete and the hardening suite is green.**

The repository is intentionally still a **release candidate**, not V1.0 final. The final release gate blocks promotion because the bundled base catalog is still the development fixture: 3 recipes, 4 low-confidence/draft ingredient revisions, `pipelineVersion=phase3-fixture`, `catalogVersion=0.3.0-dev`.

The remaining work is the already-known Phase 4 production-data deliverable: curate the ingredient source and publish the required 3,000–5,000 validated recipes. After that, rerun `npm run check` and `npm run release:gate`; only a fully green gate should be tagged `1.0.0`.
