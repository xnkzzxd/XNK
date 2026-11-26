'use strict';
// Fase AC3 (T-2320…T-2328): alat catat coach — setelan alat & cue, hapus catatan latihan, riwayat per gerakan,
// coach mencatat makanan klien, tanggapan harian, ringkasan 31 hari. docs/coachkit/Design.md §AC3.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
function setup() {
  const env = seededEnv();
  return { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() };
}
const today = env => env.call('_todayWib_');
const day = (env, n) => env.call('_addDaysIso_', today(env), n);
const set = (berat, rep) => ({ berat, rep });

test('setelan alat & cue: saved per client and exercise, shown in both workout reads, empty = deleted, guarded', () => {
  const { env, admin, ani, budi } = setup();
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -2), '', [{ gerakan: 'Leg press', sets: [set(80, 10)] }]);
  const key = j(env.call('getWorkoutLog', admin, 'PT-A')).days[0].items[0].key;
  const r = j(env.call('saveExerciseNote', admin, 'PT-A', key, { setelan: 'Kursi 4, sandaran 2', cue: 'Lutut ke luar' }));
  assert.deepEqual(r.notes[key], { setelan: 'Kursi 4, sandaran 2', cue: 'Lutut ke luar' });
  assert.deepEqual(j(env.call('getWorkoutLog', admin, 'PT-A')).notes[key].setelan, 'Kursi 4, sandaran 2');
  assert.equal(j(env.call('getMyWorkout', ani)).notes[key].cue, 'Lutut ke luar', 'the client reads it in the logger');
  assert.deepEqual(j(env.call('getMyWorkout', budi)).notes, {}, 'never another client');
  env.call('saveExerciseNote', admin, 'PT-A', key, { setelan: 'Kursi 5', cue: '' });
  assert.equal(env.sheet('ExerciseNotes').rows.length, 2, 'an update keeps one row');
  env.call('saveExerciseNote', admin, 'PT-A', key, { setelan: '', cue: '' });
  assert.equal(env.sheet('ExerciseNotes').rows.length, 1, 'both empty deletes it');
  assert.throws(() => env.call('saveExerciseNote', admin, 'PT-A', key, { setelan: 'x'.repeat(81) }), /Setelan alat/);
  assert.throws(() => env.call('saveExerciseNote', admin, 'PT-A', '', { setelan: 'x' }), /tidak dikenal/);
  assert.throws(() => env.call('saveExerciseNote', '', 'PT-A', key, { setelan: 'x' }), /admin|sesi|login/i);
});

test('delete one exercise or a whole day from the history; the session row goes with the day', () => {
  const { env, admin } = setup();
  const d = day(env, -1);
  env.call('saveWorkoutLog', admin, 'PT-A', d, '', [{ gerakan: 'Leg press', sets: [set(80, 10), set(80, 8)] }, { gerakan: 'Lat pulldown', sets: [set(35, 10)] }], { hari: 'A', rasa: 4 });
  const day0 = j(env.call('getWorkoutLog', admin, 'PT-A')).days.find(x => x.tanggal === d);
  const legKey = day0.items.find(i => /Leg/i.test(i.gerakan)).key;
  const r1 = j(env.call('deleteWorkoutEntries', admin, 'PT-A', d, [legKey]));
  assert.equal(r1.removed, 2);
  assert.deepEqual(r1.days.find(x => x.tanggal === d).items.map(i => i.gerakan), ['Lat pulldown']);
  const r2 = j(env.call('deleteWorkoutEntries', admin, 'PT-A', d, []));
  assert.equal(r2.removed, 1);
  assert.ok(!r2.days.some(x => x.tanggal === d));
  assert.ok(!(env.sheet('WorkoutSessions').rows.slice(1).some(r => r[1] === 'PT-A' && r[2] === d)), 'the session summary is removed with the day');
  assert.throws(() => env.call('deleteWorkoutEntries', admin, 'PT-A', d, []), /tidak ditemukan/);
  assert.throws(() => env.call('deleteWorkoutEntries', admin, 'PT-A', 'x', []), /Tanggal/);
});

test('exercise history: every session of one exercise within a year, newest first, with the top estimated 1RM', () => {
  const { env, admin } = setup();
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -10), '', [{ gerakan: 'Leg press', sets: [set(70, 10)] }]);
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -3), '', [{ gerakan: 'Leg press', sets: [set(80, 10), set(85, 6)] }, { gerakan: 'Row', sets: [set(30, 10)] }]);
  const key = j(env.call('getWorkoutLog', admin, 'PT-A')).days[0].items.find(i => /Leg/i.test(i.gerakan)).key;
  const h = j(env.call('getWorkoutExerciseHistory', admin, 'PT-A', key));
  assert.deepEqual(h.days.map(x => x.tanggal), [day(env, -3), day(env, -10)]);
  assert.equal(h.days[0].sets.length, 2);
  assert.ok(h.days[0].top > h.days[1].top);
});

