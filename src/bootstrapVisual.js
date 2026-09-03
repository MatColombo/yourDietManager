try {
  const raw = localStorage.getItem('ydm:theme-bootstrap');
  if (raw) {
    const theme = JSON.parse(raw);
    for (const [key, value] of Object.entries(theme.tokens || {})) {
      if (key === 'borderRadiusScale') continue;
      const cssKey = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
      document.documentElement.style.setProperty(`--ydm-color-${cssKey}`, String(value));
    }
    document.documentElement.style.setProperty('--ydm-radius-scale', String(theme.tokens?.borderRadiusScale ?? 1));
    document.documentElement.style.setProperty('--ydm-font-scale', String(theme.fontScale ?? 1));
    document.documentElement.dataset.density = theme.density || 'comfortable';
  }
  const locale = localStorage.getItem('ydm:locale-bootstrap');
  if (locale) document.documentElement.lang = locale;
} catch {}
