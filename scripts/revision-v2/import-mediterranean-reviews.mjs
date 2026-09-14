import fs from 'node:fs/promises';
import { publicationReadiness } from '../../src/corpus/mediterranean/sourceAdapters.js';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/revision-v2/import-mediterranean-reviews.mjs <review-decisions.json>');
const base = 'data/revision-v2/mediterranean';
const decisions = JSON.parse(await fs.readFile(file,'utf8'));
if (decisions.schemaVersion !== 1 || !Array.isArray(decisions.records)) throw new Error('Expected a versioned review envelope');
const staged = JSON.parse(await fs.readFile(`${base}/staging.json`,'utf8'));
const manifest = JSON.parse(await fs.readFile(`${base}/manifest.json`,'utf8'));
let existing; try { existing=JSON.parse(await fs.readFile(`${base}/review-decisions.json`,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; existing={schemaVersion:1,records:[]}; }
for (const decision of decisions.records) {
  const source = staged.records.find(r=>r.source===decision.source && r.sourceRecordId===decision.sourceRecordId);
  if (!source || source.contentDigest!==decision.contentDigest) throw new Error('Review refers to missing or changed source');
  const concept=manifest.concepts.find(c=>c.conceptId===decision.mapping?.conceptId);
  if(!concept?.forms.some(f=>f.formId===decision.mapping?.formId)) throw new Error('Review mapping is outside the nominal manifest');
  const record={...source,mapping:decision.mapping,reviews:{...source.reviews,...decision.reviews}};
  const result=await publicationReadiness(record);
  if (!result.publishable) throw new Error(`Review incomplete or stale: ${result.reasons.join(', ')}`);
  // This command imports attestations supplied by a reviewer; it does not generate any decision.
  existing.records.push({...decision,importedAt:new Date().toISOString()});
}
await fs.writeFile(`${base}/review-decisions.json`,JSON.stringify(existing,null,2)+'\n');
console.log(JSON.stringify({imported:decisions.records.length,published:0,next:'npm run revision:v2:mediterranean'}));
