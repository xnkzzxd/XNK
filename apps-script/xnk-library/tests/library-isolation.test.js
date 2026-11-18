'use strict';
// Spreadsheet coach yang berbeda tidak boleh saling melihat PIN, sesi, cache atau data, walau memakai Library yang sama.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCtx, createLibEnv } = require('./lib-harness');

const PRICE = [['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
  ['P1', 'Regular 8', 'regular', 800000, 8, '1 Bulan', 'desc', 'a,b', true]];

function setupTwo() {
  const env = createLibEnv();
  const A = makeCtx('SS_A'), B = makeCtx('SS_B');
  env.lib('initInstance', A.ctx);
  env.lib('initInstance', B.ctx);
  env.lib('saveSetup', A.ctx, { brand: 'Gym Andi', pin: '111111' });
  env.lib('saveSetup', B.ctx, { brand: 'Studio Bunga', pin: '222222' });
  return { env, A, B };
}

const libraryUntouched = env => {
  assert.deepEqual(env.props, {}, 'Script Properties milik Library harus tetap kosong');
  assert.deepEqual(env.cache, {}, 'Cache milik Library harus tetap kosong');
  assert.deepEqual(env.triggers, [], 'Trigger tidak boleh dibuat di Library');
};

test('tanpa konteks spreadsheet, fungsi Library menolak', () => {
  const env = createLibEnv();
  assert.throws(() => env.lib('adminLogin', '111111'), /Konteks spreadsheet belum diatur/);
  assert.throws(() => env.lib('getPortalBootstrap', 'x'), /Konteks spreadsheet belum diatur/);
  assert.throws(() => env.lib('run', null, 'adminLogin', ['111111']), /Konteks spreadsheet belum diatur/);
  assert.throws(() => env.lib('run', { props: {} }, 'adminLogin', ['111111']), /tidak lengkap/);
  libraryUntouched(env);
});

test('XNK.run hanya menjalankan fungsi dari daftar resmi', () => {
  const env = createLibEnv();
  const { ctx } = makeCtx('SS_A');
  for (const bad of ['_sessionSecret_', 'run', 'initInstance', 'eval', 'constructor', 'toString', '__proto__', '']) {
    assert.throws(() => env.lib('run', ctx, bad, []), /Fungsi tidak dikenal/, bad);
  }
});

test('PIN dan token satu spreadsheet tidak berlaku di spreadsheet lain', () => {
  const { env, A, B } = setupTwo();
  const tokA = env.run(A.ctx, 'adminLogin', '111111').token;
  assert.ok(tokA);
  assert.throws(() => env.run(B.ctx, 'adminLogin', '111111'), /PIN salah/);
  assert.ok(env.run(B.ctx, 'adminLogin', '222222').token);
  assert.throws(() => env.run(B.ctx, 'getAdminBootstrap', tokA), /AUTH_REQUIRED/);
  assert.ok(env.run(A.ctx, 'getAdminBootstrap', tokA));
  assert.notEqual(A.store.props.SESSION_SECRET, B.store.props.SESSION_SECRET);
  assert.equal(A.store.props.BRAND_NAME, 'Gym Andi');
  assert.equal(B.store.props.BRAND_NAME, 'Studio Bunga');
  libraryUntouched(env);
});

test('data klien dan cache terpisah per spreadsheet', () => {
  const { env, A, B } = setupTwo();
  A.ss.getSheetByName('PriceList').rows = PRICE.map(r => r.slice());
  B.ss.getSheetByName('PriceList').rows = PRICE.map(r => r.slice());
  const reg = env.run(A.ctx, 'registerNewClient', { name: 'Dewi', phone: '0814 4444 4444', goal: 'x', packageId: 'P1' });
  assert.equal(reg.status, 'success');
  assert.ok(env.run(A.ctx, 'memberLoginByPhone', '081444444444').member);
  assert.throws(() => env.run(B.ctx, 'memberLoginByPhone', '081444444444'));
  assert.throws(() => env.run(B.ctx, 'getMemberProfile', reg.token), /AUTH_REQUIRED/);
  assert.equal(B.ss.getSheetByName('MemberData').getLastRow(), 1, 'B tidak mendapat baris klien A');

  // Panggilan baca mengisi cache milik spreadsheet itu sendiri.
  env.run(A.ctx, 'getPriceListPublic');
  env.run(A.ctx, 'getOpenSlots', {});
  assert.ok(Object.keys(A.store.cache).length > 0);
  const tokB = env.run(B.ctx, 'adminLogin', '222222').token;
  const membersB = env.run(B.ctx, 'getAdminBootstrap', tokB);
  assert.ok(!JSON.stringify(membersB).includes('Dewi'), 'data A tidak boleh muncul di B');
  libraryUntouched(env);
});

test('inisialisasi dan pasang trigger aman diulang (tanpa duplikat)', () => {
  const env = createLibEnv();
  const A = makeCtx('SS_A');
  const first = env.lib('initInstance', A.ctx);
  assert.deepEqual([...first.created], ['Coaches', 'MemberData', 'Members', 'Schedules', 'PriceList']);
  assert.equal(first.copied, false);
  const secret = A.store.props.SESSION_SECRET;
  const second = env.lib('initInstance', A.ctx);
  assert.equal(second.created.length, 0);
  assert.equal(A.store.props.SESSION_SECRET, secret, 'kunci sesi tidak boleh berubah');
  env.lib('installTriggers', A.ctx);
  env.lib('installTriggers', A.ctx);
  assert.deepEqual(A.store.triggers.map(t => t.getHandlerFunction()), ['runReminderTick']);
  assert.equal(env.lib('healthCheck', A.ctx).triggers.runReminderTick, 1);
  assert.equal(env.lib('removeTriggers', A.ctx).removed, 1);
  libraryUntouched(env);
});

test('salinan baru: semua pengaturan dari spreadsheet asal dihapus saat inisialisasi', () => {
  const { env, A } = setupTwo();
  A.store.props.TELEGRAM_BOT_TOKEN = '1:x';
  // Salinan spreadsheet A (Script Properties ikut tersalin), ID spreadsheet berbeda.
  const C = makeCtx('SS_C');
  Object.assign(C.store.props, A.store.props);
  assert.equal(env.lib('healthCheck', C.ctx).setup.copiedNotInitialized, true);
  const r = env.lib('initInstance', C.ctx);
  assert.equal(r.copied, true);
  assert.ok(r.wiped >= 4);
  assert.equal(C.store.props.ADMIN_PIN, undefined);
  assert.equal(C.store.props.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(C.store.props.BRAND_NAME, undefined);
  assert.equal(C.store.props.XNK_INSTANCE_SS_ID, 'SS_C');
  assert.notEqual(C.store.props.SESSION_SECRET, A.store.props.SESSION_SECRET);
  assert.throws(() => env.run(C.ctx, 'adminLogin', '111111'), /PIN admin belum diatur/);
  assert.equal(A.store.props.ADMIN_PIN, '111111', 'spreadsheet asal tidak berubah');
});

test('fungsi setup hanya untuk pemilik spreadsheet (bukan pengunjung web)', () => {
  const env = createLibEnv();
  const A = makeCtx('SS_A');
  env.activeUserEmail = '';
  for (const fn of ['initInstance', 'installTriggers', 'removeTriggers', 'healthCheck', 'setupState']) {
    assert.throws(() => env.lib(fn, A.ctx), /hanya bisa dijalankan pemilik/, fn);
  }
  assert.throws(() => env.lib('saveSetup', A.ctx, { brand: 'X', pin: '123456' }), /hanya bisa dijalankan pemilik/);
  assert.deepEqual(A.store.props, {});
});

test('saveSetup memvalidasi dulu, baru menulis', () => {
  const env = createLibEnv();
  const A = makeCtx('SS_A');
  assert.throws(() => env.lib('saveSetup', A.ctx, { brand: '', pin: '123456' }), /Nama usaha wajib/);
  assert.throws(() => env.lib('saveSetup', A.ctx, { brand: 'X', pin: '123' }), /PIN minimal 6/);
  assert.throws(() => env.lib('saveSetup', A.ctx, { brand: 'X' }), /PIN admin wajib/);
  assert.throws(() => env.lib('saveSetup', A.ctx, { brand: 'X', pin: '123456', siteUrl: 'http://a.b' }), /https:\/\//);
  assert.deepEqual(A.store.props, {});
  env.lib('saveSetup', A.ctx, { brand: 'X', pin: '123456', siteUrl: 'https://andi.github.io/gym/' });
  assert.equal(A.store.props.SITE_URL, 'https://andi.github.io/gym');
  env.lib('saveSetup', A.ctx, { brand: 'X', pin: '', siteUrl: 'https://andi.github.io/gym/klien/' });
  assert.equal(A.store.props.SITE_URL, 'https://andi.github.io/gym', 'alamat portal yang ditempel jadi alamat utama');
  env.lib('saveSetup', A.ctx, { brand: 'Y', pin: '' });
  assert.equal(A.store.props.ADMIN_PIN, '123456', 'PIN kosong = PIN lama tetap');
  assert.equal(A.store.props.SITE_URL, undefined);
});

test('doPost dan doGet lewat Library memakai spreadsheet pemanggil', () => {
  const { env, A, B } = setupTwo();
  const post = (ctx, fn, args) => JSON.parse(env.lib('handlePost', ctx, { postData: { contents: JSON.stringify({ fn, args }) } }).content);
  assert.equal(post(A.ctx, 'adminLogin', ['111111']).ok, true);
  const bad = post(B.ctx, 'adminLogin', ['111111']);
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'PIN salah.');
  const page = env.lib('handleGet', A.ctx, { parameter: {} });
  assert.ok(page.getContent().length > 1000);
  // Landing pemilik tidak ikut di Library: ?view=Landing jatuh ke Index.
  assert.equal(env.lib('handleGet', A.ctx, { parameter: { view: 'Landing' } }).getContent(), page.getContent());
  libraryUntouched(env);
});

test('link portal di pesan WhatsApp = portal klien coach itu (/klien/), bukan xnk dan bukan panel', () => {
  const { env, A, B } = setupTwo();
  A.store.props.SITE_URL = 'https://gym-andi.github.io';
  assert.equal(env.lib('run', A.ctx, 'getAppSettings', [env.run(A.ctx, 'adminLogin', '111111').token]).shareQrDefault, 'https://gym-andi.github.io/klien/');
  const tokB = env.run(B.ctx, 'adminLogin', '222222').token;
  assert.equal(env.lib('run', B.ctx, 'getAppSettings', [tokB]).shareQrDefault, 'https://script.google.com/macros/s/DEPLOY_SS_B/exec?view=public');
});

test('getServerInfo lewat doPost: versi API dan sidik build Library (commit penuh) untuk hub, tanpa data (T-2220)', () => {
  const { env, A } = setupTwo();
  const r = JSON.parse(env.lib('handlePost', A.ctx, { postData: { contents: JSON.stringify({ fn: 'getServerInfo', args: [] }) } }).content);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data).sort(), ['api', 'lib']);
  assert.deepEqual(Object.keys(r.data.lib).sort(), ['commit', 'hash']);
  assert.match(r.data.lib.hash, /^[0-9a-f]{12}$/);
  assert.ok(/^[0-9a-f]{40}$/.test(r.data.lib.commit) || r.data.lib.commit === 'lokal', r.data.lib.commit);
  const u = JSON.parse(env.lib('handlePost', A.ctx, { postData: { contents: JSON.stringify({ fn: 'fungsiBaru', args: [] }) } }).content);
  assert.equal(u.code, 'unknown_fn');
});

