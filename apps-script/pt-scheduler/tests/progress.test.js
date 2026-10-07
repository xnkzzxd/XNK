'use strict';
// Phase D1: client progress (weight, waist, private photos).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64');

function setup() {
  const env = seededEnv();
  return { env, ani: env.memberToken(KEY_A), budi: env.memberToken(KEY_B), admin: env.adminToken() };
}
const today = env => env.call('_todayWib_');
const daysAgo = (env, n) => env.call('_addDaysIso_', today(env), -n);

// ── measurements ─────────────────────────────────────────────────────────────

test('a client saves weight and waist for today; the entry comes back with a change summary', () => {
  const { env, ani } = setup();
  const res = env.call('saveMyMeasurement', ani, { berat: 72.44, pinggang: '80,5' });
  assert.equal(res.entries.length, 1);
  assert.deepEqual(res.entries[0], { id: res.entries[0].id, tanggal: today(env), berat: 72.4, pinggang: 80.5, lenganKanan: '', lenganKiri: '', perut: '', pahaKanan: '', pahaKiri: '', dada: '', oleh: 'klien' });
  assert.equal(res.summary.berat.change, 0);
  assert.equal(res.summary.berat.count, 1);
  const sheet = env.sheet('Progress').rows;
  assert.deepEqual(Array.from(sheet[0]).slice(0, 7), ['ID', 'Member ID', 'Tanggal', 'Berat (kg)', 'Pinggang (cm)', 'Dicatat Oleh', 'Diubah Pada']);
  assert.equal(sheet[1][1], 'PT-A');
});

test('a second save the same day updates the row instead of adding one, and an empty field keeps the old value', () => {
  const { env, ani } = setup();
  env.call('saveMyMeasurement', ani, { berat: 72, pinggang: 80 });
  const res = env.call('saveMyMeasurement', ani, { berat: 71.5, pinggang: '' });
  assert.equal(res.entries.length, 1);
  assert.equal(res.entries[0].berat, 71.5);
  assert.equal(res.entries[0].pinggang, 80);
  assert.equal(env.sheet('Progress').rows.length, 2);
});

test('the change is measured from the first entry to the latest', () => {
  const { env, ani, admin } = setup();
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: daysAgo(env, 30), berat: 75, pinggang: 90 });
  env.call('saveMemberMeasurement', admin, 'PT-A', { tanggal: daysAgo(env, 10), berat: 73.5 });
  const res = env.call('saveMyMeasurement', ani, { berat: 72.9 });
  assert.deepEqual(res.summary.berat, { first: { tanggal: daysAgo(env, 30), nilai: 75 }, last: { tanggal: today(env), nilai: 72.9 }, change: -2.1, count: 3 });
  assert.equal(res.summary.pinggang.count, 1);
  assert.equal(res.summary.pinggang.change, 0);
  assert.deepEqual(res.entries.map(e => e.tanggal), [daysAgo(env, 30), daysAgo(env, 10), today(env)]);   // oldest first
});

test('limits: needs a value, sane ranges, no future dates, clients only 7 days back', () => {
  const { env, ani, admin } = setup();
  const bad = (data, re) => assert.throws(() => env.call('saveMyMeasurement', ani, data), re);
  bad({}, /Isi minimal satu ukuran/);
  bad({ berat: '', pinggang: '' }, /Isi minimal satu ukuran/);
  bad({ berat: 19 }, /Berat harus angka antara 20 dan 300/);
  bad({ berat: 301 }, /Berat/);
  bad({ berat: 'abc' }, /Berat/);
  bad({ pinggang: 29 }, /Lingkar pinggang harus angka antara 30 dan 250/);
  bad({ berat: 70, tanggal: daysAgo(env, -1) }, /masa depan/);
  bad({ berat: 70, tanggal: daysAgo(env, 8) }, /7 hari/);
  bad({ berat: 70, tanggal: '2026-02-31' }, /Tanggal tidak valid/);
  bad({ berat: 70, tanggal: 'kemarin' }, /Tanggal tidak valid/);
  assert.equal(env.call('saveMyMeasurement', ani, { berat: 70, tanggal: daysAgo(env, 7) }).entries.length, 1);   // exactly 7 days is fine
  // the owner/coach may go further back, but not into the future
  assert.equal(env.call('saveMemberMeasurement', admin, 'PT-A', { berat: 74, tanggal: daysAgo(env, 60) }).entries.length, 2);
  assert.throws(() => env.call('saveMemberMeasurement', admin, 'PT-A', { berat: 74, tanggal: daysAgo(env, -1) }), /masa depan/);
  assert.equal(env.sheet('Progress').rows.length, 3);   // header + the two good rows
});

