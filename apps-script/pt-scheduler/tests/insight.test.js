'use strict';
// Fase Q: mesin tafsir data klien (Wawasan.gs).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const TODAY = '2026-10-23'; // Jumat
const E = (tanggal, berat, extra) => Object.assign({ tanggal, berat, pinggang: '' }, extra || {});

test('body: weight change per range, rate per week, soft zone labels', () => {
  const env = seededEnv();
  const entries = [E('2026-08-01', 85), E('2026-09-25', 82, { pinggang: 90 }), E('2026-10-22', 80, { pinggang: 87 })];
  const b = env.call('_insightBody_', entries, { tinggi: 170, goal: 'turun' }, 12, TODAY, 'client');
  assert.equal(b.sedikit, false);
  assert.equal(b.ranges.w4.measures.berat.delta, -2);          // 25 Sep → 22 Okt
  assert.equal(b.ranges.all.measures.berat.delta, -5);
  assert.equal(b.ranges.w4.measures.berat.perWeek, -0.52);
  assert.match(b.ranges.w4.text, /turun 2 kg/);
  assert.match(b.ranges.w4.text, /Sesuai targetmu/);
  assert.equal(b.bmi.value, 27.7);
  assert.equal(b.bmi.label, 'di atas rentang sehat');
  assert.equal(b.bmi.kategori, undefined, 'client never gets the raw category');
  const coach = env.call('_insightBody_', entries, { tinggi: 170, goal: 'turun' }, 12, TODAY, 'coach');
  assert.equal(coach.bmi.kategori, 'obesitas1');
  assert.match(coach.ranges.w4.text, /−2 kg/);
});

test('body: fewer than two weights asks for more data', () => {
  const env = seededEnv();
  const b = env.call('_insightBody_', [E('2026-10-20', 80)], {}, null, TODAY, 'client');
  assert.equal(b.sedikit, true);
  assert.match(b.ranges.w4.text, /Catat berat lagi/);
});

test('fitness: percent respects better direction; symmetry flags a 2 cm gap', () => {
  const env = seededEnv();
  const f = env.call('_insightFitness_', [
    { id: 'pushup', label: 'Push-up', unit: 'rep', better: 'higher', first: 20, latest: 26 },
    { id: 'lari', label: 'Lari', unit: 'dtk', better: 'lower', first: 600, latest: 540 }
  ], [{ tanggal: '2026-10-01', lenganKanan: 35, lenganKiri: 33, pahaKanan: 55, pahaKiri: 55 }]);
  assert.equal(f.tests[0].pct, 30);
  assert.equal(f.tests[1].pct, 10);
  assert.equal(f.tests[1].improved, true);
  assert.equal(f.symmetry[0].flag, true);
  assert.equal(f.symmetry[1].flag, false);
});

test('links: needs six weeks of weight change and two weeks per group', () => {
  const env = seededEnv();
  const w = (a, d) => ({ start: 'x', activity: a, dBerat: d, kcalAvg: null, kcalTarget: null });
  assert.equal(env.call('_insightLinks_', [w(3, -1), w(3, -1)]).enough, false);
  const rows = [w(3, -0.6), w(2, -0.5), w(3, -0.7), w(0, 0.1), w(1, 0.0), w(0, 0.2)];
  const l = env.call('_insightLinks_', rows);
  assert.equal(l.enough, true);
  assert.equal(l.items[0].id, 'rutin');
  assert.ok(l.items[0].rutin < l.items[0].jarang);
});

function day(tanggal, sets, extra) {
  return { tanggal, items: [Object.assign({ key: 'squat', gerakan: 'Squat', bodyPart: 'upper legs', hari: 'Hari A', sets }, extra || {})] };
}
const S = (berat, rep, rpe) => ({ berat, rep, jenis: '', rpe: rpe || '' });

test('training: this week vs 4-week average, strength relative to body weight, stall flag', () => {
  const env = seededEnv();
  const days = [
    day('2026-10-21', [S(100, 5, 8), S(100, 5, 9)]),            // minggu ini (Senin 19 Okt)
    day('2026-10-14', [S(80, 5), S(80, 5)]),
    day('2026-10-07', [S(80, 5), S(80, 5)]),
    day('2026-09-30', [S(80, 5), S(80, 5)]),
    day('2026-09-23', [S(80, 5), S(80, 5)])
  ];
  const t = env.call('_insightTraining_', days, [{ rasa: 4 }], 80, TODAY, 'coach');
  assert.equal(t.week.volume.now, 1000);
  assert.equal(t.week.volume.avg, 800);
  assert.equal(t.week.volume.pct, 25);
  assert.equal(t.week.rpe, 8.5);
  assert.equal(t.week.rasa, 4);
  const sq = t.strength[0];
  assert.equal(sq.gerakan, 'Squat');
  assert.equal(sq.pct, 25);
  assert.equal(sq.perBw, 1.46);
  assert.equal(sq.stalled, false);
  const client = env.call('_insightTraining_', days, [{ rasa: 4 }], 80, TODAY, 'client');
  assert.equal(client.week.rpe, undefined, 'RPE is coach-only');
  assert.equal(client.week.rasa, undefined);
});

