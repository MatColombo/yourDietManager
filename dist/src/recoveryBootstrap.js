(() => {
  if (!('serviceWorker' in navigator)) return;
  const base = new URL('./', document.baseURI);
  const scriptUrl = new URL('service-worker.js', base);
  const reloadKey = 'ydm:sw-controller-reload';
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || sessionStorage.getItem(reloadKey) === '1') return;
    reloading = true;
    sessionStorage.setItem(reloadKey, '1');
    location.reload();
  });

  navigator.serviceWorker.register(scriptUrl, { scope: base.pathname, updateViaCache: 'none' })
    .then(async registration => {
      try { await registration.update(); } catch {}
      if (!navigator.serviceWorker.controller) sessionStorage.removeItem(reloadKey);
      else setTimeout(() => sessionStorage.removeItem(reloadKey), 5000);
    })
    .catch(error => console.warn('Service worker registration failed', error));
})();
