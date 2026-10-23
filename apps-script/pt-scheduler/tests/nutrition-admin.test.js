'use strict';
// Phase P / T-1003: admin read and save of a client's nutrition profile.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const today = env => env.call('_todayWib_');

test('missing data is listed, never guessed', () => {
  const env = seededEnv();
  const r = env.call('getClientNutrition', env.adminToken(), 'PT-A');
  assert.equal(r.target.ok, false);
  assert.ok(r.target.missingLabels.includes('Tinggi badan'));
  assert.ok(r.target.missingLabels.includes('Goal gizi'));
  assert.equal(r.bmi, null);
});

test('save then read: derived numbers use the latest Progress entry', () => {
  const env = seededEnv();
  const admin = env.adminToken(), ani = env.memberToken(KEY_A);
  env.call('saveMyMeasurement', ani, { berat: 70, pinggang: 80 });
  env.call('saveClientNotes', admin, 'PT-A', { flag: '', notes: '', birthDate: '1996-03-10' });
  assert.deepEqual(env.call('saveClientNutrition', admin, 'PT-A', { tinggi: '170', jk: 'p', goal: 'turun', pantangan: ['telur'], kondisi: [], anggaran: 'hemat' }), { status: 'success' });
  const r = env.call('getClientNutrition', admin, 'PT-A');
  assert.equal(r.profile.tinggi, 170);
  assert.equal(r.profile.jk, 'P');
  assert.deepEqual(Array.from(r.profile.pantangan), ['telur']);
  assert.equal(r.profile.anggaran, 'hemat');
  assert.equal(r.inputs.kg, 70);
  assert.equal(r.bmi.value, 24.2);
  assert.equal(r.whtr.kategori, 'baik');
  assert.equal(r.target.ok, true);
  assert.equal(r.target.goal, 'turun');
  assert.ok(r.target.kal >= 1200);
  assert.equal(r.inputs.stale, false);
  // new columns are appended after "Panduan", old columns untouched
  const head = env.sheet('MemberData').rows[0];
  assert.equal(head[23], 'Tinggi (cm)');
  assert.equal(head[28], 'Gizi Aktif');
  assert.equal(env.memberRow('PT-A')[13], KEY_A);
});

test('validation errors are Indonesian sentences and nothing is written', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 20 }), /Tinggi badan harus antara/);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { jk: 'X' }), /Jenis kelamin/);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { goal: 'bulking' }), /Goal gizi tidak dikenal\./);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { pantangan: ['durian'] }), /Pantangan tidak dikenal/);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-ZZ', { tinggi: 170 }), /Klien tidak ditemukan/);
  assert.equal(env.memberRow('PT-A').length, 14);
});

test('only an admin token works', () => {
  const env = seededEnv();
  assert.throws(() => env.call('getClientNutrition', 'bad', 'PT-A'));
  assert.throws(() => env.call('saveClientNutrition', env.memberToken(KEY_A), 'PT-A', { tinggi: 170 }));
});

test('sessions per week counts completed sessions in the last 28 days', () => {
  const env = seededEnv();
  const t = today(env);
  const day = n => new Date(Date.now() - n * 86400000).toISOString();
  const rows = [
    { memberId: 'PT-A', status: 'completed', start: day(3) },
    { memberId: 'PT-A', status: 'completed', start: day(10) },
    { memberId: 'PT-A', status: 'completed', start: day(20) },
    { memberId: 'PT-A', status: 'completed', start: day(40) },
    { memberId: 'PT-A', status: 'scheduled', start: day(2) },
    { memberId: 'PT-B', status: 'completed', start: day(2) },
  ];
  assert.equal(env.call('_nutSessionsPerWeek_', rows, 'PT-A', t), 0.8);
});

test('risk flags from screening answers and coach tags', () => {
  const env = seededEnv();
  assert.deepEqual(Array.from(env.call('_nutRisks_', ['Ya', 'Tidak', 'Tidak', 'Tidak', 'Tidak', 'Tidak', 'Tidak'], '', [])), ['penyakit']);
  assert.deepEqual(Array.from(env.call('_nutRisks_', [], 'asma', ['hamil'])), ['penyakit', 'hamil']);
  assert.deepEqual(Array.from(env.call('_nutRisks_', ['Tidak'], '', [])), []);
});

test('nutrition data stays out of the bootstrap and public answers', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga' });
  const boot = JSON.stringify(env.call('getAdminBootstrap', admin));
  assert.ok(!/Goal Gizi|goalGizi|nutrition|"tinggi"/i.test(boot));
  const bundle = env.call('getClientBundle', admin, 'PT-A');
  assert.equal(bundle.nutrition.profile.tinggi, 170);
});

test('the coach can enter an age instead of a birth date; it feeds the target', () => {
  const env = seededEnv();
  const admin = env.adminToken(), ani = env.memberToken(KEY_A);
  env.call('saveMyMeasurement', ani, { berat: 70, pinggang: 80 });
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', umur: '30' });
  const r = JSON.parse(JSON.stringify(env.call('getClientNutrition', admin, 'PT-A')));
  assert.equal(r.profile.umur, 30);
  assert.equal(r.age, 30);
  assert.equal(r.target.ok, true);
  assert.equal(r.target.bmr, Math.round(10 * 70 + 6.25 * 170 - 5 * 30 - 161));
  // the sheet keeps the age and the day it was written; the birth date column stays empty (no false birthday greetings)
  const row = env.memberRow('PT-A');
  assert.equal(Number(row[30]), 30);
  assert.equal(row[31], env.call('_todayWib_'));
  assert.equal(String(row[20] || ''), '');
  // saving again with the same age keeps the original date; a new age updates both
  row[31] = '2025-01-01';
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', umur: 30 });
  assert.equal(env.memberRow('PT-A')[31], '2025-01-01');
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', umur: 31 });
  assert.equal(env.memberRow('PT-A')[31], env.call('_todayWib_'));
  // empty clears both
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'jaga', umur: '' });
  assert.equal(String(env.memberRow('PT-A')[30]), '');
  assert.equal(JSON.parse(JSON.stringify(env.call('getClientNutrition', admin, 'PT-A'))).target.ok, false);
});

test('age validation, and the birth date wins over a typed age; a stored age grows by full years', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { umur: 5 }), /Umur harus bilangan bulat antara 10 dan 100/);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { umur: 150 }), /Umur harus/);
  assert.throws(() => env.call('saveClientNutrition', admin, 'PT-A', { umur: 30.5 }), /Umur harus/);
  const age = (p, t) => env.callRaw('_nutAgeOf_', p, t);
  assert.equal(age({ birthDate: '1990-06-15', umur: 99, umurTgl: '2026-01-01' }, '2026-10-22'), 36);
  assert.equal(age({ birthDate: '', umur: 30, umurTgl: '2024-10-22' }, '2026-10-22'), 32);
  assert.equal(age({ birthDate: '', umur: 30, umurTgl: '2024-10-23' }, '2026-10-22'), 31);
  assert.equal(age({ birthDate: '', umur: '', umurTgl: '' }, '2026-10-22'), null);
});
