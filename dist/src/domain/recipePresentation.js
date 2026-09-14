import { ingredientPresentation, normalizeFoodSearch } from './ingredientPresentation.js';

export const RECIPE_PRESENTATION_VERSION = 'recipe-presentation-r2-1';
export function assertRecipeTitle(title) {
  const value = String(title || '').trim();
  if (value.length < 5 || value.length > 70) throw new Error('Il titolo deve contenere da 5 a 70 caratteri / Title must have 5–70 characters');
  if (/[()]/.test(value) || /\b(unenriched|whole frozen|as sold|come venduto|kcal|recipeVersionId|ing_fdc_)\b/i.test(value)) throw new Error('Usa un titolo breve senza descrittori della fonte / Use a short title without source descriptors');
  return value;
}
export function recipeTitleFromIngredients(revisions, index, locale = 'it') {
  const names = [];
  for (const revision of revisions) {
    let name = ingredientPresentation(revision, index, locale).name;
    const sourceName = normalizeFoodSearch(revision.i18n?.en?.name);
    // Exact source descriptors only; a generic American cheese is not a PDO.
    if (sourceName.includes('parmesan')) name = locale === 'it' ? 'Formaggio duro' : 'Hard cheese';
    if (sourceName.includes('mozzarella') && sourceName.includes('nonfat')) name = locale === 'it' ? 'Mozzarella senza grassi' : 'Nonfat mozzarella';
    if (!name || /[()]/.test(name)) continue;
    if (!names.includes(name)) names.push(name);
    if (names.length === 3) break;
  }
  while (names.length) {
    const title = names.length === 1 ? `${locale === 'it' ? 'Piatto con' : 'Dish with'} ${names[0]}`
      : `${names[0]} ${locale === 'it' ? 'con' : 'with'} ${names.slice(1).join(locale === 'it' ? ' e ' : ' and ')}`;
    if (title.length <= 70) return assertRecipeTitle(title);
    names.pop();
  }
  return locale === 'it' ? 'Piatto da rinominare' : 'Dish awaiting a name';
}
export function recipeTextV2(i18n, { titleIt, titleEn } = {}) {
  const it = { title: titleIt || i18n.it?.title || i18n.en?.title || '', description: i18n.it?.description || '' };
  const en = { title: titleEn || i18n.en?.title || it.title, description: i18n.en?.description || it.description };
  assertRecipeTitle(it.title); assertRecipeTitle(en.title);
  return { it, en };
}
export function ingredientWeightG(lines) {
  return lines.every(line => line.normalizedUnit === 'g') ? Math.round(lines.reduce((sum, line) => sum + line.normalizedAmount, 0) * 100) / 100 : null;
}
