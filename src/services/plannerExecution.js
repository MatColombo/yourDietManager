import { generatePlanCore } from '../planner/planGenerator.js';
import { createPlannerRuntimeCache } from '../planner/plannerRuntimeCache.js';
import { createPlannerTelemetry, telemetryAddTime } from '../planner/plannerTelemetry.js';

const cancelled = () => ({ status: 'cancelled', failure: { code: 'cancelled' }, diagnostics: { status: 'cancelled' } });
const fallbackRuntimeCache = createPlannerRuntimeCache({ maxContexts: 2 });

export class PlannerWorkerClient {
  constructor({ workerFactory = null } = {}) {
    this.workerFactory = workerFactory || (() => new Worker(new URL('./plannerWorker.js', import.meta.url), { type: 'module' }));
    this.worker = null; this.active = null; this.queue = []; this.nextRequestId = 1;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = event => this.handleMessage(event.data || {});
    worker.onerror = event => this.handleError(new Error(event.message || 'Planner worker failed'));
    this.worker = worker;
    return worker;
  }

  run(input, { signal = null, onProgress = null } = {}) {
    if (signal?.aborted) return Promise.resolve(cancelled());
    return new Promise((resolve, reject) => {
      const request = { requestId: `planner-${this.nextRequestId++}`, input, signal, onProgress, resolve, reject, abort: null };
      request.abort = () => this.abortRequest(request);
      signal?.addEventListener('abort', request.abort, { once: true });
      this.queue.push(request); this.pump();
    });
  }

  pump() {
    if (this.active || !this.queue.length) return;
    const request = this.queue.shift();
    if (request.signal?.aborted) { this.finishRequest(request, cancelled()); this.pump(); return; }
    this.active = request;
    this.ensureWorker().postMessage({ type: 'generate', requestId: request.requestId, input: request.input });
  }

  handleMessage(message) {
    const request = this.active;
    if (!request || message.requestId !== request.requestId) return;
    if (message.type === 'progress') { request.onProgress?.(message.progress); return; }
    if (message.type !== 'result') return;
    this.active = null; this.finishRequest(request, message.result); this.pump();
  }

  handleError(error) {
    const request = this.active; this.active = null;
    this.resetWorker();
    if (request) this.finishRequest(request, error, true);
    this.pump();
  }

  abortRequest(request) {
    const queuedIndex = this.queue.indexOf(request);
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1); this.finishRequest(request, cancelled()); return;
    }
    if (this.active !== request) return;
    this.active = null;
    // A synchronous planner cannot consume a cancellation message while it is busy.
    // Terminating only the aborted worker preserves immediate cancellation; the next
    // generation gets a fresh persistent worker and rebuilds its cache once.
    this.resetWorker(); this.finishRequest(request, cancelled()); this.pump();
  }

  finishRequest(request, value, isError = false) {
    request.signal?.removeEventListener('abort', request.abort);
    if (isError) request.reject(value); else request.resolve(value);
  }

  resetWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }

  dispose() {
    this.resetWorker();
    if (this.active) { const current = this.active; this.active = null; this.finishRequest(current, cancelled()); }
    for (const request of this.queue.splice(0)) this.finishRequest(request, cancelled());
  }
}

let sharedPlannerWorkerClient = null;
function sharedClient() {
  sharedPlannerWorkerClient ||= new PlannerWorkerClient();
  return sharedPlannerWorkerClient;
}

export function resetSharedPlannerWorker() {
  sharedPlannerWorkerClient?.dispose();
  sharedPlannerWorkerClient = null;
}

export async function executePlanGeneration(input, { signal = null, onProgress = null } = {}) {
  if (signal?.aborted) return cancelled();
  if (typeof Worker === 'undefined') {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (signal?.aborted) return cancelled();
    const telemetry = createPlannerTelemetry();
    const cacheStarted = performance.now();
    const preparedInput = fallbackRuntimeCache.prepareInput({ ...input, plannerTelemetry: telemetry }, telemetry);
    telemetryAddTime(telemetry, 'runtimeCachePrepareMs', performance.now() - cacheStarted);
    const result = generatePlanCore({ ...preparedInput, onProgress, shouldCancel: () => signal?.aborted });
    return signal?.aborted ? cancelled() : result;
  }
  return sharedClient().run(input, { signal, onProgress });
}
