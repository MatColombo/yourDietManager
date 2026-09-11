import { element } from './dom.js';
import { ALLERGEN_IDS, INGREDIENT_STATES, MEAL_ARCHETYPES } from '../domain/catalogEnums.js';
import { archiveUserIngredient, archiveUserRecipe, duplicateRecipeToDraft, recipeToDraft, saveIngredient, saveRecipe } from '../services/personalCatalogService.js';
import { createCustomCatalogExport, importCustomCatalogExport } from '../services/customCatalogTransfer.js';
import { RECIPE_TAG_TAXONOMY, TAXONOMY_IDS } from '../services/referenceDataService.js';
import {
  createAutocomplete, createHierarchicalFoodCategorySelector, createMealArchetypePicker, createMultiSelectChips, createProductFoodPicker, createTokenChips,
  ingredientChoices, productFoodPathLabel, taxonomyChoices, unitsForIngredientRevision
} from './guidedControls.js';
import { controlledDetails, signalDraftChange } from './uiState.js';
import { REVIEW_DIMENSIONS, expectedReviewRecipeVersionIds, isProductionReviewManifest } from '../services/recipeHumanReviewService.js';

function t(state, key, vars = {}) { let value = state.i18n.t(key); for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, replacement); return value; }
function nav(state, url) { return state.navigate(url); }
function field(label, control, hint = '') { return element('label', { className: 'field' }, [element('span', { text: label }), control, hint ? element('small', { className: 'field__hint', text: hint }) : null]); }
function number(value = '', attrs = {}) { return element('input', { type: 'number', value: value ?? '', ...attrs }); }
function text(value = '', attrs = {}) { return element('input', { type: 'text', value: value ?? '', ...attrs }); }
function check(label, checked = false) { return element('label', { className: 'check-field' }, [element('input', { type: 'checkbox', checked }), element('span', { text: label })]); }
function optionSelect(options, value = '') { const select = element('select'); for (const [v, label] of options) select.append(element('option', { value: v, text: label })); select.value = value; return select; }
function splitLines(value) { return String(value || '').split('\n').map(item => item.trim()).filter(Boolean); }
function downloadJson(fileDocument, filename) { const blob = new Blob([JSON.stringify(fileDocument, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = element('a', { href: url, download: filename }); globalThis.document.body?.append?.(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function localeText(state, object, key = 'title') { return object?.[state.i18n.locale]?.[key] || object?.en?.[key] || object?.it?.[key] || '—'; }
function termLabel(state, termId) { const term = state.referenceDataIndex?.term?.(termId); return term?.i18n?.[state.i18n.locale]?.label || term?.i18n?.en?.label || term?.i18n?.it?.label || termId; }
function tagLabels(state, version) { return Object.values(version?.tags || {}).flat().map(id => termLabel(state, id)); }
function formatDateTime(state, value) { try { return new Intl.DateTimeFormat(state.i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value || '—'; } }
function safeReturnRoute(value, fallback = null) {
  const route = String(value || '');
  if (!route.startsWith('/') || route.startsWith('//') || /[\r\n]/.test(route)) return fallback;
  return route;
}
function routeWithParams(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') query.set(key, value);
  return `${path}${query.size ? `?${query}` : ''}`;
}
function currentRecipeRoute(recipeId, recipeVersionId = null, returnRoute = null) {
  return routeWithParams(`/recipes/${encodeURIComponent(recipeId)}`, { version: recipeVersionId, return: returnRoute });
}
function statusBox() { const node = element('div', { 'aria-live': 'polite' }); return { node, ok(message) { node.className = 'validation-box'; node.textContent = message; }, error(error) { node.className = 'validation-box validation-box--error'; node.textContent = error?.message || String(error); } }; }
function page(title, lead, eyebrow = 'CATALOG') { return element('section', { className: 'page-card page-card--wide catalog-page' }, [element('p', { className: 'eyebrow', text: eyebrow }), element('h1', { text: title }), element('p', { className: 'lead', text: lead })]); }

function recipeFilters(state) {
  const params = new URLSearchParams(location.search); const form = element('form', { className: 'filter-panel' });
  const q = text(params.get('q') || '', { placeholder: t(state, 'catalog.search.placeholder') });
  const meal = optionSelect([['', t(state, 'catalog.filter.anyMeal')], ...MEAL_ARCHETYPES.map(id => [id, t(state, `mealArchetype.${id}`)])], params.get('meal') || '');
  const origin = optionSelect([['', t(state, 'catalog.filter.anyOrigin')], ['base', t(state, 'catalog.origin.base')], ['user', t(state, 'catalog.origin.user')]], params.get('origin') || '');
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: params.get('food') || null, required: false });
  const dietChoices = taxonomyChoices(state.referenceDataIndex, RECIPE_TAG_TAXONOMY.diet, state.i18n.locale);
  const diet = optionSelect([['', t(state, 'catalog.filter.anyDiet')], ...dietChoices.map(choice => [choice.id, choice.label])], params.get('diet') || '');
  const practicalChoices = taxonomyChoices(state.referenceDataIndex, RECIPE_TAG_TAXONOMY.practical, state.i18n.locale);
  const practical = optionSelect([['', t(state, 'catalog.filter.anyPractical')], ...practicalChoices.map(choice => [choice.id, choice.label])], params.get('practical') || '');
  const energyMin = number(params.get('emin') || '', { min: 0, step: 50, placeholder: 'min' }); const energyMax = number(params.get('emax') || '', { min: 0, step: 50, placeholder: 'max' });
  const proteinMin = number(params.get('pmin') || '', { min: 0, step: 5 }); const fiberMin = number(params.get('fmin') || '', { min: 0, step: 1 }); const prepMax = number(params.get('prep') || '', { min: 0, step: 5 });
  const pack = optionSelect([['', t(state, 'catalog.filter.anyPack')]], params.get('pack') || '');
  state.catalogPacks.filter(item => item.status === 'installed').forEach(item => pack.append(element('option', { value: item.packId, text: t(state, item.labelKey) }))); pack.value = params.get('pack') || '';
  const allergens = element('div', { className: 'compact-checks' }); const selectedAllergens = new Set((params.get('allergens') || '').split(',').filter(Boolean));
  const allergenChecks = ALLERGEN_IDS.map(id => { const c = check(t(state, `allergen.${id}`), selectedAllergens.has(id)); allergens.append(c); return [id, c.querySelector('input')]; });
  form.append(
    element('div', { className: 'form-grid form-grid--3' }, [
      field(t(state, 'catalog.search.label'), q), field(t(state, 'catalog.filter.meal'), meal), field(t(state, 'catalog.filter.origin'), origin),
      field(t(state, 'catalog.filter.productFood'), productFood.node), field(t(state, 'catalog.filter.diet'), diet), field(t(state, 'catalog.filter.practical'), practical)
    ]),
    field(t(state, 'catalog.filter.pack'), pack)
  );
  const metrics = element('div', { className: 'form-grid form-grid--5' }, [field(t(state, 'catalog.filter.energyMin'), energyMin), field(t(state, 'catalog.filter.energyMax'), energyMax), field(t(state, 'catalog.filter.proteinMin'), proteinMin), field(t(state, 'catalog.filter.fiberMin'), fiberMin), field(t(state, 'catalog.filter.prepMax'), prepMax)]); form.append(metrics, controlledDetails(state, 'recipes-filter-allergens', { className: 'filter-details', defaultOpen: false, children: [element('summary', { text: t(state, 'catalog.filter.excludeAllergens') }), allergens] }));
  form.append(element('div', { className: 'button-row' }, [element('button', { className: 'button', type: 'submit', text: t(state, 'catalog.filter.apply') }), element('a', { href: '/recipes', 'data-route': '', className: 'button button--secondary', text: t(state, 'catalog.filter.clear') })]));
  form.addEventListener('submit', event => {
    event.preventDefault(); const next = new URLSearchParams();
    if (q.value.trim()) next.set('q', q.value.trim()); if (meal.value) next.set('meal', meal.value); if (origin.value) next.set('origin', origin.value); if (pack.value) next.set('pack', pack.value);
    if (productFood.getValue()) next.set('food', productFood.getValue()); if (diet.value) next.set('diet', diet.value); if (practical.value) next.set('practical', practical.value);
    if (energyMin.value) next.set('emin', energyMin.value); if (energyMax.value) next.set('emax', energyMax.value); if (proteinMin.value) next.set('pmin', proteinMin.value); if (fiberMin.value) next.set('fmin', fiberMin.value); if (prepMax.value) next.set('prep', prepMax.value);
    const ids = allergenChecks.filter(([, input]) => input.checked).map(([id]) => id); if (ids.length) next.set('allergens', ids.join(',')); nav(state, `/recipes${next.size ? `?${next}` : ''}`);
  });
  return form;
}

function queryFromLocation() { const p = new URLSearchParams(location.search); return { text: p.get('q') || '', mealArchetype: p.get('meal') || '', origin: p.get('origin') || '', packId: p.get('pack') || '', productFoodId: p.get('food') || '', dietTag: p.get('diet') || '', practicalTag: p.get('practical') || '', energyMin: p.get('emin'), energyMax: p.get('emax'), proteinMin: p.get('pmin'), fiberMin: p.get('fmin'), prepMax: p.get('prep'), excludeAllergens: (p.get('allergens') || '').split(',').filter(Boolean), offset: p.get('offset') || 0, limit: 50 }; }

export function recipesPage(state) {
  const params = new URLSearchParams(location.search); if (params.get('id')) return recipeDetailPage(state, params.get('id'), params.get('version'));
  const section = page(t(state, 'page.recipes.title'), t(state, 'catalog.recipes.lead'));
  const pageActions = [element('a', { href: '/recipes/new', 'data-route': '', className: 'button', text: t(state, 'catalog.recipe.new') }), element('a', { href: '/recipes/packs', 'data-route': '', className: 'button button--secondary', text: t(state, 'catalog.packs.manage') })];
  if (isProductionReviewManifest(state.catalogManifest)) pageActions.unshift(element('a', { href: '/recipes/review', 'data-route': '', className: 'button', text: t(state, 'review.openDashboard') }));
  section.append(element('div', { className: 'page-actions' }, pageActions), recipeFilters(state));
  const results = element('div', { className: 'catalog-results', 'aria-live': 'polite' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(results);
  void state.catalogQuery.searchRecipes(queryFromLocation()).then(async result => {
    const reviewMap = isProductionReviewManifest(state.catalogManifest) ? await state.humanReview.reviewsForVersions(state.catalogManifest, result.items.map(item => item.recipeVersionId)) : new Map();
    const productFacets = await state.catalogQuery.productFoodFacetsForRecipes(result.items);
    results.replaceChildren(element('div', { className: 'results-heading' }, [element('strong', { text: t(state, 'catalog.results.count', { count: String(result.total) }) }), element('span', { className: 'muted', text: t(state, 'catalog.results.indexed') })]));
    const grid = element('div', { className: 'recipe-grid' });
    for (const recipe of result.items) {
      const n = recipe.calculatedNutrition; grid.append(element('a', { href: `/recipes/${encodeURIComponent(recipe.recipeId)}`, 'data-route': '', className: 'recipe-card' }, [
        element('div', { className: 'recipe-card__top' }, [element('strong', { text: localeText(state, recipe.i18n) }), element('div', { className: 'recipe-card__badges' }, [element('span', { className: `origin-pill origin-pill--${recipe.origin}`, text: t(state, `catalog.origin.${recipe.origin}`) }), isProductionReviewManifest(state.catalogManifest) ? element('span', { className: `status-chip status-chip--review-${reviewMap.get(recipe.recipeVersionId)?.decision || 'unreviewed'}`, text: t(state, `review.status.${reviewMap.get(recipe.recipeVersionId)?.decision || 'unreviewed'}`) }) : null])]),
        element('p', { className: 'muted', text: recipe.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)).join(' · ') }),
        element('div', { className: 'chip-list chip-list--compact' }, (productFacets.get(recipe.recipeVersionId)?.categoryIds || []).slice(0, 4).map(id => element('span', { className: 'chip chip--taxonomy', text: termLabel(state, id) }))),
        element('div', { className: 'recipe-metrics' }, [element('span', { text: `${Math.round(n.energyKcal)} kcal` }), element('span', { text: `${n.proteinG} g ${t(state, 'nutrient.protein')}` }), element('span', { text: `${n.fiberG} g ${t(state, 'nutrient.fiber')}` }), element('span', { text: `${recipe.practical.prepMinutes} min` })]), element('span', { className: 'recipe-card__action', text: t(state, 'common.details') })
      ]));
    }
    if (!result.items.length) grid.append(element('div', { className: 'empty-state', text: t(state, 'catalog.results.empty') })); results.append(grid);
    const pager = element('div', { className: 'pager' }); const current = result.offset; const p = new URLSearchParams(location.search);
    if (current > 0) { p.set('offset', String(Math.max(0, current - result.limit))); pager.append(element('a', { href: `/recipes?${p}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'common.previous') })); }
    if (current + result.limit < result.total) { p.set('offset', String(current + result.limit)); pager.append(element('a', { href: `/recipes?${p}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'common.next') })); } results.append(pager);
  }).catch(error => { results.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })); }); return section;
}


