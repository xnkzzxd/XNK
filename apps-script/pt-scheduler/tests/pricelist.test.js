'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv } = require('./fixtures');

const NEW_PKG = { namaPaket: 'Pro 12', kategori: 'premium', harga: 1200000, jumlahSesi: 12, durasi: '1 Bulan', deskripsi: 'Program intensif', benefit: ['1-on-1', 'Diet'] };
const plRows = env => env.sheet('PriceList').rows;
const plCol = (env, name) => plRows(env)[0].indexOf(name);

// ── schema by header name ────────────────────────────────────────────────────

test('getPriceList still reads the current 9-column sheet (no Urutan yet) and returns only active packages', () => {
  const env = seededEnv();
  const list = env.call('getPriceList');
  assert.deepEqual(list.map(p => p.id), ['P1', 'P2']);
  assert.equal(list[0].harga, 800000);
  assert.equal(list[0].jumlahSesi, 8);
  assert.equal(list[1].jumlahSesi, '');
  assert.deepEqual(list[0].benefit, ['a', 'b']);
});

test('getPriceList reads a legacy 8-column sheet (no "Jumlah Sesi") correctly', () => {
  const env = seededEnv();
  env.ss.seed('PriceList', [
    ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
    ['L1', 'Lama 1', 'regular', 500000, '1 Bulan', 'desc', 'x, y', true],
  ]);
  const [p] = env.call('getPriceList');
  assert.equal(p.id, 'L1');
  assert.equal(p.harga, 500000);
  assert.equal(p.jumlahSesi, '');
  assert.equal(p.durasi, '1 Bulan');
  assert.deepEqual(p.benefit, ['x', 'y']);
});

test('the first admin write migrates a legacy sheet once: inserts Jumlah Sesi, appends Urutan, keeps every value', () => {
  const env = seededEnv();
  env.ss.seed('PriceList', [
    ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
    ['L1', 'Lama 1', 'regular', 500000, '1 Bulan', 'desc', 'x, y', true],
  ]);
  const token = env.adminToken();
  env.call('savePackage', token, NEW_PKG);
  assert.deepEqual(plRows(env)[0], ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif', 'Urutan', 'Tipe', 'Kapasitas', 'Jadwal Kelas', 'Kelas Privat']);
  const l1 = plRows(env)[1];
  assert.deepEqual(l1.slice(0, 8), ['L1', 'Lama 1', 'regular', 500000, '', '1 Bulan', 'desc', 'x, y']);
  const before = JSON.stringify(plRows(env));
  env.call('setPackageActive', token, 'L1', true);       // second write: header must not change again
  assert.equal(JSON.stringify(plRows(env)[0]), JSON.stringify(JSON.parse(before)[0]));
  assert.equal(plRows(env)[0].length, 14);
});

test('an unrecognised header row is not guessed at for writes', () => {
  const env = seededEnv();
  env.ss.seed('PriceList', [['ID', 'Foo', 'Bar', 'Baz', 'X', 'Y', 'Z', 'W', 'V'], ['P9', 'a', 'b', 1, 2, 3, 4, 5, true]]);
  assert.throws(() => env.call('savePackage', env.adminToken(), NEW_PKG), /Header sheet PriceList/);
});

test('public getPriceList orders by Urutan within a category and keeps sheet order otherwise', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('savePackage', token, Object.assign({}, NEW_PKG, { namaPaket: 'Reg A', kategori: 'regular', aktif: true }));
  env.call('savePackage', token, Object.assign({}, NEW_PKG, { namaPaket: 'Reg B', kategori: 'regular', aktif: true }));
  const regs = env.call('getPriceList').filter(p => p.kategori === 'regular').map(p => p.namaPaket);
  assert.deepEqual(regs, ['Regular 8', 'Reg A', 'Reg B']);          // existing packages are numbered first, new ones go last
  const ids = env.call('getPriceListAdmin', token).packages.filter(p => p.kategori === 'regular' && p.aktif).map(p => p.id).reverse();
  env.call('reorderPackages', token, 'regular', ids);
  assert.deepEqual(env.call('getPriceList').filter(p => p.kategori === 'regular').map(p => p.namaPaket), ['Reg B', 'Reg A', 'Regular 8']);
});

// ── admin list ───────────────────────────────────────────────────────────────

test('getPriceListAdmin returns inactive packages too, with usage counts and the fixed categories', () => {
  const env = seededEnv();
  const res = env.call('getPriceListAdmin', env.adminToken());
  assert.deepEqual(res.categories.map(c => c.id), ['student', 'college', 'regular', 'premium', 'core']);
  const p1 = res.packages.find(p => p.id === 'P1');
  assert.deepEqual(p1.usage, { activeMembers: 2, logEntries: 0 });   // Ani and Budi are on P1
  assert.equal(res.packages.find(p => p.id === 'P3').aktif, false);
  // within "regular": active first, inactive last
  const regular = res.packages.filter(p => p.kategori === 'regular').map(p => p.id);
  assert.deepEqual(regular, ['P1', 'P3']);
});

