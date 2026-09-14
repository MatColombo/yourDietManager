import { sha256Json } from '../../lib/crypto.js';

export function nutrientValue(raw, unit, definition) {
  const token = raw == null ? '' : String(raw).trim().toLowerCase();
  if (['', '-', 'na', 'n/a', 'nd'].includes(token)) return { value: null, status: 'missing', unit, definition, raw };
  if (['tr', 'trace', 'traces'].includes(token)) return { value: null, status: 'trace', unit, definition, raw };
  if (token.startsWith('<')) { const upperBound = Number(token.slice(1).replace(',', '.')); if (!Number.isFinite(upperBound) || upperBound < 0 || token.length === 1) throw new Error('Invalid quantification bound'); return { value: null, status: 'below_quantification', upperBound, unit, definition, raw }; }
  const value = Number(token.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid nutrient: ${raw}`);
  return { value, status: value === 0 ? 'zero' : 'measured', unit, definition, raw };
}
const REQUIRED = ['energyKcal', 'proteinG', 'carbsG', 'fatG', 'fiberG'];
function normalizeFields(fields) {
  const result = {};
  for (const [name, field] of Object.entries(fields)) {
    if (!field || !field.definition || !field.unit) throw new Error(`Missing nutrient definition: ${name}`);
    const value = nutrientValue(field.value, field.unit, field.definition);
    const expected = name === 'energyKcal' ? 'kcal' : name.endsWith('Mg') ? 'mg' : 'g';
    if (field.unit !== expected) throw new Error(`Unit conversion must be explicit: ${name} ${field.unit} -> ${expected}`);
    result[name] = value;
  }
  for (const name of REQUIRED) result[name] ||= nutrientValue(null, name === 'energyKcal' ? 'kcal' : 'g', 'unresolved');
  return result;
}
async function stage(source, raw, context, fields) {
  if (!raw.id || !raw.label || !context.version || !context.url || !context.acquiredAt || !context.licenseEvidence) throw new Error('Source identity/version/rights evidence required');
  if (raw.basisAmount !== 100 || raw.basisUnit !== 'g' || raw.edibleBasis !== true) throw new Error('Only explicit per-100-g edible-basis records are supported; no inferred portion conversion');
  const nutrients = normalizeFields(fields);
  const missing = REQUIRED.filter(key => nutrients[key].value === null);
  const item = { schemaVersion: 1, source, sourceRecordId: String(raw.id), sourceLabel: raw.label, original: structuredClone(raw), sourceContext: structuredClone(context), inputDigest: await sha256Json(raw), nutrients, transformations: [], resolution: 'needs_review', missingEssentialNutrients: missing, mapping: null, reviews: { automatic: { status: missing.length ? 'blocked' : 'pass', method: 'r5-structural-v1' }, nutrition: null, safety: null, culinary: null } };
  item.contentDigest = await sha256Json({ source, sourceRecordId: item.sourceRecordId, inputDigest: item.inputDigest, sourceContext: item.sourceContext, nutrients });
  return item;
}
// CREA/Ciqual accept faithful extracted rows, including manual extracts with explicit attribution.
// They never reinterpret source carbohydrate definitions or treat missing/traces as numeric zero.
export async function stageCrea(raw, context) { return stage('CREA', raw, context, raw.nutrients || {}); }
export async function stageCiqual(raw, context) { return stage('CIQUAL', raw, context, raw.constituents || {}); }
export async function stageLabel(raw, context) {
  if (!raw.productIdentity || !context.reuseAuthorization) throw new Error('Exact product identity and label reuse authorization required');
  return stage('LABEL', raw, context, raw.nutrients || {});
}
export async function stageUsda(raw, context) {
  if (!['Foundation', 'SR Legacy'].includes(raw.dataType)) throw new Error('Unsupported USDA data type; branded records use the label adapter');
  const byId = new Map((raw.foodNutrients || []).map(row => [Number(row.nutrient?.id), row]));
  const energyId = raw.dataType === 'Foundation' ? [2047,2048,1008].find(id => byId.has(id)) : [1008,2047,2048].find(id => byId.has(id));
  const definitions = { energyKcal: [energyId, energyId === 2047 ? 'Atwater General' : energyId === 2048 ? 'Atwater Specific' : 'USDA reported energy'], proteinG: [1003,'USDA protein'], fatG: [1004,'USDA total lipid'], carbsG: [1005,'carbohydrate by difference; includes fibre; not CREA available carbohydrate'], fiberG: [1079,'USDA total dietary fibre'] };
  const fields = Object.fromEntries(Object.entries(definitions).map(([key,[id,definition]]) => [key, { value: byId.get(id)?.amount ?? null, unit: key === 'energyKcal' ? 'kcal' : 'g', definition }]));
  for (const [key,[id]] of Object.entries(definitions)) if (byId.has(id) && byId.get(id).nutrient.unitName.toLowerCase() !== fields[key].unit) throw new Error('Unexpected USDA nutrient unit');
  return stage('USDA', { ...raw, id: raw.fdcId, label: raw.description }, context, fields);
}
export const sourceAdapters = { CREA: stageCrea, CIQUAL: stageCiqual, USDA: stageUsda, LABEL: stageLabel };

export async function publicationReadiness(record) {
  const reasons = [];
  if (await sha256Json(record.original) !== record.inputDigest) reasons.push('source_digest_mismatch');
  if (await sha256Json({ source: record.source, sourceRecordId: record.sourceRecordId, inputDigest: record.inputDigest, sourceContext: record.sourceContext, nutrients: record.nutrients }) !== record.contentDigest) reasons.push('content_digest_mismatch');
  if (REQUIRED.some(key => !Number.isFinite(record.nutrients[key]?.value) || record.nutrients[key].value < 0)) reasons.push('essential_nutrients_missing');
  if (!record.mapping?.conceptId || !record.mapping?.formId || record.mapping.status !== 'reviewed') reasons.push('identity_unresolved');
  if (!record.sourceContext?.licenseEvidence?.reuseAllowed || !record.sourceContext.licenseEvidence.checkedAt) reasons.push('reuse_unresolved');
  const reviewDigest = await sha256Json({ contentDigest: record.contentDigest, mapping: record.mapping });
  for (const dimension of ['nutrition','safety','culinary']) {
    const review = record.reviews?.[dimension];
    if (!review || review.status !== 'approved' || review.actorType !== 'human' || !review.reviewer || !review.reviewedAt || review.digest !== reviewDigest || !review.evidence) reasons.push(`${dimension}_review_missing_or_stale`);
  }
  return { publishable: reasons.length === 0, reasons, reviewDigest };
}
