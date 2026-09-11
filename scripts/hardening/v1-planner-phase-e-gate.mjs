import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const read=f=>fs.readFileSync(path.join(root,f),'utf8'); const failures=[]; const checks=[];
function check(id,ok,detail){checks.push({id,ok,detail}); console.log(`${ok?'PASS':'FAIL'} ${id}: ${detail}`); if(!ok) failures.push(id);}
const pkg=JSON.parse(read('package.json')); const constants=read('src/db/constants.js'); const app=read('src/ui/app.js'); const page=read('src/ui/manualAcceptancePage.js'); const service=read('src/services/manualAcceptanceService.js'); const sw=read('public/service-worker.js'); const it=JSON.parse(read('public/data/locales/it.json')); const en=JSON.parse(read('public/data/locales/en.json')); const browser=read('scripts/hardening/browser-regression.mjs');
check('phase-e-version',['1.0.0-rc.34','1.0.0'].includes(pkg.version)&&constants.includes(`APP_VERSION = '${pkg.version}'`),`package=${pkg.version}`);
check('manual-acceptance-route',app.includes("'/manual-acceptance'")&&app.includes('manualAcceptancePage'),'manual acceptance is a first-class route');
check('protocol-coverage',service.includes("energy-800")&&service.includes("energy-2600")&&service.includes("hard-allergen")&&service.includes("soft-preference")&&service.includes("regenerate-alternative")&&service.includes("taxonomy-noodles")&&service.includes("context-drilldown")&&service.includes("shopping")&&service.includes("reload"),'protocol covers energy, hard/soft, regeneration, discovery, navigation and operations');
check('manual-only-storage',service.includes("ydm:manual-acceptance:v1")&&!service.includes('repositories'),'acceptance journal is isolated from domain persistence');
check('release-rule',service.includes('requiredPending === 0')&&service.includes('p0 === 0')&&service.includes('p1 === 0'),'eligibility requires all required PASS and zero P0/P1');
check('no-auto-promotion',!service.includes('releaseEligible')&&!page.includes('releaseEligible')&&!page.includes('1.0.0\''),'manual harness cannot promote stable release');
check('page-actions',['manual-acceptance-page','manual-acceptance-summary','manual-acceptance-eligibility','manual-acceptance-export'].every(id=>page.includes(id)),'page exposes summary, eligibility and export');
check('locale-parity',Object.keys(it).length===Object.keys(en).length&&it['nav.manualAcceptance']&&en['nav.manualAcceptance'],`it=${Object.keys(it).length}, en=${Object.keys(en).length}`);
check('pwa-shell-phase-e',sw.includes('ydm-shell-v37-')&&sw.includes('src/services/manualAcceptanceService.js')&&sw.includes('src/ui/manualAcceptancePage.js'),'shell v37 precaches Phase E harness');
check('browser-phase-e-smoke',browser.includes('manual-acceptance-page')&&browser.includes('manual-acceptance-summary'),'Chromium gate opens manual acceptance page');
check('check-chain',pkg.scripts?.check?.includes('v1:planner-phase-e'),'repository check runs Phase E gate');
const report={schemaVersion:1,suite:'v1-planner-phase-e',checkedAt:new Date().toISOString(),status:failures.length?'failed':'passed',checks,failures}; fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync('reports/v1-planner-phase-e-gate.json',JSON.stringify(report,null,2)+'\n');
if(failures.length){console.error(`Phase E gate failed (${failures.length}/${checks.length})`);process.exit(1);} console.log(`V1 Planner Phase E gate PASS (${checks.length}/${checks.length})`);
