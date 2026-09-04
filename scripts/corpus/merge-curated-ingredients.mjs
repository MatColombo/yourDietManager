import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2];
const materializedDir = process.argv[3];
const outputFile = process.argv[4] || 'corpus/staging/production-foundation-bundle.json';
const retirementFile = process.argv[5] || null;
if (!corpusInput || !materializedDir) {
  console.error('Usage: node scripts/corpus/merge-curated-ingredients.mjs <catalog-data-dir|bundle.json> <materialized-dir> [output-bundle] [explicit-retirement-map.json]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const [corpus, families, revisions] = await Promise.all([
  loadCorpusInput(corpusInput), readJson(path.join(materializedDir, 'ingredient-families.json')), readJson(path.join(materializedDir, 'ingredient-revisions.json'))
]);
for (const family of families) registry.assert('ingredient', family);
for (const revision of revisions) registry.assert('ingredientRevision', revision);
const existingFamilyIds = new Set(corpus.ingredientFamilies.map(item => item.ingredientId));
const existingRevisionIds = new Set(corpus.ingredientRevisions.map(item => item.ingredientRevisionId));
for (const family of families) if (existingFamilyIds.has(family.ingredientId)) throw new Error(`Ingredient family ${family.ingredientId} already exists; use an explicit revision/update workflow instead of merge`);
for (const revision of revisions) if (existingRevisionIds.has(revision.ingredientRevisionId)) throw new Error(`Ingredient revision ${revision.ingredientRevisionId} already exists`);

const mergedFamilies = structuredClone(corpus.ingredientFamilies);
if (retirementFile) {
  const retirement = await readJson(retirementFile);
  registry.assert('ingredientRetirementMap', retirement);
  for (const item of retirement.retirements || []) {
    const family = mergedFamilies.find(entry => entry.ingredientId === item.ingredientId);
    if (!family) throw new Error(`Retirement map references unknown ingredient ${item.ingredientId}`);
    if (!item.replacementIngredientId || !families.some(entry => entry.ingredientId === item.replacementIngredientId)) throw new Error(`Retirement ${item.ingredientId} must point to a newly materialized replacement`);
    family.status = 'retired'; family.updatedAt = new Date().toISOString();
  }
}
mergedFamilies.push(...families);
const output = { ...corpus, catalogVersion: corpus.manifest?.catalogVersion || corpus.catalogVersion, ingredientFamilies: mergedFamilies, ingredientRevisions: [...corpus.ingredientRevisions, ...revisions] };
await writeJson(outputFile, output);
console.log(JSON.stringify({ outputFile, addedFamilies: families.length, addedRevisions: revisions.length, retiredFamilies: mergedFamilies.filter(item => item.status === 'retired').length }, null, 2));
