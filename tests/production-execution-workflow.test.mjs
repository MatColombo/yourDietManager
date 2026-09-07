import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('network-enabled production workflow preserves the frozen 4P-B -> pilot -> 4P-C sequence', async () => {
  const workflow = await readFile('.github/workflows/production-corpus.yml','utf8');
  const ordered = [
    'usda-foundation-2026-04','usda-sr-legacy-2018-04','corpus:auto-curate-fdc','corpus:materialize-usda',
    'corpus:generate-fixture-retirement','corpus:retire-recipe-fixtures','--pilot-strict','corpus:pilot-execute','Scale Gate 500','corpus:first-scale-batch'
  ];
  let cursor = -1;
  for (const token of ordered) {
    const next = workflow.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `workflow token missing/out of order: ${token}`);
    cursor = next;
  }
  assert.match(workflow,/actions\/checkout@v7/);
  assert.match(workflow,/actions\/setup-node@v7/);
  assert.match(workflow,/commit_results/);
  assert.match(workflow,/pre-verify-summary\.json/);
  assert.doesNotMatch(workflow,/git add[^\n]*corpus\/sources\/cache/);
});


test('first scale runner binds the specialized portable generator to focus_only planning and persists failure evidence', async () => {
  const runner = await readFile('scripts/corpus/execute-first-scale-batch.mjs','utf8');
  assert.match(runner,/intentStrategy:'focus_only'/);
  assert.match(runner,/pre-verify-summary\.json/);
  assert.ok(runner.indexOf("writeJson(path.join(outputRoot,'batch-report.json')") < runner.indexOf('await verifyIndustrializedBatchReport'), 'batch report must be written before final verification');
});

test('production execution spec keeps deterministic review bounded and non-fuzzy', async () => {
  const spec = await readFile('specs/PRODUCTION_CORPUS_EXECUTION_SPEC.md','utf8');
  assert.match(spec,/does not lower any ingredient, pilot, quality, or scale threshold/i);
  assert.match(spec,/ydm-deterministic-fdc-curator-v1/);
  assert.match(spec,/fuzzy semantic merge remains forbidden/i);
  assert.match(spec,/120\/120/);
  assert.match(spec,/Scale Gate 500/);
});


test('pilot-strict readiness fails closed on the immutable development fixture even when public catalog is production-review', () => {
  const run = spawnSync(process.execPath, ['scripts/corpus/production-readiness.mjs', 'tests/fixtures/catalog-0.3/public/data', 'corpus/contracts/v1-production.json', 'corpus/policies/v1-default.json', '/tmp/ydm-test-production-readiness.json', '--pilot-strict'], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.match(run.stdout, /\"readyForPilot\": false/);
});


test('development-baseline production tests are isolated from canonical workflow mutations', async () => {
  const [passB, passC] = await Promise.all([
    readFile('tests/corpus-production-pass-b.test.mjs','utf8'),
    readFile('tests/corpus-production-pass-c.test.mjs','utf8')
  ]);
  for (const source of [passB, passC]) {
    assert.match(source,/corpus\/staging\/phase4-smoke-base-bundle\.json/);
    assert.match(source,/planPilotIntake/);
    assert.doesNotMatch(source,/loadCorpusInput\(path\.join\(root, 'public\/data'\)\)/);
    assert.doesNotMatch(source,/readJson\(path\.join\(root, 'corpus\/pilot\/v1-pilot-intake\.json'\)\)/);
  }
});
