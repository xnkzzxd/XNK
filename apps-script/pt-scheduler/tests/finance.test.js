'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seededEnv, KEY_A, KEY_B } = require('./fixtures');

const LOG_HEADERS = ['Transaksi ID', 'Member ID', 'Tanggal', 'Jenis Transaksi', 'Paket ID', 'Nama Paket', 'Jumlah Sesi', 'Coach ID', 'Nama Coach', 'Catatan', 'Harga'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const plain = v => JSON.parse(JSON.stringify(v));

function on(env) {
  const t = env.adminToken();
  env.call('updateAppSettings', t, { finance: { enabled: true } });
  return t;
}
function addClient(env, t, phone) {
  env.call('addMember', t, { name: 'Budi', phone: phone || '081300000001', goal: 'Fit', packageId: 'P1' });
}

test('finance is off by default: calls are refused and no sheet is created', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.equal(env.call('getAppSettings', t).finance.enabled, false);
  assert.throws(() => env.call('getBills', t, {}), /belum aktif/);
  assert.throws(() => env.call('savePayment', t, {}), /belum aktif/);
  assert.equal(env.ss.getSheetByName('Tagihan'), null);
  assert.deepEqual(plain(env.call('getMyBills', env.memberToken(KEY_A))), []);
});

test('turning it on migrates old transactions as Lunas, once', () => {
  const env = seededEnv();
  env.ss.seed('Members', [LOG_HEADERS, ['T1', 'PT-A', '3/9/2026', 'Baru', 'P1', 'Regular 8', 8, '', '', '', 800000], ['T2', 'PT-B', '5/9/2026', 'Baru', 'P2', 'Flex', 1, '', '', '', '']]);
  const t = on(env);
  const bills = env.call('getBills', t, {});
  assert.equal(bills.length, 2);
  assert.ok(bills.every(b => b.status === 'Lunas' && b.remaining === 0));
  assert.equal(bills.find(b => b.trxId === 'T1').total, 800000);
  assert.equal(bills.find(b => b.trxId === 'T2').total, 1500000);   // empty price falls back to the PriceList
  assert.deepEqual(plain(env.call('syncFinanceTransactions', t)), { created: 0, skipped: 2 });
});

test('a new transaction creates one bill; status follows payments, discount and overpayment', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t);
  const [bill] = env.call('getBills', t, {});
  assert.equal(bill.status, 'Belum bayar');
  assert.equal(bill.total, 800000);
  const pay = (amount, extra) => env.call('savePayment', t, Object.assign({ billId: bill.id, amount, date: today(), method: 'Tunai' }, extra));
  const { id } = pay(300000);
  assert.equal(env.call('getBillDetail', t, bill.id).bill.status, 'DP');
  assert.throws(() => pay(600000), /melebihi sisa tagihan Rp500000/);
  env.call('saveBillAdjust', t, bill.id, { diskon: 100000 });
  assert.equal(env.call('getBillDetail', t, bill.id).bill.remaining, 400000);
  pay(400000);
  assert.equal(env.call('getBillDetail', t, bill.id).bill.status, 'Lunas');
  env.call('archiveFinanceItem', t, 'payment', id);
  assert.equal(env.call('getBillDetail', t, bill.id).bill.status, 'DP');
  env.call('restoreFinanceItem', t, 'payment', id);
  assert.equal(env.call('getBillDetail', t, bill.id).bill.status, 'Lunas');
});

test('total change needs a reason; validation errors are Indonesian', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t);
  const [bill] = env.call('getBills', t, {});
  assert.throws(() => env.call('saveBillAdjust', t, bill.id, { total: 700000 }), /alasan/);
  env.call('saveBillAdjust', t, bill.id, { total: 700000, alasan: 'promo' });
  assert.equal(env.call('getBillDetail', t, bill.id).bill.total, 700000);
  assert.throws(() => env.call('savePayment', t, { billId: bill.id, amount: 0, date: today(), method: 'Tunai' }), /Jumlah/);
  assert.throws(() => env.call('savePayment', t, { billId: bill.id, amount: 1000, date: 'besok', method: 'Tunai' }), /Tanggal/);
  assert.throws(() => env.call('savePayment', t, { billId: bill.id, amount: 1000, date: today(), method: 'Kripto' }), /Metode/);
});

