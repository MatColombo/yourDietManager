import { loadReferenceDataIndex } from './referenceDataService.js';
import { currentFoodGroups } from './revisionV2Service.js';
import { ingredientPresentation, ingredientSearchFields, localizedFoodText, foodSearchRank } from '../domain/ingredientPresentation.js';

const cache = new WeakMap();
export function invalidateIngredientProjection(repo) { cache.delete(repo); }
export function buildIngredientProjection(items, index, groups = []) {
  const concepts = new Map();
  for (const item of items) {
    const concept = index.term(item.revision?.productTaxonomy?.conceptId);
    if (!concept || concept.status !== 'active') continue;
    if (!concepts.has(concept.termId)) concepts.set(concept.termId, { concept, forms: [], fields: [], aliases: [...(concept.aliases?.it || []), ...(concept.aliases?.en || [])] });
    const row = concepts.get(concept.termId);
    row.forms.push(item); row.fields.push(...ingredientSearchFields(item.revision, index));
  }
  return { index, items, concepts: [...concepts.values()], groups };
}
export async function ingredientProjection(repo) {
  const token = repo.getChangeToken?.(); const previous = cache.get(repo);
  if (token !== undefined && previous?.token === token) return previous.value;
  const [families, index, groups] = await Promise.all([repo.getAll('ingredients'), loadReferenceDataIndex(repo), currentFoodGroups({ repo })]);
  const active = families.filter(family => family.status === 'active');
  const revisions = new Map((await repo.getMany('ingredientRevisions', active.map(family => family.currentRevisionId))).map(row => [row.ingredientRevisionId, row]));
  const items = active.map(family => ({ family, revision: revisions.get(family.currentRevisionId) })).filter(item => item.revision);
  const value = buildIngredientProjection(items, index, groups);
  if (token !== undefined && token === repo.getChangeToken?.()) cache.set(repo, { token, value });
  return value;
}
export function searchIngredientConcepts(projection, { text = '', locale = 'it', origin = '', state = '', productFoodId = '' } = {}) {
  return projection.concepts.map(row => {
    const forms = row.forms.filter(item => (!origin || item.family.origin === origin) && (!state || item.revision.basis.state === state)
      && (!productFoodId || Object.values(item.revision.productTaxonomy).includes(productFoodId)));
    const names = ['it', 'en'].map(lang => localizedFoodText(row.concept.i18n, lang));
    const rank = foodSearchRank(text, { names, aliases: row.aliases, fields: forms.flatMap(item => ingredientSearchFields(item.revision, projection.index)) });
    return { ...row, forms, rank, label: localizedFoodText(row.concept.i18n, locale) };
  }).filter(row => row.forms.length && Number.isFinite(row.rank)).sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, locale) || a.concept.termId.localeCompare(b.concept.termId));
}
export function ingredientPickerChoices(projection, { locale = 'it', mode = 'concept', levels = ['category', 'subcategory', 'concept'], includeGroups = false, includeAllergens = false, allergenLabels = {}, levelLabels = {}, coverageLabel = null } = {}) {
  const rows = [];
  const terms = projection.index.byTaxonomy.get('product_food') || [];
  for (const term of terms.filter(term => term.status === 'active')) {
    const parent = projection.index.term(term.parentTermId); const level = !term.parentTermId ? 'category' : !parent?.parentTermId ? 'subcategory' : 'concept';
    if (!levels.includes(level) || (mode === 'variant' && level !== 'concept')) continue;
    const forms = projection.items.filter(item => Object.values(item.revision.productTaxonomy || {}).includes(term.termId));
    if (mode === 'variant' && !forms.length) continue;
    const label = localizedFoodText(term.i18n, locale);
    const aliases = [...(term.aliases?.it || []), ...(term.aliases?.en || [])];
    const fields = forms.flatMap(item => ingredientSearchFields(item.revision, projection.index));
    const levelLabel = levelLabels[level] || level;
    const coverage = typeof coverageLabel === 'function' ? coverageLabel(forms.length) : `${forms.length}`;
    rows.push({ id: term.termId, label, secondary: `${levelLabel} · ${coverage}`,
      searchNames: ['it', 'en'].map(lang => localizedFoodText(term.i18n, lang)), searchAliases: aliases, searchText: [...fields, ...aliases].join(' '), data: { target: { type: 'productFood', id: term.termId }, level, forms } });
  }
  if (includeGroups) for (const group of projection.groups.filter(group => group.status === 'active')) rows.push({ id: `foodGroup:${group.id}`, label: group.name,
    secondary: `${locale === 'it' ? 'Famiglia' : 'Group'} · ${group.members.length}`, searchText: group.members.flatMap(member => member.type === 'ingredient'
      ? ingredientSearchFields(projection.items.find(item => item.family.ingredientId === member.id)?.revision, projection.index)
      : [localizedFoodText(projection.index.term(member.id)?.i18n, 'it'), localizedFoodText(projection.index.term(member.id)?.i18n, 'en')]).join(' '), data: { target: { type: 'foodGroup', id: group.id }, group } });
  if (includeAllergens) for (const [id, label] of Object.entries(allergenLabels)) rows.push({ id: `allergen:${id}`, label, secondary: locale === 'it' ? 'Allergene' : 'Allergen', data: { target: { type: 'allergen', id } } });
  return rows.sort((a, b) => a.label.localeCompare(b.label, locale) || a.id.localeCompare(b.id));
}
export function variantPickerChoices(forms, index, locale = 'it') {
  return forms.map(item => { const text = ingredientPresentation(item.revision, index, locale); return { id: item.family.ingredientId,
    label: `${text.variant} · ${text.name}`, secondary: `${item.revision.nutrition.energyKcal} kcal / ${item.revision.basis.amount} ${item.revision.basis.unit}`,
    searchText: ingredientSearchFields(item.revision, index).join(' '), data: item }; }).sort((a, b) => a.label.localeCompare(b.label, locale) || a.id.localeCompare(b.id));
}
