'use strict';
// Phase M: program form data, set kinds, workout sessions, next day, weight suggestions.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const ex = (gerakan, extra) => Object.assign({ gerakan, set: 3, jenis: 'beban', repMin: 10 }, extra || {});
const DAYS = [
  { hari: 'Hari A', items: [
    ex('Bench press', { exId: '0025', repMin: 8, repMax: 12, kg: 40, rest: 120, ss: 'A' }),
    ex('Bent over row', { exId: '0027', ss: 'A' }),
    ex('Plank', { jenis: 'waktu', repMin: 45, set: 3 }),
    ex('Squat', { exId: '0043', skema: [{ rep: 12, kg: 20, w: 1 }, { rep: 10, kg: 50 }, { rep: 8, kg: 60 }], set: 1 })
  ] },
  { hari: 'Hari B', items: [ex('Deadlift', { repMin: 5, kg: 80 })] }
];

test('form parser: kinds, ranges, rep text, scheme decides the set count, supersets', () => {
  const env = seededEnv();
  const p = j(env.call('_parseProgramDays_', DAYS));
  const [bench, row, plank, squat] = p.days[0].items;
  assert.deepEqual([bench.repMin, bench.repMax, bench.kg, bench.rest, bench.ss, bench.rep], [8, 12, 40, 120, 'A', '8–12']);
  assert.equal(row.rep, '10');
  assert.deepEqual([plank.jenis, plank.rep, plank.kg], ['waktu', '45 dtk', '']);
  assert.equal(squat.set, 3, 'three scheme rows = three sets');
  assert.equal(squat.rep, '12/10/8');
  assert.deepEqual(squat.skema[0], { rep: 12, kg: 20, w: 1 });
  assert.equal(j(env.call('_parseProgramDays_', [{ hari: 'X', items: [ex('A', { repMin: 10, repMax: 10 })] }])).days[0].items[0].repMax, '', 'equal range = fixed reps');
  assert.equal(j(env.call('_parseProgramDays_', [{ hari: 'X', items: [ex('A', { jenis: 'robot' })] }])).days[0].items[0].jenis, 'beban');
  assert.deepEqual(j(env.call('_parseProgramDays_', [{ hari: 'Kosong', items: [] }])).days, [], 'empty days vanish');
});

test('form parser: errors name the day and the exercise, in Indonesian', () => {
  const env = seededEnv();
  const bad = (days, re) => assert.throws(() => env.call('_parseProgramDays_', days), re);
  bad('x', /tidak valid/);
  bad([{ hari: '', items: [ex('A')] }], /Hari ke-1: beri nama hari/);
  bad([{ hari: 'A', items: [ex('X')] }, { hari: 'a', items: [ex('Y')] }], /sudah dipakai/);
  bad([{ hari: 'A', items: [ex('')] }], /A, gerakan ke-1: nama gerakan kosong/);
  bad([{ hari: 'A', items: [ex('Squat', { repMin: '' })] }], /A, Squat: isi rep/);
  bad([{ hari: 'A', items: [ex('Squat', { set: 21 })] }], /jumlah set/);
  bad([{ hari: 'A', items: [ex('Squat', { repMin: 12, repMax: 8 })] }], /rep maksimal harus lebih besar/);
  bad([{ hari: 'A', items: [ex('Squat', { kg: 501 })] }], /target beban harus 0 sampai 500/);
  bad([{ hari: 'A', items: [ex('Squat', { rest: 601 })] }], /istirahat/);
  bad([{ hari: 'A', items: [ex('Squat', { video: 'http://x.id' })] }], /https/);
  bad([{ hari: 'A', items: [ex('Squat', { skema: [{ rep: '' }] })] }], /isi rep untuk set 1/);
  bad([{ hari: 'A', items: [ex('Squat', { ss: 'A' })] }], /superset A butuh minimal 2/);
  bad([{ hari: 'A', items: [ex('X', { ss: 'A' }), ex('Y'), ex('Z', { ss: 'A' })] }], /harus berurutan/);
  bad([{ hari: 'A', items: [ex('X', { ss: 'AB' }), ex('Y', { ss: 'AB' })] }], /satu huruf/);
  bad([{ hari: 'A', items: Array.from({ length: 13 }, (_, i) => ex('G' + i)) }], /maksimal 12 gerakan/);
  bad(Array.from({ length: 8 }, (_, i) => ({ hari: 'H' + i, items: [ex('G')] })), /Maksimal 7 hari/);
});

