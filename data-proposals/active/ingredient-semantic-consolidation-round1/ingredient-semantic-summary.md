# Ingredient Semantic Review — Round 1

Baseline: current R8 development catalog. This pack changes no repository data; it is a review/proposal fixture for the minimal deterministic reconciler.

## Result

- Reviewed: **600/600** IngredientRevision records.
- P0 corrections: **54**.
- P1 refinements: **220**.
- Keep/no identity change: **326**.
- New proposed ProductFood concept terms: **188**.
- Generic fallback assignments resolved: **143**.
- Unresolved records: **0**.
- Existing recipes touched by at least one identity change: **1745/1800**.
- Existing recipes touched by a P0 correction: **295/1800**.

## Review policy

- **P0**: current identity is wrong (keyword collision, prepared food mapped to a component, wrong food family).
- **P1**: current identity is broadly correct but too generic for user-facing semantics.
- **P2/deferred**: cut/variety/state detail that should become a presentation variant rather than a new taxonomy concept. This round does not explode taxonomy for every pork/chicken cut.
- Nutrition, allergen evidence, source provenance and quantities are intentionally untouched.
- Git reconciliation must be exact-ID + exact-contentHash. No fuzzy matching in CI.

## High-impact proposed changes

- **P1 · 401 recipe uses** — `ing_fdc_171413_r1`: Oil, olive, salad or cooking → **Olio di oliva** (`product_concept_olive_oil`).
- **P1 · 387 recipe uses** — `ing_fdc_167702_r1`: Oil, flaxseed, cold pressed → **Olio di semi di lino** (`product_concept_flaxseed_oil`).
- **P1 · 384 recipe uses** — `ing_fdc_167737_r1`: Oil, corn, peanut, and olive → **Olio alimentare misto** (`product_concept_mixed_cooking_oil`).
- **P0 · 87 recipe uses** — `ing_fdc_330415_r1`: Yogurt, Greek, strawberry, nonfat → **Yogurt greco alla fragola** (`product_concept_strawberry_greek_yogurt`).
- **P1 · 71 recipe uses** — `ing_fdc_170928_r1`: Spices, marjoram, dried → **Maggiorana** (`product_concept_marjoram`).
- **P1 · 67 recipe uses** — `ing_fdc_170927_r1`: Spices, mace, ground → **Macis** (`product_concept_mace`).
- **P1 · 61 recipe uses** — `ing_fdc_170924_r1`: Spices, curry powder → **Curry in polvere** (`product_concept_curry_powder`).
- **P1 · 60 recipe uses** — `ing_fdc_170486_r1`: Parsley, freeze-dried → **Prezzemolo** (`product_concept_parsley`).
- **P1 · 59 recipe uses** — `ing_fdc_170917_r1`: Spices, bay leaf → **Alloro** (`product_concept_bay_leaf`).
- **P1 · 57 recipe uses** — `ing_fdc_169997_r1`: Coriander (cilantro) leaves, raw → **Coriandolo fresco** (`product_concept_cilantro`).
- **P1 · 56 recipe uses** — `ing_fdc_170921_r1`: Spices, coriander leaf, dried → **Coriandolo essiccato** (`product_concept_dried_coriander_leaf`).
- **P1 · 50 recipe uses** — `ing_fdc_168874_r1`: Quinoa, uncooked → **Quinoa** (`product_concept_quinoa`).
- **P1 · 50 recipe uses** — `ing_fdc_170416_r1`: Parsley, fresh → **Prezzemolo** (`product_concept_parsley`).
- **P1 · 49 recipe uses** — `ing_fdc_170919_r1`: Spices, cardamom → **Cardamomo** (`product_concept_cardamom`).
- **P0 · 49 recipe uses** — `ing_fdc_326698_r1`: Mustard, prepared, yellow → **Senape** (`product_concept_mustard`).
- **P1 · 47 recipe uses** — `ing_fdc_169700_r1`: Couscous, cooked → **Cous cous** (`product_concept_couscous`).
- **P1 · 39 recipe uses** — `ing_fdc_172422_r1`: Lima beans, thin seeded (baby), mature seeds, cooked, boiled, without salt → **Fagiolo di Lima** (`product_concept_lima_bean`).
- **P1 · 37 recipe uses** — `ing_fdc_747447_r1`: Broccoli, raw → **Broccoli** (`product_concept_broccoli`).
- **P1 · 36 recipe uses** — `ing_fdc_323505_r1`: Kale, raw → **Cavolo riccio** (`product_concept_kale`).
- **P1 · 35 recipe uses** — `ing_fdc_2258589_r1`: Peppers, bell, yellow, raw → **Peperone** (`product_concept_bell_pepper`).

## Important semantic corrections

- Orange bell pepper is no longer treated as citrus.
- Banana/Hungarian wax pepper is no longer treated as banana fruit.
- Strawberry Greek yogurt is no longer treated as a berry.
- Green sweet peas, split peas and black-eyed peas are separated into distinct food identities.
- Green snap beans become green beans/fagiolini rather than generic dried-bean semantics.
- Prepared products such as tofu mayonnaise, crab cake, onion rings, sweet-potato fries and gefilte fish keep the prepared-product identity instead of inheriting a component token.
- `Altra verdura`, `Altra frutta`, `Altri cereali`, `Altro seme`, etc. cease to be used as identities where the source already names a specific product.

## Deferred P2 presentation work

The largest intentionally deferred group is cut/variant presentation, especially **108 pork** and **22 chicken** records. Their core identity is not necessarily wrong, but the UX should later expose a cleaned cut/variant label instead of turning every source descriptor into a new ProductFood concept.

## Existing Mediterranean staging vocabulary

**45** proposed concepts have an exact normalized Italian-label counterpart in the existing R5 Mediterranean staging manifest. The overlap is recorded as a hint only; staging entries are not treated as authoritative or auto-applied.

## Files

- `ingredient-semantic-review.json`: all 600 reviewed records.
- `ingredient-semantic-proposal.json`: only records that should change; intended as the first real reconciler fixture.
- `proposed-product-terms.json`: taxonomy terms required by the proposal.
- `review-checks.json`: structural self-checks for this review pack.

## Next tranche

Implement the minimal deterministic reconciler around this exact proposal: baseline/hash check → term collision check → apply semantic ProductFood changes → rebuild catalog → run existing schema/corpus/planner gates.
