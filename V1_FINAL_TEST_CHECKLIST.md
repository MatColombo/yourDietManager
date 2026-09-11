# YourDietManager — Final V1 Manual Acceptance Checklist

**Candidate:** `1.0.0-rc.34`  
**Frozen catalog:** `1.2.0-planner-phase-d`  
**Data contract:** 600 ingredients / 1,800 fixed-serving recipes  
**Freeze:** Phase G content freeze / Phase H release handoff

The Phase E harness is the main manual journal. This checklist is the final release decision layer after automated Phases A–H are green.

## Pass/fail rule

Stable promotion is allowed only when:

- GitHub Actions `Verify V1 Planner Phase H` is green;
- all required Phase E cases are PASS;
- no P0/P1 finding remains open;
- the full vertical product flow completes without corruption or hard-constraint violations;
- you explicitly record **ACCEPT V1**.

## 1. Fresh start and catalog

- [ ] App starts without manual IndexedDB/cache cleanup.
- [ ] Catalog status reaches `1.2.0-planner-phase-d`.
- [ ] Recipes exposes the full **1,800 recipe** core catalog.
- [ ] Recipe detail opens from catalog and plan.
- [ ] Ingredient detail opens from recipe detail.
- [ ] Product-food taxonomy filters behave coherently, including Dairy and Noodles sentinel checks.

## 2. Planner hard contract

- [ ] Successful days remain inside configured hard daily-energy tolerance.
- [ ] Every planned RecipeVersion component remains `servings=1`.
- [ ] Allergy/intolerance and auto-exclusion rules produce zero violations.
- [ ] MealClass forbid and DayClass capability constraints produce zero violations.
- [ ] Impossible configurations fail with classified bounded-search diagnostics instead of an out-of-range plan.

## 3. Planner quality and regeneration

- [ ] 800, 1400, 2000 and 2600 kcal stress cases are usable at ±2% where required by the Phase E harness.
- [ ] 2600 kcal / 14 days reaches the Phase F quality floor (>=70% unique recipes, zero exact-recipe repeat pairs within 3 days).
- [ ] Prefer/avoid/frequency and protein/fibre soft settings move ranking in the expected direction without acting as hard filters.
- [ ] Recalculate may keep the same recipe when it remains best.
- [ ] Propose alternative changes recipes when a strict hard-valid alternative is found and explains fallback retention honestly.

## 4. Vertical product flow

Complete one real persisted flow:

`Configura -> Genera piano -> Preview -> Conferma -> Oggi -> Calendario -> Gestisci giorno -> Sostituisci -> Ribilancia -> Adherence -> Spesa -> Checklist -> Reload`

- [ ] 7-day plan can be generated and confirmed.
- [ ] Replace/rebalance preserve hard validity.
- [ ] Undo/redo preserves coherent effective-plan state.
- [ ] Reload preserves configuration, plan and operation state.
- [ ] Day -> Recipe -> Ingredient -> Back returns to the originating meal slot.

## 5. Shopping/checklist

- [ ] Shopping is derived from frozen effective-plan recipes.
- [ ] External meals are excluded as specified.
- [ ] People multiplier changes quantities correctly.
- [ ] Ingredient state/unit aggregation is coherent.
- [ ] Checklist state persists after reload.
- [ ] Plan edits make derived shopping stale/recalculable as designed.

## 6. Backup, language, accessibility and PWA

- [ ] Backup export/import round-trips current configuration and plan state without replacing the base catalog.
- [ ] IT/EN main flows show no raw translation keys.
- [ ] Primary controls are keyboard reachable and labels/focus are understandable.
- [ ] Core flow remains usable at a narrow/mobile viewport.
- [ ] After one online bootstrap, supported local/offline use continues to open correctly.
- [ ] Delete local data removes private state and allows clean bootstrap without manual browser-storage repair.

## Final decision

Record exactly one outcome:

- [ ] **ACCEPT V1** — all required Phase E cases PASS, zero P0/P1 blockers, Phase H CI green.
- [ ] **BLOCK V1** — record screen/action, expected behavior, actual behavior and severity.

If accepted, export the Phase E report and use the Phase H promotion boundary. Stable promotion must preserve the Phase G frozen catalog/content, planner policy, DB/schema/backup contract, PWA data cache and pre-V1 epoch. Only the five Phase H-declared metadata/evidence paths may change unless a blocker forces a new candidate cycle. After promotion, both `npm run check` and `npm run release:gate` must pass before tagging `v1.0.0`.