test('structured save round-trips through the sheet; old text programs still save and read with guessed targets', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', DAYS);
  const p = j(env.call('getMemberProgram', t, 'PT-A'));
  const bench = p.days[0].items[0];
  assert.deepEqual([bench.n, bench.jenis, bench.repMin, bench.repMax, bench.kg, bench.rest, bench.ss, bench.exId], [1, 'beban', 8, 12, 40, 120, 'A', '0025']);
  assert.equal(p.days[0].items[3].skema.length, 3);
  assert.equal(env.sheet('ProgramItems').rows[0].length, 21, 'columns M–U added');
  const mine = j(env.call('getMyProgram', env.memberToken(KEY_A)));
  assert.equal(mine.days[0].items[2].jenis, 'waktu');
  // Old text format: still accepted, targets guessed from the rep text.
  env.call('saveMemberProgram', t, 'PT-B', '# Hari A\nSquat | 3x8-12\nPlank | 3x30 dtk\nLari | 1x400 m');
  const old = j(env.call('getMemberProgram', t, 'PT-B')).days[0].items;
  assert.deepEqual(old.map(i => [i.jenis, i.repMin, i.repMax]), [['beban', 8, 12], ['waktu', 30, ''], ['jarak', 400, '']]);
  // Rows written before Phase M (12 columns) read the same way.
  env.ss.seed('ProgramItems', [['ID', 'Member ID', 'Template', 'Hari', 'Urutan', 'Gerakan', 'Set', 'Rep', 'Catatan', 'Video URL', 'Diubah Pada', 'Exercise ID'], ['PRG-1', 'PT-A', '', 'Lama', 1, 'Push-up', 3, '12', '', '', 'x', '']]);
  assert.deepEqual(j(env.call('getMyProgram', env.memberToken(KEY_A))).days[0].items[0].repMin, 12);
  env.call('saveMemberProgram', t, 'PT-A', DAYS);
  assert.equal(env.sheet('ProgramItems').rows[0][18], 'Skema', 'the header is completed on the next write');
});

test('templates: structured save, list carries the days, apply keeps every field', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveProgramTemplate', t, 'Hipertrofi', DAYS);
  const list = j(env.call('getProgramTemplates', t));
  assert.equal(list[0].program[0].items[0].rest, 120);
  const applied = j(env.call('applyProgramTemplate', t, 'PT-A', 'Hipertrofi'));
  assert.deepEqual(applied.days[0].items.map(i => i.ss), ['A', 'A', '', '']);
  assert.equal(applied.days[0].items[3].skema[0].w, 1);
  assert.throws(() => env.call('saveProgramTemplate', t, 'Kosong', []), /tidak boleh kosong/);
});

test('set kinds: warm-ups are kept but left out of volume, 1RM and records; unknown kind is refused', () => {
  const env = seededEnv();
  const t = env.adminToken(), dayOf = n => env.call('_addDaysIso_', env.call('_todayWib_'), -n);
  const bench = sets => ({ exId: '0025', gerakan: 'Bench press', bodyPart: 'chest', sets });
  env.call('saveWorkoutLog', t, 'PT-A', dayOf(3), '', [bench([{ berat: 60, rep: 10 }])]);
  const r = j(env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([{ berat: 100, rep: 10, jenis: 'w' }, { berat: 60, rep: 8, jenis: 'gagal' }, { berat: 40, rep: 12, jenis: 'drop' }])]));
  assert.deepEqual(r.prs, [], 'a heavy warm-up is not a record');
  assert.deepEqual(r.days[0].items[0].sets.map(s => s.jenis), ['w', 'gagal', 'drop']);
  const last = r.stats.sessions[0];
  assert.equal(last.sets, 2);
  assert.equal(last.volume, 60 * 8 + 40 * 12);
  assert.equal(r.best['ex:0025'], 80, 'best 1RM ignores the warm-up');
  assert.equal(env.sheet('WorkoutLog').rows[0][19], 'Jenis Set');
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', dayOf(1), '', [bench([{ berat: 1, rep: 1, jenis: 'x' }])]), /jenis set tidak dikenal/);
});

test('workout sessions: upsert per day, feeling and note, duration from start/finish, retry replaces', () => {
  const env = seededEnv();
  const a = env.memberToken(KEY_A), today = env.call('_todayWib_');
  const sets = [{ exId: '0025', gerakan: 'Bench press', sets: [{ berat: 40, rep: 10 }] }];
  const ses = { cid: 'wl-abc', hari: 'Hari A', mulai: '2026-10-14T01:00:00Z', selesai: '2026-10-14T01:52:00Z', rasa: 4, catatan: 'enak' };
  let r = j(env.call('logMyWorkout', a, today, sets, ses));
  assert.deepEqual(r.sessions[0], { tanggal: today, hari: 'Hari A', durasi: 3120, rasa: 4, catatan: 'enak', oleh: 'klien' });
  env.context.CacheService.getScriptCache().remove('throttle_wk_PT-A');
  r = j(env.call('logMyWorkout', a, today, sets, Object.assign({}, ses, { rasa: 5 })));
  assert.equal(env.sheet('WorkoutSessions').rows.length, 2, 'same day is one row');
  assert.equal(r.sessions[0].rasa, 5);
  assert.equal(env.sheet('WorkoutLog').rows.length, 2, 'retry did not double the sets');
  assert.throws(() => env.call('_parseWorkoutSession_', { rasa: 6 }), /Rasa latihan/);
  assert.throws(() => env.call('_parseWorkoutSession_', { mulai: '2026-10-14T02:00:00Z', selesai: '2026-10-14T01:00:00Z' }), /setelah waktu mulai/);
  assert.throws(() => env.call('_parseWorkoutSession_', { cid: 'a b' }), /Kode latihan/);
  assert.equal(env.call('_parseWorkoutSession_', null), null);
  assert.equal(j(env.call('getMyWorkout', env.memberToken(KEY_B))).sessions.length, 0, 'other clients see nothing');
  const hub = j(env.call('getCoachHub', env.adminToken())).workouts;
  assert.equal(hub[0].hari, 'Hari A');
  assert.equal(hub[0].rasa, 5);
  assert.equal(env.fetches.length, 0, 'nothing to Telegram');
});

