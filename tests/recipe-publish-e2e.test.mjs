import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

async function fixture() {
  return JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/recipe-publish-new-ingredient.json'), 'utf8'));
}

test('recipe publisher compiles one new v2 ingredient and a recipe using it', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ydm-recipe-publish-'));
  const proposals = path.join(temp, 'recipes');
  const output = path.join(temp, 'output');
  await import('node:fs/promises').then(fs => fs.mkdir(proposals, { recursive: true }));
  await writeFile(path.join(proposals, '001-fixture.json'), `${JSON.stringify(await fixture(), null, 2)}\n`);
  try {
    const run = spawnSync(process.execPath, ['scripts/recipes/publish-proposal.mjs', '--check'], {
      cwd: ROOT,
      env: { ...process.env, YDM_RECIPE_PROPOSAL_DIR: proposals, YDM_RECIPE_PUBLISH_OUTPUT: output },
      encoding: 'utf8',
      timeout: 120000
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const summary = JSON.parse(run.stdout.trim());
    assert.equal(summary.catalogVersion, '1.3.1-dev.recipes');
    assert.equal(summary.counts.ingredients, 601);
    assert.equal(summary.counts.recipes, 1801);
    assert.equal(summary.proposals[0].addedIngredients, 1);
    assert.equal(summary.proposals[0].addedRecipes, 1);

    const manifest = JSON.parse(await readFile(path.join(output, 'release/data/catalog-manifest.json'), 'utf8'));
    const ingredientFiles = manifest.ingredientRevisions.shards;
    const revisions = [];
    for (const part of ingredientFiles) {
      const rows = JSON.parse(await readFile(path.join(output, 'release/data', part.path), 'utf8'));
      revisions.push(...rows);
    }
    const added = revisions.find(row => row.i18n?.it?.name === 'Zucchina grigliata E2E');
    assert.ok(added, 'new ingredient must be materialized');
    assert.equal(added.schemaVersion, 2);
    assert.equal(added.safetyEvidence.assessmentStatus, 'reviewed');
    assert.equal(added.productTaxonomy.conceptId, 'product_concept_zucchini');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