test('registerPusat (T-2233): rahasia baru dikirim ke XNK Pusat; disimpan hanya bila diterima; hanya pemilik', () => {
  const { env, A } = setupTwo();
  const PUSAT = 'https://script.google.com/macros/s/AKfycbPUSAT000000000000000000/exec';
  const sent = [];
  let answer = { ok: false, error: 'Kode daftar XNK Pusat salah.' };
  // Seperti Apps Script sungguhan: POST /exec → 302 ke echo; mengikuti 302 sebagai POST → halaman HTML Google.
  const ECHO = 'https://script.googleusercontent.com/macros/echo?k=1';
  env.context.UrlFetchApp.fetch = (url, o) => {
    o = o || {};
    if (url === ECHO && !o.method) return { getResponseCode: () => 200, getContentText: () => JSON.stringify(answer) };
    sent.push({ url, body: JSON.parse(o.payload) });
    if (o.followRedirects !== false) return { getResponseCode: () => 200, getContentText: () => '<!DOCTYPE html><html>Google</html>' };
    return { getResponseCode: () => 302, getHeaders: () => ({ Location: ECHO }), getContentText: () => '' };
  };
  assert.throws(() => env.lib('registerPusat', A.ctx, { pusatUrl: '', code: 'x', slug: 'gym-andi' }), /belum diatur/);
  assert.throws(() => env.lib('registerPusat', A.ctx, { pusatUrl: PUSAT, code: 'salah', slug: 'gym-andi' }), /Kode daftar/);
  assert.equal(A.store.props.HUB_SECRET, undefined, 'ditolak = tidak ada rahasia tersimpan');
  answer = { ok: true, data: { registered: true } };
  assert.equal(env.lib('registerPusat', A.ctx, { pusatUrl: PUSAT, code: 'benar', slug: 'gym-andi' }).registered, true);
  const last = sent[sent.length - 1];
  assert.equal(last.url, PUSAT);
  assert.equal(last.body.fn, 'pusatRegister');
  assert.deepEqual(last.body.args.slice(0, 2), ['benar', 'gym-andi']);
  assert.match(last.body.args[2], /\/exec$/);
  assert.equal(A.store.props.HUB_SECRET, last.body.args[3]);
  assert.ok(A.store.props.HUB_SECRET.length >= 32);
  // Link yang ditempel pemilik (deployment "Siapa saja") dikirim apa adanya; bentuk lain ditolak sebelum dikirim.
  const DEP = 'https://script.google.com/macros/s/AKfycbDEPLOY0000000000000000/exec';
  env.lib('registerPusat', A.ctx, { pusatUrl: PUSAT, code: 'benar', slug: 'gym-andi', exec: ' ' + DEP + ' ' });
  assert.equal(sent[sent.length - 1].body.args[2], DEP);
  const n = sent.length;
  assert.throws(() => env.lib('registerPusat', A.ctx, { pusatUrl: PUSAT, code: 'benar', slug: 'gym-andi', exec: DEP.replace('/exec', '/dev') }), /Link aplikasi harus/);
  assert.equal(sent.length, n);
  libraryUntouched(env);
});
