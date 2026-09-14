import { sha256Json } from '../../lib/crypto.js';
import { calculateRecipeNutrition } from '../../domain/nutritionCore.js';
import { publicationReadiness } from './sourceAdapters.js';
export async function mediterraneanCoverage(manifest, records, dishes) {
  const ids = new Set(), forms = new Set(), accepted = [], rejected = [];
  for (const record of records) {
    const result = await publicationReadiness(record);
    const concept = manifest.concepts.find(c => c.conceptId === record.mapping?.conceptId);
    if (!concept?.forms.some(f => f.formId === record.mapping?.formId)) { result.publishable = false; result.reasons.push('not_in_manifest'); }
    if (result.publishable) { accepted.push(record); ids.add(concept.conceptId); forms.add(record.mapping.formId); }
    else rejected.push({ source: record.source, sourceRecordId: record.sourceRecordId, reasons: result.reasons });
  }
  const groups = manifest.groupQuotas.map(group => ({ ...group, planned: manifest.concepts.filter(c => c.groupId === group.groupId).length, published: manifest.concepts.filter(c => c.groupId === group.groupId && ids.has(c.conceptId)).length }));
  const pilotConcepts = manifest.pilot.entries.filter(entry => ids.has(entry.conceptId)).length;
  const pilotForms = manifest.pilot.entries.flatMap(entry => entry.formIds).filter(id => forms.has(id)).length;
  const pilotAccepted = pilotConcepts >= 40 && pilotForms >= 60;
  // Recipe publication is a separate gate; culinary briefs without immutable validated versions never count.
  const curatedDishes = [];
  for (const dish of dishes) {
    if (dish.status !== 'published' || !dish.recipeVersion || !Array.isArray(dish.ingredientRevisions)) continue;
    const recipe = dish.recipeVersion, evidence = dish.publicationEvidence;
    if (!evidence || recipe.recipeVersionId !== dish.recipeVersionId || recipe.servingCount !== 1 || !recipe.ingredientLines?.length) continue;
    const contentDigest = await sha256Json({ recipe, ingredientRevisions: dish.ingredientRevisions });
    if (evidence.contentDigest !== contentDigest) continue;
    if (!['nutrition','safety','culinary'].every(key => evidence.reviews?.[key]?.digest === contentDigest && evidence.reviews[key].actorType === 'human' && evidence.reviews[key].status === 'approved' && evidence.reviews[key].reviewer && evidence.reviews[key].reviewedAt && evidence.reviews[key].evidence)) continue;
    try {
      const computed = calculateRecipeNutrition(recipe.ingredientLines, new Map(dish.ingredientRevisions.map(row => [row.ingredientRevisionId, row])));
      if (await sha256Json(computed) !== await sha256Json(recipe.calculatedNutrition)) continue;
    } catch { continue; }
    curatedDishes.push(dish);
  }
  const dishQuotas = { breakfast:15, snack:15, first_main:35, second:30, side:25 };
  const dishesByGroup = Object.fromEntries(Object.keys(dishQuotas).map(group => [group,new Set(curatedDishes.filter(d => d.editorialGroup === group).map(d => d.dishId)).size]));
  return { planned: { concepts: manifest.concepts.length, forms: manifest.concepts.reduce((n,c) => n+c.forms.length,0), dishes: dishes.length }, reviewed: { concepts: ids.size, forms: forms.size, dishes: new Set(curatedDishes.map(d => d.dishId)).size }, pilot: { concepts: pilotConcepts, forms: pilotForms, status: pilotAccepted ? 'PASS' : 'BLOCKED' }, groups, rejected, scaleStatus: pilotAccepted && ids.size >= 200 && forms.size >= 300 && new Set(curatedDishes.map(d => d.dishId)).size >= 120 && Object.entries(dishQuotas).every(([group, minimum]) => dishesByGroup[group] >= minimum) && groups.every(g => g.published >= g.minimumConcepts) ? 'READY_FOR_PLANNER_VERIFICATION' : 'BLOCKED', activeCatalogChanged: false };
}
