'use strict';
// Fase U (T-1604): profil latihan (MemberData AG–AQ), kolom Sumber (ProgramItems V), kolom Form (WorkoutLog U), level dari form daftar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('profile: validation messages and defaults', () => {
  const env = seededEnv();
  const v = p => j(env.call('_pgValidateProfile_', p));
  assert.deepEqual(v({ level: 'pemula', hari: '3', durasi: 45, tujuan: 'otot', fokus: ['glutes'] }), { level: 'pemula', hari: 3, durasi: 45, tujuan: 'otot', fokus: ['glutes'] });
  assert.throws(() => env.call('_pgValidateProfile_', { level: 'pro' }), /Pilih level/);
  assert.throws(() => env.call('_pgValidateProfile_', { hari: 5 }), /2, 3, atau 4/);
  assert.throws(() => env.call('_pgValidateProfile_', { durasi: 90 }), /30, 45, atau 60/);
  assert.throws(() => env.call('_pgValidateProfile_', { tujuan: 'kurus' }), /Pilih tujuan/);
  assert.throws(() => env.call('_pgValidateProfile_', { fokus: ['glutes', 'quads', 'lats'] }), /maksimal 2/);
  assert.throws(() => env.call('_pgValidateProfile_', { fokus: ['cardiovascular system'] }), /tidak dikenal/);
  assert.throws(() => env.call('_pgValidateProfile_', { pantangan: ['kepala'] }), /tidak dikenal/);
});

test('profile: goal falls back to the old goal text; written values read back', () => {
  const env = seededEnv();
  const row = new Array(43).fill('');
  row[3] = 'Weight Loss | [Paket - 8 Sesi]';
  let p = j(env.call('_pgProfileFrom_', row));
  assert.equal(p.tujuan, 'fatloss');
  assert.equal(p.tujuanDiisi, false);
  assert.equal(p.auto, true, 'empty = follows the global switch');
  row[3] = 'Strength Training';
  assert.equal(j(env.call('_pgProfileFrom_', row)).tujuan, 'kekuatan');
  row[32] = 'pemula'; row[33] = '3'; row[38] = '45'; row[39] = 'otot'; row[34] = 'tidak'; row[42] = 'glutes,quads,lats'; row[40] = '{"lutut":"gym:leg-press-45"}';
  p = j(env.call('_pgProfileFrom_', row));
  assert.deepEqual([p.level, p.hari, p.durasi, p.tujuan, p.auto], ['pemula', 3, 45, 'otot', false]);
  assert.deepEqual(p.fokus, ['glutes', 'quads'], 'never more than two focus muscles');
  assert.deepEqual(p.tukar, { lutut: 'gym:leg-press-45' });
});

test('registration: experience becomes the starting level, rounded down', () => {
  const env = seededEnv();
  const r = j(env.call('registerNewClient', { name: 'Dewi', phone: '081955500011', packageId: 'P1', experience: 'Menengah' }));
  assert.equal(r.status, 'success');
  const row = env.sheet('MemberData').rows.find(x => x[0] === r.id);
  assert.equal(row[32], 'pemula');
  assert.equal(env.sheet('MemberData').rows[0][32], 'Level Latihan', 'header added');
  assert.equal(env.call('_pgLevelFromExperience_', 'Pemula'), 'pemula-banget');
  assert.equal(env.call('_pgLevelFromExperience_', 'Lanjutan'), 'menengah');
  assert.equal(env.call('_pgLevelFromExperience_', ''), '');
});

test('program source column: auto rows are marked, a coach save clears it', () => {
  const env = seededEnv();
  env.call('_programWrite_', 'PT-A', null, [{ hari: 'Full Body A', items: [{ gerakan: 'Leg Press (45°)', exId: '0739', set: 2, rep: '8–12', jenis: 'beban', repMin: 8, repMax: 12 }] }], { sumber: 'auto:1' });
  assert.equal(j(env.call('_programDays_', 'PT-A')).sumber, 'auto:1');
  env.call('saveMemberProgram', env.adminToken(), 'PT-A', '# Hari A\nSquat | 3x10');
  assert.equal(j(env.call('_programDays_', 'PT-A')).sumber, '', 'coach program is never marked auto');
});

test('workout form answer: stored on the first set, read back, validated', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const r = j(env.call('saveWorkoutLog', t, 'PT-A', '2026-10-10', '', [{ exId: '0739', gerakan: 'Leg Press (45°)', form: 'ragu', sets: [{ berat: 40, rep: 10 }, { berat: 40, rep: 10 }] }]));
  assert.equal(r.days[0].items[0].form, 'ragu');
  const rows = env.sheet('WorkoutLog').rows;
  assert.equal(rows[0][20], 'Form');
  assert.deepEqual(rows.slice(1).map(x => x[20]), ['ragu', '']);
  assert.throws(() => env.call('saveWorkoutLog', t, 'PT-A', '2026-10-10', '', [{ gerakan: 'X', form: 'mantap', sets: [{ rep: 5 }] }]), /jawaban form/);
});