function reviewStatusChip(state, review) {
  const status = review?.decision || 'unreviewed';
  return element('span', { className: `status-chip status-chip--review-${status}`, text: t(state, `review.status.${status}`) });
}

async function recipeHumanReviewPanel(state, version) {
  if (!isProductionReviewManifest(state.catalogManifest)) return null;
  const existing = await state.humanReview.get(state.catalogManifest, version.recipeVersionId);
  const box = element('section', { className: 'human-review-panel', 'data-testid': 'human-review-panel' });
  const heading = element('div', { className: 'section-heading' }, [element('h3', { text: t(state, 'review.recipeTitle') }), reviewStatusChip(state, existing)]);
  const reviewer = text(existing?.reviewer || await state.repo.getMeta('humanReviewReviewer') || 'local-human-reviewer');
  const dimensionControls = {};
  const dimensionGrid = element('div', { className: 'review-dimension-grid' });
  for (const key of REVIEW_DIMENSIONS) {
    const select = optionSelect([['', t(state, 'review.select')], ['pass', t(state, 'review.dimensionPass')], ['fail', t(state, 'review.dimensionFail')]], existing?.dimensions?.[key] || '');
    dimensionControls[key] = select;
    dimensionGrid.append(field(t(state, `review.dimension.${key}`), select));
  }
  const decision = optionSelect([['', t(state, 'review.selectDecision')], ['approved', t(state, 'review.status.approved')], ['needs_changes', t(state, 'review.status.needs_changes')], ['rejected', t(state, 'review.status.rejected')]], existing?.decision || '');
  const notes = element('textarea', { rows: 4, placeholder: t(state, 'review.notesPlaceholder') }); notes.value = existing?.notes || '';
  const status = statusBox();
  const save = async goNext => {
    try {
      const dimensions = Object.fromEntries(REVIEW_DIMENSIONS.map(key => [key, dimensionControls[key].value]));
      const saved = await state.humanReview.save(state.catalogManifest, version, { decision: decision.value, dimensions, notes: notes.value, reviewer: reviewer.value });
      await state.repo.setMeta('humanReviewReviewer', saved.reviewer);
      await state.refreshCatalog();
      status.ok(t(state, 'review.saved'));
      heading.replaceChildren(element('h3', { text: t(state, 'review.recipeTitle') }), reviewStatusChip(state, saved));
      if (goNext) {
        const next = await state.humanReview.nextUnreviewed(state.catalogManifest, version.recipeVersionId);
        nav(state, next ? `/recipes/${encodeURIComponent(next.recipeId)}?version=${encodeURIComponent(next.recipeVersionId)}` : '/recipes/review');
      }
    } catch (error) { status.error(error); }
  };
  box.append(
    heading,
    element('p', { className: 'muted', text: t(state, 'review.recipeHelp') }),
    field(t(state, 'review.reviewer'), reviewer),
    dimensionGrid,
    field(t(state, 'review.decision'), decision),
    field(t(state, 'review.notes'), notes),
    status.node,
    element('div', { className: 'button-row' }, [
      element('button', { className: 'button button--secondary', type: 'button', text: t(state, 'review.save'), onClick: () => save(false) }),
      element('button', { className: 'button', type: 'button', text: t(state, 'review.saveNext'), onClick: () => save(true) })
    ])
  );
  return box;
}

