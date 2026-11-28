'use strict';
// T-2251: mode baca saja (langganan coach di hub). hubReadonly dijaga HUB_SECRET; produksi (tanpa HUB_SECRET) tidak
// pernah bisa baca saja. Saat menyala, satu gerbang di doPost menolak fungsi tulis; baca dan login tetap jalan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('./api-lists');
const { seededEnv, KEY_A } = require('./fixtures');

const SECRET = 'h'.repeat(40);
const post = (env, fn, args) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify({ fn, args: args || [] }) } }).content);

test('baca saja: setiap fungsi doPost diklasifikasi tepat sekali (WRITE atau READ_OK)', () => {
  const both = [...L.WRITE, ...L.READ_OK];
  assert.equal(new Set(both).size, both.length, 'a function is in WRITE and READ_OK, or listed twice');
  assert.deepEqual([...both].sort(), [...L.API_FUNCTIONS].sort(), 'WRITE + READ_OK must equal the doPost set');
  // Penjaga kasar: nama yang jelas menulis tidak boleh lolos ke READ_OK tanpa alasan di daftar ini.
  const allowedWriteish = ['changeAdminPin', 'saveAdminPush', 'removeAdminPush', 'setAdminPushPrefs', 'saveMyPush', 'removeMyPush', 'setMyPushPrefs',
    'markSchedulesAsRead', 'markBadgesSeen', 'markGuideSeen', 'markNotifSeen', 'installReminderTrigger', 'sendTelegramTest', 'sendReminderTest',
    'pushRelayAck', 'hubPushKey', 'hubSiteUrl', 'hubReadonly', 'hubPlan'];
  for (const n of L.READ_OK) {
    if (/^(save|delete|add|update|set|remove|upload|log|submit|create|join|leave|complete|decide|archive|restore|apply|copy|swap|accept|regenerate|reorder|mark|snooze|request|rate|sync|send|install|change|assign|push|hub)/.test(n) && !/^(get|hubStatus|hubExport|pushRelayPull)/.test(n)) {
      assert.ok(allowedWriteish.includes(n), n + ' looks like a write: put it in WRITE (or in allowedWriteish with a reason)');
    }
  }
  for (const n of ['adminLogin', 'memberLoginByPhone', 'memberLoginByKey', 'getAdminBootstrap', 'getPortalBootstrap', 'getPortalMore', 'getClientBundle', 'hubReadonly', 'hubStatus', 'getServerInfo']) {
    assert.ok(L.READ_OK.includes(n), n + ' must keep working in read-only mode');
  }
});

test('baca saja: Api.gs memuat _apiWrites_ yang sama dengan WRITE', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Api.gs'), 'utf8');
  const env = seededEnv();
  assert.deepEqual(Object.keys(env.call('_apiWrites_')).sort(), [...L.WRITE].sort());
  assert.match(src, /function _apiWrites_\(\)/);
});

test('baca saja: produksi tanpa HUB_SECRET — hubReadonly selalu menolak, XNK_READONLY yang diisi tangan tidak berlaku', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubReadonly', SECRET, true, 'x'), /Permintaan tidak valid/);
  assert.equal(env.props.XNK_READONLY, undefined);
  assert.equal(post(env, 'hubReadonly', [SECRET, true]).ok, false);
  env.props.XNK_READONLY = 'true';   // seseorang mengisi tangan di produksi
  assert.equal(env.call('_readonlyOn_'), false);
  const tok = env.adminToken();
  assert.equal(env.call('getAdminBootstrap', tok).readonly, null);
  assert.equal(env.call('getPortalBootstrap', env.memberToken(KEY_A)).readonly, false);
  const r = post(env, 'saveCoachTargets', [tok, {}]);
  assert.notEqual(r.code, 'readonly', 'production writes are never blocked by read-only');
  env.props.HUB_SECRET = 'pendek';
  assert.equal(env.call('_readonlyOn_'), false, 'a secret under 32 chars never counts');
});

test('baca saja: coach hub tanpa keadaan dari Pusat (bawaan) = tidak pernah baca saja', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  assert.equal(env.call('_readonlyOn_'), false);
  for (const fn of L.WRITE) assert.doesNotThrow(() => env.call('_readonlyGate_', fn), fn);
  assert.equal(env.call('hubStatus', SECRET).readonly, false);
});

