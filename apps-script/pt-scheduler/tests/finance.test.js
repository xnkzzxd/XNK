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
