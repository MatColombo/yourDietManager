import { ingredientProjection } from './services/ingredientConceptQuery.js';
import { SchemaRegistry } from './lib/schemaValidator.js';
import { repositories } from './repositories/repositoryHub.js';
import { ensureBootstrapConfiguration } from './services/configurationBootstrap.js';
import { installCompiledCatalog } from './services/cleanCatalogLoader.js';
import { CatalogQueryService } from './services/catalogQuery.js';
import { RecipeHumanReviewService, isProductionReviewManifest } from './services/recipeHumanReviewService.js';
import { loadDictionaries, I18n } from './i18n/i18n.js';
import { applyTheme } from './theme/themeEngine.js';
import { renderApp } from './ui/app.js';
import { installRouter } from './ui/router.js';
import { initializeUiState, installDraftTracking, shouldDeferRender, notify, clearDirty } from './ui/uiState.js';
import { loadConfigurationBundle } from './services/configurationService.js';
import { loadReferenceDataBundle } from './services/referenceDataEditorService.js';
import { restorePagesRedirect } from './lib/appBase.js';

restorePagesRedirect();

const root = document.getElementById('root');
const registry = new SchemaRegistry();

async function refreshCatalogStats(state) {
  state.catalogVersion = (await repositories.getMeta('activeCatalogVersion')) || null;
  state.catalogManifest = (await repositories.getMeta('catalogManifest')) || null;
  state.ingredientCount = await repositories.count('ingredients');
  state.recipeCount = await repositories.count('recipes');
  const packs = state.catalogVersion ? await repositories.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: state.catalogVersion }) : [];
  state.catalogPacks = await Promise.all(packs.map(async pack => ({ ...pack, offlineCache: null })));
  state.catalogPacks.sort((a, b) => Number(b.required) - Number(a.required) || a.packId.localeCompare(b.packId));
  if (state.catalogQuery) {
    state.ingredientProjection = await ingredientProjection(state.repo);
    state.guidedIngredients = state.ingredientProjection.items;
    state.foodGroups = state.ingredientProjection.groups;
    state.ingredientConversions = await state.repo.getAll('ingredientConversions');
  }
  state.humanReviewSummary = state.humanReview && isProductionReviewManifest(state.catalogManifest) ? await state.humanReview.summary(state.catalogManifest) : null;
}

async function start() {
  await registry.loadAll();
  await installCompiledCatalog({ repo: repositories, registry });
  await ensureBootstrapConfiguration({ repo: repositories, registry });
  const configuration = await loadConfigurationBundle(repositories);
  const config = configuration.appConfig;
  const dictionaries = await loadDictionaries();
  const i18n = new I18n(dictionaries, config.locale);
  const theme = configuration.themeProfiles.find(item => item.id === config.themeProfileId);
  if (!theme) throw new Error(`ThemeProfile ${config.themeProfileId} not found`);
  applyTheme(theme);
  document.documentElement.lang = i18n.locale;
  localStorage.setItem('ydm:locale-bootstrap', i18n.locale);

  const referenceData = await loadReferenceDataBundle(repositories, registry);
  const state = {
    repo: repositories, registry, config, configuration, theme, i18n,
    onboardingEnabled: false, onboardingComplete: true, onboardingDraft: null,
    catalogProgress: { phase: 'complete', completed: 1, total: 1, messageKey: 'catalog.status.complete' },
    catalogVersion: null, catalogManifest: null, ingredientCount: 0, recipeCount: 0, catalogPacks: [], catalogUpdateAvailable: false, catalogUpdateVersion: null, humanReviewSummary: null,
    catalogQuery: new CatalogQueryService({ repo: repositories }), humanReview: new RecipeHumanReviewService({ repo: repositories, registry }), guidedIngredients: [], notice: null, preImportBackup: null, planUi: {},
    referenceDataIndex: referenceData.index, referenceTaxonomies: referenceData.taxonomies, referenceTerms: referenceData.taxonomyTerms,
    render: null, retryCatalog: null, updateCatalog: null, installPack: null, uninstallPack: null, refreshCatalog: null, refreshReferenceData: null
  };

  initializeUiState(state);
  state.notify = (type, message, options) => notify(state, type, message, options);
  state.markSaved = () => clearDirty(state);
  state.render = ({ force = false } = {}) => {
    if (!force && shouldDeferRender(state)) { state.ui.pendingRender = true; return false; }
    state.ui.pendingRender = false;
    renderApp(root, state);
    return true;
  };
  installDraftTracking(root, state);

  state.refreshCatalog = async () => { await refreshCatalogStats(state); };
  state.refreshHumanReview = async () => { await refreshCatalogStats(state); state.render(); };
  state.refreshReferenceData = async () => {
    const next = await loadReferenceDataBundle(repositories, registry);
    state.referenceDataIndex = next.index;
    state.referenceTaxonomies = next.taxonomies;
    state.referenceTerms = next.taxonomyTerms;
  };
  const reloadCatalog = async () => {
    try {
      state.catalogProgress = { phase:'download', completed:0, total:1, messageKey:'catalog.status.downloading' };
      state.render();
      await installCompiledCatalog({ repo:repositories, registry, onProgress:progress => { state.catalogProgress = progress; state.render(); } });
      await state.refreshReferenceData();
      await refreshCatalogStats(state);
    } catch (error) {
      state.catalogProgress = { phase:'error', completed:0, total:1, messageKey:'catalog.status.error', error:error.message || String(error) };
    }
    state.render();
  };
  state.retryCatalog = reloadCatalog;
  state.updateCatalog = reloadCatalog;
  state.installPack = async () => {};
  state.uninstallPack = async () => {};

  installRouter(state, () => state.render({ force: true }));
  await refreshCatalogStats(state);
  state.render({ force: true });
}

start().catch(error => {
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'fatal-error';
  const title = document.createElement('h1');
  title.textContent = 'yourDietManager';
  const message = document.createElement('p');
  message.textContent = 'Application bootstrap failed.';
  const detail = document.createElement('pre');
  detail.textContent = error instanceof Error ? error.message : String(error);
  main.append(title, message, detail);
  root.append(main);
});

for (const type of ['ydm-upgrade-blocked','ydm-upgrade-required']) globalThis.addEventListener?.(type, () => {
  const message = document.createElement('p');
  message.setAttribute('role','alert');
  message.className='validation-box validation-box--warning';
  message.textContent = document.documentElement.lang === 'en' ? 'Application update: copy unsaved changes, close other tabs and reload.' : 'Aggiornamento applicazione: copia le modifiche non salvate, chiudi le altre schede e ricarica.';
  document.body.prepend(message);
});