export function productionReviewPage(state) {
  const section = page(t(state, 'review.dashboardTitle'), t(state, 'review.dashboardLead'), 'PRODUCTION REVIEW');
  if (!isProductionReviewManifest(state.catalogManifest)) {
    section.append(element('div', { className: 'validation-box validation-box--warning', text: t(state, 'review.notActive') }));
    return section;
  }
  const body = element('div', { className: 'catalog-results', 'aria-live': 'polite' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(body);
  void Promise.all([state.humanReview.summary(state.catalogManifest), state.humanReview.list(state.catalogManifest)]).then(([summary, reviews]) => {
    const metrics = element('div', { className: 'summary-grid' }, [
      [t(state, 'review.expected'), summary.expected], [t(state, 'review.reviewed'), summary.reviewed], [t(state, 'review.approved'), summary.approved],
      [t(state, 'review.needsChanges'), summary.needsChanges], [t(state, 'review.rejected'), summary.rejected], [t(state, 'review.unreviewed'), summary.unreviewed]
    ].map(([label, value]) => element('div', { className: 'metric' }, [element('span', { text: label }), element('strong', { text: String(value) })])));
    const progress = element('progress', { className: 'review-progress', max: summary.expected || 1, value: summary.reviewed, 'aria-label': t(state, 'review.progress') });
    const nextButton = element('button', { className: 'button', text: summary.unreviewed ? t(state, 'review.reviewNext') : t(state, 'review.allReviewed'), disabled: summary.unreviewed === 0, onClick: async () => {
      const next = await state.humanReview.nextUnreviewed(state.catalogManifest); if (next) nav(state, `/recipes/${encodeURIComponent(next.recipeId)}?version=${encodeURIComponent(next.recipeVersionId)}`);
    } });
    const exportButton = element('button', { className: 'button button--secondary', text: t(state, 'review.export'), onClick: async () => {
      const document = await state.humanReview.exportBundle(state.catalogManifest); downloadJson(document, `yourdietmanager-human-review-${state.catalogManifest.publication.publicationId}.json`);
    } });
    const importInput = element('input', { type: 'file', accept: 'application/json,.json', className: 'review-import-input' });
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0]; if (!file) return;
      try { const document = JSON.parse(await file.text()); await state.humanReview.importBundle(document, state.catalogManifest); await state.refreshCatalog(); state.notify?.('success', t(state, 'review.imported')); state.render({ force: true }); }
      catch (error) { state.notify?.('error', `${t(state, 'review.importFailed')}: ${error.message || error}`); }
    });
    const attention = reviews.filter(item => item.decision !== 'approved');
    const attentionBox = element('div', { className: 'review-attention-list' });
    if (attention.length) for (const item of attention.slice(0, 50)) attentionBox.append(element('a', { href: `/recipes/${encodeURIComponent(item.recipeId)}?version=${encodeURIComponent(item.recipeVersionId)}`, 'data-route': '', className: 'history-row' }, [element('span', { text: item.recipeId }), reviewStatusChip(state, item), element('span', { className: 'muted', text: item.notes || '—' })]));
    else attentionBox.append(element('p', { className: 'muted', text: t(state, 'review.noAttention') }));
    const gate = element('div', { className: `validation-box${summary.pass ? '' : ' validation-box--warning'}`, text: summary.pass ? t(state, 'review.gatePass') : t(state, 'review.gateBlocked') });
    body.replaceChildren(
      element('div', { className: 'review-publication-banner' }, [
        element('strong', { text: t(state, 'review.publicationActive') }),
        element('span', { text: state.catalogManifest.publication.publicationId }),
        element('span', { className: 'muted', text: `${t(state, 'review.sourceDigest')}: ${state.catalogManifest.publication.sourceCorpusDigest.slice(0,16)}…` })
      ]),
      metrics, progress,
      element('div', { className: 'button-row' }, [nextButton, exportButton, element('label', { className: 'button button--secondary review-import-label' }, [document.createTextNode(t(state, 'review.import')), importInput])]),
      gate,
      element('h3', { text: t(state, 'review.attentionTitle') }), attentionBox
    );
  }).catch(error => body.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return section;
}

