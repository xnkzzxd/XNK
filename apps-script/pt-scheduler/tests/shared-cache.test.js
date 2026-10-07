'use strict';
// Fase K3: data bersama di-cache sebentar dan dibuang oleh penulisnya.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const j = x => JSON.parse(JSON.stringify(x));

test('public price list: second call reads no sheet, same answer', () => {
  const env = seededEnv();
  const a = j(env.call('getPriceListPublic'));
  env.resetReads();
  const b = j(env.call('getPriceListPublic'));
  assert.deepEqual(a, b);
  assert.equal(env.reads().total, 0);
});

test('public coaches and content are cached too', () => {
  const env = seededEnv(), t = env.adminToken();
  env.call('saveContent', t, { tipe: 'tips', judul: 'Minum', isi: 'Air.' });
  const c1 = j(env.call('getCoaches')), k1 = j(env.call('getMyContent', env.memberToken(require('./fixtures').KEY_A)));
  env.resetReads();
  assert.deepEqual(j(env.call('getCoaches')), c1);
  assert.deepEqual(j(env.call('getMyContent', env.memberToken(require('./fixtures').KEY_A))).length, k1.length);
  assert.ok(env.reads().bySheet && !env.reads().bySheet.Content, 'Content sheet not re-read');
});

test('writers bust the cache', () => {
  const env = seededEnv(), t = env.adminToken();
  const KEY_A = require('./fixtures').KEY_A, tok = env.memberToken(KEY_A);
  assert.equal(env.call('getMyContent', tok).length, 0);
  env.call('saveContent', t, { tipe: 'tips', judul: 'Baru', isi: 'Isi.' });
  assert.equal(env.call('getMyContent', tok).length, 1);
  const id = env.call('getMyContent', tok)[0].id;
  env.call('deleteContent', t, id);
  assert.equal(env.call('getMyContent', tok).length, 0);
  const before = j(env.call('getPriceListPublic'));
  const pk = before.packages[0];
  env.call('setPackageActive', t, pk.id, false);
  const after = j(env.call('getPriceListPublic'));
  assert.equal(after.packages.length, before.packages.length - 1);
});

test('a failing CacheService still answers correctly', () => {
  const env = seededEnv();
  const good = j(env.call('getPriceListPublic'));
  env.context.CacheService = { getScriptCache() { throw new Error('boom'); } };
  assert.deepEqual(j(env.call('getPriceListPublic')), good);
});
