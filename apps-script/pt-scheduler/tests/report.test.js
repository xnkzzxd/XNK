'use strict';
// Fase AC4 (T-2340): data laporan PDF (dibuat saat tombol ditekan). docs/coachkit/Design.md §AC4.
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

test('range: default 28 days ending today, previous period of the same length, limits', () => {
  const { env } = setup();
  const r = j(env.call('_reportRange_', {}, '2026-11-26'));
  assert.deepEqual(r, { from: '2026-10-30', to: '2026-11-26', days: 28, prevFrom: '2026-10-02', prevTo: '2026-10-29' });
  assert.throws(() => env.call('_reportRange_', { to: '2026-11-27' }, '2026-11-26'), /masa depan/);
  assert.throws(() => env.call('_reportRange_', { from: '2026-11-20', to: '2026-11-10' }, '2026-11-26'), /sebelum tanggal akhir/);
  assert.throws(() => env.call('_reportRange_', { from: '2024-01-01', to: '2026-11-26' }, '2026-11-26'), /400 hari/);
  assert.throws(() => env.call('_reportRange_', { from: 'x' }, '2026-11-26'), /tidak valid/);
});

test('the report counts sessions, workouts, strength, body change and writes plain sentences', () => {
  const { env, ani, admin } = setup();
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -20), '', [{ gerakan: 'Leg press', sets: [{ berat: 80, rep: 10 }] }]);
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -3), '', [{ gerakan: 'Leg press', sets: [{ berat: 90, rep: 10 }] }]);
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: day(env, -25), berat: 72, pinggang: 82 });
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: day(env, -2), berat: 71, pinggang: 80 });
  const r = j(env.call('getMyReport', ani, {}));
  assert.equal(r.periode.days, 28);
  assert.equal(r.latihan.hari, 2);
  assert.equal(r.latihan.angkatan[0].gerakan, 'Leg press');
  assert.ok(r.latihan.angkatan[0].pct > 0);
  assert.equal(r.tubuh.ukuran.find(x => x.key === 'berat').ubah, -1);
  assert.ok(r.teks.ringkas.some(t => /Kekuatan naik di Leg press/.test(t)));
  assert.ok(r.teks.ringkas.some(t => /Berat turun 1 kg, lingkar pinggang turun 2 cm/.test(t)));
  assert.ok(r.teks.ringkas.some(t => /Aktif berlatih di 2 dari \d minggu/.test(t)), 'self-logged workouts count as active weeks');
  assert.ok(r.teks.lanjut.length >= 1);
  assert.equal(r.name, 'Ani Anggraini');
});

test('privacy: no phone number, no RPE, no private session notes, no hold note; members only see their own', () => {
  const { env, ani, budi, admin } = setup();
  env.call('saveWorkoutLog', admin, 'PT-A', day(env, -5), '', [{ gerakan: 'Row', sets: [{ berat: 30, rep: 10, rpe: 9 }] }]);
  env.call('setClientHold', admin, 'PT-A', { jenis: 'sakit', mulai: day(env, -10), sampai: day(env, -8), note: 'Cedera lutut kiri' });
  const r = JSON.stringify(j(env.call('getMyReport', ani, {})));
  assert.ok(!r.includes('6281111111111') && !r.includes('Rahasia Ani'), 'no phone, no private schedule notes');
  assert.ok(!r.includes('Cedera'), 'no hold note');
  assert.ok(!/"rpe"/.test(r), 'no RPE');
  assert.ok(/sakit/.test(r), 'the hold period itself is mentioned');
  const other = JSON.stringify(j(env.call('getMyReport', budi, {})));
  assert.ok(!other.includes('Ani'), 'another client never sees Ani');
  const coach = j(env.call('getMemberReport', admin, 'PT-A', {}));
  assert.equal(coach.name, 'Ani Anggraini', 'the coach builds the same client-tone report');
  assert.throws(() => env.call('getMemberReport', '', 'PT-A', {}), /admin|sesi|login/i);
  assert.throws(() => env.call('getMyReport', '', {}), /sesi|login|masuk/i);
});

test('an empty period still answers with a friendly sentence', () => {
  const { env, budi } = setup();
  const r = j(env.call('getMyReport', budi, { from: '2025-01-01', to: '2025-01-28' }));
  assert.equal(r.latihan.hari, 0);
  assert.ok(r.teks.ringkas.length >= 1);
});
