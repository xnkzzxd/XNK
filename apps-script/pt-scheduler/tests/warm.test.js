'use strict';
// Fase W6a (T-1820…T-1824): runWarmTick mengisi cache hasil jadi di latar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const wibHour = () => new Date(Date.now() + 7 * 3600000).getUTCHours();
const daytime = () => wibHour() >= 5 && wibHour() < 22;

test('_warmPick_: near sessions first (closest first), then last 7 days (newest first), each client once', () => {
  const env = seededEnv();
  const now = Date.parse('2026-11-07T03:00:00Z');
  const at = h => new Date(now + h * 3600000).toISOString();
  const list = [
    { memberId: 'old', start: at(-24 * 10) },      // terlalu lama
    { memberId: 'r1', start: at(-24 * 2) },
    { memberId: 'r2', start: at(-24 * 5) },
    { memberId: 's2', start: at(30) },
    { memberId: 's1', start: at(2) },
    { memberId: 's1', start: at(-24 * 3) },        // sudah di daftar dekat
    { memberId: 'far', start: at(24 * 5) },        // terlalu jauh
  ];
  assert.deepEqual(env.call('_warmPick_', list, now, 25), ['s1', 's2', 'r1', 'r2']);
  assert.deepEqual(env.call('_warmPick_', list, now, 2), ['s1', 's2']);
});

test('runWarmTick is off by default and does nothing', () => {
  const env = seededEnv();
  assert.equal(env.call('runWarmTick').skipped, 'nonaktif');
});

test('runWarmTick fills the caches with the same data a normal call returns, and respects the gap', () => {
  const env = seededEnv();
  env.props.WARM_ENABLED = 'true';
  const r = env.call('runWarmTick');
  if (!daytime()) { assert.equal(r.skipped, 'malam'); return; }
  assert.equal(r.skipped, '');
  assert.equal(r.admin, 'built');
  const adm = env.call('getAdminMore', env.adminToken());
  assert.equal(adm.ms.hit, true, 'panel opens from the warmed cache');
  assert.equal(env.call('runWarmTick').skipped, 'jeda', 'second tick within 10 minutes is skipped');
});

test('a warmed client bundle is a hit and equals a fresh build', () => {
  const env = seededEnv();
  env.props.WARM_ENABLED = 'true';
  const t = env.memberToken(KEY_A);
  const ids = env.call('_warmPick_', env.call('_readSchedulesAll_'), Date.now(), 25);
  if (!daytime() || !ids.length) return;
  env.call('runWarmTick');
  const hit = JSON.parse(JSON.stringify(env.call('getClientBundle', env.adminToken(), ids[0])));
  assert.equal(hit.ms.hit, true);
  env.props.PAYLOAD_CACHE = 'false';
  const fresh = JSON.parse(JSON.stringify(env.call('getClientBundle', env.adminToken(), ids[0])));
  delete hit.ms; delete fresh.ms;
  assert.deepEqual(hit, fresh);
  assert.ok(t);
});

test('the settings switch installs and removes the trigger', () => {
  const env = seededEnv();
  const adm = env.adminToken();
  const s = env.call('updateAppSettings', adm, { warmEnabled: true });
  assert.equal(s.warmEnabled, true);
  assert.equal(env.triggers.filter(x => x.getHandlerFunction() === 'runWarmTick').length, 1);
  env.call('updateAppSettings', adm, { warmEnabled: true });
  assert.equal(env.triggers.filter(x => x.getHandlerFunction() === 'runWarmTick').length, 1, 'no duplicates');
  const off = env.call('updateAppSettings', adm, { warmEnabled: false });
  assert.equal(off.warmEnabled, false);
  assert.equal(env.triggers.filter(x => x.getHandlerFunction() === 'runWarmTick').length, 0);
  assert.equal(env.props.WARM_ENABLED, undefined);
});
