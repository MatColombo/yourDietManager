import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../../src/db/constants.js';
import { assertReferenceData, referenceDataDigest } from '../../src/services/referenceDataService.js';
import { productionContractDigest } from '../../src/corpus/productionCorpus.js';

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'public/data/catalog-manifest.json'), 'utf8'));
const productionContract = JSON.parse(await readFile(path.join(root, 'corpus/contracts/v1-production.json'), 'utf8'));
const expectedProductionContractDigest = await productionContractDigest(productionContract);
const ingredientFiles = manifest.ingredientRevisions.shards.map(shard => path.join(root, 'public/data', shard.path));
const ingredientRevisions = (await Promise.all(ingredientFiles.map(async file => JSON.parse(await readFile(file, 'utf8'))))).flat();

const referencePart = async part => {
  if (!manifest[part]?.shards?.length) return [];
  const values = [];
  for (const shard of manifest[part].shards) values.push(...JSON.parse(await readFile(path.join(root, 'public/data', shard.path), 'utf8')));
  return values;
};
const taxonomies = await referencePart('taxonomies');
const taxonomyTerms = await referencePart('taxonomyTerms');
let referenceDataValid = true;
let actualReferenceDigest = null;
try {
  assertReferenceData(taxonomies, taxonomyTerms);
  actualReferenceDigest = await referenceDataDigest(taxonomies, taxonomyTerms);
} catch {
  referenceDataValid = false;
}
const blockers = [];
const checks = [];
const check = (id, pass, detail, blocker = true) => { checks.push({ id, pass, detail }); if (!pass && blocker) blockers.push({ id, detail }); };


check('reference-data-present', Boolean(manifest.referenceDataVersion && manifest.referenceDataDigest && taxonomies.length && taxonomyTerms.length), `version=${manifest.referenceDataVersion || 'missing'}, taxonomies=${taxonomies.length}, terms=${taxonomyTerms.length}`);
check('reference-data-valid', referenceDataValid, `valid=${referenceDataValid}`);
check('reference-data-digest', Boolean(actualReferenceDigest && actualReferenceDigest === manifest.referenceDataDigest), `manifest=${manifest.referenceDataDigest || 'missing'}, actual=${actualReferenceDigest || 'invalid'}`);
check('app-version-sync', pkg.version === APP_VERSION, `package=${pkg.version}, runtime=${APP_VERSION}`);
check('recipe-corpus-minimum', manifest.recipeVersions.count >= 3000, `recipeVersions=${manifest.recipeVersions.count}, required>=3000`);
check('production-contract-traceability', Boolean(manifest.productionCorpus && manifest.productionCorpus.contractId === productionContract.contractId && manifest.productionCorpus.contractVersion === productionContract.contractVersion && manifest.productionCorpus.contractDigest === expectedProductionContractDigest && manifest.productionCorpus.policyId === productionContract.policyId && manifest.productionCorpus.policyVersion === productionContract.policyVersion), `manifest=${manifest.productionCorpus ? `${manifest.productionCorpus.contractId}@${manifest.productionCorpus.contractVersion}` : 'missing'}, expected=${productionContract.contractId}@${productionContract.contractVersion}`);
check('production-pipeline', manifest.pipelineVersion === productionContract.pipelineVersion, `pipelineVersion=${manifest.pipelineVersion}, expected=${productionContract.pipelineVersion}`);
const uncurated = ingredientRevisions.filter(record => record.origin === 'base' && (record.quality?.status !== 'curated' || record.quality?.confidence !== 'high'));
check('curated-high-confidence-ingredients', uncurated.length === 0, `uncuratedBaseIngredientRevisions=${uncurated.length}`);
check('catalog-not-dev-version', !/-dev\b/i.test(manifest.catalogVersion), `catalogVersion=${manifest.catalogVersion}`);

const report = { version: 1, generatedAt: new Date().toISOString(), candidateAppVersion: APP_VERSION, catalogVersion: manifest.catalogVersion, checks, releasable: blockers.length === 0, blockers };
await writeFile(path.join(root, 'reports/v1-release-gate.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`V1 release gate: ${report.releasable ? 'PASS' : 'BLOCKED'} (${checks.length - blockers.length}/${checks.length} blocking checks pass)`);
for (const blocker of blockers) console.log(`- ${blocker.id}: ${blocker.detail}`);
if (!report.releasable) process.exitCode = 2;
