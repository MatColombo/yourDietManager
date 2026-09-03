import { CONTENT_SCHEMA_VERSION, DB_VERSION } from '../db/constants.js';
import { repositories } from '../repositories/repositoryHub.js';

function now() { return new Date().toISOString(); }
function historyMetaKey(planInstanceId) { return `operationHistory:${planInstanceId}`; }

async function runMigration1(repo) {
  await repo.setMeta('contentMigration:1', { status: 'running', startedAt: now() });
  await repo.setMeta('contentMigration:1', { status: 'complete', completedAt: now() });
}

function visibleOperation(operation) { return !operation.metadata?.invalidatedAt; }

async function buildOperationHistoryPointers(repo) {
  const operations = await repo.getAll('operations');
  if (!operations.length) return;
  const groups = new Map();
  for (const operation of operations) {
    if (!operation.planInstanceId) continue;
    if (!groups.has(operation.planInstanceId)) groups.set(operation.planInstanceId, []);
    groups.get(operation.planInstanceId).push(operation);
  }
  const changed = [];
  for (const [planInstanceId, rows] of groups) {
    rows.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
    let previousActiveOperationId = null;
    let headOperationId = null;
    let maxSequence = 0;
    const redoable = [];
    for (const row of rows) {
      maxSequence = Math.max(maxSequence, Number(row.sequence || 0));
      if (!visibleOperation(row)) continue;
      const nextMetadata = { ...(row.metadata || {}) };
      if (!('previousActiveOperationId' in nextMetadata)) {
        nextMetadata.previousActiveOperationId = previousActiveOperationId;
        changed.push({ ...row, metadata: nextMetadata });
      }
      if (row.undoneAt) redoable.push(row);
      else {
        previousActiveOperationId = row.operationId;
        headOperationId = row.operationId;
      }
    }
    const redoStack = redoable.sort((a, b) => b.sequence - a.sequence).map(row => row.operationId);
    await repo.setMeta(historyMetaKey(planInstanceId), { version: 1, maxSequence, headOperationId, redoStack, migratedAt: now() });
  }
  if (changed.length) await repo.putMany('operations', changed, 250);
}

async function runMigration2(repo, options = {}) {
  const existingMarker = await repo.getMeta('contentMigration:2');
  const attempts = Number(existingMarker?.attempts || 0) + 1;
  await repo.setMeta('contentMigration:2', { status: 'running', startedAt: existingMarker?.startedAt || now(), resumedAt: now(), attempts, checkpoint: 'appConfig' });

  const config = await repo.get('appConfigs', 'active');
  if (config && (config.shoppingPeopleMultiplier === undefined || config.shoppingPeopleMultiplier === null)) {
    await repo.put('appConfigs', { ...config, shoppingPeopleMultiplier: 1 });
  }
  options.onStep?.('migration2:appConfig');

  await repo.setMeta('contentMigration:2', { status: 'running', startedAt: existingMarker?.startedAt || now(), resumedAt: now(), attempts, checkpoint: 'operationHistory' });
  await buildOperationHistoryPointers(repo);
  options.onStep?.('migration2:operationHistory');

  await repo.setMeta('contentMigration:2', { status: 'complete', completedAt: now(), attempts, checkpoint: 'complete' });
}

export async function runMigrations(repo = repositories, options = {}) {
  let current = (await repo.getMeta('contentSchemaVersion')) || 0;
  if (current < 1) {
    await runMigration1(repo);
    await repo.setMeta('contentSchemaVersion', 1);
    current = 1;
  }
  if (current < 2) {
    await runMigration2(repo, options);
    await repo.setMeta('contentSchemaVersion', 2);
    current = 2;
  }
  await repo.setMeta('dbVersion', DB_VERSION);
  await repo.setMeta('contentSchemaVersion', CONTENT_SCHEMA_VERSION);
  return { dbVersion: DB_VERSION, contentSchemaVersion: CONTENT_SCHEMA_VERSION };
}
