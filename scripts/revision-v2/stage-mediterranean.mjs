import fs from 'node:fs/promises';
import { sourceAdapters } from '../../src/corpus/mediterranean/sourceAdapters.js';
import { mediterraneanCoverage } from '../../src/corpus/mediterranean/coverage.js';
const base = 'data/revision-v2/mediterranean';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const manifest = await read(`${base}/manifest.json`), briefs = await read(`${base}/dish-briefs.json`);
let reviews = { records: [] }; try { reviews = await read(`${base}/review-decisions.json`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const records = [];
for (const name of (await fs.readdir(`${base}/sources`)).sort()) {
  if (!name.endsWith('.json')) continue;
  const input = await read(`${base}/sources/${name}`);
  if (!sourceAdapters[input.source]) throw new Error(`Unsupported adapter ${input.source}`);
  const record = await sourceAdapters[input.source](input.raw, input.context);
  record.mapping = input.proposedMapping || null;
  const decision = reviews.records.filter(row => row.source === record.source && row.sourceRecordId === record.sourceRecordId && row.contentDigest === record.contentDigest).at(-1);
  if (decision) { record.mapping = decision.mapping; record.reviews = { ...record.reviews, ...decision.reviews }; }
  records.push(record);
}
await fs.mkdir('reports/revision_v2/R5', { recursive: true });
await fs.writeFile(`${base}/staging.json`, JSON.stringify({ schemaVersion: 1, records }, null, 2)+'\n');
const report = await mediterraneanCoverage(manifest, records, briefs.dishes);
await fs.writeFile('reports/revision_v2/R5/coverage.json', JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ planned: report.planned, reviewed: report.reviewed, pilot: report.pilot, scaleStatus: report.scaleStatus }));
