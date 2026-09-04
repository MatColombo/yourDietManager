import { element } from './dom.js';
import { prefixAppPath, routePath, stripAppPath } from '../lib/appBase.js';

let noticeSequence = 0;

export function currentRouteSignature() {
  return `${routePath()}${globalThis.location?.search || ''}`;
}

export function isEditableRoute(path = routePath(), search = globalThis.location?.search || '') {
  if (['/configure/nutrition', '/configure/safety', '/configure/preferences', '/configure/meals', '/configure/days', '/configure/cycle', '/appearance'].includes(path)) return true;
  if (path === '/recipes/new' || path === '/recipes/edit' || /^\/recipes\/[^/]+\/edit$/.test(path)) return true;
  const params = new URLSearchParams(search || '');
  if (/^\/configure\/ingredients\/[^/]+\/edit$/.test(path)) return true;
  if (path === '/configure/ingredients') return params.get('new') === '1' || Boolean(params.get('edit'));
  if (path === '/configure/reference-data') return params.get('new') === '1' || Boolean(params.get('edit'));
  return false;
}

export function initializeUiState(state) {
  state.ui ||= {};
  state.ui.expanded ||= Object.create(null);
  state.ui.notifications ||= [];
  state.ui.dirty ||= null;
  state.ui.pendingRender ||= false;
  return state.ui;
}

export function markDirty(state, signature = currentRouteSignature()) {
  const ui = initializeUiState(state);
  if (!isEditableRoute(routePath(), globalThis.location?.search || '')) return false;
  ui.dirty = { routeSignature: signature, changedAt: new Date().toISOString() };
  return true;
}

export function clearDirty(state) {
  const ui = initializeUiState(state);
  ui.dirty = null;
  ui.pendingRender = false;
}

export function hasUnsavedChanges(state, signature = currentRouteSignature()) {
  const dirty = initializeUiState(state).dirty;
  return Boolean(dirty && dirty.routeSignature === signature);
}

export function shouldDeferRender(state) {
  return hasUnsavedChanges(state);
}

export function confirmDiscardChanges(state, confirmFn = globalThis.confirm) {
  // popstate fires after the URL changed, so the current route signature may no
  // longer match the route where the draft became dirty. Any registered dirty
  // draft must therefore be guarded until an explicit save/discard clears it.
  if (!initializeUiState(state).dirty) return true;
  const message = state.i18n?.t?.('navigation.unsavedConfirm') || 'You have unsaved changes. Leave this page and discard them?';
  const accepted = typeof confirmFn === 'function' ? confirmFn(message) : false;
  if (accepted) clearDirty(state);
  return accepted;
}

export function signalDraftChange(node) {
  if (!node?.dispatchEvent || typeof CustomEvent === 'undefined') return;
  node.dispatchEvent(new CustomEvent('ydm:draft-change', { bubbles: true }));
}

export function expandedState(state, key, defaultOpen = false) {
  const ui = initializeUiState(state);
  if (!(key in ui.expanded)) ui.expanded[key] = Boolean(defaultOpen);
  return Boolean(ui.expanded[key]);
}

export function controlledDetails(state, key, { className = '', defaultOpen = false, children = [] } = {}) {
  const details = element('details', {
    className,
    open: expandedState(state, key, defaultOpen) ? '' : null,
    'data-ui-key': key
  }, children);
  details.addEventListener('toggle', () => { initializeUiState(state).expanded[key] = details.open; });
  return details;
}

function renderNotificationRegion(state) {
  const region = globalThis.document?.querySelector?.('.toast-region');
  if (!region) return;
  region.replaceChildren();
  for (const notice of initializeUiState(state).notifications.slice(-4)) {
    const toast = element('div', { className: `toast toast--${notice.type}`, role: notice.type === 'error' ? 'alert' : 'status' });
    toast.append(element('span', { text: notice.message }));
    toast.append(element('button', {
      type: 'button', className: 'toast__close', 'aria-label': state.i18n?.t?.('common.close') || 'Close', text: '×',
      onClick: () => dismissNotification(state, notice.id)
    }));
    region.append(toast);
  }
}

export function notify(state, type, message, { timeoutMs = 5000 } = {}) {
  const ui = initializeUiState(state);
  const notice = { id: `notice-${++noticeSequence}`, type, message: String(message || ''), createdAt: new Date().toISOString() };
  ui.notifications.push(notice);
  if (ui.notifications.length > 8) ui.notifications.splice(0, ui.notifications.length - 8);
  renderNotificationRegion(state);
  if (timeoutMs > 0 && typeof globalThis.setTimeout === 'function') globalThis.setTimeout(() => dismissNotification(state, notice.id), timeoutMs);
  return notice.id;
}

export function dismissNotification(state, id) {
  const ui = initializeUiState(state);
  ui.notifications = ui.notifications.filter(item => item.id !== id);
  renderNotificationRegion(state);
}

export function notificationRegion(state) {
  const region = element('div', { className: 'toast-region', 'aria-live': 'polite', 'aria-atomic': 'false' });
  queueMicrotask(() => renderNotificationRegion(state));
  return region;
}

export function installDraftTracking(root, state) {
  const handle = event => {
    if (!isEditableRoute()) return;
    if (event.target?.closest?.('[data-no-dirty]')) return;
    markDirty(state);
  };
  root.addEventListener('input', handle);
  root.addEventListener('change', handle);
  root.addEventListener('ydm:draft-change', handle);
}

export function configureNavigation(state, onNavigate) {
  initializeUiState(state);
  let currentIndex = Number(globalThis.history?.state?.ydmIndex ?? 0);
  let restoring = false;
  if (globalThis.history?.replaceState) {
    globalThis.history.replaceState({ ...(globalThis.history.state || {}), ydmIndex: currentIndex }, '', globalThis.location.href);
  }

  const navigate = (href, { replace = false, force = false } = {}) => {
    const rawUrl = new URL(href, globalThis.location.href);
    const appRoute = `${stripAppPath(rawUrl.pathname)}${rawUrl.search}${rawUrl.hash}`;
    const target = prefixAppPath(appRoute);
    const current = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
    if (target === current) return true;
    if (!force && !confirmDiscardChanges(state)) return false;
    clearDirty(state);
    if (replace) globalThis.history.replaceState({ ...(globalThis.history.state || {}), ydmIndex: currentIndex }, '', target);
    else { currentIndex += 1; globalThis.history.pushState({ ydmIndex: currentIndex }, '', target); }
    onNavigate();
    return true;
  };
  state.navigate = navigate;

  globalThis.addEventListener?.('popstate', event => {
    const targetIndex = Number(event.state?.ydmIndex ?? currentIndex - 1);
    if (restoring) { restoring = false; currentIndex = targetIndex; onNavigate(); return; }
    if (!confirmDiscardChanges(state)) {
      const delta = currentIndex - targetIndex;
      if (delta !== 0) { restoring = true; globalThis.history.go(delta); }
      return;
    }
    clearDirty(state); currentIndex = targetIndex; onNavigate();
  });

  globalThis.addEventListener?.('beforeunload', event => {
    if (!hasUnsavedChanges(state)) return;
    event.preventDefault(); event.returnValue = '';
  });

  return navigate;
}
