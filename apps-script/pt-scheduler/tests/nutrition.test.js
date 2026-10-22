'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const env = seededEnv();
function fn(name, ...args) { const r = env.callRaw(name, ...args); return r === undefined ? r : JSON.parse(JSON.stringify(r)); }

test('BMI uses Asia-Pacific cut-offs', () => {
  assert.deepEqual(fn('_nutBmi_', 70, 170), { value: 24.2, kategori: 'lebih' });
  assert.equal(fn('_nutBmi_', 50, 170).kategori, 'kurus');
  assert.equal(fn('_nutBmi_', 65, 170).kategori, 'normal');
  assert.equal(fn('_nutBmi_', 80, 170).kategori, 'obesitas1');
  assert.equal(fn('_nutBmi_', 100, 170).kategori, 'obesitas2');
  assert.equal(fn('_nutBmi_', 0, 170), null);
});

test('WHtR bands', () => {
  assert.equal(fn('_nutWhtr_', 80, 170).kategori, 'baik');
  assert.equal(fn('_nutWhtr_', 90, 170).kategori, 'waspada');
  assert.equal(fn('_nutWhtr_', 105, 170).kategori, 'tinggi');
  assert.equal(fn('_nutWhtr_', '', 170), null);
});

test('BMR: Mifflin-St Jeor and Katch-McArdle', () => {
  assert.equal(fn('_nutBmr_', 'L', 70, 170, 30), 1618);   // 700 + 1062.5 - 150 + 5 = 1617.5
  assert.equal(fn('_nutBmr_', 'P', 60, 160, 28), 1299);   // 600 + 1000 - 140 - 161
  assert.equal(fn('_nutBmr_', 'L', 80, 180, 30, 20), 1752); // 370 + 21.6 * 64
  assert.equal(fn('_nutBmr_', 'X', 70, 170, 30), null);
});

test('activity factor from sessions per week', () => {
  assert.equal(fn('_nutActivity_', 0), 1.2);
  assert.equal(fn('_nutActivity_', 3), 1.375);
  assert.equal(fn('_nutActivity_', 4), 1.55);
  assert.equal(fn('_nutActivity_', 6), 1.725);
});

test('target lists missing data and never guesses', () => {
  const r = fn('_nutTarget_', { kg: 70 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['jenisKelamin', 'tinggi', 'tanggalLahir', 'goal']);
});

test('target by goal', () => {
  const base = { sex: 'L', kg: 70, cm: 170, age: 30, sessionsPerWeek: 3 };
  const jaga = fn('_nutTarget_', Object.assign({ goal: 'jaga' }, base));
  assert.equal(jaga.tdee, Math.round(1618 * 1.375));
  assert.equal(jaga.kal, jaga.tdee);
  const turun = fn('_nutTarget_', Object.assign({ goal: 'turun' }, base));
  assert.equal(turun.kal, Math.round(jaga.tdee * 0.82));
  assert.equal(turun.protein, 140);
  const naik = fn('_nutTarget_', Object.assign({ goal: 'naik' }, base));
  assert.ok(naik.kal > jaga.kal);
  // macros add back up to the calories (within rounding)
  const sum = turun.protein * 4 + turun.karbo * 4 + turun.lemak * 9;
  assert.ok(Math.abs(sum - turun.kal) <= 12, String(sum) + ' vs ' + turun.kal);
  assert.equal(turun.natrium, 2000);
  assert.ok(turun.serat >= 25);
});

test('floor, risk cap and heavy-weight protein', () => {
  const small = fn('_nutTarget_', { sex: 'P', kg: 45, cm: 155, age: 25, goal: 'turun', sessionsPerWeek: 0 });
  assert.ok(small.kal >= 1200 && small.kal >= small.bmr);
  assert.ok(small.warnings.includes('batasBawah') || small.kal >= 1200);
  const risky = fn('_nutTarget_', { sex: 'L', kg: 80, cm: 175, age: 30, goal: 'turun', sessionsPerWeek: 3, risks: ['penyakit'] });
  assert.ok(risky.kal >= Math.round(risky.tdee * 0.9) - 1);
  assert.ok(risky.warnings.includes('penyakit'));
  const heavy = fn('_nutTarget_', { sex: 'L', kg: 120, cm: 170, age: 30, goal: 'jaga', sessionsPerWeek: 3 });
  assert.equal(heavy.protein, Math.round(1.6 * 25 * 1.7 * 1.7));   // target weight at BMI 25
  assert.ok(fn('_nutTarget_', { sex: 'L', kg: 70, cm: 170, age: 16, goal: 'jaga' }).warnings.includes('usiaMuda'));
});

test('age from birth date', () => {
  assert.equal(fn('_nutAge_', '1990-06-15', '2026-06-14'), 35);
  assert.equal(fn('_nutAge_', '1990-06-15', '2026-06-15'), 36);
  assert.equal(fn('_nutAge_', '', '2026-06-15'), null);
});
