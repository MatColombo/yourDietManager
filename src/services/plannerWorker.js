import { generatePlanCore } from '../planner/planGenerator.js';
import { createPlannerRuntimeCache } from '../planner/plannerRuntimeCache.js';
import { createPlannerTelemetry, telemetryAddTime, telemetryIncrement } from '../planner/plannerTelemetry.js';

const runtimeCache = createPlannerRuntimeCache({ maxContexts: 2 });
let requestCount = 0;

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'reset_cache') { runtimeCache.clear(); self.postMessage({ type: 'cache_reset', requestId: message.requestId || null }); return; }
  const requestId = message.requestId || null;
  const input = message.type === 'generate' ? message.input : message;
  const telemetry = createPlannerTelemetry();
  telemetryIncrement(telemetry, 'workerRequests');
  if (requestCount > 0) telemetryIncrement(telemetry, 'workerReuses');
  requestCount += 1;
  const cacheStarted = performance.now();
  const preparedInput = runtimeCache.prepareInput({ ...input, plannerTelemetry: telemetry }, telemetry);
  telemetryAddTime(telemetry, 'runtimeCachePrepareMs', performance.now() - cacheStarted);
  const result = generatePlanCore({ ...preparedInput, onProgress: progress => self.postMessage({ type: 'progress', requestId, progress }) });
  self.postMessage({ type: 'result', requestId, result, cacheStats: runtimeCache.stats() });
};
