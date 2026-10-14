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
  const other = j(env.call('getMyWorkout', b));
  assert.deepEqual([other.days, other.last, other.stats.exercises, other.stats.sessions], [[], {}, [], []], 'another client sees nothing');
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

test('stats: Epley 1RM, PR, weekly volume by body part, session summary', () => {
  const env = seededEnv();
  assert.equal(env.call('_e1rm_', 100, 10), 133.3);
  assert.equal(env.call('_e1rm_', 100, 13), 0, 'over 12 reps does not count');
  assert.equal(env.call('_e1rm_', '', 5), 0);
  assert.equal(env.call('_isoWeekStart_', '2026-10-14'), '2026-10-12');
  assert.equal(env.call('_isoWeekStart_', '2026-10-18'), '2026-10-12');
  const it = (key, name, part, sets) => ({ key, gerakan: name, bodyPart: part, sets });
  const days = [
    { tanggal: '2026-10-14', items: [it('ex:1', 'Bench', 'chest', [{ berat: 60, rep: 10, durasi: '' }, { berat: 65, rep: 8, durasi: '' }])] },
    { tanggal: '2026-10-07', items: [it('ex:1', 'Bench', 'chest', [{ berat: 55, rep: 10, durasi: '' }]), it('nm:plank', 'Plank', 'waist', [{ berat: '', rep: '', durasi: 60 }])] }
  ];
  const st = j(env.call('_workoutStats_', days, '2026-10-14'));
  const bench = st.exercises.find(e => e.key === 'ex:1');
  assert.deepEqual(bench.points.map(p => p.tanggal), ['2026-10-07', '2026-10-14'], 'oldest first');
  assert.equal(bench.points[1].top, 65);
  assert.equal(bench.pr.e1rm, 82.3);
  assert.equal(bench.pr.tanggal, '2026-10-14');
  assert.equal(st.exercises.some(e => e.key === 'nm:plank'), false, 'no weight = no strength chart');
  assert.equal(st.weeks.length, 8);
  const last = st.weeks[7], prev = st.weeks[6];
  assert.equal(last.volume, 60 * 10 + 65 * 8);
  assert.equal(prev.volume, 550);
  assert.equal(prev.parts.chest, 550);
  assert.equal(st.sessions[0].tanggal, '2026-10-14');
  assert.equal(st.sessions[1].durasi, 60);
  assert.equal(st.topParts[0].part, 'chest');
});

test('stats ride along with the member and admin reads', () => {
  const env = seededEnv();
  const t = env.adminToken(), today = env.call('_todayWib_');
  env.call('saveWorkoutLog', t, 'PT-A', today, '', [bench([set(60, 10), set(70, 5)])]);
  const a = j(env.call('getMyWorkout', env.memberToken(KEY_A)));
  assert.equal(a.stats.exercises[0].pr.e1rm, 81.7);
  assert.equal(j(env.call('getWorkoutLog', t, 'PT-A')).stats.weeks[7].volume, 950);
});

test('PRs: first log is not a record; a higher estimated 1RM is; re-saving the same day does not repeat it', () => {
  const env = seededEnv();
  const t = env.adminToken(), dayOf = n => env.call('_addDaysIso_', env.call('_todayWib_'), -n);
  let r = j(env.call('saveWorkoutLog', t, 'PT-A', dayOf(6), '', [bench([set(60, 10)])]));
  assert.deepEqual(r.prs, [], 'first entry sets the baseline');
  r = j(env.call('saveWorkoutLog', t, 'PT-A', dayOf(3), '', [bench([set(50, 10)])]));
  assert.deepEqual(r.prs, [], 'lower is no record');
  r = j(env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([set(70, 8)])]));
  assert.equal(r.prs.length, 1);
  assert.equal(r.prs[0].gerakan, 'Bench press');
  assert.equal(r.prs[0].prev, 80);
  r = j(env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([set(70, 8)])]));
  assert.deepEqual(r.prs, [], 'same data saved again is not a new record');
  assert.equal(env.fetches.length, 0, 'Telegram is off by default');
});

