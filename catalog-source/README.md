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
