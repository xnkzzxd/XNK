// #############################################################################
// 📁 Keuangan — tagihan, pembayaran, pengeluaran, kategori, bagi hasil (Fase H)
// #############################################################################
// Lihat docs/finance/PRD.md dan Design.md. Mati secara default (FIN_ENABLED). Semua fungsi publik
// khusus admin, kecuali getMyBills (klien, hanya bila FIN_PORTAL_VISIBLE). Data keuangan tidak pernah
// masuk ke respons publik, cache admin, atau Telegram selain nama depan + paket + sisa tagihan.

const FIN_TABLES = {
  Tagihan: ['ID Tagihan', 'Transaksi ID', 'Member ID', 'Nama Klien', 'Paket ID', 'Nama Paket', 'Coach ID', 'Tanggal', 'Total', 'Diskon', 'Status', 'Catatan', 'Dibuat Pada', 'Diubah Pada', 'Diarsipkan Pada', 'Diarsipkan Oleh'],
  Pembayaran: ['ID Bayar', 'ID Tagihan', 'Member ID', 'Tanggal', 'Jumlah', 'Metode', 'Kategori', 'Bukti File ID', 'Catatan', 'Dibuat Pada', 'Diubah Pada', 'Diarsipkan Pada', 'Diarsipkan Oleh'],
  Pengeluaran: ['ID Keluar', 'Tanggal', 'Kategori', 'Jumlah', 'Metode', 'Bukti File ID', 'Catatan', 'Coach ID', 'Dibuat Pada', 'Diubah Pada', 'Diarsipkan Pada', 'Diarsipkan Oleh'],
  KategoriKeuangan: ['ID', 'Tipe', 'Nama', 'Urutan', 'Aktif']
};
const FIN_DATE_COLS = { Tagihan: 'H:H', Pembayaran: 'D:D', Pengeluaran: 'B:B' };
const FIN_DEFAULT_METHODS = ['Tunai', 'Transfer bank', 'QRIS / e-wallet'];
const FIN_DEFAULT_CATS = [['masuk', 'Paket'], ['masuk', 'Sesi satuan'], ['masuk', 'Lainnya'], ['keluar', 'Sewa tempat'], ['keluar', 'Alat'], ['keluar', 'Iklan'], ['keluar', 'Transport'], ['keluar', 'Lainnya']];
const FIN_DEFAULT_SHARE_PERCENT = 65;
const FIN_MAX_AMOUNT = 1000000000;

// ── Pengaturan ──────────────────────────────────────────────────────────────

function _finOn_() { return PropertiesService.getScriptProperties().getProperty('FIN_ENABLED') === 'true'; }
function _finRequire_() { if (!_finOn_()) throw new Error('Fitur keuangan belum aktif.'); }

function _finMethods_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FIN_METHODS');
  const list = String(raw || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  return list.length ? list : FIN_DEFAULT_METHODS.slice();
}

function _finSettingsRead_() {
  const props = PropertiesService.getScriptProperties();
  return {
    enabled: _finOn_(),
    portalVisible: props.getProperty('FIN_PORTAL_VISIBLE') === 'true',
    methods: _finMethods_(),
    defaults: { methods: FIN_DEFAULT_METHODS.slice() }
  };
}

/** Validasi dulu, tulis belakangan. Mengembalikan peta properti (atau null kalau tidak ada perubahan). */
function _finValidate_(f) {
  if (f == null) return null;
  if (typeof f !== 'object') throw new Error('Pengaturan keuangan tidak valid.');
  const map = {};
  if (Object.prototype.hasOwnProperty.call(f, 'enabled')) map.FIN_ENABLED = f.enabled ? 'true' : 'false';
  if (Object.prototype.hasOwnProperty.call(f, 'portalVisible')) map.FIN_PORTAL_VISIBLE = f.portalVisible ? 'true' : 'false';
  if (Object.prototype.hasOwnProperty.call(f, 'methods')) {
    const list = (Array.isArray(f.methods) ? f.methods : String(f.methods || '').split(','))
      .map(function(s) { return String(s).trim(); }).filter(Boolean);
    if (list.length > 12) throw new Error('Maksimal 12 metode pembayaran.');
    list.forEach(function(s) {
      if (s.length > 30) throw new Error('Nama metode maksimal 30 karakter.');
      if (s.indexOf(',') !== -1) throw new Error('Nama metode tidak boleh memakai koma.');
    });
    map.FIN_METHODS = list.join(',');   // kosong = hapus properti, kembali ke bawaan
  }
  return map;
}

function _finWrite_(map) {
  if (!map) return;
  const props = PropertiesService.getScriptProperties();
  const wasOn = _finOn_();
  Object.keys(map).forEach(function(k) {
    if (map[k] === '') props.deleteProperty(k); else props.setProperty(k, map[k]);
  });
  if (!wasOn && _finOn_()) _finMigrate_();   // pertama kali menyala: transaksi lama jadi Lunas
}