// ── create / update ──────────────────────────────────────────────────────────

test('savePackage creates an inactive package with a generated, unique ID and the next Urutan', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const a = env.call('savePackage', token, NEW_PKG);
  const b = env.call('savePackage', token, NEW_PKG);
  assert.match(a.id, /^PKG-\d{8}-[A-Z0-9]{4}$/);
  assert.notEqual(a.id, b.id);
  assert.equal(a.aktif, false);
  assert.deepEqual([a.urutan, b.urutan], [2, 3]);    // premium already has Flex (1)
  assert.equal(env.call('getPriceList').some(p => p.id === a.id), false);   // inactive → not public
  const row = plRows(env).find(r => r[0] === a.id);
  assert.equal(row[plCol(env, 'Harga')], 1200000);
  assert.equal(row[plCol(env, 'Benefit')], '1-on-1, Diet');
});

test('a new package shows on the public list once activated, with the same shape as before', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const { id } = env.call('savePackage', token, NEW_PKG);
  env.call('setPackageActive', token, id, true);
  const pub = env.call('getPriceList').find(p => p.id === id);
  assert.deepEqual(pub, { id, namaPaket: 'Pro 12', kategori: 'premium', harga: 1200000, jumlahSesi: 12, durasi: '1 Bulan', deskripsi: 'Program intensif', benefit: ['1-on-1', 'Diet'], aktif: true });
});

test('savePackage updates in place, keeps the ID, and honours "fleksibel" (empty sessions)', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const res = env.call('savePackage', token, { id: 'P1', namaPaket: 'Regular 8 Baru', kategori: 'regular', harga: 900000, jumlahSesi: '', durasi: '2 Bulan', deskripsi: '', benefit: [] });
  assert.equal(res.id, 'P1');
  assert.equal(res.jumlahSesi, '');
  assert.equal(res.harga, 900000);
  assert.equal(res.aktif, true);                   // untouched when data.aktif is absent
  assert.equal(plRows(env).filter(r => r[0] === 'P1').length, 1);
  assert.equal(env.call('getPriceList').find(p => p.id === 'P1').namaPaket, 'Regular 8 Baru');
});

test('savePackage rejects bad input with Indonesian messages and changes nothing', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const data = () => JSON.stringify(plRows(env).map(r => r.slice(0, 9)));   // ignore the one-time Urutan column
  const before = data();
  const bad = (patch, re) => assert.throws(() => env.call('savePackage', token, Object.assign({}, NEW_PKG, patch)), re);
  bad({ namaPaket: '   ' }, /Nama paket/);
  bad({ namaPaket: 'x'.repeat(61) }, /Nama paket/);
  bad({ kategori: 'vip' }, /Kategori tidak dikenal/);
  bad({ harga: -1 }, /Harga/);
  bad({ harga: 1.5 }, /Harga/);
  bad({ harga: 'abc' }, /Harga/);
  bad({ harga: '' }, /Harga/);
  bad({ jumlahSesi: 0 }, /Jumlah sesi/);
  bad({ jumlahSesi: 201 }, /Jumlah sesi/);
  bad({ durasi: 'x'.repeat(41) }, /Durasi/);
  bad({ deskripsi: 'x'.repeat(301) }, /Deskripsi/);
  bad({ benefit: ['a,b'] }, /koma/);
  bad({ benefit: ['x'.repeat(61)] }, /Setiap benefit/);
  bad({ benefit: Array.from({ length: 11 }, (_, i) => 'b' + i) }, /maksimal 10/);
  assert.throws(() => env.call('savePackage', token, Object.assign({}, NEW_PKG, { id: 'NOPE' })), /tidak ditemukan/);
  assert.equal(data(), before);
});

test('an existing package with an unknown legacy category can still be edited without changing its category', () => {
  const env = seededEnv();
  env.ss.seed('PriceList', [
    ['ID', 'Nama Paket', 'Kategori', 'Harga', 'Jumlah Sesi', 'Durasi', 'Deskripsi', 'Benefit', 'Status Aktif'],
    ['O1', 'Old', 'basic', 100000, 4, '1 Bulan', '', '', true],
  ]);
  const token = env.adminToken();
  const res = env.call('savePackage', token, { id: 'O1', namaPaket: 'Old 2', kategori: 'basic', harga: 110000, jumlahSesi: 4, durasi: '1 Bulan', benefit: [] });
  assert.equal(res.kategori, 'basic');
  assert.throws(() => env.call('savePackage', token, { id: 'O1', namaPaket: 'Old 2', kategori: 'vip', harga: 1, jumlahSesi: 4, benefit: [] }), /Kategori tidak dikenal/);
});

test('moving a package to another category puts it last there', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const a = env.call('savePackage', token, Object.assign({}, NEW_PKG, { kategori: 'student' }));
  const b = env.call('savePackage', token, Object.assign({}, NEW_PKG, { kategori: 'core' }));
  const moved = env.call('savePackage', token, Object.assign({}, NEW_PKG, { id: a.id, kategori: 'core' }));
  assert.ok(moved.urutan > b.urutan);
});

