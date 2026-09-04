import { element, clear } from './dom.js';
import { validateThemeContrast, applyTheme } from '../theme/themeEngine.js';
import { createBackup, importBackup } from '../services/backupEngine.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../services/configurationService.js';
import {
  configurationIndexPage, cyclePage, dayClassesPage, mealClassesPage, nutritionPage,
  preferencesPage, safetyPage
} from './configurationPages.js';
import { ingredientDetailPage, ingredientEditorPage, ingredientsPage, packsPage, recipeDetailPage, recipeEditorPage, recipesPage } from './catalogPages.js';
import { todayPage, calendarPage, manageDayPage, historyPage } from './planPages.js';
import { shoppingPage } from './shoppingPages.js';
import { referenceDataPage } from './referenceDataPages.js';
import { routePath } from '../lib/appBase.js';
import { notificationRegion } from './uiState.js';

const PRIMARY = [['/', 'nav.today'], ['/calendar', 'nav.calendar'], ['/recipes', 'nav.recipes'], ['/shopping', 'nav.shopping']];
const SECONDARY = [['/configure', 'nav.configure'], ['/appearance', 'nav.appearance'], ['/language', 'nav.language'], ['/backup', 'nav.backup']];

function navLink(state, [href, key]) {
  const currentPath = routePath();
  const active = currentPath === href || (href === '/recipes' && currentPath.startsWith('/recipes')) || (href === '/configure' && currentPath.startsWith('/configure'));
  return element('a', { href, 'data-route': '', className: `nav-link${active ? ' nav-link--active' : ''}`, 'aria-current': active ? 'page' : null, text: state.i18n.t(key) });
}

