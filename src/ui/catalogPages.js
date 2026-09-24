import { setRecipeFavorite } from '../services/productExtensionService.js';
import { ingredientPresentation } from '../domain/ingredientPresentation.js';
import { assertRecipeTitle, ingredientWeightG } from '../domain/recipePresentation.js';
import { calculateIngredientNutritionBreakdown, calculateRecipeNutrition, normalizeIngredientAmount } from '../domain/nutritionCore.js';
import { element } from './dom.js';
import { ALLERGEN_IDS, INGREDIENT_STATES, MEAL_ARCHETYPES } from '../domain/catalogEnums.js';
import { archiveUserIngredient, archiveUserRecipe, duplicateRecipeToDraft, recipeToDraft, saveIngredient, saveRecipe } from '../services/personalCatalogService.js';
import { createCustomCatalogExport, importCustomCatalogExport } from '../services/customCatalogTransfer.js';
import { RECIPE_TAG_TAXONOMY, TAXONOMY_IDS } from '../services/referenceDataService.js';
import {
  createAutocomplete, createIngredientPicker, createHierarchicalFoodCategorySelector, createMealArchetypePicker, createMultiSelectChips, createProductFoodPicker, createTokenChips,
  ingredientChoices, productFoodPathLabel, taxonomyChoices, unitsForIngredientRevision
} from './guidedControls.js';
import { controlledDetails, signalDraftChange } from './uiState.js';
import { REVIEW_DIMENSIONS, expectedReviewRecipeVersionIds, isProductionReviewManifest } from '../services/recipeHumanReviewService.js';
import { suggestIngredientSubstitutions, applyIngredientSubstitution } from '../services/nutritionalAffinityService.js';