export function recipeDetailPage(state, recipeId, recipeVersionId = null) {
  const params = new URLSearchParams(location.search);
  const returnRoute = safeReturnRoute(params.get('return'), '/recipes');
  const section = page(t(state, 'catalog.recipe.detail'), t(state, 'catalog.recipe.detailLead'));
  const body = element('div', { className: 'catalog-results', 'data-testid': 'recipe-detail' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(body);
  void Promise.all([state.catalogQuery.resolveRecipe(recipeId, recipeVersionId), state.catalogQuery.recipeHistory(recipeId)]).then(async ([record, history]) => {
    if (!record) { body.replaceChildren(element('div', { className: 'empty-state', text: t(state, 'catalog.recipe.notFound') })); return; }
    const { family, version, ingredientLines } = record; const n = version.calculatedNutrition; const current = family.currentVersionId === version.recipeVersionId;
    const actions = element('div', { className: 'page-actions' });
    actions.append(element('a', { href: returnRoute, 'data-route': '', className: 'button button--secondary context-back-link', 'data-testid': 'context-back', text: returnRoute === '/recipes' ? t(state, 'common.back') : t(state, 'navigation.backToContext') }));
    const frozenReviewIds = isProductionReviewManifest(state.catalogManifest) ? new Set(expectedReviewRecipeVersionIds(state.catalogManifest)) : new Set();
    const reviewMode = version.origin === 'base' && frozenReviewIds.has(version.recipeVersionId);
    if (reviewMode) actions.append(element('a', { href: '/recipes/review', 'data-route': '', className: 'button button--secondary', text: t(state, 'review.dashboardShort') }));
    else actions.append(element('a', { href: `/recipes/${encodeURIComponent(recipeId)}/edit`, 'data-route': '', className: 'button', text: t(state, 'common.edit') }));
    actions.append(element('a', { href: `/recipes/new?duplicate=${encodeURIComponent(recipeId)}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'catalog.recipe.duplicate') }));
    if (family.origin === 'user') actions.append(element('button', { className: 'button button--danger', text: t(state, 'common.archive'), onClick: async () => { if (!confirm(t(state, 'catalog.recipe.archiveConfirm'))) return; await archiveUserRecipe(recipeId, { repo: state.repo }); nav(state, '/recipes?origin=user'); } }));
    const title = element('h2', { text: localeText(state, version.i18n) }); const desc = element('p', { text: localeText(state, version.i18n, 'description') });
    const versionMeta = element('div', { className: 'detail-meta' }, [
      element('span', { className: `origin-pill origin-pill--${family.origin}`, text: t(state, `catalog.origin.${family.origin}`) }),
      element('span', { text: `${t(state, 'catalog.versionNumber')} ${version.versionNumber}` }),
      element('span', { text: formatDateTime(state, version.createdAt) }),
      current ? element('span', { className: 'status-chip status-chip--installed', text: t(state, 'catalog.currentVersion') }) : element('span', { className: 'status-chip', text: t(state, 'catalog.historicalVersion') })
    ]);
    const metrics = element('div', { className: 'summary-grid' }, [['kcal', Math.round(n.energyKcal)], [t(state, 'nutrient.protein'), `${n.proteinG} g`], [t(state, 'nutrient.carbs'), `${n.carbsG} g`], [t(state, 'nutrient.fat'), `${n.fatG} g`], [t(state, 'nutrient.fiber'), `${n.fiberG} g`]].map(([label, value]) => element('div', { className: 'metric' }, [element('span', { text: label }), element('strong', { text: value })])));
    const selfRoute = currentRecipeRoute(recipeId, version.recipeVersionId, returnRoute === '/recipes' ? null : returnRoute);
    const list = element('ul', { className: 'ingredient-list' });
    for (const line of ingredientLines) list.append(element('li', {}, [
      element('a', { href: routeWithParams(`/configure/ingredients/${encodeURIComponent(line.ingredientId)}`, { revision: line.ingredientRevisionId, return: selfRoute }), 'data-route': '', className: 'text-link', 'data-testid': 'recipe-ingredient-link', text: line.ingredientRevision ? localeText(state, line.ingredientRevision.i18n, 'name') : line.ingredientId }),
      document.createTextNode(` — ${line.amount} ${line.unit}${line.optional ? ` · ${t(state, 'catalog.optional')}` : ''}`)
    ]));
    const steps = element('ol', { className: 'instructions-list' }); for (const step of version.i18n[state.i18n.locale]?.instructions || version.i18n.en.instructions) steps.append(element('li', { text: step }));
    const tags = tagLabels(state, version); const tagBox = tags.length ? element('div', { className: 'chip-list' }, tags.map(label => element('span', { className: 'chip', text: label }))) : element('span', { className: 'muted', text: t(state, 'catalog.tags.none') });
    const historyBox = element('div', { className: 'version-history' });
    for (const item of history) historyBox.append(element('a', {
      href: currentRecipeRoute(recipeId, item.recipeVersionId === family.currentVersionId ? null : item.recipeVersionId, returnRoute === '/recipes' ? null : returnRoute),
      'data-route': '', className: `history-row${item.recipeVersionId === version.recipeVersionId ? ' history-row--active' : ''}`
    }, [element('strong', { text: `${t(state, 'catalog.versionNumber')} ${item.versionNumber}` }), element('span', { text: formatDateTime(state, item.createdAt) }), element('span', { text: t(state, `catalog.origin.${item.origin}`) })]));
    body.replaceChildren(
      actions, title, versionMeta, desc,
      !current ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.historicalWarning') }) : null,
      !record.installed && version.origin === 'base' ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.recipe.packNotInstalled') }) : null,
      metrics,
      element('h3', { text: t(state, 'catalog.ingredients') }), list,
      element('h3', { text: t(state, 'catalog.instructions') }), steps,
      element('h3', { text: t(state, 'catalog.semanticData') }), tagBox,
      element('p', { className: 'muted', text: `${version.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)).join(' · ')} · ${version.practical.prepMinutes + version.practical.cookMinutes} min · ${version.allergenIds.length ? version.allergenIds.map(id => t(state, `allergen.${id}`)).join(', ') : t(state, 'catalog.noAllergens')}` }),
      reviewMode ? await recipeHumanReviewPanel(state, version) : null,
      element('h3', { text: t(state, 'catalog.versionHistory') }), historyBox
    );
  }).catch(error => body.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }))); return section;
}

function recipeEditorForm(state, draft, ingredients, existingId = null, historicalRevisions = new Map()) {
  const section = page(t(state, existingId ? 'catalog.recipe.edit' : 'catalog.recipe.new'), t(state, 'catalog.recipe.editorLead'), 'AUTHORING'); section.setAttribute('data-testid', 'recipe-editor');
  const status = statusBox();
  const validation = element('div', { className: 'inline-status', 'aria-live': 'polite' });
  let save = null;
  const titleIt = text(draft.titleIt), titleEn = text(draft.titleEn);
  const descIt = element('textarea', { rows: 2 }); descIt.value = draft.descriptionIt || '';
  const descEn = element('textarea', { rows: 2 }); descEn.value = draft.descriptionEn || '';
  const stepsIt = element('textarea', { rows: 5 }); stepsIt.value = (draft.instructionsIt || []).join('\n');
  const stepsEn = element('textarea', { rows: 5 }); stepsEn.value = (draft.instructionsEn || []).join('\n');
  section.append(element('div', { className: 'form-grid form-grid--2' }, [
    field('Titolo IT', titleIt), field('Title EN', titleEn), field('Descrizione IT', descIt), field('Description EN', descEn),
    field(t(state, 'catalog.instructionsIt'), stepsIt, t(state, 'catalog.instructionsHint')),
    field(t(state, 'catalog.instructionsEn'), stepsEn, t(state, 'catalog.instructionsHint'))
  ]));

  const archetypePicker = createMealArchetypePicker(state, draft.mealArchetypes || [], { onChange: validateForm });
  section.append(element('h3', { text: t(state, 'catalog.mealArchetypes') }), element('p', { className: 'muted', text: t(state, 'guided.mealArchetype.help') }), archetypePicker.node);

  const linesBox = element('div', { className: 'ingredient-editor-lines' }); const lineRows = [];
  const ingredientChoiceList = ingredientChoices(ingredients, state.i18n.locale, {
    base: t(state, 'catalog.origin.base'), user: t(state, 'catalog.origin.user')
  });
  const ingredientById = new Map(ingredients.map(item => [item.family.ingredientId, item]));
  const revisionFor = (ingredientId, revisionId = null) => historicalRevisions.get(revisionId) || ingredientById.get(ingredientId)?.revision || null;
  const addLine = source => {
    const row = element('div', { className: 'ingredient-line-editor ingredient-line-editor--guided' });
    const amount = number(source?.amount ?? 100, { min: .01, step: .01 });
    const unitHost = element('div');
    const optional = check(t(state, 'catalog.optional'), Boolean(source?.optional));
    const entry = { row, ingredient: null, amount, unit: null, unitHost, optional: optional.querySelector('input'), revisionId: source?.ingredientRevisionId || null, revision: revisionFor(source?.ingredientId, source?.ingredientRevisionId) };
    const renderUnit = preferred => {
      unitHost.replaceChildren(); const choices = unitsForIngredientRevision(entry.revision);
      const select = optionSelect(choices.map(choice => [choice.id, choice.label]), choices.some(choice => choice.id === preferred) ? preferred : choices[0]?.id || '');
      select.disabled = choices.length === 0; entry.unit = select; unitHost.append(field(t(state, 'catalog.ingredient.unit'), select)); validateForm();
    };
    entry.ingredient = createAutocomplete({
      choices: ingredientChoiceList, value: source?.ingredientId || null, required: true,
      placeholder: t(state, 'catalog.ingredient.searchSelect'), invalidMessage: t(state, 'guided.reference.required'),
      onChange: (id, choice) => {
        const item = choice?.data || ingredientById.get(id); entry.revisionId = item?.family?.currentRevisionId || null; entry.revision = item?.revision || null;
        renderUnit(entry.revision?.basis?.unit || ''); validateForm();
      }
    });
    const remove = element('button', { className: 'button button--small button--danger', type: 'button', text: '×', 'aria-label': t(state, 'common.remove'), onClick: () => { row.remove(); const index = lineRows.indexOf(entry); if (index >= 0) lineRows.splice(index, 1); signalDraftChange(section); validateForm(); } });
    row.append(field(t(state, 'catalog.ingredient.select'), entry.ingredient.node), field(t(state, 'catalog.ingredient.amount'), amount), unitHost, optional, remove);
    amount.addEventListener('input', validateForm); optional.querySelector('input')?.addEventListener('change', validateForm);
    linesBox.append(row); lineRows.push(entry); renderUnit(source?.unit || entry.revision?.basis?.unit || '');
  };
  for (const line of draft.ingredientLines || []) addLine(line);
  if (!lineRows.length) addLine();
  section.append(element('div', { className: 'section-heading' }, [element('h3', { text: t(state, 'catalog.ingredients') }), element('button', { className: 'button button--secondary button--small', type: 'button', text: t(state, 'catalog.ingredient.addLine'), onClick: () => { addLine(); signalDraftChange(section); } })]), linesBox);

  const prep = number(draft.prepMinutes ?? 0, { min: 0 }), cook = number(draft.cookMinutes ?? 0, { min: 0 });
  const practicalChecks = [['reheatingRequired','catalog.practical.reheat'],['coldSuitable','catalog.practical.cold'],['portable','catalog.practical.portable'],['fridgeRequired','catalog.practical.fridge'],['freezerSuitable','catalog.practical.freezer'],['mealPrepSuitable','catalog.practical.mealPrep']].map(([key, label]) => [key, check(t(state, label), Boolean(draft[key]))]);
  section.append(element('div', { className: 'form-grid form-grid--2' }, [field(t(state, 'catalog.prepMinutes'), prep), field(t(state, 'catalog.cookMinutes'), cook)]), element('div', { className: 'compact-checks' }, practicalChecks.map(([, c]) => c)));

  const taxonomyConfigs = [
    ['families', TAXONOMY_IDS.recipeFamily, 'catalog.tags.families'], ['cuisines', TAXONOMY_IDS.cuisine, 'catalog.tags.cuisines'],
    ['diet', TAXONOMY_IDS.dietTag, 'catalog.tags.diet'], ['flavor', TAXONOMY_IDS.flavorProfile, 'catalog.tags.flavor'],
    ['practicalTags', TAXONOMY_IDS.practicalTag, 'catalog.tags.practical'], ['preparationTags', TAXONOMY_IDS.preparationTechnique, 'catalog.tags.preparation']
  ];
  const taxonomyControls = {};
  const tagGrid = element('div', { className: 'form-grid form-grid--3' });
  for (const [key, taxonomyId, labelKey] of taxonomyConfigs) {
    taxonomyControls[key] = createMultiSelectChips({ choices: taxonomyChoices(state.referenceDataIndex, taxonomyId, state.i18n.locale), values: Array.isArray(draft[key]) ? draft[key] : [], placeholder: t(state, 'guided.reference.search') });
    tagGrid.append(field(t(state, labelKey), taxonomyControls[key].node));
  }
  section.append(element('h3', { text: t(state, 'reference.semanticTags') }), tagGrid);

  save = element('button', { className: 'button', text: t(state, 'common.save') });
  function validateForm() {
    if (!save) return false;
    const errors = [];
    if (!titleIt.value.trim() && !titleEn.value.trim()) errors.push(t(state, 'catalog.validation.title'));
    if (!splitLines(stepsIt.value).length && !splitLines(stepsEn.value).length) errors.push(t(state, 'catalog.validation.instructions'));
    if (!archetypePicker.validate()) errors.push(t(state, 'guided.mealArchetype.required'));
    if (!lineRows.length) errors.push(t(state, 'catalog.validation.ingredientRequired'));
    for (const row of lineRows) {
      if (!row.ingredient.getValue()) errors.push(t(state, 'catalog.validation.ingredientRequired'));
      if (!(Number(row.amount.value) > 0)) errors.push(t(state, 'catalog.validation.amount'));
      if (!row.unit?.value) errors.push(t(state, 'catalog.validation.unit'));
    }
    validation.className = errors.length ? 'validation-box validation-box--error' : 'validation-box';
    validation.textContent = errors.length ? [...new Set(errors)].join(' · ') : t(state, 'catalog.validation.ready');
    save.disabled = errors.length > 0; return !errors.length;
  }
  for (const control of [titleIt, titleEn, stepsIt, stepsEn, prep, cook]) control.addEventListener('input', validateForm);
  save.addEventListener('click', async () => {
    if (!validateForm()) return;
    try {
      save.disabled = true;
      const ingredientLines = lineRows.map(row => ({ ingredientId: row.ingredient.getValue(), ingredientRevisionId: row.revisionId, amount: Number(row.amount.value), unit: row.unit.value, optional: row.optional.checked }));
      const payload = {
        recipeId: existingId, titleIt: titleIt.value, titleEn: titleEn.value, descriptionIt: descIt.value, descriptionEn: descEn.value,
        instructionsIt: splitLines(stepsIt.value), instructionsEn: splitLines(stepsEn.value), mealArchetypes: archetypePicker.getValues(), ingredientLines,
        prepMinutes: prep.value, cookMinutes: cook.value,
        families: taxonomyControls.families.getValues(), cuisines: taxonomyControls.cuisines.getValues(), diet: taxonomyControls.diet.getValues(),
        flavor: taxonomyControls.flavor.getValues(), practicalTags: taxonomyControls.practicalTags.getValues(), preparationTags: taxonomyControls.preparationTags.getValues()
      };
      for (const [key, control] of practicalChecks) payload[key] = control.querySelector('input').checked;
      const saved = await saveRecipe(payload, { repo: state.repo, registry: state.registry }); await state.refreshCatalog(); state.markSaved?.(); state.notify?.('success', t(state, 'catalog.recipe.saved')); nav(state, `/recipes/${encodeURIComponent(saved.family.recipeId)}`);
    } catch (error) { status.error(error); save.disabled = false; }
  });
  section.append(validation, element('div', { className: 'editor-footer' }, [status.node, element('div', { className: 'button-row' }, [element('a', { href: existingId ? `/recipes/${encodeURIComponent(existingId)}` : '/recipes', 'data-route': '', className: 'button button--secondary', text: t(state, 'common.cancel') }), save]) ]));
  validateForm(); return section;
}

export function recipeEditorPage(state, { edit = false, recipeId = null } = {}) {
  const shell = page(t(state, edit ? 'catalog.recipe.edit' : 'catalog.recipe.new'), t(state, 'catalog.recipe.editorLead'), 'AUTHORING'); shell.append(element('p', { className: 'muted', text: t(state, 'common.loading') }));
  void (async () => {
    const ingredients = await state.catalogQuery.listCurrentIngredients(); if (!ingredients.length) throw new Error(t(state, 'catalog.recipe.noIngredients'));
    const p = new URLSearchParams(location.search); let draft = {}; let existingId = null;
    if (edit) {
      existingId = recipeId || p.get('id'); if (!existingId) throw new Error(t(state, 'catalog.recipe.notFound'));
      const record = await state.catalogQuery.resolveRecipe(existingId); if (!record) throw new Error(t(state, 'catalog.recipe.notFound'));
      draft = await recipeToDraft(existingId, { repo: state.repo });
    } else if (p.get('duplicate')) draft = await duplicateRecipeToDraft(p.get('duplicate'), { repo: state.repo });
    const historicalIds = [...new Set((draft.ingredientLines || []).map(line => line.ingredientRevisionId).filter(Boolean))];
    const historical = new Map((await state.repo.getMany('ingredientRevisions', historicalIds)).map(revision => [revision.ingredientRevisionId, revision]));
    const replacement = recipeEditorForm(state, draft, ingredients, existingId, historical); shell.replaceWith(replacement);
  })().catch(error => shell.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return shell;
}

export function packsPage(state) {
  const section = page(t(state, 'catalog.packs.title'), t(state, 'catalog.packs.lead')); section.append(element('a', { href: '/recipes', 'data-route': '', className: 'button button--secondary', text: t(state, 'common.back') })); const list = element('div', { className: 'pack-list' });
  for (const pack of state.catalogPacks) {
    const action = pack.status === 'installed'
      ? (pack.required ? null : element('button', { className: 'button button--secondary', text: t(state, 'catalog.pack.uninstall'), onClick: async () => { try { await state.uninstallPack(pack.packId); } catch (error) { alert(error.message || error); } } }))
      : element('button', { className: 'button', text: t(state, 'catalog.pack.install'), onClick: async () => { try { await state.installPack(pack.packId); } catch (error) { alert(error.message || error); } } });
    const offline = pack.status === 'installed'
      ? element('span', { className: 'muted', text: t(state, pack.offlineCache?.cached ? 'catalog.pack.offlineReady' : 'catalog.pack.offlineRuntimeReady') })
      : null;
    list.append(element('article', { className: 'pack-card' }, [
      element('div', {}, [element('strong', { text: t(state, pack.labelKey) }), element('p', { className: 'muted', text: t(state, pack.descriptionKey) })]),
      element('div', { className: 'pack-card__meta' }, [element('span', { className: `status-chip status-chip--${pack.status}`, text: t(state, `catalog.pack.status.${pack.status}`) }), element('span', { text: `${pack.recipeVersionIds.length} ${t(state, 'catalog.recipes').toLowerCase()}` }), offline, action])
    ]));
  }
  if (!state.catalogPacks.length) list.append(element('div', { className: 'empty-state', text: t(state, 'catalog.packs.none') })); section.append(list); return section;
}

function ingredientInputFromRevision(revision) {
  return revision ? {
    ingredientId: revision.ingredientId, nameIt: revision.i18n.it.name, nameEn: revision.i18n.en.name,
    aliasesIt: [...(revision.i18n.it.aliases || [])], aliasesEn: [...(revision.i18n.en.aliases || [])], basisUnit: revision.basis.unit,
    state: revision.basis.state, ...revision.nutrition, foodGroup: revision.taxonomy.foodGroup, foodSubgroup: revision.taxonomy.foodSubgroup, productFoodId: revision.productTaxonomy?.conceptId || null,
    flavorProfile: revision.taxonomy.flavorProfile, mealArchetypes: revision.taxonomy.mealArchetypes, allergenIds: revision.allergenIds, conversions: structuredClone(revision.conversions || [])
  } : {};
}
function ingredientEditor(state, source = {}) {
  const status = statusBox(); const box = element('div', { className: 'editor-stack catalog-editor', 'data-testid': 'ingredient-editor' }); const validation = element('div', { 'aria-live': 'polite' });
  const nameIt = text(source.nameIt), nameEn = text(source.nameEn);
  const aliasesIt = createTokenChips({ values: source.aliasesIt || [], placeholder: t(state, 'catalog.alias.placeholder'), addLabel: t(state, 'common.add') });
  const aliasesEn = createTokenChips({ values: source.aliasesEn || [], placeholder: t(state, 'catalog.alias.placeholder'), addLabel: t(state, 'common.add') });
  const basis = optionSelect([['g','g'],['ml','ml']], source.basisUnit || 'g');
  const stateSelect = optionSelect(INGREDIENT_STATES.map(id => [id, t(state, `ingredientState.${id}`)]), source.state || 'unknown');
  const energy = number(source.energyKcal ?? '', { min: 0, step: .1 }), protein = number(source.proteinG ?? '', { min: 0, step: .1 }), carbs = number(source.carbsG ?? '', { min: 0, step: .1 }), fat = number(source.fatG ?? '', { min: 0, step: .1 }), fiber = number(source.fiberG ?? '', { min: 0, step: .1 });
  const category = createHierarchicalFoodCategorySelector(state, state.referenceDataIndex, { foodGroup: source.foodGroup || null, foodSubgroup: source.foodSubgroup || null });
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: source.productFoodId || null, required: true, levels: ['concept'] });
  const flavorChoices = taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.flavorProfile, state.i18n.locale);
  const flavor = createAutocomplete({ choices: flavorChoices, value: source.flavorProfile || flavorChoices.find(choice => choice.id === 'flavor_neutral')?.id || flavorChoices[0]?.id || null, required: true, placeholder: t(state, 'guided.reference.search'), invalidMessage: t(state, 'guided.reference.required') });
  const mealPicker = createMealArchetypePicker(state, source.mealArchetypes || [], { onChange: validateForm });
  const allergenChecks = ALLERGEN_IDS.map(id => [id, check(t(state, `allergen.${id}`), (source.allergenIds || []).includes(id))]);

  box.append(element('div', { className: 'form-grid form-grid--2' }, [
    field(t(state, 'catalog.name.it'), nameIt), field(t(state, 'catalog.name.en'), nameEn),
    field(t(state, 'catalog.aliasesIt'), aliasesIt.node, t(state, 'catalog.aliases.help')), field(t(state, 'catalog.aliasesEn'), aliasesEn.node, t(state, 'catalog.aliases.help')),
    field(t(state, 'catalog.basisUnit'), basis), field(t(state, 'catalog.ingredientState'), stateSelect)
  ]), category.node, field(t(state, 'catalog.productFood'), productFood.node, t(state, 'catalog.productFood.help')), field(t(state, 'catalog.flavorProfile'), flavor.node));
  box.append(element('h3', { text: t(state, 'catalog.nutritionPer100') }), element('div', { className: 'form-grid form-grid--5' }, [
    field(t(state, 'catalog.energy100'), energy), field(t(state, 'catalog.protein100'), protein), field(t(state, 'catalog.carbs100'), carbs), field(t(state, 'catalog.fat100'), fat), field(t(state, 'catalog.fiber100'), fiber)
  ]));
  box.append(element('h3', { text: t(state, 'catalog.mealArchetypes') }), element('p', { className: 'muted', text: t(state, 'guided.mealArchetype.help') }), mealPicker.node,
    element('h3', { text: t(state, 'catalog.allergens') }), element('div', { className: 'compact-checks' }, allergenChecks.map(([, c]) => c)));

  const save = element('button', { className: 'button', text: t(state, 'common.save') });
  function validateForm() {
    if (!save) return false; const errors = [];
    if (!nameIt.value.trim() && !nameEn.value.trim()) errors.push(t(state, 'catalog.validation.name'));
    for (const [label, control] of [[t(state, 'catalog.energy100'), energy],[t(state, 'catalog.protein100'), protein],[t(state, 'catalog.carbs100'), carbs],[t(state, 'catalog.fat100'), fat],[t(state, 'catalog.fiber100'), fiber]]) if (control.value === '' || !(Number(control.value) >= 0)) errors.push(`${label}: ${t(state, 'catalog.validation.requiredNumber')}`);
    if (!category.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!productFood.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!flavor.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!mealPicker.validate()) errors.push(t(state, 'guided.mealArchetype.required'));
    validation.className = errors.length ? 'validation-box validation-box--error' : 'validation-box'; validation.textContent = errors.length ? [...new Set(errors)].join(' · ') : t(state, 'catalog.validation.ready');
    save.disabled = errors.length > 0; return !errors.length;
  }
  for (const control of [nameIt, nameEn, energy, protein, carbs, fat, fiber, basis, stateSelect]) control.addEventListener('input', validateForm);
  save.addEventListener('click', async () => {
    if (!validateForm()) return;
    try {
      save.disabled = true; const cat = category.getValue();
      const savedIngredient = await saveIngredient({
        ingredientId: source.ingredientId, nameIt: nameIt.value, nameEn: nameEn.value, aliasesIt: aliasesIt.getValues(), aliasesEn: aliasesEn.getValues(),
        basisUnit: basis.value, state: stateSelect.value, energyKcal: energy.value, proteinG: protein.value, carbsG: carbs.value, fatG: fat.value, fiberG: fiber.value,
        foodGroup: cat.foodGroup, foodSubgroup: cat.foodSubgroup, productFoodId: productFood.getValue(), flavorProfile: flavor.getValue(), mealArchetypes: mealPicker.getValues(),
        allergenIds: allergenChecks.filter(([, c]) => c.querySelector('input').checked).map(([id]) => id), conversions: source.conversions || []
      }, { repo: state.repo, registry: state.registry });
      await state.refreshCatalog(); state.markSaved?.(); state.notify?.('success', t(state, 'catalog.ingredient.saved')); nav(state, `/configure/ingredients/${encodeURIComponent(savedIngredient.family.ingredientId)}`);
    } catch (error) { status.error(error); save.disabled = false; }
  });
  box.append(validation, status.node, element('div', { className: 'button-row' }, [element('a', { href: '/configure/ingredients', 'data-route': '', className: 'button button--secondary', text: t(state, 'common.cancel') }), save]));
  validateForm(); return box;
}

export function ingredientDetailPage(state, ingredientId, ingredientRevisionId = null) {
  const params = new URLSearchParams(location.search);
  const returnRoute = safeReturnRoute(params.get('return'), '/configure/ingredients');
  const section = page(t(state, 'catalog.ingredient.detail'), t(state, 'catalog.ingredient.detailLead'), 'INGREDIENT');
  const body = element('div', { className: 'catalog-results', 'data-testid': 'ingredient-detail' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(body);
  void Promise.all([state.catalogQuery.resolveIngredient(ingredientId, ingredientRevisionId), state.catalogQuery.ingredientHistory(ingredientId)]).then(([record, history]) => {
    if (!record) { body.replaceChildren(element('div', { className: 'empty-state', text: t(state, 'catalog.ingredient.notFound') })); return; }
    const { family, revision } = record; const n = revision.nutrition; const current = family.currentRevisionId === revision.ingredientRevisionId;
    const actions = element('div', { className: 'page-actions' }, [
      element('a', { href: returnRoute, 'data-route': '', className: 'button button--secondary context-back-link', 'data-testid': 'context-back', text: returnRoute === '/configure/ingredients' ? t(state, 'common.back') : t(state, 'navigation.backToContext') }),
      element('a', { href: `/configure/ingredients/${encodeURIComponent(ingredientId)}/edit`, 'data-route': '', className: 'button', text: t(state, 'common.edit') })
    ]);
    if (family.origin === 'user') actions.append(element('button', { className: 'button button--danger', text: t(state, 'common.archive'), onClick: async () => { if (!confirm(t(state, 'catalog.ingredient.archiveConfirm'))) return; await archiveUserIngredient(ingredientId, { repo: state.repo }); nav(state, '/configure/ingredients?origin=user'); } }));
    const group = termLabel(state, revision.taxonomy.foodGroup); const subgroup = revision.taxonomy.foodSubgroup ? termLabel(state, revision.taxonomy.foodSubgroup) : t(state, 'common.notReferenced'); const flavor = termLabel(state, revision.taxonomy.flavorProfile);
    const productCategory = termLabel(state, revision.productTaxonomy?.categoryId); const productSubcategory = termLabel(state, revision.productTaxonomy?.subcategoryId); const productConcept = termLabel(state, revision.productTaxonomy?.conceptId);
    const metrics = element('div', { className: 'summary-grid' }, [
      [t(state, 'catalog.energy100'), `${n.energyKcal} kcal`], [t(state, 'catalog.protein100'), `${n.proteinG} g`], [t(state, 'catalog.carbs100'), `${n.carbsG} g`], [t(state, 'catalog.fat100'), `${n.fatG} g`], [t(state, 'catalog.fiber100'), `${n.fiberG} g`]
    ].map(([label, value]) => element('div', { className: 'metric' }, [element('span', { text: label }), element('strong', { text: value })])));
    const taxonomy = element('dl', { className: 'detail-list' }, [
      element('div', { className: 'detail-list__wide' }, [element('dt', { text: t(state, 'catalog.productFood') }), element('dd', { text: [productCategory, productSubcategory, productConcept].filter(Boolean).join(' › ') })]),
      element('div', {}, [element('dt', { text: t(state, 'catalog.foodGroup') }), element('dd', { text: group })]),
      element('div', {}, [element('dt', { text: t(state, 'catalog.foodSubgroup') }), element('dd', { text: subgroup })]),
      element('div', {}, [element('dt', { text: t(state, 'catalog.flavorProfile') }), element('dd', { text: flavor })]),
      element('div', {}, [element('dt', { text: t(state, 'catalog.ingredientState') }), element('dd', { text: t(state, `ingredientState.${revision.basis.state}`) })]),
      element('div', {}, [element('dt', { text: t(state, 'catalog.basisUnit') }), element('dd', { text: `${revision.basis.amount} ${revision.basis.unit}` })])
    ]);
    const historyBox = element('div', { className: 'version-history' });
    for (const item of history) historyBox.append(element('a', {
      href: routeWithParams(`/configure/ingredients/${encodeURIComponent(ingredientId)}`, { revision: item.ingredientRevisionId === family.currentRevisionId ? null : item.ingredientRevisionId, return: returnRoute === '/configure/ingredients' ? null : returnRoute }),
      'data-route': '', className: `history-row${item.ingredientRevisionId === revision.ingredientRevisionId ? ' history-row--active' : ''}`
    }, [element('strong', { text: `${t(state, 'catalog.revisionNumber')} ${item.revisionNumber}` }), element('span', { text: formatDateTime(state, item.createdAt) }), element('span', { text: t(state, `catalog.origin.${item.origin}`) })]));
    body.replaceChildren(
      actions,
      element('h2', { text: localeText(state, revision.i18n, 'name') }),
      element('div', { className: 'detail-meta' }, [element('span', { className: `origin-pill origin-pill--${family.origin}`, text: t(state, `catalog.origin.${family.origin}`) }), element('span', { text: `${t(state, 'catalog.revisionNumber')} ${revision.revisionNumber}` }), current ? element('span', { className: 'status-chip status-chip--installed', text: t(state, 'catalog.currentRevision') }) : element('span', { className: 'status-chip', text: t(state, 'catalog.historicalRevision') })]),
      !current ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.historicalIngredientWarning') }) : null,
      metrics, taxonomy,
      element('h3', { text: t(state, 'catalog.mealArchetypes') }), element('p', { text: revision.taxonomy.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)).join(' · ') }),
      element('h3', { text: t(state, 'catalog.allergens') }), element('p', { text: revision.allergenIds.length ? revision.allergenIds.map(id => t(state, `allergen.${id}`)).join(', ') : t(state, 'catalog.noAllergens') }),
      element('h3', { text: t(state, 'catalog.provenance') }), element('p', { className: 'muted', text: `${revision.source?.label || '—'} · ${revision.quality?.status || '—'} / ${revision.quality?.confidence || '—'}` }),
      element('h3', { text: t(state, 'catalog.revisionHistory') }), historyBox
    );
  }).catch(error => body.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return section;
}

export function ingredientEditorPage(state, ingredientId) {
  const section = page(t(state, 'catalog.ingredient.edit'), t(state, 'catalog.ingredient.editorLead'), 'AUTHORING');
  const body = element('div', {}, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(body);
  void state.catalogQuery.resolveIngredient(ingredientId).then(record => {
    if (!record) throw new Error(t(state, 'catalog.ingredient.notFound'));
    body.replaceChildren(ingredientEditor(state, ingredientInputFromRevision(record.revision)));
  }).catch(error => body.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return section;
}

export function ingredientsPage(state) {
  const section = page(t(state, 'catalog.ingredients.title'), t(state, 'catalog.ingredients.lead'), 'INGREDIENTS'); const params = new URLSearchParams(location.search); const editorTarget = params.get('edit');
  if (params.get('new') === '1') { section.append(ingredientEditor(state)); return section; }
  if (editorTarget) { section.append(element('p', { className: 'muted', text: t(state, 'catalog.legacyEditRoute') })); queueMicrotask(() => nav(state, `/configure/ingredients/${encodeURIComponent(editorTarget)}/edit`)); return section; }
  const q = text(params.get('q') || '', { placeholder: t(state, 'catalog.ingredients.search') });
  const origin = optionSelect([['', t(state, 'catalog.filter.anyOrigin')],['base',t(state,'catalog.origin.base')],['user',t(state,'catalog.origin.user')]], params.get('origin') || '');
  const ingredientState = optionSelect([['', t(state, 'catalog.filter.anyState')], ...INGREDIENT_STATES.map(id => [id, t(state, `ingredientState.${id}`)])], params.get('state') || '');
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: params.get('food') || null, required: false });
  const form = element('form', { className: 'filter-panel filter-panel--compact' }, [
    element('div', { className: 'form-grid form-grid--2' }, [
      field(t(state, 'catalog.search.label'), q), field(t(state, 'catalog.filter.origin'), origin),
      field(t(state, 'catalog.filter.productFood'), productFood.node), field(t(state, 'catalog.filter.state'), ingredientState)
    ]),
    element('div', { className: 'button-row' }, [
      element('button', { className: 'button', type: 'submit', text: t(state, 'catalog.filter.apply') }),
      element('a', { href: '/configure/ingredients', 'data-route': '', className: 'button button--secondary', text: t(state, 'catalog.filter.clear') })
    ])
  ]);
  form.addEventListener('submit', event => {
    event.preventDefault(); const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim()); if (origin.value) p.set('origin', origin.value); if (productFood.getValue()) p.set('food', productFood.getValue()); if (ingredientState.value) p.set('state', ingredientState.value);
    nav(state, `/configure/ingredients${p.size ? `?${p}` : ''}`);
  });
  const file = element('input', { type: 'file', accept: 'application/json,.json', className: 'visually-hidden' }); const transferStatus = statusBox();
  file.addEventListener('change', async () => { try { const selected = file.files?.[0]; if (!selected) return; await importCustomCatalogExport(JSON.parse(await selected.text()), { repo: state.repo, registry: state.registry }); transferStatus.ok(t(state, 'catalog.custom.imported')); await state.refreshCatalog(); state.render(); } catch (error) { transferStatus.error(error); } finally { file.value = ''; } });
  section.append(element('div', { className: 'page-actions' }, [
    element('a', { href: '/configure/ingredients?new=1', 'data-route': '', className: 'button', text: t(state, 'catalog.ingredient.new') }),
    element('button', { className: 'button button--secondary', text: t(state, 'catalog.custom.export'), onClick: async () => downloadJson(await createCustomCatalogExport({ repo: state.repo }), `yourDietManager-personal-catalog-${new Date().toISOString().slice(0,10)}.json`) }),
    element('button', { className: 'button button--secondary', text: t(state, 'catalog.custom.import'), onClick: () => file.click() })
  ]), file, transferStatus.node, form);
  const list = element('div', { className: 'ingredient-catalog-list' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(list);
  void state.catalogQuery.listCurrentIngredients({ text: params.get('q') || '', origin: params.get('origin') || '', productFoodId: params.get('food') || '', state: params.get('state') || '' }).then(items => {
    list.replaceChildren(element('div', { className: 'results-heading' }, [element('strong', { text: t(state, 'catalog.results.count', { count: String(items.length) }) }), element('span', { className: 'muted', text: t(state, 'catalog.ingredients.filtered') })]));
    for (const item of items) {
      const n = item.revision.nutrition; const productPath = productFoodPathLabel(state.referenceDataIndex, item.revision.productTaxonomy?.conceptId, state.i18n.locale);
      const actions = element('div', { className: 'button-row' }, [
        element('a', { href: `/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.details') }),
        element('a', { href: `/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}/edit`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.edit') })
      ]);
      if (item.family.origin === 'user') actions.append(element('button', { className: 'button button--danger button--small', text: t(state, 'common.archive'), onClick: async () => { try { await archiveUserIngredient(item.family.ingredientId, { repo: state.repo }); state.notify?.('success', t(state, 'catalog.ingredient.archived')); state.render(); } catch (error) { state.notify?.('error', error.message || String(error)); } } }));
      list.append(element('article', { className: 'ingredient-card' }, [
        element('div', {}, [
          element('a', { href: `/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}`, 'data-route': '', className: 'text-link ingredient-card__title', text: localeText(state, item.revision.i18n, 'name') }),
          element('p', { className: 'muted', text: `${productPath || termLabel(state, item.revision.taxonomy.foodGroup)} · ${t(state, `ingredientState.${item.revision.basis.state}`)} · ${t(state, `catalog.origin.${item.family.origin}`)}` })
        ]),
        element('div', { className: 'recipe-metrics' }, [element('span', { text: `${n.energyKcal} kcal` }), element('span', { text: `${n.proteinG} g ${t(state, 'nutrient.protein')}` }), element('span', { text: `${n.fiberG} g ${t(state, 'nutrient.fiber')}` })]), actions
      ]));
    }
    if (!items.length) list.append(element('div', { className: 'empty-state', text: t(state, 'catalog.ingredients.empty') }));
  }).catch(error => list.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return section;
}
