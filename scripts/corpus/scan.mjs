import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { scanCorpus, evaluateReleaseGates } from '../../src/corpus/corpusScanner.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput = process.argv[2] || 'public/data';
const policyFile = process.argv[3] || 'corpus/policies/v1-default.json';
const out = process.argv[4] || 'corpus/snapshots/latest.json';
const registry = new SchemaRegistry(async file => readJson(path.join('schemas', file)));
await registry.loadAll();
const policy = await readJson(policyFile); registry.assert('recipeCorpusPolicy', policy);
const corpus = await loadCorpusInput(corpusInput);
const snapshot = await scanCorpus({ policy, catalogVersion: corpus.manifest.catalogVersion, ...corpus, registry });
registry.assert('recipeCorpusSnapshot', snapshot);
await writeJson(out, snapshot);
console.log(JSON.stringify({ snapshotId: snapshot.snapshotId, activeRecipeCount: snapshot.activeRecipeCount, undercoveredTargetCount: snapshot.undercoveredTargetIds.length, undercoveredTargetIds: snapshot.undercoveredTargetIds.slice(0, 25), releaseGates: evaluateReleaseGates(snapshot, policy) }, null, 2));
