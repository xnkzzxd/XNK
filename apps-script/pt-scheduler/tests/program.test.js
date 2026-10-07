'use strict';
// Program latihan (Phase J2): text parser, per-client programs, templates, client checklist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const A = env => env.memberToken(KEY_A);
const TEXT = `# Hari A — Dada
Bench press | 3x10 | turun pelan | https://youtu.be/abc
Push-up | 3x12
Plank | 3x30 dtk | https://youtu.be/plank

# Hari B
Squat | 4x8 | jaga punggung`;

test('parser: days, sets x reps, notes and https links in any order; empty days vanish', () => {
  const env = seededEnv();
  const p = j(env.call('_parseProgramText_', TEXT));
  assert.deepEqual(p.days.map(d => [d.hari, d.items.length]), [['Hari A — Dada', 3], ['Hari B', 1]]);
  assert.deepEqual(p.days[0].items[0], { gerakan: 'Bench press', set: 3, rep: '10', catatan: 'turun pelan', video: 'https://youtu.be/abc' });
  assert.deepEqual(p.days[0].items[2], { gerakan: 'Plank', set: 3, rep: '30 dtk', catatan: '', video: 'https://youtu.be/plank' });
  assert.deepEqual(j(env.call('_parseProgramText_', 'Squat | 3×10 | https://x.id/v | catatan')).days[0].items[0], { gerakan: 'Squat', set: 3, rep: '10', catatan: 'catatan', video: 'https://x.id/v' });
  assert.equal(j(env.call('_parseProgramText_', 'Squat | 3x10')).days[0].hari, 'Latihan', 'no header = one day');
  assert.deepEqual(j(env.call('_parseProgramText_', '# Kosong\n\n# Hari B\nSquat | 3x10')).days.map(d => d.hari), ['Hari B']);
  assert.deepEqual(j(env.call('_parseProgramText_', '')), { days: [] });
});

test('parser: every bad line is named with its number, in Indonesian', () => {
  const env = seededEnv();
  const bad = (t, re) => assert.throws(() => env.call('_parseProgramText_', t), re);
  bad('Squat', /Baris 1: tulis set dan rep seperti 3x10/);
  bad('Squat | banyak', /Baris 1: tulis set dan rep/);
  bad('# \nSquat | 3x10', /Baris 1: beri nama hari/);
  bad('# A\nSquat | 3x10 | http://x.id/v', /Baris 2: link video harus diawali https/);
  assert.equal(j(env.call('_parseProgramText_', 'Squat | 3x10 | javascript:alert(1)')).days[0].items[0].video, '', 'a non-https link is only ever plain note text');
  bad('| 3x10', /Baris 1: nama gerakan kosong/);
  bad('Squat | 0x10', /jumlah set harus 1 sampai 20/);
  bad('Squat | 3x10 | a | b', /catatan lebih dari satu/);
  bad('Squat | 3x10 | https://a.id/1 | https://a.id/2', /hanya satu link video/);
  bad('# A\nSquat | 3x10\n# A\nPlank | 3x10', /sudah dipakai/);
  bad(Array.from({ length: 13 }, (_, i) => 'G' + i + ' | 3x10').join('\n'), /maksimal 12 gerakan per hari/);
  bad(Array.from({ length: 8 }, (_, i) => '# H' + i + '\nG | 3x10').join('\n'), /Maksimal 7 hari/);
  bad('x'.repeat(81) + ' | 3x10', /nama gerakan maksimal 80/);
});

test('text round trip: save, read back as the same text', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', TEXT);
  const p = j(env.call('getMemberProgram', t, 'PT-A'));
  assert.equal(p.text, TEXT);
  assert.deepEqual(p.days[0].items.map(i => i.n), [1, 2, 3]);
  assert.deepEqual(p.days[1].items.map(i => i.n), [4]);
  assert.equal(env.sheet('ProgramItems').rows.length, 5);
  assert.equal(env.sheet('ProgramItems').rows[1][1], 'PT-A');
  env.call('saveMemberProgram', t, 'PT-A', '# Hari C\nDeadlift | 3x5');   // replaces, not appends
  assert.equal(env.sheet('ProgramItems').rows.length, 2);
  env.call('saveMemberProgram', t, 'PT-A', '');
  assert.equal(env.sheet('ProgramItems').rows.length, 1, 'empty text deletes the program');
  assert.throws(() => env.call('saveMemberProgram', t, 'NOPE', TEXT), /Klien tidak ditemukan/);
  assert.throws(() => env.call('saveMemberProgram', t, 'PT-A', 'Squat'), /Baris 1/);
});

test("a client's program is separate from another client's and from templates", () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', '# Hari A\nBench | 3x10');
  env.call('saveMemberProgram', t, 'PT-B', '# Hari B\nSquat | 3x10');
  env.call('saveProgramTemplate', t, 'Pemula', '# Full body\nSquat | 3x10');
  assert.deepEqual(j(env.call('getMyProgram', A(env))).days.map(d => d.hari), ['Hari A']);
  assert.deepEqual(j(env.call('getMyProgram', env.memberToken(KEY_B))).days.map(d => d.hari), ['Hari B']);
  assert.equal(j(env.call('getMemberProgram', t, 'PT-A')).days.length, 1, 'templates never leak into a client program');
  assert.throws(() => env.call('getMemberProgram', A(env), 'PT-A'), /AUTH_REQUIRED/);
  assert.throws(() => env.call('saveMemberProgram', A(env), 'PT-A', 'x | 3x1'), /AUTH_REQUIRED/);
});

