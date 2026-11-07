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
  assert.equal(reads.n, 1, 'only the auth read on a hit');
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
