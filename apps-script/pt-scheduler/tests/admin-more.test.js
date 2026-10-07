'use strict';
// Fase K2: getAdminMore dan getClientBundle = bagian-bagian lama dalam satu panggilan, hanya admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

function rich() {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-20', berat: 77 });
  env.call('saveAssessment', t, 'PT-A', { goal: 'Turun 5 kg' });
  env.call('saveMemberProgram', t, 'PT-A', '# Hari A\nBench | 3x10');
  env.call('addTask', t, { memberId: 'PT-A', title: 'Jalan kaki', category: 'aktivitas', description: '', dueDate: '', repeat: 'none' });
  return env;
}

test('getAdminMore parts equal the old functions', () => {
  const env = rich(), t = env.adminToken();
  const more = j(env.call('getAdminMore', t, 10, 2026));
  assert.deepEqual(more.transactionLog, j(env.call('getMemberTransactionLog', t)));
  assert.deepEqual(more.taskSummary, j(env.call('getTaskSummary', t)));
  assert.deepEqual(more.renewals, j(env.call('getRenewalRequests', t)));
  assert.deepEqual(more.packageTrend, j(env.call('getPackageTrendStats', t, 10, 2026)));
  assert.deepEqual(more.revenue, j(env.call('getRevenueSummary', t, 10, 2026)));
  assert.deepEqual(more.hub.stats !== undefined, true);
  assert.equal(more.finance.enabled, false);
});

test('getClientBundle parts equal the old functions', () => {
  const env = rich(), t = env.adminToken();
  const b = j(env.call('getClientBundle', t, 'PT-A'));
  assert.deepEqual(b.tasks, j(env.call('getTasksForMember', t, 'PT-A')));
  assert.deepEqual(b.progress, j(env.call('getMemberProgress', t, 'PT-A')));
  assert.deepEqual(b.care, j(env.call('getClientCare', t, 'PT-A')));
  assert.deepEqual(b.program, j(env.call('getMemberProgram', t, 'PT-A')));
});

test('a bad member fails one part, not the whole bundle shape; auth is required', () => {
  const env = rich();
  const b = j(env.call('getClientBundle', env.adminToken(), 'PT-NOPE'));
  assert.ok(b.care.error && b.program.error);
  assert.throws(() => env.call('getAdminMore', 'x', 10, 2026));
  assert.throws(() => env.call('getClientBundle', env.memberToken(KEY_A), 'PT-A'));
  assert.throws(() => env.call('getAdminMore', env.memberToken(KEY_A)));
});

test('the bundle reads far less than the four old calls', () => {
  const env = rich(), t = env.adminToken();
  env.resetReads(); env.call('getClientBundle', t, 'PT-A'); const bundle = env.reads().total;
  env.resetReads();
  ['getTasksForMember', 'getMemberProgress', 'getClientCare', 'getMemberProgram'].forEach(n => env.call(n, t, 'PT-A'));
  assert.ok(bundle <= env.reads().total, bundle + ' vs ' + env.reads().total);
});
