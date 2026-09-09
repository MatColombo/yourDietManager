import test from 'node:test';
import assert from 'node:assert/strict';
import { MANUAL_ACCEPTANCE_CASES, newManualAcceptanceSession, normalizeManualAcceptanceSession, summarizeManualAcceptance } from '../src/services/manualAcceptanceService.js';

test('Phase E protocol has the required manual product coverage', () => {
  assert.equal(MANUAL_ACCEPTANCE_CASES.length, 18);
  const groups = new Set(MANUAL_ACCEPTANCE_CASES.map(item => item.group));
  for (const group of ['energy','hard','soft','regeneration','discovery','navigation','operations','persistence']) assert.ok(groups.has(group));
  for (const id of ['energy-800','energy-2600','hard-allergen','soft-preference','regenerate-alternative','taxonomy-noodles','taxonomy-dairy','context-drilldown','replace-rebalance','shopping','reload']) assert.ok(MANUAL_ACCEPTANCE_CASES.some(item => item.id === id));
});

test('Phase E acceptance stays blocked until every required case passes', () => {
  const session = newManualAcceptanceSession({ appVersion:'1.0.0-rc.32', catalogVersion:'1.2.0-planner-phase-d', now:()=> '2026-09-08T18:00:00.000Z' });
  assert.equal(summarizeManualAcceptance(session).eligible, false);
  for (const item of MANUAL_ACCEPTANCE_CASES) session.cases[item.id].status = 'pass';
  assert.equal(summarizeManualAcceptance(session).eligible, true);
  session.cases['energy-800'] = { status:'fail', severity:'P1', notes:'bad', evidence:'' };
  const summary = summarizeManualAcceptance(session);
  assert.equal(summary.eligible, false); assert.equal(summary.p1, 1);
});

test('Phase E normalizer requires fail severity and strips severity from passing cases', () => {
  const value = { schemaVersion:1, cases:{ 'energy-800':{status:'pass',severity:'P0'}, 'energy-1400':{status:'fail',severity:'P2'} } };
  const session = normalizeManualAcceptanceSession(value, { appVersion:'1.0.0-rc.32', catalogVersion:'1.2.0-planner-phase-d' });
  assert.equal(session.cases['energy-800'].severity, null);
  assert.equal(session.cases['energy-1400'].severity, 'P2');
});
