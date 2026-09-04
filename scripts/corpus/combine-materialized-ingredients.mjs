import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { readJson, writeJson } from './io-lib.mjs';

const outDir = process.argv[2] || 'corpus/staging/ingredients-production-combined';
const inputDirs = process.argv.slice(3);
if (!inputDirs.length) {
  console.error('Usage: node scripts/corpus/combine-materialized-ingredients.mjs <outDir> <materializedDir> [materializedDir...]');
  process.exit(2);
}
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const families = []; const revisions = []; const manifests = [];
const familyIds = new Set(); const revisionIds = new Set();
for (const dir of inputDirs) {
  const [sourceFamilies, sourceRevisions, manifest] = await Promise.all([
    readJson(path.join(dir,'ingredient-families.json')), readJson(path.join(dir,'ingredient-revisions.json')), readJson(path.join(dir,'materialization-manifest.json'))
  ]);
  for (const family of sourceFamilies) {
    registry.assert('ingredient', family);
    if (familyIds.has(family.ingredientId)) throw new Error(`Duplicate materialized ingredient family ${family.ingredientId}`);
    familyIds.add(family.ingredientId); families.push(family);
  }
  for (const revision of sourceRevisions) {
    registry.assert('ingredientRevision', revision);
    if (revisionIds.has(revision.ingredientRevisionId)) throw new Error(`Duplicate materialized ingredient revision ${revision.ingredientRevisionId}`);
    revisionIds.add(revision.ingredientRevisionId); revisions.push(revision);
  }
  manifests.push(manifest);
}
families.sort((a,b)=>a.ingredientId.localeCompare(b.ingredientId)); revisions.sort((a,b)=>a.ingredientRevisionId.localeCompare(b.ingredientRevisionId));
await Promise.all([
  writeJson(path.join(outDir,'ingredient-families.json'), families),
  writeJson(path.join(outDir,'ingredient-revisions.json'), revisions),
  writeJson(path.join(outDir,'materialization-manifest.json'), { schemaVersion:1, combinedAt:new Date().toISOString(), ingredientCount:families.length, sourceManifests:manifests.map(item=>({ batchId:item.batchId, sourceId:item.sourceId, sourceInputDigest:item.sourceInputDigest, ingredientCount:item.ingredientCount })) })
]);
console.log(JSON.stringify({ outDir, ingredientFamilies:families.length, ingredientRevisions:revisions.length, sources:manifests.map(item=>item.sourceId) }, null, 2));
