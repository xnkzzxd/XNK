'use strict';
// Fase U (T-1603): manual exercise names → library merge (exact only), coach aliases, muscle guesses. Read-time only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const set = (berat, rep) => ({ berat, rep });

test('norm: case, punctuation, equipment synonyms and word order do not matter', () => {
  const env = seededEnv();
  const n = x => env.call('_exNorm_', x);
  assert.equal(n('Seated Cable Row'), n('cable seated row'));
  assert.equal(n('Lat Pull Down (kabel)'), n('cable lat pulldown'));
  assert.equal(n('Push-ups'), n('push up'));
  assert.equal(n('Leg Press 45в°'), n('Leg Press (45°)'));
  assert.notEqual(n('lat pulldown'), n('cable lat pulldown'), 'a missing equipment word is not the same exercise');
  assert.equal(n('  '), '');
});

test('guess: the gym list and common manual names get a muscle; unknown names get none', () => {
  const env = seededEnv();
  const g = x => { const r = env.call('_exGuessMuscles_', x); return r ? r.target + '/' + r.bodyPart : null; };
  assert.equal(g('Chest fly machine'), 'pectorals/chest');
  assert.equal(g('Incline push up'), 'pectorals/chest');
  assert.equal(g('Lat pulldown'), 'lats/back');
  assert.equal(g('Seated cable row'), 'upper back/back');
  assert.equal(g('Squat machine'), 'quads/upper legs');
  assert.equal(g('Leg press 45'), 'quads/upper legs');
  assert.equal(g('Hip thrust machine'), 'glutes/upper legs');
  assert.equal(g('Leg extension'), 'quads/upper legs');
  assert.equal(g('Leg curl'), 'hamstrings/upper legs');
  assert.equal(g('Triceps pushdown'), 'triceps/upper arms');
  assert.equal(g('Hammer curl'), 'biceps/upper arms');
  assert.equal(g('Rear delt fly'), 'delts/shoulders');
  assert.equal(g('Treadmill'), 'cardiovascular system/cardio');
  assert.equal(g('Calf raise'), 'calves/lower legs');
  assert.equal(g('Plank'), 'abs/waist');
  assert.equal(g('Zumba sesi'), null);
});

test('resolve: exact library name merges to its Exercise ID; a guess only fills muscles', () => {
  const env = seededEnv();
  const merged = j(env.call('_exResolve_', '', 'seated cable row', '', ''));
  assert.deepEqual(merged, { exId: '0861', bodyPart: 'back', target: 'upper back', src: 'pustaka' });
  const guessed = j(env.call('_exResolve_', '', 'Lat pulldown', '', ''));
  assert.deepEqual(guessed, { exId: '', bodyPart: 'back', target: 'lats', src: 'tebakan' });
  const kept = j(env.call('_exResolve_', '', 'Lat pulldown', 'shoulders', ''));
  assert.equal(kept.bodyPart, 'shoulders', 'a body part the user chose is never replaced');
});

test('workout reads: manual rows count under their muscle, merged rows share history with the library exercise', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveWorkoutLog', t, 'PT-A', '2026-10-01', '', [{ gerakan: 'Seated cable row', sets: [set(30, 12)] }, { gerakan: 'Lat pulldown', sets: [set(35, 10)] }]);
  env.call('saveWorkoutLog', t, 'PT-A', '2026-10-04', '', [{ exId: '0861', gerakan: 'Seated Cable Row', sets: [set(32.5, 12)] }]);
  const r = j(env.call('getWorkoutLog', t, 'PT-A'));
  const items = r.days.flatMap(d => d.items);
  const row = items.filter(i => i.key === 'ex:0861');
  assert.equal(row.length, 2, 'both days are one exercise');
  assert.equal(r.last['ex:0861'].sets[0].berat, 32.5);
  const lat = items.find(i => i.gerakan === 'Lat pulldown');
  assert.equal(lat.bodyPart, 'back');
  assert.equal(lat.target, 'lats');
  assert.equal(env.sheet('WorkoutLog').rows[1][6], '', 'the sheet keeps the manual row as it was');
});

test('saving a day again replaces merged manual rows instead of doubling them', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveWorkoutLog', t, 'PT-A', '2026-10-01', '', [{ gerakan: 'Seated cable row', sets: [set(30, 12), set(30, 12)] }]);
  env.call('saveWorkoutLog', t, 'PT-A', '2026-10-01', '', [{ exId: '0861', gerakan: 'Seated Cable Row', sets: [set(30, 12)] }]);
  assert.equal(env.sheet('WorkoutLog').rows.length, 2, 'header + one set');
});

test('aliases: coach maps a manual name to a library exercise or a muscle; delete removes it; validation', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveWorkoutLog', t, 'PT-A', '2026-10-01', '', [{ gerakan: 'Lat pulldown', sets: [set(35, 10)] }, { gerakan: 'Zumba sesi', sets: [{ durasi: 1800 }] }]);
  let m = j(env.call('getManualExercises', t));
  assert.deepEqual(m.items.map(i => [i.nama, i.src]).sort(), [['Lat pulldown', 'tebakan'], ['Zumba sesi', '']]);
  assert.ok(m.targets.includes('lats'));
  m = j(env.call('saveExerciseAlias', t, [{ nama: 'Lat pulldown', exId: '2330' }, { nama: 'Zumba sesi', target: 'cardiovascular system' }]));
  const lat = m.items.find(i => i.nama === 'Lat pulldown');
  assert.deepEqual([lat.exId, lat.src], ['2330', 'alias']);
  assert.equal(m.items.find(i => i.nama === 'Zumba sesi').bodyPart, 'cardio');
  const r = j(env.call('getWorkoutLog', t, 'PT-A'));
  assert.ok(r.last['ex:2330'], 'aliased rows join the library exercise history');
  m = j(env.call('saveExerciseAlias', t, [{ nama: 'lat PULLDOWN', hapus: true }]));
  assert.equal(m.items.find(i => i.nama === 'Lat pulldown').src, 'tebakan');
  assert.equal(env.sheet('ExerciseAlias').rows.length, 2);
  assert.throws(() => env.call('saveExerciseAlias', t, [{ nama: 'X', exId: 'nope' }]), /tidak ditemukan/);
  assert.throws(() => env.call('saveExerciseAlias', t, [{ nama: 'X', target: 'jantung' }]), /tidak dikenal/);
  assert.throws(() => env.call('saveExerciseAlias', t, [{ nama: 'X' }]), /Pilih gerakan pustaka atau otot/);
  assert.throws(() => env.call('saveExerciseAlias', t, []), /tidak valid/);
});

test('program items: a manual name identical to the library gets its Exercise ID on read', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', '# Hari A\nSeated cable row | 3x12\nLat pulldown | 3x10');
  const p = j(env.call('getMemberProgram', t, 'PT-A'));
  assert.deepEqual(p.days[0].items.map(i => i.exId), ['0861', '']);
});
