import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION, DB_VERSION, PRE_V1_DATA_EPOCH } from '../../src/db/constants.js';
import { loadLocalCatalog } from '../corpus/io-lib.mjs';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await read(file));
const [pkg, catalog, buildEvidence, publicationEvidence, taxonomySource, refService, rules, generator, effective, planPage, worker, offline, workflow, en, it] = await Promise.all([
  readJson('package.json'), loadLocalCatalog(path.join(root, 'public/data')),
  readJson('corpus/production/planner-phase-d/build-evidence.json'), readJson('corpus/production/planner-phase-d/publication-evidence.json'),
  read('src/domain/productFoodTaxonomy.js'), read('src/services/referenceDataService.js'), read('src/domain/configurationRules.js'),
  read('src/planner/planGenerator.js'), read('src/services/effectivePlanService.js'), read('src/ui/planPages.js'),
  read('public/service-worker.js'), read('src/services/offlineCatalog.js'), read('.github/workflows/v1-release-candidate.yml'),
  readJson('public/data/locales/en.json'), readJson('public/data/locales/it.json')
]);
const checks=[]; const failures=[];
function check(id, pass, detail){const row={id,pass:Boolean(pass),detail};checks.push(row);if(!row.pass)failures.push(row);}
const revisions=catalog.ingredientRevisions;
const noodles=revisions.filter(x=>x.productTaxonomy?.conceptId==='product_concept_noodles');
const dairy=revisions.filter(x=>x.productTaxonomy?.categoryId==='product_category_dairy');
const productTaxonomy=catalog.taxonomies.find(x=>x.taxonomyId==='product_food');
const productTerms=catalog.taxonomyTerms.filter(x=>x.taxonomyId==='product_food');
const recipeDigestB=(await readJson('corpus/production/planner-phase-b/build-evidence.json')).recipeDigest;
const enKeys=Object.keys(en).sort(); const itKeys=Object.keys(it).sort();

