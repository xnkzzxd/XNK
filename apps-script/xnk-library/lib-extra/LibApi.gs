// XNK Library — API publik untuk kode penghubung di setiap spreadsheet (dipanggil sebagai XNK.<nama>).
// Hanya ada di build Library. Setiap fungsi yang menyentuh data menerima ctx: layanan milik spreadsheet
// pemanggil, dibuat oleh kode penghubung:
//   { props: PropertiesService.getScriptProperties(), cache: CacheService.getScriptCache(),
//     lock: LockService.getScriptLock(), ss: SpreadsheetApp.getActiveSpreadsheet(), scriptApp: ScriptApp }
// Library tidak pernah memakai Properties/Cache/Lock miliknya sendiri (lihat Konteks.gs).

/** Sheet dasar yang dibuat saat inisialisasi; sheet lain dibuat otomatis saat fiturnya pertama dipakai. */
var LIB_BASE_SHEETS = ['Coaches', 'MemberData', 'Members', 'Schedules', 'PriceList'];
/** Trigger yang dipasang setup. runReminderTick tidak mengirim apa pun sampai pengingat dinyalakan di Pengaturan. */
var LIB_TRIGGERS = ['runReminderTick'];
// Situs coach (GitHub Pages, dibangun dari kode XNK terbaru) menerbitkan lib-latest.json berisi sidik Library terbaru.
var LIB_LATEST_FILE = 'lib-latest.json';

/**
 * Jalankan satu fungsi server untuk spreadsheet pemanggil.
 * Hanya nama di daftar resmi (tests/api-lists.js: publik, admin, member, pemilik, trigger) yang boleh.
 * Fungsi admin/member tetap memeriksa token sendiri; fungsi pemilik tetap memanggil requireOwner_.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {string} name nama fungsi, mis. 'getPortalBootstrap'
 * @param {Array} args argumen fungsi
 * @return {*} jawaban fungsi itu
 */
function run(ctx, name, args) {
  var table = _libTable_();
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(table, name)) {
    throw new Error('Fungsi tidak dikenal: ' + name);
  }
  return _withCtx_(ctx, function () { return table[name].apply(null, args || []); });
}

/**
 * Halaman Apps Script (doGet) untuk spreadsheet pemanggil.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {Object} e event doGet
 * @return {HtmlOutput|TextOutput}
 */
function handleGet(ctx, e) {
  return _withCtx_(ctx, function () { return doGet(e); });
}

/**
 * Pintu JSON (doPost) untuk halaman statis di GitHub Pages milik spreadsheet pemanggil.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {Object} e event doPost
 * @return {TextOutput}
 */
function handlePost(ctx, e) {
  return _withCtx_(ctx, function () { return doPost(e); });
}

/**
 * Versi Library yang sedang dipakai (tanpa konteks).
 * @return {{hash: string, commit: string, builtAt: string, api: number}}
 */
function getLibraryVersion() {
  return { hash: LIB_BUILD.hash, commit: LIB_BUILD.commit, builtAt: LIB_BUILD.builtAt, api: API_VERSION };
}

/**
 * Cek kesehatan spreadsheet pemanggil: Library tersambung, sheet dasar, PIN, trigger, versi terbaru.
 * Tidak mengubah apa pun. Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {Object=} opts {checkUpdate: true} membandingkan dengan versi terbaru (SITE_URL/lib-latest.json)
 * @return {Object} {ok, version, sheets, setup, triggers, update, problems[]}
 */
function healthCheck(ctx, opts) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    opts = opts || {};
    var props = _props_(), ss = _ss_(), problems = [];
    var sheets = {};
    LIB_BASE_SHEETS.forEach(function (n) { sheets[n] = !!ss.getSheetByName(n); if (!sheets[n]) problems.push('Sheet ' + n + ' belum ada. Jalankan Mulai setup.'); });
    var instance = props.getProperty('XNK_INSTANCE_SS_ID');
    var setup = {
      initialized: instance === ss.getId(),
      copiedNotInitialized: !!instance && instance !== ss.getId(),
      brand: props.getProperty('BRAND_NAME') || '',
      pin: !!props.getProperty('ADMIN_PIN'),
      siteUrl: props.getProperty('SITE_URL') || '',
      notifEmail: props.getProperty('NOTIF_EMAIL') || '',
      execUrl: _execUrl_(),
    };
    if (!setup.initialized) problems.push(setup.copiedNotInitialized ? 'Ini salinan baru: jalankan Mulai setup.' : 'Belum diinisialisasi: jalankan Mulai setup.');
    if (!setup.pin) problems.push('PIN admin belum diisi.');
    var handlers = _scriptApp_().getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    var triggers = {};
    LIB_TRIGGERS.forEach(function (n) {
      var c = handlers.filter(function (h) { return h === n; }).length;
      triggers[n] = c;
      if (c === 0) problems.push('Trigger ' + n + ' belum terpasang.');
      if (c > 1) problems.push('Trigger ' + n + ' terpasang ' + c + ' kali.');
    });
    var update = null;
    if (opts.checkUpdate) update = _libUpdateInfo_();
    if (update && update.newer) problems.push('Ada versi Library baru. Lihat panduan "Perbarui Library".');
    return { ok: problems.length === 0, version: getLibraryVersion(), sheets: sheets, setup: setup, triggers: triggers, update: update, problems: problems };
  });
}