test('saves accept up to 20 exercises', () => {
  const env = seededEnv();
  const t = env.adminToken(), today = env.call('_todayWib_');
  const many = n => Array.from({ length: n }, (_, i) => ({ gerakan: 'G' + i, sets: [{ rep: 5 }] }));
  assert.equal(j(env.call('saveWorkoutLog', t, 'PT-A', today, '', many(20))).days[0].items.length, 20);
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', today, '', many(21)), /Maksimal 20 gerakan/);
});

test('next day: continues today, otherwise the day after the last one (rotating), from logs or ticks', () => {
  const env = seededEnv();
  const prog = [{ hari: 'A' }, { hari: 'B' }, { hari: 'C' }];
  const wd = (tanggal, hari) => ({ tanggal, items: [{ hari }] });
  const next = (w, logs, today) => env.call('_workoutNextDay_', prog, w, logs, today || '2026-10-14');
  assert.equal(env.call('_workoutNextDay_', [], [], [], '2026-10-14'), '');
  assert.equal(next([], []), 'A');
  assert.equal(next([wd('2026-10-12', 'A')], []), 'B');
  assert.equal(next([wd('2026-10-12', 'C')], []), 'A', 'wraps around');
  assert.equal(next([wd('2026-10-14', 'B')], []), 'B', 'today continues');
  assert.equal(next([wd('2026-10-10', 'A')], [{ tanggal: '2026-10-12', hari: 'B' }]), 'C', 'ticks count too');
  assert.equal(next([wd('2026-10-12', 'Z')], []), 'A', 'unknown day = start over');
  // Through the read: the program and the log decide.
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', DAYS);
  env.call('saveWorkoutLog', t, 'PT-A', env.call('_addDaysIso_', env.call('_todayWib_'), -2), '', [{ n: 1, hari: 'Hari A', exId: '0025', gerakan: 'Bench press', sets: [{ berat: 40, rep: 12 }] }]);
  assert.equal(j(env.call('getMyWorkout', env.memberToken(KEY_A))).next, 'Hari B');
});

test('suggestion: heavier only when every working set hit the top of the range; lower body jumps more', () => {
  const env = seededEnv();
  const item = { jenis: 'beban', repMin: 8, repMax: 12 };
  const s = (sets, part, it) => j(env.call('_workoutSuggest_', sets, it || item, part || 'chest'));
  assert.deepEqual(s([{ berat: 40, rep: 12 }, { berat: 40, rep: 12 }]), { kg: 42.5, why: 'Semua set mencapai 12 rep' });
  assert.equal(s([{ berat: 40, rep: 12 }, { berat: 40, rep: 10 }]), null);
  assert.equal(s([{ berat: 20, rep: 5, jenis: 'w' }, { berat: 60, rep: 12 }], 'upper legs').kg, 65, 'warm-up ignored, lower body +5');
  assert.equal(s([{ berat: 40, rep: 12 }], 'chest', { jenis: 'waktu', repMin: 30 }), null);
  assert.equal(s([{ berat: '', rep: 12 }]), null, 'no weight, no suggestion');
  assert.equal(s([{ berat: 40, rep: 10 }], 'back', { jenis: 'beban', repMin: 10, repMax: '' }).kg, 42.5, 'fixed reps use the rep target');
  // Through the read.
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', DAYS);
  env.call('saveWorkoutLog', t, 'PT-A', env.call('_addDaysIso_', env.call('_todayWib_'), -2), '', [{ n: 1, hari: 'Hari A', exId: '0025', gerakan: 'Bench press', bodyPart: 'chest', sets: [{ berat: 40, rep: 12 }, { berat: 40, rep: 12 }] }]);
  assert.equal(j(env.call('getMyWorkout', env.memberToken(KEY_A))).suggest['ex:0025'].kg, 42.5);
  assert.equal(j(env.call('getPortalMore', env.memberToken(KEY_A))).workout.suggest['ex:0025'].kg, 42.5);
});
