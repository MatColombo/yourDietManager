import { assetPath } from '../lib/appBase.js';

export function normalizeLocale(locale) { return String(locale || '').toLowerCase().startsWith('it') ? 'it' : 'en'; }
export class I18n {
  constructor(dictionaries, locale = 'en', fallback = 'en') { this.dictionaries = dictionaries; this.fallback = fallback; this.locale = normalizeLocale(locale); }
  setLocale(locale) { this.locale = normalizeLocale(locale); }
  t(key) { return this.dictionaries[this.locale]?.[key] ?? this.dictionaries[this.fallback]?.[key] ?? key; }
  missingKeys(locale) { return Object.keys(this.dictionaries[this.fallback] || {}).filter(key => this.dictionaries[locale]?.[key] === undefined); }
}
export async function loadDictionaries(fetcher = fetch) {
  const [it, en] = await Promise.all(['it', 'en'].map(async locale => {
    const response = await fetcher(assetPath(`/data/locales/${locale}.json`));
    if (!response.ok) throw new Error(`Unable to load locale ${locale}`);
    return response.json();
  }));
  return { it, en };
}
