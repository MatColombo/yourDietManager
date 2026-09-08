import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildPhaseBEligibility } from '../src/corpus/v1PhaseBRoleClassifier.js';
import { loadLocalCatalog, readJson } from '../scripts/corpus/io-lib.mjs';
import { SchemaRegistry } from '../src/lib/schemaValidator.js';
import { CatalogImporter } from '../src/services/catalogImporter.js';
import { ensureBootstrapConfiguration } from '../src/services/configurationBootstrap.js';
import { loadConfigurationBundle, saveConfigurationBundle } from '../src/services/configurationService.js';
import { createInitialPreview } from '../src/services/effectivePlanService.js';
import { energyConstraintStatus } from '../src/planner/planMath.js';
import { MemoryRepository, fileFetch, fileLoader } from './helpers.mjs';

const root=process.cwd();
const sourceBundle=await readJson(path.join(root,'corpus/production/v1-release-bundle.json'));
const phaseB=await readJson(path.join(root,'corpus/production/planner-phase-b/bundle.json'));
const evidence=await readJson(path.join(root,'corpus/production/planner-phase-b/build-evidence.json'));

test('Phase B — eligibility expands real culinary coverage without inventing ingredient families', () => {
  const eligibility=buildPhaseBEligibility(sourceBundle);
  const baseIds=new Set(sourceBundle.ingredientFamilies.map(x=>x.ingredientId));
  assert.ok(eligibility.usableIngredientIds.length>=300, `eligible=${eligibility.usableIngredientIds.length}`);
  assert.ok(eligibility.usableIngredientIds.every(id=>baseIds.has(id)));
  assert.equal(eligibility.releaseRules.allowServingScaling,false);
  assert.equal(eligibility.releaseRules.allowEnergyFittingByIngredientAmount,false);
});

test('Phase B — 1800 RecipeVersions are fixed single servings and use at least 300 distinct ingredients', () => {
  assert.equal(phaseB.recipeFamilies.length,1800); assert.equal(phaseB.recipeVersions.length,1800);
  assert.ok(phaseB.recipeVersions.every(v=>v.servingCount===1));
  const used=new Set(phaseB.recipeVersions.flatMap(v=>v.ingredientLines.map(l=>l.ingredientId)));
  assert.ok(used.size>=300, `used=${used.size}`);
  assert.equal(used.size,evidence.usedIngredientCount);
});

test('Phase B — every intended meal class has low, medium and high energy choices', () => {
  const c=evidence.coverage;
  assert.deepEqual(Object.fromEntries(Object.entries(c).map(([k,v])=>[k,v.count])),{breakfast:350,lunch:450,dinner:450,snack:300,mini_meal:250});
  assert.ok(c.breakfast.minEnergyKcal<100 && c.breakfast.maxEnergyKcal>=650);
  assert.ok(c.lunch.minEnergyKcal<=200 && c.lunch.maxEnergyKcal>=900);
  assert.ok(c.dinner.minEnergyKcal<=200 && c.dinner.maxEnergyKcal>=900);
  assert.ok(c.snack.minEnergyKcal<80 && c.snack.maxEnergyKcal>=350);
  assert.ok(c.mini_meal.minEnergyKcal<100 && c.mini_meal.maxEnergyKcal>=450);
});

test('Phase B — public publication is validation-only and has zero structural quality blockers', async () => {
  const [catalog,pub]=await Promise.all([loadLocalCatalog(path.join(root,'public/data')),readJson(path.join(root,'corpus/production/planner-phase-b/publication-evidence.json'))]);
  assert.equal(catalog.manifest.catalogVersion,'1.1.0-planner-phase-b');
  assert.equal(catalog.manifest.publication.channel,'development'); assert.equal(catalog.manifest.publication.releaseEligible,false);
  assert.equal(catalog.recipeVersions.length,1800);
  for(const key of ['schemaErrors','unknownIngredientReferences','nutritionErrors','allergenDerivationErrors','missingRequiredLocaleFields','exactDuplicateCount','nearDuplicateCount']) assert.equal(pub.quality[key],0,key);
});

async function plannerFixture(){
  const repo=new MemoryRepository(); const registry=new SchemaRegistry(fileLoader(path.join(root,'schemas'))); await registry.loadAll();
  await new CatalogImporter({repo,registry,fetcher:fileFetch(root),storage:null,serviceWorker:null}).bootstrap();
  await ensureBootstrapConfiguration({repo,registry,fetcher:fileFetch(root),timeZoneResolver:()=> 'Europe/Rome'}); return {repo,registry};
}

test('Phase B — narrow ±2% energy windows are feasible at both 800 and 2600 kcal without scaling', async () => {
  const {repo,registry}=await plannerFixture();
  for(const target of [800,2600]){
    const bundle=await loadConfigurationBundle(repo); const profile=bundle.nutritionProfiles.find(x=>x.id===bundle.appConfig.nutritionProfileId); profile.dailyEnergyKcal=target; profile.energyTolerancePct=2; await saveConfigurationBundle(bundle,{repo,registry});
    const result=await createInitialPreview({horizon:{startDate:'2026-09-07',endDate:'2026-09-07'},seed:`phase-b-edge-${target}`,createdAt:'2026-09-07T20:00:00.000Z'},{repo,registry});
    assert.equal(result.status,'success',JSON.stringify(result.failure));
    const day=result.calendarDays[0]; const planned=day.nutritionSummary.knownPlanned.energyKcal; const external=day.nutritionSummary.externalBudget?.energyKcal||0; const energy=energyConstraintStatus(planned,target,2,external);
    assert.equal(energy.withinTolerance,true,JSON.stringify(energy));
    for(const slot of day.mealSlots) for(const component of slot.recipeComponents||[]) assert.equal(component.servings,1);
  }
});

test('Phase B — generator source contains no energy-fitting solver path', async () => {
  const source=await readFile(path.join(root,'src/corpus/v1PhaseBRecipeGenerator.js'),'utf8');
  assert.doesNotMatch(source,/solveEnergy\s*\(/);
  assert.match(source,/quantityStrategy:'fixed-template-only'/);
  assert.match(source,/energyKcal<band\.min \|\| energyKcal>band\.max/);
});
