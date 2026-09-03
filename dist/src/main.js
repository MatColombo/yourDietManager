import { SchemaRegistry } from './lib/schemaValidator.js';
import { repositories } from './repositories/repositoryHub.js';
import { runMigrations } from './services/migrationRunner.js';
import { ensureBootstrapConfiguration } from './services/configurationBootstrap.js';
import { CatalogImporter } from './services/catalogImporter.js';
import { CatalogUpdater } from './services/catalogUpdater.js';
import { CatalogQueryService } from './services/catalogQuery.js';
import { loadDictionaries, I18n } from './i18n/i18n.js';
import { applyTheme } from './theme/themeEngine.js';
import { renderApp } from './ui/app.js';
import { installRouter } from './ui/router.js';
import { loadConfigurationBundle, onboardingIsComplete, getOnboardingDraft } from './services/configurationService.js';
import { APP_BASE_PATH, assetPath, prefixAppPath, restorePagesRedirect, routePath } from './lib/appBase.js';

restorePagesRedirect();

const root = document.getElementById('root');
const registry = new SchemaRegistry();

async function refreshCatalogStats(state) {
  state.catalogVersion = (await repositories.getMeta('activeCatalogVersion')) || null;
  state.ingredientCount = await repositories.count('ingredients');
  state.recipeCount = await repositories.count('recipes');
  const packs = state.catalogVersion ? await repositories.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: state.catalogVersion }) : [];
  state.catalogPacks = await Promise.all(packs.map(async pack => ({
    ...pack,
    offlineCache: state.catalogVersion ? await repositories.getMeta(`offlinePack:${state.catalogVersion}:${pack.packId}`) : null
  })));
  state.catalogPacks.sort((a, b) => Number(b.required) - Number(a.required) || a.packId.localeCompare(b.packId));
}

async function start() {
  await registry.loadAll();
  await runMigrations(repositories);
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
  const state = {
    repo: repositories, registry, config, configuration, theme, i18n,
    onboardingComplete: await onboardingIsComplete({ repo: repositories }), onboardingDraft: await getOnboardingDraft({ repo: repositories }),
    catalogProgress: { phase: 'idle', completed: 0, total: 1, messageKey: 'common.loading' },
    catalogVersion: null, ingredientCount: 0, recipeCount: 0, catalogPacks: [], catalogUpdateAvailable: false, catalogUpdateVersion: null,
    catalogQuery: new CatalogQueryService({ repo: repositories }), notice: null, preImportBackup: null, planUi: {},
    render: () => renderApp(root, state), retryCatalog: null, updateCatalog: null, installPack: null, uninstallPack: null, refreshCatalog: null
  };

  state.refreshCatalog = async () => { await refreshCatalogStats(state); };
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

  installRouter(() => state.render()); await refreshCatalogStats(state);
  if (!state.onboardingComplete && routePath() === '/') history.replaceState({}, '', prefixAppPath('/onboarding'));
  state.render(); await bootstrapCatalog();

  if (state.catalogVersion) void catalogUpdater.check().then(result => {
    state.catalogUpdateAvailable = result.updateAvailable; state.catalogUpdateVersion = result.updateAvailable ? result.manifest.catalogVersion : null; state.render();
  }).catch(() => { /* Offline is a valid Phase 3 state. */ });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register(assetPath('/service-worker.js'), { scope: `${APP_BASE_PATH || ''}/` }).catch(error => console.warn('Service worker registration failed', error));
}

start().catch(error => {
  root.replaceChildren(); const main = document.createElement('main'); main.className = 'fatal-error';
  const title = document.createElement('h1'); title.textContent = 'yourDietManager'; const message = document.createElement('p'); message.textContent = 'Application bootstrap failed.'; const detail = document.createElement('pre'); detail.textContent = error instanceof Error ? error.message : String(error);
  main.append(title, message, detail); root.append(main);
});
