# yourDietManager 1.0.0-rc.27 — V1 Release Candidate Notes

This build is the final candidate for manual acceptance before the first stable release.

## What is included

- local-first diet planning PWA with configuration, Today/Calendar and multi-day planner;
- 500-recipe frozen V1 catalog backed by 600 curated ingredients;
- hard allergy/intolerance and diet filtering across generation, replacement and rebalance;
- effective-plan editing with adherence, rebalance and undo/redo;
- derived shopping list with persistent checklist and stale-state handling;
- backup/import and destructive local-data deletion;
- Italian and English UI;
- PWA/offline shell and cached catalog support.

## Data freeze

The V1 catalog is already frozen at `1.0.0`. The application remains `1.0.0-rc.27` until manual acceptance. The final stable promotion must not regenerate this catalog.

## Known release-candidate condition

No stable release tag exists yet. `release:gate` is expected to remain blocked until the final checklist is accepted and the application version is promoted to `1.0.0`.

## Final acceptance

Use `V1_FINAL_TEST_CHECKLIST.md`. If no P0/P1 blockers are found and GitHub Actions is green, the candidate can be promoted with a minimal version/acceptance/tag change.
