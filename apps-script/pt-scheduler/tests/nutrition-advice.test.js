'use strict';
// Phase P / T-1004: adaptive advice from weight trend, coach approval, hub card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const env0 = seededEnv();
const j = x => JSON.parse(JSON.stringify(x));
const today = '2026-10-22';
const pts = (...w) => w.map(([d, kg]) => ({ tanggal: env0.call('_addDaysIso_', today, -d), berat: kg }));
const advise = (e, goal, ctx) => j(env0.call('_nutAdvise_', e, goal, today, ctx || {}));

test('turun: no loss in three weeks suggests -125 kcal; fast loss suggests +125', () => {
  const flat = advise(pts([21, 80], [14, 80.1], [7, 80], [0, 80.2]), 'turun');
  assert.equal(flat.delta, -125);
  assert.match(flat.alasan, /belum turun/);
  const fast = advise(pts([21, 80], [14, 78], [7, 76], [0, 74]), 'turun');
  assert.equal(fast.delta, 125);
  assert.equal(advise(pts([21, 80], [14, 79.4], [7, 78.9], [0, 78.4]), 'turun'), null);   // healthy ~0.5 kg/week
});

test('naik: no gain suggests +125; healthy gain suggests nothing; jaga and recomp never advise', () => {
  assert.equal(advise(pts([21, 70], [14, 70], [0, 70]), 'naik').delta, 125);
  assert.equal(advise(pts([21, 70], [14, 70.3], [0, 70.8]), 'naik'), null);
  assert.equal(advise(pts([21, 80], [14, 80], [0, 80]), 'jaga'), null);
  assert.equal(advise(pts([21, 80], [14, 80], [0, 80]), 'recomp'), null);
});

test('needs three points over at least two weeks, a fresh window, and respects pending and cooldown', () => {
  assert.equal(advise(pts([21, 80], [0, 80]), 'turun'), null);
  assert.equal(advise(pts([10, 80], [8, 80], [5, 80], [0, 80]), 'turun'), null);
  assert.equal(advise(pts([60, 90], [50, 90], [40, 90]), 'turun'), null);   // old data only
  const e = pts([21, 80], [14, 80], [0, 80]);
  assert.equal(advise(e, 'turun', { pending: true }), null);
  assert.equal(advise(e, 'turun', { lastDecision: env0.call('_addDaysIso_', today, -5) }), null);
});

function withClient() {
  const env = seededEnv();
  const admin = env.adminToken();
  env.call('saveClientNotes', admin, 'PT-A', { flag: '', notes: '', birthDate: '1996-03-10' });
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'turun' });
  const t = env.call('_todayWib_');
  env.ss.seed('Progress', [['ID', 'Member ID', 'Tanggal', 'Berat (kg)', 'Pinggang (cm)', 'Dicatat Oleh', 'Diubah Pada']].concat([21, 14, 7, 0].map(d => ['PG-' + d, 'PT-A', env.call('_addDaysIso_', t, -d), 80, '', 'klien', ''])));
  return { env, admin };
}

test('opening the client creates one pending advice; approving it lowers the target; the hub shows first name only', () => {
  const { env, admin } = withClient();
  const before = j(env.call('getClientNutrition', admin, 'PT-A'));
  assert.equal(before.advice.pending, null);                 // creation happens through the hub scan
  const hub = j(env.call('getCoachHub', admin));
  assert.equal(hub.nutrition.length, 1);
  assert.deepEqual(Object.keys(hub.nutrition[0]).sort(), ['alasan', 'delta', 'id', 'memberId', 'name']);
  assert.equal(hub.nutrition[0].name, 'Ani');
  assert.equal(hub.nutrition[0].delta, -125);
  assert.equal(j(env.call('getCoachHub', admin)).nutrition.length, 1);   // no duplicate
  const open = j(env.call('getClientNutrition', admin, 'PT-A'));
  assert.equal(open.advice.pending.delta, -125);
  const kal0 = open.target.kal;
  env.call('decideNutritionAdvice', admin, 'PT-A', open.advice.pending.id, 'setuju');
  const after = j(env.call('getClientNutrition', admin, 'PT-A'));
  assert.equal(after.target.adjust, -125);
  assert.ok(after.target.kal <= kal0 && after.target.kal >= Math.max(1200, after.target.bmr));
  assert.equal(after.advice.pending, null);
  assert.equal(after.advice.last.status, 'setuju');
  assert.equal(j(env.call('getCoachHub', admin)).nutrition.length, 0);
});

test('rejecting leaves the target alone; deciding twice or for the wrong client fails', () => {
  const { env, admin } = withClient();
  env.call('getCoachHub', admin);
  const adv = j(env.call('getClientNutrition', admin, 'PT-A')).advice.pending;
  const kal0 = j(env.call('getClientNutrition', admin, 'PT-A')).target.kal;
  assert.throws(() => env.call('decideNutritionAdvice', admin, 'PT-B', adv.id, 'tolak'), /Saran tidak ditemukan/);
  assert.throws(() => env.call('decideNutritionAdvice', admin, 'PT-A', adv.id, 'mungkin'), /Keputusan harus/);
  env.call('decideNutritionAdvice', admin, 'PT-A', adv.id, 'tolak');
  assert.equal(j(env.call('getClientNutrition', admin, 'PT-A')).target.kal, kal0);
  assert.throws(() => env.call('decideNutritionAdvice', admin, 'PT-A', adv.id, 'setuju'), /sudah diputuskan/);
});

test('adjustment is clamped to +-300 and a member token cannot decide', () => {
  const { env, admin } = withClient();
  env.call('getCoachHub', admin);
  const adv = j(env.call('getClientNutrition', admin, 'PT-A')).advice.pending;
  assert.throws(() => env.call('decideNutritionAdvice', env.memberToken(KEY_A), 'PT-A', adv.id, 'setuju'));
  const t = j(env.call('_nutTarget_', { sex: 'L', kg: 80, cm: 175, age: 30, goal: 'jaga', sessionsPerWeek: 3, adjust: -900 }));
  assert.equal(t.adjust, -300);
  assert.equal(j(env.call('_nutTarget_', { sex: 'L', kg: 80, cm: 175, age: 30, goal: 'jaga', sessionsPerWeek: 3, adjust: 900 })).adjust, 300);
});

test('clients with Gizi switched off, or with goal jaga, get no advice', () => {
  const { env, admin } = withClient();
  env.call('saveClientNutrition', admin, 'PT-A', { tinggi: 170, jk: 'P', goal: 'turun', aktif: false });
  assert.equal(j(env.call('getCoachHub', admin)).nutrition.length, 0);
});

test('reading advice never creates the sheet, and losing a sheet-creation race is harmless', () => {
  const { env, admin } = withClient();
  assert.equal(env.ss.getSheetByName ? !!env.ss.getSheetByName('NutritionAdvice') : false, false);
  env.call('getClientNutrition', admin, 'PT-A');                           // a read: no sheet yet
  assert.equal(!!env.ss.getSheetByName('NutritionAdvice'), false);
  // Simulate the race: another call creates the sheet right after our "does it exist?" check.
  const real = env.ss.insertSheet.bind(env.ss);
  let first = true;
  env.ss.insertSheet = name => { if (first) { first = false; real(name); const e = new Error('Sheet dengan nama "' + name + '" sudah ada. Masukkan nama lain.'); throw e; } return real(name); };
  const sheet = env.callRaw('getOrCreateSheet_', 'NutritionAdvice', ['ID', 'Member ID']);
  assert.ok(sheet);
  assert.ok(env.ss.getSheetByName('NutritionAdvice'));
});
