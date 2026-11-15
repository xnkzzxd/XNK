'use strict';
// Fase W0 (T-1800): waktu server per bagian di bundle besar. Hanya angka; mati dengan SPEED_TRACE=false.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('getPortalMore, getAdminMore and getClientBundle report ms per part (numbers only)', () => {
  const env = seededEnv();
  const more = j(env.call('getPortalMore', env.memberToken(KEY_A)));
  assert.ok(more.ms && typeof more.ms.total === 'number');
  for (const k of ['auth', 'progress', 'workout', 'nutrition', 'insight']) assert.equal(typeof more.ms.parts[k], 'number', k);
  const adm = j(env.call('getAdminMore', env.adminToken()));
  assert.ok(adm.ms && typeof adm.ms.total === 'number');
  for (const k of ['auth', 'revenue', 'signals', 'hub']) assert.equal(typeof adm.ms.parts[k], 'number', k);
  const id = j(env.call('getMembers', env.adminToken()))[0].id;
  const cb = j(env.call('getClientBundle', env.adminToken(), id));
  assert.ok(cb.ms && typeof cb.ms.parts.care === 'number');
});

test('SPEED_TRACE=false removes the ms field and nothing else changes', () => {
  const on = seededEnv();
  const off = seededEnv();
  off.props.SPEED_TRACE = 'false';
  const a = j(on.call('getPortalMore', on.memberToken(KEY_A)));
  const b = j(off.call('getPortalMore', off.memberToken(KEY_A)));
  assert.equal(b.ms, undefined);
  delete a.ms; delete a.at; delete b.at; delete a.ver; delete b.ver;
  assert.deepEqual(a, b);
});

test('doPost logs one "speed rpc <fn>" line with run and json times (W6b, T-1825)', () => {
  const env = seededEnv();
  const lines = [], orig = console.log;
  console.log = (...a) => { lines.push(a.join(' ')); };
  try {
    env.call('doPost', { postData: { contents: JSON.stringify({ fn: 'getPriceListPublic', args: [] }) } });
  } finally { console.log = orig; }
  const line = lines.find(l => l.startsWith('speed rpc getPriceListPublic '));
  assert.ok(line, 'trace line present');
  const o = JSON.parse(line.slice('speed rpc getPriceListPublic '.length));
  assert.equal(typeof o.parts.run, 'number');
  assert.equal(typeof o.parts.json, 'number');
});