// ── Tabel (dibaca lewat nama header, hanya menambah kolom) ──────────────────

function _finSheet_(name, create) {
  if (create) {
    const sheet = getOrCreateSheet_(name, FIN_TABLES[name]);
    if (FIN_DATE_COLS[name]) sheet.getRange(FIN_DATE_COLS[name]).setNumberFormat('@');
    return sheet;
  }
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function _finEnsure_() {
  Object.keys(FIN_TABLES).forEach(function(n) {
    const sheet = _finSheet_(n, true);
    const header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    FIN_TABLES[n].forEach(function(h) {
      if (header.indexOf(h) === -1) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h); header.push(h); }
    });
  });
  const cat = _finSheet_('KategoriKeuangan', true);
  if (cat.getLastRow() <= 1) {
    FIN_DEFAULT_CATS.forEach(function(c, i) { cat.appendRow(['KAT-' + (i + 1), c[0], c[1], i + 1, true]); });
  }
}

function _finDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, REMINDER_TZ, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const p = s.split('/');
  if (p.length === 3 && +p[0] && +p[1] && +p[2]) return p[2] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2);
  return '';
}

function _finRead_(name) {
  const sheet = _finSheet_(name, false);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].every(function(v) { return v === ''; })) continue;
    const o = { _row: i + 1 };
    header.forEach(function(h, c) { o[h] = values[i][c] === undefined ? '' : values[i][c]; });
    if (o.Tanggal !== undefined) o.Tanggal = _finDate_(o.Tanggal);
    out.push(o);
  }
  return out;
}

function _finAppend_(name, obj) {
  const sheet = _finSheet_(name, true);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(header.map(function(h) { return obj[h] === undefined ? '' : obj[h]; }));
}

function _finUpdate_(name, rowNum, obj) {
  const sheet = _finSheet_(name, true);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  Object.keys(obj).forEach(function(k) {
    const c = header.indexOf(k);
    if (c !== -1) sheet.getRange(rowNum, c + 1).setValue(obj[k]);
  });
}