test('expenses, categories, and income without a bill', () => {
  const env = seededEnv();
  const t = on(env);
  const { id } = env.call('saveExpense', t, { amount: 250000, date: today(), category: 'Sewa tempat', method: 'Tunai' });
  assert.equal(env.call('getExpenses', t, {}).length, 1);
  assert.throws(() => env.call('saveExpense', t, { amount: 1, date: today(), category: 'Tidak ada', method: 'Tunai' }), /Kategori/);
  assert.throws(() => env.call('deleteFinanceCategory', t, env.call('getFinanceCategories', t).find(c => c.name === 'Sewa tempat').id), /sudah dipakai/);
  const free = env.call('getFinanceCategories', t).find(c => c.name === 'Iklan');
  assert.deepEqual(plain(env.call('deleteFinanceCategory', t, free.id)), { ok: true });
  env.call('savePayment', t, { amount: 50000, date: today(), method: 'Tunai', category: 'Sesi satuan' });
  const m = new Date().getMonth() + 1, y = new Date().getFullYear();
  const s = env.call('getFinanceOverview', t, m, y);
  assert.equal(s.masuk, 50000);
  assert.equal(s.keluar, 250000);
  assert.equal(s.laba, -200000);
  env.call('archiveFinanceItem', t, 'expense', id);
  assert.equal(env.call('getFinanceOverview', t, m, y).keluar, 0);
  assert.equal(env.call('getExpenses', t, { archived: true }).length, 1);
});

test('summary: tunggakan, 6-month series and coach share (persen default 65, per sesi)', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t);
  const [bill] = env.call('getBills', t, {});
  const m = new Date().getMonth() + 1, y = new Date().getFullYear();
  assert.equal(env.call('getFinanceOverview', t, m, y).tunggakan, 800000);
  env.call('savePayment', t, { billId: bill.id, amount: 800000, date: today(), method: 'Transfer bank' });
  const s = env.call('getFinanceOverview', t, m, y);
  assert.equal(s.tunggakan, 0);
  assert.equal(s.series.length, 6);
  assert.equal(s.series[5].masuk, 800000);
  assert.throws(() => env.call('saveCoachShare', t, 'C-1', 'persen', 120), /0–100/);
  assert.throws(() => env.call('saveCoachShare', t, 'C-1', 'lain', 5), /persen atau per sesi/);
  env.call('saveCoachShare', t, 'C-1', 'sesi', 50000);
  assert.equal(env.call('getCoachesAdmin', t).coaches.find(c => c.id === 'C-1').shareType, 'sesi');
});

test('CSV: BOM, semicolons, quoting; range validated', () => {
  const env = seededEnv();
  const t = on(env);
  env.call('saveExpense', t, { amount: 1500, date: today(), category: 'Alat', method: 'Tunai', note: 'tali; "tebal"' });
  const r = env.call('exportFinanceCsv', t, 'pengeluaran', today(), today());
  assert.equal(r.csv.charCodeAt(0), 0xFEFF);
  assert.match(r.csv, /Tanggal;Kategori;Jumlah;Metode;Catatan/);
  assert.match(r.csv, /"tali; ""tebal"""/);
  assert.equal(r.count, 1);
  assert.throws(() => env.call('exportFinanceCsv', t, 'pengeluaran', '2026-10-05', '2026-10-01'), /sebelum/);
  assert.throws(() => env.call('exportFinanceCsv', t, 'x', today(), today()), /jenis ekspor/);
});

test('proof photos are private and replaced photos are trashed', () => {
  const env = seededEnv();
  const t = on(env);
  const { id } = env.call('saveExpense', t, { amount: 1000, date: today(), category: 'Alat', method: 'Tunai' });
  assert.throws(() => env.call('uploadFinanceProof', t, 'expense', id, 'AAAA', 'text/plain'), /JPG/);
  env.call('uploadFinanceProof', t, 'expense', id, Buffer.from('x').toString('base64'), 'image/jpeg');
  assert.equal(env.call('getExpenses', t, {})[0].hasProof, true);
  assert.match(env.call('getFinanceProof', t, 'expense', id).dataUrl, /^data:/);
});

test('portal: getMyBills is empty unless the owner allows it, and reads the member from the token', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t, '081300000009');
  const bill = env.call('getBills', t, {})[0];
  const memberKey = env.sheet('MemberData').rows.find(r => r[0] === bill.memberId)[13];
  const tok = env.memberToken(memberKey);
  assert.deepEqual(plain(env.call('getMyBills', tok)), []);
  env.call('updateAppSettings', t, { finance: { portalVisible: true } });
  const mine = env.call('getMyBills', tok);
  assert.equal(mine.length, 1);
  assert.deepEqual(Object.keys(mine[0]).sort(), ['lastPaid', 'paid', 'paket', 'remaining', 'status', 'tanggal', 'total']);
  assert.deepEqual(plain(env.call('getMyBills', env.memberToken(KEY_A), bill.memberId)), []);   // another ID in the arguments is ignored
});