test('a client cannot read, change or delete another client\'s entries; the client ID comes from the token', () => {
  const { env, ani, budi } = setup();
  const a = env.call('saveMyMeasurement', ani, { berat: 72 });
  const idA = a.entries[0].id;
  assert.deepEqual(env.call('getMyProgress', budi).entries, []);
  assert.throws(() => env.call('deleteMyMeasurement', budi, idA), /tidak ditemukan/);
  assert.equal(env.sheet('Progress').rows.length, 2);
  // extra arguments cannot redirect the write to someone else
  env.call('saveMyMeasurement', budi, { berat: 90, memberId: 'PT-A', id: 'PT-A' });
  assert.equal(env.call('getMyProgress', ani).entries.length, 1);
  assert.equal(env.call('getMyProgress', budi).entries[0].berat, 90);
  const after = env.call('deleteMyMeasurement', ani, idA);
  assert.deepEqual(after.entries, []);
});

test('the owner can add, list and delete a client\'s entries, marked as "coach"', () => {
  const { env, ani, admin } = setup();
  const res = env.call('saveMemberMeasurement', admin, 'PT-A', { berat: 74, pinggang: 88 });
  assert.equal(res.entries[0].oleh, 'coach');
  env.call('saveMyMeasurement', ani, { berat: 73.5 });              // same day: client updates the coach's row
  assert.equal(env.call('getMemberProgress', admin, 'PT-A').entries[0].oleh, 'klien');
  assert.throws(() => env.call('saveMemberMeasurement', admin, 'NOPE', { berat: 70 }), /Klien tidak ditemukan/);
  const id = env.call('getMemberProgress', admin, 'PT-A').entries[0].id;
  assert.deepEqual(env.call('deleteMemberMeasurement', admin, id).entries, []);
  assert.throws(() => env.call('deleteMemberMeasurement', admin, id), /tidak ditemukan/);
});

// ── photos ───────────────────────────────────────────────────────────────────

test('a client uploads a progress photo: it lands in the private folder and is never shared by link', () => {
  const { env, ani } = setup();
  const res = env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'depan');
  assert.equal(res.photos.length, 1);
  assert.deepEqual(Object.keys(res.photos[0]).sort(), ['id', 'oleh', 'sisi', 'tanggal']);   // no Drive file ID leaks
  assert.equal(env.files.length, 1);
  assert.equal(env.files[0].sharing, null);                       // no setSharing call: still private
  assert.equal(env.props.PROGRESS_PHOTO_FOLDER_ID, 'FOLDER_XNK Progress');
  const row = env.sheet('ProgressPhotos').rows[1];
  assert.equal(row[1], 'PT-A');
  assert.equal(row[3], 'depan');
  assert.equal(row[4], 'FILE_1');
  env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'samping');
  assert.equal(env.files.length, 2);                              // reuses the same folder
});

test('photo upload rejects other file types, unknown sides, oversize data, and more than 60 photos', () => {
  const { env, ani } = setup();
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, PNG, 'application/pdf', 'depan'), /JPG, PNG, atau WEBP/);
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, PNG, 'image/gif', 'depan'), /JPG, PNG, atau WEBP/);
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'belakang'), /depan atau samping/);
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, 'A'.repeat(7000001), 'image/png', 'depan'), /5 MB/);
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, '', 'image/png', 'depan'), /5 MB/);
  const rows = [['ID', 'Member ID', 'Tanggal', 'Sisi', 'File ID', 'Dicatat Oleh']];
  for (let i = 0; i < 60; i++) rows.push(['PHT-' + i, 'PT-A', '2026-01-01', 'depan', 'F' + i, 'klien']);
  env.ss.seed('ProgressPhotos', rows);
  assert.throws(() => env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'depan'), /Maksimal 60 foto/);
  assert.equal(env.files.length, 0);
});

