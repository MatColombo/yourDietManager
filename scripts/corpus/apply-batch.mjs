import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const batchFile = process.argv[3];
const output = process.argv[4] || 'corpus/staging/corpus-bundle.json';
const targetCatalogVersion = process.argv[5] || null;
if (!corpusInput || !batchFile) {
  console.error('Usage: node scripts/corpus/apply-batch.mjs <catalog-data-dir|bundle.json> <batch-result.json> [output-bundle.json] [targetCatalogVersion]');
  process.exit(2);
}
const [corpus, batch] = await Promise.all([loadCorpusInput(corpusInput), readJson(batchFile)]);
if (!batch.targetMet || !batch.diversityPassed) throw new Error('Batch cannot be applied until targetMet and diversityPassed are both true');
const recipeFamilyIds = new Set(corpus.recipeFamilies.map(record => record.recipeId));
const recipeVersionIds = new Set(corpus.recipeVersions.map(record => record.recipeVersionId));
for (const family of batch.families || []) if (recipeFamilyIds.has(family.recipeId)) throw new Error(`Recipe family collision ${family.recipeId}`);
for (const version of batch.versions || []) if (recipeVersionIds.has(version.recipeVersionId)) throw new Error(`Recipe version collision ${version.recipeVersionId}`);
const bundle = {
  schemaVersion: 1,
  catalogVersion: targetCatalogVersion || batch.versions?.[0]?.catalogVersion || corpus.manifest.catalogVersion,
  ingredientFamilies: corpus.ingredientFamilies,
  ingredientRevisions: corpus.ingredientRevisions,
  recipeFamilies: [...corpus.recipeFamilies, ...(batch.families || [])],
  recipeVersions: [...corpus.recipeVersions, ...(batch.versions || [])]
};
await writeJson(output, bundle);
console.log(`Applied ${batch.acceptedCount || 0} accepted recipes -> ${output}`);
