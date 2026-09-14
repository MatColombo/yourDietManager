import { APP_VERSION, DB_VERSION, CONTENT_SCHEMA_VERSION, STORE_DEFINITIONS } from '../db/constants.js';
import { repositories } from '../repositories/repositoryHub.js';
const SAFE_CODES = new Set(['concurrent_change','cancelled','search_exhausted','invalid_input','quota_exceeded','upgrade_required','import_invalid']);
// Allowlist projection: never serialize a profile, rule, note, exception message or stack.
export async function createLocalDiagnostics({ repo = repositories, errorCode = null } = {}) {
  const counts = {};
  for (const store of Object.keys(STORE_DEFINITIONS).filter(s => s !== 'meta')) counts[store] = await repo.count(store);
  return {format:'yourDietManager-diagnostics',version:1,createdAt:new Date().toISOString(),appVersion:APP_VERSION,dbVersion:DB_VERSION,contentSchemaVersion:CONTENT_SCHEMA_VERSION,counts,errorCode:SAFE_CODES.has(errorCode)?errorCode:'unspecified',sensitiveDataIncluded:false};
}
export function safeExternalUrl(value) {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
