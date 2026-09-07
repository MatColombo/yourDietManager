# yourDietManager — V1 Step 2 Implementation Report

**Step:** 2 — Vertical Product / Engine Acceptance
**Baseline:** V1 Step 1 candidate (`1.0.0-rc.25`, catalog `1.0.1-v1-candidate-500`)
**Candidate app:** `1.0.0-rc.26`
**Catalog:** unchanged, `1.0.1-v1-candidate-500`
**Status:** implementation and deterministic acceptance complete; mandatory real-Chromium UI acceptance executes in GitHub Actions on push

## Objective applied

Step 2 validates the product as one vertical flow rather than as isolated modules:

`Configuration -> Generate plan -> Preview -> Confirm -> Today/Calendar -> Manage day -> Replace -> Rebalance -> Adherence -> Shopping -> Checklist -> Reload`

No additional corpus scaling, pre-V1 compatibility layer, or data migration was introduced. The Step 1 data epoch is intentionally unchanged so Step 2 can verify persistence across edits and reloads instead of resetting the database again.

## Product defects corrected

### 1. Plan recipe metrics UI scope

`src/ui/planPages.js` called `recipePills()` with translation/runtime state outside the function scope. A real plan render could therefore throw a `ReferenceError` even though service-level planner tests were green.

The helper now receives state explicitly.

### 2. Recipe links from the plan

Plan recipe links were generated as `/recipes/?id=...`, while the router's canonical detail route is `/recipes/:recipeId`.

They now use the canonical route and retain the frozen RecipeVersion identifier in the query string.

### 3. Undo/redo shopping staleness

Undo and redo restored the historical `planUpdatedAt` value contained in the operation snapshot. This could make a shopping checklist appear current after the effective plan had changed.

Undo/redo now advance `planUpdatedAt` to the mutation timestamp. The plan change clock is therefore monotonic and shopping staleness remains correct after replacement/rebalance history operations.

### 4. Shopping view stale derived state

The SPA retained `state.shoppingUi.calculated` across route changes. Returning to Shopping after editing a plan could display the previous calculation until the user manually recalculated.

The Shopping view now derives a calculation key from:

- locale;
- civil date range;
- people multiplier;
- current `planUpdatedAt`.

The list is recalculated whenever that key changes.

### 5. Offline data cache split

`offlineCatalog.js` still addressed `ydm-data-v12` while the Step 1 service worker used `ydm-data-v13`.

Both runtime paths now use data cache v13. The shell cache was bumped to v28 so browsers do not retain the previous Step 1 JavaScript bundle. The pre-V1 cache allowlist was updated accordingly without changing the data epoch.

## Engine acceptance scenarios

A new real-catalog suite, `tests/v1-step2.test.mjs`, executes all six Step 2 scenarios against the 500-recipe candidate and canonical configuration/reference data.

### Scenario A — Standard omnivore, 7 days

PASS.

Verified:

- deterministic output for same input + seed;
- 7 CalendarDays;
- 28 meal slots;
- meaningful recipe variety;
- daily planned energy within configured 10% tolerance;
- every frozen RecipeVersion resolves;
- every IngredientRevision resolves;
- committed plan reloads as the effective plan.

### Scenario B — Vegetarian

PASS.

Verified:

- meat, poultry and fish/seafood canonical food groups auto-excluded;
- generated recipes carry compatible vegetarian semantics;
- no excluded food category appears in selected ingredients;
- replacement candidates apply the same exclusions.

### Scenario C — Hard safety

PASS using a hard milk-allergen rule.

Verified zero incompatible recipes during:

- initial generation;
- replacement candidate generation;
- multi-day rebalance;
- persisted effective plan after commit.

### Scenario D — Configurable days/meals/external/carry-over

PASS.

A two-day configuration adds an Office DayClass, a Mini MealClass, an external lunch and a `dayOffset: 1` carry-over meal.

Verified:

- external meal has no RecipeVersion component;
- external energy is represented through its budget policy;
- carry-over appears on the correct next civil date;
- portable and <=10 minute prep capability filters are enforced;
- effective-plan civil-day loading includes carry-over;
- shopping excludes the external meal and counts only planned occurrences.

The current 500-recipe corpus labels the relevant recipes as fridge-required, so Step 2 does not invent an unsupported `fridge=no` office scenario. Fridge/reheating remain `unknown` in this acceptance fixture while portability and prep-time constraints are exercised against actual corpus capabilities.

