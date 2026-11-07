'use strict';
// Fase W1 (T-1802/T-1803): hasil jadi di CacheService + MemberData dibaca sekali per bundle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));
const countReads = (env, name) => {
  const sh = env.sheet(name), orig = sh.getDataRange.bind(sh), box = { n: 0 };
  sh.getDataRange = () => { box.n++; return orig(); };
  return box;
};

test('getPortalMore: second call is a cache hit (far fewer sheet reads), same data', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  const a = j(env.call('getPortalMore', t));
  assert.ok(!a.ms.hit);
  const reads = countReads(env, 'MemberData');
  const b = j(env.call('getPortalMore', t));
  assert.equal(b.ms.hit, true);
  assert.equal(reads.n, 0, 'no MemberData read on a hit: the validated row comes from the auth cache');
  delete a.ms; delete b.ms; delete a.coachStatus; delete b.coachStatus;
  assert.deepEqual(b, a);
});

test('a client write bumps the version, so the next call recomputes', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  env.call('getPortalMore', t);
  env.call('logMyWorkout', t, '', [{ gerakan: 'Squat', sets: [{ berat: 40, rep: 8 }] }], { cid: 'wl-w1' });
  const after = j(env.call('getPortalMore', t));
  assert.ok(!after.ms.hit, 'miss after write');
  assert.ok(JSON.stringify(after.workout).includes('Squat'), 'new set is visible');
});

test('cache is per client', () => {
  const env = seededEnv();
  const a = j(env.call('getPortalMore', env.memberToken(KEY_A)));
  const b = j(env.call('getPortalMore', env.memberToken(KEY_B)));
  assert.ok(!b.ms.hit);
  assert.notEqual(a.ver, b.ver);
});

test('PAYLOAD_CACHE=false turns it off', () => {
  const env = seededEnv();
  env.props.PAYLOAD_CACHE = 'false';
  const t = env.memberToken(KEY_A);
  env.call('getPortalMore', t);
  assert.ok(!j(env.call('getPortalMore', t)).ms.hit);
});

test('getClientBundle caches too, and a write to the client busts it', () => {
  const env = seededEnv();
  const adm = env.adminToken();
  const id = j(env.call('getMembers', adm))[0].id;
  env.call('getClientBundle', adm, id);
  assert.equal(j(env.call('getClientBundle', adm, id)).ms.hit, true);
  env.call('saveClientNutrition', adm, id, { tinggi: 170, jenisKelamin: 'L' });
  assert.ok(!j(env.call('getClientBundle', adm, id)).ms.hit);
});

test('MemberData is read once per getPortalMore miss', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  const reads = countReads(env, 'MemberData');
  env.call('getPortalMore', t);
  assert.equal(reads.n, 1);
});

test('MemberData is read once per getAdminMore and once per getClientBundle miss', () => {
  const env = seededEnv();
  const adm = env.adminToken();
  const reads = countReads(env, 'MemberData');
  env.call('getAdminMore', adm);
  assert.equal(reads.n, 1, 'getAdminMore');
  const id = j(env.call('getMembers', adm))[0].id;
  reads.n = 0;
  env.call('getClientBundle', adm, id);
  assert.equal(reads.n, 1, 'getClientBundle');
});

test('getAdminMore is cached; any client write, slot change or fresh=true recomputes; memberVers stay live', () => {
  const env = seededEnv();
  const adm = env.adminToken();
  const a = j(env.call('getAdminMore', adm));
  assert.ok(!a.ms.hit);
  const b = j(env.call('getAdminMore', adm));
  assert.equal(b.ms.hit, true);
  assert.deepEqual(Object.keys(b.memberVers).sort(), Object.keys(a.memberVers).sort());
  assert.ok(!j(env.call('getAdminMore', adm, undefined, undefined, true)).ms.hit, 'fresh bypasses the read');
  assert.equal(j(env.call('getAdminMore', adm)).ms.hit, true, 'fresh wrote the result back');
  env.call('logMyWorkout', env.memberToken(KEY_A), '', [{ gerakan: 'Squat', sets: [{ berat: 40, rep: 8 }] }], { cid: 'wl-adm' });
  assert.ok(!j(env.call('getAdminMore', adm)).ms.hit, 'a client write bumps the admin version');
});

test('getPortalBootstrap reads Schedules and MemberData once (coach status and slots share the bundle memo)', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  env.call('getPortalBootstrap', t);   // creates sheets, warms the cache
  const sched = countReads(env, 'Schedules'), mem = countReads(env, 'MemberData');
  const out = j(env.call('getPortalBootstrap', t));
  assert.ok(out.profile && out.ms && typeof out.ms.total === 'number');
  assert.ok(sched.n <= 1, 'Schedules reads: ' + sched.n);
  assert.equal(mem.n, 0, 'MemberData reads (auth cache is warm)');
});

test('read-only auth cache: deleting the client or tampering with the token ends access at once', () => {
  const env = seededEnv();
  const t = env.memberToken(KEY_A);
  const id = j(env.call('getPortalBootstrap', t)).profile.id;
  env.call('getPortalMore', t);
  assert.equal(j(env.call('getPortalMore', t)).ms.hit, true);
  const bad = t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => env.call('getPortalMore', bad), /Sesi berakhir/);
  env.call('deleteMember', env.adminToken(), id);
  assert.throws(() => env.call('getPortalMore', t), /Sesi berakhir/);
  assert.equal(j(env.call('getPortalBootstrap', t)).profile, null);
});

test('read-only auth cache: a new photo shows at once; another client never reads a cached row', () => {
  const env = seededEnv();
  const ta = env.memberToken(KEY_A), tb = env.memberToken(KEY_B);
  const a1 = j(env.call('getPortalBootstrap', ta)), b1 = j(env.call('getPortalBootstrap', tb));
  assert.notEqual(a1.profile.id, b1.profile.id);
  env.call('getPortalBootstrap', ta);   // warm
  const url = 'https://lh3.googleusercontent.com/d/abc123';
  env.call('updateMemberPhoto', ta, url);
  assert.equal(j(env.call('getPortalBootstrap', ta)).profile.photo, url);
  assert.equal(j(env.call('getPortalBootstrap', tb)).profile.id, b1.profile.id);
});

test('AUTH cache off switch (PAYLOAD_CACHE=false) reads MemberData every time', () => {
  const env = seededEnv();
  env.props.PAYLOAD_CACHE = 'false';
  const t = env.memberToken(KEY_A);
  env.call('getPortalBootstrap', t);
  const mem = countReads(env, 'MemberData');
  env.call('getPortalBootstrap', t);
  assert.equal(mem.n, 1);
});
