// XNK Library — konteks per spreadsheet. Hanya ada di build Library (apps-script/xnk-library/tools/build-lib.js);
// produksi (apps-script/pt-scheduler/src) tidak memakai berkas ini.
//
// Kenapa: di Library Apps Script, Script Properties, Cache dan Lock milik Library adalah SATU instance yang
// dipakai bersama semua spreadsheet yang memasang Library itu. Kalau kode memakainya, PIN, kunci sesi, token
// Telegram dan cache data klien coach A ikut terbaca coach B. Jadi Library tidak pernah memakai miliknya sendiri:
// setiap panggilan membawa layanan milik spreadsheet pemanggil (ctx), dipasang oleh kode penghubung lewat
// XNK.run / XNK.handleGet / XNK.handlePost. Tanpa konteks, panggilan ditolak.
//
// build-lib.js mengganti di salinan kode produksi:
//   PropertiesService.getScriptProperties() -> _props_()     CacheService.getScriptCache() -> _cache_()
//   LockService.getScriptLock()             -> _lock_()      SpreadsheetApp.getActiveSpreadsheet() -> _ss_()
//   ScriptApp.                              -> _scriptApp_().

var XNK_IS_LIBRARY = true;
var _XCTX_ = null;
var _XCTX_DEPTH_ = 0;

/** Memo per eksekusi di kode produksi; dikosongkan setiap kali konteks dipasang supaya tidak terbawa ke spreadsheet lain. */
function _resetLibMemos_() {
  _memberMemo_ = null;
  _schedMemo_ = null;
  _readMemo_ = null;
  _progMemo_ = null;
  _exAliasMemo_ = null;
  _lockDepth_ = 0;
}

function _ctxCheck_(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Konteks spreadsheet belum diatur. Panggil lewat kode penghubung XNK.');
  var need = { props: ['getProperty', 'setProperty', 'deleteProperty'], cache: ['get', 'put', 'remove'],
    lock: ['tryLock', 'waitLock', 'releaseLock'], ss: ['getId', 'getSheetByName'], scriptApp: ['getProjectTriggers', 'newTrigger'] };
  Object.keys(need).forEach(function (k) {
    var o = ctx[k];
    if (!o) throw new Error('Konteks spreadsheet tidak lengkap: ' + k + ' tidak ada.');
    need[k].forEach(function (m) {
      if (typeof o[m] !== 'function') throw new Error('Konteks spreadsheet tidak lengkap: ' + k + '.' + m + ' tidak ada.');
    });
  });
  return ctx;
}

function _ctx_() {
  if (!_XCTX_) throw new Error('Konteks spreadsheet belum diatur. Panggil lewat kode penghubung XNK.');
  return _XCTX_;
}
function _props_() { return _ctx_().props; }
function _cache_() { return _ctx_().cache; }
function _lock_() { return _ctx_().lock; }
function _ss_() { return _ctx_().ss; }
function _scriptApp_() { return _ctx_().scriptApp; }

/** Jalankan fn dengan konteks ctx. Bersarang boleh (konteks yang sama); konteks lain di tengah jalan ditolak. */
function _withCtx_(ctx, fn) {
  _ctxCheck_(ctx);
  if (_XCTX_ && _XCTX_ !== ctx) throw new Error('Konteks spreadsheet lain sedang berjalan.');
  var outer = _XCTX_DEPTH_ === 0;
  if (outer) { _XCTX_ = ctx; _resetLibMemos_(); }
  _XCTX_DEPTH_++;
  try {
    return fn();
  } finally {
    _XCTX_DEPTH_--;
    if (_XCTX_DEPTH_ === 0) { _resetLibMemos_(); _XCTX_ = null; }
  }
}

// ── Identitas usaha per spreadsheet (Script Properties milik spreadsheet itu) ───────────────────────────────

/** Nama usaha (BRAND_NAME), dipakai judul halaman dan teks notifikasi. */
function _brandName_() {
  return String(_props_().getProperty('BRAND_NAME') || '').trim() || 'Personal Training';
}

/**
 * Alamat PORTAL KLIEN untuk link di pesan WhatsApp dan kode QR kartu: situs coach (SITE_URL) + '/klien/'
 * (akar situs adalah panel coach dengan PIN), atau halaman /exec spreadsheet ini dengan ?view=public.
 */
function _siteUrl_() {
  var u = String(_props_().getProperty('SITE_URL') || '').trim();
  if (u) return u.replace(/\/+$/, '') + '/klien/';
  try { return _scriptApp_().getService().getUrl() + '?view=public'; } catch (e) { return ''; }
}

/** Ikon tab halaman Apps Script: FAVICON_URL, kosong = ikon bawaan Google. */
function _faviconUrl_() {
  return String(_props_().getProperty('FAVICON_URL') || '').trim();
}
