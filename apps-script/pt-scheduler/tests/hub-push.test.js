'use strict';
// T-2240: Web Push di hub — hubPushKey (dijaga HUB_SECRET) memasang kunci publik hub, membuat rahasia relay lokal, dan
// pushRelayPull coach hub tidak pernah mengeluarkan kunci privat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const SECRET = 'h'.repeat(40);
const PUB = 'B' + 'a'.repeat(86);

test('hubPushKey: tanpa HUB_SECRET, rahasia salah, atau kunci rusak = ditolak', () => {
  const env = seededEnv();
  assert.throws(() => env.call('hubPushKey', SECRET, PUB, true), /Permintaan tidak valid/, 'produksi tanpa HUB_SECRET');
  env.props.HUB_SECRET = SECRET;
  assert.throws(() => env.call('hubPushKey', 'x'.repeat(40), PUB, true), /Permintaan tidak valid/);
  assert.throws(() => env.call('hubPushKey', SECRET, 'pendek', true), /Kunci publik tidak valid/);
  assert.throws(() => env.call('hubPushKey', SECRET, 'A' + 'a'.repeat(86), true), /Kunci publik tidak valid/);
  assert.equal(env.props.PUSH_VAPID_PUBLIC, undefined, 'nothing stored on a refusal');
});

test('hubPushKey: menyimpan kunci, membuat rahasia relay sekali, mati kecuali on === true', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  env.props.PUSH_VAPID_PRIVATE = 'K'.repeat(43);   // sisa lama: dibuang
  const off = env.call('hubPushKey', SECRET, PUB, 'true');
  assert.equal(off.on, false, 'a string is not true (rule 5)');
  assert.equal(env.props.PUSH_ENABLED, 'false');
  assert.equal(env.props.PUSH_VAPID_PUBLIC, PUB);
  assert.equal(env.props.PUSH_VAPID_PRIVATE, undefined);
  assert.ok(off.relay.length >= 24);
  assert.equal(env.props.PUSH_RELAY_SECRET, off.relay);
  assert.deepEqual(env.call('getPortalBootstrap', env.memberToken(require('./fixtures').KEY_A)).pushKey, '', 'card hidden while off');
  const on = env.call('hubPushKey', SECRET, PUB, true);
  assert.equal(on.on, true);
  assert.equal(on.relay, off.relay, 'relay secret kept');
  assert.equal(on.subs, 0);
  assert.deepEqual(Object.keys(on).sort(), ['on', 'relay', 'subs']);
  assert.equal(env.call('getAdminPushStatus', env.adminToken(), '').key, PUB, 'coach card gets the hub key');
});

test('pushRelayPull di coach hub: tidak pernah ada kunci privat', () => {
  const env = seededEnv();
  env.props.HUB_SECRET = SECRET;
  const r = env.call('hubPushKey', SECRET, PUB, true);
  env.props.PUSH_VAPID_PRIVATE = 'K'.repeat(43);   // walau ada yang menaruhnya lagi
  const pulled = env.call('pushRelayPull', r.relay);
  assert.equal(pulled.privateKey, '');
  assert.equal(pulled.key, PUB);
  assert.ok(!JSON.stringify(pulled).includes('K'.repeat(43)));
  assert.ok(!JSON.stringify(pulled).includes(SECRET), 'HUB_SECRET never in an answer');
});