test('the coach logs food for a client (marked coach-), resends add nothing, deletes it; 31-day log with stats', () => {
  const { env, admin, ani } = setup();
  const r = j(env.call('logClientFood', admin, 'PT-A', { waktu: 'siang', id: 'HR002', porsi: 2, cid: 'x1', tanggal: day(env, -2) }));
  const d2 = r.days.find(x => x.tanggal === day(env, -2));
  assert.equal(d2.items.length, 1);
  assert.equal(d2.items[0].cid, 'coach-x1');
  env.call('logClientFood', admin, 'PT-A', { waktu: 'siang', id: 'HR002', porsi: 2, cid: 'x1', tanggal: day(env, -2) });
  assert.equal(env.sheet('FoodLog').rows.length, 2, 'a resend with the same cid adds nothing');
  assert.equal(j(env.call('getMyNutrition', ani)).enabled !== undefined, true);
  const big = j(env.call('getClientFoodLog', admin, 'PT-A', 31));
  assert.equal(big.days.length, 31);
  assert.equal(big.stats.logged, 1);
  assert.equal(big.stats.top[0].nama, 'Telur ayam ras');
  assert.equal(j(env.call('getClientFoodLog', admin, 'PT-A', 99)).days.length, 31, 'clamped to 31');
  assert.equal(j(env.call('getClientFoodLog', admin, 'PT-A')).days.length, 7, 'default stays 7');
  const after = j(env.call('deleteClientFood', admin, 'PT-A', d2.items[0].id));
  assert.equal(after.days.find(x => x.tanggal === day(env, -2)).items.length, 0);
  assert.throws(() => env.call('logClientFood', admin, 'PT-A', { waktu: 'siang', id: 'HR002', porsi: 1, tanggal: day(env, -40) }), /Tanggal/);
});

test('daily food feedback: a mark and a short note per day; the client reads it; empty = deleted', () => {
  const { env, admin, ani, budi } = setup();
  const d = day(env, -1);
  const r = j(env.call('saveFoodFeedback', admin, 'PT-A', d, { tanda: 'kurang', catatan: 'Protein kurang, tambah telur' }));
  assert.deepEqual(r.feedback[d], { tanda: 'kurang', catatan: 'Protein kurang, tambah telur' });
  assert.equal(j(env.call('getClientFoodLog', admin, 'PT-A')).feedback[d].tanda, 'kurang');
  const mine = j(env.call('getMyNutrition', ani));
  if (mine.enabled) {
    assert.equal(mine.feedback[d].catatan, 'Protein kurang, tambah telur', 'the client sees the note in Makan');
    const other = j(env.call('getMyNutrition', budi));
    assert.ok(!other.feedback || !other.feedback[d], 'never another client');
  }
  env.call('saveFoodFeedback', admin, 'PT-A', d, { tanda: 'pas', catatan: '' });
  assert.equal(env.sheet('FoodFeedback').rows.length, 2, 'upsert keeps one row per day');
  env.call('saveFoodFeedback', admin, 'PT-A', d, { tanda: '', catatan: '' });
  assert.equal(env.sheet('FoodFeedback').rows.length, 1);
  assert.throws(() => env.call('saveFoodFeedback', admin, 'PT-A', d, { tanda: 'enak' }), /pas, kurang, atau lebih/);
  assert.throws(() => env.call('saveFoodFeedback', admin, 'PT-A', day(env, 1), { tanda: 'pas' }), /Tanggal/);
});

test('pure: weekly averages count logged days only; top foods by count', () => {
  const { env } = setup();
  const D = (t, items) => ({ tanggal: t, items, totals: items.reduce((s, i) => ({ kal: s.kal + i.kal, p: s.p + i.p }), { kal: 0, p: 0 }) });
  const s = j(env.call('_foodMonthStats_', [D('2026-11-24', [{ foodId: 'A', nama: 'Nasi', kal: 400, p: 8 }]), D('2026-11-25', [{ foodId: 'A', nama: 'Nasi', kal: 600, p: 12 }, { foodId: '', nama: 'Bakso', kal: 300, p: 15 }]), D('2026-11-26', [])]));
  assert.deepEqual(s.minggu, [{ minggu: '2026-11-23', hari: 2, kal: 650, p: 18 }]);
  assert.deepEqual(s.top.map(x => x.nama), ['Nasi', 'Bakso']);
  assert.equal(s.logged, 2);
});
