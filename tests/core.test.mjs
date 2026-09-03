import test from 'node:test';
import assert from 'node:assert/strict';
import { STORE_DEFINITIONS, STORE_NAMES } from '../src/db/constants.js';
import { runMigrations } from '../src/services/migrationRunner.js';
import { compareSemver } from '../src/lib/semver.js';
import { contrastRatio, validateThemeContrast } from '../src/theme/themeEngine.js';
import { I18n, normalizeLocale } from '../src/i18n/i18n.js';
import { MemoryRepository } from './helpers.mjs';
import theme from '../examples/theme-profile.example.json' with { type: 'json' };

test('IndexedDB metadata contains all 19 V1 stores and critical indexes', () => {
  assert.equal(STORE_NAMES.length, 19);
  assert.ok(STORE_DEFINITIONS.recipeVersions.indexes.some(index => index.name === 'searchTokens' && index.options?.multiEntry));
  assert.ok(STORE_DEFINITIONS.calendarDays.indexes.some(index => index.name === 'planAndDate' && index.options?.unique));
  assert.ok(STORE_DEFINITIONS.operations.indexes.some(index => index.name === 'planAndSequence' && index.options?.unique));
});

test('migration runner is idempotent', async () => {
  const repo = new MemoryRepository(); await runMigrations(repo); await runMigrations(repo);
  assert.equal(await repo.getMeta('contentSchemaVersion'), 2);
  assert.equal((await repo.getMeta('contentMigration:1')).status, 'complete');
  assert.equal((await repo.getMeta('contentMigration:2')).status, 'complete');
});

test('semver compatibility comparison is deterministic', () => {
  assert.ok(compareSemver('0.1.0-phase1', '0.1.0') === 0);
  assert.ok(compareSemver('1.2.0', '1.1.9') > 0);
});

test('i18n has English fallback', () => {
  const i18n = new I18n({ it: { a: 'A' }, en: { a: 'A-en', b: 'B-en' } }, 'it');
  assert.equal(normalizeLocale('it-IT'), 'it'); assert.equal(normalizeLocale('fr'), 'en'); assert.equal(i18n.t('b'), 'B-en');
  assert.deepEqual(i18n.missingKeys('it'), ['b']);
});

test('theme engine enforces WCAG guardrails', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-8);
  assert.deepEqual(validateThemeContrast(theme), []);
  const invalid = structuredClone(theme); invalid.tokens.text = '#FFFFFF';
  assert.ok(validateThemeContrast(invalid).some(item => item.foreground === 'text'));
});
