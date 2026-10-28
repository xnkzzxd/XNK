'use strict';
// Phase T: share cards (numbers only; images are drawn in the browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

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
