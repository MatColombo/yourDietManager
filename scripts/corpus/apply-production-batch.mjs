import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertProductionRecipePipelinePolicy, verifyIndustrializedBatchReport } from '../../src/corpus/productionRecipePipeline.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2]; const resultFile = process.argv[3]; const reportFile = process.argv[4]; const output = process.argv[5] || 'corpus/staging/production-bundle.json'; const targetCatalogVersion = process.argv[6] || null;
if (!corpusInput || !resultFile || !reportFile) {
  console.error('Usage: node scripts/corpus/apply-production-batch.mjs <catalog-data-dir|bundle.json> <result.json> <batch-report.json> [output-bundle.json] [targetCatalogVersion]'); process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, result, report, pipelinePolicy, contract, corpusPolicy, curationPolicy] = await Promise.all([
  loadCorpusInput(corpusInput), readJson(resultFile), readJson(reportFile), readJson('corpus/production/v1-recipe-pipeline-policy.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/policies/v1-default.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json')
]);
assertProductionRecipePipelinePolicy(pipelinePolicy, contract, corpusPolicy, curationPolicy, registry);
await verifyIndustrializedBatchReport({ result, report, pipelinePolicy, registry });
const familyIds = new Set(corpus.recipeFamilies.map(record => record.recipeId)); const versionIds = new Set(corpus.recipeVersions.map(record => record.recipeVersionId));
for (const family of result.families || []) if (familyIds.has(family.recipeId)) throw new Error(`Recipe family collision ${family.recipeId}`);
for (const version of result.versions || []) if (versionIds.has(version.recipeVersionId)) throw new Error(`Recipe version collision ${version.recipeVersionId}`);
const catalogVersion = targetCatalogVersion || result.versions?.[0]?.catalogVersion || corpus.manifest.catalogVersion;
const bundle = {
  schemaVersion: 1, catalogVersion,
  taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions,
  recipeFamilies: [...corpus.recipeFamilies, ...(result.families || [])], recipeVersions: [...corpus.recipeVersions, ...(result.versions || [])],
  manifest: { catalogVersion, referenceDataVersion: corpus.manifest.referenceDataVersion, referenceDataDigest: corpus.manifest.referenceDataDigest }
};
await writeJson(output, bundle);
console.log(JSON.stringify({ applied: result.acceptedCount, reportId: report.reportId, catalogVersion, output }, null, 2));
