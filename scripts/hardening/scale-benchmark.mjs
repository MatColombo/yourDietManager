import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CatalogQueryService } from '../../src/services/catalogQuery.js';
import { listRecentOperations } from '../../src/services/operationHistoryService.js';
import { MemoryRepository } from '../../tests/helpers.mjs';

class InstrumentedRepo extends MemoryRepository {
  constructor() { super(); this.recipeGetManyMax = 0; this.recipeGetAll = 0; this.operationPageCalls = 0; }
  async getMany(store, keys) { if (store === 'recipeVersions') this.recipeGetManyMax = Math.max(this.recipeGetManyMax, keys.length); return super.getMany(store, keys); }
  async getAll(store) { if (store === 'recipeVersions') this.recipeGetAll += 1; return super.getAll(store); }
  async getByIndexPage(...args) { this.operationPageCalls += 1; return super.getByIndexPage(...args); }
}

const repo = new InstrumentedRepo();
const ids = [];
const recipeStore = repo.store('recipes'); const versionStore = repo.store('recipeVersions');
for (let i = 0; i < 10000; i += 1) {
  const suffix = String(i).padStart(5, '0'); const recipeId = `r_${suffix}`; const versionId = `rv_${suffix}`; ids.push(versionId);
  recipeStore.set(recipeId, { recipeId, origin: 'base', currentVersionId: versionId, status: 'active' });
  versionStore.set(versionId, { recipeVersionId: versionId, recipeId, origin: 'base', i18n: { it: { title: `Ricetta ${suffix}` } }, mealArchetypes: [i % 2 ? 'lunch' : 'dinner'], calculatedNutrition: { energyKcal: 350 + (i % 500), proteinG: 10 + (i % 40), fiberG: 2 + (i % 12) }, practical: { prepMinutes: 5 + (i % 45) }, allergenIds: [], searchTokens: ['ricetta', suffix] });
}
await repo.setMeta('activeCatalogVersion', '1.0.0');
await repo.put('catalogPacks', { catalogVersion: '1.0.0', packId: 'core', status: 'installed', recipeVersionIds: ids });
const query = new CatalogQueryService({ repo });
let start = performance.now(); const browse = await query.searchRecipes({ offset: 5000, limit: 50 }); const browseMs = performance.now() - start;
start = performance.now(); const filtered = await query.searchRecipes({ mealArchetype: 'lunch', energyMin: 450, energyMax: 650, limit: 50 }); const filteredMs = performance.now() - start;

const operationsStore = repo.store('operations');
for (let i = 1; i <= 10000; i += 1) operationsStore.set(`op_${i}`, { operationId: `op_${i}`, planInstanceId: 'p', sequence: i, createdAt: new Date(1700000000000 + i * 1000).toISOString(), undoneAt: null, metadata: {} });
start = performance.now(); const recent = await listRecentOperations({ repo, limit: 100 }); const historyMs = performance.now() - start;

const pass = browse.total === 10000 && browse.items.length === 50 && repo.recipeGetManyMax <= 50 && repo.recipeGetAll === 0 && filtered.items.length <= 50 && recent.length === 100 && repo.operationPageCalls === 1;
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length, memoryBytes: os.totalmem() },
  dataset: { recipeVersions: 10000, operations: 10000 },
  measurementsMs: { unfilteredPage50: Number(browseMs.toFixed(2)), indexedFilteredPage50: Number(filteredMs.toFixed(2)), recentOperations100: Number(historyMs.toFixed(2)) },
  boundedness: { unfilteredRecipeGetManyMax: repo.recipeGetManyMax, recipeVersionGetAllCalls: repo.recipeGetAll, operationCursorPageCalls: repo.operationPageCalls },
  note: 'Node/in-memory benchmark. Timing is diagnostic, not a browser SLA; boundedness is the release invariant.',
  pass
};
await writeFile(path.join(process.cwd(), 'reports/phase8-scale.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Phase 8 scale benchmark: ${pass ? 'PASS' : 'FAIL'} · browse ${browseMs.toFixed(1)} ms · filtered ${filteredMs.toFixed(1)} ms · history ${historyMs.toFixed(1)} ms`);
if (!pass) process.exitCode = 1;
