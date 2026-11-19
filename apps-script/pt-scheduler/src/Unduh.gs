// "Unduh data saya" (T-2255, docs/library/TODO.md). Coach mengunduh semua datanya sebagai satu berkas Excel dari
// Pengaturan → Akun, jadi spreadsheet tidak perlu dibuka. Server hanya membaca sheet per halaman (pola hubExport di
// HubStatus.gs: getDisplayValues, tanpa objek Date); berkas .xlsx dirakit di browser.
// Tidak pernah ikut: Script Properties (PIN, token, rahasia), ProgressPhotos (foto progres pribadi; berkasnya di Drive
// coach) dan PushSubs / PushOutbox (kunci perangkat dan antrean push). Hanya membaca: tidak ada cache yang perlu
// dinaikkan versinya.
var UNDUH_ROWS = 2000;          // baris per panggilan
var UNDUH_BYTES = 3000000;      // perkiraan ukuran JSON per panggilan
var UNDUH_SKIP = ['ProgressPhotos', 'PushSubs', 'PushOutbox'];

/** true bila sheet ini boleh ikut unduhan. */
function _unduhOk_(name) {
  return UNDUH_SKIP.indexOf(String(name)) === -1;
}

/**
 * Unduh data coach per halaman (admin).
 * Tanpa req: daftar sheet {name, rows, cols}. Dengan {sheet, from}: baris mulai `from` (1 = baris judul), maks
 * UNDUH_ROWS baris dan ±UNDUH_BYTES; next = baris berikutnya, 0 bila selesai. Nilai = teks tampilan sel.
 * @param {string} token token admin
 * @param {?{sheet: string, from: number}} req
 */
function exportMyData(token, req) {
  requireAdmin_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!req || req.sheet == null || req.sheet === '') {
    return {
      at: new Date().toISOString(),
      sheets: ss.getSheets().filter(function(s) { return _unduhOk_(s.getName()); })
        .map(function(s) { return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() }; }),
    };
  }
  var from = req.from == null ? 1 : Number(req.from);
  if (typeof req.sheet !== 'string' || !isFinite(from) || from < 1 || Math.floor(from) !== from) throw new Error('Permintaan tidak valid.');
  if (!_unduhOk_(req.sheet)) throw new Error('Sheet tidak ditemukan.');
  var sh = ss.getSheetByName(req.sheet);
  if (!sh) throw new Error('Sheet tidak ditemukan.');
  var last = sh.getLastRow(), cols = sh.getLastColumn();
  if (from > last || cols < 1) return { rows: [], cols: cols, next: 0 };
  var n = Math.min(UNDUH_ROWS, last - from + 1);
  var vals = sh.getRange(from, 1, n, cols).getDisplayValues();
  var out = [], size = 0;
  for (var i = 0; i < vals.length; i++) {
    var len = JSON.stringify(vals[i]).length + 1;
    if (out.length && size + len > UNDUH_BYTES) break;
    out.push(vals[i]);
    size += len;
  }
  var next = from + out.length;
  return { rows: out, cols: cols, next: next > last ? 0 : next };
}
