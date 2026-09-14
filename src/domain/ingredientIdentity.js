import { validateProductFoodAssignment } from './productFoodTaxonomy.js';

export function assertIngredientPath(revision, index) {
  const path = validateProductFoodAssignment(index, revision);
  if (index.children.get(path.concept.termId)?.length) throw new Error('Ingredient concept must be a leaf');
  return path;
}
export function isCuratedConcept(conceptId) {
  return Boolean(conceptId) && !/(?:^|_)other$/.test(conceptId);
}

export function assertFoodGroup(group, { index, ingredients, registry }) {
  registry.assert('foodGroup', group);
  const ids = new Set();
  for (const member of group.members) {
    const key = `${member.type}:${member.id}`;
    if (ids.has(key)) throw new Error(`Duplicate FoodGroup member ${key}`);
    ids.add(key);
    if (member.type === 'productFood') index.assertTerm(member.id, 'product_food');
    else if (!ingredients.some(item => item.ingredientId === member.id && item.status === 'active')) throw new Error(`Unknown or inactive ingredient ${member.id}`);
  }
  return group;
}

export function assertIngredientMapping(mapping, { index, ingredients, revisions, mappings = [], registry }) {
  registry.assert('ingredientMapping', mapping);
  const source = revisions.find(item => item.ingredientRevisionId === mapping.sourceRevisionId);
  if (!source || source.ingredientId !== mapping.sourceIngredientId) throw new Error('Mapping source revision does not resolve');
  if (!ingredients.some(item => item.ingredientId === mapping.targetIngredientId)) throw new Error('Mapping target form does not resolve');
  assertIngredientPath({ ...source, productTaxonomy: mapping.productTaxonomy }, index);
  if (mapping.status === 'approved' && (!mapping.approvedBy?.trim() || !mapping.approvedAt || !mapping.reason.trim() || !mapping.sourceRef.trim())) throw new Error('Approved mapping requires explicit decision and source');
  if (mapping.kind === 'identity' && mapping.sourceIngredientId !== mapping.targetIngredientId) throw new Error('Identity mapping cannot merge forms');
  if (mapping.targetRevisionId) {
    const target = revisions.find(item => item.ingredientRevisionId === mapping.targetRevisionId);
    if (!target || target.ingredientId !== mapping.targetIngredientId) throw new Error('Mapping target revision does not resolve');
    if (mapping.kind === 'redirect' && ['amount', 'unit', 'state'].some(key => source.basis[key] !== target.basis[key])) throw new Error('Redirect cannot equate different weighing states or units');
  } else if (mapping.status === 'approved') throw new Error('Approved mapping requires the selected nutrient revision');
  resolveIngredientRedirect(mapping.sourceIngredientId, [...mappings.filter(item => item.mappingId !== mapping.mappingId), mapping]);
  return mapping;
}

export function resolveIngredientRedirect(ingredientId, mappings = []) {
  const latest = new Map();
  for (const mapping of mappings) if (!latest.has(mapping.mappingId) || latest.get(mapping.mappingId).version < mapping.version) latest.set(mapping.mappingId, mapping);
  const redirects = new Map();
  for (const mapping of latest.values()) {
    if (mapping.status !== 'approved' || mapping.kind !== 'redirect') continue;
    if (redirects.has(mapping.sourceIngredientId) && redirects.get(mapping.sourceIngredientId) !== mapping.targetIngredientId) throw new Error('Ambiguous ingredient redirect');
    redirects.set(mapping.sourceIngredientId, mapping.targetIngredientId);
  }
  const visited = new Set(); let current = ingredientId;
  while (redirects.has(current)) {
    if (visited.has(current)) throw new Error('Cyclic ingredient redirect');
    visited.add(current); current = redirects.get(current);
  }
  return current;
}

export function listIngredientConcepts({ ingredients, revisions, index, query = '' }) {
  const normalize = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
  const needle = normalize(query); const byId = new Map(revisions.map(item => [item.ingredientRevisionId, item])); const grouped = new Map();
  for (const ingredient of ingredients.filter(item => item.status === 'active')) {
    const revision = byId.get(ingredient.currentRevisionId); if (!revision) continue;
    const { category, subcategory, concept } = assertIngredientPath(revision, index);
    const haystack = [category, subcategory, concept].flatMap(term => [term.i18n?.it?.label, term.i18n?.en?.label, ...(term.aliases?.it || []), ...(term.aliases?.en || [])]);
    const match = !needle || haystack.some(value => normalize(value).includes(needle));
    if (!match) continue;
    if (!grouped.has(concept.termId)) grouped.set(concept.termId, { ingredientConcept: concept, category, subcategory, forms: [], curatedCoverageEligible: isCuratedConcept(concept.termId) });
    grouped.get(concept.termId).forms.push({ ingredient, revision });
  }
  return [...grouped.values()].sort((a, b) => a.ingredientConcept.termId.localeCompare(b.ingredientConcept.termId));
}