// ── activate / delete / reorder ──────────────────────────────────────────────

test('deactivating a package hides it publicly but leaves clients and revenue history alone', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.ss.seed('Members', [
    ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'],
    ['T1', 'PT-A', '3/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', ''],
  ]);
  env.call('setPackageActive', token, 'P1', false);
  assert.equal(env.call('getPriceList').some(p => p.id === 'P1'), false);
  assert.equal(env.memberRow('PT-A')[6], 'P1');
  assert.equal(env.call('getRevenueSummary', token, 9, 2026).grossTotal, 800000);   // inactive package still priced
  env.call('setPackageActive', token, 'P1', true);
  assert.equal(env.call('getPriceList').some(p => p.id === 'P1'), true);
});

test('deletePackage is blocked while clients or transactions use the package, and allowed otherwise', () => {
  const env = seededEnv();
  const token = env.adminToken();
  assert.throws(() => env.call('deletePackage', token, 'P1'), /dipakai 2 klien \/ 0 transaksi\. Nonaktifkan saja\./);
  env.ss.seed('Members', [
    ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'],
    ['T1', 'PT-Z', '3/9/2026', 'Baru', 'P3', 'Lama', 4, '', '', ''],
  ]);
  assert.throws(() => env.call('deletePackage', token, 'P3'), /0 klien \/ 1 transaksi/);
  assert.equal(plRows(env).some(r => r[0] === 'P1'), true);
  assert.equal(env.call('deletePackage', token, 'P2').status, 'success');    // Flex: nobody uses it
  assert.equal(plRows(env).some(r => r[0] === 'P2'), false);
  assert.throws(() => env.call('deletePackage', token, 'P2'), /tidak ditemukan/);
});

test('reorderPackages writes Urutan 1..n, appends packages left out, and rejects foreign or unknown IDs', () => {
  const env = seededEnv();
  const token = env.adminToken();
  const a = env.call('savePackage', token, Object.assign({}, NEW_PKG, { kategori: 'student', namaPaket: 'S1' }));
  const b = env.call('savePackage', token, Object.assign({}, NEW_PKG, { kategori: 'student', namaPaket: 'S2' }));
  const c = env.call('savePackage', token, Object.assign({}, NEW_PKG, { kategori: 'student', namaPaket: 'S3' }));
  const res = env.call('reorderPackages', token, 'student', [c.id, a.id]);
  assert.deepEqual(res.order, [c.id, a.id, b.id]);
  const urutan = id => plRows(env).find(r => r[0] === id)[plCol(env, 'Urutan')];
  assert.deepEqual([urutan(c.id), urutan(a.id), urutan(b.id)], [1, 2, 3]);
  assert.throws(() => env.call('reorderPackages', token, 'student', ['P1']), /tidak ada di kategori/);
  assert.throws(() => env.call('reorderPackages', token, 'student', 'nope'), /tidak valid/);
});

// ── price snapshot on transactions ───────────────────────────────────────────

test('a new client transaction records the package price at that moment, and revenue keeps using it after a price change', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.call('addMember', token, { name: 'Dewi', phone: '081999888777', goal: 'x', packageId: 'P1', coachId: '', totalSessions: 8, usedSessions: 0 });
  const log = env.sheet('Members').rows;
  assert.equal(log[0][10], 'Harga');
  const row = log[log.length - 1];
  assert.equal(row[4], 'P1');
  assert.equal(row[10], 800000);

  const now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear();
  const before = env.call('getRevenueSummary', token, month, year);
  assert.equal(before.grossTotal, 800000);

  env.call('savePackage', token, { id: 'P1', namaPaket: 'Regular 8', kategori: 'regular', harga: 1000000, jumlahSesi: 8, durasi: '1 Bulan', benefit: ['a', 'b'] });
  const after = env.call('getRevenueSummary', token, month, year);
  assert.equal(after.grossTotal, 800000);           // price snapshot: old transaction unchanged
});

test('log rows without a snapshot (older data) still use the current price', () => {
  const env = seededEnv();
  const token = env.adminToken();
  env.ss.seed('Members', [
    ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'],
    ['T1', 'PT-A', '3/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', ''],
    ['T2', 'PT-B', '4/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', '', 750000],   // snapshot present
    ['T3', 'PT-C', '5/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', '', 0],        // free package, snapshot 0
  ]);
  assert.equal(env.call('getRevenueSummary', token, 9, 2026).grossTotal, 800000 + 750000 + 0);
});

test('revenue prices are still found by name for old rows without a package ID', () => {
  const env = seededEnv();
  env.ss.seed('Members', [
    ['ID Transaksi', 'ID Member', 'Tanggal', 'Jenis', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan'],
    ['T5', 'PT-B', '5/9/2026', 'Baru', '', 'regular 8', 8, '', '', ''],
  ]);
  assert.equal(env.call('getRevenueSummary', env.adminToken(), 9, 2026).grossTotal, 800000);
});