test('only the owner of a photo (or the admin) can read it, and only as a data URL', () => {
  const { env, ani, budi, admin } = setup();
  const id = env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'depan').photos[0].id;
  const mine = env.call('getMyProgressPhoto', ani, id);
  assert.match(mine.dataUrl, /^data:image\/png;base64,/);
  assert.equal(Buffer.from(mine.dataUrl.split(',')[1], 'base64').toString('base64'), PNG);
  assert.throws(() => env.call('getMyProgressPhoto', budi, id), /Foto tidak ditemukan/);
  assert.throws(() => env.call('deleteMyProgressPhoto', budi, id), /Foto tidak ditemukan/);
  assert.match(env.call('getMemberProgressPhoto', admin, id).dataUrl, /^data:image\/png;base64,/);
  assert.throws(() => env.call('getMemberProgressPhoto', admin, 'PHT-NOPE'), /Foto tidak ditemukan/);
  assert.equal(env.call('getMemberProgress', admin, 'PT-A').photos.length, 1);
  assert.equal(env.call('getMyProgress', budi).photos.length, 0);
});

test('deleting a photo trashes the Drive file and removes the row', () => {
  const { env, ani } = setup();
  const id = env.call('uploadMyProgressPhoto', ani, PNG, 'image/png', 'samping').photos[0].id;
  const res = env.call('deleteMyProgressPhoto', ani, id);
  assert.deepEqual(res.photos, []);
  assert.equal(env.files[0].trashed, true);
  assert.equal(env.sheet('ProgressPhotos').rows.length, 1);
  assert.throws(() => env.call('getMyProgressPhoto', ani, id), /Foto tidak ditemukan/);
});

test('photos are listed newest first', () => {
  const { env, ani } = setup();
  env.ss.seed('ProgressPhotos', [
    ['ID', 'Member ID', 'Tanggal', 'Sisi', 'File ID', 'Dicatat Oleh'],
    ['PHT-1', 'PT-A', '2026-08-01', 'depan', 'F1', 'klien'],
    ['PHT-2', 'PT-A', '2026-09-01', 'samping', 'F2', 'klien'],
  ]);
  assert.deepEqual(env.call('getMyProgress', ani).photos.map(p => p.id), ['PHT-2', 'PHT-1']);
});

// ── pure helpers ─────────────────────────────────────────────────────────────

test('_addDaysIso_ handles month and year boundaries', () => {
  const env = seededEnv();
  assert.equal(env.call('_addDaysIso_', '2026-03-01', -1), '2026-02-28');
  assert.equal(env.call('_addDaysIso_', '2026-12-31', 1), '2027-01-01');
});

test('eight body measurements: saved by client and coach, ranges checked, the old 7-column sheet is extended in place', () => {
  const { env, ani } = setup();
  // An old Progress sheet from before the new columns: 7 headers and one row.
  env.ss.seed('Progress', [['ID', 'Member ID', 'Tanggal', 'Berat (kg)', 'Pinggang (cm)', 'Dicatat Oleh', 'Diubah Pada'], ['PRG-OLD', 'PT-A', daysAgo(env, 20), 75, 84, 'klien', 'x']]);
  const all = { berat: 74, pinggang: 82, lenganKanan: '32,5', lenganKiri: 32, perut: 90, pahaKanan: 55, pahaKiri: 54.5, dada: 100 };
  const res = env.call('saveMyMeasurement', ani, all);
  const e = res.entries[res.entries.length - 1];
  assert.deepEqual([e.lenganKanan, e.lenganKiri, e.perut, e.pahaKanan, e.pahaKiri, e.dada], [32.5, 32, 90, 55, 54.5, 100]);
  assert.equal(res.entries[0].dada, '');   // the old row reads blank, not NaN
  assert.equal(res.summary.dada.count, 1);
  assert.equal(res.summary.berat.change, -1);
  assert.equal(res.measures.length, 8);
  const head = Array.from(env.sheet('Progress').rows[0]);
  assert.deepEqual(head.slice(7), ['Lengan Kanan (cm)', 'Lengan Kiri (cm)', 'Perut (cm)', 'Paha Kanan (cm)', 'Paha Kiri (cm)', 'Dada (cm)']);
  env.call('saveMyMeasurement', ani, { perut: 89 });   // idempotent migration, same-day update keeps the others
  assert.equal(env.sheet('Progress').rows.length, 3);
  assert.throws(() => env.call('saveMyMeasurement', ani, { lenganKiri: 5 }), /lengan kiri harus angka antara 10 dan 80/i);
  assert.throws(() => env.call('saveMyMeasurement', ani, { dada: 'abc' }), /dada/i);
  const t = env.adminToken();
  const out = env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: daysAgo(env, 3), pahaKiri: 53 });
  assert.equal(out.entries.find(x => x.tanggal === daysAgo(env, 3)).oleh, 'coach');
});

