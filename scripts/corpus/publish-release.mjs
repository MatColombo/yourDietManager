import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { assertProductionContract } from '../../src/corpus/productionCorpus.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';
import { publishCatalogRelease, validateReleaseData } from './release-lib.mjs';

const corpusInput = process.argv[2];
const policyFile = process.argv[3] || 'corpus/policies/v1-default.json';
const catalogVersion = process.argv[4];
const outputDir = process.argv[5] || (catalogVersion ? `corpus/releases/${catalogVersion}` : null);
const allowDevelopmentIngredients = process.argv.includes('--allow-development-ingredients');
const contractFlag = process.argv.find(arg => arg.startsWith('--contract='));
const contractFile = contractFlag ? contractFlag.slice('--contract='.length) : 'corpus/contracts/v1-production.json';
if (!corpusInput || !catalogVersion || !outputDir) {
  console.error('Usage: node scripts/corpus/publish-release.mjs <catalog-data-dir|bundle.json> [policy.json] <catalogVersion> [outputDir] [--contract=<contract.json>] [--allow-development-ingredients]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, policy] = await Promise.all([loadCorpusInput(corpusInput), readJson(policyFile)]); registry.assert('recipeCorpusPolicy', policy);
const productionContract = allowDevelopmentIngredients ? null : await readJson(contractFile);
if (productionContract) assertProductionContract(productionContract, policy, registry);
const validation = await validateReleaseData({ policy, catalogVersion, taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, requireCuratedIngredients: !allowDevelopmentIngredients, productionContract });
const validationFile = path.join('corpus/reports', `release-${catalogVersion}-validation.json`); await writeJson(validationFile, validation);
if (!validation.valid) {
  console.error(JSON.stringify({ valid: false, issues: validation.issues, releaseGates: validation.releaseGates }, null, 2));
  process.exit(3);
}
const manifest = await publishCatalogRelease({ outputDir, catalogVersion, taxonomies: corpus.taxonomies || [], taxonomyTerms: corpus.taxonomyTerms || [], referenceDataVersion: corpus.manifest?.referenceDataVersion || '1.0.0', ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, productionContract });
console.log(JSON.stringify({ valid: true, outputDir, validationFile, manifest }, null, 2));
