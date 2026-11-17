'use strict';
// Kode penghubung (XNK Template): lengkap, tanpa logika aplikasi, dan dua spreadsheet yang memasang Library yang
// sama tetap terpisah dari ujung ke ujung (pembungkus → XNK.run → Library → layanan milik spreadsheet itu).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const bridge = require('../tools/build-bridge');
const { makeCtx, createLibEnv } = require('./lib-harness');

// Fungsi lokal yang boleh ada di penghubung, dan kenapa aman dipanggil dari halaman web.
const LOCAL_OK = {
  doGet: 'meneruskan ke Library', doPost: 'meneruskan ke Library', onOpen: 'butuh UI spreadsheet',
  showSetup: 'butuh UI spreadsheet', initializeTemplate: 'Library: requireOwner_', checkLibraryConnection: 'hanya versi',
  getLibraryVersion: 'hanya versi', setupTriggers: 'Library: requireOwner_', validateConfiguration: 'Library: requireOwner_',
  setupGetState: 'Library: requireOwner_', setupInit: 'Library: requireOwner_', setupSave: 'Library: requireOwner_',
  setupCheck: 'Library: requireOwner_',
};

test('setiap fungsi API dan trigger punya pembungkus; fungsi lokal hanya yang dikenal', () => {
  const r = bridge.build({ libId: 'abc', libVersion: '3' });
  const api = bridge.topFunctions(r.files['PenghubungApi.gs']);
  assert.deepEqual(api.slice().sort(), bridge.apiNames().slice().sort());
  for (const n of ['runReminderTick', 'runWarmTick', 'sendDailyReminderEmail', 'sendWeeklyReportEmail', 'adminLogin', 'getPortalBootstrap']) {
    assert.ok(api.includes(n), n);
  }
  const local = bridge.topFunctions(r.files['Penghubung.gs']).filter(n => !n.endsWith('_'));
  assert.deepEqual(local.filter(n => !LOCAL_OK[n]), [], 'fungsi lokal baru harus dijelaskan di LOCAL_OK');
  const man = JSON.parse(r.files['appsscript.json']);
  assert.deepEqual(man.dependencies.libraries, [{ userSymbol: 'XNK', libraryId: 'abc', version: '3' }]);
  assert.ok(man.oauthScopes.includes('https://www.googleapis.com/auth/script.container.ui'));
  assert.equal(man.webapp.access, 'ANYONE_ANONYMOUS');
});

test('penghubung tidak berisi logika aplikasi', () => {
  const r = bridge.build({ libId: 'abc', libVersion: '3' });
  const code = r.files['Penghubung.gs'] + r.files['PenghubungApi.gs'];
  for (const re of [/getSheetByName/, /getRange/, /setProperty/, /getProperty\(/, /UrlFetchApp/, /MailApp/]) {
    assert.ok(!re.test(code), 'penghubung tidak boleh ' + re);
  }
  assert.throws(() => bridge.build({ libId: 'a b' }), /lib-id/);
  assert.throws(() => bridge.build({ libId: 'abc', libVersion: 'x' }), /angka/);
  assert.throws(() => bridge.build({ libId: 'abc', hubUrl: 'http://xnk.web.id' }), /alamat hub/);
  assert.throws(() => bridge.build({ libId: 'abc', hubUrl: 'https://x.y/z' }), /alamat hub/);
});

/** Satu spreadsheet dengan kode penghubung di vm sendiri; XNK = fungsi publik Library (tanpa akhiran _). */
function loadBridge(env, id) {
  const { ctx, store, ss } = makeCtx(id);
  const r = bridge.build({ libId: 'abc', libVersion: '1' });
  const XNK = {};
  for (const k of ['run', 'handleGet', 'handlePost', 'getLibraryVersion', 'healthCheck', 'initInstance', 'saveSetup',
    'installTriggers', 'removeTriggers', 'setupState']) XNK[k] = env.context[k];
  const sandbox = {
    XNK, console,
    PropertiesService: { getScriptProperties: () => ctx.props },
    CacheService: { getScriptCache: () => ctx.cache },
    LockService: { getScriptLock: () => ctx.lock },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ScriptApp: ctx.scriptApp,
  };
  vm.createContext(sandbox);
  vm.runInContext(r.files['Penghubung.gs'], sandbox, { filename: 'Penghubung.gs' });
  vm.runInContext(r.files['PenghubungApi.gs'], sandbox, { filename: 'PenghubungApi.gs' });
  const call = (name, ...args) => {
    const out = sandbox[name](...JSON.parse(JSON.stringify(args)));
    return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
  };
  return { sandbox, store, ss, call };
}

test('dua spreadsheet dengan penghubung, satu Library: setup, login, halaman web dan trigger terpisah', () => {
  const env = createLibEnv();
  const A = loadBridge(env, 'SS_A'), B = loadBridge(env, 'SS_B');
  A.call('initializeTemplate');
  B.call('initializeTemplate');
  A.call('initializeTemplate');   // diulang: tanpa duplikat
  assert.equal(A.store.triggers.length, 1);
  A.call('setupSave', { brand: 'Gym Andi', pin: '111111' });
  B.call('setupSave', { brand: 'Studio Bunga', pin: '222222' });

  const tokA = A.call('adminLogin', '111111').token;
  assert.ok(tokA);
  assert.throws(() => B.call('adminLogin', '111111'), /PIN salah/);
  assert.throws(() => B.call('getAdminBootstrap', tokA), /AUTH_REQUIRED/);

  const post = (X, fn, args) => JSON.parse(X.sandbox.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).content);
  assert.equal(post(A, 'adminLogin', ['111111']).ok, true);
  assert.equal(post(B, 'adminLogin', ['111111']).error, 'PIN salah.');
  assert.ok(A.sandbox.doGet({ parameter: {} }).getContent().includes('<'));

  // Trigger lewat pembungkus berjalan dengan konteks spreadsheet itu (pengingat masih mati = tidak mengirim apa pun).
  A.call('runReminderTick');
  assert.equal(env.fetches.length, 0);

  const h = A.call('validateConfiguration');
  assert.equal(h.setup.brand, 'Gym Andi');
  assert.equal(h.triggers.runReminderTick, 1);
  assert.equal(A.call('setupGetState').hubUrl, 'https://xnk.web.id');
  assert.deepEqual(env.props, {}, 'laci Library tetap kosong');
  assert.deepEqual(env.cache, {});
});

test('pengunjung web tidak bisa menjalankan setup lewat penghubung', () => {
  const env = createLibEnv();
  const A = loadBridge(env, 'SS_A');
  env.activeUserEmail = '';
  for (const fn of ['initializeTemplate', 'setupInit', 'setupGetState', 'setupCheck', 'validateConfiguration', 'setupTriggers']) {
    assert.throws(() => A.call(fn), /hanya bisa dijalankan pemilik/, fn);
  }
  assert.throws(() => A.call('setupSave', { brand: 'X', pin: '999999' }), /hanya bisa dijalankan pemilik/);
  assert.deepEqual(A.store.props, {});
  assert.equal(A.call('getLibraryVersion').api, 1);
});
