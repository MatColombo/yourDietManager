# Clean catalog source

This folder is the only authored source for the base food catalog.

Workflow:

```text
prompt + CATALOG_AI_AUTHORING.md
  -> one new JSON batch in catalog-source/
  -> npm run catalog:compile
  -> public/data/catalog.json
  -> deploy
  -> app replaces the base catalog
```

Rules:

- every `*.json` file is loaded; filename order is irrelevant;
- records are resolved by `kind + id`, highest `revision` wins;
- same `kind + id + revision` with different content fails the build;
- `status: "retired"` removes the logical record from the active compiled catalog;
- do not edit generated `public/data/catalog.json` by hand;
- the first deploy using `clean-catalog-epoch-1` intentionally resets the old IndexedDB database;
- later catalog changes replace catalog data and clear plan/history/shopping data that reference the previous compiled catalog, while preserving application configuration.

Commands:

```bash
npm run catalog:compile
npm run catalog:test
npm run catalog:check
npm run build
```

## Complete taxonomy alignment (batch 008)

`008-complete-taxonomy-alignment.json` is the catalog-wide semantic normalization layer. It revises every active ingredient and recipe so supported taxonomy dimensions are explicit rather than supplied by runtime fallbacks. It also fixes known ProductFood/category mismatches and selected recipe timing/step contradictions.

Future batches must preserve these invariants: explicit ingredient culinary role and flavor; exact ProductFood/category parent agreement; exactly one recipe flavor; explicit practical/diet/preparation arrays; positive `eatingMinutes`; and cooking/no-cook tags that agree with recipe timing and ingredient state. Run `npm run catalog:check` before deployment.

## Complete culinary time audit (batch 010)

`010-complete-recipe-time-audit.json` revises all 1,030 recipes that existed before the international/fusion expansion. `prepMinutes` and `cookMinutes` are recomputed from the actual preparation technique, ingredient physical state, dry grain/legume hydration, raw animal cooking, recipe steps, and multi-stage dish patterns. The audit is intentionally non-monotonic: implausibly short times are increased, while selected inflated/simple timings may decrease. Multi-stage dishes such as gnocchi, ragù, parmigiana, timballi, stuffed baked vegetables and slow roasts have explicit semantic floors.

The generator is `scripts/catalog/generate-time-and-global-expansion.py`; rerunning it must be followed by `npm run catalog:check`.

## Global cuisine and technique expansion (batch 011)

`011-global-cuisine-technique-expansion.json` adds 13 ingredients and 230 recipes:

- 30 beef, 30 rabbit and 30 lamb recipes;
- 10 Japanese, 3 Indian, 2 Greek, 10 Spanish, 10 Chinese and 5 Mexican main dishes;
- exactly 100 contemporary Fusion recipes;
- at least five recipes for each previously empty vegan/vegetarian/pescatarian combination of blending, braising, frying, roasting and steaming.

Fusion recipes are authored as concrete cookable dishes (for example rice-paper crisps, miso/avocado/feta pasta and modern rice bowls), not as arbitrary ingredient Cartesian products. New cuisine, ProductFood and archetype taxonomy terms are authored in the same batch.