### Scenario E — Effective-plan editing

PASS.

Verified:

- single-meal replacement;
- undo restores the original frozen RecipeVersion;
- redo restores the replacement;
- monotonic `planUpdatedAt` across undo/redo;
- adherence persistence;
- day rebalance commit;
- range rebalance is covered by the hard-safety scenario;
- reload preserves PlanInstance, edited meal and adherence state;
- history remains undoable.

### Scenario F — Shopping and preparation

PASS.

Verified:

- shopping derives from the frozen effective plan;
- 1.5 people multiplier scales quantities linearly;
- aggregation identity retains normalized unit and ingredient basis state;
- checklist checked state/notes survive refresh where the item still exists;
- plan replacement marks the checklist stale;
- refresh clears staleness;
- undo marks it stale again;
- redo marks it stale again after a refresh;
- preparation horizon resolves the frozen recipe versions in the plan.

## Real-browser acceptance gate

`scripts/hardening/browser-regression.mjs` now includes a Step 2 UI path in real Chrome/Chromium using the real built PWA and IndexedDB.

It covers:

1. create a 7-day plan;
2. preview and confirm;
3. verify persisted 7-day PlanInstance;
4. open a recipe from the plan through the canonical detail route;
5. open Manage Day;
6. replace a planned meal;
7. persist adherence;
8. preview and commit rebalance;
9. undo and redo through History;
10. calculate Shopping;
11. save a checklist and check an item;
12. perform a full page reload;
13. verify the checklist item and active plan remain persisted;
14. fail on browser runtime exceptions or console errors.

Stable `data-testid` hooks were added only to the relevant plan/history/shopping controls so the gate does not depend on translated button text or visual layout.

GitHub Pages runs `npm run check` with `YDM_BROWSER_REQUIRED=1`. Therefore missing Chromium, blocked navigation, timeout, runtime exception, or failed Step 2 browser assertion blocks deployment.

## CI and hardening integration

Added commands:

- `npm run v1:step2-engine`
- `npm run v1:step2-gate`

`npm run check` now runs Step 1 and Step 2 release gates before the historical regression/hardening suite.

The V1 candidate publication workflow also runs Step 2 gate immediately after Step 1 gate.

The Step 2 closure gate checks 12 release-critical contracts, including:

- app version sync;
- canonical plan recipe route;
- plan metric state scope;
- plan acceptance hooks;
- undo/redo staleness clock;
- shopping recalculation key;
- shopping acceptance hooks;
- offline/service-worker cache parity;
- shell-cache invalidation;
- six engine scenarios present;
- browser vertical acceptance present;
- Pages requires the browser run.

## Verification performed

Verified in the execution environment:

- Step 2 engine scenarios: **PASS 6/6**;
- Step 2 closure gate: **PASS 12/12**;
- Step 1 gate after Step 2 changes: **PASS 14/14**;
- complete automated repository suite before the final browser-diagnostic-only edit: **PASS 188/188**;
- lint after final edits: **PASS, 150 JavaScript files**;
- accessibility source audit: **PASS 16/16**;
- form/contract audit: **PASS**;
- revision closure: **PASS 13/13**;
- root static PWA build: **PASS**;
- GitHub Pages `/yourDietManager/` build: **PASS**;
- GitHub Pages artifact audit: **PASS**.

The aggregate `npm run check` cannot finish inside this container's execution timeout because the historical full test suite is long-running. Its components were therefore verified separately. This is an environment/time-limit issue, not treated as a passing aggregate run.

Local Chromium starts and DevTools connects, but the environment enforces an organization policy that replaces `http://127.0.0.1:<port>/...` with `chrome-error://chromewebdata/` and the message `127.0.0.1 is blocked`. The browser gate now reports that condition explicitly. Locally it is a skip; under GitHub Pages CI, `YDM_BROWSER_REQUIRED=1` turns the same condition into a failed deployment.

## Step 2 exit condition

The implementation is ready for mandatory GitHub Chromium acceptance. Step 2 becomes formally PASS when the pushed candidate completes that required browser job.

If GitHub is green, no further planner/effective-plan/shopping hardening is required before Step 3 unless manual product use reveals a new P0/P1 defect.

The next work item is **Step 3 — V1 Freeze + Release**: freeze schemas/IDs/contracts, run the reduced stratified human review, close essential backup/offline/i18n/accessibility release gates, and tag `v1.0.0`.
