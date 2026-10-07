'use strict';
// Konten klien (Phase J3): pengumuman, tips, video dari pemilik.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const A = env => env.memberToken(KEY_A);
const day = d => new Date(Date.now() + d * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const TIPS = { tipe: 'tips', judul: 'Minum cukup', isi: 'Minum 2 liter air tiap hari.', kategori: 'Nutrisi' };

test('the owner creates, edits and deletes content; limits and types are checked in Indonesian', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { tipe: 'iklan' })), /Pilih jenis konten/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { judul: '' })), /Judul wajib/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { judul: 'x'.repeat(81) })), /Judul maksimal 80/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { isi: '' })), /Isi wajib/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { isi: 'x'.repeat(2001) })), /Isi maksimal 2000/);
  assert.throws(() => env.call('saveContent', t, { tipe: 'video', judul: 'Squat', isi: '' }), /Video butuh link/);
  assert.throws(() => env.call('saveContent', t, { tipe: 'video', judul: 'Squat', url: 'http://x.id/v' }), /Link harus diawali https/);
  assert.throws(() => env.call('saveContent', t, { tipe: 'video', judul: 'Squat', url: 'javascript:alert(1)' }), /Link harus diawali https/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { mulai: '2026-13-40' })), /Tanggal mulai tidak valid/);
  assert.throws(() => env.call('saveContent', t, Object.assign({}, TIPS, { mulai: '2026-10-10', sampai: '2026-10-01' })), /selesai harus sesudah/);
  const a = env.call('saveContent', t, Object.assign({}, TIPS, { sematkan: true }));
  assert.equal(a.updated, false);
  const v = env.call('saveContent', t, { tipe: 'video', judul: 'Teknik squat', url: 'https://youtu.be/abc' });   // a video needs no text
  assert.equal(env.sheet('Content').rows.length, 3);
  env.call('saveContent', t, Object.assign({ id: a.id }, TIPS, { judul: 'Minum lebih banyak' }));
  assert.equal(env.sheet('Content').rows.length, 3, 'same id: update, not a new row');
  assert.equal(env.sheet('Content').rows.find(r => r[0] === a.id)[2], 'Minum lebih banyak');
  assert.throws(() => env.call('saveContent', t, Object.assign({ id: 'NOPE' }, TIPS)), /Konten tidak ditemukan/);
  env.call('deleteContent', t, v.id);
  assert.equal(env.sheet('Content').rows.length, 2);
  assert.throws(() => env.call('deleteContent', t, v.id), /Konten tidak ditemukan/);
});

test('clients only get active content that is on air today; pinned first, then newest', () => {
  const env = seededEnv();
  const t = env.adminToken();
  const mk = (o, ago) => { const r = env.call('saveContent', t, Object.assign({}, TIPS, o)); env.sheet('Content').rows.find(x => x[0] === r.id)[10] = new Date(Date.now() - ago * 3600000).toISOString(); return r.id; };
  const old = mk({ judul: 'Lama' }, 48);
  const fresh = mk({ judul: 'Baru' }, 1);
  const pin = mk({ judul: 'Disematkan', tipe: 'pengumuman', sematkan: true }, 100);
  mk({ judul: 'Mati', aktif: false }, 2);
  mk({ judul: 'Nanti', mulai: day(3) }, 2);
  mk({ judul: 'Kemarin', sampai: day(-1) }, 2);
  mk({ judul: 'Hari ini', mulai: day(0), sampai: day(0) }, 3);
  const list = j(env.call('getMyContent', A(env)));
  assert.deepEqual(list.map(c => c.judul), ['Disematkan', 'Baru', 'Hari ini', 'Lama']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['dibuat', 'id', 'isi', 'judul', 'kategori', 'sematkan', 'tipe', 'url']);
  const admin = j(env.call('getContentAdmin', t));
  assert.equal(admin.length, 7);
  const st = Object.fromEntries(admin.map(c => [c.judul, c.status]));
  assert.deepEqual(st, { Lama: 'tayang', Baru: 'tayang', Disematkan: 'tayang', Mati: 'mati', Nanti: 'terjadwal', Kemarin: 'berakhir', 'Hari ini': 'tayang' });
  assert.ok(old && fresh && pin);
});

test('content is admin-write only and never carries client data', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.call('saveContent', t, TIPS);
  assert.throws(() => env.call('saveContent', A(env), TIPS), /AUTH_REQUIRED/);
  assert.throws(() => env.call('getContentAdmin', A(env)), /AUTH_REQUIRED/);
  assert.throws(() => env.call('deleteContent', A(env), 'x'), /AUTH_REQUIRED/);
  assert.throws(() => env.call('getMyContent', null), /AUTH_REQUIRED/);
  assert.ok(!JSON.stringify(env.call('getMyContent', A(env))).includes('Anggraini'));
});

test('the portal bootstrap carries only the newest on-air time, and nothing for a logged-out visitor', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.deepEqual(j(env.call('getPortalBootstrap', A(env)).info), { latestAt: '' });
  const a = env.call('saveContent', t, TIPS);
  const b = env.call('saveContent', t, Object.assign({}, TIPS, { judul: 'Nanti', mulai: day(5) }));
  env.sheet('Content').rows.find(r => r[0] === a.id)[10] = '2026-10-01T00:00:00.000Z';
  env.sheet('Content').rows.find(r => r[0] === b.id)[10] = '2026-10-07T00:00:00.000Z';
  assert.equal(env.call('getPortalBootstrap', A(env)).info.latestAt, '2026-10-01T00:00:00.000Z', 'scheduled content does not count yet');
  assert.deepEqual(j(env.call('getPortalBootstrap', null).info), { latestAt: '' });
  const wire = JSON.stringify(env.call('getPortalBootstrap', A(env)));
  assert.ok(!wire.includes('Minum 2 liter'), 'bootstrap has no content text, only the timestamp');
});
