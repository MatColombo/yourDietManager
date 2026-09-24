import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { MemoryRepository, fileLoader } from './helpers.mjs';
import { ingredientAffinity, isoCaloricReplacement, nutritionAffinity, suggestIngredientSubstitutions, applyIngredientSubstitution } from '../src/services/nutritionalAffinityService.js';

const root = process.cwd();
function revision(id, ingredientId, energy, macros = {}, extra = {}) {
  return {
    ingredientRevisionId: id, ingredientId,
    basis: { amount: 100, unit: 'g', state: extra.state || 'raw' },
    nutrition: { energyKcal: energy, proteinG: macros.proteinG || 0, carbsG: macros.carbsG || 0, fatG: macros.fatG || 0, fiberG: macros.fiberG || 0 },
    taxonomy: { foodGroup: extra.foodGroup || 'food_group_nuts_seeds', foodSubgroup: null, flavorProfile: extra.flavor || 'flavor_savory', culinaryRoles: extra.roles || ['tax_role_fat_garnish'], mealArchetypes: ['snack'] },
    allergenIds: extra.allergenIds || []
  };
}

test('Feature 5 — iso-caloric ingredient replacement preserves energy and ranks nutritionally similar candidates', () => {
  const source = revision('src_r', 'src', 600, { proteinG: 20, carbsG: 20, fatG: 50, fiberG: 8 });
  const close = revision('close_r', 'close', 580, { proteinG: 19, carbsG: 22, fatG: 48, fiberG: 9 });
  const far = revision('far_r', 'far', 350, { proteinG: 2, carbsG: 80, fatG: 1, fiberG: 1 }, { foodGroup: 'food_group_grains_starches', roles: ['tax_role_starch'] });
  const line = { ingredientId: 'src', ingredientRevisionId: 'src_r', amount: 20, unit: 'g', normalizedAmount: 20, normalizedUnit: 'g', optional: false, notesKey: null };
  const iso = isoCaloricReplacement(line, source, close);
  assert.ok(Math.abs(iso.replacementNutrition.energyKcal - iso.sourceNutrition.energyKcal) < 1);
  const closeAffinity = ingredientAffinity(line, source, close);
  const farAffinity = ingredientAffinity(line, source, far);
  assert.ok(closeAffinity.score > farAffinity.score);
  assert.ok(closeAffinity.score >= 80);
  assert.equal(nutritionAffinity(iso.sourceNutrition, iso.replacementNutrition).score >= 90, true);
});

async function catalogFixture() {
  const catalog = JSON.parse(await readFile(path.join(root, 'public/data/catalog.json'), 'utf8'));
  const repo = new MemoryRepository();
  for (const store of ['taxonomies','taxonomyTerms','ingredients','ingredientRevisions','recipes','recipeVersions','catalogPacks','foodGroups','ingredientMappings','ingredientConversions']) await repo.putMany(store, catalog[store] || []);
  await repo.setMeta('activeCatalogVersion', catalog.manifest.catalogVersion);
  const registry = new SchemaRegistry(fileLoader(path.join(root, 'schemas'))); await registry.loadAll();
  return { repo, registry, catalog };
}

test('Feature 5 — recipe substitution preview proposes amount, delta and saves a new immutable recipe version', async () => {
  const { repo, registry, catalog } = await catalogFixture();
  const recipe = catalog.recipeVersions.find(item => item.recipeId === 'recipe_albicocche_pistacchi');
  assert.ok(recipe);
  const preview = await suggestIngredientSubstitutions({ recipeVersionId: recipe.recipeVersionId, lineIndex: 1, limit: 8 }, { repo });
  assert.ok(preview.candidates.length >= 3);
  const candidate = preview.candidates[0];
  assert.ok(candidate.score > 0);
  assert.ok(candidate.proposedLine.amount > 0);
  assert.ok(Math.abs(candidate.recipeDelta.energyKcal) <= 2);
  const saved = await applyIngredientSubstitution({ recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, lineIndex: 1, candidateIngredientRevisionId: candidate.ingredient.ingredientRevisionId }, { repo, registry });
  assert.equal(saved.version.versionNumber, recipe.versionNumber + 1);
  assert.equal(saved.version.supersedesVersionId, recipe.recipeVersionId);
  assert.equal(saved.version.ingredientLines[1].ingredientRevisionId, candidate.ingredient.ingredientRevisionId);
  assert.equal((await repo.get('recipeVersions', recipe.recipeVersionId)).ingredientLines[1].ingredientRevisionId, recipe.ingredientLines[1].ingredientRevisionId);
  assert.ok(Math.abs(saved.version.calculatedNutrition.energyKcal - recipe.calculatedNutrition.energyKcal) <= 2);
});