test('methods setting is validated and empty reverts to the default', () => {
  const env = seededEnv();
  const t = env.adminToken();
  assert.throws(() => env.call('updateAppSettings', t, { finance: { methods: ['a,b'] } }), /koma/);
  assert.deepEqual(plain(env.call('updateAppSettings', t, { finance: { methods: ['Tunai', 'DANA'] } }).finance.methods), ['Tunai', 'DANA']);
  assert.deepEqual(plain(env.call('updateAppSettings', t, { finance: { methods: [] } }).finance.methods), ['Tunai', 'Transfer bank', 'QRIS / e-wallet']);
});

test('tagihan reminder: quiet while finance is off; one button for a bill open more than 3 days; none for a fresh or paid one', () => {
  const env = seededEnv();
  const t = env.adminToken();
  env.props.TELEGRAM_BOT_TOKEN = 'x:y'; env.props.TELEGRAM_CHAT_IDS = '1'; env.props.TELEGRAM_ENABLED = 'true';
  assert.equal(env.callRaw('sendTagihanDigest_', {}), true);
  assert.equal(env.fetches.length, 0);
  on(env);
  addClient(env, t);
  env.fetches.length = 0;   // adding a client notifies the owner; only the digest matters here
  assert.equal(env.callRaw('sendTagihanDigest_', {}), true);   // fresh bill: nothing yet
  assert.equal(env.fetches.length, 0);
  env.sheet('Tagihan').rows[1][7] = '2026-01-01';               // Tanggal, long overdue
  assert.equal(env.callRaw('sendTagihanDigest_', {}), true);
  const body = JSON.parse(env.fetches[env.fetches.length - 1].options.payload);
  assert.match(JSON.stringify(body), /wa\.me\/6281300000001/);
  assert.match(JSON.stringify(body), /Rp800\.000/);
});

test('previewReminderText tagihan fills the placeholders', () => {
  const env = seededEnv();
  assert.match(env.call('previewReminderText', env.adminToken(), 'tagihan', '').text, /Rp300\.000/);
});

// ── Halaman Keuangan cepat (2026-11): satu panggilan, baca sekali, simpan ringan ─────────────────────────────

test('getFinancePage: one call carries overview, bills, their payments, expenses, categories and methods', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t);
  const [bill] = env.call('getBills', t, {});
  env.call('savePayment', t, { billId: bill.id, amount: 300000, date: today(), method: 'Tunai' });
  env.call('saveExpense', t, { amount: 50000, date: today(), category: 'Alat', method: 'Tunai' });
  const m = new Date().getMonth() + 1, y = new Date().getFullYear();
  const p = plain(env.call('getFinancePage', t, m, y));
  assert.deepEqual(p.overview, plain(env.call('getFinanceOverview', t, m, y)));
  assert.deepEqual(p.bills, plain(env.call('getBills', t, {})));
  assert.equal(p.payments.length, 1);
  assert.equal(p.payments[0].billId, bill.id);
  assert.deepEqual(p.payments, plain(env.call('getBillDetail', t, bill.id).payments));
  assert.equal(p.expenses.length, 1);
  assert.deepEqual(p.cats, plain(env.call('getFinanceCategories', t)));
  assert.deepEqual(p.methods, ['Tunai', 'Transfer bank', 'QRIS / e-wallet']);
  assert.ok(p.ver && p.day && p.from);
  assert.throws(() => env.call('getFinancePage', t, 13, y), /Bulan/);
});

test('getFinancePage reads each finance sheet once and Schedules at most once; a repeat is a cache hit', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t);
  env.call('saveCoachShare', t, 'C-1', 'sesi', 50000);   // per-session share: Schedules is needed
  const m = new Date().getMonth() + 1, y = new Date().getFullYear();
  env.resetReads();
  const a = plain(env.call('getFinancePage', t, m, y, true));
  const r = env.reads().bySheet;
  ['Tagihan', 'Pembayaran', 'Pengeluaran', 'KategoriKeuangan'].forEach(n => assert.ok((r[n] || 0) <= 1, n + ' read ' + r[n] + ' times'));
  assert.ok((r.Schedules || 0) <= 1, 'Schedules read ' + r.Schedules + ' times');
  env.resetReads();
  const b = plain(env.call('getFinancePage', t, m, y));
  assert.equal(env.reads().bySheet.Tagihan || 0, 0, 'second call comes from the cache');
  assert.equal(b.ver, a.ver);
  env.call('saveExpense', t, { amount: 1000, date: today(), category: 'Alat', method: 'Tunai' });
  const c = plain(env.call('getFinancePage', t, m, y));
  assert.notEqual(c.ver, a.ver, 'a write moves the finance version');
  assert.equal(c.expenses.length, 1, 'and the next page is fresh');
});

