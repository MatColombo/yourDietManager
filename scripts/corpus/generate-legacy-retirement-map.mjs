import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { readJson, writeJson } from './io-lib.mjs';

const materializedDir = process.argv[2];
const output = process.argv[3] || 'corpus/curation/v1-legacy-fixture-retirement.json';
if (!materializedDir) { console.error('Usage: node scripts/corpus/generate-legacy-retirement-map.mjs <materializedDir> [output.json]'); process.exit(2); }
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [families,revisions] = await Promise.all([readJson(path.join(materializedDir,'ingredient-families.json')),readJson(path.join(materializedDir,'ingredient-revisions.json'))]);
for (const family of families) registry.assert('ingredient', family); for (const revision of revisions) registry.assert('ingredientRevision', revision);
const byRevision = new Map(revisions.map(item=>[item.ingredientRevisionId,item]));
const entries = families.map(family=>({family,revision:byRevision.get(family.currentRevisionId)})).filter(item=>item.revision);
const RULES = [
  { ingredientId:'ing_salmon', pattern:/\bsalmon\b/i, preferredState:'raw', rationale:'Replace Phase 1 salmon development fixture with a curated/high USDA salmon concept.' },
  { ingredientId:'ing_rice_cooked', pattern:/\brice\b.*\bcooked\b|\bcooked\b.*\brice\b/i, preferredState:'cooked', rationale:'Replace Phase 1 cooked-rice development fixture with a curated/high USDA cooked rice concept.' },
  { ingredientId:'ing_zucchini', pattern:/\bzucchini\b/i, preferredState:'raw', rationale:'Replace Phase 1 zucchini development fixture with a curated/high USDA zucchini concept.' },
  { ingredientId:'ing_olive_oil', pattern:/\bolive oil\b|\boil, olive\b/i, preferredState:null, rationale:'Replace Phase 1 olive-oil development fixture with a curated/high USDA olive oil concept.' }
];
function enText(entry) { return [entry.revision.i18n?.en?.name,...(entry.revision.i18n?.en?.aliases||[])].filter(Boolean).join(' | '); }
const now = new Date().toISOString(); const retirements=[]; const choices=[];
for (const rule of RULES) {
  const matches = entries.filter(entry=>rule.pattern.test(enText(entry)) && entry.revision.quality?.status==='curated' && entry.revision.quality?.confidence==='high');
  matches.sort((a,b)=>{
    const ap = rule.preferredState && a.revision.basis?.state===rule.preferredState ? 0 : 1;
    const bp = rule.preferredState && b.revision.basis?.state===rule.preferredState ? 0 : 1;
    return ap-bp || a.family.ingredientId.localeCompare(b.family.ingredientId);
  });
  if (!matches.length) throw new Error(`No explicit curated/high replacement found for ${rule.ingredientId}`);
  const chosen=matches[0];
  retirements.push({ ingredientId:rule.ingredientId, replacementIngredientId:chosen.family.ingredientId, rationale:rule.rationale, approvedBy:'ydm-deterministic-fdc-curator-v1', approvedAt:now });
  choices.push({ ingredientId:rule.ingredientId, replacementIngredientId:chosen.family.ingredientId, replacementNameEn:chosen.revision.i18n?.en?.name, replacementState:chosen.revision.basis?.state, sourceRecordId:chosen.revision.source?.sourceRecordId, candidateMatchCount:matches.length });
}
const map={ schemaVersion:1, mapId:'phase4-production-legacy-fixture-retirement-v1', retirements };
registry.assert('ingredientRetirementMap',map); await writeJson(output,map);
console.log(JSON.stringify({ output, choices }, null, 2));
