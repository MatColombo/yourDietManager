const INTERACTIVE_SELECTOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="option"],[contenteditable="true"]';

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

function labelFor(control) {
  const explicit = clean(control.getAttribute('data-help') || control.getAttribute('aria-label'));
  if (explicit) return explicit;
  if (control.id) {
    const associated = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    const text = clean(associated?.textContent);
    if (text) return text;
  }
  const wrapping = control.closest('label');
  if (wrapping) {
    const text = clean(wrapping.querySelector(':scope > span')?.textContent || wrapping.textContent);
    if (text) return text;
  }
  const ownText = clean(control.textContent);
  if (ownText) return ownText;
  const placeholder = clean(control.getAttribute('placeholder'));
  if (placeholder) return placeholder;
  return clean(control.getAttribute('name') || control.getAttribute('type')) || 'Controllo';
}

function helpDescription(control, locale) {
  const label = labelFor(control);
  const it = locale === 'it';
  if (control.matches('a[href]')) return it ? `Apre: ${label}` : `Opens: ${label}`;
  if (control.matches('summary')) return it ? `Espande o comprime: ${label}` : `Expands or collapses: ${label}`;
  if (control.matches('select')) return it ? `Seleziona un valore per: ${label}` : `Select a value for: ${label}`;
  if (control.matches('textarea')) return it ? `Inserisci testo per: ${label}` : `Enter text for: ${label}`;
  if (control.matches('input')) {
    const type = control.type;
    if (type === 'checkbox' || type === 'radio') return it ? `Attiva o disattiva: ${label}` : `Toggle: ${label}`;
    if (type === 'range') return it ? `Regola il valore di: ${label}` : `Adjust the value for: ${label}`;
    return it ? `Inserisci o modifica: ${label}` : `Enter or edit: ${label}`;
  }
  return it ? `Esegue l'azione: ${label}` : `Runs the action: ${label}`;
}

function nearestInteractive(target, root) {
  const node = target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) : null;
  return node && root.contains(node) ? node : null;
}

function positionTooltip(tooltip, control) {
  const rect = control.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  const box = tooltip.getBoundingClientRect();
  const margin = 10;
  const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - margin));
  const below = rect.bottom + 8;
  const top = below + box.height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - box.height - 8);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showDesktopHelp(root, control) {
  const tooltip = root.querySelector('.interaction-help-tooltip');
  if (!tooltip || matchMedia('(hover: none), (pointer: coarse)').matches) return;
  tooltip.textContent = helpDescription(control, root.__ydmInteractionHelpState?.i18n?.locale || 'it');
  positionTooltip(tooltip, control);
}

function hideDesktopHelp(root) {
  const tooltip = root.querySelector('.interaction-help-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function showMobileHelp(root, control) {
  const overlay = root.querySelector('.interaction-help-overlay');
  if (!overlay) return;
  const locale = root.__ydmInteractionHelpState?.i18n?.locale || 'it';
  overlay.querySelector('.interaction-help-overlay__title').textContent = labelFor(control);
  overlay.querySelector('.interaction-help-overlay__body').textContent = helpDescription(control, locale);
  overlay.hidden = false;
  overlay.querySelector('button')?.focus();
}

function installDelegatedListeners(root) {
  if (root.dataset.interactionHelpInstalled === 'true') return;
  root.dataset.interactionHelpInstalled = 'true';
  root.addEventListener('pointerover', event => {
    const control = nearestInteractive(event.target, root);
    if (control && !control.closest('.interaction-help-overlay,.interaction-help-toggle')) showDesktopHelp(root, control);
  });
  root.addEventListener('pointerout', event => {
    const from = nearestInteractive(event.target, root);
    const to = nearestInteractive(event.relatedTarget, root);
    if (from && from !== to) hideDesktopHelp(root);
  });
  root.addEventListener('focusin', event => {
    const control = nearestInteractive(event.target, root);
    if (control && !control.closest('.interaction-help-overlay,.interaction-help-toggle')) showDesktopHelp(root, control);
  });
  root.addEventListener('focusout', event => {
    if (!nearestInteractive(event.relatedTarget, root)) hideDesktopHelp(root);
  });
  root.addEventListener('click', event => {
    if (!root.classList.contains('interaction-help-mode')) return;
    if (event.target.closest('.interaction-help-toggle,.interaction-help-overlay')) return;
    const control = nearestInteractive(event.target, root);
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMobileHelp(root, control);
  }, true);
}

export function mountInteractionHelp(root, state) {
  root.__ydmInteractionHelpState = state;
  installDelegatedListeners(root);
  const it = state.i18n.locale === 'it';
  const tooltip = document.createElement('div');
  tooltip.className = 'interaction-help-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'interaction-help-toggle';
  toggle.textContent = '?';
  toggle.setAttribute('aria-label', it ? 'Modalita aiuto controlli' : 'Control help mode');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const active = !root.classList.contains('interaction-help-mode');
    root.classList.toggle('interaction-help-mode', active);
    toggle.setAttribute('aria-pressed', String(active));
    toggle.textContent = active ? '×' : '?';
  });

  const overlay = document.createElement('div');
  overlay.className = 'interaction-help-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;
  const card = document.createElement('div');
  card.className = 'interaction-help-overlay__card';
  const title = document.createElement('h2'); title.className = 'interaction-help-overlay__title';
  const body = document.createElement('p'); body.className = 'interaction-help-overlay__body';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'button'; close.textContent = it ? 'Chiudi' : 'Close';
  close.addEventListener('click', () => { overlay.hidden = true; toggle.focus(); });
  card.append(title, body, close); overlay.append(card);
  overlay.addEventListener('click', event => { if (event.target === overlay) { overlay.hidden = true; toggle.focus(); } });

  root.append(tooltip, toggle, overlay);
}
