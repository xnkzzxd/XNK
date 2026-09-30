'use strict';
// Phase D2: weekly streak and milestone badges.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B, SCHEDULE_HEADERS } = require('./fixtures');

// ── pure helpers ─────────────────────────────────────────────────────────────

test('weeks start on Monday, including across a year boundary', () => {
  const env = seededEnv();
  const ws = d => env.call('_weekStart_', d);
  assert.equal(ws('2026-09-30'), '2026-09-28');   // Wednesday
  assert.equal(ws('2026-09-28'), '2026-09-28');   // Monday
  assert.equal(ws('2026-10-04'), '2026-09-28');   // Sunday belongs to the week that started Monday
  assert.equal(ws('2026-01-01'), '2025-12-29');
});

test('streak counts consecutive weeks and the running week never breaks it early', () => {
  const env = seededEnv();
  const streak = (weeks, today) => env.call('_streak_', Object.fromEntries(weeks.map(w => [w, true])), today);
  assert.equal(streak(['2026-09-28', '2026-09-21', '2026-09-14'], '2026-09-30'), 3);   // this week counts once it has a session
  assert.equal(streak(['2026-09-21', '2026-09-14'], '2026-09-28'), 2);                 // Monday morning: not broken yet
  assert.equal(streak(['2026-09-21', '2026-09-14'], '2026-10-04'), 2);                 // Sunday night, still not ended
  assert.equal(streak(['2026-09-28', '2026-09-14'], '2026-09-30'), 1);                 // a missed week breaks the chain
  assert.equal(streak(['2026-09-14'], '2026-09-30'), 0);                               // last week and this week both empty
  assert.equal(streak([], '2026-09-30'), 0);
  assert.equal(streak(['2026-09-28'], '2026-09-30'), 1);
});

