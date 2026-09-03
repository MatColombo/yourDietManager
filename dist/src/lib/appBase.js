export function normalizeBasePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

const moduleRoot = new URL('../../', import.meta.url);
const browserHttpRoot = /^(?:https?):$/.test(moduleRoot.protocol);
export const APP_BASE_PATH = browserHttpRoot ? normalizeBasePath(moduleRoot.pathname) : '';

export function prefixAppPath(value, basePath = APP_BASE_PATH) {
  const raw = String(value || '/');
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return raw;
  if (raw.startsWith('#')) return raw;
  const base = normalizeBasePath(basePath);
  if (raw === '/') return `${base}/`;
  return `${base}/${raw.replace(/^\/+/, '')}`;
}

export function stripAppPath(pathname, basePath = APP_BASE_PATH) {
  const raw = String(pathname || '/');
  const base = normalizeBasePath(basePath);
  if (!base) return raw.startsWith('/') ? raw : `/${raw}`;
  if (raw === base || raw === `${base}/`) return '/';
  if (raw.startsWith(`${base}/`)) return raw.slice(base.length) || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function routePath(pathname = globalThis.location?.pathname || '/') {
  return stripAppPath(pathname, APP_BASE_PATH);
}

export function assetPath(value) {
  return prefixAppPath(value, APP_BASE_PATH);
}

export function restorePagesRedirect({ locationObject = globalThis.location, historyObject = globalThis.history } = {}) {
  if (!locationObject || !historyObject) return false;
  const current = new URL(locationObject.href);
  const route = current.searchParams.get('__ydm_route');
  if (!route) return false;
  const target = prefixAppPath(route.startsWith('/') ? route : `/${route}`, APP_BASE_PATH);
  historyObject.replaceState({}, '', target);
  return true;
}

export function cacheScopeKey(basePath = APP_BASE_PATH) {
  return normalizeBasePath(basePath).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root';
}
