# YourDietManager — V1 Final Manual Test Checklist

**Candidate:** `1.0.0-rc.27`
**Frozen catalog:** `1.0.0`
**Purpose:** final product acceptance before promoting the application to stable `v1.0.0`.

This is a product test, not another corpus-production exercise. The 60-recipe stratified corpus review and automated gates are already part of Step 3. The manual test should focus on whether the application is usable end-to-end in the deployed GitHub Pages build.

## Pass/fail rule

Promotion to stable V1 is allowed only when:

- GitHub Actions for the candidate is green;
- no P0/P1 blocker is found in this checklist;
- the core vertical flow completes without data corruption;
- you explicitly approve promotion to `v1.0.0`.

A cosmetic issue that does not block or materially mislead the supported flow can be logged post-V1. A safety violation, corrupted persisted state, unusable planner flow, wrong shopping derivation, backup failure or inability to reopen the app is a release blocker.

---

## 1. Fresh start and catalog

- [ ] Open the deployed app after the Step 3 push.
- [ ] The app starts without an IndexedDB/cache error or manual cleanup.
- [ ] Catalog status reaches `1.0.0`.
- [ ] Recipes shows the full **500 recipe** core catalog.
- [ ] Open several recipe details from both catalog and plan; no broken route/detail.
- [ ] Open ingredient details from at least two recipes.
- [ ] Search/filter recipes and confirm results are plausible.

**Blocker examples:** catalog <500, immutable-record error, blank detail, unresolved ingredient/reference.

## 2. Configuration and hard safety

- [ ] Configure nutrition/profile settings.
- [ ] Configure at least one diet preference (for example vegetarian) or exclusion.
- [ ] Configure at least one allergy/intolerance for a dedicated safety test.
- [ ] Configure meal/day/cycle settings and save them.
- [ ] Reload the app and confirm the settings persist.

**Safety check:** generate a plan with the allergy/intolerance active and inspect affected meals. No excluded allergen/ingredient may appear. Try at least one replacement and one rebalance while the safety constraint is active.

## 3. Planner vertical flow

Run one complete 7-day plan:

- [ ] Generate plan.
- [ ] Preview appears without critical error.
- [ ] Inspect at least 8–10 meals for culinary plausibility and reasonable quantities.
- [ ] Confirm plan.
- [ ] Open Today.
- [ ] Open Calendar.
- [ ] Open Manage day.
- [ ] Open a recipe from the plan.
- [ ] Replace one meal.
- [ ] Save one adherence result.
- [ ] Rebalance after the edit/adherence change.
- [ ] Undo and redo at least one plan edit.
- [ ] Reload the browser and confirm the effective plan remains coherent.

**Blocker examples:** hard constraint violation, replacement shown but impossible to commit, rebalance corrupts another day, reload changes/loses confirmed assignments.

## 4. Shopping/checklist

Using the confirmed/effective plan:

- [ ] Calculate shopping list.
- [ ] Inspect several aggregated quantities against the visible recipes.
- [ ] If people multiplier is used, verify the multiplier changes quantities sensibly.
- [ ] Tick several checklist items and save.
- [ ] Reload; checked state persists.
- [ ] Modify the plan, return to Shopping, and confirm stale shopping data is recalculated/invalidated appropriately.

**Blocker examples:** ingredients from external/excluded meals counted incorrectly, quantities obviously unrelated to plan, checklist disappears after reload, stale list silently survives plan edit.

## 5. Backup and restore

Do this before testing destructive deletion.

- [ ] Export a backup from Backup.
- [ ] Change a harmless setting (for example appearance/density).
- [ ] Import the backup.
- [ ] Confirm the prior setting/configuration and plan state are restored.
- [ ] Confirm the 500 base recipes are still available after import.

**Blocker examples:** exported JSON invalid, import rejects a backup created by the same candidate, base catalog is removed/replaced, plan/configuration is corrupted.

## 6. IT/EN and accessibility sanity

- [ ] Switch Italian → English and visit Today, Calendar, Recipes, Shopping, Configure, Backup.
- [ ] Switch back English → Italian.
- [ ] No raw translation keys are visible in these main screens.
- [ ] Keyboard Tab can reach primary navigation and major buttons/forms.
- [ ] Focus/labels are understandable on the main configuration/planner flow.
- [ ] Test at one mobile/narrow viewport; core actions remain usable.

## 7. PWA/offline sanity

- [ ] Install/open as PWA if the browser exposes the install option.
- [ ] After one successful online load, disable network and reload/open the app.
- [ ] Shell opens offline.
- [ ] Existing local plan/catalog data needed for supported offline use remains accessible.
- [ ] Re-enable network and confirm normal operation resumes.

Do not classify features that inherently require fetching uncached new data as blockers if the supported local-first flow remains available.

## 8. Destructive local-data deletion — perform last

Only after backup/restore testing is complete:

- [ ] Open Backup and choose **Delete local data**.
- [ ] Confirm the destructive prompt.
- [ ] App reloads to a clean bootstrap state.
- [ ] Personal configuration, plan history and shopping checklist are gone.
- [ ] Public app/catalog can bootstrap again without manually clearing browser storage.
- [ ] No immutable-catalog or old-RC migration error appears.

## Final decision

Record only one outcome:

- [ ] **ACCEPT V1** — no P0/P1 blockers; promote `1.0.0-rc.27` → `1.0.0`.
- [ ] **BLOCK V1** — list the exact failing screen/action, expected behavior, actual behavior and any visible error.

If accepted, the final promotion must not regenerate the corpus or change schemas/IDs. It is a minimal release promotion plus final gate/tag.
