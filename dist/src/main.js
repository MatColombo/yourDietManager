import { SchemaRegistry } from './lib/schemaValidator.js';
import { repositories } from './repositories/repositoryHub.js';
import { ensurePreV1DataEpoch } from './services/preV1DataEpoch.js';
import { ensureBootstrapConfiguration } from './services/configurationBootstrap.js';
import { CatalogImporter } from './services/catalogImporter.js';
import { CatalogUpdater } from './services/catalogUpdater.js';
import { CatalogQueryService } from './services/catalogQuery.js';
import { RecipeHumanReviewService, isProductionReviewManifest } from './services/recipeHumanReviewService.js';
import { loadDictionaries, I18n } from './i18n/i18n.js';
import { applyTheme } from './theme/themeEngine.js';
import { renderApp } from './ui/app.js';
import { installRouter } from './ui/router.js';
import { initializeUiState, installDraftTracking, shouldDeferRender, notify, clearDirty } from './ui/uiState.js';
import { loadConfigurationBundle } from './services/configurationService.js';
import { fetchBundledReferenceData } from './services/referenceDataService.js';
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
  state.catalogPacks = await Promise.all(packs.map(async pack => ({
    ...pack,
    offlineCache: state.catalogVersion ? await repositories.getMeta(`offlinePack:${state.catalogVersion}:${pack.packId}`) : null
  })));
  state.catalogPacks.sort((a, b) => Number(b.required) - Number(a.required) || a.packId.localeCompare(b.packId));
  if (state.catalogQuery) state.guidedIngredients = await state.catalogQuery.listCurrentIngredients();
  state.humanReviewSummary = state.humanReview && isProductionReviewManifest(state.catalogManifest) ? await state.humanReview.summary(state.catalogManifest) : null;
}

async function start() {
  await registry.loadAll();
  await ensurePreV1DataEpoch({ repo: repositories, registry, referenceDataLoader: () => fetchBundledReferenceData({ registry }) });
  await ensureBootstrapConfiguration({ repo: repositories, registry });
  const configuration = await loadConfigurationBundle(repositories);
  const config = configuration.appConfig;
  const dictionaries = await loadDictionaries();
  const i18n = new I18n(dictionaries, config.locale);
  const theme = configuration.themeProfiles.find(item => item.id === config.themeProfileId);
  if (!theme) throw new Error(`ThemeProfile ${config.themeProfileId} not found`);
  applyTheme(theme); document.documentElement.lang = i18n.locale; localStorage.setItem('ydm:locale-bootstrap', i18n.locale);

  const catalogUpdater = new CatalogUpdater({ repo: repositories, registry });
  await catalogUpdater.recoverIncompleteUpdate();
  const referenceData = await loadReferenceDataBundle(repositories, registry);
  const state = {
    repo: repositories, registry, config, configuration, theme, i18n,
    onboardingEnabled: false, onboardingComplete: true, onboardingDraft: null,
    catalogProgress: { phase: 'idle', completed: 0, total: 1, messageKey: 'common.loading' },
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
    state.ui.pendingRender = false; renderApp(root, state); return true;
  };
  installDraftTracking(root, state);

  state.refreshCatalog = async () => { await refreshCatalogStats(state); };
  state.refreshHumanReview = async () => { await refreshCatalogStats(state); state.render(); };
  state.refreshReferenceData = async () => {
    const next = await loadReferenceDataBundle(repositories, registry);
    state.referenceDataIndex = next.index; state.referenceTaxonomies = next.taxonomies; state.referenceTerms = next.taxonomyTerms;
  };
  const bootstrapCatalog = async () => {
    const importer = new CatalogImporter({ repo: repositories, registry });
    try { await importer.bootstrap(progress => { state.catalogProgress = progress; state.render(); }); }
    catch { /* Progress carries the diagnostic. */ }
    finally { await refreshCatalogStats(state); state.render(); }
  };
  state.retryCatalog = () => bootstrapCatalog();
  state.updateCatalog = async () => {
    try {
      const result = await catalogUpdater.update(progress => { state.catalogProgress = progress; state.render(); });
      if (result.updated) { state.catalogUpdateAvailable = false; state.catalogUpdateVersion = null; }
    } catch (error) {
      state.catalogProgress = { phase: 'error', completed: 0, total: 1, messageKey: 'catalog.status.error', error: error.message || String(error) };
    } finally { await refreshCatalogStats(state); state.render(); }
  };
  state.installPack = async packId => { await catalogUpdater.installPack(packId, progress => { state.catalogProgress = progress; state.render(); }); await refreshCatalogStats(state); state.render(); };
  state.uninstallPack = async packId => { await catalogUpdater.uninstallPack(packId); await refreshCatalogStats(state); state.render(); };

  installRouter(state, () => state.render({ force: true })); await refreshCatalogStats(state);
  state.render({ force: true }); await bootstrapCatalog();

  if (state.catalogVersion) void catalogUpdater.check().then(result => {
    state.catalogUpdateAvailable = result.updateAvailable; state.catalogUpdateVersion = result.updateAvailable ? result.manifest.catalogVersion : null; state.render();
  }).catch(() => { /* Offline is a valid Phase 3 state. */ });

}

start().catch(error => {
  root.replaceChildren(); const main = document.createElement('main'); main.className = 'fatal-error';
  const title = document.createElement('h1'); title.textContent = 'yourDietManager'; const message = document.createElement('p'); message.textContent = 'Application bootstrap failed.'; const detail = document.createElement('pre'); detail.textContent = error instanceof Error ? error.message : String(error);
  main.append(title, message, detail); root.append(main);
});