function t(state, key, vars = {}) { let value = state.i18n.t(key); for (const [name, replacement] of Object.entries(vars)) value = value.replace(`{${name}}`, replacement); return value; }
function nav(state, url) { return state.navigate(url); }
function field(label, control, hint = '') { return element('label', { className: 'field' }, [element('span', { text: label }), control, hint ? element('small', { className: 'field__hint', text: hint }) : null]); }
function number(value = '', attrs = {}) { return element('input', { type: 'number', value: value ?? '', ...attrs }); }
function text(value = '', attrs = {}) { return element('input', { type: 'text', value: value ?? '', ...attrs }); }
function check(label, checked = false) { return element('label', { className: 'check-field' }, [element('input', { type: 'checkbox', checked }), element('span', { text: label })]); }
function optionSelect(options, value = '') { const select = element('select'); for (const [v, label] of options) select.append(element('option', { value: v, text: label })); select.value = value; return select; }
function downloadJson(fileDocument, filename) { const blob = new Blob([JSON.stringify(fileDocument, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = element('a', { href: url, download: filename }); globalThis.document.body?.append?.(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function localeText(state, object, key = 'title') { return object?.[state.i18n.locale]?.[key] || object?.en?.[key] || object?.it?.[key] || '—'; }
function termLabel(state, termId) { const term = state.referenceDataIndex?.term?.(termId); return term?.i18n?.[state.i18n.locale]?.label || term?.i18n?.en?.label || term?.i18n?.it?.label || termId; }
const RECIPE_TAG_GROUPS = [
  ['families', 'catalog.tags.families'], ['cuisines', 'catalog.tags.cuisines'], ['diet', 'catalog.tags.diet'],
  ['flavor', 'catalog.tags.flavor'], ['practical', 'catalog.tags.practical'], ['preparation', 'catalog.tags.preparation']
];
function chipList(labels, className = 'chip-list') {
  return element('div', { className }, labels.map(label => element('span', { className: 'chip', text: label })));
}
function semanticTagGroups(state, version) {
  const groups = RECIPE_TAG_GROUPS.map(([key, labelKey]) => ({ label: t(state, labelKey), values: (version?.tags?.[key] || []).map(id => termLabel(state, id)) })).filter(group => group.values.length);
  if (!groups.length) return element('span', { className: 'muted', text: t(state, 'catalog.tags.none') });
  return element('div', { className: 'semantic-groups' }, groups.map(group => element('section', { className: 'semantic-group' }, [element('h4', { className: 'semantic-group__label', text: group.label }), chipList(group.values)])));
}

function nutritionNumber(state, value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(state.i18n.locale, { maximumFractionDigits }).format(Number(value || 0));
}
function nutritionContributionCell(state, value, share, unit = 'g') {
  const percentage = share == null ? '—' : `${nutritionNumber(state, share)}%`;
  return element('td', { className: 'ingredient-nutrition-table__number' }, [
    element('strong', { text: `${nutritionNumber(state, value)}${unit === 'kcal' ? ' kcal' : ` ${unit}`}` }),
    element('small', { className: 'muted', text: percentage })
  ]);
}
function recipeIngredientNutritionTable(state, version, ingredientLines, returnRoute, { allowSubstitution = false, onSubstitute = null } = {}) {
  const revisionById = new Map(ingredientLines.filter(line => line.ingredientRevision).map(line => [line.ingredientRevisionId, line.ingredientRevision]));
  const breakdown = calculateIngredientNutritionBreakdown(version.ingredientLines, revisionById, version.calculatedNutrition);
  const enrichedByRevision = new Map(ingredientLines.map(line => [line.ingredientRevisionId, line]));
  const table = element('table', { className: 'ingredient-nutrition-table', 'data-testid': 'ingredient-nutrition-breakdown' });
  table.append(element('thead', {}, [element('tr', {}, [
    element('th', { scope: 'col', text: t(state, 'catalog.ingredient.select') }),
    element('th', { scope: 'col', text: t(state, 'catalog.ingredient.amount') }),
    element('th', { scope: 'col', text: 'kcal' }),
    element('th', { scope: 'col', text: t(state, 'nutrient.protein') }),
    element('th', { scope: 'col', text: t(state, 'nutrient.carbs') }),
    element('th', { scope: 'col', text: t(state, 'nutrient.fat') }),
    element('th', { scope: 'col', text: t(state, 'nutrient.fiber') }),
    allowSubstitution ? element('th', { scope: 'col', text: t(state, 'catalog.substitution.action') }) : null
  ])]));
  const body = element('tbody');
  for (const item of breakdown) {
    const line = enrichedByRevision.get(item.ingredientRevisionId); const revision = line?.ingredientRevision;
    const presentation = ingredientPresentation(revision, state.referenceDataIndex, state.i18n.locale);
    body.append(element('tr', {}, [
      element('td', { className: 'ingredient-nutrition-table__ingredient' }, [
        element('a', { href: routeWithParams(`/configure/ingredients/${encodeURIComponent(item.ingredientId)}`, { revision: item.ingredientRevisionId, return: returnRoute }), 'data-route': '', className: 'text-link', 'data-testid': 'recipe-ingredient-link', text: revision ? presentation.name : item.ingredientId }),
        revision ? element('small', { className: 'muted', text: `${presentation.variant} · ${presentation.weighing}` }) : null
      ]),
      element('td', { text: `${item.amount} ${item.unit}` }),
      nutritionContributionCell(state, item.nutrition.energyKcal, item.sharePercent.energyKcal, 'kcal'),
      nutritionContributionCell(state, item.nutrition.proteinG, item.sharePercent.proteinG),
      nutritionContributionCell(state, item.nutrition.carbsG, item.sharePercent.carbsG),
      nutritionContributionCell(state, item.nutrition.fatG, item.sharePercent.fatG),
      nutritionContributionCell(state, item.nutrition.fiberG, item.sharePercent.fiberG),
      allowSubstitution ? element('td', {}, [element('button', { type: 'button', className: 'button button--secondary button--small', 'data-testid': 'ingredient-substitution-open', text: t(state, 'catalog.substitution.action'), onClick: () => onSubstitute?.(item.index) })]) : null
    ]));
  }
  table.append(body, element('tfoot', {}, [element('tr', {}, [
    element('th', { scope: 'row', text: t(state, 'catalog.recipe.total') }), element('td', { text: '—' }),
    nutritionContributionCell(state, version.calculatedNutrition.energyKcal, 100, 'kcal'),
    nutritionContributionCell(state, version.calculatedNutrition.proteinG, 100),
    nutritionContributionCell(state, version.calculatedNutrition.carbsG, 100),
    nutritionContributionCell(state, version.calculatedNutrition.fatG, 100),
    nutritionContributionCell(state, version.calculatedNutrition.fiberG, 100),
    allowSubstitution ? element('td') : null
  ])]));
  return element('div', { className: 'ingredient-nutrition-breakdown' }, [
    element('p', { className: 'muted', text: t(state, 'catalog.recipe.nutritionBreakdownHelp') }), table
  ]);
}
function signedNutrition(state, value, unit = 'g') {
  const number = Number(value || 0); const sign = number > 0 ? '+' : '';
  return `${sign}${nutritionNumber(state, number)}${unit === 'kcal' ? ' kcal' : ` ${unit}`}`;
}
function nutritionDeltaGrid(state, delta = {}) {
  return element('div', { className: 'nutrition-delta-grid' }, [
    ['kcal', delta.energyKcal, 'kcal'], [t(state, 'nutrient.protein'), delta.proteinG, 'g'], [t(state, 'nutrient.carbs'), delta.carbsG, 'g'], [t(state, 'nutrient.fat'), delta.fatG, 'g'], [t(state, 'nutrient.fiber'), delta.fiberG, 'g']
  ].map(([label, value, unit]) => element('span', { className: Number(value || 0) > 0 ? 'nutrition-delta nutrition-delta--positive' : Number(value || 0) < 0 ? 'nutrition-delta nutrition-delta--negative' : 'nutrition-delta' }, [element('small', { text: label }), element('strong', { text: signedNutrition(state, value, unit) })])));
}
function openIngredientSubstitutionDialog(state, { recipeId, recipeVersionId, lineIndex }) {
  const dialog = element('dialog', { className: 'replacement-dialog ingredient-substitution-dialog', 'aria-label': t(state, 'catalog.substitution.title') });
  const shell = element('section', { className: 'plan-action-card plan-action-card--accent', 'aria-busy': 'true' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); dialog.append(shell); document.body.append(dialog);
  const close = () => { try { dialog.close(); } catch {} dialog.remove(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (shell.getAttribute('aria-busy') !== 'true') close(); }); dialog.showModal();
  const render = async ({ query = '', offset = 0 } = {}) => {
    shell.setAttribute('aria-busy', 'true');
    try {
      const preview = await suggestIngredientSubstitutions({ recipeVersionId, lineIndex, query, offset, limit: 8 }, { repo: state.repo });
      const search = element('input', { type: 'search', value: query, placeholder: t(state, 'catalog.substitution.search') });
      const list = element('div', { className: 'replacement-list' });
      for (const item of preview.candidates) {
        const presentation = ingredientPresentation(item.ingredient, state.referenceDataIndex, state.i18n.locale);
        const article = element('article', { className: 'replacement-card ingredient-substitution-card' });
        const warningParts = [];
        if (item.stateMismatch) warningParts.push(t(state, 'catalog.substitution.stateWarning'));
        if (item.newAllergenIds.length) warningParts.push(`${t(state, 'catalog.substitution.newAllergens')}: ${item.newAllergenIds.map(id => t(state, `allergen.${id}`)).join(', ')}`);
        article.append(element('div', {}, [
          element('strong', { text: presentation.name }),
          element('p', { className: 'muted', text: `${presentation.variant} · ${Math.round(item.affinityScore)}% ${t(state, 'catalog.substitution.affinity').toLowerCase()}` }),
          element('p', { text: `${t(state, 'catalog.substitution.amount')}: ${nutritionNumber(state, item.proposedLine.amount)} ${item.proposedLine.unit}` }),
          element('p', { className: 'muted', text: t(state, 'catalog.substitution.deltaHelp') }), nutritionDeltaGrid(state, item.recipeDelta),
          warningParts.length ? element('p', { className: 'validation-box validation-box--warning', text: warningParts.join(' · ') }) : null
        ]));
        const temporary = element('button', { type: 'button', className: 'button button--small', 'data-testid': 'ingredient-substitution-apply', text: t(state, 'catalog.substitution.applyTemporary'), onClick: () => {
          state.catalogUi ||= {}; state.catalogUi.temporaryRecipeSubstitutions ||= {};
          state.catalogUi.temporaryRecipeSubstitutions[recipeVersionId] = { lineIndex, candidate: structuredClone(item) };
          close(); state.notify?.('success', t(state, 'catalog.substitution.temporaryApplied')); state.render();
        } });
        const saveVersion = element('button', { type: 'button', className: 'button button--secondary button--small', 'data-testid': 'ingredient-substitution-save-version', text: t(state, 'catalog.substitution.saveVersion'), onClick: async event => {
          const newName = globalThis.prompt?.(t(state, 'catalog.substitution.newNamePrompt'), '')?.trim();
          if (!newName) { state.notify?.('error', t(state, 'catalog.substitution.newNameRequired')); return; }
          const button = event.currentTarget; button.disabled = true; shell.setAttribute('aria-busy', 'true');
          try {
            const result = await applyIngredientSubstitution({ recipeId, recipeVersionId, lineIndex, candidateIngredientRevisionId: item.ingredient.ingredientRevisionId, amount: item.proposedLine.amount, newName, locale: state.i18n.locale }, { repo: state.repo, registry: state.registry });
            state.catalogUi ||= {}; state.catalogUi.temporaryRecipeSubstitutions ||= {}; delete state.catalogUi.temporaryRecipeSubstitutions[recipeVersionId];
            await state.refreshCatalog(); close(); state.notify?.('success', t(state, 'catalog.substitution.saved')); nav(state, `/recipes/${encodeURIComponent(result.family.recipeId)}`);
          } catch (error) { state.notify?.('error', error.message || String(error)); button.disabled = false; shell.setAttribute('aria-busy', 'false'); }
        } });
        article.append(element('div', { className: 'button-row' }, [temporary, saveVersion])); list.append(article);
      }
      if (!preview.candidates.length) list.append(element('div', { className: 'empty-state', text: t(state, 'catalog.substitution.empty') }));
      const pages = element('div', { className: 'button-row' });
      if (preview.offset > 0) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.previous'), onClick: () => render({ query: search.value.trim(), offset: Math.max(0, preview.offset - preview.limit) }) }));
      if (preview.hasMore) pages.append(element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.next'), onClick: () => render({ query: search.value.trim(), offset: preview.offset + preview.limit }) }));
      shell.replaceChildren(
        element('div', { className: 'section-heading' }, [element('div', {}, [element('h2', { text: t(state, 'catalog.substitution.title') }), element('p', { className: 'muted', text: t(state, 'catalog.substitution.body') })]), element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'common.cancel'), onClick: close })]),
        element('div', { className: 'form-grid form-grid--2' }, [field(t(state, 'catalog.substitution.searchLabel'), search), element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'catalog.substitution.searchAction'), onClick: () => render({ query: search.value.trim(), offset: 0 }) })]),
        list, pages
      ); shell.setAttribute('aria-busy', 'false');
    } catch (error) { shell.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) }), element('button', { type: 'button', className: 'button button--secondary', text: t(state, 'common.cancel'), onClick: close })); shell.setAttribute('aria-busy', 'false'); }
  };
  void render();
}

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

