import { sha256Json } from '../lib/crypto.js';
import { repositories } from '../repositories/repositoryHub.js';

export const REVIEW_POLICY_VERSION = 'production-review-500-v1';
export const REVIEW_DIMENSIONS = Object.freeze([
  'culinaryCoherence',
  'ingredientCombination',
  'quantityPlausibility',
  'instructionQuality',
  'titleDescriptionQuality',
  'differentiation'
]);
export const REVIEW_DECISIONS = Object.freeze(['approved', 'needs_changes', 'rejected']);

export function isProductionReviewManifest(manifest) {
  return manifest?.publication?.channel === 'production_review' && manifest.publication.requiredHumanReview === true;
}

export function expectedReviewRecipeVersionIds(manifest) {
  if (!isProductionReviewManifest(manifest)) return [];
  const ids = [];
  for (const pack of manifest.packs || []) if (pack.required) ids.push(...(pack.recipeVersionIds || []));
  return [...new Set(ids)];
}

export function reviewSummary(expectedIds, decisions) {
  const expected = new Set(expectedIds);
  const byVersionId = new Map();
  for (const item of decisions || []) if (expected.has(item.recipeVersionId)) byVersionId.set(item.recipeVersionId, item);
  const current = [...byVersionId.values()];
  const approved = current.filter(item => item.decision === 'approved').length;
  const needsChanges = current.filter(item => item.decision === 'needs_changes').length;
  const rejected = current.filter(item => item.decision === 'rejected').length;
  const reviewed = current.length;
  const unreviewed = Math.max(0, expected.size - reviewed);
  return { expected: expected.size, reviewed, approved, needsChanges, rejected, unreviewed, complete: expected.size > 0 && reviewed === expected.size, pass: expected.size > 0 && approved === expected.size };
}

export function humanReviewIssues(record) {
  const issues = [];
  if (!REVIEW_DECISIONS.includes(record?.decision)) issues.push('decision_invalid');
  for (const key of REVIEW_DIMENSIONS) if (!['pass', 'fail'].includes(record?.dimensions?.[key])) issues.push(`dimension_${key}_invalid`);
  const failures = REVIEW_DIMENSIONS.filter(key => record?.dimensions?.[key] === 'fail');
  if (record?.decision === 'approved' && failures.length) issues.push('approved_requires_all_dimensions_pass');
  if (['needs_changes', 'rejected'].includes(record?.decision) && failures.length === 0) issues.push('non_approved_requires_failed_dimension');
  if (['needs_changes', 'rejected'].includes(record?.decision) && !String(record?.notes || '').trim()) issues.push('non_approved_requires_notes');
  return issues;
}

function assertPublication(manifest) {
  if (!isProductionReviewManifest(manifest)) throw new Error('Active catalog is not a production-review publication');
  if (manifest.publication.reviewPolicyVersion !== REVIEW_POLICY_VERSION) throw new Error(`Unsupported review policy ${manifest.publication.reviewPolicyVersion}`);
  const expected = expectedReviewRecipeVersionIds(manifest);
  if (expected.length !== manifest.publication.reviewRecipeCount) throw new Error(`Review publication count mismatch: manifest=${manifest.publication.reviewRecipeCount}, required-pack=${expected.length}`);
  return expected;
}

export class RecipeHumanReviewService {
  constructor({ repo = repositories, registry } = {}) { this.repo = repo; this.registry = registry; }

  async get(manifest, recipeVersionId) {
    assertPublication(manifest);
    return this.repo.get('recipeHumanReviews', `${manifest.publication.publicationId}::${recipeVersionId}`);
  }