test('the assessment saves the eight measures to Progress as coach entries, keeping body fat and hip as extras', () => {
  const { env } = setup();
  const t = env.adminToken();
  env.call('saveAssessment', t, 'PT-A', { goal: 'Kuat', weight: 70, waist: 80, lenganKanan: 31, lenganKiri: 30.5, perut: 85, pahaKanan: 54, pahaKiri: 53, dada: 98, bodyFat: 22, hip: 95 });
  const prog = env.call('getMemberProgress', t, 'PT-A');
  const e = prog.entries[0];
  assert.deepEqual([e.berat, e.pinggang, e.lenganKanan, e.lenganKiri, e.perut, e.pahaKanan, e.pahaKiri, e.dada, e.oleh], [70, 80, 31, 30.5, 85, 54, 53, 98, 'coach']);
  const a = env.call('getClientCare', t, 'PT-A').assessment;
  assert.equal(a.bodyFat, 22);
  assert.equal(a.hip, 95);
  assert.throws(() => env.call('saveAssessment', t, 'PT-A', { perut: 5 }), /perut/i);
});

test('monthly challenge: sessions completed this WIB month, target from a property (default 8, 1-31)', () => {
  const { env, ani } = setup();
  const month = today(env).slice(0, 7);
  const rows = env.sheet('Schedules').rows;
  const mk = (id, member, status, doneAt) => rows.push([id, member, 'x', '628', doneAt, doneAt, '', status, 'C-1', 'Rizky', doneAt, '']);
  mk('CH-1', 'PT-A', 'completed', month + '-01T03:00:00.000Z');
  mk('CH-2', 'PT-A', 'completed', month + '-02T03:00:00.000Z');
  mk('CH-3', 'PT-A', 'read', month + '-03T03:00:00.000Z');          // not completed
  mk('CH-4', 'PT-B', 'completed', month + '-02T03:00:00.000Z');     // another client
  mk('CH-5', 'PT-A', 'completed', '2020-01-02T03:00:00.000Z');      // another month
  const ch = JSON.parse(JSON.stringify(env.call('getMyProgress', ani).challenge));
  assert.deepEqual(ch, { target: 8, done: 2, month });
  env.props.MONTHLY_CHALLENGE_SESSIONS = '12';
  assert.equal(env.call('getMyProgress', ani).challenge.target, 12);
  env.props.MONTHLY_CHALLENGE_SESSIONS = '99';
  assert.equal(env.call('getMyProgress', ani).challenge.target, 31, 'clamped to a month');
  env.props.MONTHLY_CHALLENGE_SESSIONS = 'abc';
  assert.equal(env.call('getMyProgress', ani).challenge.target, 8, 'a bad value falls back to the default');
  assert.ok(!('challenge' in env.call('getMemberProgress', env.adminToken(), 'PT-A')), 'the owner view is unchanged');
  assert.equal(env.call('_challengeDone_', [{ memberId: 'PT-A', status: 'completed', start: '2026-09-30T20:00:00.000Z' }], 'PT-A', '2026-10'), 1, 'WIB month, not UTC');
});