test('training: a lift repeated three times in three weeks without a new best is stalled', () => {
  const env = seededEnv();
  const days = [day('2026-10-21', [S(80, 5)]), day('2026-10-14', [S(80, 5)]), day('2026-10-07', [S(80, 5)]), day('2026-08-01', [S(90, 5)])];
  const t = env.call('_insightTraining_', days, [], 0, TODAY, 'client');
  assert.equal(t.strength[0].stalled, true);
  assert.equal(t.strength[0].perBw, null, 'no body weight, no ratio');
  assert.match(t.text, /mulai mandek/);
});

test('training: balance groups, push:pull ratio and a missed group', () => {
  const env = seededEnv();
  const days = [
    { tanggal: '2026-10-21', items: [
      { key: 'bench', gerakan: 'Bench', bodyPart: 'chest', hari: '', sets: [S(60, 10)] },
      { key: 'row', gerakan: 'Row', bodyPart: 'back', hari: '', sets: [S(30, 10)] }] }
  ];
  const t = env.call('_insightTraining_', days, [], 70, TODAY, 'client');
  assert.equal(t.balance.pushPull, 2);
  assert.ok(t.balance.missed.includes('kaki'));
});

test('activity: 84 levels starting on a Monday, program adherence per week', () => {
  const env = seededEnv();
  const a = env.call('_insightActivity_', {
    sessionDates: ['2026-10-21', '2026-10-21'], workoutDates: ['2026-10-21', '2026-10-20'], foodDates: [],
    workoutDays: [{ tanggal: '2026-10-21', items: [{ hari: 'Hari A' }] }], programNames: ['Hari A', 'Hari B']
  }, TODAY);
  assert.equal(a.levels.length, 84);
  assert.equal(a.start, '2026-08-03');
  assert.equal(a.levels[a.levels.length - 5], 3, '21 Okt: two sessions + one workout');
  assert.equal(a.levels[a.levels.length - 1], 0, 'future days are empty');
  const last = a.adherence[a.adherence.length - 1];
  assert.deepEqual([last.done, last.planned], [1, 2]);
});

test('portal week: counts only the Monday–Sunday week in WIB', () => {
  const env = seededEnv();
  const w = env.call('_portalWeek_', {
    sessions: [{ date: '2026-10-19', done: true }, { date: '2026-10-18', done: true }, { date: '2026-10-24', done: false }],
    workoutDates: ['2026-10-20', '2026-10-17'], foodDates: ['2026-10-21'], streak: 3, challenge: { target: 8, done: 5 }
  }, TODAY);
  assert.equal(w.start, '2026-10-19');
  assert.equal(w.sessionsDone, 1);
  assert.equal(w.sessionsBooked, 1);
  assert.equal(w.workoutDays, 1);
  assert.equal(w.foodDays, 1);
  assert.equal(w.streak, 3);
});

test('getPortalMore carries week + insight for the member, without coach-only fields', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-01', berat: 80 });
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-20', berat: 77 });
  const more = env.call('getPortalMore', env.memberToken(KEY_A));
  assert.ok(!more.week.error && !more.insight.error, JSON.stringify([more.week, more.insight]).slice(0, 300));
  assert.ok(more.insight.body && more.insight.training && more.insight.activity && more.insight.fitness && more.insight.links);
  assert.equal(more.insight.training.week.rpe, undefined);
  assert.ok(!JSON.stringify(more.insight).includes('"kategori"'), 'no raw BMI/WHtR categories for clients');
  assert.equal(more.insight.activity.levels.length, 84);
});

test('getClientBundle carries the coach insight with raw categories', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const b = env.call('getClientBundle', t, 'PT-A');
  assert.ok(b.insight && !b.insight.error, JSON.stringify(b.insight).slice(0, 300));
  assert.ok(b.insight.body && b.insight.training);
});