function catalogPanel(state) {
  const p = state.catalogProgress;
  const panel = element('section', { className: 'catalog-panel', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  panel.append(element('div', { className: 'catalog-panel__heading' }, [
    element('strong', { text: state.i18n.t('catalog.title') }),
    element('span', { className: `status-dot status-dot--${p.phase}`, 'aria-hidden': 'true' })
  ]));
  panel.append(element('p', { className: 'muted', text: state.i18n.t(p.messageKey) }));
  if (['checking', 'validating', 'importing'].includes(p.phase)) panel.append(element('progress', { max: 100, value: p.total ? Math.round(p.completed / p.total * 100) : 0, 'aria-label': state.i18n.t('a11y.catalogProgress') }));
  if (p.phase === 'complete') {
    const dl = element('dl', { className: 'catalog-stats' });
    for (const [key, value] of [['catalog.version', state.catalogVersion || '—'], ['catalog.ingredients', state.ingredientCount], ['catalog.recipes', state.recipeCount]]) {
      dl.append(element('div', {}, [element('dt', { text: state.i18n.t(key) }), element('dd', { text: value })]));
    }
    panel.append(dl);
    if (state.catalogUpdateAvailable) panel.append(element('button', { className: 'button button--secondary button--small', text: `${state.i18n.t('catalog.update')} ${state.catalogUpdateVersion || ''}`.trim(), onClick: () => state.updateCatalog() }));
  }
  if (p.phase === 'error') {
    panel.append(element('p', { className: 'error-text', text: p.error || state.i18n.t('common.error') }));
    panel.append(element('button', { className: 'button button--secondary', text: state.i18n.t('catalog.retry'), onClick: () => state.retryCatalog() }));
  }
  return panel;
}

function pageCard(state, pageKey) {
  const section = element('section', { className: 'page-card' });
  section.append(element('p', { className: 'eyebrow', text: 'V1' }));
  section.append(element('h1', { text: state.i18n.t(`page.${pageKey}.title`) }));
  section.append(element('p', { className: 'lead', text: state.i18n.t(`page.${pageKey}.body`) }));
  section.append(element('div', { className: 'phase-placeholder', 'aria-hidden': 'true' }, [element('span'), element('span'), element('span')]));
  return section;
}

async function persistShellConfiguration(state, bundle) {
  const saved = await saveConfigurationBundle(bundle, { repo: state.repo, registry: state.registry });
  state.configuration = saved; state.config = saved.appConfig;
  return saved;
}

function languagePage(state) {
  const section = element('section', { className: 'page-card page-card--narrow' });
  section.append(element('p', { className: 'eyebrow', text: 'I18N' }), element('h1', { text: state.i18n.t('page.language.title') }), element('p', { className: 'lead', text: state.i18n.t('page.language.description') }));
  const group = element('div', { className: 'segmented', role: 'group' });
  for (const locale of ['it', 'en']) group.append(element('button', {
    className: `segmented__item${state.i18n.locale === locale ? ' segmented__item--active' : ''}`,
    'aria-pressed': state.i18n.locale === locale ? 'true' : 'false',
    text: state.i18n.t(`language.${locale}`),
    onClick: async () => {
      try {
        const draft = structuredClone(state.configuration); draft.appConfig.locale = locale;
        await persistShellConfiguration(state, draft);
        state.i18n.setLocale(locale); document.documentElement.lang = locale; localStorage.setItem('ydm:locale-bootstrap', locale);
        state.notify?.('success', state.i18n.t('config.saved')); state.render({ force: true });
      } catch (error) { state.notify?.('error', `${state.i18n.t('config.saveFailed')}: ${error.message || error}`); }
    }
  }));
  section.append(group); return section;
}

function appearancePage(state) {
  const section = element('section', { className: 'page-card page-card--narrow' });
  const draftBundle = structuredClone(state.configuration);
  const draft = draftBundle.themeProfiles.find(theme => theme.id === draftBundle.appConfig.themeProfileId);
  section.append(element('p', { className: 'eyebrow', text: 'THEME' }), element('h1', { text: state.i18n.t('page.appearance.title') }), element('p', { className: 'lead', text: state.i18n.t('page.appearance.description') }));
  const mode = element('select'); for (const value of ['system', 'light', 'dark']) mode.append(element('option', { value, text: state.i18n.t(`theme.mode.${value}`) })); mode.value = draft.mode;
  const density = element('select'); for (const value of ['compact', 'comfortable']) density.append(element('option', { value, text: state.i18n.t(`theme.density.${value}`) })); density.value = draft.density;
  const scale = element('input', { type: 'range', min: 0.9, max: 1.25, step: 0.05, value: draft.fontScale });
  const validation = element('div', { className: 'validation-box' }); const save = element('button', { className: 'button', text: state.i18n.t('common.save') });
  const refresh = () => {
    draft.mode = mode.value; draft.density = density.value; draft.fontScale = Number(scale.value);
    const failures = validateThemeContrast(draft); validation.className = `validation-box${failures.length ? ' validation-box--error' : ''}`;
    validation.textContent = state.i18n.t(failures.length ? 'theme.contrast.fail' : 'theme.contrast.ok'); save.disabled = failures.length > 0;
  };
  mode.addEventListener('change', refresh); density.addEventListener('change', refresh); scale.addEventListener('input', refresh);
  save.addEventListener('click', async () => {
    try {
      refresh(); state.registry.assert('themeProfile', draft); await persistShellConfiguration(state, draftBundle); state.theme = structuredClone(draft); applyTheme(state.theme);
      state.markSaved?.(); state.notify?.('success', state.i18n.t('config.saved')); state.render({ force: true });
    } catch (error) { state.notify?.('error', `${state.i18n.t('config.saveFailed')}: ${error.message || error}`); }
  });
  section.append(element('label', { className: 'field' }, [element('span', { text: state.i18n.t('theme.mode.label') }), mode]));
  section.append(element('label', { className: 'field' }, [element('span', { text: state.i18n.t('theme.density.label') }), density]));
  section.append(element('label', { className: 'field' }, [element('span', { text: state.i18n.t('theme.fontScale') }), scale]));
  section.append(validation, save); refresh(); return section;
}

function downloadJson(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const anchor = element('a', { href: url, download: `yourDietManager-backup-${backup.createdAt.slice(0, 10)}.json` });
  document.body?.append?.(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function backupPage(state) {
  const section = element('section', { className: 'page-card page-card--narrow' });
  section.append(element('p', { className: 'eyebrow', text: 'JSON' }), element('h1', { text: state.i18n.t('page.backup.title') }), element('p', { className: 'lead', text: state.i18n.t('page.backup.description') }));
  const status = element('div'); const input = element('input', { type: 'file', accept: 'application/json,.json', className: 'visually-hidden' });
  const exportButton = element('button', { className: 'button', text: state.i18n.t('backup.export'), onClick: async () => downloadJson(await createBackup({ repo: state.repo, registry: state.registry })) });
  const importButton = element('button', { className: 'button button--secondary', text: state.i18n.t('backup.import'), onClick: () => input.click() });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const result = await importBackup(JSON.parse(await file.text()), { repo: state.repo, registry: state.registry }); state.preImportBackup = result.preImportBackup;
      state.configuration = await loadConfigurationBundle(state.repo); state.config = state.configuration.appConfig;
      state.theme = state.configuration.themeProfiles.find(theme => theme.id === state.config.themeProfileId); state.i18n.setLocale(state.config.locale); applyTheme(state.theme);
      state.notice = state.i18n.t('backup.import.success'); state.notify?.('success', state.notice); state.render();
    } catch (error) { status.className = 'validation-box validation-box--error'; status.textContent = `${state.i18n.t('backup.import.error')}: ${error.message || error}`; }
    finally { input.value = ''; }
  });
  section.append(element('div', { className: 'button-row' }, [exportButton, importButton]), input, status);
  if (state.notice) section.append(element('div', { className: 'validation-box', text: state.notice }));
  if (state.preImportBackup) {
    section.append(element('div', { className: 'validation-box', text: state.i18n.t('backup.preImport.ready') }));
    section.append(element('button', { className: 'button button--secondary', text: state.i18n.t('backup.preImport.download'), onClick: () => downloadJson(state.preImportBackup) }));
  }
  return section;
}

function onboardingDisabledPage(state) {
  const section = element('section', { className: 'page-card page-card--narrow' });
  section.append(element('p', { className: 'eyebrow', text: 'CONFIG' }), element('h1', { text: state.i18n.t('onboarding.disabled.title') }), element('p', { className: 'lead', text: state.i18n.t('onboarding.disabled.body') }), element('a', { href: '/configure', 'data-route': '', className: 'button', text: state.i18n.t('onboarding.disabled.cta') }));
  return section;
}

function routePage(state) {
  const path = routePath();
  if (path === '/onboarding') return onboardingDisabledPage(state);
  if (path === '/calendar/day') return manageDayPage(state);
  if (path === '/calendar') return calendarPage(state);
  if (path === '/history') return historyPage(state);
  if (path === '/recipes/new') return recipeEditorPage(state);
  if (path === '/recipes/edit') return recipeEditorPage(state, { edit: true }); // legacy query route
  if (path === '/recipes/packs') return packsPage(state);
  const recipeEditMatch = path.match(/^\/recipes\/([^/]+)\/edit$/);
  if (recipeEditMatch) return recipeEditorPage(state, { edit: true, recipeId: decodeURIComponent(recipeEditMatch[1]) });
  const recipeDetailMatch = path.match(/^\/recipes\/([^/]+)$/);
  if (recipeDetailMatch) return recipeDetailPage(state, decodeURIComponent(recipeDetailMatch[1]), new URLSearchParams(location.search).get('version'));
  if (path === '/recipes') return recipesPage(state);
  if (path === '/shopping') return shoppingPage(state);
  if (path === '/configure/nutrition') return nutritionPage(state);
  if (path === '/configure/safety') return safetyPage(state);
  if (path === '/configure/preferences') return preferencesPage(state);
  if (path === '/configure/meals') return mealClassesPage(state);
  if (path === '/configure/days') return dayClassesPage(state);
  if (path === '/configure/cycle') return cyclePage(state);
  const ingredientEditMatch = path.match(/^\/configure\/ingredients\/([^/]+)\/edit$/);
  if (ingredientEditMatch) return ingredientEditorPage(state, decodeURIComponent(ingredientEditMatch[1]));
  const ingredientDetailMatch = path.match(/^\/configure\/ingredients\/([^/]+)$/);
  if (ingredientDetailMatch) return ingredientDetailPage(state, decodeURIComponent(ingredientDetailMatch[1]), new URLSearchParams(location.search).get('revision'));
  if (path === '/configure/ingredients') return ingredientsPage(state);
  if (path === '/configure/reference-data') return referenceDataPage(state);
  if (path === '/configure') return configurationIndexPage(state);
  if (path === '/appearance') return appearancePage(state);
  if (path === '/language') return languagePage(state);
  if (path === '/backup') return backupPage(state);
  return todayPage(state);
}

export function renderApp(root, state) {
  const routeSignature = routePath() + location.search;
  const routeChanged = state.lastRenderedPath !== routeSignature;
  state.lastRenderedPath = routeSignature;
  clear(root);
  const shell = element('div', { className: 'app-shell' });
  const skip = element('a', { href: '#main-content', className: 'skip-link', text: state.i18n.t('a11y.skipToContent') });
  const topbar = element('header', { className: 'topbar' }, [
    element('div', {}, [element('div', { className: 'brand', text: state.i18n.t('app.name') }), element('div', { className: 'topbar__meta', text: `${state.i18n.t('shell.phase')} · ${state.i18n.t('shell.localFirst')}` })])
  ]);
  const sidebar = element('aside', { className: 'sidebar', 'aria-label': state.i18n.t('a11y.mainNavigation') });
  const primary = element('nav', { className: 'nav-group' }, PRIMARY.map(item => navLink(state, item)));
  const secondary = element('nav', { className: 'nav-group nav-group--secondary' }, SECONDARY.map(item => navLink(state, item)));
  sidebar.append(primary, element('div', { className: 'nav-divider' }), secondary, catalogPanel(state));
  const content = element('main', { className: 'content', id: 'main-content', tabindex: '-1' }, [routePage(state)]);
  shell.append(skip, topbar, sidebar, content, notificationRegion(state)); root.append(shell);
  const heading = content.querySelector('h1');
  if (heading) document.title = `${heading.textContent} · ${state.i18n.t('app.name')}`;
  if (routeChanged && heading) {
    heading.setAttribute('tabindex', '-1');
    queueMicrotask(() => heading.focus({ preventScroll: true }));
  }
}
