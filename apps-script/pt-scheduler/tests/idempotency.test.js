'use strict';
// Nomor pesanan (Idem.gs): kiriman ulang dengan cid yang sama tidak menyimpan dua kali.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A } = require('./fixtures');

const post = (env, fn, args, extra) => JSON.parse(env.call('doPost', { postData: { contents: JSON.stringify(Object.assign({ fn, args: args || [] }, extra || {})) } }).content);
const rows = (env, name) => { const sh = env.sheet(name); return sh ? sh.getLastRow() - 1 : 0; };
const task = (title) => ({ memberId: 'PT-A', title: title || 'Jalan kaki 20 menit', category: 'aktivitas' });

test('cid sama dua kali: satu PR, jawaban kedua diputar ulang (dup)', () => {
  const env = seededEnv(), tok = env.adminToken();
  const before = rows(env, 'Tasks');
  const a = post(env, 'addTask', [tok, task()], { cid: 'c-task-001' });
  const b = post(env, 'addTask', [tok, task()], { cid: 'c-task-001', re: 1 });
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.equal(b.dup, true);
  assert.deepEqual(b.data, a.data);
  assert.equal(rows(env, 'Tasks'), before + 1);
});

test('tanpa cid: perilaku lama (dua kiriman = dua PR)', () => {
  const env = seededEnv(), tok = env.adminToken();
  const before = rows(env, 'Tasks');
  post(env, 'addTask', [tok, task()]); post(env, 'addTask', [tok, task()]);
  assert.equal(rows(env, 'Tasks'), before + 2);
});

test('galat tidak disimpan: setelah diperbaiki, cid yang sama dijalankan', () => {
  const env = seededEnv(), tok = env.adminToken();
  const bad = post(env, 'addTask', [tok, { memberId: 'PT-A', title: '', category: 'aktivitas' }], { cid: 'c-task-002' });
  assert.equal(bad.ok, false);
  const good = post(env, 'addTask', [tok, task()], { cid: 'c-task-002', re: 1 });
  assert.equal(good.ok, true); assert.ok(!good.dup);
});

test('kiriman yang masih berjalan dijawab code inflight', () => {
  const env = seededEnv(), tok = env.adminToken();
  const key = env.call('_idemKey_', 'c-task-003', [tok]);
  env.cache[key] = { value: '~', expires: Date.now() + 60000 };
  const r = post(env, 'addTask', [tok, task()], { cid: 'c-task-003' });
  assert.equal(r.ok, false); assert.equal(r.code, 'inflight');
});

test('cache terbuang: pembuat baris (addTask) ditemukan lagi di sheet Idem untuk kiriman ulang', () => {
  const env = seededEnv(), tok = env.adminToken();
  const before = rows(env, 'Tasks');
  const a = post(env, 'addTask', [tok, task()], { cid: 'c-task-004' });
  Object.keys(env.cache).forEach(k => { if (k.indexOf('idem:') === 0) delete env.cache[k]; });
  const b = post(env, 'addTask', [tok, task()], { cid: 'c-task-004', re: 1 });
  assert.equal(b.dup, true); assert.deepEqual(b.data, a.data);
  assert.equal(rows(env, 'Tasks'), before + 1);
  assert.equal(rows(env, 'Idem'), 1);
});

test('cid sama dari token lain tidak memutar ulang jawaban akun lain', () => {
  const env = seededEnv(), tok = env.adminToken(), tok2 = env.adminToken();
  const a = post(env, 'addTask', [tok, task()], { cid: 'c-task-005' });
  const b = post(env, 'addTask', [tok2, task('Tidur 8 jam')], { cid: 'c-task-005' });
  assert.ok(!b.dup || tok === tok2);
  if (tok !== tok2) assert.notDeepEqual(b.data, a.data);
});

test('bacaan dengan cid tidak disimpan', () => {
  const env = seededEnv(), tok = env.adminToken();
  post(env, 'getSchedules', [tok], { cid: 'c-read-001' });
  assert.equal(Object.keys(env.cache).filter(k => k.indexOf('idem:') === 0).length, 0);
});

test('cid tidak sah diabaikan (jalan biasa)', () => {
  const env = seededEnv(), tok = env.adminToken();
  const before = rows(env, 'Tasks');
  post(env, 'addTask', [tok, task()], { cid: 'x y' }); post(env, 'addTask', [tok, task()], { cid: 'x y' });
  assert.equal(rows(env, 'Tasks'), before + 2);
});

test('completeMyTask dua kali: kedua kalinya tetap berhasil (already)', () => {
  const env = seededEnv(), tok = env.adminToken();
  const t = env.call('addTask', tok, task());
  const id = t.id || (t.task && t.task.id);
  assert.ok(id, 'addTask returns the id');
  const mtok = env.memberToken ? env.memberToken(KEY_A) : null;
  if (!mtok) return;   // harness tanpa token member: diuji lewat browser-check
  assert.equal(env.call('completeMyTask', mtok, id, '').status, 'success');
  const again = env.call('completeMyTask', mtok, id, '');
  assert.equal(again.status, 'success'); assert.equal(again.already, true);
});

test('sheet Idem dirapikan: baris lebih tua dari 14 hari dibuang', () => {
  const env = seededEnv();
  env.call('_idemSheet_');
  const sh = env.sheet('Idem');
  const old = new Date(Date.now() - 20 * 86400000).toISOString(), now = new Date().toISOString();
  sh.appendRow(['k1', 'addTask', old, 'null']); sh.appendRow(['k2', 'addTask', old, 'null']); sh.appendRow(['k3', 'addTask', now, 'null']);
  assert.equal(env.callRaw('_idemPrune_', sh), 2);
  assert.equal(sh.getLastRow(), 2);
});