function taxonomyFilter(state, params, paramKey, taxonomyId, anyKey) {
  const choices = taxonomyChoices(state.referenceDataIndex, taxonomyId, state.i18n.locale);
  return optionSelect([['', t(state, anyKey)], ...choices.map(choice => [choice.id, choice.label])], params.get(paramKey) || '');
}

function recipeFilters(state) {
  const params = new URLSearchParams(location.search); const form = element('form', { className: 'filter-panel' });
  const favorites=check(state.i18n.locale==='it'?'Solo preferiti':'Favorites only',params.get('favorites')==='1');form.append(favorites);
  const q = text(params.get('q') || '', { placeholder: t(state, 'catalog.search.placeholder') });
  const meal = optionSelect([['', t(state, 'catalog.filter.anyMeal')], ...MEAL_ARCHETYPES.map(id => [id, t(state, `mealArchetype.${id}`)])], params.get('meal') || '');
  const origin = optionSelect([['', t(state, 'catalog.filter.anyOrigin')], ['base', t(state, 'catalog.origin.base')], ['user', t(state, 'catalog.origin.user')]], params.get('origin') || '');
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: params.get('food') || null, required: false });
  const family = taxonomyFilter(state, params, 'family', RECIPE_TAG_TAXONOMY.families, 'catalog.filter.anyFamily');
  const cuisine = taxonomyFilter(state, params, 'cuisine', RECIPE_TAG_TAXONOMY.cuisines, 'catalog.filter.anyCuisine');
  const diet = taxonomyFilter(state, params, 'diet', RECIPE_TAG_TAXONOMY.diet, 'catalog.filter.anyDiet');
  const flavor = taxonomyFilter(state, params, 'flavor', RECIPE_TAG_TAXONOMY.flavor, 'catalog.filter.anyFlavor');
  const practical = taxonomyFilter(state, params, 'practical', RECIPE_TAG_TAXONOMY.practical, 'catalog.filter.anyPractical');
  const preparation = taxonomyFilter(state, params, 'preparation', RECIPE_TAG_TAXONOMY.preparation, 'catalog.filter.anyPreparation');
  const energyMin = number(params.get('emin') || '', { min: 0, step: 50, placeholder: 'min' }); const energyMax = number(params.get('emax') || '', { min: 0, step: 50, placeholder: 'max' });
  const proteinMin = number(params.get('pmin') || '', { min: 0, step: 5 }); const fiberMin = number(params.get('fmin') || '', { min: 0, step: 1 }); const prepMax = number(params.get('prep') || '', { min: 0, step: 5 });
  const pack = optionSelect([['', t(state, 'catalog.filter.anyPack')]], params.get('pack') || '');
  state.catalogPacks.filter(item => item.status === 'installed').forEach(item => pack.append(element('option', { value: item.packId, text: t(state, item.labelKey) }))); pack.value = params.get('pack') || '';
  const allergens = element('div', { className: 'compact-checks' }); const selectedAllergens = new Set((params.get('allergens') || '').split(',').filter(Boolean));
  const allergenChecks = ALLERGEN_IDS.map(id => { const c = check(t(state, `allergen.${id}`), selectedAllergens.has(id)); allergens.append(c); return [id, c.querySelector('input')]; });
  const taxonomyOpen = ['family','cuisine','diet','flavor','practical','preparation'].some(key => params.get(key));
  form.append(
    element('div', { className: 'form-grid form-grid--3' }, [
      field(t(state, 'catalog.search.label'), q), field(t(state, 'catalog.filter.meal'), meal), field(t(state, 'catalog.filter.origin'), origin),
      field(t(state, 'catalog.filter.productFood'), productFood.node), field(t(state, 'catalog.filter.pack'), pack)
    ]),
    controlledDetails(state, 'recipes-filter-taxonomy', { className: 'filter-details', defaultOpen: taxonomyOpen, children: [
      element('summary', { text: t(state, 'catalog.filter.taxonomy') }),
      element('div', { className: 'form-grid form-grid--3 filter-details__grid' }, [
        field(t(state, 'catalog.tags.families'), family), field(t(state, 'catalog.tags.cuisines'), cuisine), field(t(state, 'catalog.tags.diet'), diet),
        field(t(state, 'catalog.tags.flavor'), flavor), field(t(state, 'catalog.tags.practical'), practical), field(t(state, 'catalog.tags.preparation'), preparation)
      ])
    ] })
  );
  const metrics = element('div', { className: 'form-grid form-grid--5' }, [field(t(state, 'catalog.filter.energyMin'), energyMin), field(t(state, 'catalog.filter.energyMax'), energyMax), field(t(state, 'catalog.filter.proteinMin'), proteinMin), field(t(state, 'catalog.filter.fiberMin'), fiberMin), field(t(state, 'catalog.filter.prepMax'), prepMax)]); form.append(metrics, controlledDetails(state, 'recipes-filter-allergens', { className: 'filter-details', defaultOpen: false, children: [element('summary', { text: t(state, 'catalog.filter.excludeAllergens') }), allergens] }));
  form.append(element('div', { className: 'button-row' }, [element('button', { className: 'button', type: 'submit', text: t(state, 'catalog.filter.apply') }), element('a', { href: '/recipes', 'data-route': '', className: 'button button--secondary', text: t(state, 'catalog.filter.clear') })]));
  form.addEventListener('submit', event => {
    event.preventDefault(); const next = new URLSearchParams();if(favorites.querySelector('input').checked)next.set('favorites','1');
    if (q.value.trim()) next.set('q', q.value.trim()); if (meal.value) next.set('meal', meal.value); if (origin.value) next.set('origin', origin.value); if (pack.value) next.set('pack', pack.value);
    if (productFood.getValue()) next.set('food', productFood.getValue()); if (family.value) next.set('family', family.value); if (cuisine.value) next.set('cuisine', cuisine.value); if (diet.value) next.set('diet', diet.value); if (flavor.value) next.set('flavor', flavor.value); if (practical.value) next.set('practical', practical.value); if (preparation.value) next.set('preparation', preparation.value);
    if (energyMin.value) next.set('emin', energyMin.value); if (energyMax.value) next.set('emax', energyMax.value); if (proteinMin.value) next.set('pmin', proteinMin.value); if (fiberMin.value) next.set('fmin', fiberMin.value); if (prepMax.value) next.set('prep', prepMax.value);
    const ids = allergenChecks.filter(([, input]) => input.checked).map(([id]) => id); if (ids.length) next.set('allergens', ids.join(',')); nav(state, `/recipes${next.size ? `?${next}` : ''}`);
  });
  return form;
}