test('templates: save (case-insensitive upsert), list, apply to a client, delete; limits', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('saveProgramTemplate', t, '', TEXT), /Nama template wajib/);
  assert.throws(() => env.call('saveProgramTemplate', t, 'Kosong', ''), /Template tidak boleh kosong/);
  env.call('saveProgramTemplate', t, 'Pemula', TEXT);
  env.call('saveProgramTemplate', t, 'pemula', '# Satu\nPlank | 3x30 dtk');   // same name, other case: replaced
  const list = j(env.call('getProgramTemplates', t));
  assert.deepEqual(list.map(x => [x.name, x.days, x.items]), [['Pemula', 1, 1]]);
  const applied = j(env.call('applyProgramTemplate', t, 'PT-A', 'Pemula'));
  assert.equal(applied.text, '# Satu\nPlank | 3x30 dtk');
  assert.equal(env.sheet('ProgramItems').rows.filter(r => r[1] === 'PT-A').length, 1);
  assert.throws(() => env.call('applyProgramTemplate', t, 'PT-A', 'Tidak ada'), /Template tidak ditemukan/);
  env.call('deleteProgramTemplate', t, 'Pemula');
  assert.equal(j(env.call('getProgramTemplates', t)).length, 0);
  assert.equal(env.call('getMemberProgram', t, 'PT-A').days.length, 1, 'a client program survives deleting its template');
  assert.throws(() => env.call('deleteProgramTemplate', t, 'Pemula'), /Template tidak ditemukan/);
  for (let i = 0; i < 30; i++) env.call('saveProgramTemplate', t, 'T' + i, 'Squat | 3x10');
  assert.throws(() => env.call('saveProgramTemplate', t, 'Satu lagi', 'Squat | 3x10'), /batas 30/);
  env.call('saveProgramTemplate', t, 'T3', 'Plank | 3x10');   // overwriting at the limit is fine
});

test('client checklist: only own program, valid exercises, upsert per day, empty selection clears, coach told once when a day is complete', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', TEXT);
  assert.throws(() => env.call('logMyProgramDay', A(env), 'Hari Z', [1]), /Hari latihan tidak ditemukan/);
  assert.throws(() => env.call('logMyProgramDay', A(env), 'Hari B', [1]), /Gerakan tidak ditemukan/);   // 1 belongs to Hari A
  assert.throws(() => env.call('logMyProgramDay', env.memberToken(KEY_B), 'Hari B', [4]), /Hari latihan tidak ditemukan/);   // Budi has no program
  assert.throws(() => env.call('logMyProgramDay', null, 'Hari B', [4]), /AUTH_REQUIRED/);
  let r = j(env.call('logMyProgramDay', A(env), 'Hari A — Dada', [2, 1, 1]));
  assert.deepEqual([r.selesai, r.complete], [[1, 2], false]);
  const before = env.fetches.length;
  r = j(env.call('logMyProgramDay', A(env), 'Hari A — Dada', [1, 2, 3]));
  assert.equal(r.complete, true);
  assert.equal(env.sheet('ProgramLog').rows.length, 2, 'one row per client, day and date');
  assert.equal(env.sheet('ProgramLog').rows[1][4], '1,2,3');
  const tg = env.fetches.slice(before).map(f => JSON.stringify(f));
  assert.equal(tg.length, 1);
  assert.match(tg[0], /Ani<\/b> menyelesaikan program: Hari A — Dada/);
  assert.ok(!tg[0].includes('Anggraini'));
  env.call('logMyProgramDay', A(env), 'Hari A — Dada', [1, 2, 3]);
  assert.equal(env.fetches.length, before + 1, 'saving the complete day again does not notify twice');
  const mine = j(env.call('getMyProgram', A(env)));
  assert.deepEqual(mine.done, { 'Hari A — Dada': [1, 2, 3] });
  env.call('logMyProgramDay', A(env), 'Hari A — Dada', []);
  assert.equal(env.sheet('ProgramLog').rows.length, 1, 'an empty selection clears the day');
  assert.deepEqual(j(env.call('getMyProgram', A(env))).done, {});
});

test('the owner sees the last checked day; old logs do not count as today', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberProgram', t, 'PT-A', TEXT);
  env.ss.seed('ProgramLog', [['ID', 'Member ID', 'Tanggal', 'Hari', 'Selesai', 'Dibuat Pada'], ['PLG-OLD', 'PT-A', '2020-01-02', 'Hari B', '4', 'x']]);
  assert.deepEqual(j(env.call('getMyProgram', A(env))).done, {});
  assert.deepEqual(j(env.call('getMemberProgram', t, 'PT-A').last), { tanggal: '2020-01-02', hari: 'Hari B', selesai: 1 });
});
