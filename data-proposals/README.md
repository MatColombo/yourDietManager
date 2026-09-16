# Data proposals

Development-only semantic proposals generated/reviewed in chat live under `active/`.

The repository workflow is deliberately deterministic: it does not call an LLM and it does not fuzzy-match records. It validates each proposal against the exact current catalog baseline, reconciles IDs/content hashes/reference-data collisions, and materializes a staging artifact for review.

Current development proposal types:

- `ingredient_semantic_consolidation`: exact IngredientRevision + ProductFood taxonomy reconciliation; staging may materialize taxonomy and ingredient overlays.
- `recipe_semantic_consolidation`: exhaustive RecipeVersion semantic review; staging separates `KEEP_RENAME`, `REWORK`, `RETIRE`, and `CONSOLIDATE_DUPLICATE` decisions without mutating the canonical recipe corpus.
- `culinary_generation_policy`: T4-B deterministic role-pool and culinary-archetype contract used to validate chat-generated recipes; no autonomous generation or fuzzy matching.
- `recipe_rework_plan`: T4-A exhaustive plan for the 563 `REWORK` recipes, including strict repair feasibility, archetype conversions, rebuilds, and the replacement gap matrix.
- `recipe_generation_batch`: T4-C/D static chat-authored recipe proposals. The workflow validates exact T4-B role/archetype membership, derives nutrition/allergens, enforces the T4-A gap matrix, and materializes staging-only compiled proposals; it never adjusts authored quantities.

Recipe semantic proposals may depend on the exact digest of an active ingredient semantic proposal. A changed ingredient proposal therefore makes the recipe review stale and the workflow fails closed.

After a proposal is promoted into the canonical catalog, move its directory from `active/` to `applied/` together with the reconciliation report used for promotion.

- `corpus_simulation`: T4-E composes the semantic ingredient overlay, repaired/reclassified existing recipes and T4-C replacements into a complete staging corpus. It restores/validates Phase B quotas, performs whole-corpus duplicate analysis, and writes promotion blockers without changing canonical data. The workflow additionally runs planner feasibility at the tightest 2% energy tolerance; success implies the wider 5% and 10% tolerance cases.