function queryFromLocation() { const p = new URLSearchParams(location.search); return { favoritesOnly:p.get('favorites')==='1', text: p.get('q') || '', mealArchetype: p.get('meal') || '', origin: p.get('origin') || '', packId: p.get('pack') || '', productFoodId: p.get('food') || '', familyTag: p.get('family') || '', cuisineTag: p.get('cuisine') || '', dietTag: p.get('diet') || '', flavorTag: p.get('flavor') || '', practicalTag: p.get('practical') || '', preparationTag: p.get('preparation') || '', energyMin: p.get('emin'), energyMax: p.get('emax'), proteinMin: p.get('pmin'), fiberMin: p.get('fmin'), prepMax: p.get('prep'), excludeAllergens: (p.get('allergens') || '').split(',').filter(Boolean), offset: p.get('offset') || 0, limit: 50 }; }

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
    results.replaceChildren(element('div', { className: 'results-heading' }, [element('strong', { 'data-testid': 'recipe-result-count', 'data-count': String(result.total), text: t(state, 'catalog.results.count', { count: String(result.total) }) }), element('span', { className: 'muted', text: t(state, 'catalog.results.indexed') })]));
    const grid = element('div', { className: 'recipe-grid' });
    for (const recipe of result.items) {
      const n = recipe.calculatedNutrition; grid.append(element('a', { href: routeWithParams(`/recipes/${encodeURIComponent(recipe.recipeId)}`, { return: `/recipes${location.search}` }), 'data-route': '', 'data-testid': 'recipe-card', className: 'recipe-card' }, [
        element('div', { className: 'recipe-card__top' }, [element('strong', { text: localeText(state, recipe.i18n) }), element('div', { className: 'recipe-card__badges' }, [element('span', { className: `origin-pill origin-pill--${recipe.origin}`, text: t(state, `catalog.origin.${recipe.origin}`) }), isProductionReviewManifest(state.catalogManifest) ? element('span', { className: `status-chip status-chip--review-${reviewMap.get(recipe.recipeVersionId)?.decision || 'unreviewed'}`, text: t(state, `review.status.${reviewMap.get(recipe.recipeVersionId)?.decision || 'unreviewed'}`) }) : null])]),
        element('p', { className: 'muted', text: recipe.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)).join(' · ') }),
        element('div', { className: 'chip-list chip-list--compact' }, (productFacets.get(recipe.recipeVersionId)?.categoryIds || []).slice(0, 4).map(id => element('span', { className: 'chip chip--taxonomy', text: termLabel(state, id) }))),
        element('div', { className: 'recipe-metrics' }, [element('span', { text: `${Math.round(n.energyKcal)} kcal` }), element('span', { text: `${n.proteinG} g ${t(state, 'nutrient.protein')}` }), element('span', { text: `${n.fiberG} g ${t(state, 'nutrient.fiber')}` }), element('span', { text: recipe.practicalEvidence?.status === 'unverified' ? t(state, 'r2.practical.unverified') : `${recipe.practical.prepMinutes} min` })]), element('span', { className: 'recipe-card__action', text: t(state, 'common.details') })
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
    const { family } = record; let version = record.version; let ingredientLines = record.ingredientLines; const current = family.currentVersionId === version.recipeVersionId;
    const temporaryEdit = state.catalogUi?.temporaryRecipeSubstitutions?.[version.recipeVersionId];
    if (temporaryEdit && Number.isInteger(temporaryEdit.lineIndex) && temporaryEdit.candidate) {
      const candidate = temporaryEdit.candidate; const index = temporaryEdit.lineIndex;
      const nextLines = version.ingredientLines.map((line, lineIndex) => lineIndex === index ? structuredClone(candidate.proposedLine) : structuredClone(line));
      version = { ...structuredClone(version), ingredientLines: nextLines, calculatedNutrition: structuredClone(candidate.recipeNutrition) };
      ingredientLines = ingredientLines.map((line, lineIndex) => lineIndex === index ? { ...structuredClone(line), ...structuredClone(candidate.proposedLine), ingredientRevision: structuredClone(candidate.ingredient), ingredientRevisionId: candidate.ingredient.ingredientRevisionId, ingredientId: candidate.ingredient.ingredientId } : line);
    }
    const n = version.calculatedNutrition;
    const actions = element('div', { className: 'page-actions' });
    actions.append(element('a', { href: returnRoute, 'data-route': '', className: 'button button--secondary context-back-link', 'data-testid': 'context-back', text: returnRoute === '/recipes' ? t(state, 'common.back') : t(state, 'navigation.backToContext') }));
    const favorite=Boolean(await state.repo.get('recipeFavorites',recipeId));
    actions.append(element('button',{type:'button',className:'button button--secondary','aria-pressed':String(favorite),'data-testid':'recipe-favorite',text:state.i18n.locale==='it'?(favorite?'Rimuovi preferito':'Aggiungi ai preferiti'):(favorite?'Remove favorite':'Add favorite'),onClick:async event=>{const button=event.currentTarget;button.disabled=true;try{await setRecipeFavorite(recipeId,!favorite,{repo:state.repo,registry:state.registry});state.render();}catch(error){state.notify?.('error',error.message);button.disabled=false;}}}));
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
    const ingredientNutrition = recipeIngredientNutritionTable(state, version, ingredientLines, selfRoute, { allowSubstitution: current, onSubstitute: lineIndex => openIngredientSubstitutionDialog(state, { recipeId: family.recipeId, recipeVersionId: version.recipeVersionId, lineIndex }) });
    const tagBox = semanticTagGroups(state, version);
    const historyBox = element('div', { className: 'version-history' });
    for (const item of history) historyBox.append(element('a', {
      href: currentRecipeRoute(recipeId, item.recipeVersionId === family.currentVersionId ? null : item.recipeVersionId, returnRoute === '/recipes' ? null : returnRoute),
      'data-route': '', className: `history-row${item.recipeVersionId === version.recipeVersionId ? ' history-row--active' : ''}`
    }, [element('strong', { text: `${t(state, 'catalog.versionNumber')} ${item.versionNumber}` }), element('span', { text: formatDateTime(state, item.createdAt) }), element('span', { text: t(state, `catalog.origin.${item.origin}`) })]));
    body.replaceChildren(
      actions, title, versionMeta, desc,
      !current ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.historicalWarning') }) : null,
      temporaryEdit ? element('div', { className: 'validation-box validation-box--warning', 'data-testid': 'temporary-ingredient-substitution', text: t(state, 'catalog.substitution.temporaryBanner') }) : null,
      temporaryEdit ? element('button', { type: 'button', className: 'button button--secondary button--small', text: t(state, 'catalog.substitution.resetTemporary'), onClick: () => { delete state.catalogUi.temporaryRecipeSubstitutions[version.recipeVersionId]; state.render(); } }) : null,
      !record.installed && version.origin === 'base' ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.recipe.packNotInstalled') }) : null,
      metrics, element('p', { className: 'muted', text: `${t(state, 'r2.ingredientWeight')}: ${ingredientWeightG(version.ingredientLines) ?? '—'} g · ${t(state, 'r2.finalWeight')}: ${version.practical.finalWeightG ?? '—'} g` }),
      element('h3', { text: t(state, 'catalog.recipe.nutritionBreakdown') }), ingredientNutrition,
      element('h3', { text: t(state, 'catalog.semanticData') }), tagBox,
      element('div', { className: 'semantic-groups semantic-groups--summary' }, [
        element('section', { className: 'semantic-group' }, [element('h4', { className: 'semantic-group__label', text: t(state, 'catalog.mealArchetypes') }), chipList(version.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)))]),
        element('section', { className: 'semantic-group' }, [element('h4', { className: 'semantic-group__label', text: t(state, 'catalog.practicalData') }), chipList([version.practicalEvidence?.status === 'unverified' ? t(state, 'r2.practical.unverified') : `${version.practical.prepMinutes + version.practical.cookMinutes} min`, version.practical.eatingMinutes != null ? `${t(state, 'catalog.eatingMinutes')}: ${version.practical.eatingMinutes} min` : null].filter(Boolean))]),
        element('section', { className: 'semantic-group' }, [element('h4', { className: 'semantic-group__label', text: t(state, 'catalog.allergens') }), chipList(version.allergenIds.length ? version.allergenIds.map(id => t(state, `allergen.${id}`)) : [t(state, 'r2.safety.unverified')])])
      ]),
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
  const titleIt = text(draft.titleIt, { minlength: 5, maxlength: 70 }), titleEn = text(draft.titleEn, { minlength: 5, maxlength: 70 });
  const descIt = element('textarea', { rows: 2 }); descIt.value = draft.descriptionIt || '';
  const descEn = element('textarea', { rows: 2 }); descEn.value = draft.descriptionEn || '';
  section.append(element('div', { className: 'form-grid form-grid--2' }, [
    field(t(state, 'r2.title'), titleIt), field(t(state, 'r2.titleEn'), titleEn, t(state, 'r2.enFallback')), field(t(state, 'r2.description'), descIt), field(t(state, 'r2.descriptionEn'), descEn)
  ]));

  const archetypePicker = createMealArchetypePicker(state, draft.mealArchetypes || [], { onChange: validateForm });
  section.append(element('h3', { text: t(state, 'catalog.mealArchetypes') }), element('p', { className: 'muted', text: t(state, 'guided.mealArchetype.help') }), archetypePicker.node);

  const linesBox = element('div', { className: 'ingredient-editor-lines' }); const lineRows = [];
  const ingredientById = new Map(ingredients.map(item => [item.family.ingredientId, item]));
  const revisionFor = (ingredientId, revisionId = null) => historicalRevisions.get(revisionId) || ingredientById.get(ingredientId)?.revision || null;
  const addLine = source => {
    const row = element('div', { className: 'ingredient-line-editor ingredient-line-editor--guided' });
    const amount = number(source?.amount ?? 100, { min: .01, step: .01 });
    const unitHost = element('div');
    const optional = check(t(state, 'catalog.optional'), Boolean(source?.optional));
    const entry = { row, ingredient: null, amount, unit: null, unitHost, optional: optional.querySelector('input'), revisionId: source?.ingredientRevisionId || null, revision: revisionFor(source?.ingredientId, source?.ingredientRevisionId) };
    const renderUnit = preferred => {
      unitHost.replaceChildren(); const choices = unitsForIngredientRevision(entry.revision, state.ingredientConversions || []);
      const select = optionSelect(choices.map(choice => [choice.id, choice.label]), choices.some(choice => choice.id === preferred) ? preferred : choices[0]?.id || '');
      select.disabled = choices.length === 0; entry.unit = select;
      const presentation = ingredientPresentation(entry.revision, state.referenceDataIndex, state.i18n.locale);
      unitHost.append(field(t(state, 'catalog.ingredient.unit'), select), element('small', { text: `${presentation.variant} · ${presentation.weighing} · ${entry.revisionId || ''}` }));
      select.addEventListener('change', validateForm); validateForm();
    };
    entry.ingredient = createIngredientPicker(state, state.referenceDataIndex, {
      mode: 'variant', items: ingredients, value: source?.ingredientId || null, required: true,
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

  const prep = number(draft.prepMinutes ?? 0, { min: 0 }), cook = number(draft.cookMinutes ?? 0, { min: 0 }), eating = number(draft.eatingMinutes ?? '', { min: 0 });
  const practicalChecks = [['reheatingRequired','catalog.practical.reheat'],['coldSuitable','catalog.practical.cold'],['portable','catalog.practical.portable'],['fridgeRequired','catalog.practical.fridge'],['freezerSuitable','catalog.practical.freezer'],['mealPrepSuitable','catalog.practical.mealPrep']].map(([key, label]) => [key, check(t(state, label), Boolean(draft[key]))]);
  section.append(element('div', { className: 'form-grid form-grid--3' }, [field(t(state, 'catalog.prepMinutes'), prep), field(t(state, 'catalog.cookMinutes'), cook), field(t(state, 'catalog.eatingMinutes'), eating, t(state, 'catalog.eatingMinutesHint'))]), element('div', { className: 'compact-checks' }, practicalChecks.map(([, c]) => c)));

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
  section.append(controlledDetails(state, 'recipe-editor-advanced', { children: [element('summary', { text: state.i18n.locale === 'it' ? 'Avanzate · classificazione' : 'Advanced · classification' }), tagGrid] }));

  save = element('button', { className: 'button', text: t(state, 'common.save') });
  function validateForm() {
    if (!save) return false;
    const errors = [];
    if (!titleIt.value.trim() && !titleEn.value.trim()) errors.push(t(state, 'catalog.validation.title'));
    try { assertRecipeTitle(titleIt.value || titleEn.value); if (titleEn.value.trim()) assertRecipeTitle(titleEn.value); } catch (error) { errors.push(error.message); }
    if (!archetypePicker.validate()) errors.push(t(state, 'guided.mealArchetype.required'));
    if (prep.value === '' || cook.value === '' || !Number.isInteger(Number(prep.value)) || !Number.isInteger(Number(cook.value)) || Number(prep.value) < 0 || Number(cook.value) < 0 || (eating.value !== '' && (!Number.isInteger(Number(eating.value)) || Number(eating.value) < 0))) errors.push(t(state, 'r2.practical.required'));
    if (!lineRows.length) errors.push(t(state, 'catalog.validation.ingredientRequired'));
    for (const row of lineRows) {
      if (!row.ingredient.getValue()) errors.push(t(state, 'catalog.validation.ingredientRequired'));
      if (!(Number(row.amount.value) > 0)) errors.push(t(state, 'catalog.validation.amount'));
      if (!row.unit?.value) errors.push(t(state, 'catalog.validation.unit'));
    }
    try {
      if (lineRows.every(row => row.revision && row.ingredient.getValue() && Number(row.amount.value) > 0 && row.unit?.value)) {
        const lines = lineRows.map(row => ({ ingredientId: row.revision.ingredientId, ingredientRevisionId: row.revisionId, ...normalizeIngredientAmount(row.revision, row.amount.value, row.unit.value, { conversions: state.ingredientConversions || [] }) }));
        const nutrition = calculateRecipeNutrition(lines, new Map(lineRows.map(row => [row.revisionId, row.revision])));
        nutritionPreview.textContent = `${t(state, 'r2.nutritionPreview')}: ${nutrition.energyKcal} kcal · ${nutrition.proteinG} g ${t(state, 'nutrient.protein')}${draft.originalNutrition ? ` · ${t(state, 'r2.previousEnergy')}: ${draft.originalNutrition.energyKcal} kcal` : ''}`;
      } else nutritionPreview.textContent = t(state, 'r2.variant.required');
    } catch (error) { errors.push(error.message); }
    validation.className = errors.length ? 'validation-box validation-box--error' : 'validation-box';
    validation.textContent = errors.length ? [...new Set(errors)].join(' · ') : t(state, 'catalog.validation.ready');
    save.disabled = errors.length > 0; return !errors.length;
  }
  for (const control of [titleIt, titleEn, prep, cook, eating]) control.addEventListener('input', validateForm);
  save.addEventListener('click', async () => {
    if (!validateForm()) return;
    try {
      save.disabled = true;
      const ingredientLines = lineRows.map(row => ({ ingredientId: row.ingredient.getValue(), ingredientRevisionId: row.revisionId, amount: Number(row.amount.value), unit: row.unit.value, optional: row.optional.checked }));
      const payload = {
        recipeId: existingId, titleIt: titleIt.value, titleEn: titleEn.value, descriptionIt: descIt.value, descriptionEn: descEn.value,
        schemaVersion: 2, mealArchetypes: archetypePicker.getValues(), ingredientLines,
        prepMinutes: prep.value, cookMinutes: cook.value, eatingMinutes: eating.value,
        families: taxonomyControls.families.getValues(), cuisines: taxonomyControls.cuisines.getValues(), diet: taxonomyControls.diet.getValues(),
        flavor: taxonomyControls.flavor.getValues(), practicalTags: taxonomyControls.practicalTags.getValues(), preparationTags: taxonomyControls.preparationTags.getValues()
      };
      for (const [key, control] of practicalChecks) payload[key] = control.querySelector('input').checked;
      const saved = await saveRecipe(payload, { repo: state.repo, registry: state.registry }); await state.refreshCatalog(); state.markSaved?.(); state.notify?.('success', t(state, 'catalog.recipe.saved')); nav(state, `/recipes/${encodeURIComponent(saved.family.recipeId)}`);
    } catch (error) { status.error(error); save.disabled = false; }
  });
  const nutritionPreview = element('p', { className: 'validation-box', 'aria-live': 'polite', 'data-testid': 'recipe-nutrition-preview' });
  section.append(nutritionPreview, validation, element('div', { className: 'editor-footer' }, [status.node, element('div', { className: 'button-row' }, [element('a', { href: existingId ? `/recipes/${encodeURIComponent(existingId)}` : '/recipes', 'data-route': '', className: 'button button--secondary', text: t(state, 'common.cancel') }), save]) ]));
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
      ? (pack.required ? null : element('button', { className: 'button button--secondary', text: t(state, 'catalog.pack.uninstall'), onClick: async () => { try { await state.uninstallPack(pack.packId); } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); } } }))
      : element('button', { className: 'button', text: t(state, 'catalog.pack.install'), onClick: async () => { try { await state.installPack(pack.packId); } catch (error) { state.notify?.('error', error.message || String(error), { timeoutMs: 0 }); } } });
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
    variantLabelIt: revision.display?.it?.variantLabel || '', variantLabelEn: revision.display?.en?.variantLabel || '',
    state: revision.basis.state, ...revision.nutrition, foodGroup: revision.taxonomy.foodGroup, foodSubgroup: revision.taxonomy.foodSubgroup, productFoodId: revision.productTaxonomy?.conceptId || null,
    flavorProfile: revision.taxonomy.flavorProfile, culinaryRoles: structuredClone(revision.taxonomy.culinaryRoles || []), mealArchetypes: revision.taxonomy.mealArchetypes, allergenIds: revision.allergenIds, conversions: structuredClone(revision.conversions || [])
  } : {};
}
function ingredientEditor(state, source = {}) {
  const status = statusBox(); const box = element('div', { className: 'editor-stack catalog-editor', 'data-testid': 'ingredient-editor' }); const validation = element('div', { 'aria-live': 'polite' });
  const nameIt = text(source.nameIt), nameEn = text(source.nameEn);
  const variantIt = text(source.variantLabelIt, { maxlength: 60 }), variantEn = text(source.variantLabelEn, { maxlength: 60 });
  const aliasesIt = createTokenChips({ values: source.aliasesIt || [], placeholder: t(state, 'catalog.alias.placeholder'), addLabel: t(state, 'common.add') });
  const aliasesEn = createTokenChips({ values: source.aliasesEn || [], placeholder: t(state, 'catalog.alias.placeholder'), addLabel: t(state, 'common.add') });
  const basis = optionSelect([['g','g'],['ml','ml']], source.basisUnit || 'g');
  const stateSelect = optionSelect(INGREDIENT_STATES.map(id => [id, t(state, `ingredientState.${id}`)]), source.state || 'unknown');
  const energy = number(source.energyKcal ?? '', { min: 0, step: .1 }), protein = number(source.proteinG ?? '', { min: 0, step: .1 }), carbs = number(source.carbsG ?? '', { min: 0, step: .1 }), fat = number(source.fatG ?? '', { min: 0, step: .1 }), fiber = number(source.fiberG ?? '', { min: 0, step: .1 });
  const category = createHierarchicalFoodCategorySelector(state, state.referenceDataIndex, { foodGroup: source.foodGroup || null, foodSubgroup: source.foodSubgroup || null });
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: source.productFoodId || null, required: true, levels: ['concept'] });
  const flavorChoices = taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.flavorProfile, state.i18n.locale);
  const flavor = createAutocomplete({ choices: flavorChoices, value: source.flavorProfile || flavorChoices.find(choice => choice.id === 'flavor_neutral')?.id || flavorChoices[0]?.id || null, required: true, placeholder: t(state, 'guided.reference.search'), invalidMessage: t(state, 'guided.reference.required') });
  const culinaryRoles = createMultiSelectChips({ choices: taxonomyChoices(state.referenceDataIndex, TAXONOMY_IDS.culinaryRole, state.i18n.locale), values: source.culinaryRoles || [], placeholder: t(state, 'guided.reference.search') });
  const mealPicker = createMealArchetypePicker(state, source.mealArchetypes || [], { onChange: validateForm });
  const allergenChecks = ALLERGEN_IDS.map(id => [id, check(t(state, `allergen.${id}`), (source.allergenIds || []).includes(id))]);

  box.append(element('div', { className: 'form-grid form-grid--2' }, [
    field(t(state, 'catalog.name.it'), nameIt), field(t(state, 'catalog.name.en'), nameEn, t(state, 'r2.enFallback')),
    field(t(state, 'r2.variant.label'), variantIt), field(t(state, 'r2.variant.labelEn'), variantEn, t(state, 'r2.enFallback')),
    field(t(state, 'catalog.aliasesIt'), aliasesIt.node, t(state, 'catalog.aliases.help')), field(t(state, 'catalog.aliasesEn'), aliasesEn.node, t(state, 'catalog.aliases.help')),
    field(t(state, 'catalog.basisUnit'), basis), field(t(state, 'catalog.ingredientState'), stateSelect)
  ]), category.node, field(t(state, 'catalog.productFood'), productFood.node, t(state, 'catalog.productFood.help')), element('div', { className: 'form-grid form-grid--2' }, [field(t(state, 'catalog.flavorProfile'), flavor.node), field(t(state, 'catalog.culinaryRoles'), culinaryRoles.node)]));
  box.append(element('h3', { text: t(state, 'catalog.nutritionPer100') }), element('div', { className: 'form-grid form-grid--5' }, [
    field(t(state, 'catalog.energy100'), energy), field(t(state, 'catalog.protein100'), protein), field(t(state, 'catalog.carbs100'), carbs), field(t(state, 'catalog.fat100'), fat), field(t(state, 'catalog.fiber100'), fiber)
  ]));
  box.append(element('h3', { text: t(state, 'catalog.mealArchetypes') }), element('p', { className: 'muted', text: t(state, 'guided.mealArchetype.help') }), mealPicker.node,
    element('h3', { text: t(state, 'catalog.allergens') }), element('div', { className: 'compact-checks' }, allergenChecks.map(([, c]) => c)));

  const optional = controlledDetails(state, 'ingredient-editor-advanced', { children: [element('summary', { text: state.i18n.locale === 'it' ? 'Avanzate · inglese e sinonimi' : 'Advanced · English and aliases' })] });
  for (const control of [nameEn, variantEn, aliasesIt.node, aliasesEn.node]) { const label = control.closest('.field'); if (label) optional.append(label); } box.append(optional);
  const save = element('button', { className: 'button', text: t(state, 'common.save') });
  function validateForm() {
    if (!save) return false; const errors = [];
    if (!nameIt.value.trim() && !nameEn.value.trim()) errors.push(t(state, 'catalog.validation.name'));
    for (const [label, control] of [[t(state, 'catalog.energy100'), energy],[t(state, 'catalog.protein100'), protein],[t(state, 'catalog.carbs100'), carbs],[t(state, 'catalog.fat100'), fat],[t(state, 'catalog.fiber100'), fiber]]) if (control.value === '' || !(Number(control.value) >= 0)) errors.push(`${label}: ${t(state, 'catalog.validation.requiredNumber')}`);
    if (!category.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!productFood.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!flavor.validate()) errors.push(t(state, 'guided.reference.required'));
    if (!culinaryRoles.getValues().length) errors.push(t(state, 'guided.reference.required'));
    if (!mealPicker.validate()) errors.push(t(state, 'guided.mealArchetype.required'));
    validation.className = errors.length ? 'validation-box validation-box--error' : 'validation-box'; validation.textContent = errors.length ? [...new Set(errors)].join(' · ') : t(state, 'catalog.validation.ready');
    validation.className = errors.length ? 'validation-box validation-box--error' : 'validation-box';
    validation.textContent = errors.length ? [...new Set(errors)].join(' · ') : t(state, 'catalog.validation.ready');
    save.disabled = errors.length > 0; return !errors.length;
  }
  for (const control of [nameIt, nameEn, energy, protein, carbs, fat, fiber, basis, stateSelect]) control.addEventListener('input', validateForm);
  save.addEventListener('click', async () => {
    if (!validateForm()) return;
    try {
      save.disabled = true; const cat = category.getValue();
      const savedIngredient = await saveIngredient({
        ingredientId: source.ingredientId, nameIt: nameIt.value, nameEn: nameEn.value, aliasesIt: aliasesIt.getValues(), aliasesEn: aliasesEn.getValues(),
        variantLabelIt: variantIt.value || t(state, `ingredientState.${stateSelect.value}`), variantLabelEn: variantEn.value || variantIt.value || t(state, `ingredientState.${stateSelect.value}`), basisUnit: basis.value, state: stateSelect.value, energyKcal: energy.value, proteinG: protein.value, carbsG: carbs.value, fatG: fat.value, fiberG: fiber.value,
        foodGroup: cat.foodGroup, foodSubgroup: cat.foodSubgroup, productFoodId: productFood.getValue(), flavorProfile: flavor.getValue(), culinaryRoles: culinaryRoles.getValues(), mealArchetypes: mealPicker.getValues(),
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
      element('h2', { text: ingredientPresentation(revision, state.referenceDataIndex, state.i18n.locale).name }),
      element('p', { text: ingredientPresentation(revision, state.referenceDataIndex, state.i18n.locale).variant }),
      element('div', { className: 'button-row' }, (state.guidedIngredients || []).filter(item => item.revision.productTaxonomy?.conceptId === revision.productTaxonomy?.conceptId).map(item => element('a', { href: routeWithParams(`/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}`, { return: `/configure/ingredients${location.search}` }), 'data-route': '', className: 'button button--secondary button--small', text: ingredientPresentation(item.revision, state.referenceDataIndex, state.i18n.locale).variant }))),
      element('div', { className: 'detail-meta' }, [element('span', { className: `origin-pill origin-pill--${family.origin}`, text: t(state, `catalog.origin.${family.origin}`) }), element('span', { text: `${t(state, 'catalog.revisionNumber')} ${revision.revisionNumber}` }), current ? element('span', { className: 'status-chip status-chip--installed', text: t(state, 'catalog.currentRevision') }) : element('span', { className: 'status-chip', text: t(state, 'catalog.historicalRevision') })]),
      !current ? element('div', { className: 'validation-box validation-box--warning', text: t(state, 'catalog.historicalIngredientWarning') }) : null,
      metrics, taxonomy,
      element('div', { className: 'semantic-groups semantic-groups--summary' }, [
        ...(revision.taxonomy.culinaryRoles?.length ? [element('section', { className: 'semantic-group' }, [element('h3', { className: 'semantic-group__label', text: t(state, 'catalog.culinaryRoles') }), chipList(revision.taxonomy.culinaryRoles.map(id => termLabel(state, id)))])] : []),
        element('section', { className: 'semantic-group' }, [element('h3', { className: 'semantic-group__label', text: t(state, 'catalog.mealArchetypes') }), chipList(revision.taxonomy.mealArchetypes.map(id => t(state, `mealArchetype.${id}`)))]),
        element('section', { className: 'semantic-group' }, [element('h3', { className: 'semantic-group__label', text: t(state, 'catalog.allergens') }), chipList(revision.allergenIds.length ? revision.allergenIds.map(id => t(state, `allergen.${id}`)) : [t(state, 'r2.safety.unverified')])])
      ]),
      controlledDetails(state, `ingredient-sources-${ingredientId}`, { defaultOpen: false, children: [element('summary', { text: t(state, 'r2.dataSources') }), element('pre', { text: JSON.stringify({ ingredientId, revisionId: revision.ingredientRevisionId, source: revision.source, quality: revision.quality, contentHash: revision.contentHash, originalNames: revision.i18n }, null, 2) }), historyBox] })
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
  const favorites = check(state.i18n.locale === 'it' ? 'Solo preferiti' : 'Favorites only', params.get('favorites') === '1');
  const q = text(params.get('q') || '', { placeholder: t(state, 'catalog.ingredients.search') });
  const origin = optionSelect([['', t(state, 'catalog.filter.anyOrigin')],['base',t(state,'catalog.origin.base')],['user',t(state,'catalog.origin.user')]], params.get('origin') || '');
  const ingredientState = optionSelect([['', t(state, 'catalog.filter.anyState')], ...INGREDIENT_STATES.map(id => [id, t(state, `ingredientState.${id}`)])], params.get('state') || '');
  const productFood = createProductFoodPicker(state, state.referenceDataIndex, { value: params.get('food') || null, required: false });
  const form = element('form', { className: 'filter-panel filter-panel--compact' }, [
    favorites,
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
  const list = element('div', { className: 'ingredient-catalog-list', 'data-testid': 'ingredient-catalog-results' }, [element('p', { className: 'muted', text: t(state, 'common.loading') })]); section.append(list);
  void state.catalogQuery.searchIngredientConcepts({ locale: state.i18n.locale, text: params.get('q') || '', origin: params.get('origin') || '', productFoodId: params.get('food') || '', state: params.get('state') || '' }).then(concepts => {
    const items = concepts.flatMap(concept => concept.forms);
    list.replaceChildren(element('div', { className: 'results-heading' }, [element('strong', { 'data-testid': 'ingredient-result-count', 'data-count': String(items.length), text: t(state, 'catalog.results.count', { count: String(items.length) }) }), element('span', { className: 'muted', text: t(state, 'catalog.ingredients.filtered') })]));
    for (const concept of concepts) {
      const group = controlledDetails(state, `ingredient-concept-${concept.concept.termId}`, { defaultOpen: Boolean(params.get('q') || params.get('food')), children: [element('summary', { text: `${concept.label} · ${concept.forms.length} ${t(state, 'r2.formsAvailable')}` })] });
      list.append(group);
      for (const item of concept.forms) {
      const n = item.revision.nutrition; const productPath = productFoodPathLabel(state.referenceDataIndex, item.revision.productTaxonomy?.conceptId, state.i18n.locale);
      const actions = element('div', { className: 'button-row' }, [
        element('a', { href: routeWithParams(`/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}`, { return: `/configure/ingredients${location.search}` }), 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.details') }),
        element('a', { href: `/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}/edit`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.edit') })
      ]);
      if (item.family.origin === 'user') actions.append(element('button', { className: 'button button--danger button--small', text: t(state, 'common.archive'), onClick: async () => { try { await archiveUserIngredient(item.family.ingredientId, { repo: state.repo }); state.notify?.('success', t(state, 'catalog.ingredient.archived')); state.render(); } catch (error) { state.notify?.('error', error.message || String(error)); } } }));
      group.append(element('article', { className: 'ingredient-card', 'data-testid': 'ingredient-card' }, [
        element('div', {}, [
          element('a', { href: routeWithParams(`/configure/ingredients/${encodeURIComponent(item.family.ingredientId)}`, { return: `/configure/ingredients${location.search}` }), 'data-route': '', className: 'text-link ingredient-card__title', text: ingredientPresentation(item.revision, state.referenceDataIndex, state.i18n.locale).variant }),
          element('p', { className: 'muted', text: `${productPath || termLabel(state, item.revision.taxonomy.foodGroup)} · ${t(state, `ingredientState.${item.revision.basis.state}`)} · ${t(state, `catalog.origin.${item.family.origin}`)}` })
        ]),
        element('div', { className: 'recipe-metrics' }, [element('span', { text: `${n.energyKcal} kcal` }), element('span', { text: `${n.proteinG} g ${t(state, 'nutrient.protein')}` }), element('span', { text: `${n.fiberG} g ${t(state, 'nutrient.fiber')}` })]), actions
      ]));
    }
    }
    if (!items.length) list.append(element('div', { className: 'empty-state', text: t(state, 'catalog.ingredients.empty') }));
  }).catch(error => list.replaceChildren(element('div', { className: 'validation-box validation-box--error', text: error.message || String(error) })));
  return section;
}
