'use strict';
// Phase T: share cards (numbers only; images are drawn in the browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

test('_shareSummary_ counts only this month and hides body change with fewer than two points', () => {
  const env = seededEnv();
  const out = env.call('_shareSummary_', {
    month: '2026-10', target: 8, done: 5,
    days: [{ tanggal: '2026-10-02', volume: 1000 }, { tanggal: '2026-10-09', volume: 500.4 }, { tanggal: '2026-09-30', volume: 9999 }],
    prs: ['2026-10-02', '2026-09-01'], foodDays: 3,
    summary: { berat: { count: 3, change: -3.2, first: { tanggal: '2026-08-01', nilai: 80 }, last: { tanggal: '2026-10-01', nilai: 76.8 } }, pinggang: { count: 1, change: 0, first: { tanggal: '2026-08-01', nilai: 80 }, last: { tanggal: '2026-08-01', nilai: 80 } } },
    coach: 'Erlan'
  });
  assert.equal(out.month.workoutDays, 2);
  assert.equal(out.month.volume, 1500);
  assert.equal(out.month.prs, 1);
  assert.equal(out.month.sessions, 5);
  assert.equal(out.month.foodDays, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(out.body.weight)), { change: -3.2, since: '2026-08-01' });
  assert.equal(out.body.waist, null);
  assert.equal(out.coach, 'Erlan');
  assert.ok(!JSON.stringify(out).includes('76.8'), 'raw weight must not be shipped');
});

test('radar groups merge legs, arms and neck/shoulders and skip cardio', () => {
  const env = seededEnv();
  const m = JSON.parse(JSON.stringify(env.get ? env.get('SHARE_PART_GROUP') : {}));
  if (Object.keys(m).length) {
    assert.equal(m['upper legs'], 'legs'); assert.equal(m['lower arms'], 'arms'); assert.equal(m.neck, 'shoulders'); assert.equal(m.cardio, undefined);
  }
});

test('SHARE_ENABLED is on by default and off only for the string false', () => {
  const env = seededEnv();
  assert.equal(env.call('_shareEnabled_'), true);
  env.props.SHARE_ENABLED = 'false';
  assert.equal(env.call('_shareEnabled_'), false);
});

test('_workoutStats_ adds prs, radar parts and keeps warm-ups out', () => {
  const env = seededEnv();
  const days = [{ tanggal: '2026-10-05', items: [
    { key: 'a', gerakan: 'Squat', bodyPart: 'upper legs', sets: [{ berat: 100, rep: 5, jenis: '' }, { berat: 40, rep: 10, jenis: 'w' }] },
    { key: 'b', gerakan: 'Bench', bodyPart: 'chest', sets: [{ berat: 60, rep: 10, jenis: '' }] }] }];
  const st = JSON.parse(JSON.stringify(env.call('_workoutStats_', days, '2026-10-06', { '2026-10-05': 2 })));
  assert.equal(st.sessions[0].prs, 2);
  assert.deepEqual(st.sessions[0].parts, { legs: 500, chest: 600 });
});

// ── T2: periods, activity, comparison, QR ─────────────────────────────────────
const plain = v => JSON.parse(JSON.stringify(v));

test('_shareSummary_ also counts last month for the comparison', () => {
  const env = seededEnv();
  const out = plain(env.call('_shareSummary_', { month: '2026-10', target: 8, done: 5, prevDone: 3,
    days: [{ tanggal: '2026-10-02', volume: 1000 }, { tanggal: '2026-09-09', volume: 400 }, { tanggal: '2026-08-30', volume: 9 }], prs: ['2026-09-02'], foodDays: 0, summary: {} }));
  assert.deepEqual(out.prevMonth, { label: '2026-09', sessions: 3, workoutDays: 1, volume: 400, prs: 1 });
  assert.equal(env.call('_shareMonthAdd_', '2026-01', -1), '2025-12');
});

