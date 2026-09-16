# T4-B — Culinary generation policy v2

T4-B replaces the broad Phase-B ingredient roles with an explicit **proposal-validation policy** for recipes generated in chat. It is not an autonomous recipe generator.

## Current snapshot

- semantic roles: **32**
- culinary archetypes: **20**
- empty role pools: **0**
- explicit role assignments in the current 600-ingredient catalog: **343**

Critical pool tightening:

| Pool | Before | T4-B |
| --- | ---: | ---: |
| ready-to-eat whole fruit | 50 | **40** |
| main raw vegetable | 39 | **25** |
| main cooked vegetable | 48 | **39** |
| dry cooking grain | 24 | **21** |
| heated cooking oil | 3 | **2** |
| neutral/savory nuts and seeds | 20 | **18** |

Yogurt, plain milk and cultured buttermilk are now separate roles. Flaxseed oil is finishing-only; jalapeño/serrano/banana pepper are flavoring roles; tomato paste is a concentrate role; lemon/lime are culinary-acid roles; puffed millet and self-rising cornmeal cannot satisfy a dry-grain cooking slot.

## Archetype model

The 20 archetypes include explicit structures for yogurt bowls, cereal+dairy bowls, long-cook quinoa porridge, fruit+dairy smoothies, egg/grain/vegetable dishes, fruit and savory snacks, legume-grain salads, cold seafood plates, protein grain plates, one-pot dishes, legume bowls, tomato pasta and vegetable frittata.

Every chat-generated recipe must declare an archetype and an explicit role for every ingredient. The workflow verifies IDs, role membership, portion bounds, cooking semantics, fixed serving count, energy, duplicates, nutrition and allergens. It may **not** fuzzy-match ingredients or fit ingredient quantities to an energy target.
