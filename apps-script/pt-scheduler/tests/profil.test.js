'use strict';
// Fase X (T-1902): kartu atlet (MemberData AR–AU), part baru di getPortalMore, dan lonceng.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const more = (env, key) => j(env.call('getPortalMore', env.memberToken(key)));
const cell = (env, id, col) => { const r = env.sheet('MemberData').rows.find(x => x[0] === id); return r[col - 1] == null ? '' : r[col - 1]; };

test('getPortalMore carries the six new parts with sane defaults for a client who never touched the card', () => {
  const env = seededEnv();
  const m = more(env, KEY_A);
  ['profile', 'level', 'moments', 'journey', 'notif', 'todo'].forEach(k => assert.ok(m[k] && !m[k].error, k + ': ' + JSON.stringify(m[k])));
  assert.equal(m.profile.nama, 'Ani');                       // nama depan bila nama panggilan kosong
  assert.equal(m.profile.aksen, 'hitam');
  assert.equal(m.profile.gaya, 'polos');
  assert.deepEqual(m.profile.stat, ['sesi', 'minggu', 'berat']);
  assert.deepEqual(m.profile.badge, []);
  assert.equal(m.profile.statOptions.length, 8);
  assert.equal(m.level.level, 1);
  assert.ok(Array.isArray(m.moments) && Array.isArray(m.todo) && Array.isArray(m.notif.items));
  assert.ok(m.notif.items.some(x => x.id === 'ukur'), 'no weight yet: the bell asks for the first weigh-in');
  assert.ok(!m.todo.some(x => x.id === 'booking'), 'Ani has an upcoming session');
});

test('saveMyProfileCard stores to the caller only, returns the saved card and shows up in the next getPortalMore', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  const out = j(env.call('saveMyProfileCard', tok, { panggilan: 'Ani', motto: 'Kuat dulu, kurus nanti.', aksen: 'biru', gaya: 'garis', stat: ['level', 'sesi', 'latihan', 'pr'] }));
  assert.deepEqual(out, { panggilan: 'Ani', motto: 'Kuat dulu, kurus nanti.', aksen: 'biru', gaya: 'garis', stat: ['level', 'sesi', 'latihan', 'pr'], badge: [], foto: false });
  assert.equal(cell(env, 'PT-A', 44), 'Ani');
  assert.equal(cell(env, 'PT-A', 45), 'Kuat dulu, kurus nanti.');
  assert.deepEqual(JSON.parse(cell(env, 'PT-A', 46)), { a: 'biru', g: 'garis', s: ['level', 'sesi', 'latihan', 'pr'], b: [], f: false });
  assert.equal(cell(env, 'PT-B', 44), '');
  assert.equal(env.sheet('MemberData').rows[0][43], 'Nama Panggilan');
  const m = more(env, KEY_A);
  assert.equal(m.profile.motto, 'Kuat dulu, kurus nanti.');
  assert.equal(m.profile.aksen, 'biru');
  assert.deepEqual(m.profile.stat, ['level', 'sesi', 'latihan', 'pr']);
  assert.equal(more(env, KEY_B).profile.aksen, 'hitam');
});

test('a partial save keeps the other choices', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  env.call('saveMyProfileCard', tok, { aksen: 'ungu', gaya: 'aksen' });
  env.now = Date.now() + 3000;
  const out = j(env.call('saveMyProfileCard', tok, { motto: 'Pelan asal jalan' }));
  assert.equal(out.aksen, 'ungu');
  assert.equal(out.gaya, 'aksen');
  assert.equal(out.motto, 'Pelan asal jalan');
});

test('validation: unknown values, long text, formula-looking text, wrong stat count and unearned badges are refused', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  const bad = (data, re) => assert.throws(() => env.call('saveMyProfileCard', tok, data), re);
  bad({ aksen: 'merah' }, /Warna aksen/);
  bad({ gaya: 'neon' }, /Gaya kartu/);
  bad({ panggilan: 'x'.repeat(21) }, /maksimal 20/);
  bad({ motto: 'x'.repeat(61) }, /maksimal 60/);
  bad({ motto: '=HYPERLINK("http://x")' }, /tidak boleh diawali/);
  bad({ stat: ['sesi', 'minggu'] }, /Pilih 3 atau 4/);
  bad({ stat: ['sesi', 'minggu', 'gaji'] }, /Statistik tidak dikenal/);
  bad({ badge: ['sesi-100'] }, /belum diraih/);
  bad(null, /tidak valid/);
  assert.equal(cell(env, 'PT-A', 46), '', 'nothing was written');
});

test('both functions need a member token', () => {
  const env = seededEnv();
  assert.throws(() => env.call('saveMyProfileCard', 'salah', { aksen: 'biru' }));
  assert.throws(() => env.call('markNotifSeen', ''));
  assert.throws(() => env.call('saveMyProfileCard', env.adminToken(), { aksen: 'biru' }));
});

test('markNotifSeen stamps the time and clears the bell count on the next load', () => {
  const env = seededEnv();
  const tok = env.memberToken(KEY_A);
  env.call('saveContent', env.adminToken(), { tipe: 'tips', judul: 'Minum cukup', isi: 'Minum 2 liter.' });
  const before = more(env, KEY_A).notif;
  assert.ok(before.count >= 2, JSON.stringify(before));
  assert.ok(before.items.some(x => x.kind === 'info' && x.title === 'Minum cukup' && x.fresh));
  env.now = Date.now() + 60000;
  const r = j(env.call('markNotifSeen', tok));
  assert.match(r.seenAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(cell(env, 'PT-A', 47), r.seenAt);
  assert.equal(more(env, KEY_A).notif.count, 0);
});

test('the level grows with measurements and the coach bundle shows the same card and level', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-01', berat: 80, pinggang: 90 });
  env.call('saveMemberMeasurement', t, 'PT-A', { tanggal: '2026-09-20', berat: 77, pinggang: 87 });
  const m = more(env, KEY_A);
  assert.equal(m.level.poin, 4);
  assert.equal(m.level.rinci.find(x => x.k === 'ukur').n, 2);
  assert.equal(m.journey.headline, 'Turun 3 kg');
  assert.ok(m.moments.some(x => x.title === 'Berat turun 3 kg'));
  assert.equal(m.profile.statOptions.find(x => x.k === 'berat').v, '−3');
  const b = j(env.call('getClientBundle', t, 'PT-A'));
  assert.deepEqual(b.athlete.level, m.level);
  assert.equal(b.athlete.profile.nama, m.profile.nama);
});
