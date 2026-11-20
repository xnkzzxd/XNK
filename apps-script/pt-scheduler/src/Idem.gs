// =============================================================================
// Nomor pesanan (idempotensi) untuk pintu doPost — 2026-11-20
// Browser memberi setiap simpanan satu `cid` dan mengirim ulang dengan cid yang sama bila jawaban
// tidak datang (sinyal putus, batas waktu 60 detik, tab tertidur). Server bisa saja sudah menyimpan,
// jadi kiriman ulang dengan cid yang sama TIDAK menjalankan fungsinya lagi: jawaban pertama diputar
// ulang ({ok, data, dup:true}).
//   - Kunci: idem:<cid>:<sidik token>, jadi cid orang lain tidak bisa memutar ulang jawaban akun lain.
//   - '~' = sedang berjalan (360 dtk, sama dengan batas eksekusi 6 menit): kiriman kedua dijawab
//     code 'inflight' (browser mencoba lagi nanti).
//   - Hanya fungsi tulis (_apiWrites_); bacaan tidak pernah disimpan. Galat tidak disimpan, jadi
//     "Coba lagi" setelah diperbaiki benar-benar dijalankan ulang.
//   - CacheService bisa membuang isi lebih awal, jadi pembuat baris baru (IDEM_DURABLE) juga dicatat
//     di sheet `Idem` dan dicari di sana hanya untuk kiriman ulang (re = 1).
// =============================================================================

var IDEM_TTL = 21600;          // 6 jam, batas CacheService
var IDEM_RUN_TTL = 360;        // penanda "sedang berjalan"
var IDEM_MAX_CACHE = 90000;    // jawaban lebih besar: hanya tanda "sudah"
var IDEM_MAX_SHEET = 45000;
var IDEM_SHEET = 'Idem';
var IDEM_KEEP_DAYS = 14;
var IDEM_PRUNE_ROWS = 400;     // sheet dirapikan sesekali setelah sebanyak ini baris
var IDEM_DURABLE = { addSchedule: 1, addRecurringSchedule: 1, addTask: 1, addMember: 1, savePayment: 1, saveExpense: 1,
  saveContent: 1, addCoachTimeOff: 1, submitMyHealthForm: 1, submitMyPackageEval: 1, saveMyRoutine: 1, savePackage: 1, saveCoach: 1,
  // Gelombang 2 (panel coach): kiriman ulang setelah cache hilang tidak boleh menjawab "sudah diputuskan" / "sudah ada"
  // (dianggap ditolak dan layar dibatalkan) atau menulis assessment kedua.
  decideRenewal: 1, decideNutritionAdvice: 1, saveAssessment: 1, saveFinanceCategory: 1 };

function _idemCidOk_(cid) { return typeof cid === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(cid); }

function _idemKey_(cid, args) {
  var tok = args && typeof args[0] === 'string' ? args[0] : '';
  return 'idem:' + cid + ':' + _sha256Hex_('idem|' + tok).slice(0, 16);
}

/**
 * Sebelum fungsi dijalankan. null = tanpa nomor (jalan biasa); {hit:true, data} = sudah pernah,
 * putar ulang; {key, fn} = jalankan lalu _idemDone_. Melempar code 'inflight' bila kiriman yang sama
 * masih berjalan.
 */
function _idemBegin_(fn, req, args) {
  if (!req || !_idemCidOk_(req.cid) || !Object.prototype.hasOwnProperty.call(_apiWrites_(), fn)) return null;
  var key = _idemKey_(req.cid, args);
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(2000); } catch (e) { locked = false; }
  try {
    var got = cache.get(key);
    if (got === '~') {
      var busy = new Error('Perubahan ini masih disimpan. Coba lagi sebentar.');
      busy.code = 'inflight';
      throw busy;
    }
    if (got != null) return { hit: true, data: _idemParse_(got) };
    if (req.re && IDEM_DURABLE[fn]) {
      var old = _idemSheetFind_(key);
      if (old != null) return { hit: true, data: _idemParse_(old) };
    }
    cache.put(key, '~', IDEM_RUN_TTL);
  } finally { if (locked) lock.releaseLock(); }
  return { key: key, fn: fn };
}

function _idemParse_(s) {
  try { var v = JSON.parse(s); return v && v.__dup === 1 ? null : v; } catch (e) { return null; }
}

/** Sesudah fungsi berhasil: simpan jawabannya (sudah berupa JSON biasa). */
function _idemDone_(idem, out) {
  if (!idem || !idem.key) return;
  var s;
  try { s = JSON.stringify(out === undefined ? null : out); } catch (e) { s = '{"__dup":1}'; }
  try { CacheService.getScriptCache().put(idem.key, s.length < IDEM_MAX_CACHE ? s : '{"__dup":1}', IDEM_TTL); } catch (e) { Logger.log('idem cache: ' + e); }
  if (IDEM_DURABLE[idem.fn]) {
    try { _idemSheetAdd_(idem.key, idem.fn, s.length < IDEM_MAX_SHEET ? s : '{"__dup":1}'); } catch (e) { Logger.log('idem sheet: ' + e); }
  }
}

/** Fungsi melempar galat: lepas penanda supaya kiriman ulang dijalankan lagi. */
function _idemFail_(idem) {
  if (!idem || !idem.key) return;
  try { CacheService.getScriptCache().remove(idem.key); } catch (e) {}
}

function _idemSheet_() { return getOrCreateSheet_(IDEM_SHEET, ['Key', 'Fn', 'At', 'Hasil']); }

function _idemSheetFind_(key) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IDEM_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === key) return String(rows[i][3] || 'null');
  return null;
}

function _idemSheetAdd_(key, fn, s) {
  var sh = _idemSheet_();
  _appendRow_(sh, [key, fn, new Date().toISOString(), s]);
  if (sh.getLastRow() > IDEM_PRUNE_ROWS) _idemPrune_(sh);
}

/** Buang baris lebih tua dari IDEM_KEEP_DAYS (baris urut waktu, jadi cukup dari atas). */
function _idemPrune_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var at = sh.getRange(2, 3, last - 1, 1).getValues();
  var cut = Date.now() - IDEM_KEEP_DAYS * 86400000, n = 0;
  while (n < at.length && Date.parse(String(at[n][0])) < cut) n++;
  if (n > 0) sh.deleteRows(2, n);
  return n;
}