test('baca saja: hubReadonly dijaga rahasia; menyala = tulis ditolak sopan lewat doPost, baca/login tetap jalan; mati = normal lagi', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  assert.throws(() => env.call('hubReadonly', 'x'.repeat(40), true), /Permintaan tidak valid/);
  assert.equal(env.call('hubReadonly', SECRET, 'true').on, false, 'only true (boolean) switches it on');
  const on = env.call('hubReadonly', SECRET, true, 'Langganan lewat jatuh tempo 2026-11-01.\n<b>');
  assert.equal(on.on, true);
  assert.equal(on.changed, true);
  assert.equal(on.note, 'Langganan lewat jatuh tempo 2026-11-01. <b>');
  assert.equal(env.call('hubReadonly', SECRET, true, 'Langganan lewat jatuh tempo 2026-11-01.\n<b>').changed, false);
  assert.equal(env.call('hubStatus', SECRET).readonly, true);

  const tok = env.adminToken(), mtok = env.memberToken(KEY_A);
  const w = post(env, 'addTask', [tok, {}]);
  assert.equal(w.ok, false);
  assert.equal(w.code, 'readonly');
  assert.match(w.error, /^Mode baca saja: data bisa dilihat, tetapi belum bisa diubah untuk sementara\.$/);
  assert.equal(post(env, 'logMyFood', [mtok, {}]).code, 'readonly');
  assert.equal(post(env, 'registerNewClient', [{}]).code, 'readonly');
  // Baca, login, bootstrap: tetap jalan.
  assert.equal(post(env, 'getAdminBootstrap', [tok]).ok, true);
  assert.deepEqual(post(env, 'getAdminBootstrap', [tok]).data.readonly, { on: true, note: 'Langganan lewat jatuh tempo 2026-11-01. <b>' });
  const pb = post(env, 'getPortalBootstrap', [mtok]);
  assert.equal(pb.ok, true);
  assert.equal(pb.data.readonly, true);
  assert.ok(!JSON.stringify(pb.data).includes('jatuh tempo'), 'the owner note never reaches clients');
  assert.equal(post(env, 'getPortalMore', [mtok]).ok, true);
  assert.equal(post(env, 'getServerInfo', []).ok, true);
  assert.notEqual(post(env, 'adminLogin', ['000000']).code, 'readonly');
  // Mati lagi.
  const off = env.call('hubReadonly', SECRET, false, 'diabaikan');
  assert.deepEqual([off.on, off.note], [false, '']);
  assert.equal(env.props.XNK_READONLY, undefined);
  assert.equal(env.props.XNK_READONLY_NOTE, undefined);
  assert.notEqual(post(env, 'addTask', [tok, {}]).code, 'readonly');
  assert.equal(env.call('getAdminBootstrap', tok).readonly, null);
});

test('coach keluar (T-2252): hubReadonly(…, left) menandai keluar hanya bersama baca saja; runWarmTick dilewati; produksi tidak pernah', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.props.WARM_ENABLED = 'true';
  const r = env.call('hubReadonly', SECRET, true, 'Coach ini sudah tidak aktif di XNK.', true);
  assert.deepEqual([r.on, r.left, r.changed], [true, true, true]);
  assert.equal(env.props.XNK_LEFT, 'true');
  assert.equal(env.call('hubStatus', SECRET).left, true);
  assert.equal(env.call('runWarmTick').skipped, 'keluar');
  assert.equal(post(env, 'addTask', [env.adminToken(), {}]).code, 'readonly', 'still read-only');
  assert.equal(env.call('hubReadonly', SECRET, true, 'Coach ini sudah tidak aktif di XNK.', true).changed, false);
  // Tanpa tanda keluar (mis. cek harian Library lama / langganan biasa) = tanda keluar hilang, baca saja tetap.
  const s = env.call('hubReadonly', SECRET, true, 'Coach ini sudah tidak aktif di XNK.');
  assert.deepEqual([s.on, s.left, s.changed], [true, false, true]);
  // left tanpa baca saja tidak berlaku.
  const off = env.call('hubReadonly', SECRET, false, '', true);
  assert.deepEqual([off.on, off.left], [false, false]);
  assert.equal(env.props.XNK_LEFT, undefined);
  assert.notEqual(env.call('runWarmTick').skipped, 'keluar');
  // Produksi (tanpa HUB_SECRET): XNK_LEFT yang diisi tangan tidak berlaku.
  const prod = seededEnv();
  prod.props.XNK_LEFT = 'true';
  prod.props.WARM_ENABLED = 'true';
  assert.equal(prod.call('_hubLeft_'), false);
  assert.notEqual(prod.call('runWarmTick').skipped, 'keluar');
});