function _finId_(prefix) { return prefix + '-' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
function _finNow_() { return new Date().toISOString(); }
function _finInt_(v) { const n = Number(v); return isFinite(n) ? Math.round(n) : NaN; }

function _finAmount_(v, label) {
  const n = _finInt_(v);
  if (!isFinite(n) || n <= 0 || n > FIN_MAX_AMOUNT) throw new Error(label + ' harus bilangan bulat lebih dari 0.');
  return n;
}

function _finCheckDate_(v) {
  const d = String(v == null ? '' : v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T00:00:00Z'))) throw new Error('Tanggal tidak valid.');
  return d;
}

function _finText_(v, max, label) {
  const s = String(v == null ? '' : v).trim();
  if (s.length > max) throw new Error(label + ' maksimal ' + max + ' karakter.');
  return s;
}

function _finLocked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Sedang sibuk, coba lagi.');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ── Tagihan: dibuat dari transaksi, status dihitung dari pembayaran ─────────

function _finBillTotals_(bill, payments) {
  const net = Math.max(0, (Number(bill.Total) || 0) - (Number(bill.Diskon) || 0));
  let paid = 0, last = '';
  payments.forEach(function(p) {
    if (String(p['ID Tagihan']) !== String(bill['ID Tagihan']) || p['Diarsipkan Pada']) return;
    paid += Number(p.Jumlah) || 0;
    if (p.Tanggal > last) last = p.Tanggal;
  });
  const status = paid >= net ? 'Lunas' : (paid > 0 ? 'DP' : 'Belum bayar');
  return { net: net, paid: paid, remaining: Math.max(0, net - paid), status: status, lastPaid: last };
}

function _finCacheStatus_(billId) {
  const bill = _finRead_('Tagihan').filter(function(b) { return b['ID Tagihan'] === billId; })[0];
  if (!bill) return;
  const t = _finBillTotals_(bill, _finRead_('Pembayaran'));
  _finUpdate_('Tagihan', bill._row, { Status: t.status, 'Diubah Pada': _finNow_() });
}

/** Dipanggil setelah baris transaksi ditulis (hanya saat keuangan aktif). Gagal tidak membatalkan transaksi. */
function _finBillFromTransaction_(trx) {
  try {
    if (!_finOn_()) return;
    _finEnsure_();
    if (_finRead_('Tagihan').some(function(b) { return b['Transaksi ID'] === trx.trxId; })) return;
    const m = _getMembersAll_().filter(function(x) { return String(x.id) === String(trx.memberId); })[0];
    _finAppend_('Tagihan', {
      'ID Tagihan': _finId_('TG'), 'Transaksi ID': trx.trxId, 'Member ID': trx.memberId, 'Nama Klien': m ? m.name : '',
      'Paket ID': trx.paketId || '', 'Nama Paket': trx.namaPaket || '', 'Coach ID': trx.coachId || '',
      Tanggal: _finDate_(trx.dateStr), Total: trx.price === '' ? 0 : trx.price, Diskon: 0, Status: 'Belum bayar', Catatan: '',
      'Dibuat Pada': _finNow_(), 'Diubah Pada': _finNow_()
    });
  } catch (e) { Logger.log('Tagihan gagal dibuat: ' + e); }
}

/** Transaksi lama tanpa tagihan jadi tagihan + 1 pembayaran penuh (Lunas). Idempoten. */
function _finMigrate_() {
  return _finLocked_(function() {
    _finEnsure_();
    const have = {};
    _finRead_('Tagihan').forEach(function(b) { have[b['Transaksi ID']] = true; });
    const prices = _allPackagePrices_();
    const names = {};
    _getMembersAll_().forEach(function(m) { names[String(m.id)] = m.name; });
    const log = _getMembersLogSheet_().getDataRange().getValues();
    let created = 0, skipped = 0;
    for (let i = 1; i < log.length; i++) {
      const r = log[i], trxId = String(r[0] || '');
      if (!trxId) continue;
      if (have[trxId]) { skipped++; continue; }
      const snap = parseFloat(r[MEMBERS_LOG_PRICE_COL - 1]);
      const price = (r[MEMBERS_LOG_PRICE_COL - 1] !== '' && isFinite(snap)) ? snap
        : (prices.byId[String(r[4])] !== undefined ? prices.byId[String(r[4])] : (prices.byName[String(r[5]).trim().toLowerCase()] || 0));
      const id = _finId_('TG'), date = _finDate_(r[2]) || _todayWib_(), now = _finNow_();
      _finAppend_('Tagihan', {
        'ID Tagihan': id, 'Transaksi ID': trxId, 'Member ID': String(r[1]), 'Nama Klien': names[String(r[1])] || '',
        'Paket ID': String(r[4] || ''), 'Nama Paket': String(r[5] || ''), 'Coach ID': String(r[7] || ''),
        Tanggal: date, Total: Math.round(price), Diskon: 0, Status: 'Lunas', Catatan: '', 'Dibuat Pada': now, 'Diubah Pada': now
      });
      if (price > 0) {
        _finAppend_('Pembayaran', {
          'ID Bayar': _finId_('BY'), 'ID Tagihan': id, 'Member ID': String(r[1]), Tanggal: date, Jumlah: Math.round(price),
          Metode: 'Lainnya', Kategori: 'Paket', Catatan: 'Migrasi', 'Dibuat Pada': now, 'Diubah Pada': now
        });
      }
      created++;
    }
    PropertiesService.getScriptProperties().setProperty('FIN_MIGRATED', 'true');
    return { created: created, skipped: skipped };
  });
}

function syncFinanceTransactions(token) {
  requireAdmin_(token);
  _finRequire_();
  return _finMigrate_();
}

function _finBillView_(b, payments, members) {
  const t = _finBillTotals_(b, payments);
  const m = members[String(b['Member ID'])];
  const today = _todayWib_();
  const age = b.Tanggal ? Math.max(0, Math.round((new Date(today + 'T00:00:00Z') - new Date(b.Tanggal + 'T00:00:00Z')) / 86400000)) : 0;
  return {
    id: b['ID Tagihan'], trxId: b['Transaksi ID'], memberId: String(b['Member ID']),
    name: (m && m.name) || b['Nama Klien'] || '', phone: m ? m.phone : '',
    packageId: String(b['Paket ID'] || ''), packageName: b['Nama Paket'] || '', coachId: String(b['Coach ID'] || ''),
    date: b.Tanggal, total: Number(b.Total) || 0, discount: Number(b.Diskon) || 0, note: b.Catatan || '',
    net: t.net, paid: t.paid, remaining: t.remaining, status: t.status, lastPaid: t.lastPaid, ageDays: age,
    archived: !!b['Diarsipkan Pada']
  };
}

function _finMembersById_() {
  const map = {};
  _getMembersAll_().forEach(function(m) { map[String(m.id)] = m; });
  return map;
}

function getBills(token, filter) {
  requireAdmin_(token);
  _finRequire_();
  filter = filter || {};
  const payments = _finRead_('Pembayaran'), members = _finMembersById_();
  const q = String(filter.q || '').trim().toLowerCase();
  return _finRead_('Tagihan').map(function(b) { return _finBillView_(b, payments, members); }).filter(function(v) {
    if (!!filter.archived !== v.archived) return false;
    if (filter.status === 'open' ? v.status === 'Lunas' : (filter.status && v.status !== filter.status)) return false;
    if (filter.month && filter.year && v.date.slice(0, 7) !== filter.year + '-' + ('0' + filter.month).slice(-2)) return false;
    if (q && v.name.toLowerCase().indexOf(q) === -1 && v.packageName.toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function(a, b) { return a.date < b.date ? 1 : -1; });
}

function _finPaymentView_(p) {
  return { id: p['ID Bayar'], billId: String(p['ID Tagihan'] || ''), memberId: String(p['Member ID'] || ''), date: p.Tanggal, amount: Number(p.Jumlah) || 0, method: p.Metode || '', category: p.Kategori || '', note: p.Catatan || '', hasProof: !!p['Bukti File ID'], archived: !!p['Diarsipkan Pada'] };
}

function getBillDetail(token, billId) {
  requireAdmin_(token);
  _finRequire_();
  const payments = _finRead_('Pembayaran');
  const b = _finRead_('Tagihan').filter(function(x) { return x['ID Tagihan'] === String(billId); })[0];
  if (!b) throw new Error('Tagihan tidak ditemukan.');
  return {
    bill: _finBillView_(b, payments, _finMembersById_()),
    payments: payments.filter(function(p) { return String(p['ID Tagihan']) === b['ID Tagihan']; }).map(_finPaymentView_)
      .sort(function(a, c) { return a.date < c.date ? -1 : 1; })
  };
}

function saveBillAdjust(token, billId, data) {
  requireAdmin_(token);
  _finRequire_();
  data = data || {};
  return _finLocked_(function() {
    const b = _finRead_('Tagihan').filter(function(x) { return x['ID Tagihan'] === String(billId); })[0];
    if (!b) throw new Error('Tagihan tidak ditemukan.');
    const upd = { 'Diubah Pada': _finNow_() };
    if (data.diskon !== undefined) {
      const d = _finInt_(data.diskon);
      if (!isFinite(d) || d < 0 || d > (data.total !== undefined ? _finInt_(data.total) : Number(b.Total))) throw new Error('Diskon tidak boleh melebihi total tagihan.');
      upd.Diskon = d;
    }
    if (data.catatan !== undefined) upd.Catatan = _finText_(data.catatan, 300, 'Catatan');
    if (data.total !== undefined) {
      const t = _finInt_(data.total);
      if (!isFinite(t) || t < 0 || t > FIN_MAX_AMOUNT) throw new Error('Total harus bilangan bulat, 0 atau lebih.');
      if (t !== Number(b.Total)) {
        const why = _finText_(data.alasan, 200, 'Alasan');
        if (!why) throw new Error('Isi alasan kalau mengubah total tagihan.');
        upd.Total = t;
        upd.Catatan = ((upd.Catatan !== undefined ? upd.Catatan : String(b.Catatan || '')) + ' [Total diubah: ' + why + ']').trim().slice(0, 300);
      }
    }
    _finUpdate_('Tagihan', b._row, upd);
    _finCacheStatus_(b['ID Tagihan']);
    return getBillDetail(token, billId);
  });
}

// ── Pembayaran ──────────────────────────────────────────────────────────────

function _finCheckMethod_(m) {
  const method = String(m == null ? '' : m).trim();
  if (!method) throw new Error('Pilih metode pembayaran.');
  if (_finMethods_().indexOf(method) === -1 && method !== 'Lainnya') throw new Error('Metode pembayaran tidak dikenal.');
  return method;
}

function _finCategory_(tipe, nama) {
  const name = String(nama == null ? '' : nama).trim();
  if (!name) throw new Error('Pilih kategori.');
  const cats = _finRead_('KategoriKeuangan');
  const hit = cats.filter(function(c) { return c.Tipe === tipe && c.Nama === name; })[0];
  if (!hit) throw new Error('Kategori tidak dikenal.');
  return name;
}

function savePayment(token, p) {
  requireAdmin_(token);
  _finRequire_();
  p = p || {};
  return _finLocked_(function() {
    _finEnsure_();
    const amount = _finAmount_(p.amount, 'Jumlah');
    const date = _finCheckDate_(p.date);
    const method = _finCheckMethod_(p.method);
    const note = _finText_(p.note, 300, 'Catatan');
    const payments = _finRead_('Pembayaran');
    const existing = p.id ? payments.filter(function(x) { return x['ID Bayar'] === String(p.id); })[0] : null;
    if (p.id && !existing) throw new Error('Pembayaran tidak ditemukan.');
    let bill = null, category;
    if (p.billId) {
      bill = _finRead_('Tagihan').filter(function(b) { return b['ID Tagihan'] === String(p.billId) && !b['Diarsipkan Pada']; })[0];
      if (!bill) throw new Error('Tagihan tidak ditemukan.');
      const rest = _finBillTotals_(bill, payments.filter(function(x) { return !existing || x['ID Bayar'] !== existing['ID Bayar']; })).remaining;
      if (amount > rest) throw new Error('Jumlah melebihi sisa tagihan Rp' + rest + '.');
      category = 'Paket';
    } else {
      category = _finCategory_('masuk', p.category);
    }
    const now = _finNow_();
    const fields = { 'ID Tagihan': bill ? bill['ID Tagihan'] : '', 'Member ID': bill ? String(bill['Member ID']) : '', Tanggal: date, Jumlah: amount, Metode: method, Kategori: category, Catatan: note, 'Diubah Pada': now };
    let id;
    if (existing) { id = existing['ID Bayar']; _finUpdate_('Pembayaran', existing._row, fields); }
    else { id = _finId_('BY'); _finAppend_('Pembayaran', Object.assign({ 'ID Bayar': id, 'Dibuat Pada': now }, fields)); }
    if (bill) _finCacheStatus_(bill['ID Tagihan']);
    return { id: id };
  });
}

// ── Pengeluaran dan kategori ────────────────────────────────────────────────

function _finExpenseView_(e) {
  return { id: e['ID Keluar'], date: e.Tanggal, category: e.Kategori || '', amount: Number(e.Jumlah) || 0, method: e.Metode || '', note: e.Catatan || '', coachId: String(e['Coach ID'] || ''), hasProof: !!e['Bukti File ID'], archived: !!e['Diarsipkan Pada'] };
}

function saveExpense(token, e) {
  requireAdmin_(token);
  _finRequire_();
  e = e || {};
  return _finLocked_(function() {
    _finEnsure_();
    const amount = _finAmount_(e.amount, 'Jumlah');
    const date = _finCheckDate_(e.date);
    const category = _finCategory_('keluar', e.category);
    const method = _finCheckMethod_(e.method);
    const note = _finText_(e.note, 300, 'Catatan');
    const existing = e.id ? _finRead_('Pengeluaran').filter(function(x) { return x['ID Keluar'] === String(e.id); })[0] : null;
    if (e.id && !existing) throw new Error('Pengeluaran tidak ditemukan.');
    const now = _finNow_();
    const fields = { Tanggal: date, Kategori: category, Jumlah: amount, Metode: method, Catatan: note, 'Coach ID': String(e.coachId || ''), 'Diubah Pada': now };
    if (existing) { _finUpdate_('Pengeluaran', existing._row, fields); return { id: existing['ID Keluar'] }; }
    const id = _finId_('PG');
    _finAppend_('Pengeluaran', Object.assign({ 'ID Keluar': id, 'Dibuat Pada': now }, fields));
    return { id: id };
  });
}

function getExpenses(token, filter) {
  requireAdmin_(token);
  _finRequire_();
  filter = filter || {};
  return _finRead_('Pengeluaran').map(_finExpenseView_).filter(function(v) {
    if (!!filter.archived !== v.archived) return false;
    if (filter.month && filter.year && v.date.slice(0, 7) !== filter.year + '-' + ('0' + filter.month).slice(-2)) return false;
    if (filter.category && v.category !== filter.category) return false;
    return true;
  }).sort(function(a, b) { return a.date < b.date ? 1 : -1; });
}

function getFinanceCategories(token) {
  requireAdmin_(token);
  _finRequire_();
  return _finRead_('KategoriKeuangan').map(function(c) { return { id: c.ID, type: c.Tipe, name: c.Nama, order: Number(c.Urutan) || 0, active: c.Aktif === true || String(c.Aktif).toLowerCase() === 'true' }; })
    .sort(function(a, b) { return a.order - b.order; });
}

function saveFinanceCategory(token, c) {
  requireAdmin_(token);
  _finRequire_();
  c = c || {};
  return _finLocked_(function() {
    _finEnsure_();
    const name = _finText_(c.name, 40, 'Nama kategori');
    if (!name) throw new Error('Nama kategori wajib diisi.');
    const cats = _finRead_('KategoriKeuangan');
    const existing = c.id ? cats.filter(function(x) { return x.ID === String(c.id); })[0] : null;
    if (c.id && !existing) throw new Error('Kategori tidak ditemukan.');
    const type = existing ? existing.Tipe : String(c.type || '');
    if (type !== 'masuk' && type !== 'keluar') throw new Error('Tipe kategori harus masuk atau keluar.');
    if (cats.some(function(x) { return x.Tipe === type && x.Nama.toLowerCase() === name.toLowerCase() && (!existing || x.ID !== existing.ID); })) throw new Error('Kategori itu sudah ada.');
    const fields = { Nama: name, Aktif: c.active === undefined ? (existing ? existing.Aktif : true) : !!c.active };
    if (c.order !== undefined) fields.Urutan = Math.max(0, Math.min(999, _finInt_(c.order) || 0));
    if (existing) {
      if (existing.Nama !== name) {   // ganti nama ikut ke data lama
        _finRead_('Pembayaran').filter(function(p) { return p.Kategori === existing.Nama; }).forEach(function(p) { _finUpdate_('Pembayaran', p._row, { Kategori: name }); });
        _finRead_('Pengeluaran').filter(function(p) { return p.Kategori === existing.Nama; }).forEach(function(p) { _finUpdate_('Pengeluaran', p._row, { Kategori: name }); });
      }
      _finUpdate_('KategoriKeuangan', existing._row, fields);
      return { id: existing.ID };
    }
    const id = _finId_('KAT');
    _finAppend_('KategoriKeuangan', Object.assign({ ID: id, Tipe: type, Urutan: cats.length + 1 }, fields));
    return { id: id };
  });
}

function deleteFinanceCategory(token, id) {
  requireAdmin_(token);
  _finRequire_();
  return _finLocked_(function() {
    const cat = _finRead_('KategoriKeuangan').filter(function(x) { return x.ID === String(id); })[0];
    if (!cat) throw new Error('Kategori tidak ditemukan.');
    const used = _finRead_(cat.Tipe === 'masuk' ? 'Pembayaran' : 'Pengeluaran').some(function(r) { return r.Kategori === cat.Nama; });
    if (used) throw new Error('Kategori sudah dipakai. Nonaktifkan saja, jangan dihapus.');
    _finSheet_('KategoriKeuangan', true).deleteRow(cat._row);
    return { ok: true };
  });
}

// ── Arsip (tidak ada yang dihapus permanen) ─────────────────────────────────

function _finArchive_(kind, id, on) {
  const table = { bill: ['Tagihan', 'ID Tagihan'], payment: ['Pembayaran', 'ID Bayar'], expense: ['Pengeluaran', 'ID Keluar'] }[kind];
  if (!table) throw new Error('Jenis data tidak dikenal.');
  return _finLocked_(function() {
    const row = _finRead_(table[0]).filter(function(x) { return x[table[1]] === String(id); })[0];
    if (!row) throw new Error('Data tidak ditemukan.');
    const mark = on ? { 'Diarsipkan Pada': _finNow_(), 'Diarsipkan Oleh': 'admin' } : { 'Diarsipkan Pada': '', 'Diarsipkan Oleh': '' };
    _finUpdate_(table[0], row._row, mark);
    if (kind === 'bill') {   // pembayaran ikut diarsipkan / dipulihkan
      _finRead_('Pembayaran').filter(function(p) { return p['ID Tagihan'] === String(id); }).forEach(function(p) {
        if (!on || !p['Diarsipkan Pada']) _finUpdate_('Pembayaran', p._row, mark);
      });
    }
    if (kind === 'payment' && row['ID Tagihan']) _finCacheStatus_(row['ID Tagihan']);
    if (kind === 'bill') _finCacheStatus_(String(id));
    return { ok: true };
  });
}

function archiveFinanceItem(token, kind, id) { requireAdmin_(token); _finRequire_(); return _finArchive_(kind, id, true); }
function restoreFinanceItem(token, kind, id) { requireAdmin_(token); _finRequire_(); return _finArchive_(kind, id, false); }

// ── Bagi hasil coach ────────────────────────────────────────────────────────

function saveCoachShare(token, coachId, tipe, nilai) {
  requireAdmin_(token);
  _finRequire_();
  return _finLocked_(function() {
    const ctx = _ensureCoachSchema_();
    const coach = _coachesAll_().filter(function(c) { return c.id === String(coachId); })[0];
    if (!coach) throw new Error('Coach tidak ditemukan.');
    if (tipe !== 'persen' && tipe !== 'sesi') throw new Error('Pilih bagi hasil persen atau per sesi.');
    const n = _finInt_(nilai);
    if (!isFinite(n) || n < 0 || n > (tipe === 'persen' ? 100 : 10000000)) {
      throw new Error(tipe === 'persen' ? 'Persen harus bilangan bulat 0–100.' : 'Nominal per sesi harus bilangan bulat 0–10.000.000.');
    }
    ctx.sheet.getRange(coach._row, ctx.idx.shareType + 1).setValue(tipe);
    ctx.sheet.getRange(coach._row, ctx.idx.shareValue + 1).setValue(n);
    return { ok: true };
  });
}

function _finShareOf_(coach) {
  const tipe = coach && coach.shareType === 'sesi' ? 'sesi' : 'persen';
  const raw = coach ? coach.shareValue : '';
  const val = (raw === '' || raw == null || !isFinite(Number(raw))) ? (tipe === 'persen' ? FIN_DEFAULT_SHARE_PERCENT : 0) : Number(raw);
  return { tipe: tipe, nilai: val };
}

// ── Ringkasan dan laporan ───────────────────────────────────────────────────

function _finMonthKey_(y, m) { return y + '-' + ('0' + m).slice(-2); }

function _financeSummary_(month, year) {
  const key = _finMonthKey_(year, month);
  const payments = _finRead_('Pembayaran').filter(function(p) { return !p['Diarsipkan Pada']; });
  const expenses = _finRead_('Pengeluaran').filter(function(e) { return !e['Diarsipkan Pada']; });
  const bills = _finRead_('Tagihan').filter(function(b) { return !b['Diarsipkan Pada']; });
  const sum = function(rows, k, mk) { return rows.reduce(function(s, r) { return r.Tanggal.slice(0, 7) === mk ? s + (Number(r[k]) || 0) : s; }, 0); };

  const series = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i, y = year;
    while (m < 1) { m += 12; y--; }
    const mk = _finMonthKey_(y, m);
    series.push({ month: m, year: y, masuk: sum(payments, 'Jumlah', mk), keluar: sum(expenses, 'Jumlah', mk) });
  }
  const masuk = sum(payments, 'Jumlah', key), keluar = sum(expenses, 'Jumlah', key);

  let tunggakan = 0, open = 0;
  const shares = {};
  const coaches = _coachesAll_(), byId = {};
  coaches.forEach(function(c) { byId[c.id] = c; });
  bills.forEach(function(b) {
    const t = _finBillTotals_(b, payments.concat([]).map(function(p) { return p; }));
    if (t.remaining > 0) { tunggakan += t.remaining; open++; }
    else if (t.net > 0 && t.lastPaid.slice(0, 7) === key) {   // persen dihitung di bulan lunas
      const cid = String(b['Coach ID'] || ''), c = byId[cid], s = _finShareOf_(c);
      if (s.tipe === 'persen') {
        shares[cid] = shares[cid] || { coachId: cid, name: c ? c.name : '', tipe: 'persen', nilai: s.nilai, amount: 0 };
        shares[cid].amount += Math.round(t.net * s.nilai / 100);
      }
    }
  });
  const sch = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedules');
  if (sch && sch.getLastRow() > 1) {
    sch.getDataRange().getValues().slice(1).forEach(function(r) {
      if (String(r[7]).toLowerCase() !== 'completed' || !r[10]) return;
      const d = new Date(r[10]);
      if (isNaN(d) || _finDate_(d).slice(0, 7) !== key) return;
      const cid = String(r[8] || ''), c = byId[cid], s = _finShareOf_(c);
      if (s.tipe !== 'sesi') return;
      shares[cid] = shares[cid] || { coachId: cid, name: c ? c.name : '', tipe: 'sesi', nilai: s.nilai, amount: 0, sesi: 0 };
      shares[cid].sesi = (shares[cid].sesi || 0) + 1;
      shares[cid].amount += s.nilai;
    });
  }
  const coachShare = Object.keys(shares).map(function(k) { return shares[k]; });
  return {
    month: month, year: year, masuk: masuk, keluar: keluar, laba: masuk - keluar, tunggakan: tunggakan, openBills: open,
    series: series, coachShare: coachShare,
    totalShare: coachShare.reduce(function(s, c) { return s + c.amount; }, 0)
  };
}

function getFinanceOverview(token, month, year) {
  requireAdmin_(token);
  _finRequire_();
  const m = _finInt_(month), y = _finInt_(year);
  if (!isFinite(m) || m < 1 || m > 12 || !isFinite(y) || y < 2000 || y > 2100) throw new Error('Bulan atau tahun tidak valid.');
  return _financeSummary_(m, y);
}

// ── Foto bukti (folder Drive privat, tanpa link sharing) ────────────────────

function _finProofFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('FIN_PROOF_FOLDER_ID');
  if (savedId) { try { return DriveApp.getFolderById(savedId); } catch (e) { /* hilang: buat baru */ } }
  const folder = DriveApp.createFolder('XNK Keuangan');
  props.setProperty('FIN_PROOF_FOLDER_ID', folder.getId());
  return folder;
}

function _finProofTarget_(kind, id) {
  const t = { payment: ['Pembayaran', 'ID Bayar'], expense: ['Pengeluaran', 'ID Keluar'] }[kind];
  if (!t) throw new Error('Jenis data tidak dikenal.');
  const row = _finRead_(t[0]).filter(function(x) { return x[t[1]] === String(id); })[0];
  if (!row) throw new Error('Data tidak ditemukan.');
  return { table: t[0], row: row };
}

function uploadFinanceProof(token, kind, id, base64Data, mimeType) {
  requireAdmin_(token);
  _finRequire_();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(String(mimeType)) === -1) throw new Error('Foto harus berupa JPG, PNG, atau WEBP.');
  if (typeof base64Data !== 'string' || !base64Data || base64Data.length > 7000000) throw new Error('Ukuran foto maksimal 5 MB.');
  return _finLocked_(function() {
    const t = _finProofTarget_(kind, id);
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    const file = _finProofFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, 'KEU_' + id + '.' + ext));   // tanpa setSharing: privat
    const old = String(t.row['Bukti File ID'] || '');
    _finUpdate_(t.table, t.row._row, { 'Bukti File ID': file.getId(), 'Diubah Pada': _finNow_() });
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* sudah hilang */ } }
    return { ok: true };
  });
}

