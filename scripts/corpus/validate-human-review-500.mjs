import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { sha256Json } from '../../src/lib/crypto.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';
import { humanReviewIssues, reviewSummary, REVIEW_POLICY_VERSION } from '../../src/services/recipeHumanReviewService.js';
import { scanCorpus } from '../../src/corpus/corpusScanner.js';

const strict = process.argv.includes('--strict');
const args = process.argv.slice(2).filter(value => value !== '--strict');
const reviewFile = args[0];
const corpusInput = args[1] || 'corpus/production/current-working-bundle.json';
const publicationFile = args[2] || 'corpus/production/evidence/production-review-publication.json';
const output = args[3] || 'corpus/production/evidence/human-review-500-summary.json';
if (!reviewFile) { console.error('Usage: node scripts/corpus/validate-human-review-500.mjs <review-bundle.json> [corpus-input] [publication-evidence.json] [output] [--strict]'); process.exit(2); }
const registry = new SchemaRegistry(async file => readJson(path.join('schemas',file))); await registry.loadAll();
const [review, corpus, publication, policy] = await Promise.all([readJson(reviewFile), loadCorpusInput(corpusInput), readJson(publicationFile), readJson('corpus/policies/v1-default.json')]);
registry.assert('recipeHumanReviewBundle', review); registry.assert('productionReviewPublication', publication);
const blockers=[];
const expectedDigest = await sha256Json({ ...review, sha256:null }); if (expectedDigest !== review.sha256) blockers.push('review-bundle-checksum');
if (review.reviewPolicyVersion !== REVIEW_POLICY_VERSION) blockers.push('review-policy-version');
if (review.publicationId !== publication.publication.publicationId || review.catalogVersion !== publication.catalogVersion || review.sourceCorpusDigest !== publication.publication.sourceCorpusDigest) blockers.push('publication-binding');
if (JSON.stringify(review.expectedRecipeVersionIds) !== JSON.stringify(publication.frozenRecipeVersionIds)) blockers.push('frozen-recipe-set');
const activeFamilies=(corpus.recipeFamilies||[]).filter(item=>item.status==='active'); const activeIds=new Set(activeFamilies.map(item=>item.currentVersionId)); const activeVersions=(corpus.recipeVersions||[]).filter(item=>activeIds.has(item.recipeVersionId));
const current=new Map(activeVersions.map(item=>[item.recipeVersionId,item]));
for(const decision of review.decisions){ const issues=humanReviewIssues(decision); if(issues.length) blockers.push(`review:${decision.recipeVersionId}:${issues.join(',')}`); const version=current.get(decision.recipeVersionId); if(!version||version.recipeId!==decision.recipeId||version.contentHash!==decision.recipeContentHash) blockers.push(`stale-review:${decision.recipeVersionId}`); }
const snapshot=await scanCorpus({policy,catalogVersion:corpus.manifest.catalogVersion,ingredientFamilies:corpus.ingredientFamilies,ingredientRevisions:corpus.ingredientRevisions,recipeFamilies:corpus.recipeFamilies,recipeVersions:corpus.recipeVersions,registry});
if(String(snapshot.contentDigest || '').replace(/^sha256:/, '')!==publication.publication.sourceCorpusDigest) blockers.push('source-corpus-digest-drift');
const summary=reviewSummary(publication.frozenRecipeVersionIds,review.decisions);
if(!summary.complete) blockers.push(`human-review-incomplete:${summary.reviewed}/${summary.expected}`);
if(summary.needsChanges) blockers.push(`human-review-needs-changes:${summary.needsChanges}`);
if(summary.rejected) blockers.push(`human-review-rejected:${summary.rejected}`);
if(!summary.pass) blockers.push('human-review-not-all-approved');
const report={schemaVersion:1,publicationId:publication.publication.publicationId,catalogVersion:review.catalogVersion,validatedAt:new Date().toISOString(),sourceCorpusDigest:publication.publication.sourceCorpusDigest,summary,status:blockers.length?'blocked':'pass',blockers:[...new Set(blockers)]};
await writeJson(output,report); console.log(JSON.stringify(report,null,2)); if(strict&&blockers.length) process.exitCode=2;
