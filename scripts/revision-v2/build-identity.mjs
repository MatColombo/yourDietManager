import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export async function buildIdentity(root = process.cwd()) {
  const files = [];
  async function walk(relative) {
    for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(name); else if (item.isFile()) files.push(name);
    }
  }
  for (const directory of ['src', 'schemas', 'public', 'scripts', 'tests', 'data']) await walk(directory);
  files.push('package.json', 'index.html'); files.sort();
  const records = await Promise.all(files.map(async file => ({ file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') })));
  return { algorithm: 'sha256(sorted path/file-sha256 JSON)', sha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), files: records };
}