/**
 * Inisialisasi spreadsheet pemanggil. Aman dijalankan berulang kali (idempoten), di bawah lock spreadsheet itu.
 * - Salinan baru (ID spreadsheet berbeda dari yang tercatat): SEMUA Script Properties salinan asal dihapus
 *   (PIN, kunci sesi, Telegram, push, folder Drive, pengaturan), supaya tidak ada yang terbawa.
 * - Membuat sheet dasar yang belum ada (dengan header), kunci sesi, dan mencatat ID spreadsheet ini.
 * Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @return {{copied: boolean, wiped: number, created: string[], spreadsheetId: string}}
 */
function initInstance(ctx) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    return _locked_(function () {
      var props = _props_(), ss = _ss_(), id = ss.getId();
      var stored = props.getProperty('XNK_INSTANCE_SS_ID');
      var copied = !!stored && stored !== id, wiped = 0;
      if (copied) {
        var all = props.getProperties ? props.getProperties() : {};
        Object.keys(all).forEach(function (k) { props.deleteProperty(k); wiped++; });
      }
      var created = LIB_BASE_SHEETS.filter(function (n) { return !ss.getSheetByName(n); });
      _ensureCoachSchema_();
      _getMemberDataSheet_();
      _getMembersLogSheet_();
      _readSchedulesAll_();
      _priceListSheetAndColumns_();
      _sessionSecret_();
      props.setProperty('XNK_INSTANCE_SS_ID', id);
      _bustShared_();
      _bustSlots_();
      return { copied: copied, wiped: wiped, created: created, spreadsheetId: id };
    });
  });
}

/**
 * Simpan isian wizard setup: nama usaha, PIN admin, alamat situs (opsional). Validasi dulu, baru tulis.
 * Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {{brand: string, pin: string, siteUrl: string, notifEmail?: string}} data pin kosong = PIN lama tetap; notifEmail tidak dikirim = tetap
 * @return {{brand: string, pin: boolean, siteUrl: string}}
 */
function saveSetup(ctx, data) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    data = data || {};
    var brand = String(data.brand || '').trim();
    var pin = String(data.pin == null ? '' : data.pin).trim();
    // Alamat utama situs coach; '/klien' di ujung dibuang (portal klien = alamat utama + /klien/).
    var site = String(data.siteUrl || '').trim().replace(/\/+$/, '').replace(/\/klien$/i, '');
    var props = _props_();
    if (!brand) throw new Error('Nama usaha wajib diisi.');
    if (brand.length > 60) throw new Error('Nama usaha maksimal 60 huruf.');
    if (!pin && !props.getProperty('ADMIN_PIN')) throw new Error('PIN admin wajib diisi.');
    if (pin && (pin.length < 6 || pin.length > 32)) throw new Error('PIN minimal 6 dan maksimal 32 karakter.');
    if (pin && /\s/.test(pin)) throw new Error('PIN tidak boleh berisi spasi.');
    if (site && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(site)) throw new Error('Alamat situs harus diawali https:// dan tanpa spasi.');
    // T-2254: email coach opsional (tidak dikirim = tetap); ringkasan pengingat ke email 'auto' bila belum pernah diatur.
    var hasMail = Object.prototype.hasOwnProperty.call(data, 'notifEmail') && data.notifEmail != null;
    var mail = hasMail ? String(data.notifEmail).trim() : '';
    if (mail && (mail.length > 200 || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(mail))) throw new Error('Alamat email tidak valid.');
    return _locked_(function () {
      props.setProperty('BRAND_NAME', brand);
      if (pin) props.setProperty('ADMIN_PIN', pin);
      if (site) props.setProperty('SITE_URL', site); else props.deleteProperty('SITE_URL');
      if (hasMail) { if (mail) props.setProperty('NOTIF_EMAIL', mail); else props.deleteProperty('NOTIF_EMAIL'); }
      if (!props.getProperty('NOTIF_EMAIL_REMINDERS')) props.setProperty('NOTIF_EMAIL_REMINDERS', 'auto');
      _bustShared_();
      return { brand: brand, pin: !!props.getProperty('ADMIN_PIN'), siteUrl: site };
    });
  });
}

/**
 * Daftarkan spreadsheet pemanggil ke XNK Pusat (T-2233): rahasia acak baru dikirim bersama nama di alamat dan link
 * /exec, dengan kode daftar dari pemilik XNK. HUB_SECRET disimpan hanya bila XNK Pusat menerima, jadi kode yang
 * salah tidak memutus pendaftaran lama. Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @param {{pusatUrl: string, code: string, slug: string, exec?: string}} data
 * @return {{registered: boolean}}
 */
