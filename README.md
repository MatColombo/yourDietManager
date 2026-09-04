# yourDietManager — V1 Release Candidate

Local-first PWA implementation through **Phase 8 — Hardening & V1 release gates**.

Candidate version: **`1.0.0-rc.6`**.

Phases 1–7 remain fully present: IndexedDB persistence, onboarding/configuration, backup/import, IT/EN, theme engine, indexed catalog/search/packs, versioned catalog authoring, corpus-orchestration tooling, deterministic seeded plan generation, effective-plan UX with history/undo, shopping checklists and preparation horizon.

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

## V1 Data/UX Hardening — Pass A + Pass B + Pass C + Pass D + Pass E

Pass A through Pass E are implemented on top of the release candidate. The current runtime remains **IndexedDB DB v4 / content schema v3** with canonical `taxonomies` / `taxonomyTerms`, a 7-taxonomy/113-term seed registry, reference-data digest/versioning, semantic validation and audited legacy migration.

Pass B makes those contracts the normal UI path: `Configura -> Tassonomie e reference data`, canonical autocomplete selectors for entity/taxonomy references, chip multi-selects for recipe taxonomy metadata, hierarchical food group/subgroup selection, localized closed enums, ingredient-dependent recipe-line units, unified MealArchetype defaults and inline validation. Semantic CSV/free-text entry is no longer used by ordinary authoring/configuration forms.

Pass C disables the provisional onboarding UI and boots fresh installs with a neutral standard configuration; centralizes disclosure state, dirty-route protection and persistent save/error notifications; fixes `DayClass.capabilities`; and live-validates forms against schema, cross-record invariants and reference data before Save. Background rerenders no longer replace a dirty editor.

Pass D makes recipe/ingredient detail independent from planning, adds canonical dynamic detail/edit routes, exposes Edit for both catalog and local families, and keeps internal revision/version history immutable. Editing a catalog family promotes that stable family ID to local management; later catalog updates/pack installs cannot overwrite its local current pointer. Duplicate remains a distinct new-family action. A dependency-free Chromium/CDP regression harness is included and is required by the GitHub Pages workflow; local environments that block localhost are reported as skipped rather than passed. See `DATA_UX_HARDENING_PASS_D_REPORT.md`.

Pass E turns the final interaction acceptance into an explicit gate: browser coverage now includes required-field/schema parity, disclosure preservation after local rerenders, dirty-navigation reject/accept, persistent save feedback, and the existing recipe/ingredient detail/edit path. `npm run hardening:revision` verifies that code, docs, Skill guidance, CI browser requirements and the latest browser report stay aligned. See `DATA_UX_HARDENING_PASS_E_REPORT.md`.


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
npm run hardening:forms
npm run hardening:browser
npm run hardening:revision
npm run release:gate
```

No `npm install` is required.

## Current status

**Phase 8 implementation is complete and the hardening suite is green.**

The repository is intentionally still a **release candidate**, not V1.0 final. The final release gate blocks promotion because the bundled base catalog is still the development fixture: 3 recipes, 4 low-confidence/draft ingredient revisions, `pipelineVersion=phase3-fixture`, `catalogVersion=0.3.0-dev`.

The remaining V1 data gate is the already-known Phase 4 production-data deliverable: curate the ingredient source and publish 3,000–5,000 validated recipes. Pass E implementation closes the hardening revision; the GitHub Actions verification step requires the full final-acceptance browser regression instead of silently accepting a skipped browser run. After the production corpus is complete, rerun `npm run check` and `npm run release:gate`; only a fully green gate should be tagged `1.0.0`.


## Mandatory data/UX hardening before production corpus

The production Phase 4 corpus remains paused only for the production-data gate. Pass A canonicalizes and validates reference data at data/service/pipeline boundaries; Pass B replaces normal semantic free-text/CSV paths with guided canonical controls; Pass C hardens editor state/feedback, form/schema parity and neutral bootstrap; Pass D closes recipe/ingredient detail and transparent editing/versioning; Pass E closes the end-to-end acceptance gate for editor integrity and browser interactions. The corpus orchestrator/pipeline can propose/materialize required extensible taxonomy terms before recipe generation, while closed registries remain non-extensible. See `DATA_UX_HARDENING_REVISION.md`, `DATA_UX_HARDENING_PASS_D_REPORT.md`, `DATA_UX_HARDENING_PASS_E_REPORT.md`, `REFERENCE_DATA_FIELD_INVENTORY.md` and `specs/REFERENCE_DATA_TAXONOMY_SPEC.md`.