test('best streak is the longest run in the whole history', () => {
  const env = seededEnv();
  const best = weeks => env.call('_bestStreak_', Object.fromEntries(weeks.map(w => [w, true])));
  assert.equal(best(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-07-06', '2026-07-13']), 4);
  assert.equal(best(['2026-06-01']), 1);
  assert.equal(best([]), 0);
  assert.equal(best(['2025-12-22', '2025-12-29', '2026-01-05']), 3);   // across the new year
});

test('badges come from lifetime sessions and the best streak, so they never disappear', () => {
  const env = seededEnv();
  const earned = (c, b) => env.call('_badges_', c, b).filter(x => x.earned).map(x => x.id);
  assert.deepEqual(earned(0, 0), []);
  assert.deepEqual(earned(9, 3), []);
  assert.deepEqual(earned(10, 0), ['sesi-10']);
  assert.deepEqual(earned(25, 4), ['sesi-10', 'sesi-25', 'streak-4']);
  assert.deepEqual(earned(100, 12), ['sesi-10', 'sesi-25', 'sesi-50', 'sesi-100', 'streak-4', 'streak-8', 'streak-12']);
  assert.equal(env.call('_badges_', 0, 0).length, 7);
  assert.deepEqual(env.call('_badges_', 0, 0).map(b => b.need), [10, 25, 50, 100, 4, 8, 12]);
  assert.equal(env.call('_badges_', 10, 0)[0].label, '10 sesi');
});

test('only completed sessions count, and a late-Sunday UTC session is Monday in Jakarta', () => {
  const env = seededEnv();
  const sc = (id, member, iso, status) => ({ id, memberId: member, start: iso, status });
  const res = env.call('_completedWeeks_', [
    sc('1', 'PT-A', '2026-09-27T20:00:00Z', 'completed'),   // Mon 28 Sep 03:00 WIB
    sc('2', 'PT-A', '2026-09-30T05:00:00Z', 'completed'),   // same week
    sc('3', 'PT-A', '2026-09-22T05:00:00Z', 'read'),        // not completed
    sc('4', 'PT-A', '2026-09-10T05:00:00Z', 'Completed'),   // status case is ignored; week of 7 Sep
    sc('5', 'PT-B', '2026-09-15T05:00:00Z', 'completed'),   // someone else
    sc('6', 'PT-A', 'not a date', 'completed'),
  ], 'PT-A');
  assert.deepEqual(Object.keys(res.weeks).sort(), ['2026-09-07', '2026-09-28']);
  assert.equal(res.completed, 3);
});

// ── server ───────────────────────────────────────────────────────────────────

function withCompleted(env, perWeek) {
  // perWeek: sessions per week for the current week going back; all "completed", noon WIB
  const today = env.call('_todayWib_');
  const monday = env.call('_weekStart_', today);
  const rows = [SCHEDULE_HEADERS];
  let n = 0;
  perWeek.forEach((count, i) => {
    const wk = env.call('_addDaysIso_', monday, -7 * i);
    for (let k = 0; k < count; k++) {
      const day = env.call('_addDaysIso_', wk, k % 5);
      rows.push(['SC-' + (n++), 'PT-A', 'Ani Anggraini', '6281111111111', day + 'T05:00:00Z', day + 'T06:00:00Z', '', 'completed', '', '', '', '']);
    }
  });
  env.ss.seed('Schedules', rows);
}

test('getMyProgress reports streak, best streak, completed count, badges and the ones not yet celebrated', () => {
  const env = seededEnv();
  withCompleted(env, [3, 3, 2, 2]);       // 10 sessions over 4 straight weeks, this week included
  const res = env.call('getMyProgress', env.memberToken(KEY_A));
  assert.equal(res.completed, 10);
  assert.equal(res.streak, 4);
  assert.equal(res.bestStreak, 4);
  assert.deepEqual(res.badges.filter(b => b.earned).map(b => b.id), ['sesi-10', 'streak-4']);
  assert.deepEqual(res.newBadges, ['sesi-10', 'streak-4']);
});

test('a client with no completed sessions has an empty streak and no badges', () => {
  const env = seededEnv();
  withCompleted(env, []);
  const res = env.call('getMyProgress', env.memberToken(KEY_B));
  assert.deepEqual([res.completed, res.streak, res.bestStreak], [0, 0, 0]);
  assert.deepEqual(res.newBadges, []);
});

test('markBadgesSeen stops a badge from being celebrated again, ignores unearned ones, and is per client', () => {
  const env = seededEnv();
  withCompleted(env, [3, 3, 2, 2]);
  const ani = env.memberToken(KEY_A);
  const after = env.call('markBadgesSeen', ani, ['sesi-10', 'sesi-100', 'nonsense']);
  assert.deepEqual(after.newBadges, ['streak-4']);
  assert.equal(env.sheet('MemberData').rows[0][16], 'Badge Terlihat');
  assert.equal(env.memberRow('PT-A')[16], 'sesi-10');
  assert.equal(env.memberRow('PT-B')[16], undefined);                       // other clients untouched
  env.call('markBadgesSeen', ani, ['sesi-10', 'streak-4']);                 // idempotent, no duplicates
  assert.equal(env.memberRow('PT-A')[16], 'sesi-10,streak-4');
  assert.deepEqual(env.call('getMyProgress', ani).newBadges, []);
  assert.deepEqual(env.call('markBadgesSeen', ani, 'not an array').newBadges, []);
});

test('markBadgesSeen refuses to write into a column Q that is used for something else', () => {
  const env = seededEnv();
  withCompleted(env, [3, 3, 2, 2]);
  env.sheet('MemberData').rows[0][16] = 'Catatan Saya';
  assert.throws(() => env.call('markBadgesSeen', env.memberToken(KEY_A), ['sesi-10']), /Kolom Q/);
});

test('every progress response for a client carries newBadges; the coach view carries streak info but no celebration list', () => {
  const env = seededEnv();
  withCompleted(env, [3, 3, 2, 2]);
  const ani = env.memberToken(KEY_A);
  assert.ok(Array.isArray(env.call('saveMyMeasurement', ani, { berat: 70 }).newBadges));
  assert.ok(Array.isArray(env.call('deleteMyMeasurement', ani, env.call('getMyProgress', ani).entries[0].id).newBadges));
  const coach = env.call('getMemberProgress', env.adminToken(), 'PT-A');
  assert.equal(coach.streak, 4);
  assert.equal(coach.badges.length, 7);
  assert.equal(coach.newBadges, undefined);
});
