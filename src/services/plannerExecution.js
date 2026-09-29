import { generatePlanCore } from '../planner/planGenerator.js';

const cancelled = () => ({ status: 'cancelled', failure: { code: 'cancelled' }, diagnostics: { status: 'cancelled' } });
export async function executePlanGeneration(input, { signal = null, onProgress = null } = {}) {
  if (signal?.aborted) return cancelled();
  if (typeof Worker === 'undefined') {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (signal?.aborted) return cancelled();
    const result = generatePlanCore({ ...input, onProgress, shouldCancel: () => signal?.aborted });
    return signal?.aborted ? cancelled() : result;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./plannerWorker.js', import.meta.url), { type: 'module' });
    let finished = false;
    const end = (value, error = false) => {
      if (finished) return; finished = true; worker.terminate(); signal?.removeEventListener('abort', abort);
      if (error) reject(value); else resolve(value);
    };
    const abort = () => end(cancelled());
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => { if (event.data.type === 'progress') onProgress?.(event.data.progress); else end(event.data.result); };
    worker.onerror = event => end(new Error(event.message || 'Planner worker failed'), true);
    worker.postMessage(input);
  });
}
