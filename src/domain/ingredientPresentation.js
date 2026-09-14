import { effectiveProductTaxonomy } from './foodPresentationCorrections.js';
export function normalizeFoodSearch(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function localizedFoodText(i18n, locale = 'it', key = 'label') {
  return i18n?.[locale]?.[key] || i18n?.it?.[key] || i18n?.en?.[key] || '';
}
export function ingredientPresentation(revision, index, locale = 'it') {
  if (!revision) return { name: '—', variant: '—', weighing: '', path: [] };
  const path = ['categoryId', 'subcategoryId', 'conceptId'].map(key => index?.term?.(effectiveProductTaxonomy(revision)?.[key])).filter(Boolean);
  const name = localizedFoodText(path.at(-1)?.i18n, locale) || localizedFoodText(revision.i18n, locale, 'name');
  const states = locale === 'en'
    ? { raw: 'Raw', cooked: 'Cooked', dry: 'Dry', drained: 'Drained', prepared: 'Prepared', ready_to_eat: 'Ready to eat', as_sold: 'As sold', unknown: 'State to check' }
    : { raw: 'Crudo', cooked: 'Cotto', dry: 'Secco', drained: 'Sgocciolato', prepared: 'Preparato', ready_to_eat: 'Pronto al consumo', as_sold: 'Come venduto', unknown: 'Stato da verificare' };
  const weighing = locale === 'en' ? { dry: 'dry weight', raw: 'raw weight', drained: 'drained weight' } : { dry: 'peso a secco', raw: 'peso a crudo', drained: 'peso sgocciolato' };
  return { name, variant: revision.display?.[locale]?.variantLabel || revision.display?.it?.variantLabel || states[revision.basis?.state] || states.unknown,
    weighing: weighing[revision.basis?.state] || '', path };
}
export function ingredientSearchFields(revision, index) {
  const path = ['categoryId', 'subcategoryId', 'conceptId'].map(key => index?.term?.(effectiveProductTaxonomy(revision)?.[key])).filter(Boolean);
  return [
    ...path.flatMap(term => [localizedFoodText(term.i18n, 'it'), localizedFoodText(term.i18n, 'en'), ...(term.aliases?.it || []), ...(term.aliases?.en || [])]),
    ...Object.values(revision?.i18n || {}).flatMap(text => [text.name, ...(text.aliases || [])]),
    ...Object.values(revision?.display || {}).map(text => text.variantLabel),
    revision?.source?.label, revision?.source?.originalDescription, revision?.source?.reference, revision?.basis?.state
  ].filter(Boolean);
}
export function foodSearchRank(query, { names = [], aliases = [], fields = [] }) {
  const needle = normalizeFoodSearch(query); if (!needle) return 4;
  const n = names.map(normalizeFoodSearch), a = aliases.map(normalizeFoodSearch);
  if (n.includes(needle)) return 0;
  if (a.includes(needle)) return 1;
  if ([...n, ...a].some(value => value.startsWith(needle))) return 2;
  const haystack = normalizeFoodSearch([...names, ...aliases, ...fields].join(' '));
  return needle.split(' ').every(token => haystack.includes(token)) ? 3 : Infinity;
}
