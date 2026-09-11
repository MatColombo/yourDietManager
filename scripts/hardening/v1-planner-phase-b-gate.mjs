import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';

const root = process.cwd();
const readText = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await readText(file));
const [pkg, catalog, eligibility, buildEvidence, publicationEvidence, worker, offline, browser, workflow, generator] = await Promise.all([
  readJson('package.json'), loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/planner-phase-b/recipe-eligibility.json'),
  readJson('corpus/production/planner-phase-b/build-evidence.json'),
  readJson('corpus/production/planner-phase-b/publication-evidence.json'),
  readText('public/service-worker.js'), readText('src/services/offlineCatalog.js'),
  readText('scripts/hardening/browser-regression.mjs'), readText('.github/workflows/v1-release-candidate.yml'),
  readText('src/corpus/v1PhaseBRecipeGenerator.js')
]);

const checks = []; const failures = [];
function check(id, pass, detail) { const row={id,pass:Boolean(pass),detail}; checks.push(row); if(!row.pass) failures.push(row); }
const activeIngredients=catalog.ingredientFamilies.filter(x=>x.status==='active');
const activeRecipes=catalog.recipeFamilies.filter(x=>x.status==='active');
const core=catalog.manifest.packs.find(p=>p.packId==='core');
const usedIngredientIds=new Set(catalog.recipeVersions.flatMap(v=>(v.ingredientLines||[]).map(l=>l.ingredientId)));
const dietCounts={vegetarian:0,vegan:0,pescatarian:0};
const practicalCounts={quick:0,noCook:0,cold:0};
for(const v of catalog.recipeVersions){
  const diet=v.tags?.diet||[]; if(diet.includes('diet_vegetarian'))dietCounts.vegetarian++; if(diet.includes('diet_vegan'))dietCounts.vegan++; if(diet.includes('diet_pescatarian'))dietCounts.pescatarian++;
  const tags=v.tags?.practical||[]; if(tags.includes('practical_quick'))practicalCounts.quick++; if(tags.includes('practical_no_cook'))practicalCounts.noCook++; if(tags.includes('practical_cold_suitable'))practicalCounts.cold++;
}
const expectedBandCounts={
  breakfast:{'kcal-050-149':50,'kcal-150-249':75,'kcal-250-349':80,'kcal-350-449':75,'kcal-450-599':50,'kcal-600-699':20},
  lunch:{'kcal-180-299':70,'kcal-300-399':80,'kcal-400-499':100,'kcal-500-599':90,'kcal-600-699':60,'kcal-700-849':40,'kcal-850-949':10},
  dinner:{'kcal-180-299':70,'kcal-300-399':80,'kcal-400-499':100,'kcal-500-599':90,'kcal-600-699':60,'kcal-700-849':40,'kcal-850-949':10},
  snack:{'kcal-060-119':50,'kcal-120-179':70,'kcal-180-239':70,'kcal-240-299':60,'kcal-300-399':50},
  mini_meal:{'kcal-080-149':40,'kcal-150-219':55,'kcal-220-299':60,'kcal-300-399':55,'kcal-400-499':40}
};
const bandCountsExact=Object.entries(expectedBandCounts).every(([meal,bands])=>Object.entries(bands).every(([band,n])=>buildEvidence.coverage?.[meal]?.bands?.[band]===n));
const quality=publicationEvidence.quality||{};
const zeroQuality=['schemaErrors','unknownIngredientReferences','nutritionErrors','allergenDerivationErrors','missingRequiredLocaleFields','exactDuplicateCount','nearDuplicateCount'].every(k=>Number(quality[k]||0)===0);

