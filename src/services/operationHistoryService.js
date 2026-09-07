import { repositories } from '../repositories/repositoryHub.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function nowIso(value) { return value || new Date().toISOString(); }
function historyMetaKey(planInstanceId) { return `operationHistory:${planInstanceId}`; }

export function mutationSnapshot({ puts = {}, deletes = {}, metaSet = {}, metaDelete = [] } = {}) {
  return { puts: clone(puts), deletes: clone(deletes), metaSet: clone(metaSet), metaDelete: clone(metaDelete) };
}

function toMutation(snapshot = {}) {
  return {
    puts: clone(snapshot.puts || {}),
    deletes: clone(snapshot.deletes || {}),
    metaSet: clone(snapshot.metaSet || {}),
    metaDelete: clone(snapshot.metaDelete || [])
  };
}

async function planOperations(repo, planInstanceId) {
  const rows = await repo.getAllByIndex('operations', 'planInstanceId', { kind: 'only', value: planInstanceId });
  return rows.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
}

function activeOperation(operation) {
  return Boolean(operation) && !operation.undoneAt && !operation.metadata?.invalidatedAt;
}

function redoableOperation(operation) {
  return Boolean(operation?.undoneAt) && !operation.metadata?.invalidatedAt;
}

async function deriveHistoryPointer(repo, planInstanceId) {
  const rows = await planOperations(repo, planInstanceId);
  let maxSequence = 0;
  let headOperationId = null;
  const redoable = [];
  for (const operation of rows) {
    maxSequence = Math.max(maxSequence, Number(operation.sequence || 0));
    if (operation.metadata?.invalidatedAt) continue;
    if (operation.undoneAt) redoable.push(operation);
    else headOperationId = operation.operationId;
  }
  const pointer = {
    version: 1,
    maxSequence,
    headOperationId,
    redoStack: redoable.sort((a, b) => b.sequence - a.sequence).map(item => item.operationId),
    rebuiltAt: nowIso()
  };
  await repo.setMeta(historyMetaKey(planInstanceId), pointer);
  return pointer;
}

async function historyPointer(repo, planInstanceId) {
  return (await repo.getMeta(historyMetaKey(planInstanceId))) || deriveHistoryPointer(repo, planInstanceId);
}

export async function commitOperation({ planInstanceId, kind, before, after, metadata = {}, createdAt = null }, { repo = repositories, registry } = {}) {
  if (!planInstanceId) throw new Error('Operation requires planInstanceId');
  if (!kind) throw new Error('Operation requires kind');
  const pointer = await historyPointer(repo, planInstanceId);
  const timestamp = nowIso(createdAt);
  const invalidated = [];
  for (const operationId of pointer.redoStack || []) {
    const operation = await repo.get('operations', operationId);
    if (!redoableOperation(operation)) continue;
    invalidated.push({
      ...operation,
      metadata: { ...(operation.metadata || {}), invalidatedAt: timestamp, invalidatedByKind: kind }
    });
  }
  const sequence = Number(pointer.maxSequence || 0) + 1;
  const operation = {
    schemaVersion: 1,
    operationId: `op_${planInstanceId}_${sequence}_${timestamp.replace(/[^0-9]/g, '').slice(0, 14)}`,
    planInstanceId,
    sequence,
    kind,
    createdAt: timestamp,
    undoneAt: null,
    before: clone(before),
    after: clone(after),
    metadata: { ...clone(metadata), previousActiveOperationId: pointer.headOperationId || null }
  };
  if (registry) registry.assert('operation', operation);
  const mutation = toMutation(after);
  mutation.puts.operations = [...(mutation.puts.operations || []), ...invalidated, operation];
  mutation.metaSet[historyMetaKey(planInstanceId)] = { version: 1, maxSequence: sequence, headOperationId: operation.operationId, redoStack: [], updatedAt: timestamp };
  await repo.atomicMutate(mutation);
  return operation;
}

