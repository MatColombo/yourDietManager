import { generatePlanCore } from '../planner/planGenerator.js';
self.onmessage = event => {
  const result = generatePlanCore({ ...event.data, onProgress: progress => self.postMessage({ type: 'progress', progress }) });
  self.postMessage({ type: 'result', result });
};
