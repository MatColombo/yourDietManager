// Explicit identity corrections bound to three records in the attached corpus.
// They do not infer nutritional equivalence or food-safety review.
export const FOOD_PRESENTATION_CORRECTIONS = Object.freeze({
  ing_fdc_2685568: { conceptId: 'product_concept_zucchini_r2', categoryId: 'product_category_vegetables', subcategoryId: 'product_subcategory_vegetables_other', it: 'Zucchina', en: 'Zucchini', aliasesIt: ['zucchine', 'zucchino'], aliasesEn: ['courgette', 'courgettes'], descriptor: 'Squash, summer, green, zucchini, includes skin, raw' },
  ing_fdc_167705: { conceptId: 'product_concept_hard_cheese_r2', categoryId: 'product_category_dairy', subcategoryId: 'product_subcategory_cheese', it: 'Formaggio duro tipo parmesan', en: 'Parmesan-style hard cheese', aliasesIt: ['formaggio duro'], aliasesEn: ['parmesan'], descriptor: 'Cheese, parmesan, low sodium' },
  ing_fdc_169051: { conceptId: 'product_concept_nonfat_mozzarella_r2', categoryId: 'product_category_dairy', subcategoryId: 'product_subcategory_cheese', it: 'Mozzarella senza grassi', en: 'Nonfat mozzarella', aliasesIt: [], aliasesEn: ['fat-free mozzarella'], descriptor: 'Cheese, mozzarella, nonfat' }
});
export function effectiveProductTaxonomy(revision) {
  const entry = FOOD_PRESENTATION_CORRECTIONS[revision?.ingredientId];
  if (!entry || revision?.origin === 'user') return revision?.productTaxonomy;
  return { categoryId: entry.categoryId, subcategoryId: entry.subcategoryId, conceptId: entry.conceptId };
}