export async function listOperations(planInstanceId, { repo = repositories, includeInvalidated = true } = {}) {
  const rows = await planOperations(repo, planInstanceId);
  return includeInvalidated ? rows : rows.filter(item => !item.metadata?.invalidatedAt);
}

export async function listRecentOperations({ repo = repositories, limit = 100 } = {}) {
  if (typeof repo.getByIndexPage === 'function') {
    return repo.getByIndexPage('operations', 'createdAt', { direction: 'prev', limit });
  }
  const rows = await repo.getAll('operations');
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.sequence - a.sequence).slice(0, limit);
}

export async function undoLastOperation(planInstanceId, { repo = repositories, registry, at = null } = {}) {
  const pointer = await historyPointer(repo, planInstanceId);
  if (!pointer.headOperationId) return null;
  const operation = await repo.get('operations', pointer.headOperationId);
  if (!activeOperation(operation)) {
    await repo.setMeta(historyMetaKey(planInstanceId), null);
    return undoLastOperation(planInstanceId, { repo, registry, at });
  }
  const updated = clone(operation);
  updated.undoneAt = nowIso(at);
  updated.metadata = { ...(updated.metadata || {}), lastUndoAt: updated.undoneAt };
  if (registry) registry.assert('operation', updated);
  const mutation = toMutation(operation.before);
  mutation.puts.operations = [...(mutation.puts.operations || []), updated];
  // Undo changes the effective plan even when the restored snapshot carries an older timestamp.
  // Keep planUpdatedAt monotonic so shopping/checklist staleness follows effective content changes.
  mutation.metaSet.planUpdatedAt = updated.undoneAt;
  mutation.metaSet[historyMetaKey(planInstanceId)] = {
    version: 1,
    maxSequence: pointer.maxSequence,
    headOperationId: operation.metadata?.previousActiveOperationId || null,
    redoStack: [...(pointer.redoStack || []), operation.operationId],
    updatedAt: updated.undoneAt
  };
  await repo.atomicMutate(mutation);
  return updated;
}

export async function redoNextOperation(planInstanceId, { repo = repositories, registry, at = null } = {}) {
  const pointer = await historyPointer(repo, planInstanceId);
  const redoStack = [...(pointer.redoStack || [])];
  const operationId = redoStack.pop();
  if (!operationId) return null;
  const operation = await repo.get('operations', operationId);
  if (!redoableOperation(operation)) {
    await repo.setMeta(historyMetaKey(planInstanceId), { ...pointer, redoStack });
    return redoNextOperation(planInstanceId, { repo, registry, at });
  }
  const updated = clone(operation);
  updated.undoneAt = null;
  updated.metadata = { ...(updated.metadata || {}), lastRedoAt: nowIso(at) };
  if (registry) registry.assert('operation', updated);
  const mutation = toMutation(operation.after);
  mutation.puts.operations = [...(mutation.puts.operations || []), updated];
  // Redo is also a fresh effective-plan mutation; never restore a stale planUpdatedAt snapshot.
  mutation.metaSet.planUpdatedAt = updated.metadata.lastRedoAt;
  mutation.metaSet[historyMetaKey(planInstanceId)] = {
    version: 1,
    maxSequence: pointer.maxSequence,
    headOperationId: operation.operationId,
    redoStack,
    updatedAt: updated.metadata.lastRedoAt
  };
  await repo.atomicMutate(mutation);
  return updated;
}

export async function historyState(planInstanceId, { repo = repositories } = {}) {
  const pointer = await historyPointer(repo, planInstanceId);
  const latestActive = pointer.headOperationId ? await repo.get('operations', pointer.headOperationId) : null;
  const nextRedoId = pointer.redoStack?.length ? pointer.redoStack[pointer.redoStack.length - 1] : null;
  const nextRedo = nextRedoId ? await repo.get('operations', nextRedoId) : null;
  return {
    canUndo: activeOperation(latestActive),
    canRedo: redoableOperation(nextRedo),
    latestActive: activeOperation(latestActive) ? latestActive : null,
    nextRedo: redoableOperation(nextRedo) ? nextRedo : null
  };
}
