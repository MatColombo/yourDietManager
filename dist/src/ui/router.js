import { configureNavigation } from './uiState.js';

export function installRouter(state, onNavigate) {
  const navigate = configureNavigation(state, onNavigate);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  });
  return navigate;
}
