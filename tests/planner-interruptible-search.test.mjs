import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = process.cwd();

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('planner search has no wall-clock timeout and keeps only explicit expansion caps', async () => {
  const code = await source('src/planner/frequencyPlanGenerator.js');
  assert.doesNotMatch(code, /performance\.now\(\)\s*-\s*started\s*>/);
  assert.doesNotMatch(code, /searchBudget\?\.maxMillis/);
  assert.match(code, /maxExpandedPlans:\s*requestedExpansionLimit/);
  assert.match(code, /search_capacity_exhausted/);
});

test('planner reports percentage progress in both legacy and frequency paths', async () => {
  const legacy = await source('src/planner/planGenerator.js');
  const frequency = await source('src/planner/frequencyPlanGenerator.js');
  assert.match(legacy, /onProgress\?\.\(\{ phase: 'search'.*percent:/s);
  assert.match(frequency, /onProgress\?\.\(\{ phase: 'search'.*percent:/s);
});

test('preview UI exposes a visible progress meter and explicit Abort control', async () => {
  const ui = await source('src/ui/planPages.js');
  assert.match(ui, /data-testid': 'plan-generation-progress'/);
  assert.match(ui, /data-testid': 'plan-generation-abort'/);
  assert.match(ui, /element\('progress'/);
  assert.match(ui, /controller\?\.abort\(\)|controller\.abort\(\)/);
  assert.match(ui, /common\.abort/);
});