  async list(manifest) {
    assertPublication(manifest);
    const rows = await this.repo.getAllByIndex('recipeHumanReviews', 'publicationId', { kind: 'only', value: manifest.publication.publicationId });
    return rows.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.recipeVersionId.localeCompare(b.recipeVersionId));
  }

  async summary(manifest) {
    const expected = assertPublication(manifest);
    return reviewSummary(expected, await this.list(manifest));
  }

  async reviewsForVersions(manifest, recipeVersionIds) {
    assertPublication(manifest);
    const keys = recipeVersionIds.map(id => `${manifest.publication.publicationId}::${id}`);
    const rows = await this.repo.getMany('recipeHumanReviews', keys);
    return new Map(rows.map(row => [row.recipeVersionId, row]));
  }

  async save(manifest, recipeVersion, { decision, dimensions, notes = '', reviewer = 'local-human-reviewer', reviewedAt = new Date().toISOString() } = {}) {
    const expected = new Set(assertPublication(manifest));
    if (!recipeVersion?.recipeVersionId || !expected.has(recipeVersion.recipeVersionId)) throw new Error('Recipe version is not part of the frozen production-review set');
    const record = {
      schemaVersion: 1,
      reviewId: `${manifest.publication.publicationId}::${recipeVersion.recipeVersionId}`,
      catalogVersion: manifest.catalogVersion,
      publicationId: manifest.publication.publicationId,
      recipeId: recipeVersion.recipeId,
      recipeVersionId: recipeVersion.recipeVersionId,
      recipeContentHash: recipeVersion.contentHash,
      reviewer: String(reviewer || '').trim() || 'local-human-reviewer',
      decision,
      dimensions: Object.fromEntries(REVIEW_DIMENSIONS.map(key => [key, dimensions?.[key]])),
      notes: String(notes || '').trim(),
      reviewedAt
    };
    const issues = humanReviewIssues(record);
    if (issues.length) throw new Error(`Human review is incomplete or inconsistent: ${issues.join(', ')}`);
    this.registry?.assert('recipeHumanReview', record);
    await this.repo.put('recipeHumanReviews', record);
    return record;
  }

  async nextUnreviewed(manifest, afterRecipeVersionId = null) {
    const expected = assertPublication(manifest);
    const reviewed = new Set((await this.list(manifest)).map(item => item.recipeVersionId));
    if (reviewed.size >= expected.length) return null;
    const start = afterRecipeVersionId ? Math.max(0, expected.indexOf(afterRecipeVersionId) + 1) : 0;
    const ordered = [...expected.slice(start), ...expected.slice(0, start)];
    const versionId = ordered.find(id => !reviewed.has(id));
    if (!versionId) return null;
    const version = await this.repo.get('recipeVersions', versionId);
    return version ? { recipeId: version.recipeId, recipeVersionId: version.recipeVersionId } : null;
  }

  async exportBundle(manifest, generatedAt = new Date().toISOString()) {
    const expected = assertPublication(manifest);
    const decisions = await this.list(manifest);
    const order = new Map(expected.map((id, index) => [id, index]));
    decisions.sort((a, b) => (order.get(a.recipeVersionId) ?? 999999) - (order.get(b.recipeVersionId) ?? 999999));
    const document = {
      schemaVersion: 1,
      format: 'ydm-production-recipe-human-review',
      reviewPolicyVersion: REVIEW_POLICY_VERSION,
      catalogVersion: manifest.catalogVersion,
      publicationId: manifest.publication.publicationId,
      sourceCorpusDigest: manifest.publication.sourceCorpusDigest,
      expectedRecipeVersionIds: expected,
      generatedAt,
      decisions,
      summary: reviewSummary(expected, decisions),
      sha256: null
    };
    document.sha256 = await sha256Json({ ...document, sha256: null });
    this.registry?.assert('recipeHumanReviewBundle', document);
    return document;
  }

  async importBundle(document, manifest) {
    const expected = assertPublication(manifest);
    this.registry?.assert('recipeHumanReviewBundle', document);
    const digest = await sha256Json({ ...document, sha256: null });
    if (digest !== document.sha256) throw new Error('Human-review bundle checksum mismatch');
    if (document.catalogVersion !== manifest.catalogVersion || document.publicationId !== manifest.publication.publicationId || document.sourceCorpusDigest !== manifest.publication.sourceCorpusDigest) throw new Error('Human-review bundle does not match the active production-review publication');
    if (JSON.stringify(document.expectedRecipeVersionIds) !== JSON.stringify(expected)) throw new Error('Human-review bundle frozen recipe set does not match the active publication');
    const versions = new Map((await this.repo.getMany('recipeVersions', expected)).map(item => [item.recipeVersionId, item]));
    const decisionIds = document.decisions.map(item => item.recipeVersionId);
    if (new Set(decisionIds).size !== decisionIds.length) throw new Error('Human-review bundle contains duplicate recipe decisions');
    for (const review of document.decisions) {
      if (!expected.includes(review.recipeVersionId)) throw new Error(`Human review ${review.recipeVersionId} is outside the frozen publication set`);
      const issues = humanReviewIssues(review); if (issues.length) throw new Error(`Invalid human review ${review.recipeVersionId}: ${issues.join(', ')}`);
      const version = versions.get(review.recipeVersionId);
      if (!version || review.recipeId !== version.recipeId || review.recipeContentHash !== version.contentHash) throw new Error(`Stale or unknown human review ${review.recipeVersionId}`);
      if (review.publicationId !== manifest.publication.publicationId || review.catalogVersion !== manifest.catalogVersion) throw new Error(`Human review ${review.recipeVersionId} belongs to another publication`);
      this.registry?.assert('recipeHumanReview', review);
    }
    const existing = await this.list(manifest);
    const incoming = new Set(document.decisions.map(item => item.reviewId));
    for (const row of existing) if (!incoming.has(row.reviewId)) await this.repo.delete('recipeHumanReviews', row.reviewId);
    await this.repo.putMany('recipeHumanReviews', document.decisions);
    return this.summary(manifest);
  }
}