check('phase-d-version', pkg.version===APP_VERSION && ['1.0.0-rc.34','1.0.0'].includes(APP_VERSION), `package=${pkg.version}, runtime=${APP_VERSION}`);
check('phase-d-db-epoch', DB_VERSION===6 && PRE_V1_DATA_EPOCH==='v1-planner-phase-d-epoch-1', `db=${DB_VERSION}, epoch=${PRE_V1_DATA_EPOCH}`);
check('phase-d-catalog', catalog.manifest.catalogVersion==='1.2.0-planner-phase-d' && catalog.recipeVersions.length===1800 && revisions.length===600, `catalog=${catalog.manifest.catalogVersion}, recipes=${catalog.recipeVersions.length}, revisions=${revisions.length}`);
check('product-taxonomy-present', productTaxonomy?.hierarchical===true && productTerms.length===203 && buildEvidence.productTaxonomy?.categoryCount===18, `terms=${productTerms.length}, categories=${buildEvidence.productTaxonomy?.categoryCount}`);
check('all-ingredients-classified', revisions.every(x=>x.productTaxonomy?.categoryId && x.productTaxonomy?.subcategoryId && x.productTaxonomy?.conceptId), `classified=${revisions.filter(x=>x.productTaxonomy?.conceptId).length}/600`);
check('dairy-explicit', dairy.length===19 && productTerms.some(x=>x.termId==='product_category_dairy' && x.i18n?.it?.label==='Latticini'), `dairy=${dairy.length}`);
check('noodle-concept-collapse', noodles.length===11 && productTerms.some(x=>x.termId==='product_concept_noodles'), `noodle variants=${noodles.length}`);
check('taxonomy-separated-from-source', /productTaxonomy/.test(taxonomySource) && /taxonomy\?\.foodGroup/.test(taxonomySource) && revisions.filter(x=>x.taxonomy?.foodGroup).every(x=>x.productTaxonomy.categoryId.startsWith('product_category_') && x.taxonomy.foodGroup.startsWith('food_group_') && x.productTaxonomy.categoryId!==x.taxonomy.foodGroup), 'product taxonomy is separate from source foodGroup');
check('hierarchical-ambiguity-safe', /taxonomyId === 'product_food'/.test(refService) && /lookup\.set\(key, null\)/.test(refService), 'ambiguous parent/child labels are never auto-resolved');
check('product-food-constraint-types', /productFood/.test(rules) && /FOOD_PREFERENCE_TARGET_TYPES/.test(rules) && /ALLERGY_TARGET_TYPES/.test(rules), 'product taxonomy can drive preference, allergy/intolerance and MealClass rules');
check('recipe-digest-preserved', buildEvidence.invariants?.recipeDigestPreserved===true && buildEvidence.invariants?.recipeDigestAfter===recipeDigestB, buildEvidence.invariants?.recipeDigestAfter);
check('serving-scaling-still-forbidden', publicationEvidence.servingScalingAllowed===false && catalog.recipeVersions.every(x=>x.servingCount===1), 'all RecipeVersion servingCount=1; no scaling');
check('regeneration-strict-first', /mode: 'exclude_current'/.test(effective) && /mode: 'prefer_alternative'/.test(effective) && /currentRecipePenalty: 100/.test(effective), 'alternative uses strict exclusion first, bounded fallback second');
check('generator-enforces-regeneration-policy', /no_alternative_candidates_after_regeneration_exclusion/.test(generator) && /regeneration:current_recipe/.test(generator), 'solver excludes/penalizes current recipe according to mode');
check('regeneration-explains-retention', /retained_after_strict_alternative_failed_in_bounded_search/.test(effective) && /strictFailure/.test(effective), 'retained meals carry bounded-search reason');
check('ui-separates-actions', /data-testid': 'rebalance-preview'/.test(planPage) && /data-testid': 'recalculate-preview'/.test(planPage) && /data-testid': 'rebalance-day-preview'/.test(planPage) && /data-testid': 'recalculate-day-preview'/.test(planPage), 'range/day UI separates alternative from recalculation');
check('ui-exposes-regeneration-summary', /data-testid': 'rebalance-summary'/.test(planPage) && /plan\.rebalance\.boundedReason/.test(planPage), 'preview reports changed/retained meals and bounded reason');
check('pwa-phase-d-cache', /ydm-shell-v37-/.test(worker) && /ydm-data-v17-/.test(worker) && /ydm-data-v17-/.test(offline), 'shell=v37, data=v17');
check('locale-parity', JSON.stringify(enKeys)===JSON.stringify(itKeys), `en=${enKeys.length}, it=${itKeys.length}`);
check('phase-d-workflow', /corpus:build-planner-phase-d/.test(workflow) && /catalog:publish-planner-phase-d/.test(workflow) && /v1:planner-phase-d/.test(workflow) && /git diff --exit-code/.test(workflow), 'manual CI reproduces and drift-checks Phase D');
check('validation-only-publication', publicationEvidence.status==='planner_validation' && publicationEvidence.publication?.releaseEligible===false, `status=${publicationEvidence.status}`);

const report={schemaVersion:1,suite:'v1-planner-phase-d-regeneration-taxonomy',checkedAt:new Date().toISOString(),status:failures.length?'failed':'passed',checks,failures,metrics:{appVersion:APP_VERSION,catalogVersion:catalog.manifest.catalogVersion,ingredientCount:revisions.length,recipeCount:catalog.recipeVersions.length,productFoodTerms:productTerms.length,dairyIngredients:dairy.length,noodleVariants:noodles.length}};
await mkdir(path.join(root,'reports'),{recursive:true}); await writeFile(path.join(root,'reports/v1-planner-phase-d-gate.json'),JSON.stringify(report,null,2)+'\n');
for(const row of checks) console.log(`${row.pass?'PASS':'FAIL'} ${row.id}: ${row.detail}`);
if(failures.length){console.error(`V1 Planner Phase D gate failed: ${failures.map(x=>x.id).join(', ')}`);process.exitCode=1;}else console.log(`V1 Planner Phase D gate PASS (${checks.length}/${checks.length})`);