test('getFinancePage keeps open and archived bills of any age, and paid bills of the last 12 months only', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t, '081300000001');
  addClient(env, t, '081300000002');
  addClient(env, t, '081300000003');
  const rows = env.sheet('Tagihan').rows;
  const ids = rows.slice(1).map(r => r[0]);
  rows.slice(1).forEach(r => { r[7] = '2024-01-05'; });    // all three bills are old
  env.call('savePayment', t, { billId: ids[0], amount: 800000, date: '2024-01-06', method: 'Tunai' });   // old and paid
  env.call('archiveFinanceItem', t, 'bill', ids[1]);                                                    // old and archived
  const m = new Date().getMonth() + 1, y = new Date().getFullYear();
  const p = plain(env.call('getFinancePage', t, m, y, true));
  const got = p.bills.map(b => b.id).sort();
  assert.deepEqual(got, [ids[1], ids[2]].sort());
  assert.equal(p.payments.length, 0, 'payments of a bill that is left out are left out too');
  assert.equal(plain(env.call('getFinancePage', t, 1, 2024, true)).bills.length, 3, 'picking that old month brings it back');
});

test('savePayment returns the new bill totals, writes the status once and bumps only that client', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t, '081300000009');
  const [bill] = env.call('getBills', t, {});
  const vers = () => plain(env.call('getAdminMore', t, 1, 2026)).memberVers;
  const v0 = vers();
  env.resetReads();
  const r = plain(env.call('savePayment', t, { billId: bill.id, amount: 800000, date: today(), method: 'Tunai' }));
  // Dulu 19 pembacaan (cek skema di setiap simpan, Tagihan dan Pembayaran dibaca dua kali). Sekarang: data + header + baca
  // balik _appendRow_ untuk Pembayaran, data + header untuk Tagihan.
  assert.ok(env.reads().total <= 6, 'reads: ' + JSON.stringify(env.reads()));
  assert.equal(env.reads().bySheet.KategoriKeuangan || 0, 0, 'no schema check on every save');
  assert.deepEqual(r.bill, { id: bill.id, net: 800000, paid: 800000, remaining: 0, status: 'Lunas', lastPaid: today() });
  assert.equal(env.sheet('Tagihan').rows[1][10], 'Lunas');
  const v1 = vers();
  assert.notEqual(v1[bill.memberId], v0[bill.memberId], 'the bill owner is bumped');
  assert.equal(v1['*'], v0['*'], 'not everyone');
  const other = Object.keys(v0).find(k => k !== bill.memberId && k !== '*');
  if (other) assert.equal(v1[other], v0[other]);
  const free = plain(env.call('savePayment', t, { amount: 1000, date: today(), method: 'Tunai', category: 'Lainnya' }));
  assert.equal(free.bill, undefined, 'income without a bill has no bill totals');
  assert.deepEqual(vers(), v1, 'and bumps no client');
});

test('moving a payment to another bill updates the status of the old bill too', () => {
  const env = seededEnv();
  const t = on(env);
  addClient(env, t, '081300000001');
  addClient(env, t, '081300000002');
  const [b1, b2] = env.call('getBills', t, {});
  const { id } = env.call('savePayment', t, { billId: b1.id, amount: 800000, date: today(), method: 'Tunai' });
  assert.equal(env.call('getBillDetail', t, b1.id).bill.status, 'Lunas');
  env.call('savePayment', t, { id, billId: b2.id, amount: 300000, date: today(), method: 'Tunai' });
  const st = id2 => env.sheet('Tagihan').rows.find(r => r[0] === id2)[10];
  assert.equal(st(b1.id), 'Belum bayar');
  assert.equal(st(b2.id), 'DP');
});

test('every public finance writer moves the finance version (device copies and the page cache follow it)', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../src/Keuangan.gs'), 'utf8');
  const { WRITE } = require('./api-lists');
  const fns = {};
  src.split('\nfunction ').slice(1).forEach(chunk => { fns[chunk.match(/^(\w+)/)[1]] = chunk; });
  const writers = Object.keys(fns).filter(n => !n.endsWith('_') && WRITE.indexOf(n) !== -1);
  assert.ok(writers.length >= 10, 'found the writers');
  const missing = writers.filter(n => !/_finLocked_\(|_finArchive_\(|_finMigrate_\(|_bustFin_\(/.test(fns[n]));
  assert.deepEqual(missing, []);
});
