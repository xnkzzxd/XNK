'use strict';
// Catatan latihan per set (Phase L2): validation, upsert, isolation, ticks, bundles.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const PROG = '# Hari A\nBench press | 3x10 | ex:0025\nSquat | 2x8';
const bench = (sets, extra) => Object.assign({ exId: '0025', gerakan: 'Bench press', bodyPart: 'chest', target: 'pectorals', sets }, extra || {});
const set = (berat, rep, rpe) => ({ berat, rep, rpe });

test('parser: ranges, 0.5 kg step, set cap, at least one value, duplicates, unknown body part dropped', () => {
  const env = seededEnv();
  const p = j(env.call('_parseWorkoutEntries_', [bench([{ berat: '62,3', rep: '8', rpe: 9 }, { rep: 12 }, { durasi: 60 }], { bodyPart: 'robot' })]));
  assert.equal(p[0].sets[0].berat, 62.5);
  assert.equal(p[0].bodyPart, '');
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([{ berat: 501, rep: 1 }])]), /Bench press set 1: berat/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([{ berat: 10, rep: 1.5 }])]), /rep harus bilangan bulat/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([{ berat: 10, rep: 5, rpe: 11 }])]), /RPE/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([{ rpe: 5 }])]), /isi berat, rep, durasi, atau jarak/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench(Array(21).fill({ rep: 1 }))]), /maksimal 20 set/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([]), bench([])]), /dua kali/);
  assert.throws(() => env.call('_parseWorkoutEntries_', 'x'), /tidak valid/);
  assert.throws(() => env.call('_parseWorkoutEntries_', [bench([{ rep: 1 }], { exId: 'a b!' })]), /kode gerakan/);
});

test('admin save: upsert per day and exercise, delete on empty, schedule must belong to the client', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const day = '2026-10-10';
  let r = j(env.call('saveWorkoutLog', t, 'PT-A', day, '', [bench([set(60, 10, 8), set(62.5, 8, 9)], { catatan: 'siku aman' })]));
  assert.equal(r.days.length, 1);
  assert.deepEqual(r.days[0].items[0].sets.map(s => [s.berat, s.rep]), [[60, 10], [62.5, 8]]);
  assert.equal(r.days[0].items[0].catatan, 'siku aman');
  assert.equal(r.last['ex:0025'].sets.length, 2);
  r = j(env.call('saveWorkoutLog', t, 'PT-A', day, '', [bench([set(65, 5)])]));
  assert.equal(r.days[0].items[0].sets.length, 1, 'same day + exercise is replaced');
  assert.equal(env.sheet('WorkoutLog').rows.length, 2);
  r = j(env.call('saveWorkoutLog', t, 'PT-A', day, '', [bench([])]));
  assert.equal(r.days.length, 0, 'empty sets delete');
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', day, 'SCH-NOPE', [bench([set(1, 1)])]), /Sesi tidak ditemukan/);
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-NOPE', day, '', [bench([set(1, 1)])]), /Klien tidak ditemukan/);
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', '2099-01-01', '', [bench([set(1, 1)])]), /masa depan/);
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', '2020-01-01', '', [bench([set(1, 1)])]), /90 hari/);
  assert.equal(env.call('saveWorkoutLog', t, 'PT-A', day, 'SCH-A1', [bench([set(1, 1)])]).days.length, 1, 'own schedule is accepted');
});

test('member save: token decides the client, isolation, back-date limit, throttle, no outbound traffic', () => {
  const env = seededEnv();
  const a = env.memberToken(KEY_A), b = env.memberToken(KEY_B);
  const today = env.call('_todayWib_');
  const r = j(env.call('logMyWorkout', a, today, [bench([set(40, 10)])]));
  assert.equal(r.days[0].items[0].oleh, 'klien');
  assert.deepEqual(j(env.call('getMyWorkout', b)), { days: [], last: {} }, 'another client sees nothing');
  assert.throws(() => env.call('logMyWorkout', a, today, [bench([set(41, 10)])]), /Tunggu sebentar/);
  assert.throws(() => env.call('logMyWorkout', b, '2020-01-01', [bench([set(1, 1)])]), /7 hari/);
  assert.equal(env.sheet('WorkoutLog').rows.slice(1).every(row => row[1] === 'PT-A'), true);
  assert.equal(env.fetches.length, 0);
});

test('member save keeps an admin row for the same exercise; admin sees both', () => {
  const env = seededEnv();
  const t = env.adminToken(), a = env.memberToken(KEY_A);
  const today = env.call('_todayWib_');
  env.call('saveWorkoutLog', t, 'PT-A', today, '', [bench([set(60, 10)])]);
  env.call('logMyWorkout', a, today, [bench([set(30, 12)])]);
  const rows = env.sheet('WorkoutLog').rows.slice(1);
  assert.deepEqual(rows.map(x => x[17]).sort(), ['admin', 'klien']);
});

test('member sets that cover the planned sets tick the program item for today (add only)', () => {
  const env = seededEnv();
  const t = env.adminToken(), a = env.memberToken(KEY_A);
  env.call('saveMemberProgram', t, 'PT-A', PROG);
  const today = env.call('_todayWib_');
  const mk = (n, name, exId, count) => ({ n, hari: 'Hari A', exId, gerakan: name, sets: Array(count).fill({ berat: 20, rep: 10 }) });
  env.call('logMyWorkout', a, today, [mk(1, 'Bench press', '0025', 2)]);
  assert.equal(env.sheet('ProgramLog'), null, 'only 2 of 3 sets: not ticked');
  env.context.CacheService.getScriptCache().remove('throttle_wk_PT-A');
  env.call('logMyWorkout', a, today, [mk(1, 'Bench press', '0025', 3), mk(2, 'Squat', '', 2)]);
  const log = env.sheet('ProgramLog').rows[1];
  assert.equal(String(log[4]), '1,2');
  assert.equal(env.fetches.length, 0);
});

test('bundles carry the workout part; one bad part does not break the rest', () => {
  const env = seededEnv();
  const t = env.adminToken(), a = env.memberToken(KEY_A);
  env.call('saveWorkoutLog', t, 'PT-A', env.call('_todayWib_'), '', [bench([set(60, 10)])]);
  assert.equal(j(env.call('getPortalMore', a)).workout.days.length, 1);
  assert.equal(j(env.call('getClientBundle', t, 'PT-A')).workout.days.length, 1);
  assert.equal(j(env.call('getPortalMore', env.memberToken(KEY_B))).workout.days.length, 0);
});