function registerPusat(ctx, data) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    data = data || {};
    var url = String(data.pusatUrl || '');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(url)) throw new Error('Alamat XNK Pusat belum diatur di kode penghubung ini.');
    // Link yang ditempel pemilik (Deploy → Kelola deployment) menang: getService().getUrl() dari editor bisa memberi
    // link uji (HEAD) yang minta login Google.
    var pasted = String(data.exec || '').trim();
    if (pasted && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(pasted)) throw new Error('Link aplikasi harus berbentuk https://script.google.com/macros/s/…/exec.');
    var exec = pasted || _execUrl_();
    if (!exec) throw new Error('Terbitkan aplikasi web dulu (langkah 3).');
    var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    var j = null;
    try { j = JSON.parse(_postApps_(url, { fn: 'pusatRegister', args: [String(data.code || ''), String(data.slug || ''), exec, secret] })); } catch (e) { j = null; }
    if (!j) throw new Error('XNK Pusat tidak menjawab. Coba lagi sebentar lagi.');
    if (!j.ok) throw new Error(j.error || 'Pendaftaran ditolak XNK Pusat.');
    _props_().setProperty('HUB_SECRET', secret);
    return { registered: true };
  });
}

/**
 * Pasang trigger spreadsheet pemanggil (tanpa duplikat). Fungsi trigger harus ada di kode penghubung.
 * Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @return {{installed: string[], removedDuplicates: number}}
 */
function installTriggers(ctx) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    var removed = _installReminderTrigger_();
    return { installed: LIB_TRIGGERS.slice(), removedDuplicates: removed };
  });
}

/**
 * Lepas semua trigger milik XNK di spreadsheet pemanggil.
 * Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @return {{removed: number}}
 */
function removeTriggers(ctx) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    var names = ['runReminderTick', 'runWarmTick', 'sendDailyReminderEmail', 'sendWeeklyReportEmail'], removed = 0;
    _scriptApp_().getProjectTriggers().forEach(function (t) {
      if (names.indexOf(t.getHandlerFunction()) !== -1) { _scriptApp_().deleteTrigger(t); removed++; }
    });
    return { removed: removed };
  });
}

/**
 * Langkah wizard setup yang sudah/belum selesai (untuk sidebar). Hanya pemilik spreadsheet.
 * @param {Object} ctx layanan milik spreadsheet pemanggil
 * @return {Object}
 */
function setupState(ctx) {
  return _withCtx_(ctx, function () {
    requireOwner_();
    var props = _props_(), ss = _ss_();
    var handlers = _scriptApp_().getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    return {
      spreadsheetName: ss.getName ? ss.getName() : '',
      initialized: props.getProperty('XNK_INSTANCE_SS_ID') === ss.getId(),
      brand: props.getProperty('BRAND_NAME') || '',
      pin: !!props.getProperty('ADMIN_PIN'),
      siteUrl: props.getProperty('SITE_URL') || '',
      notifEmail: props.getProperty('NOTIF_EMAIL') || '',
      execUrl: _execUrl_(),
      triggers: LIB_TRIGGERS.every(function (n) { return handlers.indexOf(n) !== -1; }),
      version: getLibraryVersion(),
    };
  });
}

// ── pembantu ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * POST JSON ke /exec Apps Script lain (XNK Pusat) lalu ambil jawabannya. Apps Script menjawab POST dengan 302 ke
 * script.googleusercontent.com/macros/echo; UrlFetchApp mengikuti 302 tetap sebagai POST dan mendapat halaman HTML
 * Google. Jadi: POST tanpa mengikuti, lalu GET ke alamat Location.
 */
function _postApps_(url, body) {
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: false });
  var code = res.getResponseCode();
  if (code >= 300 && code < 400) {
    var h = (res.getHeaders && res.getHeaders()) || {};
    var loc = h.Location || h.location;
    if (!loc) throw new Error('XNK Pusat tidak menjawab.');
    res = UrlFetchApp.fetch(loc, { muteHttpExceptions: true, followRedirects: true });
  }
  return res.getContentText();
}

/** Link /exec deployment web app spreadsheet ini; kosong bila belum di-deploy. */
function _execUrl_() {
  try { return String(_scriptApp_().getService().getUrl() || ''); } catch (e) { return ''; }
}

/** Bandingkan versi Library ini dengan versi terbaru: SITE_URL/lib-latest.json (situs coach dibangun dari kode XNK terbaru). */
function _libUpdateInfo_() {
  var site = String(_props_().getProperty('SITE_URL') || '').trim().replace(/\/+$/, '');
  if (!site) return { checked: false, reason: 'Alamat situs belum diisi.' };
  try {
    var res = UrlFetchApp.fetch(site + '/' + LIB_LATEST_FILE, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { checked: false };
    var m = JSON.parse(res.getContentText());
    var latest = m && m.library && m.library.hash;
    return { checked: true, latest: latest || '', current: LIB_BUILD.hash, newer: !!latest && latest !== LIB_BUILD.hash };
  } catch (e) {
    return { checked: false };
  }
}