function getFinanceProof(token, kind, id) {
  requireAdmin_(token);
  _finRequire_();
  const t = _finProofTarget_(kind, id);
  const fileId = String(t.row['Bukti File ID'] || '');
  if (!fileId) throw new Error('Belum ada foto bukti.');
  return { id: String(id), dataUrl: _photoDataUrl_(fileId) };
}

// ── Ekspor CSV ──────────────────────────────────────────────────────────────

function _finCsvCell_(v) {
  let s = String(v == null ? '' : v);
  // Cegah formula injection: teks yang diawali = + - @ (atau tab/CR) dibaca Excel/Sheets sebagai rumus.
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportFinanceCsv(token, kind, from, to) {
  requireAdmin_(token);
  _finRequire_();
  const f = _finCheckDate_(from), t = _finCheckDate_(to);
  if (f > t) throw new Error('Tanggal awal harus sebelum tanggal akhir.');
  let head, rows;
  const inRange = function(d) { return d >= f && d <= t; };
  if (kind === 'pembayaran') {
    head = ['Tanggal', 'Klien', 'Paket', 'Jumlah', 'Metode', 'Kategori', 'Catatan'];
    const bills = {};
    _finRead_('Tagihan').forEach(function(b) { bills[b['ID Tagihan']] = b; });
    rows = _finRead_('Pembayaran').filter(function(p) { return !p['Diarsipkan Pada'] && inRange(p.Tanggal); }).map(function(p) {
      const b = bills[p['ID Tagihan']];
      return [p.Tanggal, b ? b['Nama Klien'] : '', b ? b['Nama Paket'] : '', p.Jumlah, p.Metode, p.Kategori, p.Catatan];
    });
  } else if (kind === 'pengeluaran') {
    head = ['Tanggal', 'Kategori', 'Jumlah', 'Metode', 'Catatan'];
    rows = _finRead_('Pengeluaran').filter(function(e) { return !e['Diarsipkan Pada'] && inRange(e.Tanggal); })
      .map(function(e) { return [e.Tanggal, e.Kategori, e.Jumlah, e.Metode, e.Catatan]; });
  } else if (kind === 'tagihan') {
    head = ['Tanggal', 'Klien', 'Paket', 'Total', 'Diskon', 'Dibayar', 'Sisa', 'Status'];
    const pays = _finRead_('Pembayaran'), mem = _finMembersById_();
    rows = _finRead_('Tagihan').filter(function(b) { return !b['Diarsipkan Pada'] && inRange(b.Tanggal); }).map(function(b) {
      const v = _finBillView_(b, pays, mem);
      return [v.date, v.name, v.packageName, v.total, v.discount, v.paid, v.remaining, v.status];
    });
  } else throw new Error('Pilih jenis ekspor: pembayaran, pengeluaran, atau tagihan.');
  rows.sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });
  const csv = '﻿' + [head].concat(rows).map(function(r) { return r.map(_finCsvCell_).join(';'); }).join('\r\n') + '\r\n';
  return { filename: 'keuangan-' + kind + '-' + f + '-' + t + '.csv', csv: csv, count: rows.length };
}

// ── Portal klien (hanya bila diizinkan owner) ───────────────────────────────

function getMyBills(memberToken) {
  const memberId = String(requireMember_(memberToken).row[0]).trim();
  if (!_finOn_() || PropertiesService.getScriptProperties().getProperty('FIN_PORTAL_VISIBLE') !== 'true') return [];
  const payments = _finRead_('Pembayaran');
  return _finRead_('Tagihan').filter(function(b) { return String(b['Member ID']).trim() === memberId && !b['Diarsipkan Pada']; })
    .map(function(b) {
      const t = _finBillTotals_(b, payments);
      return { paket: b['Nama Paket'] || '', tanggal: b.Tanggal, total: t.net, paid: t.paid, remaining: t.remaining, status: t.status, lastPaid: t.lastPaid };
    }).sort(function(a, b) { return a.tanggal < b.tanggal ? 1 : -1; });
}
