import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { assessProductionReadiness, assertProductionContract } from '../../src/corpus/productionCorpus.js';
import { assertIngredientCurationPolicy } from '../../src/corpus/ingredientCuration.js';
import { assertProductionRecipePipelinePolicy, buildScaleGate500Report } from '../../src/corpus/productionRecipePipeline.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';
import { REVIEW_POLICY_VERSION } from '../../src/services/recipeHumanReviewService.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';
import { publishCatalogRelease } from './release-lib.mjs';

const args = process.argv.slice(2).filter(value => value !== '--canonical');
const canonical = process.argv.includes('--canonical');
const corpusInput = args[0] || 'corpus/production/current-working-bundle.json';
const publicRoot = args[1] || 'public';
const catalogVersion = args[2] || '1.0.0-production-review-500';
const stagingRoot = 'corpus/staging/runtime/production-review-publication';
const releaseRoot = path.join(stagingRoot, 'release');
const evidencePath = 'corpus/production/evidence/production-review-publication.json';
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file))); await registry.loadAll();
const [corpus, policy, contract, curationPolicy, pipelinePolicy, pilotIntake, proposals] = await Promise.all([
  loadCorpusInput(corpusInput), readJson('corpus/policies/v1-default.json'), readJson('corpus/contracts/v1-production.json'), readJson('corpus/curation/v1-ingredient-curation-policy.json'), readJson('corpus/production/v1-recipe-pipeline-policy.json'), readJson('corpus/pilot/v1-pilot-intake.json'), readJson('corpus/pilot/v1-reference-data-proposals.json')
]);
assertProductionContract(contract, policy, registry); assertIngredientCurationPolicy(curationPolicy, contract, registry); assertProductionRecipePipelinePolicy(pipelinePolicy, contract, policy, curationPolicy, registry);
const readiness = await assessProductionReadiness({ contract, policy, corpus, registry });
const snapshot = await scanCorpus({ policy, catalogVersion: corpus.manifest.catalogVersion, recipeFamilies: corpus.recipeFamilies, recipeVersions: corpus.recipeVersions, ingredientFamilies: corpus.ingredientFamilies, ingredientRevisions: corpus.ingredientRevisions, registry });
const gate = buildScaleGate500Report({ pipelinePolicy, contract, corpusPolicy: policy, productionReadiness: readiness, intake: pilotIntake, proposals, snapshot, registry });
if (snapshot.activeRecipeCount !== 500) throw new Error(`Production review publication requires exactly 500 active recipes; got ${snapshot.activeRecipeCount}`);
if (gate.status !== 'pass') throw new Error(`Production review publication requires Scale Gate 500 pass: ${gate.blockers.join('; ')}`);
if (readiness.ingredients.blockedFamilies !== 0 || readiness.ingredients.productionReadyFamilies < contract.ingredientReadiness.minActiveIngredients) throw new Error('Production review publication requires production-ready ingredient foundation');
const activeFamilies = corpus.recipeFamilies.filter(item => item.status === 'active');
const activeIds = new Set(activeFamilies.map(item => item.currentVersionId));
const activeVersions = corpus.recipeVersions.filter(item => activeIds.has(item.recipeVersionId));
if (activeVersions.length !== 500) throw new Error(`Frozen review set must contain 500 current versions; got ${activeVersions.length}`);
activeVersions.sort((a,b) => a.recipeVersionId.localeCompare(b.recipeVersionId));
activeFamilies.sort((a,b) => a.recipeId.localeCompare(b.recipeId));
const frozenRecipeVersionIds = activeVersions.map(item => item.recipeVersionId);
const sourceCorpusDigest = String(snapshot.contentDigest || '').replace(/^sha256:/, '');
const sourceSnapshotId = snapshot.snapshotId;
const publicationId = `production-review-500-${sourceCorpusDigest.slice(0,12)}`;
const publication = { channel:'production_review', publicationId, sourceCorpusDigest, sourceSnapshotId, requiredHumanReview:true, reviewRecipeCount:500, reviewPolicyVersion:REVIEW_POLICY_VERSION, releaseEligible:false };
registry.assert('catalogPublication', publication);
const publishedAt = new Date().toISOString();
const allBytes = Buffer.byteLength(JSON.stringify([corpus.ingredientFamilies, corpus.ingredientRevisions, activeFamilies, activeVersions]));
const packs = [
  { packId:'core', labelKey:'catalog.pack.core.label', descriptionKey:'catalog.pack.core.description', required:true, estimatedBytes:allBytes, recipeVersionIds:frozenRecipeVersionIds },
  { packId:'quick', labelKey:'catalog.pack.quick.label', descriptionKey:'catalog.pack.quick.description', required:false, estimatedBytes:0, recipeVersionIds:activeVersions.filter(v => (v.practical.prepMinutes + v.practical.cookMinutes) <= 20).map(v=>v.recipeVersionId) },
  { packId:'high_protein', labelKey:'catalog.pack.highProtein.label', descriptionKey:'catalog.pack.highProtein.description', required:false, estimatedBytes:0, recipeVersionIds:activeVersions.filter(v => v.calculatedNutrition.proteinG >= 35).map(v=>v.recipeVersionId) },
  { packId:'vegetarian', labelKey:'catalog.pack.vegetarian.label', descriptionKey:'catalog.pack.vegetarian.description', required:false, estimatedBytes:0, recipeVersionIds:activeVersions.filter(v => (v.tags.diet || []).includes('diet_vegetarian')).map(v=>v.recipeVersionId) }
];
await rm(releaseRoot, { recursive:true, force:true }); await mkdir(stagingRoot, { recursive:true });
const manifest = await publishCatalogRelease({ outputDir:releaseRoot, catalogVersion, taxonomies:corpus.taxonomies || [], taxonomyTerms:corpus.taxonomyTerms || [], referenceDataVersion:corpus.manifest.referenceDataVersion || '1.0.0', ingredientFamilies:corpus.ingredientFamilies.filter(item=>item.status==='active'), ingredientRevisions:corpus.ingredientRevisions, recipeFamilies:activeFamilies, recipeVersions:activeVersions, appMinVersion:'1.0.0-rc.24', pipelineVersion:contract.pipelineVersion, productionContract:contract, publication, packs, registry, builtAt:publishedAt });
const evidence = { schemaVersion:1, catalogVersion:manifest.catalogVersion, publication, publishedAt, source:{ catalogVersion:corpus.manifest.catalogVersion, activeRecipeCount:500, productionReadyIngredientCount:readiness.ingredients.productionReadyFamilies, scaleGateId:gate.gateId, scaleGateStatus:gate.status }, frozenRecipeVersionIds };
registry.assert('productionReviewPublication', evidence);
await writeJson(evidencePath, evidence);
if (canonical) {
  const generated = path.join(releaseRoot, 'data');
  const target = path.join(publicRoot, 'data');
  await mkdir(target, { recursive:true });
  for (const name of ['ingredients','recipes','reference-data']) { await rm(path.join(target,name), { recursive:true, force:true }); await cp(path.join(generated,name), path.join(target,name), { recursive:true }); }
  await cp(path.join(generated,'catalog-manifest.json'), path.join(target,'catalog-manifest.json'));
}
console.log(JSON.stringify({ publicationId, catalogVersion:manifest.catalogVersion, sourceCorpusDigest, activeRecipes:500, productionReadyIngredients:readiness.ingredients.productionReadyFamilies, scaleGate:gate.status, reviewRequired:true, releaseEligible:false, canonical, evidencePath }, null, 2));
