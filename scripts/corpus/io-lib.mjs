import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
export async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }

export async function loadLocalCatalog(dataDir) {
  const manifest = await readJson(path.join(dataDir, 'catalog-manifest.json'));
  const out = { manifest };
  for (const part of ['taxonomies', 'taxonomyTerms', 'ingredientFamilies', 'ingredientRevisions', 'recipeFamilies', 'recipeVersions']) {
    if (!manifest[part]) { out[part] = []; continue; }
    const values = [];
    for (const shard of manifest[part].shards) values.push(...await readJson(path.join(dataDir, shard.path)));
    out[part] = values;
  }
  return out;
}

export async function loadCorpusInput(input) {
  const info = await stat(input);
  if (info.isDirectory()) return loadLocalCatalog(input);
  const doc = await readJson(input);
  for (const key of ['ingredientFamilies', 'ingredientRevisions', 'recipeFamilies', 'recipeVersions']) {
    if (!Array.isArray(doc[key])) throw new Error(`Corpus bundle ${input} is missing ${key}`);
  }
  const catalogVersion = doc.catalogVersion || doc.manifest?.catalogVersion;
  if (!catalogVersion) throw new Error(`Corpus bundle ${input} is missing catalogVersion`);
  return { ...doc, taxonomies: doc.taxonomies || [], taxonomyTerms: doc.taxonomyTerms || [], manifest: doc.manifest || { catalogVersion } };
}

export function currentRecipeVersions(corpus) {
  const byId = new Map(corpus.recipeVersions.map(record => [record.recipeVersionId, record]));
  return corpus.recipeFamilies.filter(family => family.status === 'active').map(family => byId.get(family.currentVersionId)).filter(Boolean);
}