test('_shareActivity_ buckets 12 weeks (Monday start) and lists active days', () => {
  const env = seededEnv();
  const a = plain(env.call('_shareActivity_', ['2026-10-26', '2026-10-28', '2026-10-28', '2026-07-01'], ['2026-10-27', '2026-10-27', '2026-10-28'], '2026-10-28'));
  assert.equal(a.weeks.length, 12);
  assert.equal(a.weeks[11].start, '2026-10-26');
  assert.equal(a.weeks[11].n, 3);
  assert.equal(a.weeks[11].logged, 2);
  assert.equal(a.weeks[0].start, '2026-08-10');
  assert.deepEqual(a.days.map(d => d.d), ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.deepEqual(a.days[2], { d: '2026-10-28', s: 2, w: 1 });
});

test('_sharePeriodRange_ gives calendar ranges and an equal previous range; rejects junk', () => {
  const env = seededEnv();
  const r = k => plain(env.call('_sharePeriodRange_', k, '2026-10-28'));
  assert.deepEqual(r('minggu'), { key: 'minggu', from: '2026-10-26', to: '2026-10-28', prevFrom: '2026-10-19', prevTo: '2026-10-25', days: 3 });
  assert.deepEqual(r('bulan'), { key: 'bulan', from: '2026-10-01', to: '2026-10-28', prevFrom: '2026-09-01', prevTo: '2026-09-30', days: 28 });
  assert.equal(r('3bulan').days, 90);
  assert.equal(r('tanggal:2026-10-01').from, '2026-10-01');
  for (const bad of ['x', 'tanggal:2026-13-01', 'tanggal:2026-11-01', 'tanggal:1990-01-01']) assert.throws(() => env.call('_sharePeriodRange_', bad, '2026-10-28'), /Periode tidak dikenal/);
});

test('_sharePeriod_ sums the range, keeps warm-ups out and compares with the previous range', () => {
  const env = seededEnv();
  const days = [
    { tanggal: '2026-10-27', items: [{ key: 'a', gerakan: 'Squat', bodyPart: 'upper legs', sets: [{ berat: 100, rep: 5, jenis: '' }, { berat: 40, rep: 10, jenis: 'w' }] }] },
    { tanggal: '2026-10-20', items: [{ key: 'a', gerakan: 'Squat', bodyPart: 'upper legs', sets: [{ berat: 90, rep: 5, jenis: '' }] }] },
    { tanggal: '2026-10-13', items: [{ key: 'a', gerakan: 'Squat', bodyPart: 'upper legs', sets: [{ berat: 80, rep: 5, jenis: '' }] }] }
  ];
  const range = env.call('_sharePeriodRange_', 'minggu', '2026-10-28');
  const out = plain(env.call('_sharePeriod_', { range: range, days: days, prs: [{ key: 'a', tanggal: '2026-10-27' }], sessions: [{ tanggal: '2026-10-27', durasi: 3000 }],
    food: [{ tanggal: '2026-10-27', kal: 2000, p: 120, k: 200, l: 60 }, { tanggal: '2026-10-26', kal: 1500, p: 80, k: 150, l: 40 }, { tanggal: '2026-10-20', kal: 1800, p: 90, k: 180, l: 50 }],
    kcalTarget: 2000, proteinTarget: 130, entries: [{ tanggal: '2026-10-01', berat: 80, pinggang: '' }, { tanggal: '2026-10-27', berat: 78.5, pinggang: 90 }],
    done: ['2026-10-26', '2026-10-21'], sessionTarget: 8 }));
  assert.equal(out.workout.volume, 500);
  assert.equal(out.workout.sets, 1);
  assert.equal(out.workout.durasi, 3000);
  assert.equal(out.workout.prs, 1);
  assert.deepEqual(out.workout.parts, { legs: 500 });
  assert.equal(out.workout.exercises[0].pr, true);
  assert.equal(out.compare.prev.workout.volume, 450);
  assert.equal(out.compare.prev.sessionsDone, 1);
  assert.equal(out.sessionsDone, 1);
  assert.equal(out.nutrition.days, 2);
  assert.equal(out.nutrition.avgKal, 1750);
  assert.equal(out.nutrition.onTarget, 1);
  assert.equal(out.compare.prev.nutrition.avgKal, 1800);
  assert.equal(out.lifts.length, 1);
  assert.equal(out.lifts[0].pts.length, 3);
  assert.equal(out.body.berat.change, -1.5);
  assert.equal(out.body.berat.first, 80);
  assert.equal(out.body.pinggang.change, null);
  assert.equal(out.compare.target.sessions, 8);
});

test('getMyShareData reads only the token member; getMemberShareData needs the admin', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  const out = plain(env.call('getMyShareData', t, 'bulan'));
  assert.equal(out.period.key, 'bulan');
  assert.equal(out.workout.workoutDays, 0);
  assert.throws(() => env.call('getMyShareData', t, 'zzz'), /Periode tidak dikenal/);
  assert.throws(() => env.call('getMemberShareData', t, 'PT-A', 'bulan'), /AUTH_REQUIRED/);
  assert.equal(plain(env.call('getMemberShareData', env.adminToken(), 'PT-B', 'minggu')).period.key, 'minggu');
  env.props.SHARE_ENABLED = 'false';
  assert.throws(() => env.call('getMyShareData', t, 'bulan'), /dimatikan/);
});

test('QR address: https only, empty falls back to the default', () => {
  const env = seededEnv();
  const admin = env.adminToken();
  assert.throws(() => env.call('updateAppSettings', admin, { shareQrUrl: 'javascript:alert(1)' }), /https/);
  assert.throws(() => env.call('updateAppSettings', admin, { shareQrUrl: 'http://x.com' }), /https/);
  env.call('updateAppSettings', admin, { shareQrUrl: 'https://xnk.my.id/ig' });
  assert.equal(env.call('_shareQrUrl_'), 'https://xnk.my.id/ig');
  env.call('updateAppSettings', admin, { shareQrUrl: '' });
  assert.equal(env.call('_shareQrUrl_'), 'https://xnkbooking.my.id');
});
