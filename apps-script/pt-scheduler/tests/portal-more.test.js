'use strict';
// Fase K: getPortalMore = semua data sisa portal dalam satu panggilan, sama persis dengan fungsi lamanya, dan jauh lebih hemat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const A = env => env.memberToken(KEY_A);

function rich() {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-01', berat: 80, pinggang: 90 });
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-20', berat: 77, pinggang: 87 });
  env.call('saveFitnessTests', t, 'PT-A', { tanggal: '2026-09-01', values: { pushup: 20 } });
  env.call('saveAssessment', t, 'PT-A', { goal: 'Turun 5 kg' });
  env.call('saveMemberProgram', t, 'PT-A', '# Hari A\nBench | 3x10\nPush-up | 3x12');
  env.call('saveContent', t, { tipe: 'tips', judul: 'Minum cukup', isi: 'Minum 2 liter.' });
  env.call('addTask', t, { memberId: 'PT-A', title: 'Jalan kaki', category: 'aktivitas', description: '30 menit', dueDate: '', repeat: 'none' });
  return env;
}

test('every part equals what the old single-purpose function returns', () => {
  const env = rich();
  const tok = A(env);
  const more = j(env.call('getPortalMore', tok));
  assert.deepEqual(more.progress, j(env.call('getMyProgress', tok)));
  assert.deepEqual(more.tasks, j(env.call('getMyTasks', tok)));
  assert.deepEqual(more.healthForm, j(env.call('getMyHealthForm', tok)));
  assert.deepEqual(more.assessment, j(env.call('getMyAssessment', tok)));
  assert.deepEqual(more.renewal, j(env.call('getMyRenewal', tok)));
  assert.deepEqual(more.bills, j(env.call('getMyBills', tok)));
  assert.deepEqual(more.classGroup, j(env.call('getMyClassGroup', tok)));
  assert.deepEqual(more.meal, j(env.call('getMyMealToday', tok)));
  assert.deepEqual(more.program, j(env.call('getMyProgram', tok)));
  assert.deepEqual(more.content, j(env.call('getMyContent', tok)));
  assert.deepEqual(more.coachStatus.status, j(env.call('getCoachStatus', '')));
  assert.ok(more.progress.entries.length === 2 && more.tasks.length === 1 && more.program.days.length === 1 && more.content.length === 1, 'the fixture really has data in every part');
  assert.ok(!isNaN(Date.parse(more.at)));
});

test('only the client\'s own data: no other client, no phone numbers, no private care data', () => {
  const env = rich();
  const t = env.adminToken();
  env.call('saveClientNotes', t, 'PT-A', { flag: 'RAHASIA-LUTUT', notes: 'RAHASIA-CATATAN' });
  env.call('saveSessionNote', t, 'SCH-A1', { dilatih: 'Squat', pribadi: 'RAHASIA-PRIBADI', rpe: 9 });
  env.call('saveMemberProgram', t, 'PT-B', '# Hari B\nDeadlift-Budi | 3x5');
  const wire = JSON.stringify(env.call('getPortalMore', A(env)));
  assert.ok(!wire.includes('RAHASIA'), 'private notes, flags and RPE never travel');
  assert.ok(!wire.includes('Deadlift-Budi') && !wire.includes('Budi'), 'nothing about another client');
  assert.ok(!wire.includes('6281111111111') && !wire.includes('081222222222'), 'no phone numbers');
  const budi = j(env.call('getPortalMore', env.memberToken(KEY_B)));
  assert.deepEqual(budi.program.days.map(d => d.hari), ['Hari B']);
  assert.equal(budi.tasks.length, 0);
});

test('auth: a token is required, and an admin token is not a client token', () => {
  const env = rich();
  assert.throws(() => env.call('getPortalMore', null), /AUTH_REQUIRED/);
  assert.throws(() => env.call('getPortalMore', 'nope.nope'), /AUTH_REQUIRED/);
  assert.throws(() => env.call('getPortalMore', env.adminToken()), /AUTH_REQUIRED/);
});

test('one failing part becomes { error } and the rest still arrive', () => {
  const env = rich();
  env.context._billsFor_ = () => { throw new Error('Tagihan rusak.'); };
  const more = j(env.call('getPortalMore', A(env)));
  assert.deepEqual(more.bills, { error: 'Tagihan rusak.' });
  assert.equal(more.tasks.length, 1);
  assert.equal(more.program.days.length, 1);
});

test('it is far cheaper than the old calls: Schedules and MemberData are read once, in total at least 60% fewer sheet reads', () => {
  const env = rich();
  const tok = A(env);
  env.resetReads();
  ['getMyProgress', 'getMyTasks', 'getMyHealthForm', 'getMyAssessment', 'getMyRenewal', 'getMyBills', 'getMyClassGroup', 'getMyMealToday', 'getMyProgram', 'getMyContent'].forEach(f => env.call(f, tok));
  env.call('getCoachStatus', '');
  const old = env.reads();
  env.resetReads();
  env.call('getPortalMore', tok);
  const now = env.reads();
  // Each sheet access costs a header check plus the data read (getOrCreateSheet_), so "once" = 2 reads.
  assert.ok(now.bySheet.Schedules <= 2, 'Schedules read once (' + now.bySheet.Schedules + ' reads)');
  assert.ok(now.bySheet.MemberData <= 4, 'one authentication (' + now.bySheet.MemberData + ' reads)');
  assert.ok(old.bySheet.MemberData >= 30, 'the old calls authenticated every time (' + old.bySheet.MemberData + ')');
  assert.ok(now.total <= old.total * 0.4, 'reads ' + now.total + ' vs ' + old.total);
});
