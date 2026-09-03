import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';
import { publishCatalogRelease, validateReleaseData } from './release-lib.mjs';

const corpusInput = process.argv[2];
const policyFile = process.argv[3] || 'corpus/policies/v1-default.json';
const catalogVersion = process.argv[4];
const outputDir = process.argv[5] || (catalogVersion ? `corpus/releases/${catalogVersion}` : null);
const allowDevelopmentIngredients = process.argv.includes('--allow-development-ingredients');
if (!corpusInput || !catalogVersion || !outputDir) {
  console.error('Usage: node scripts/corpus/publish-release.mjs <catalog-data-dir|bundle.json> [policy.json] <catalogVersion> [outputDir] [--allow-development-ingredients]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, policy] = await Promise.all([loadCorpusInput(corpusInput), readJson(policyFile)]); registry.assert('recipeCorpusPolicy', policy);
const validation = await validateReleaseData({ policy, catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry, requireCuratedIngredients: !allowDevelopmentIngredients });
const validationFile = path.join('corpus/reports', `release-${catalogVersion}-validation.json`); await writeJson(validationFile, validation);
if (!validation.valid) {
  console.error(JSON.stringify({ valid: false, issues: validation.issues, releaseGates: validation.releaseGates }, null, 2));
  process.exit(3);
}
const manifest = await publishCatalogRelease({ outputDir, catalogVersion, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, registry });
console.log(JSON.stringify({ valid: true, outputDir, validationFile, manifest }, null, 2));