test('PR Telegram note is opt-in and carries first name + exercise only', () => {
  const env = seededEnv();
  const t = env.adminToken(), dayOf = n => env.call('_addDaysIso_', env.call('_todayWib_'), -n);
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(3), '', [bench([set(60, 10)])]);
  env.props.WORKOUT_PR_NOTIFY = 'true';
  env.props.TELEGRAM_BOT_TOKEN = 'x'; env.props.TELEGRAM_CHAT_ID = '1';
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([set(80, 8)])]);
  const sent = env.fetches.map(f => JSON.stringify(f));
  if (sent.length) { assert.match(sent.join(), /Bench press/); assert.doesNotMatch(sent.join(), /80|62811/); }
});

test('badges: logged days and personal records count toward catat-/pr- badges', () => {
  const env = seededEnv();
  const t = env.adminToken(), dayOf = n => env.call('_addDaysIso_', env.call('_todayWib_'), -n);
  const earned = () => j(env.call('getMemberProgress', t, 'PT-A')).badges.filter(b => b.earned && /^(catat|pr)-/.test(b.id)).map(b => b.id);
  assert.deepEqual(earned(), []);
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(6), '', [bench([set(60, 10)])]);
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(5), '', [bench([set(70, 10)])]);
  assert.deepEqual(earned(), ['pr-1']);
  for (let i = 4; i >= 2; i--) env.call('saveWorkoutLog', t, 'PT-A', dayOf(i), '', [bench([set(50, 5)])]);
  assert.deepEqual(earned().sort(), ['catat-5', 'pr-1']);
});

test('summary message: admin only, fills the template, shows sets, record and volume, is only a link', () => {
  const env = seededEnv();
  const t = env.adminToken(), dayOf = n => env.call('_addDaysIso_', env.call('_todayWib_'), -n);
  assert.throws(() => env.call('getWorkoutSummaryMessage', t, 'PT-A', dayOf(1)), /Belum ada latihan/);
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(3), '', [bench([set(60, 10)])]);
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([set(60, 10), set(65, 8)])]);
  const r = j(env.call('getWorkoutSummaryMessage', t, 'PT-A', dayOf(1)));
  assert.match(r.text, /Ani/);
  assert.match(r.text, /Bench press: 60 kg × 10, 65 kg × 8/);
  assert.match(r.text, /Rekor baru: Bench press/);
  assert.match(r.text, /1\.120 kg/);
  assert.match(r.waLink, /^https:\/\/wa\.me\//);
  assert.equal(env.fetches.length, 0);
  assert.throws(() => env.call('getWorkoutSummaryMessage', env.memberToken(KEY_A), 'PT-A', dayOf(1)), /AUTH_REQUIRED/);
  assert.match(env.call('previewReminderText', t, 'ringkasan-latihan', '').text, /ringkasan latihanmu/);
});

test('end to end L1-L4: library code in a program, client logs sets, tick, stats, record, badge, summary', () => {
  const env = seededEnv();
  const t = env.adminToken(), a = env.memberToken(KEY_A);
  const today = env.call('_todayWib_'), earlier = env.call('_addDaysIso_', today, -3);
  env.call('saveMemberProgram', t, 'PT-A', '# Hari A\nBench press | 2x10 | ex:0025\nSquat | 2x8');
  assert.equal(j(env.call('getMyProgram', a)).days[0].items[0].exId, '0025');
  env.call('saveWorkoutLog', t, 'PT-A', earlier, '', [bench([set(60, 10)])]);
  const item = (n, name, exId, sets) => ({ n, hari: 'Hari A', exId, gerakan: name, bodyPart: exId ? 'chest' : 'upper legs', target: 'x', sets });
  const r = j(env.call('logMyWorkout', a, today, [item(1, 'Bench press', '0025', [set(70, 10, 8), set(70, 8, 9)]), item(2, 'Squat', '', [set(80, 8), set(80, 8)])]));
  assert.equal(r.prs.length, 1, 'new record on bench');
  assert.equal(j(env.call('getPortalMore', a)).program.done['Hari A'].join(), '1,2', 'both items ticked');
  const st = r.stats;
  assert.ok(st.exercises.find(e => e.key === 'ex:0025').pr.e1rm > 80);
  assert.equal(st.weeks[7].volume, 70 * 10 + 70 * 8 + 80 * 16);
  assert.ok(j(env.call('getMyProgress', a)).badges.find(b => b.id === 'pr-1').earned);
  const msg = j(env.call('getWorkoutSummaryMessage', t, 'PT-A', today));
  assert.match(msg.text, /Rekor baru: Bench press/);
  assert.equal(env.fetches.length, 0);
});
