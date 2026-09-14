import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildIdentity } from './revision-v2/build-identity.mjs';

export async function validateTraceability({ root = process.cwd() } = {}) {
  const json = async file => JSON.parse(await readFile(`${root}/${file}`, 'utf8'));
  const trace = await json('specs/revision_v2/TRACEABILITY.json');
  const registry = await json('specs/revision_v2/TEST_REGISTRY.json');
  const state = await json('reports/revision_v2/STATE.json');
  const baseline = await json('specs/revision_v2/baseline/MANIFEST.json');
  const errors = []; const require = (condition, message) => { if (!condition) errors.push(message); };
  const unique = (rows, label) => { const ids = rows.map(row => row.id); require(new Set(ids).size === ids.length, `Duplicate ${label}`); return new Map(rows.map(row => [row.id, row])); };
  const reqs = unique(trace.requirements, 'requirement'), findings = unique(trace.findings, 'finding'), tests = unique(registry.tests, 'test'), tasks = unique(state.tasks, 'task'), phases = unique(state.phases, 'phase');
  const text = await readFile(`${root}/specs/revision_v2/baseline/yourDietManager_CR_V2_SPECIFICA.md`, 'utf8');
  const ids = [...text.matchAll(/^(?:- )?\*\*([A-Z]+-\d+)(?:\*\*| )/gm)].map(match => match[1]);
  require(reqs.size === 149 && ids.length === 149 && ids.every(id => reqs.has(id)), 'Requirement IDs differ from authoritative specification');
  require(findings.size === 27 && Array.from({ length: 27 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`).every(id => findings.has(id)), 'Expected findings R01–R27');
  require(tests.size === 79 && Array.from({ length: 79 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`).every(id => tests.has(id)), 'Expected tests T01–T79');
  require(tasks.size === 40 && phases.size === 9, 'Expected 40 tasks and 9 phases');
  const plan = await readFile(`${root}/specs/revision_v2/FASI_SVILUPPO.md`, 'utf8');
  const plannedTasks = [...plan.matchAll(/^\*\*(R[0-8]\.\d+) /gm)].map(match => match[1]);
  require(plannedTasks.length === 40 && plannedTasks.every(id => tasks.has(id)), 'Task IDs differ from plan');
  const build = await buildIdentity(root);
  const evidence = new Map();
  for (const phase of state.phases) {
    if (!phase.report) continue;
    try {
      await access(`${root}/${phase.report}`);
      const report = await json(`reports/revision_v2/${phase.id}/test-results.json`);
      for (const item of report.evidence) { require(!evidence.has(item.id), `Duplicate evidence ${item.id}`); evidence.set(item.id, item); }
    } catch (error) { errors.push(`Missing phase report: ${phase.id}: ${error.message}`); }
  }
  for (const record of baseline.files) {
    const digest = createHash('sha256').update(await readFile(`${root}/${record.file}`)).digest('hex');
    require(digest === record.sha256, `Baseline hash mismatch: ${record.file}`);
  }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Cyclic phase dependency ${id}`); return; }
    if (visited.has(id)) return;
    const phase = phases.get(id); if (!phase) { errors.push(`Unknown phase ${id}`); return; }
    visiting.add(id); for (const dependency of phase.dependencies) visit(dependency); visiting.delete(id); visited.add(id);
  }
  for (const id of phases.keys()) visit(id);
  for (const item of reqs.values()) {
    require(item.requirementId === item.id && item.sourceFile && item.sourceSha256 && item.changeRequestSection, `Missing source contract ${item.id}`);
    require(phases.has(item.ownerPhase) && tasks.get(item.ownerTask)?.phase === item.ownerPhase, `Missing owner ${item.id}`);
    require(item.origin && (item.reviewIds?.length || item.origin.startsWith('CR')), `Missing origin ${item.id}`);
    require(item.reviewIds.every(id => findings.has(id)), `Unknown finding for ${item.id}`);
    require(item.testIds.length && item.testIds.every(id => tests.has(id)), `Unknown/missing tests for ${item.id}`);
    require(item.supportingTasks.every(id => tasks.has(id)), `Unknown supporting task ${item.id}`);
    const source = baseline.files.find(file => file.file === item.sourceFile); require(source?.sha256 === item.sourceSha256, `Wrong source hash ${item.id}`);
    for (const id of item.evidenceIds) require(evidence.has(id), `Missing evidence ${id}`);
    if (item.status === 'VERIFICATO') {
      require(!item.remainingScopes.length && item.evidenceIds.length > 0 && item.changedFiles.length > 0, `Unclosed verified requirement ${item.id}`);
      require(item.lastVerifiedArtifactSha256 === build.sha256, `Stale requirement build ${item.id}`);
      require(item.evidenceIds.every(id => evidence.get(id)?.result === 'PASS' && evidence.get(id)?.buildSha256 === build.sha256), `Invalid verification evidence ${item.id}`);
    }
  }
  for (const finding of findings.values()) require(finding.requirementIds.length && finding.requirementIds.every(id => reqs.has(id)) && phases.has(finding.closurePhase), `Unmapped finding ${finding.id}`);
  for (const test of tests.values()) {
    require(trace.requirements.some(item => item.testIds.includes(test.id)), `Unlinked test ${test.id}`);
    if (test.status === 'PASS') {
      require(test.completeScope === true && test.buildSha256 === build.sha256 && test.catalog && test.fixture && test.actions?.length && test.expected && test.actual && test.evidenceIds?.length, `Incomplete PASS ${test.id}`);
      require(test.evidenceIds.every(id => evidence.get(id)?.result === 'PASS'), `Invalid PASS evidence ${test.id}`);
    }
  }
  for (const task of tasks.values()) {
    require(phases.has(task.phase) && task.id.startsWith(`${task.phase}.`), `Invalid task phase ${task.id}`);
    if (task.status === 'VERIFICATO') require(task.evidenceIds.length && task.evidenceIds.every(id => evidence.get(id)?.result === 'PASS' && evidence.get(id)?.buildSha256 === build.sha256), `Unverified task ${task.id}`);
  }
  for (const phase of phases.values()) if (phase.status === 'COMPLETATA') {
    require(phase.report && phase.buildSha256 === build.sha256 && state.tasks.filter(task => task.phase === phase.id).every(task => task.status === 'VERIFICATO'), `Incomplete phase ${phase.id}`);
    if (phase.id === 'R7') require(trace.requirements.filter(item => !item.id.startsWith('EXT')).every(item => item.status === 'VERIFICATO') && registry.tests.filter(item => item.core).every(item => item.status === 'PASS') && !state.openCoreIssues.some(item => ['P0', 'P1'].includes(item.severity)), 'R7 gate remains open');
  }
  for (const extension of state.enabledExtensions || []) require(reqs.get(extension)?.testIds.every(id => tests.get(id)?.status === 'PASS'), `Unverified enabled extension ${extension}`);
  for (const item of evidence.values()) {
    require(item.buildSha256 === build.sha256 || item.historical === true, `Stale evidence ${item.id}`);
    if (item.path) {
      try { const digest = createHash('sha256').update(await readFile(`${root}/${item.path}`)).digest('hex'); require(digest === item.sha256, `Evidence hash mismatch ${item.id}`); }
      catch { errors.push(`Missing evidence file ${item.id}`); }
    }
  }
  return { valid: !errors.length, errors, counts: { findings: findings.size, requirements: reqs.size, phases: phases.size, tasks: tasks.size, tests: tests.size }, buildSha256: build.sha256 };
}
if (process.argv[1]?.endsWith('validate-revision-v2-traceability.mjs')) {
  const result = await validateTraceability(); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exitCode = 1;
}