check('phase-b-app-version', pkg.version===APP_VERSION && /^1\.0\.0(?:-rc\.\d+)?$/.test(APP_VERSION), `package=${pkg.version}, runtime=${APP_VERSION}`);
check('phase-b-lineage-epoch', ['v1-planner-phase-b-epoch-1','v1-planner-phase-d-epoch-1'].includes(PRE_V1_DATA_EPOCH), PRE_V1_DATA_EPOCH);
check('catalog-1800-publication-state', ['1.1.0-planner-phase-b','1.2.0-planner-phase-d'].includes(catalog.manifest.catalogVersion) && activeRecipes.length===1800 && catalog.recipeVersions.length===1800 && (APP_VERSION==='1.0.0' ? (catalog.manifest.publication?.channel==='production_release' && catalog.manifest.publication?.releaseEligible===true) : (catalog.manifest.publication?.channel==='development' && catalog.manifest.publication?.releaseEligible===false)), `catalog=${catalog.manifest.catalogVersion}, recipes=${activeRecipes.length}/${catalog.recipeVersions.length}, channel=${catalog.manifest.publication?.channel}`);
check('ingredient-base-coherent', activeIngredients.length===600 && catalog.ingredientRevisions.length===600, `ingredients=${activeIngredients.length}/${catalog.ingredientRevisions.length}`);
check('functional-ingredient-expansion', eligibility.usableIngredientIds?.length>=300 && buildEvidence.usedIngredientCount>=300 && usedIngredientIds.size===buildEvidence.usedIngredientCount, `eligible=${eligibility.usableIngredientIds?.length}, used=${usedIngredientIds.size}`);
check('fixed-template-only', eligibility.quantityStrategy==='fixed-template-only' && eligibility.releaseRules?.allowServingScaling===false && eligibility.releaseRules?.allowEnergyFittingByIngredientAmount===false && buildEvidence.servingScalingAllowed===false && buildEvidence.energyFittingByIngredientAmountAllowed===false && publicationEvidence.servingScalingAllowed===false && publicationEvidence.energyFittingByIngredientAmountAllowed===false, 'serving scaling and target-fitting by ingredient amount are prohibited');
check('generator-no-energy-solver', !/solveEnergy\s*\(/.test(generator) && /quantityStrategy:'fixed-template-only'/.test(generator), 'Phase B generator filters fixed templates into bands; it does not fit quantities to targets');
check('serving-count-fixed', catalog.recipeVersions.every(v=>v.servingCount===1), 'all RecipeVersion servingCount=1');
check('coverage-matrix-exact', bandCountsExact, 'all 31 energy-band quotas match the Phase B matrix');
check('meal-energy-envelope', buildEvidence.coverage.breakfast.minEnergyKcal<100 && buildEvidence.coverage.breakfast.maxEnergyKcal>=650 && buildEvidence.coverage.lunch.minEnergyKcal<=200 && buildEvidence.coverage.lunch.maxEnergyKcal>=900 && buildEvidence.coverage.dinner.minEnergyKcal<=200 && buildEvidence.coverage.dinner.maxEnergyKcal>=900 && buildEvidence.coverage.snack.minEnergyKcal<80 && buildEvidence.coverage.snack.maxEnergyKcal>=350, JSON.stringify(Object.fromEntries(Object.entries(buildEvidence.coverage).map(([k,v])=>[k,[v.minEnergyKcal,v.maxEnergyKcal]]))));
check('diet-variety-floor', dietCounts.vegetarian>=1000 && dietCounts.vegan>=350 && dietCounts.pescatarian>=150, JSON.stringify(dietCounts));
check('practical-variety-floor', practicalCounts.quick>=1000 && practicalCounts.noCook>=500 && practicalCounts.cold>=500, JSON.stringify(practicalCounts));
check('publication-quality-zero', zeroQuality, JSON.stringify(quality));
check('core-pack-full-validation-corpus', core?.required===true && core.recipeVersionIds?.length===1800, `core=${core?.recipeVersionIds?.length||0}`);
check('pwa-cache-phase-b', /ydm-shell-v37-/.test(worker) && /ydm-data-v17-/.test(worker) && /ydm-data-v17-/.test(offline), 'shell=v37, data=v17');
check('browser-count-dynamic', /expectedRecipeCount/.test(browser) && /expectedCatalogVersion/.test(browser) && !/recipeCount === 500/.test(browser), 'browser acceptance derives count/version from built manifest');
check('phase-b-workflow', /corpus:build-planner-phase-b/.test(workflow) && /corpus:build-planner-phase-d/.test(workflow) && /catalog:publish-planner-phase-d/.test(workflow) && /git diff --exit-code/.test(workflow) && /v1:planner-phase-b/.test(workflow), 'current manual CI rebuilds Phase B source before Phase D enrichment');
check('not-release-candidate', publicationEvidence.status==='planner_validation' && publicationEvidence.publication?.releaseEligible===false, `status=${publicationEvidence.status}`);

const report={schemaVersion:1,suite:'v1-planner-phase-b',checkedAt:new Date().toISOString(),status:failures.length?'failed':'passed',checks,failures,metrics:{recipes:catalog.recipeVersions.length,eligibleIngredients:eligibility.usableIngredientIds.length,usedIngredients:usedIngredientIds.size,dietCounts,practicalCounts}};
await mkdir(path.join(root,'reports'),{recursive:true}); await writeFile(path.join(root,'reports/v1-planner-phase-b-gate.json'),JSON.stringify(report,null,2)+'\n');
for(const row of checks)console.log(`${row.pass?'PASS':'FAIL'} ${row.id}: ${row.detail}`);
if(failures.length){console.error(`V1 Planner Phase B gate failed: ${failures.map(x=>x.id).join(', ')}`);process.exitCode=1;}else console.log(`V1 Planner Phase B gate PASS (${checks.length}/${checks.length})`);
