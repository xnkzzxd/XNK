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

test('the bundle reads far less than the separate calls', () => {
  const env = rich(), t = env.adminToken();
  env.resetReads(); env.call('getClientBundle', t, 'PT-A'); const bundle = env.reads().total;
  env.resetReads();
  ['getTasksForMember', 'getMemberProgress', 'getClientCare', 'getMemberProgram', 'getWorkoutLog', 'getClientNutrition'].forEach(n => env.call(n, t, 'PT-A'));
  // Fase Q: bundle juga menghitung tafsir (insight) yang tidak punya panggilan lama; beri batas jelas untuk biayanya.
  const INSIGHT_ALLOWANCE = 8;
  assert.ok(bundle <= env.reads().total + INSIGHT_ALLOWANCE, bundle + ' vs ' + env.reads().total);
});

test('date cells in free-text care answers never reach the bundle as Date objects', () => {
  // google.script.run answers null for the WHOLE result when it holds a Date ("Tidak ada jawaban." on every card).
  const env = rich(), t = env.adminToken();
  env.call('saveAssessment', t, 'PT-A', { goal: 'Turun 5 kg', schedulePref: 'pagi', bodyFat: 20 });
  const D = require('vm').runInContext('Date', env.context);
  const asm = env.sheet('Assessments'), last = asm.rows[asm.getLastRow() - 1];
  // "19.00" typed as a time: Sheets builds 1899-12-30 19:00 in the sheet's zone (Jakarta then = LMT +07:07:12).
  last[5] = new D(Date.UTC(1899, 11, 30, 19, 0, 0) - (7 * 3600 + 7 * 60 + 12) * 1000);
  last[3] = new D('2026-07-08T00:00:00+07:00');   // "7-8" read as a date
  const isDate = x => Object.prototype.toString.call(x) === '[object Date]';
  const hasDate = x => isDate(x) || (!!x && typeof x === 'object' && Object.keys(x).some(k => hasDate(x[k])));
  const raw = env.callRaw('getClientBundle', t, 'PT-A');
  assert.equal(hasDate(raw), false);
  assert.equal(raw.care.assessment.schedulePref, '19.00');
  assert.equal(raw.care.assessment.goal, '2026-07-08');
  assert.equal(hasDate(env.callRaw('getClientCare', t, 'PT-A')), false);
});
