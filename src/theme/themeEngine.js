function channel(value) { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }
function rgb(hex) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Invalid color token ${hex}`);
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}
export function relativeLuminance(hex) { const [r, g, b] = rgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground), b = relativeLuminance(background), light = Math.max(a, b), dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}
export function validateThemeContrast(theme) {
  const pairs = [['text', 'background', 4.5], ['text', 'surface', 4.5], ['focusRing', 'background', 3], ['focusRing', 'surface', 3]];
  return pairs.map(([foreground, background, minimum]) => ({ foreground, background, minimum, ratio: contrastRatio(theme.tokens[foreground], theme.tokens[background]) })).filter(item => item.ratio < item.minimum);
}
function variable(key) { return `--ydm-color-${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`; }
export function applyTheme(theme, root = document.documentElement, storage = globalThis.localStorage) {
  const failures = validateThemeContrast(theme);
  if (failures.length) throw new Error(`Theme contrast guardrail failed: ${failures.map(f => `${f.foreground}/${f.background}`).join(', ')}`);
  for (const [key, value] of Object.entries(theme.tokens)) if (key !== 'borderRadiusScale') root.style.setProperty(variable(key), String(value));
  root.style.setProperty('--ydm-radius-scale', String(theme.tokens.borderRadiusScale));
  root.style.setProperty('--ydm-font-scale', String(theme.fontScale));
  root.dataset.density = theme.density;
  root.dataset.themeMode = theme.mode;
  root.style.colorScheme = theme.mode === 'system' ? 'light dark' : theme.mode;
  storage?.setItem('ydm:theme-bootstrap', JSON.stringify({ mode: theme.mode, density: theme.density, fontScale: theme.fontScale, tokens: theme.tokens }));
}
