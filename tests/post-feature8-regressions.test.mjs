import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('meal replacement preview UI defines the checkbox helper used by incompatible-candidate mode', async () => {
  const ui = await readFile(new URL('../src/ui/planPages.js', import.meta.url), 'utf8');
  assert.match(ui, /function check\s*\(/);
  assert.match(ui, /generationReplacementCard/);
  assert.match(ui, /showIncompatible/);
});

test('main calendar exposes timeline splice controls without entering a day page', async () => {
  const ui = await readFile(new URL('../src/ui/planPages.js', import.meta.url), 'utf8');
  assert.match(ui, /data-testid': 'calendar-timeline-quick-editor'/);
  assert.match(ui, /data-testid': 'calendar-main-insert-day'/);
  assert.match(ui, /data-testid': 'calendar-main-remove-shift'/);
});
