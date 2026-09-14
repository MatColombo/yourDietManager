import fs from 'node:fs/promises';
import { validateTraceability } from '../validate-revision-v2-traceability.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const trace=await validateTraceability(),state=await read('reports/revision_v2/STATE.json'),requirements=(await read('specs/revision_v2/TRACEABILITY.json')).requirements,tests=(await read('specs/revision_v2/TEST_REGISTRY.json')).tests.filter(t=>t.core);
const blockers=[...trace.errors,...tests.filter(t=>t.status!=='PASS'||!t.completeScope).map(t=>`${t.id}: incomplete`),...requirements.filter(r=>!r.id.startsWith('EXT-')&&r.status!=='VERIFICATO').map(r=>`${r.id}: ${r.status}`),...state.openCoreIssues.filter(i=>['P0','P1'].includes(i.severity)).map(i=>`Open ${i.id || i.reviewId}: ${i.severity}`)];
if(tests.length!==74)blockers.push('Expected exactly 74 core acceptance scenarios');
const report={schemaVersion:1,buildSha256:trace.buildSha256,coreScenarios:tests.length,completeScenarios:tests.filter(t=>t.status==='PASS'&&t.completeScope).length,status:blockers.length?'BLOCKED':'CORE_CANDIDATE_VERIFIED',stablePromotion:false,blockers};
await fs.mkdir('reports/revision_v2/R8',{recursive:true});await fs.writeFile('reports/revision_v2/R8/core-gate.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,complete:report.completeScenarios,total:74,blockers:blockers.length}));if(blockers.length)process.exitCode=2;
