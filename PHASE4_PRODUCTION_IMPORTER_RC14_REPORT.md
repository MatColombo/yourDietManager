# Phase 4 Production USDA Importer Hotfix — rc.14

Candidate: **`1.0.0-rc.14`**

Status: **FIXED / READY TO RE-RUN NETWORK WORKFLOW**

## Failure reproduced

The first source-backed GitHub Actions run reached `Import USDA sources as review intake` and failed while reading the official Foundation Foods JSON because the food array contained a `null` element. rc.13 assumed every array element was an object and dereferenced `food.foodNutrients`.

## rc.14 behavior

- null and non-object food-array elements are skipped instead of dereferenced;
- food records without `fdcId` are skipped;
- null/non-object entries inside `foodNutrients` are ignored while other valid nutrients on the same food remain usable;
- structurally invalid food rows are counted separately from nutrient-incomplete rows;
- up to 20 `{index, reason}` samples are retained in the review-batch audit metadata;
- structural source skips surface as a warning in curation assessment and never become materializable data;
- the >=400 curated/high pilot gate and all downstream production thresholds remain unchanged.

## Regression coverage

The Foundation import test now includes a null food record, a record without FDC ID, and a null nutrient entry. The valid food in the same payload still produces one pending review record and the structural skips are audited.

Final local verification:

- test suite: **149/149 PASS**;
- integrated `npm run check`: **PASS**;
- accessibility: **16/16 PASS**;
- form contract: **PASS**;
- scale benchmark: **PASS**;
- Pass E closure: **13/13 PASS**;
- Pages artifact `/`: **PASS**;
- Pages artifact `/yourDietManager`: **PASS**;
- local browser regression: DevTools starts, then is skipped only because localhost HTTP is blocked in this runtime.

## Re-run

Deploy/push rc.14 and dispatch `Build Production Corpus Working Set` again with:

- `target_ingredients=600`
- `commit_results=false`

The workflow itself does not need different inputs. The import log will now include `incomplete=<n>` and `structurallyInvalid=<n>` for each USDA source.
