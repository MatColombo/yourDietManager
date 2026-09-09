# V1 Planner Phase E — Manual Product Acceptance

Phase E is performed by a human operator. Automated tests protect invariants; they do not decide whether the generated plans are useful, varied or acceptable.

## Release rule

All 18 required cases must be marked **PASS**. Any **P0** or **P1** finding blocks V1 promotion. **P2** findings are recorded and require an explicit release decision but do not automatically block promotion.

The in-app route `/manual-acceptance` is the canonical journal. It stores only the acceptance journal in localStorage and does not modify planner configuration, plans, catalog or domain IndexedDB data.

## Protocol

### Energy
1. 800 kcal, ±2%.
2. 1400 kcal, ±2%.
3. 2000 kcal, ±2%, seven days.
4. 2600 kcal, ±2%.

For every generated day inspect the hard energy window and recipe serving values. No serving scaling is permitted.

### Hard constraints
5. Allergen exclusion through generation, Replace and Rebalance.
6. Intolerance exclusion independently of allergens.
7. DayClass capability (`cooking=false`).
8. `forbid` rule, including product-food or numeric form.

### Soft constraints
9. Prefer/Avoid changes ranking without removing hard-valid candidates.
10. Protein/Fibre priorities affect scoring without becoming hard filters.

### Regeneration
11. `Proponi alternativa` changes selected recipes when strict alternatives are feasible.
12. In an intentionally constrained case, unchanged slots expose an explicit bounded-search fallback reason.

### Taxonomy and discovery
13. `Noodles` is selected once at concept level rather than as multiple technical ingredients.
14. `Latticini` filters ingredients and recipes by product taxonomy.

### Navigation
15. Day → exact RecipeVersion → exact IngredientRevision → return to the exact meal slot.

### Product operations
16. Replace + Rebalance preserves hard constraints.
17. Shopping aggregation/checklist/staleness remains coherent.
18. Reload preserves configuration, effective plan and checklist state.

## Severity
- **P0**: safety/data-loss/corruption or a hard constraint can be violated while the product reports success.
- **P1**: primary user flow unusable, materially wrong plan, regeneration/replace/rebalance broken, or persistence failure.
- **P2**: usability/quality issue with a practical workaround and no safety or hard-constraint impact.

Export the journal JSON before the final release decision and attach screenshots or reproduction notes for every failure.
