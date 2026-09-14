import { ALLERGEN_IDS } from './configurationRules.js';
import { assertIngredientPath } from './ingredientIdentity.js';

export function assertSafetyEvidence(evidence, registry) {
  registry.assert('safetyEvidence', evidence);
  if (evidence.assessmentStatus === 'unreviewed' && (evidence.reviewedAt !== null || evidence.reviewedBy !== null)) throw new Error('Unreviewed evidence cannot claim a reviewer');
  if (evidence.containsAllergenIds.some(id => evidence.mayContainAllergenIds.includes(id))) throw new Error('Contains and may-contain must be distinct');
  return evidence;
}

export function assertIngredientRevisionV2(revision, { registry, index }) {
  registry.assert('ingredient-revision-v2.schema.json', revision);
  assertIngredientPath(revision, index);
  assertSafetyEvidence(revision.safetyEvidence, registry);
  const derived = [...revision.safetyEvidence.containsAllergenIds].sort();
  if (JSON.stringify(derived) !== JSON.stringify([...revision.allergenIds].sort())) throw new Error('allergenIds must reflect composition evidence');
  return revision;
}

function assertTarget(target, { index, ingredients = [], foodGroups = [] }) {
  if (target.type === 'ingredient') {
    if (!ingredients.some(item => item.ingredientId === target.id && item.status === 'active')) throw new Error(`Unknown or inactive ingredient ${target.id}`);
  } else if (target.type === 'foodGroup') {
    if (!foodGroups.some(item => item.id === target.id && item.status === 'active')) throw new Error(`Unknown or inactive FoodGroup ${target.id}`);
  } else if (target.type === 'allergen') {
    if (!ALLERGEN_IDS.includes(target.id)) throw new Error('Unknown allergen');
  } else {
    const taxonomy = { productFood: 'product_food', cuisine: 'cuisine', flavor: 'flavor_profile' }[target.type];
    if (taxonomy) index.assertTerm(target.id, taxonomy);
    else if (target.type === 'recipeTag') {
      const term = index.term(target.id);
      if (!term || term.status !== 'active' || !['recipe_family', 'diet_tag', 'practical_tag', 'preparation_technique'].includes(term.taxonomyId)) throw new Error('Unknown recipe tag');
    }
  }
}
export function assertFoodPreferencesV2(profile, context) {
  context.registry.assert('food-preferences-v2.schema.json', profile);
  const ids = new Set((profile.legacyRules || []).map(rule => rule.id)); const signatures = new Set();
  for (const rule of profile.rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate preference ${rule.id}`); ids.add(rule.id);
    assertTarget(rule.target, context);
    for (const id of rule.scope.mealClassIds) if (!context.mealClasses?.some(item => item.id === id)) throw new Error(`Unknown meal class ${id}`);
    const signature = JSON.stringify([rule.target, [...rule.scope.mealClassIds].sort(), rule.countUnit, rule.window.days]);
    if (signatures.has(signature)) throw new Error(`Duplicate target/scope/window: ${rule.id}`); signatures.add(signature);
    if (rule.mode !== 'frequency') continue;
    const values = [rule.minOccurrences, rule.targetOccurrences, rule.maxOccurrences].filter(value => value !== null);
    if (!values.length) throw new Error('Frequency requires at least one bound or ideal');
    if (values.some((value, i) => i && values[i - 1] > value)) throw new Error('Frequency requires min <= ideal <= max');
    if (rule.targetOccurrences !== null && !Number.isInteger(rule.targetOccurrences * 2)) throw new Error('Ideal frequency uses steps of 0.5');
  }
  return profile;
}
export function assertSafetyProfileV2(profile, context) {
  context.registry.assert('allergy-intolerance-profile-v2.schema.json', profile);
  const ids = new Set((profile.legacyRules || []).map(rule => rule.id));
  for (const rule of profile.rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate safety rule ${rule.id}`); ids.add(rule.id);
    assertTarget(rule.target, context);
  }
  return profile;
}
