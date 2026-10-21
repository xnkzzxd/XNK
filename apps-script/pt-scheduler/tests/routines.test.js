'use strict';
// Phase O: client-own routines, Jelajahi templates, routine history for the routine chart.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const ex = (gerakan, extra) => Object.assign({ gerakan, set: 3, jenis: 'beban', repMin: 10 }, extra || {});
const tick = env => { env.now = (env.now || Date.now()) + 3000; };
const COACH = [{ hari: 'Upper', items: [ex('Bench press', { exId: '0025' }), ex('Row')] }, { hari: 'Lower', items: [ex('Squat')] }];

test('a client creates, edits and deletes own routines; the coach program is never touched', () => {
  const env = seededEnv();
  const t = env.adminToken(), m = env.memberToken(KEY_A);
  env.call('saveMemberProgram', t, 'PT-A', COACH);
  let p = j(env.call('saveMyRoutine', m, '', { hari: 'Cardio pagi', items: [ex('Plank', { jenis: 'waktu', repMin: 45 })] }));
  assert.deepEqual(p.own.map(d => d.hari), ['Cardio pagi']);
  assert.deepEqual(p.days.map(d => d.hari), ['Upper', 'Lower'], 'coach program still there');
  assert.equal(p.own[0].items[0].rep, '45 dtk');
  tick(env);
  p = j(env.call('saveMyRoutine', m, 'Cardio pagi', { hari: 'Cardio', items: [ex('Plank', { jenis: 'waktu', repMin: 60 }), ex('Burpee')] }));
  assert.deepEqual(p.own.map(d => [d.hari, d.items.length]), [['Cardio', 2]]);
  // The coach saving the program again keeps the client's routine, and the coach sees it read-only.
  env.call('saveMemberProgram', t, 'PT-A', COACH.slice(0, 1));
  const admin = j(env.call('getMemberProgram', t, 'PT-A'));
  assert.deepEqual(admin.days.map(d => d.hari), ['Upper']);
  assert.deepEqual(admin.own.map(d => d.hari), ['Cardio']);
  // Another client sees nothing of it.
  assert.deepEqual(j(env.call('getMyProgram', env.memberToken(KEY_B))).own, []);
  p = j(env.call('deleteMyRoutine', m, 'Cardio'));
  assert.deepEqual(p.own, []);
  assert.deepEqual(p.days.map(d => d.hari), ['Upper']);
});

test('own routines: validation, unique names, no clash with the coach days, limit, throttle', () => {
  const env = seededEnv();
  const t = env.adminToken(), m = env.memberToken(KEY_A);
  env.call('saveMemberProgram', t, 'PT-A', COACH);
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: 'Kosong', items: [] }), /minimal satu gerakan/);
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: '', items: [ex('A')] }), /beri nama hari/);
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: 'upper', items: [ex('A')] }), /dipakai program coach/);
  tick(env);
  assert.throws(() => env.call('saveMyRoutine', m, 'Tidak ada', { hari: 'X', items: [ex('A')] }), /tidak ditemukan/);
  tick(env);
  env.call('saveMyRoutine', m, '', { hari: 'R1', items: [ex('A')] });
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: 'R2', items: [ex('A')] }), /Tunggu sebentar/);
  tick(env);
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: 'r1', items: [ex('A')] }), /sudah dipakai/);
  for (let i = 2; i <= 10; i++) { tick(env); env.call('saveMyRoutine', m, '', { hari: 'R' + i, items: [ex('A')] }); }
  tick(env);
  assert.throws(() => env.call('saveMyRoutine', m, '', { hari: 'R11', items: [ex('A')] }), /Maksimal 10 rutinitas/);
  assert.throws(() => env.call('deleteMyRoutine', m, 'Upper'), /tidak ditemukan/, 'a coach day cannot be deleted by the client');
  assert.throws(() => env.call('saveMyRoutine', 'bogus', '', { hari: 'X', items: [ex('A')] }), /AUTH_REQUIRED/);
});

test('Jelajahi: only templates the coach opened are visible and copyable; copies get free names', () => {
  const env = seededEnv();
  const t = env.adminToken(), m = env.memberToken(KEY_A);
  env.call('saveProgramTemplate', t, 'Pemula', [{ hari: 'Full body', items: [ex('Squat'), ex('Push-up', { jenis: 'badan' })] }]);
  env.call('saveProgramTemplate', t, 'Rahasia', [{ hari: 'X', items: [ex('A')] }]);
  assert.deepEqual(j(env.call('getMyProgram', m)).explore, [], 'off by default');
  assert.throws(() => env.call('copyRoutineToMine', m, { template: 'Pemula' }), /tidak ditemukan/);
  env.call('setTemplateExplore', t, 'Pemula', true);
  assert.equal(j(env.call('getProgramTemplates', t)).find(x => x.name === 'Pemula').jelajahi, true);
  const ex1 = j(env.call('getMyProgram', m)).explore;
  assert.deepEqual(ex1.map(x => x.name), ['Pemula']);
  assert.equal(ex1[0].days[0].items.length, 2);
  // Saving the template again keeps the flag unless told otherwise.
  env.call('saveProgramTemplate', t, 'Pemula', [{ hari: 'Full body', items: [ex('Squat'), ex('Push-up', { jenis: 'badan' })] }]);
  assert.equal(j(env.call('getMyProgram', m)).explore.length, 1);
  let p = j(env.call('copyRoutineToMine', m, { template: 'Pemula' }));
  assert.deepEqual(p.added, ['Full body']);
  tick(env);
  p = j(env.call('copyRoutineToMine', m, { template: 'Pemula', hari: 'Full body' }));
  assert.deepEqual(p.own.map(d => d.hari), ['Full body', 'Full body (2)']);
  assert.throws(() => env.call('copyRoutineToMine', m, { template: 'Rahasia' }), /tidak ditemukan/);
  // A day of the client's own coach program can be copied too.
  env.call('saveMemberProgram', t, 'PT-A', COACH);
  tick(env);
  p = j(env.call('copyRoutineToMine', m, { hari: 'Upper' }));
  assert.deepEqual(p.added, ['Upper (2)']);
  assert.equal(p.own.find(d => d.hari === 'Upper (2)').items[0].exId, '0025');
  env.call('saveProgramTemplate', t, 'Pemula', [{ hari: 'Full body', items: [ex('Squat')] }], { jelajahi: false });
  assert.deepEqual(j(env.call('getMyProgram', m)).explore, []);
});

test('routine history groups each logged day by its routine name for the chart', () => {
  const env = seededEnv();
  const m = env.memberToken(KEY_A);
  const today = env.call('_todayWib_');
  env.call('logMyWorkout', m, today, [
    { gerakan: 'Bench press', hari: 'Upper', n: 1, sets: [{ berat: 20, rep: 10, jenis: 'w' }, { berat: 60, rep: 8 }, { berat: 60, rep: 8 }] }
  ], { cid: 'abc', hari: 'Upper', mulai: new Date(Date.now() - 3600e3).toISOString(), selesai: new Date().toISOString() });
  const w = j(env.call('getMyWorkout', m));
  assert.deepEqual(w.routineHist.Upper, [{ tanggal: today, volume: 960, reps: 16, sets: 2, durasi: 3600 }]);
  const hist = j(env.call('_workoutRoutineHist_', [{ tanggal: '2026-10-01', items: [{ hari: 'Lower', sets: [{ berat: 100, rep: 5, jenis: '' }] }] }], []));
  assert.deepEqual(hist, { Lower: [{ tanggal: '2026-10-01', volume: 500, reps: 5, sets: 1, durasi: 0 }] });
});
