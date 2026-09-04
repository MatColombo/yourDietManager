import path from 'node:path';
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readJson, writeJson } from './io-lib.mjs';

const sourceId = process.argv[2];
const outputRoot = process.argv[3] || 'corpus/sources/cache';
const manifestOnly = process.argv.includes('--manifest-only');
if (!sourceId) { console.error('Usage: node scripts/corpus/fetch-fdc-source.mjs <sourceId> [outputRoot] [--manifest-only]'); process.exit(2); }
const policy = await readJson('corpus/curation/v1-ingredient-curation-policy.json');
const source = policy.sourcePriority.find(item => item.sourceId === sourceId);
if (!source) throw new Error(`Unknown curated source ${sourceId}`);
if (!source.archive) throw new Error(`Source ${sourceId} does not define an archive URL`);
if (manifestOnly) { console.log(JSON.stringify(source, null, 2)); process.exit(0); }

async function collectJsonFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collectJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      const info = await stat(full);
      out.push({ file: full, bytes: info.size });
    }
  }
  return out;
}

const sourceDir = path.join(outputRoot, sourceId); await mkdir(sourceDir, { recursive: true });
const zipName = path.basename(new URL(source.archive).pathname); const zipFile = path.join(sourceDir, zipName);
const response = await fetch(source.archive, { headers: { 'user-agent': 'yourDietManager ingredient curation/1.0' } });
if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText} for ${source.archive}`);
const bytes = Buffer.from(await response.arrayBuffer());
await writeFile(zipFile, bytes);
const sha256 = createHash('sha256').update(bytes).digest('hex');
await new Promise((resolve, reject) => {
  const child = spawn('unzip', ['-o', zipFile, '-d', sourceDir], { stdio: 'inherit' });
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`unzip exited ${code}`)));
  child.on('error', reject);
});
const jsonFiles = (await collectJsonFiles(sourceDir)).sort((a,b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
if (!jsonFiles.length) throw new Error(`No JSON file found after extracting ${zipFile}`);
const manifest = {
  schemaVersion: 1, sourceId, provider: source.provider, dataset: source.dataset, release: source.release,
  archive: source.archive, downloadedAt: new Date().toISOString(), archiveBytes: bytes.length, archiveSha256: sha256,
  primaryJsonFile: jsonFiles[0].file,
  extractedJsonFiles: jsonFiles.map(item => item.file),
  extractedJson: jsonFiles
};
await writeJson(path.join(sourceDir, 'acquisition-manifest.json'), manifest);
console.log(JSON.stringify(manifest, null, 2));
